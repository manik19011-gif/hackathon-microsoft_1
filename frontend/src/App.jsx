import {useState,useEffect} from "react";
import api from "./api";
import {Badge,Stat,money} from "./ui";
import Detail from "./components/Detail";
import Audit from "./components/Audit";
import Chat from "./components/Chat";
import Limits from "./components/Limits";
import Risk from "./components/Risk";
import Learning from "./components/Learning";
import Progress from "./components/Progress";
const TOUR=[
  {title:"Screen the whole file",body:"Start with the run summary. Every invoice was checked; only 30 exceptions need a person’s attention."},
  {title:"Show an exact duplicate",body:"This is a high-confidence match. Open the evidence to compare the two invoice records side by side."},
  {title:"Show an uncertain match",body:"This near duplicate is routed to review because similarity is a signal, not proof. A person makes the final call."},
  {title:"Record a reviewer decision",body:"Choose a reason, then approve or reject. The decision is saved to the audit log. You can also skip this action during the demo."},
  {title:"Close with accountability",body:"The audit log keeps the system and reviewer actions together. Limits, vendor risk, and assistant answers are available in the other tabs."}
];
export default function App(){
  const [res,setRes]=useState(null),[tab,setTab]=useState("results"),[filter,setFilter]=useState("ALL"),[sel,setSel]=useState(null),[busy,setBusy]=useState(false),[busyLabel,setBusyLabel]=useState("Checking invoices…"),[err,setErr]=useState(""),[downloadMsg,setDownloadMsg]=useState(""),[q,setQ]=useState(""),[sort,setSort]=useState(null),[exceptionsFirst,setExceptionsFirst]=useState(true),[demoTour,setDemoTour]=useState(false),[demoStep,setDemoStep]=useState(0);
  const refresh=async()=>{const {data}=await api.get("/results");setRes(data.rows?data:null)};
  useEffect(()=>{refresh().catch(()=>{})},[]);
  const load=async p=>{setBusyLabel("Checking invoices…");setBusy(true);setErr("");try{const {data}=await p;setRes(data);setSel(null);return true}catch(e){setErr(e.response?.data?.detail||e.message);return false}finally{setBusy(false)}};
  const upload=e=>{const f=e.target.files[0];if(!f)return;const fd=new FormData();fd.append("file",f);load(api.post("/analyze",fd));e.target.value=""};
  const downloadFile=async(path,filename)=>{setDownloadMsg("");setErr("");try{const {data,headers}=await api.get(path,{responseType:"blob"});const href=URL.createObjectURL(new Blob([data],{type:headers["content-type"]||"text/csv"}));const a=document.createElement("a");a.href=href;a.download=filename;document.body.appendChild(a);a.click();a.remove();window.setTimeout(()=>URL.revokeObjectURL(href),1500);
    setDownloadMsg(filename==="reviewer_feedback.csv"&&!res?.rows?.some(r=>r.human_decision)?"Feedback export downloaded; it has headers only because no reviewer decisions are recorded yet.":`${filename} downloaded. Check your browser’s downloads.`)
  }catch(e){setErr(e.response?.data?.detail||`Could not download ${filename}. Please try again.`)}};
  const queue=res?res.rows.filter(r=>r.status!=="AUTO_PASS"&&!r.human_decision).sort((a,b)=>(b.priority||0)-(a.priority||0)):[];
  const decide=async(id,decision,reason)=>{
    const i=queue.findIndex(r=>r.invoice_id===id);
    setErr("");setBusyLabel("Saving review decision…");setBusy(true);
    try{await api.post("/review",{invoice_id:id,decision,reason});await refresh();
      setSel(queue[i+1]?.invoice_id??null);   // next-highest priority; closes when the queue is empty
      if(demoTour&&demoStep===3)setDemoStep(4);
    }catch(e){setErr(e.response?.data?.detail||e.message||"Could not save the review decision.")}
    finally{setBusy(false)}
  };
  const startDemo=async()=>{if(await load(api.post("/sample"))){setTab("results");setFilter("ALL");setQ("");setExceptionsFirst(true);setDemoStep(0);setDemoTour(true)}};
  const stopDemo=()=>{setDemoTour(false);setSel(null);setTab("results");setFilter("ALL");setQ("")};
  useEffect(()=>{if(!demoTour)return;const step=demoStep;
    if(step===0){setTab("results");setFilter("ALL");setQ("");setSel(null)}
    if(step===1){setTab("results");setFilter("FLAG");setQ("INV-1057");setSel("INV-1057")}
    if(step===2){setTab("results");setFilter("REVIEW");setQ("INV-1061");setSel("INV-1061")}
    if(step===3){setTab("results");setFilter("ALL");setQ("");setSel("INV-1061")}
    if(step===4){setTab("audit");setFilter("ALL");setQ("");setSel(null)}
  },[demoTour,demoStep]);
  const ORDER={FLAG:0,REVIEW:1,AUTO_PASS:2};
  const hit=r=>!q||[r.invoice_id,r.vendor,r.invoice_no].some(v=>String(v||"").toLowerCase().includes(q.toLowerCase()));
  const val=(r,k)=>(k==="status"?ORDER[r.status]:r[k])??"";
  const rows=res?res.rows.filter(r=>(filter==="ALL"||r.status===filter)&&hit(r)).sort((a,b)=>exceptionsFirst?(ORDER[a.status]-ORDER[b.status]||(b.priority||0)-(a.priority||0)):sort?(val(a,sort.key)>val(b,sort.key)?1:val(a,sort.key)<val(b,sort.key)?-1:0)*sort.dir:0):[];
  const row=res&&sel?res.rows.find(r=>r.invoice_id===sel):null;
  const s=res&&res.summary;
  const th=(k,l,cls="")=><th className={cls+" cursor-pointer select-none"} onClick={()=>{setExceptionsFirst(false);setSort(s=>s&&s.key===k?{key:k,dir:-s.dir}:{key:k,dir:1})}}>{l}{sort&&sort.key===k?(sort.dir>0?" \u25B2":" \u25BC"):""}</th>;
  const btn="px-3 py-2 rounded text-sm border border-slate-300 bg-white hover:bg-slate-50 cursor-pointer";
  const sections=[["results","Review queue","▤"],["risk","Risk insights","◒"],["audit","Audit trail","◷"],["limits","Policy limits","⌁"],["chat","Ask assistant","✳"],["how","How it works","ⓘ"]];
  return <div className="app-frame">
    <aside className="side-rail" aria-label="Workspace navigation">
      <div className="rail-brand"><div className="brand-mark" aria-hidden="true">✳</div><div><b>Veri-Fi</b><span>INVOICE CONTROL</span></div></div>
      <div className="rail-label">WORKSPACE</div>
      <nav className="rail-nav" aria-label="Main navigation">{sections.map(([k,l,icon])=><button key={k} disabled={!res} onClick={()=>setTab(k)} aria-current={tab===k?"page":undefined} className={tab===k?"active":""}><span className="rail-icon" aria-hidden="true">{icon}</span><span>{l}</span>{k==="results"&&res&&queue.length>0&&<i>{queue.length}</i>}</button>)}</nav>
      <div className="rail-bottom"><span className="rail-status-dot"/> <div><b>Review stays human</b><span>Every decision is traceable</span></div></div>
    </aside>
    <main className="app-shell max-w-7xl mx-auto px-4 py-5 sm:px-6 lg:px-8">
    <header className="app-header flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3"><div className="brand-mark" aria-hidden="true">✳</div><div><div className="eyebrow">ACCOUNTS PAYABLE · CONTROL CENTER</div><h1 className="text-xl sm:text-2xl font-bold tracking-tight">Veri-Fi</h1><p className="text-xs text-slate-500 mt-0.5">Invoice &amp; Expense Checker</p></div></div>
      <div className="flex gap-2">
        <button className={btn} disabled={busy} onClick={()=>load(api.post("/sample"))}>Load sample data</button>
        <button className={btn} disabled={busy} onClick={startDemo}>Start 90-second demo</button>
        <label className={btn}>Upload CSV or Excel<input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={upload}/></label>
        <button className={btn} onClick={()=>downloadFile("/demo-upload.csv","invoice_upload_example.csv")}>Example CSV</button>
        {res&&<button className={btn} onClick={()=>downloadFile("/report.csv","exception_report.csv")}>Download report</button>}
        {res&&<button className={btn} onClick={()=>downloadFile("/feedback.csv","reviewer_feedback.csv")}>Download reviewer feedback</button>}
      </div>
    </header>
    <section className="intro-panel mt-6">
      <div><div className="eyebrow text-teal-200">EXPLAINABLE AUTOMATION</div><h2>Catch the exceptions. Keep every decision accountable.</h2><p>Clean invoices pass automatically. Every exception stays in a human review queue with its rule explanation and matched record when available.</p></div>
      <div className="process-pills"><span><b>01</b> Screen</span><span><b>02</b> Review</span><span><b>03</b> Audit</span></div>
    </section>
    {demoTour&&<section className="demo-guide mt-4" aria-live="polite"><div className="demo-guide-step">DEMO WALKTHROUGH <span>STEP {demoStep+1} OF {TOUR.length}</span></div><div className="demo-guide-content"><div><h3>{TOUR[demoStep].title}</h3><p>{TOUR[demoStep].body}</p></div><div className="demo-guide-actions"><button onClick={()=>demoStep===0?stopDemo():setDemoStep(demoStep-1)}>{demoStep===0?"Exit":"Back"}</button>{demoStep<TOUR.length-1?<button className="guide-next" onClick={()=>setDemoStep(demoStep+1)}>{demoStep===3?"Skip decision":"Next"} →</button>:<button className="guide-next" onClick={stopDemo}>Finish demo</button>}</div></div></section>}
    {downloadMsg&&<div className="download-notice mt-3" role="status">{downloadMsg}<button aria-label="Dismiss download message" onClick={()=>setDownloadMsg("")}>×</button></div>}
    {err&&<div className="mt-4 bg-red-50 border border-red-200 text-red-800 text-sm rounded p-3">{err}</div>}
    {busy&&<div className="mt-4 text-sm text-slate-500">{busyLabel}</div>}
    {!res&&!busy&&<div className="empty-state mt-8"><div className="empty-icon">↗</div><div className="eyebrow">YOUR NEXT STEP</div><h2>Turn an invoice file into a focused review queue.</h2><p>Load the 93-row demo set, or upload a CSV using supplier, invoice number, date, total, and expense type columns.</p><div className="empty-actions"><button disabled={busy} onClick={()=>load(api.post("/sample"))} className="primary-button">Load 93 demo invoices</button><label className={btn}>Upload CSV or Excel<input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={upload}/></label></div><div className="how-cards"><div><b>01 · Screen</b><span>Rules check every row for duplicates, missing data, dates, and limits.</span></div><div><b>02 · Review</b><span>Uncertain matches go to a person with the evidence shown.</span></div><div><b>03 · Audit</b><span>Reviewer decisions and system findings stay traceable.</span></div></div></div>}
    {res&&<>
      <div className="section-kicker mt-7">RUN OVERVIEW <span>{s.total} records analyzed</span></div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-3">
        <Stat label="Invoices checked" value={s.total} hint="All rows in the uploaded file were screened."/><Stat label="Auto-passed" value={s.auto_pass} tone="text-emerald-700" hint="No configured rule raised an exception."/>
        <Stat label="Flagged" value={s.flagged} tone="text-red-700" hint="High-confidence rule matches; review before action."/><Stat label="Needs review" value={s.review} tone="text-amber-700" hint="Uncertain signals routed to a human reviewer."/>
        <Stat label="Money at risk" value={money(s.money_at_risk)} hint="Estimated duplicate totals plus over-limit excess; validate exceptions."/></div>
      <Progress rows={res.rows} summary={s}/>
      {queue.length>0&&<section className="priority-card" aria-label="Recommended next review"><div className="priority-marker">NEXT<br/>UP</div><div className="priority-copy"><div className="eyebrow">RECOMMENDED NEXT REVIEW</div><h3>{queue[0].invoice_id} <span>·</span> {queue[0].vendor||"Vendor not provided"}</h3><p>Highest-priority open exception, ranked by rule confidence and estimated exposure. Final decision stays with your reviewer.</p></div><div className="priority-amount"><span>INVOICE AMOUNT</span><b>{money(queue[0].amount)}</b></div><button onClick={()=>setSel(queue[0].invoice_id)} className="priority-action">Review invoice <span aria-hidden="true">→</span></button></section>}
      {s.mapped_columns&&Object.keys(s.mapped_columns).length>0&&<p className="mt-3 text-xs text-slate-500">Matched columns: {Object.entries(s.mapped_columns).map(([a,b])=>a+" as "+b).join(", ")}</p>}
      <div className="mobile-nav">{sections.map(([k,l,icon])=><button key={k} disabled={!res} onClick={()=>setTab(k)} aria-current={tab===k?"page":undefined} className={tab===k?"active":""}><span aria-hidden="true">{icon}</span>{l}</button>)}</div>
      <div className="mt-4">
        {tab==="results"&&<><Learning key={res.rows.filter(r=>r.human_decision).length} onApplied={refresh}/>
          <div className="table-toolbar flex flex-wrap items-center gap-2 mb-3 text-sm">{queue.length>0&&<button onClick={()=>setSel(queue[0].invoice_id)} className="primary-button px-3 py-2 rounded bg-blue-600 text-white">Start review <span className="queue-count">{queue.length} left</span></button>}{queue.length===0&&s.flagged+s.review>0&&<span className="text-emerald-700 font-medium">Review queue cleared</span>}<input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search invoice, vendor or number" className="border border-slate-300 rounded px-3 py-2 w-64"/><button className="toolbar-toggle" aria-pressed={exceptionsFirst} onClick={()=>{setExceptionsFirst(v=>!v);setSort(null)}}>{exceptionsFirst?"✓ Exceptions first":"Exceptions first"}</button>{[["ALL","All"],["FLAG","Flagged"],["REVIEW","Needs review"],["AUTO_PASS","Auto-passed"]].map(([k,l])=>
            <button key={k} onClick={()=>setFilter(k)} className={"px-3 py-1 rounded-full border "+(filter===k?"bg-blue-600 text-white border-blue-600":"border-slate-300 bg-white")}>{l}</button>)}</div>
          <div className="bg-white rounded-lg border border-slate-200 overflow-x-auto"><table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500"><tr>{th("invoice_id","Invoice","p-2")}{th("vendor","Vendor")}{th("invoice_no","Invoice no.")}{th("date","Date")}{th("amount","Amount","text-right")}{th("status","Status","pl-4")}<th>Why</th></tr></thead>
            <tbody>{rows.map(r=><tr key={r.invoice_id} tabIndex={0} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();setSel(r.invoice_id)}}} onClick={()=>setSel(r.invoice_id)} className="border-t border-slate-100 hover:bg-blue-50 cursor-pointer">
              <td className="p-2">{r.invoice_id}</td><td>{r.vendor||"-"}</td><td>{r.invoice_no||"-"}</td><td>{r.date||"-"}</td><td className="text-right">{money(r.amount)}</td>
              <td className="pl-4"><Badge s={r.status}/>{r.human_decision&&<span className="ml-2 text-xs text-slate-500">{r.human_decision.toLowerCase()}</span>}</td>
              <td className="pr-2 text-slate-600 max-w-xs truncate">{r.status==="AUTO_PASS"?"":r.flags.map(f=>f.rule.split("_").slice(1).join(" ").toLowerCase()).join(", ")}</td></tr>)}</tbody></table>
            {!rows.length&&<p className="p-4 text-sm text-slate-500">No invoices match this filter.</p>}</div></>}
        {tab==="audit"&&<Audit/>}
        {tab==="risk"&&<Risk rows={res.rows}/>}
        {tab==="limits"&&<Limits onSaved={refresh}/>}
        {tab==="chat"&&<Chat/>}
        {tab==="how"&&<HowItWorks/>}
      </div></>}
    {row&&<Detail row={row} rows={res.rows} error={err} saving={busy} onPick={setSel} onClose={()=>setSel(null)} onDecide={decide}/>}
    </main>
  </div>;
}

function HowItWorks(){return <section className="how-panel"><div className="eyebrow">BUILT FOR HUMAN OVERSIGHT</div><h2>Automation finds the signal. People own the decision.</h2><p className="how-lead">Clean rows auto-pass. Every exception remains available for human review; a language model never approves or rejects an invoice.</p><div className="how-cards"><div><b>01 · Deterministic checks</b><span>Rules scan every row for duplicate invoices, missing fields, invalid dates, category limits, and possible split claims.</span></div><div><b>02 · Similarity signals</b><span>Vendor and invoice-number similarity help rank likely matches. Borderline cases stay in the review queue.</span></div><div><b>03 · Human decision</b><span>A reviewer sees the matched record when a comparison applies, chooses a reason, and records an approval or rejection.</span></div><div><b>04 · Audit trail</b><span>System findings, human decisions, and rule changes are logged for later review.</span></div></div><div className="how-ai-note"><b>Where AI fits</b><span>Optional Azure OpenAI provides plain-language explanations and answers questions from the loaded results. It does not make screening or payment decisions; local rule-based fallback works without an API key.</span></div></section>}
