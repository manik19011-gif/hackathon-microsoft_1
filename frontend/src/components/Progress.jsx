import {useState} from "react";
import {money} from "../ui";

export default function Progress({rows,summary}){
  const [mins,setMins]=useState(2);
  const ex=rows.filter(r=>r.status!=="AUTO_PASS"),done=ex.filter(r=>r.human_decision),rej=done.filter(r=>r.human_decision==="REJECTED");
  const saved=rej.reduce((t,r)=>t+(r.flags.reduce((s,f)=>s+(f.at_risk||0),0)||r.amount||0),0);
  const pct=ex.length?done.length/ex.length:1,C=2*Math.PI*18;
  return <div className="mt-4 bg-white rounded-lg border border-slate-200 p-4 flex flex-wrap items-center gap-6 text-sm">
    <svg width="48" height="48" viewBox="0 0 48 48" role="img" aria-label={"Reviewed "+done.length+" of "+ex.length}>
      <circle cx="24" cy="24" r="18" fill="none" stroke="#e2e8f0" strokeWidth="5"/>
      <circle cx="24" cy="24" r="18" fill="none" stroke="#059669" strokeWidth="5" strokeDasharray={C} strokeDashoffset={C*(1-pct)} transform="rotate(-90 24 24)"/></svg>
    <div><div className="font-medium">{ex.length>0&&done.length===ex.length?"All "+ex.length+" exceptions reviewed":done.length+" of "+ex.length+" exceptions reviewed"}</div>
      <div className="text-slate-500">{rej.length} rejected, {done.length-rej.length} approved</div></div>
    <div><div className="font-medium">{money(saved)}</div><div className="text-slate-500">Amount protected by rejections</div></div>
    <div><div className="font-medium">{(summary.auto_pass*mins/60).toFixed(1)} hours</div>
      <div className="text-slate-500">Review time saved at <input type="number" min="0" value={mins} onChange={e=>setMins(Number(e.target.value)||0)} className="w-12 border border-slate-300 rounded px-1 mx-1"/>min per invoice (your estimate)</div></div>
  </div>;
}
