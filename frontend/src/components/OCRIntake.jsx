import {useEffect,useState} from "react";
import {createWorker} from "tesseract.js";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import api from "../api";

pdfjsLib.GlobalWorkerOptions.workerSrc=pdfWorkerUrl;

const EMPTY={invoice_id:"",vendor:"",invoice_no:"",date:"",amount:"",category:"",employee:"",po_number:"",currency:"USD",bank_account:"",iban:"",tamper_suspect:false};

function parseAmount(value){
  const cleaned=String(value||"").replace(/(?:INR|Rs\.?|₹|[$€£])/gi,"").replace(/,/g,"");
  const match=cleaned.match(/\(?-?\d+(?:\.\d{1,2})?\)?/);
  if(!match)return "";
  const raw=match[0];
  return raw.startsWith("(")&&raw.endsWith(")")?"-"+raw.slice(1,-1):raw;
}

export function parseInvoiceText(text){
  const lines=text.split(/\r?\n/).map(line=>line.replace(/\s+/g," ").trim()).filter(Boolean);
  const all=lines.join("\n");
  const invoiceMatch=all.match(/(?:invoice|inv|bill)\s*(?:number|no\.?|#|id)\s*[:#-]?\s*([A-Z0-9][A-Z0-9/_-]{2,})/i);
  const poMatch=all.match(/(?:purchase\s*order|p\.?o\.?\s*(?:no\.?|#)?|order\s*#?)\s*[:#-]?\s*([A-Z0-9-]{4,})/i);
  const dateMatch=all.match(/(?:invoice\s*)?date\s*[:#-]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2})/i);
  const categoryMatch=all.match(/(?:expense\s+)?category\s*[:#-]?\s*([A-Za-z][A-Za-z &/-]{1,40})/i);
  const bankMatch=all.match(/(?:bank\s*account|acct\s*#?|account\s*no\.?)\s*[:#-]?\s*(\d{6,16})/i);
  const ibanMatch=all.match(/\b([A-Z]{2}\d{2}[A-Z0-9]{10,28})\b/i);

  let currency="USD";
  if(/€|\beur\b/i.test(all)) currency="EUR";
  else if(/£|\bgbp\b/i.test(all)) currency="GBP";
  else if(/₹|\brs\.?|\binr\b/i.test(all)) currency="INR";
  else if(/¥|\bjpy\b/i.test(all)) currency="JPY";
  else if(/\bcad\b/i.test(all)) currency="CAD";
  else if(/\baud\b/i.test(all)) currency="AUD";

  const amountLines=lines.filter(line=>/(?:grand\s+total|invoice\s+total|total\s+due|amount\s+due|balance\s+due|total)/i.test(line));
  let amount="";
  for(const line of amountLines.reverse()){
    const match=line.match(/(?:grand\s+total|invoice\s+total|total\s+due|amount\s+due|balance\s+due|total)\b[^0-9(]*((?:\()?-?\s*(?:₹|rs\.?|inr|[$€£])?\s*[\d,]+(?:\.\d{1,2})?(?:\))?)/i);
    if(match){amount=parseAmount(match[1]);if(amount)break}
  }
  const vendor=lines.find(line=>{
    if(line.length<2||line.length>90||!/[a-z]/i.test(line)||/^\d/.test(line))return false;
    if(/^(?:tax\s+)?invoice(?:\s+copy)?$/i.test(line))return false;
    return !/(invoice\s*(?:number|no|#|date)|date\s*:|due\s*date|bill\s*to|ship\s*to|gstin|vat\s*(?:no|number)|tax\s*id|phone|email|www\.|https?:)/i.test(line);
  })||"";
  return {
    fields:{
      ...EMPTY,
      invoice_id:"OCR-"+Date.now().toString().slice(-7),
      vendor,
      invoice_no:invoiceMatch?.[1]||"",
      po_number:poMatch?.[1]||"",
      date:dateMatch?.[1]||"",
      amount,
      currency,
      bank_account:bankMatch?.[1]||"",
      iban:ibanMatch?.[1]||"",
      category:categoryMatch?.[1]?.trim()||""
    },
    raw:all
  };
}

export async function documentText(file,setProgress){
  const workerNeeded=async()=>{
    setProgress({label:"Loading private, in-browser OCR…",percent:0});
    return createWorker("eng",1,{logger:message=>{
      setProgress({label:message.status||"Reading document…",percent:Math.round((message.progress||0)*100)});
    }});
  };
  let worker=null;
  try{
    if(file.type==="application/pdf"||file.name.toLowerCase().endsWith(".pdf")){
      const pdf=await pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise;
      if(pdf.numPages>5)throw new Error("For this demo, PDFs can contain up to 5 pages.");
      let tamperSuspect=false;
      try{
        const meta=await pdf.getMetadata();
        const prod=((meta?.info?.Producer||"")+" "+(meta?.info?.Creator||"")).toLowerCase();
        if(/photoshop|gimp|canva|pdfedit|illustrator|ilovepdf|sejda/.test(prod)){
          tamperSuspect=true;
        }
      }catch{}
      const pages=[];
      for(let number=1;number<=pdf.numPages;number++){
        setProgress({label:"Reading PDF page "+number+" of "+pdf.numPages+"…",percent:Math.round((number-1)/pdf.numPages*100)});
        const page=await pdf.getPage(number);
        const textContent=await page.getTextContent();
        const digitalText=textContent.items.map(item=>item.str||"").join(" ").trim();
        if(digitalText.length>30){pages.push(digitalText);continue}
        if(!worker)worker=await workerNeeded();
        const viewport=page.getViewport({scale:1.8});
        const canvas=document.createElement("canvas");
        canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
        const context=canvas.getContext("2d");
        await page.render({canvasContext:context,viewport}).promise;
        const result=await worker.recognize(canvas);
        pages.push(result.data.text||"");
        canvas.width=0;canvas.height=0;
      }
      return {text:pages.join("\n"),method:worker?"Browser OCR on scanned PDF":"Text extracted from digital PDF",confidence:null,tamperSuspect};
    }
    worker=await workerNeeded();
    const objectUrl=URL.createObjectURL(file);
    try{
      const result=await worker.recognize(objectUrl);
      return {text:result.data.text||"",method:"Browser OCR on image",confidence:Math.round(result.data.confidence||0),tamperSuspect:false};
    }finally{URL.revokeObjectURL(objectUrl)}
  }finally{if(worker)await worker.terminate()}
}

export default function OCRIntake({onClose,onAnalyze}){
  const [file,setFile]=useState(null),[preview,setPreview]=useState(""),[fields,setFields]=useState(EMPTY);
  const [raw,setRaw]=useState(""),[method,setMethod]=useState(""),[confidence,setConfidence]=useState(null);
  const [progress,setProgress]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
  useEffect(()=>{if(!file||!file.type.startsWith("image/")){setPreview("");return}
    const url=URL.createObjectURL(file);setPreview(url);return()=>URL.revokeObjectURL(url)},[file]);
  const scan=async chosen=>{
    if(!chosen)return;
    setFile(chosen);setFields({...EMPTY,invoice_id:"OCR-"+Date.now().toString().slice(-7)});
    setRaw("");setMethod("");setConfidence(null);setError("");setBusy(true);
    try{
      if(chosen.size>15_000_000)throw new Error("Choose a document under 15 MB.");
      const result=await documentText(chosen,setProgress);
      if(!result.text.trim())throw new Error("No readable text was found. Try a clearer scan or photo.");
      const parsed=parseInvoiceText(result.text);
      parsed.fields.invoice_id="OCR-"+Date.now().toString().slice(-7);
      if(result.tamperSuspect) parsed.fields.tamper_suspect=true;
      setFields(parsed.fields);setRaw(parsed.raw);setMethod(result.method);setConfidence(result.confidence);
    }catch(e){setError(e.message||"Could not read this document. Try a clearer image or PDF.")}
    finally{setBusy(false);setProgress(null)}
  };
  const submit=async e=>{
    e.preventDefault();setError("");setBusy(true);
    try{
      const {data}=await api.post("/intake",{...fields,source_file:file?.name||"invoice document",
        extraction_method:method,ocr_confidence:confidence});
      onAnalyze(data);
      onClose();
    }catch(e){setError(e.response?.data?.detail||e.message||"Could not check this invoice.")}
    finally{setBusy(false)}
  };
  const field=(key,label,type="text")=><label className="block text-xs font-semibold text-slate-600">{label}
    <input type={type} value={fields[key]??""} onChange={e=>setFields(v=>({...v,[key]:e.target.value}))}
      className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-800 focus:border-teal-600 focus:outline-none"
      placeholder={"Enter "+label.toLowerCase()} /></label>;
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3 sm:p-6" role="presentation">
    <section role="dialog" aria-modal="true" aria-labelledby="ocr-title" className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
      <header className="flex items-start justify-between border-b border-slate-200 px-5 py-4 sm:px-7">
        <div><div className="eyebrow">DOCUMENT INTAKE</div><h2 id="ocr-title" className="text-xl font-bold text-slate-800">Scan an invoice</h2>
          <p className="mt-1 text-sm text-slate-500">Extract fields from a photo or PDF, verify them, then run the same Veri-Fi checks.</p></div>
        <button onClick={onClose} className="rounded-lg px-3 py-1 text-2xl leading-none text-slate-500 hover:bg-slate-100" aria-label="Close">×</button>
      </header>
      <div className="grid gap-5 p-5 sm:p-7 lg:grid-cols-[.85fr_1.15fr]">
        <div className="space-y-4">
          <label className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-teal-300 bg-teal-50/60 px-5 py-6 text-center hover:bg-teal-50">
            <span className="text-3xl" aria-hidden="true">▧</span><b className="mt-2 text-sm text-slate-800">{file?file.name:"Choose invoice image or PDF"}</b>
            <span className="mt-1 text-xs text-slate-500">PNG, JPG or PDF · up to 15 MB · 5 PDF pages</span>
            <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf,.pdf" className="sr-only" onChange={e=>scan(e.target.files?.[0])}/>
          </label>
          {preview&&<img src={preview} alt="Selected invoice preview" className="max-h-72 w-full rounded-xl border border-slate-200 object-contain bg-slate-50"/>}
          {busy&&<div className="rounded-xl border border-slate-200 bg-slate-50 p-4" role="status" aria-live="polite">
            <div className="flex justify-between gap-3 text-xs font-medium text-slate-600"><span>{progress?.label||"Preparing invoice…"}</span><span>{progress?.percent||0}%</span></div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-teal-600 transition-all" style={{width:(progress?.percent||0)+"%"}}/></div>
            <p className="mt-2 text-xs text-slate-500">Your document stays in this browser; its image and OCR text are not uploaded. First image scan needs internet to load the OCR engine and English model.</p></div>}
          {!busy&&method&&<div className="rounded-xl border border-teal-100 bg-teal-50 p-3 text-xs text-teal-900">
            <b>{method}</b>{confidence!==null&&<span> · OCR text confidence {confidence}%</span>}
            <p className="mt-1 text-teal-800">Only the fields you confirm will be sent to Veri-Fi for checking.</p></div>}
          {fields.tamper_suspect&&<div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 font-medium">
            ⚠ <b>Metadata alert</b>: PDF metadata indicates post-export graphics editing (e.g. Canva/Photoshop). Veri-Fi will flag this for inspection.
          </div>}
          {error&&<p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p>}
          {raw&&<details className="rounded-lg border border-slate-200 p-3"><summary className="cursor-pointer text-xs font-semibold text-slate-600">Review extracted text</summary>
            <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap text-xs text-slate-500">{raw}</pre></details>}
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {field("invoice_id","Record ID")}
            {field("invoice_no","Invoice number")}
            {field("vendor","Vendor name")}
            {field("po_number","Purchase Order (PO #)")}
            {field("date","Invoice date")}
            {field("amount","Total amount")}
            {field("currency","Currency (USD, EUR, GBP…)")}
            {field("category","Expense category")}
            {field("bank_account","Remittance bank acct #")}
            {field("employee","Employee / claimant")}
          </div>
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">OCR is an assistant, not an approval. Check each field against the original before submitting. Missing or invalid values stay visible in the exception queue.</p>
          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600">Cancel</button>
            <button type="submit" disabled={!file||busy} className="primary-button rounded-lg px-4 py-2 text-sm text-white disabled:opacity-50">{busy?"Processing…":"Confirm fields & run checks"}</button>
          </div>
        </form>
      </div>
    </section>
  </div>;
}
