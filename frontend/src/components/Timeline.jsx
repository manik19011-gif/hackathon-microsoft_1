const key=v=>String(v||"").toLowerCase().replace(/\b(ltd|limited|inc|llc|llp|pvt|private|co|corp)\b/g,"").replace(/[^a-z0-9]/g,"");
const COLOR={FLAG:"#dc2626",REVIEW:"#d97706",AUTO_PASS:"#94a3b8"};

export default function Timeline({rows,row,onPick}){
  const k=key(row.vendor);
  const mine=k?rows.filter(r=>key(r.vendor)===k&&r.date&&!isNaN(new Date(r.date))):[];
  if(mine.length<2)return null;
  const t=r=>new Date(r.date).getTime(),lo=Math.min(...mine.map(t)),span=Math.max(...mine.map(t))-lo||1;
  const matched=new Set(row.flags.map(f=>f.matched&&f.matched.invoice_id).filter(Boolean));
  const others=mine.filter(r=>r.status!=="AUTO_PASS"&&r.invoice_id!==row.invoice_id).length;
  return <div className="mt-4">
    <svg viewBox="0 0 400 40" className="w-full" role="img" aria-label="This vendor's invoices over time">
      <line x1="10" y1="20" x2="390" y2="20" stroke="#e2e8f0"/>
      {mine.map(r=>{const hi=r.invoice_id===row.invoice_id||matched.has(r.invoice_id);
        return <circle key={r.invoice_id} cx={10+380*(t(r)-lo)/span} cy="20" r={r.invoice_id===row.invoice_id?7:hi?6:4} fill={COLOR[r.status]}
          stroke={hi?"#1e293b":"none"} strokeWidth="2" className="cursor-pointer" onClick={()=>onPick(r.invoice_id)}><title>{r.invoice_id+" | "+r.date+" | "+r.amount}</title></circle>})}</svg>
    <p className="text-xs text-slate-500">{mine.length} invoices from this vendor, {others} other exception{others===1?"":"s"}. Outlined dots are this invoice and its matched record; click a dot to open it.</p></div>;
}
