import {useState} from "react";
import api from "../api";

export default function Chat(){
  const [msgs,setMsgs]=useState([{r:"bot",t:"Ask about an invoice ID, duplicates, over-limit claims or missing fields."}]);
  const [q,setQ]=useState(""),[wait,setWait]=useState(false);
  const send=async t=>{t=(t||q).trim();if(!t)return;setQ("");setMsgs(m=>[...m,{r:"me",t}]);setWait(true);
    try{const {data}=await api.post("/chat",{question:t});setMsgs(m=>[...m,{r:"bot",t:data.answer,src:data.source}])}
    catch(e){setMsgs(m=>[...m,{r:"bot",t:e.response?.data?.detail||"The chat request failed."}])}setWait(false)};
  return <div className="bg-white rounded-lg border border-slate-200 p-4 max-w-2xl">
    <div className="space-y-3 mb-4">{msgs.map((m,i)=><div key={i} className={m.r==="me"?"text-right":""}>
      <span className={"inline-block rounded-lg px-3 py-2 text-sm max-w-[85%] text-left "+(m.r==="me"?"bg-blue-600 text-white":"bg-slate-100")}>{m.t}</span>
      {m.src&&<div className="text-xs text-slate-400 mt-0.5">Source: {m.src}</div>}</div>)}{wait&&<div className="text-sm text-slate-400">Thinking...</div>}</div>
    <div className="flex flex-wrap gap-2 mb-3">{["Show duplicates","Which claims are over limit?","Any missing fields?"].map(s=><button key={s} onClick={()=>send(s)} className="text-xs border border-slate-300 rounded-full px-3 py-1 hover:bg-slate-50">{s}</button>)}</div>
    <div className="flex gap-2"><input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send()} placeholder="Ask about the results" className="flex-1 border border-slate-300 rounded px-3 py-2 text-sm"/>
      <button onClick={()=>send()} className="px-4 py-2 rounded bg-blue-600 text-white text-sm">Ask</button></div></div>;
}
