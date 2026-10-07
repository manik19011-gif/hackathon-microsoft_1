import {useEffect,useState} from "react";
import api from "../api";

const NAV=[
  ["overview","Overview"],
  ["users","People & roles"],
  ["requests","Employee requests"],
  ["vendors","Vendor Registry"],
  ["pos","Purchase Orders"],
  ["webhooks","Webhooks & Alerts"],
  ["resources","Resources"],
  ["access","Access controls"]
];

export default function Admin({user,onLogout,onBack}){
  const [tab,setTab]=useState("overview"),[overview,setOverview]=useState(null),[users,setUsers]=useState([]),[requests,setRequests]=useState([]),[vendors,setVendors]=useState([]),[pos,setPos]=useState([]),[webhooks,setWebhooks]=useState([]),[webhookLogs,setWebhookLogs]=useState([]),[resources,setResources]=useState([]),[access,setAccess]=useState([]),[days,setDays]=useState(7),[error,setError]=useState(""),[notice,setNotice]=useState(""),[modal,setModal]=useState(""),[busy,setBusy]=useState(false);
  const [vendorSearch,setVendorSearch]=useState(""),[poSearch,setPoSearch]=useState("");

  const reload=async()=>{
    setError("");
    try{
      const [o,u,r,v,p,w,a,x]=await Promise.all([
        api.get(`/admin/overview?days=${days}`),
        api.get("/admin/users"),
        api.get("/admin/requests"),
        api.get("/admin/vendors"),
        api.get("/admin/pos"),
        api.get("/admin/webhooks"),
        api.get("/admin/resources"),
        api.get("/admin/access")
      ]);
      setOverview(o.data);
      setUsers(u.data);
      setRequests(r.data);
      setVendors(v.data);
      setPos(p.data);
      setWebhooks(w.data.webhooks||[]);
      setWebhookLogs(w.data.logs||[]);
      setResources(a.data);
      setAccess(x.data);
    }catch(e){
      setError(e.response?.data?.detail||"Could not load administrator data.");
    }
  };

  useEffect(()=>{reload()},[days]);

  const act=async fn=>{
    setBusy(true);setError("");setNotice("");
    try{
      await fn();
      setNotice("Changes saved and recorded in the audit trail.");
      await reload();
    }catch(e){
      setError(e.response?.data?.detail||"That action could not be completed.");
    }finally{
      setBusy(false);
    }
  };

  const filteredVendors=vendors.filter(v=>!vendorSearch||v.name.toLowerCase().includes(vendorSearch.toLowerCase())||(v.tax_id&&v.tax_id.includes(vendorSearch))||(v.category&&v.category.toLowerCase().includes(vendorSearch.toLowerCase())));
  const filteredPos=pos.filter(p=>!poSearch||p.po_number.toLowerCase().includes(poSearch.toLowerCase())||p.vendor.toLowerCase().includes(poSearch.toLowerCase()));

  return (
    <div className="admin-shell">
      <header className="admin-topbar">
        <div className="admin-brand"><span>✳</span><div><b>Veri-Fi</b><small>ENTERPRISE COMPLIANCE</small></div></div>
        <div className="admin-top-actions">
          <button onClick={onBack}>← Invoice workspace</button>
          <div className="admin-avatar">{user.name.slice(0,1).toUpperCase()}</div>
          <span>{user.name}</span>
          <button className="admin-signout" onClick={onLogout}>Sign out ↗</button>
        </div>
      </header>

      <div className="admin-layout">
        <aside className="admin-sidebar">
          <div className="admin-nav-title">COMPLIANCE &amp; AP CONTROLS</div>
          {NAV.map(([id,label],i)=>(
            <button key={id} onClick={()=>setTab(id)} className={tab===id?"active":""}>
              <span>{["◫","♙","↗","🏢","📄","⚡","▤","⌘"][i]}</span>
              {label}
              {id==="requests"&&requests.filter(r=>r.status==="pending").length>0&&<i>{requests.filter(r=>r.status==="pending").length}</i>}
              {id==="vendors"&&vendors.filter(v=>!v.verified).length>0&&<i className="bg-amber-600">{vendors.filter(v=>!v.verified).length}</i>}
            </button>
          ))}
          <div className="admin-sidebar-note"><span>▣</span><b>Protected workspace</b><small>Disbursements, vendor KYC, and PO controls are audited.</small></div>
        </aside>

        <main className="admin-content">
          <div className="eyebrow">ENTERPRISE FINANCE OPERATIONS · ADMIN SUITE</div>
          <div className="admin-page-title">
            <div>
              <h1>{NAV.find(x=>x[0]===tab)?.[1]}</h1>
              <p>Corporate supplier registry, 3-way matching rules, and automated risk notifications.</p>
            </div>
            {tab==="overview"&&<label className="analytics-range">Activity range<select value={days} onChange={e=>setDays(Number(e.target.value))}><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></select></label>}
            {tab==="users"&&<button className="admin-primary" onClick={()=>setModal("user")}>＋ Add account</button>}
            {tab==="vendors"&&<button className="admin-primary" onClick={()=>setModal("vendor")}>＋ Add trusted vendor</button>}
            {tab==="pos"&&<button className="admin-primary" onClick={()=>setModal("po")}>＋ Create PO</button>}
            {tab==="webhooks"&&<button className="admin-primary" onClick={()=>setModal("webhook")}>＋ Register webhook</button>}
            {tab==="resources"&&<button className="admin-primary" onClick={()=>setModal("resource")}>＋ Add resource</button>}
          </div>

          {error&&<div className="portal-alert error" role="alert">{error}</div>}
          {notice&&<div className="portal-alert success" role="status">✓ {notice}</div>}

          {/* OVERVIEW TAB */}
          {tab==="overview"&&<>
            {overview&&<div className="admin-kpis">
              <Kpi label="TRUSTED VENDORS" value={vendors.length} icon="🏢"/>
              <Kpi label="ACTIVE POs" value={pos.filter(p=>p.status==="open").length} icon="📄"/>
              <Kpi label="PENDING REQUESTS" value={overview.pending_requests} icon="↗" accent={overview.pending_requests>0}/>
              <Kpi label="AUDITED EVENTS" value={overview.daily_activity.reduce((n,x)=>n+x.count,0)} icon="◷"/>
            </div>}
            <div className="admin-overview-grid">
              <section className="admin-card">
                <div className="admin-card-heading">
                  <div><h2>Workspace activity</h2><p>Recorded actions by day · last {days} days</p></div>
                  <span>ACTIVITY LOG</span>
                </div>
                <div className="activity-chart">
                  {(overview?.daily_activity||[]).map(d=>(
                    <div key={d.day} className="chart-day">
                      <div className="chart-bar-wrap">
                        <div className="chart-bar" style={{height:`${Math.max(6,d.count/Math.max(1,...overview.daily_activity.map(x=>x.count))*100)}%`}} title={`${d.count} actions`}/>
                      </div>
                      <span>{d.day.slice(5)}</span>
                      <small>{d.count}</small>
                    </div>
                  ))}
                  {!overview?.daily_activity.length&&<div className="chart-empty">Activity will appear as your team uses Veri-Fi.</div>}
                </div>
                <div className="role-summary">
                  {(overview?.role_counts||[]).map(r=>(
                    <div key={r.role}><span className={`role-pill ${r.role}`}>{r.role}</span><b>{r.n}</b><small>account{r.n===1?"":"s"}</small></div>
                  ))}
                </div>
              </section>

              <section className="admin-card">
                <div className="admin-card-heading">
                  <div><h2>Recent activity</h2><p>Latest recorded workspace events</p></div>
                  <button onClick={()=>setTab("users")}>Manage team →</button>
                </div>
                <Activity rows={overview?.recent_activity||[]}/>
              </section>
            </div>

            <section className="admin-card admin-queue-card">
              <div className="admin-card-heading">
                <div><h2>Needs your attention</h2><p>Employee requests waiting for approval.</p></div>
                <button onClick={()=>setTab("requests")}>Open request queue →</button>
              </div>
              {requests.filter(r=>r.status==="pending").slice(0,4).map(r=><RequestRow key={r.id} row={r} onReview={()=>{setTab("requests")}}/>)}
              {!requests.some(r=>r.status==="pending")&&<div className="admin-quiet">✓ You’re all caught up. No pending employee requests.</div>}
            </section>
          </>}

          {/* PEOPLE & ROLES */}
          {tab==="users"&&<section className="admin-card">
            <div className="admin-card-heading"><div><h2>People &amp; permissions</h2><p>Create and manage workspace accounts. Passwords are stored as Argon2id hashes.</p></div><span>{users.length} ACCOUNTS</span></div>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead><tr><th>PERSON</th><th>ROLE</th><th>DEPARTMENT</th><th>STATUS</th><th>CREATED</th><th>ACTIONS</th></tr></thead>
                <tbody>{users.map(u=>(
                  <tr key={u.id}>
                    <td><div className="user-cell"><div className="avatar">{u.name.slice(0,1).toUpperCase()}</div><div><b>{u.name}</b><small>{u.email}</small></div></div></td>
                    <td><select aria-label={`Role for ${u.name}`} value={u.role} disabled={u.id===user.id||busy} onChange={e=>act(()=>api.patch(`/admin/users/${u.id}`,{role:e.target.value}))}><option value="admin">Administrator</option><option value="employee">Employee</option></select></td>
                    <td>{u.department||"—"}</td>
                    <td><span className={`account-status ${u.active?"active":"inactive"}`}>{u.active?"Active":"Inactive"}</span></td>
                    <td>{new Date(u.created).toLocaleDateString()}</td>
                    <td><div className="row-actions">
                      <button disabled={busy||u.id===user.id} onClick={()=>act(()=>api.patch(`/admin/users/${u.id}`,{active:!u.active}))}>{u.active?"Deactivate":"Activate"}</button>
                      <button disabled={busy} onClick={()=>{setModal(`reset:${u.id}`)}}>Reset password</button>
                      {u.role==="admin"&&<button disabled={busy} onClick={()=>{if(window.confirm(`Reset authenticator setup for ${u.email}? They will need to enroll again.`))act(()=>api.post(`/admin/users/${u.id}/reset-mfa`))}}>Reset MFA</button>}
                      {u.id!==user.id&&<button className="danger-link" disabled={busy} onClick={()=>{if(window.confirm(`Delete ${u.email}? This cannot be undone.`))act(()=>api.delete(`/admin/users/${u.id}`))}}>Delete</button>}
                    </div></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </section>}

          {/* VENDOR REGISTRY (FEATURE 2) */}
          {tab==="vendors"&&<section className="admin-card">
            <div className="admin-card-heading">
              <div>
                <h2>Trusted Supplier &amp; Remittance Registry</h2>
                <p>Prevent Business Email Compromise &amp; wire fraud. Invoices specifying bank accounts differing from on-file details are automatically flagged.</p>
              </div>
              <div className="flex gap-2">
                <input type="text" placeholder="Search vendor name, tax ID..." value={vendorSearch} onChange={e=>setVendorSearch(e.target.value)} className="border border-slate-300 rounded px-2.5 py-1 text-xs"/>
                <span className="text-xs bg-slate-100 text-slate-700 px-2.5 py-1 rounded font-semibold self-center">{vendors.length} VENDORS</span>
              </div>
            </div>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead><tr><th>SUPPLIER NAME</th><th>TAX ID / EIN</th><th>BANK ACCOUNT &amp; ROUTING</th><th>IBAN / SWIFT</th><th>CATEGORY</th><th>STATUS</th><th>ACTIONS</th></tr></thead>
                <tbody>
                  {filteredVendors.map(v=>(
                    <tr key={v.id}>
                      <td><b>{v.name}</b><small className="block text-slate-500 text-xs">{v.notes||"Contracted Supplier"}</small></td>
                      <td><code className="text-xs">{v.tax_id||"—"}</code></td>
                      <td><div className="text-xs"><span>Acct: ****{v.bank_account?v.bank_account.slice(-4):"None"}</span><br/><span className="text-slate-400">ABA: {v.routing_number||"—"}</span></div></td>
                      <td><code className="text-xs text-slate-600">{v.iban?v.iban.slice(0,4)+"…"+v.iban.slice(-4):"—"}</code></td>
                      <td><span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700">{v.category||"General"}</span></td>
                      <td>
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${v.verified?"bg-emerald-100 text-emerald-800":"bg-amber-100 text-amber-800"}`}>
                          {v.verified?"✓ Verified":"⚠ On KYC Hold"}
                        </span>
                      </td>
                      <td>
                        <div className="row-actions">
                          <button disabled={busy} onClick={()=>act(()=>api.put(`/admin/vendors/${v.id}`,{...v,verified:!v.verified}))}>{v.verified?"Hold":"Verify"}</button>
                          <button className="danger-link" disabled={busy} onClick={()=>{if(window.confirm(`Delete vendor ${v.name}?`))act(()=>api.delete(`/admin/vendors/${v.id}`))}}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!filteredVendors.length&&<tr><td colSpan="7" className="text-center py-6 text-slate-500">No vendors found matching your query.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>}

          {/* 3-WAY PURCHASE ORDERS (FEATURE 3) */}
          {tab==="pos"&&<section className="admin-card">
            <div className="admin-card-heading">
              <div>
                <h2>Purchase Order (PO) 3-Way Matching Registry</h2>
                <p>Contract commitments and approved expenditure caps. Invoices with amounts exceeding POs by &gt; 5% trigger price variance alerts.</p>
              </div>
              <div className="flex gap-2">
                <input type="text" placeholder="Search PO number or vendor..." value={poSearch} onChange={e=>setPoSearch(e.target.value)} className="border border-slate-300 rounded px-2.5 py-1 text-xs"/>
                <span className="text-xs bg-slate-100 text-slate-700 px-2.5 py-1 rounded font-semibold self-center">{pos.length} POs</span>
              </div>
            </div>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead><tr><th>PO NUMBER</th><th>VENDOR</th><th>SCOPE &amp; LINE ITEMS</th><th>COMMITTED AMOUNT</th><th>STATUS</th><th>CREATED</th><th>ACTIONS</th></tr></thead>
                <tbody>
                  {filteredPos.map(p=>(
                    <tr key={p.po_number}>
                      <td><b className="font-mono text-teal-900">{p.po_number}</b></td>
                      <td>{p.vendor}</td>
                      <td><span className="text-xs text-slate-600 line-clamp-1">{p.line_items}</span></td>
                      <td><b className="text-emerald-800">${Number(p.total_amount).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</b></td>
                      <td>
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${p.status==="open"?"bg-blue-100 text-blue-800":"bg-slate-200 text-slate-700"}`}>
                          {p.status.toUpperCase()}
                        </span>
                      </td>
                      <td><span className="text-xs text-slate-500">{p.created}</span></td>
                      <td>
                        <div className="row-actions">
                          <button disabled={busy} onClick={()=>act(()=>api.put(`/admin/pos/${p.po_number}`,{...p,status:p.status==="open"?"closed":"open"}))}>{p.status==="open"?"Close PO":"Reopen"}</button>
                          <button className="danger-link" disabled={busy} onClick={()=>{if(window.confirm(`Delete PO ${p.po_number}?`))act(()=>api.delete(`/admin/pos/${p.po_number}`))}}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!filteredPos.length&&<tr><td colSpan="7" className="text-center py-6 text-slate-500">No purchase orders found.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>}

          {/* WEBHOOKS & ALERTS (FEATURE 8) */}
          {tab==="webhooks"&&<div className="space-y-6">
            <section className="admin-card">
              <div className="admin-card-heading">
                <div>
                  <h2>Outbound Webhooks &amp; Notification Dispatchers</h2>
                  <p>Send real-time JSON payloads to Slack, Microsoft Teams, or SIEM pipelines when critical wire risk or duplicate exceptions are flagged.</p>
                </div>
                <span>{webhooks.length} ENDPOINTS</span>
              </div>
              <div className="space-y-3 mt-4">
                {webhooks.map(w=>(
                  <article key={w.id} className="p-3.5 border border-slate-200 rounded-lg bg-slate-50 flex items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs bg-teal-100 text-teal-800 font-semibold px-2 py-0.5 rounded">POST</span>
                        <b className="text-sm font-mono text-slate-800">{w.url}</b>
                      </div>
                      <small className="block text-slate-500 text-xs mt-1">Events: <b>{w.events}</b> · Added {new Date(w.created).toLocaleDateString()}</small>
                    </div>
                    <div className="flex items-center gap-2">
                      <button disabled={busy} className="px-2.5 py-1 text-xs border border-teal-300 bg-white text-teal-800 rounded font-medium hover:bg-teal-50" onClick={async()=>{
                        setNotice("");setError("");
                        try{
                          const r=await api.post(`/admin/webhooks/${w.id}/test`);
                          setNotice(`Test ping returned HTTP ${r.data.status_code}: ${r.data.response}`);
                          await reload();
                        }catch(e){setError(e.response?.data?.detail||"Webhook ping failed.");}
                      }}>⚡ Test Ping</button>
                      <button disabled={busy} className="danger-link text-xs" onClick={()=>{if(window.confirm("Remove this webhook?"))act(()=>api.delete(`/admin/webhooks/${w.id}`))}}>Remove</button>
                    </div>
                  </article>
                ))}
                {!webhooks.length&&<div className="admin-quiet">No outbound webhooks configured. Register a Slack or custom URL to receive automated alerts.</div>}
              </div>
            </section>

            <section className="admin-card">
              <div className="admin-card-heading">
                <div><h2>Webhook Dispatch Log</h2><p>Latest outbound notification attempts and server HTTP statuses.</p></div>
                <span>RECENT LOGS</span>
              </div>
              <div className="admin-table-wrap">
                <table className="admin-table text-xs">
                  <thead><tr><th>TIMESTAMP</th><th>EVENT</th><th>STATUS</th><th>RESPONSE</th></tr></thead>
                  <tbody>
                    {webhookLogs.map(l=>(
                      <tr key={l.id}>
                        <td>{new Date(l.created).toLocaleTimeString()} · {new Date(l.created).toLocaleDateString()}</td>
                        <td><span className="font-mono font-semibold text-slate-700">{l.event}</span></td>
                        <td><span className={`px-2 py-0.5 rounded font-mono font-semibold ${l.status_code>=200&&l.status_code<300?"bg-emerald-100 text-emerald-800":"bg-red-100 text-red-800"}`}>{l.status_code}</span></td>
                        <td><span className="font-mono text-slate-600 line-clamp-1">{l.response}</span></td>
                      </tr>
                    ))}
                    {!webhookLogs.length&&<tr><td colSpan="4" className="text-center py-4 text-slate-500">No webhook delivery logs recorded yet.</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          </div>}

          {/* EMPLOYEE REQUESTS */}
          {tab==="requests"&&<section className="admin-card">
            <div className="admin-card-heading"><div><h2>Employee support queue</h2><p>Review and update expense and policy submissions. Employees can only see their own requests.</p></div><span>{requests.filter(r=>r.status==="pending").length} PENDING</span></div>
            <div className="admin-requests">{requests.map(r=><AdminRequest key={r.id} row={r} busy={busy} onChange={(status,note)=>act(()=>api.patch(`/admin/requests/${r.id}`,{status,note}))}/>)}{!requests.length&&<div className="admin-quiet">No employee requests have been submitted yet.</div>}</div>
          </section>}

          {/* SHARED RESOURCES */}
          {tab==="resources"&&<section className="admin-card">
            <div className="admin-card-heading"><div><h2>Shared resources</h2><p>Publish useful guides and links to the employee workspace.</p></div><span>{resources.length} RESOURCES</span></div>
            <div className="admin-resources">{resources.map(r=><article key={r.id}><span className="quick-icon purple">▤</span><div><b>{r.title}</b><p>{r.description||"No description"}</p><small>Visible to {r.audience} · {r.url||"No link"}</small></div><button className="danger-link" disabled={busy} onClick={()=>{if(window.confirm(`Remove resource “${r.title}”?`))act(()=>api.delete(`/admin/resources/${r.id}`))}}>Remove</button></article>)}</div>
          </section>}

          {/* ACCESS CONTROLS */}
          {tab==="access"&&<section className="admin-card">
            <div className="admin-card-heading"><div><h2>Role-based access</h2><p>Choose which employee workspace features are available to each role.</p></div><span>SERVER ENFORCED</span></div>
            <div className="access-table">
              <div className="access-head"><span>FEATURE</span><span>ADMINISTRATOR</span><span>EMPLOYEE</span></div>
              {[...new Set(access.map(x=>x.feature))].map(feature=><div className="access-row" key={feature}>
                <div><b>{featureLabel(feature)}</b><small>{featureDescription(feature)}</small></div>
                {["admin","employee"].map(role=>{
                  const x=access.find(a=>a.role===role&&a.feature===feature),locked=role==="admin"||busy||(role==="employee"&&!['employee_requests','resources'].includes(feature));
                  return <label key={role} className="switch-label"><input type="checkbox" checked={Boolean(x?.enabled)} disabled={locked} onChange={e=>act(()=>api.put("/admin/access",{role,feature,enabled:e.target.checked}))}/><span className="switch-track"/><small>{locked&&role==="employee"?"Admin only":x?.enabled?"Enabled":"Disabled"}</small></label>
                })}
              </div>)}
            </div>
            <div className="access-note">Employee access can be changed for requests and shared resources. Invoice screening, policy, audit, and account controls stay administrator-only. Changes take effect immediately.</div>
          </section>}

        </main>
      </div>

      {modal&&<Modal type={modal} busy={busy} onClose={()=>setModal("")} onSubmit={async data=>{
        const [kind,id]=modal.split(":");
        await act(async()=>{
          if(kind==="user")await api.post("/admin/users",data);
          else if(kind==="vendor")await api.post("/admin/vendors",data);
          else if(kind==="po")await api.post("/admin/pos",data);
          else if(kind==="webhook")await api.post("/admin/webhooks",data);
          else if(kind==="resource")await api.post("/admin/resources",data);
          else await api.post(`/admin/users/${id}/reset-password`,data);
        });
        setModal("");
      }}/>}
    </div>
  );
}

function Kpi({label,value,icon,accent}){return <div className={`admin-kpi ${accent?"attention":""}`}><div><span>{label}</span><b>{value??"—"}</b></div><i>{icon}</i></div>}
function Activity({rows}){if(!rows.length)return <div className="admin-quiet">No activity recorded yet.</div>;return <div className="activity-list">{rows.map((x,i)=><div key={i}><span className="activity-icon">{x.decision==="LOGIN_FAILED"?"!":"✓"}</span><div><b>{humanAction(x.decision)}</b><small>{x.detail||x.actor}</small></div><time>{x.ts?new Date(x.ts.endsWith("Z")?x.ts:`${x.ts.replace(" ","T")}Z`).toLocaleString():""}</time></div>)}</div>}
function RequestRow({row,onReview}){return <button className="overview-request" onClick={onReview}><span className="request-dot">↗</span><span><b>{row.title}</b><small>{row.employee_name} · {row.kind}</small></span><span className="request-status pending">pending</span></button>}
function AdminRequest({row,busy,onChange}){
  const [note,setNote]=useState(row.review_note||"");
  return (
    <article className="admin-request">
      <div className="request-dot">↗</div>
      <div className="admin-request-body">
        <div className="admin-request-meta">
          <div>
            <h3>{row.title}</h3>
            <span>{row.employee_name} · {row.employee_email} · {row.kind}</span>
          </div>
          <span className={`request-status ${row.status}`}>{row.status.replace("_"," ")}</span>
        </div>
        <p>{row.description}</p>
        {row.amount>0&&<div className="text-xs font-semibold text-emerald-800 mt-1">Amount: ${Number(row.amount).toLocaleString(undefined,{minimumFractionDigits:2})}{row.receipt_name&&<span className="ml-2 font-normal text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded border border-teal-200">📎 {row.receipt_name}</span>}</div>}
        <small>Submitted {new Date(row.created).toLocaleString()}</small>
        {row.status!=="approved"&&row.status!=="rejected"&&<div className="admin-review-controls">
          <input value={note} onChange={e=>setNote(e.target.value)} placeholder="Optional note for the employee"/>
          <button disabled={busy} onClick={()=>onChange("in_progress",note)}>Mark in progress</button>
          <button className="approve-button" disabled={busy} onClick={()=>onChange("approved",note)}>Approve</button>
          <button className="reject-button" disabled={busy} onClick={()=>onChange("rejected",note)}>Decline</button>
        </div>}
        {row.status==="approved"||row.status==="rejected"?<div className="request-note">Reviewed by {row.reviewer}{note&&`: ${note}`}{row.review_note&&`: ${row.review_note}`}</div>:null}
      </div>
    </article>
  );
}

function Modal({type,busy,onClose,onSubmit}){
  const [form,setForm]=useState({email:"",name:"",role:"employee",department:"",password:"",title:"",description:"",url:"",audience:"all",tax_id:"",bank_account:"",routing_number:"",iban:"",category:"General",verified:true,notes:"",po_number:"",vendor:"",line_items:"",total_amount:0,status:"open",events:"ALL_FLAGS",secret:""}),[error,setError]=useState("");
  const [kind]=type.split(":");
  const title=kind==="user"?"Create workspace account":kind==="vendor"?"Register trusted vendor":kind==="po"?"Create purchase order":kind==="webhook"?"Register outbound webhook":kind==="resource"?"Share a resource":"Set temporary password";
  
  const submit=async e=>{
    e.preventDefault();setError("");
    try{
      if(kind==="user")await onSubmit({email:form.email,name:form.name,role:form.role,department:form.department,password:form.password});
      else if(kind==="vendor")await onSubmit({name:form.name,tax_id:form.tax_id,bank_account:form.bank_account,routing_number:form.routing_number,iban:form.iban,category:form.category,verified:form.verified,notes:form.notes});
      else if(kind==="po")await onSubmit({po_number:form.po_number,vendor:form.vendor,line_items:form.line_items,total_amount:parseFloat(form.total_amount)||0,status:form.status});
      else if(kind==="webhook")await onSubmit({url:form.url,events:form.events,secret:form.secret,enabled:true});
      else if(kind==="resource")await onSubmit({title:form.title,description:form.description,url:form.url,audience:form.audience});
      else await onSubmit({password:form.password});
    }catch(e){
      setError(e.response?.data?.detail||"Could not save.");
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
      <form className="admin-modal" onSubmit={submit}>
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close">×</button>
        <div className="eyebrow">ADMINISTRATION</div>
        <h2>{title}</h2>
        {error&&<div className="auth-error">{error}</div>}

        {kind==="user"&&<>
          <label>Full name<input required minLength="2" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>
          <label>Work email<input required type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label>
          <div className="modal-split">
            <label>Role<select value={form.role} onChange={e=>setForm({...form,role:e.target.value})}><option value="employee">Employee</option><option value="admin">Administrator</option></select></label>
            <label>Department<input value={form.department} onChange={e=>setForm({...form,department:e.target.value})}/></label>
          </div>
          <label>Initial password <small>At least 12 characters; share it securely.</small><input required minLength="12" type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/></label>
        </>}

        {kind==="vendor"&&<>
          <label>Vendor legal name<input required minLength="2" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="e.g. Apex Global Logistics Inc."/></label>
          <div className="modal-split">
            <label>Tax ID / EIN<input value={form.tax_id} onChange={e=>setForm({...form,tax_id:e.target.value})} placeholder="e.g. 12-3456789"/></label>
            <label>Expense category<input value={form.category} onChange={e=>setForm({...form,category:e.target.value})} placeholder="e.g. Logistics"/></label>
          </div>
          <div className="modal-split">
            <label>Bank account number<input value={form.bank_account} onChange={e=>setForm({...form,bank_account:e.target.value})} placeholder="e.g. 48219034"/></label>
            <label>Routing / ABA number<input value={form.routing_number} onChange={e=>setForm({...form,routing_number:e.target.value})} placeholder="e.g. 021000021"/></label>
          </div>
          <label>IBAN / SWIFT code <small>For cross-border wire transfers</small><input value={form.iban} onChange={e=>setForm({...form,iban:e.target.value})} placeholder="e.g. US89CHAS02100002148219034"/></label>
          <label>Notes &amp; payment instructions<input value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="e.g. Tier-1 master service agreement"/></label>
          <label className="flex items-center gap-2 mt-2"><input type="checkbox" checked={form.verified} onChange={e=>setForm({...form,verified:e.target.checked})}/> <span className="text-sm font-medium">Verify vendor for immediate payment approval</span></label>
        </>}

        {kind==="po"&&<>
          <div className="modal-split">
            <label>PO number<input required minLength="3" value={form.po_number} onChange={e=>setForm({...form,po_number:e.target.value})} placeholder="e.g. PO-2026-009"/></label>
            <label>Vendor name<input required minLength="2" value={form.vendor} onChange={e=>setForm({...form,vendor:e.target.value})} placeholder="e.g. CloudNine Software"/></label>
          </div>
          <div className="modal-split">
            <label>Committed total ($)<input required type="number" step="0.01" value={form.total_amount} onChange={e=>setForm({...form,total_amount:e.target.value})} placeholder="e.g. 5000.00"/></label>
            <label>Status<select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}><option value="open">Open</option><option value="closed">Closed</option></select></label>
          </div>
          <label>Scope / Line items description<input value={form.line_items} onChange={e=>setForm({...form,line_items:e.target.value})} placeholder="e.g. Annual Cloud Infrastructure Licenses"/></label>
        </>}

        {kind==="webhook"&&<>
          <label>Webhook URL <small>Slack Incoming Webhook, Microsoft Teams Connector, or API URL</small><input required type="url" value={form.url} onChange={e=>setForm({...form,url:e.target.value})} placeholder="https://hooks.slack.com/services/…"/></label>
          <label>Subscribed events<select value={form.events} onChange={e=>setForm({...form,events:e.target.value})}><option value="ALL_FLAGS">All Flagged Exceptions</option><option value="CRITICAL_FRAUD">Critical Wire &amp; Duplicate Fraud Only</option></select></label>
        </>}

        {kind==="resource"&&<>
          <label>Resource title<input required value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></label>
          <label>Description<input value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label>
          <label>Link<input type="url" value={form.url} onChange={e=>setForm({...form,url:e.target.value})} placeholder="https://…"/></label>
          <label>Share with<select value={form.audience} onChange={e=>setForm({...form,audience:e.target.value})}><option value="all">Everyone</option><option value="employee">Employees</option><option value="admin">Administrators</option></select></label>
        </>}

        {kind==="reset"&&<label>Temporary password <small>At least 12 characters. Their existing sessions will be signed out.</small><input required minLength="12" type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/></label>}

        <div className="modal-actions">
          <button type="button" onClick={onClose}>Cancel</button>
          <button className="admin-primary" disabled={busy}>{busy?"Saving…":kind==="reset"?"Reset password":"Save"}</button>
        </div>
      </form>
    </div>
  );
}

function featureLabel(f){return({invoice_review:"Invoice review workspace",policy_limits:"Policy and spending limits",audit_log:"Activity and audit logs",user_management:"Account and role management",employee_requests:"Employee request center",resources:"Shared company resources"}[f]||f)}
function featureDescription(f){return({invoice_review:"Screen invoices, review exceptions, and record decisions.",policy_limits:"View and update the finance policy thresholds.",audit_log:"See recorded workspace and reviewer events.",user_management:"Create accounts and manage roles.",employee_requests:"Submit finance support requests.",resources:"Open guides and company links."}[f]||"")}
function humanAction(action=""){return action.replaceAll("_"," ").toLowerCase().replace(/\b\w/g,c=>c.toUpperCase())}
