import {useState, useRef, useEffect} from "react";
import api from "../api";

export default function Chat(){
  const [msgs,setMsgs]=useState([
    {r:"bot",t:"Hello! I can answer questions about your loaded invoice batch. Inquire about duplicate payments, high-risk vendors, over-limit claims, missing fields, or anomaly scores."}
  ]);
  const [q,setQ]=useState(""),[wait,setWait]=useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, wait]);

  const send=async t=>{
    const text=(t||q).trim();
    if(!text||wait)return;
    setQ("");
    setMsgs(m=>[...m,{r:"me",t:text}]);
    setWait(true);
    try{
      const {data}=await api.post("/chat",{question:text});
      setMsgs(m=>[...m,{r:"bot",t:data.answer,src:data.source}]);
    }catch(e){
      setMsgs(m=>[...m,{r:"bot",t:e.response?.data?.detail||"The chat request could not be processed. Please check if sample data is loaded."}]);
    }finally{
      setWait(false);
    }
  };

  const suggestions = [
    "Show duplicates",
    "Which claims are over limit?",
    "Any missing fields?",
    "Which vendor has the highest risk?",
    "Summarize reviewer flags"
  ];

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm max-w-3xl overflow-hidden flex flex-col" style={{minHeight:"520px"}}>
      <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-teal-600 text-white flex items-center justify-center font-bold text-lg shadow-sm">
            ✳
          </div>
          <div>
            <h3 className="font-semibold text-slate-800 text-sm">Veri-Fi Assistant</h3>
            <p className="text-xs text-slate-500">Autonomous reasoning · Local rule engine &amp; LLM</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span className="text-xs text-slate-500 font-medium">Ready</span>
        </div>
      </div>

      <div className="flex-1 p-5 overflow-y-auto space-y-4" style={{maxHeight:"460px"}}>
        {msgs.map((m,i)=>(
          <div key={i} className={`flex flex-col ${m.r==="me"?"items-end":"items-start"}`}>
            <div className={`rounded-2xl px-4 py-2.5 text-sm max-w-[82%] leading-relaxed ${
              m.r==="me"
                ? "bg-teal-700 text-white rounded-br-none shadow-sm"
                : "bg-slate-100 text-slate-800 rounded-bl-none border border-slate-200/60"
            }`}>
              {m.t}
            </div>
            {m.src&&<div className="text-[11px] text-slate-400 mt-1 px-1">Source: <span className="font-medium text-slate-500">{m.src}</span></div>}
          </div>
        ))}
        {wait&&(
          <div className="flex items-center gap-2 text-slate-400 text-xs py-1">
            <span className="inline-block w-2 h-2 rounded-full bg-teal-600 animate-bounce" style={{animationDelay:"0ms"}}></span>
            <span className="inline-block w-2 h-2 rounded-full bg-teal-600 animate-bounce" style={{animationDelay:"150ms"}}></span>
            <span className="inline-block w-2 h-2 rounded-full bg-teal-600 animate-bounce" style={{animationDelay:"300ms"}}></span>
            <span className="ml-1 text-slate-500">Analyzing dataset…</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="p-4 border-t border-slate-100 bg-slate-50/70">
        <div className="flex flex-wrap gap-1.5 mb-3">
          {suggestions.map(s=>(
            <button
              key={s}
              onClick={()=>send(s)}
              disabled={wait}
              className="text-xs bg-white text-slate-700 border border-slate-200 rounded-full px-3 py-1 hover:border-teal-500 hover:text-teal-700 hover:bg-teal-50/50 transition-colors shadow-2xs cursor-pointer"
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={q}
            onChange={e=>setQ(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&!wait&&send()}
            placeholder="Ask about invoices, amounts, duplicates, policy limits..."
            disabled={wait}
            className="flex-1 border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100 bg-white"
          />
          <button
            onClick={()=>send()}
            disabled={wait||!q.trim()}
            className="px-5 py-2.5 rounded-lg bg-teal-700 text-white font-medium text-sm hover:bg-teal-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm cursor-pointer"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
