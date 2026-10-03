import {useState,useEffect} from "react";
import api from "../api";

export default function Audit(){
  const [log,setLog]=useState([]);
  useEffect(()=>{api.get("/audit").then(r=>setLog(r.data)).catch(()=>{})},[]);
  return <div className="bg-white rounded-lg border border-slate-200 overflow-x-auto"><table className="w-full text-sm">
    <thead className="bg-slate-50 text-left text-slate-500"><tr><th className="p-2">Time</th><th>Invoice</th><th>Actor</th><th>Decision</th><th>Detail</th></tr></thead>
    <tbody>{log.map((l,i)=><tr key={i} className="border-t border-slate-100"><td className="p-2 whitespace-nowrap">{l.ts}</td><td>{l.invoice_id}</td><td>{l.actor}</td><td>{l.decision}</td><td className="pr-2 text-slate-600">{l.detail}</td></tr>)}</tbody></table>
    {!log.length&&<p className="p-4 text-sm text-slate-500">No decisions logged yet. Run a check to start the audit log.</p>}</div>;
}
