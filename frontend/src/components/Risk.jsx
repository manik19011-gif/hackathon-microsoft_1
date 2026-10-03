import { money } from "../ui";

function RiskBars({title,items,color="#dc2626",caption}){
  const max=Math.max(1,...items.map(x=>x.risk));
  return <section className="risk-card"><div className="risk-card-head"><h3>{title}</h3><p>{caption}</p></div>
    {!items.length?<p className="risk-empty">No flagged money at risk in this view.</p>:items.slice(0,7).map(x=><div className="risk-item" key={x.name}>
      <div className="risk-label"><span title={x.name}>{x.name}</span><b>{money(x.risk)}</b></div>
      <div className="risk-track" role="img" aria-label={`${x.name}: ${money(x.risk)} estimated risk`}><div style={{width:`${Math.max(2,x.risk/max*100)}%`,background:color}}/></div>
      <div className="risk-meta">{x.flagged} flagged · {x.review} to review</div>
    </div>)}
  </section>;
}

export default function Risk({ rows }) {
  const vendors={},categories={};
  rows.forEach(r=>{
    if(r.status==="AUTO_PASS")return;
    const risk=r.status==="FLAG"?r.flags.reduce((s,f)=>s+(f.at_risk||0),0):0;
    const vendor=r.vendor||"(no vendor)",category=r.category||"(no category)";
    const v=vendors[vendor]||(vendors[vendor]={name:vendor,risk:0,flagged:0,review:0});
    const c=categories[category]||(categories[category]={name:category,risk:0,flagged:0,review:0});
    if(r.status==="FLAG"){v.flagged++;c.flagged++}else{v.review++;c.review++}
    v.risk+=risk;c.risk+=risk;
  });
  const order=(a,b)=>b.risk-a.risk||(b.flagged+b.review)-(a.flagged+a.review);
  const byVendor=Object.values(vendors).sort(order),byCategory=Object.values(categories).sort(order);
  const total=rows.reduce((s,r)=>s+(r.status==="FLAG"?r.flags.reduce((t,f)=>t+(f.at_risk||0),0):0),0);
  if(!byVendor.length)return <p className="bg-white rounded-lg border border-slate-200 p-4 text-sm text-slate-500">No exceptions found, so there is no money at risk.</p>;
  return <div><div className="risk-summary"><div><span>ESTIMATED EXPOSURE</span><b>{money(total)}</b><small>Based on flagged duplicate amounts and over-limit excesses.</small></div><p>Use these rankings to prioritize review. They are screening estimates, not confirmed losses.</p></div>
    <div className="risk-grid"><RiskBars title="By vendor" items={byVendor} caption="Where flagged exposure is concentrated."/><RiskBars title="By category" items={byCategory} color="#0f766e" caption="Flagged exposure grouped by expense category."/></div></div>;
}
