import {useState,useEffect} from "react";
import api from "../api";

export default function Learning({onApplied}){
  const [s,setS]=useState([]),[msg,setMsg]=useState("");
  useEffect(()=>{api.get("/learning").then(r=>setS(r.data)).catch(()=>{})},[]);
  const apply=async x=>{try{await api.post("/learning/apply",{param:x.param,value:x.suggested});setMsg("Applied: "+x.param+" is now "+x.suggested+". All invoices were checked again.");setS([]);onApplied&&onApplied()}catch(e){setMsg(e.response?.data?.detail||"Could not apply the change.")}};
  if(!s.length&&!msg)return null;
  return <div className="mb-3 bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
    {s.map(x=><div key={x.param} className="flex flex-wrap items-center gap-3">
      <span><b>Suggestion from your decisions:</b> {x.evidence} Raise <code>{x.param}</code> from {x.current} to {x.suggested}?</span>
      <button onClick={()=>apply(x)} className="ml-auto px-3 py-1 rounded bg-blue-600 text-white">Apply and re-check</button></div>)}
    {msg&&<p className="text-slate-600">{msg}</p>}</div>;
}
