export const money=n=>n==null?"-":"₹"+Number(n).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});
export const STATUS={AUTO_PASS:["Auto-passed","bg-emerald-100 text-emerald-800"],FLAG:["Flagged","bg-red-100 text-red-800"],REVIEW:["Needs review","bg-amber-100 text-amber-800"]};
export const Badge=({s})=>{const [label,style]=STATUS[s]||[s||"Unknown","bg-slate-100 text-slate-700"];return <span className={"px-2 py-0.5 rounded text-xs font-medium "+style}>{label}</span>};
export const Stat=({label,value,tone,hint})=><div className="bg-white rounded-lg border border-slate-200 p-4" title={hint}><div className="text-sm text-slate-500">{label}</div><div className={"text-2xl font-semibold mt-1 "+(tone||"")}>{value}</div>{hint&&<div className="stat-hint">{hint}</div>}</div>;
export const FIELDS=[["vendor","Vendor"],["invoice_no","Invoice no."],["date","Date"],["amount","Amount"]];
