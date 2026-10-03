import {useState,useEffect} from "react";
import api from "../api";
import {Badge,FIELDS} from "../ui";
import Timeline from "./Timeline";
const REASONS=[["legit_repeat","Legit repeat"],["confirmed_duplicate","Confirmed duplicate"],["vendor_error","Vendor error"],["other","Other"]];
export default function Detail({row,onClose,onDecide,rows,onPick,saving=false,error=""}){
  const [ai,setAi]=useState(null),[reason,setReason]=useState(""),[explaining,setExplaining]=useState(false);
  useEffect(()=>{setAi(null);setReason("")},[row.invoice_id]);
  const open=row.status!=="AUTO_PASS";
  const decide=d=>{if(open&&reason&&!saving)onDecide(row.invoice_id,d,reason)};
  useEffect(()=>{const h=e=>{
    if(["INPUT","TEXTAREA","SELECT"].includes(e.target.tagName))return;
    if(e.key==="Escape")onClose();
    else if(open&&/^[1-4]$/.test(e.key))setReason(REASONS[Number(e.key)-1][0]);
    else if(e.key.toLowerCase()==="a")decide("APPROVED");
    else if(e.key.toLowerCase()==="r")decide("REJECTED")};
    window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h)});
  const explain=async()=>{setExplaining(true);try{const {data}=await api.get("/explain/"+encodeURIComponent(row.invoice_id));setAi(data)}catch(e){setAi({text:e.response?.data?.detail||"Could not load the explanation.",source:"error"})}finally{setExplaining(false)}};
  return <div className="fixed inset-0 z-40" role="presentation">
    <button className="absolute inset-0 w-full h-full bg-slate-950/40" onClick={onClose} aria-label="Close invoice details" />
    <aside role="dialog" aria-modal="true" aria-label={"Invoice details: "+row.invoice_id} className="absolute inset-y-0 right-0 w-full max-w-xl bg-white shadow-2xl overflow-y-auto p-6">
    <div className="flex justify-between items-start">
      <div><div className="text-lg font-semibold">{row.invoice_id}</div><div className="text-sm text-slate-500">{row.vendor||"No vendor"}</div></div>
      <button onClick={onClose} className="text-slate-500 hover:text-slate-900 text-xl leading-none rounded p-2" aria-label="Close invoice details">×</button>
    </div>
    <div className="mt-3 flex items-center gap-2"><Badge s={row.status}/><span className="text-sm text-slate-500">Rule score {Math.round(row.confidence*100)}%</span>
      {row.human_decision&&<span className="text-sm font-medium">Reviewer: {row.human_decision.toLowerCase()}{row.human_reason?" ("+row.human_reason.replace("_"," ")+")":""}</span>}</div>
    {error&&<div role="alert" className="mt-3 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
    <Timeline rows={rows||[]} row={row} onPick={onPick}/>
    {row.flags.map((f,i)=><div key={i} className="mt-4 border border-slate-200 rounded-lg p-3">
      <div className="text-sm font-medium">{f.rule} <span className="text-slate-500 font-normal">(rule score {Math.round(f.confidence*100)}%)</span></div>
      <p className="text-sm mt-1">{f.message}</p>
      {(f.signals||[]).length>0&&<div className="mt-3 space-y-1">{f.signals.map(s=><div key={s.label} className="flex items-center gap-2 text-xs">
        <span className="w-40 text-slate-500">{s.label}</span>
        <div className="flex-1 h-1.5 bg-slate-100 rounded"><div className="h-1.5 bg-blue-500 rounded" style={{width:Math.round(s.strength*100)+"%"}}/></div>
        <span className="w-20 text-right">{s.value}</span></div>)}
        <p className="text-xs text-slate-400">Built from the signals above. It is a rule score, not a calibrated probability.</p></div>}
      {f.matched&&<table className="w-full text-sm mt-3"><thead><tr className="text-left text-slate-500"><th className="py-1"></th><th>This invoice</th><th>Matched {f.matched.invoice_id}</th></tr></thead>
        <tbody>{FIELDS.map(([k,l])=><tr key={k} className="border-t border-slate-100"><td className="py-1 text-slate-500">{l}</td><td>{row[k]??"-"}</td><td>{f.matched[k]??"-"}</td></tr>)}</tbody></table>}
    </div>)}
    {!open&&<p className="mt-4 text-sm text-slate-600">{row.explanation}</p>}
    {open&&<div className="mt-4">
      <button onClick={explain} disabled={explaining} className="text-sm text-blue-700 underline disabled:opacity-50">{explaining?"Preparing explanation…":"Explain with AI"}</button>
      {ai&&<p className="text-sm mt-2 bg-slate-50 rounded p-3">{ai.text}<span className="block text-xs text-slate-400 mt-1">Source: {ai.source}</span></p>}
      <div className="mt-5 text-sm text-slate-500">Reason (required)</div>
      <div className="mt-1 flex flex-wrap gap-2">{REASONS.map(([k,l],i)=><button key={k} onClick={()=>setReason(k)}
        className={"px-3 py-1 rounded-full border text-sm "+(reason===k?"bg-blue-600 text-white border-blue-600":"border-slate-300 bg-white")}>{i+1}. {l}</button>)}</div>
      <div className="mt-4 flex gap-2">
        <button disabled={!reason||saving} onClick={()=>decide("APPROVED")} className="px-3 py-1.5 rounded bg-emerald-600 text-white text-sm disabled:opacity-40">{saving?"Saving…":"Approve (A)"}</button>
        <button disabled={!reason||saving} onClick={()=>decide("REJECTED")} className="px-3 py-1.5 rounded bg-red-600 text-white text-sm disabled:opacity-40">{saving?"Saving…":"Reject (R)"}</button>
      </div></div>}
    </aside></div>;
}
