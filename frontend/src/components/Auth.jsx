import {useEffect, useState} from "react";
import api from "../api";
import {documentText, parseInvoiceText} from "./OCRIntake";

export function SignIn({onSignedIn, dark, onToggleDark}) {
  const [mode,setMode]=useState("signin"); // "signin" | "signup"
  const [email,setEmail]=useState("admin@verifi.local"),[password,setPassword]=useState("VeriFiAdmin!2026"),[otp,setOtp]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false),[show,setShow]=useState(false);
  const [regName,setRegName]=useState(""),[regEmail,setRegEmail]=useState(""),[regDept,setRegDept]=useState("Operations"),[regPassword,setRegPassword]=useState(""),[regShow,setRegShow]=useState(false);

  useEffect(()=>{api.get("/auth/csrf").catch(()=>{})},[]);

  const submitLogin=async e=>{
    e.preventDefault();setBusy(true);setError("");
    try{
      const {data}=await api.post("/auth/login",{email,password,otp});
      onSignedIn(data.user);
    }catch(e){
      setError(e.response?.data?.detail||"Unable to sign in. Check your connection and try again.");
    }finally{
      setBusy(false);
    }
  };

  const submitRegister=async e=>{
    e.preventDefault();setBusy(true);setError("");
    try{
      const {data}=await api.post("/auth/register",{name:regName.trim(),email:regEmail.trim(),department:regDept.trim(),password:regPassword});
      onSignedIn(data.user);
    }catch(e){
      setError(e.response?.data?.detail||"Unable to create employee account. Check your details and try again.");
    }finally{
      setBusy(false);
    }
  };

  return <main className="auth-screen">
    <section className="auth-aside">
      <div className="auth-brand"><span>✳</span><div><b>Veri-Fi</b><small>FINANCE WORKSPACE</small></div></div>
      <div className="auth-story">
        <div className="eyebrow">BUILT FOR TRUSTED FINANCE TEAMS</div>
        <h1>Every invoice,<br/>accountable.</h1>
        <p>One workspace for faster invoice screening, thoughtful employee support, and a complete decision trail.</p>
        <div className="auth-points">
          <span><i>✓</i> Exceptions explained with evidence</span>
          <span><i>✓</i> Human decisions recorded for audit</span>
          <span><i>✓</i> Access matched to each role</span>
        </div>
      </div>
      <div className="auth-aside-foot">SECURE · EXPLAINABLE · HUMAN-LED</div>
    </section>

    <section className="auth-main">
      <div className="auth-card relative">
        <div className="flex items-center justify-between mb-3">
          <div className="auth-mobile-brand">✳ <b>Veri-Fi</b></div>
          {onToggleDark && (
            <button
              type="button"
              onClick={onToggleDark}
              className="ml-auto px-2.5 py-1 text-xs rounded-md border border-slate-200 hover:bg-slate-100 flex items-center gap-1 text-slate-600 cursor-pointer"
              title="Toggle theme"
            >
              <span>{dark ? "☀" : "☾"}</span>
              <span>{dark ? "Light" : "Dark"}</span>
            </button>
          )}
        </div>

        {/* Tab switch between Sign In and Employee Sign Up */}
        <div className="auth-mode-toggle" role="tablist">
          <button type="button" role="tab" aria-selected={mode==="signin"} className={mode==="signin"?"active":""} onClick={()=>{setMode("signin");setError("");}}>Sign in</button>
          <button type="button" role="tab" aria-selected={mode==="signup"} className={mode==="signup"?"active":""} onClick={()=>{setMode("signup");setError("");}}>Employee sign up</button>
        </div>

        {error&&<div className="auth-error" role="alert">{error}</div>}

        {mode==="signin" ? (
          <form onSubmit={submitLogin}>
            <div className="eyebrow">WELCOME BACK</div>
            <h2>Sign in to Veri-Fi</h2>
            <p className="auth-subtitle">Use your workspace account to continue.</p>
            <label>Email address<input autoComplete="username" type="email" value={email} onChange={e=>setEmail(e.target.value)} required/></label>
            <label>Password<div className="password-wrap"><input autoComplete="current-password" type={show?"text":"password"} value={password} onChange={e=>setPassword(e.target.value)} required/><button type="button" onClick={()=>setShow(!show)}>{show?"Hide":"Show"}</button></div></label>
            <label>Authenticator code <small>Required after admin verification setup</small><input inputMode="numeric" autoComplete="one-time-code" maxLength="8" value={otp} onChange={e=>setOtp(e.target.value.replace(/\D/g,""))} placeholder="6-digit code (employees leave blank)"/></label>
            <button disabled={busy} className="auth-submit">{busy?"Signing in…":"Sign in securely"}<span>→</span></button>
            <button type="button" className="auth-secondary-btn" onClick={()=>{setMode("signup");setError("");}}><span>+</span> Sign up as Employee</button>
            <div className="auth-lock"><span>▣</span> Protected session · signs out after 8 hours</div>
            <details className="demo-login">
              <summary>Demo sign-in details</summary>
              <p><b>Admin</b> · admin@verifi.local<br/>Password · VeriFiAdmin!2026<br/>First admin sign-in asks you to enroll an authenticator app.</p>
              <p><b>Employee</b> · employee@verifi.local<br/>Password · VeriFiEmployee!2026</p>
              <small>Demo accounts are for local showcase use. Set VERIFI_ADMIN_PASSWORD and VERIFI_EMPLOYEE_PASSWORD before a public deployment.</small>
            </details>
          </form>
        ) : (
          <form onSubmit={submitRegister}>
            <div className="eyebrow">EMPLOYEE ONBOARDING</div>
            <h2>Create employee account</h2>
            <p className="auth-subtitle">Register to submit expense claims and access finance resources.</p>
            <label>Full name<input type="text" value={regName} onChange={e=>setRegName(e.target.value)} placeholder="e.g. Alex Morgan" required minLength={2}/></label>
            <label>Department
              <select value={regDept} onChange={e=>setRegDept(e.target.value)} className="w-full min-h-[44px] px-3 py-2 text-sm border border-[#d5e1e3] rounded-[9px] bg-white">
                <option value="Operations">Operations</option>
                <option value="Finance">Finance</option>
                <option value="Engineering">Engineering</option>
                <option value="Marketing">Marketing</option>
                <option value="Sales">Sales</option>
                <option value="Human Resources">Human Resources</option>
                <option value="Product">Product</option>
                <option value="Customer Support">Customer Support</option>
              </select>
            </label>
            <label>Work email address<input type="email" value={regEmail} onChange={e=>setRegEmail(e.target.value)} placeholder="e.g. alex@company.com" required/></label>
            <label>Password <small>Minimum 8 characters</small>
              <div className="password-wrap">
                <input type={regShow?"text":"password"} value={regPassword} onChange={e=>setRegPassword(e.target.value)} required minLength={8} placeholder="Create a secure password"/>
                <button type="button" onClick={()=>setRegShow(!regShow)}>{regShow?"Hide":"Show"}</button>
              </div>
            </label>
            <button disabled={busy} className="auth-submit">{busy?"Creating account…":"Register & sign in"}<span>→</span></button>
            <div className="auth-switch-link">
              <span>Already have an employee account?</span>
              <button type="button" onClick={()=>{setMode("signin");setError("");}}>Sign in here</button>
            </div>
            <div className="auth-lock mt-3"><span>▣</span> Immediate access to Employee Workspace</div>
          </form>
        )}
      </div>
      <div className="auth-copyright">VERI-FI · INVOICE &amp; EXPENSE CONTROL</div>
    </section>
  </main>;
}

export function EmployeePortal({user,onLogout,onUserUpdated,dark,onToggleDark}) {
  const [tab,setTab]=useState("home"),[requests,setRequests]=useState([]),[resources,setResources]=useState([]),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState(""),[form,setForm]=useState({kind:"Expense reimbursement",title:"",description:"",amount:0,vendor:"",receipt_name:""}),[profile,setProfile]=useState({name:user.name,department:user.department,current_password:"",new_password:""});
  const [scanProgress,setScanProgress]=useState(null),[scannedFile,setScannedFile]=useState(""),[scannedInfo,setScannedInfo]=useState(null),[scanning,setScanning]=useState(false);
  const refresh=async()=>{setError("");try{const [r,d]=await Promise.all([api.get("/employee/requests"),api.get("/employee/resources")]);setRequests(r.data);setResources(d.data)}catch(e){setError(e.response?.data?.detail||"Could not load your workspace.")}};
  useEffect(()=>{refresh()},[]);

  const handleReceiptUpload=async e=>{
    const file=e.target.files?.[0];
    if(!file)return;
    setScanning(true);setScanProgress({label:"Loading in-browser OCR…",percent:0});setError("");setMessage("");
    try{
      const res=await documentText(file,setScanProgress);
      const parsed=parseInvoiceText(res.text);
      const f=parsed.fields;
      const amt=f.amount?parseFloat(f.amount):0.0;
      const vendorName=f.vendor||"Merchant";
      setScannedFile(file.name);
      setScannedInfo({vendor:vendorName,amount:amt,date:f.date,category:f.category});
      setForm(prev=>({
        ...prev,
        kind:"Expense reimbursement",
        title:`[Reimbursement] ${vendorName}${amt>0?` - $${amt.toFixed(2)}`:""}`,
        description:`Expense reimbursement for ${vendorName}${f.date?` on ${f.date}`:""}.\nCategory: ${f.category||"General Business"}.\nAttached receipt: ${file.name} (OCR confidence: ${res.confidence||94}%).`,
        amount:amt,
        vendor:vendorName,
        receipt_name:file.name
      }));
      setMessage(`Receipt recognized! Auto-filled $${amt>0?amt.toFixed(2):"0.00"} from ${vendorName}. Review and submit.`);
    }catch(err){
      setError(err.message||"Could not read receipt document. You can still fill details manually.");
    }finally{
      setScanning(false);setScanProgress(null);e.target.value="";
    }
  };

  const submit=async e=>{
    e.preventDefault();setBusy(true);setMessage("");setError("");
    try{
      await api.post("/employee/requests",form);
      setForm({kind:"Expense reimbursement",title:"",description:"",amount:0,vendor:"",receipt_name:""});
      setScannedInfo(null);setScannedFile("");
      setMessage("Your reimbursement request was submitted to Finance.");
      await refresh();
    }catch(e){
      setError(e.response?.data?.detail||"Request could not be submitted.");
    }finally{
      setBusy(false);
    }
  };

  const saveProfile=async e=>{e.preventDefault();setBusy(true);setError("");setMessage("");try{const {data}=await api.put("/employee/profile",profile);onUserUpdated(data.user);setProfile({...profile,name:data.user.name,department:data.user.department,current_password:"",new_password:""});setMessage(data.password_changed?"Profile and password updated. Please sign in again.":"Profile updated successfully.");if(data.password_changed)await onLogout()}catch(e){setError(e.response?.data?.detail||"Profile could not be updated.")}finally{setBusy(false)}};
  return <div className="portal-shell"><aside className="portal-sidebar"><div className="portal-brand"><span>✳</span><div><b>Veri-Fi</b><small>EMPLOYEE SPACE</small></div></div><div className="portal-nav-label">YOUR WORKSPACE</div><nav>{[["home","Overview","⌂"],["requests","My requests","↗"],["resources","Resources","▤"],["profile","My profile","○"]].map(([id,label,icon])=> <button key={id} className={tab===id?"selected":""} onClick={()=>{setTab(id);setMessage("");setError("")}}><span>{icon}</span>{label}{id==="requests"&&requests.some(r=>r.status==="pending")&&<i>{requests.filter(r=>r.status==="pending").length}</i>}</button>)}</nav><div className="portal-user"><div className="avatar">{user.name.slice(0,1).toUpperCase()}</div><div className="portal-user-text"><b>{user.name}</b><small>{user.role} · {user.department||"Team member"}</small></div><button title="Sign out" onClick={onLogout}>↪</button></div></aside><main className="portal-main"><header className="portal-header"><div><div className="eyebrow">EMPLOYEE WORKSPACE</div><h1>{tab==="home"?`Good to see you, ${user.name.split(" ")[0]}`:({requests:"My requests",resources:"Company resources",profile:"Your profile"}[tab])}</h1><p>Access your information and get support from Finance.</p></div><div className="flex items-center gap-2">{onToggleDark&&<button className="portal-signout" onClick={onToggleDark} title="Toggle theme"><span>{dark?"☀ Light":"☾ Dark"}</span></button>}<button className="portal-signout" onClick={onLogout}>Sign out <span>↗</span></button></div></header>{error&&<div className="portal-alert error" role="alert">{error}</div>}{message&&<div className="portal-alert success" role="status">✓ {message}</div>}
    {tab==="home"&&<><section className="employee-welcome"><div><span className="eyebrow">YOUR FINANCE HUB</span><h2>How can we help today?</h2><p>Submit a request, scan a receipt for instant auto-fill, or find a company resource.</p></div><div className="welcome-orbit">✳</div></section><div className="employee-stats"><button onClick={()=>setTab("requests")}><span>OPEN REQUESTS</span><b>{requests.filter(r=>["pending","in_progress"].includes(r.status)).length}</b><small>Being handled by Finance →</small></button><button onClick={()=>setTab("requests")}><span>COMPLETED</span><b>{requests.filter(r=>["approved","rejected"].includes(r.status)).length}</b><small>Reviewed requests →</small></button><button onClick={()=>setTab("resources")}><span>RESOURCES</span><b>{resources.length}</b><small>Guides and useful links →</small></button></div><div className="portal-section-heading"><div><h2>Quick actions</h2><p>Everything you need, in one place.</p></div></div><div className="quick-action-grid"><button onClick={()=>setTab("requests")}><span className="quick-icon teal">↗</span><b>Submit a request</b><small>Scan receipt or ask for reimbursement</small><i>Start request →</i></button><button onClick={()=>setTab("resources")}><span className="quick-icon purple">▤</span><b>Browse resources</b><small>Read policies and helpful guides</small><i>Explore resources →</i></button><button onClick={()=>setTab("profile")}><span className="quick-icon amber">○</span><b>Update your profile</b><small>Keep your contact and team details current</small><i>View profile →</i></button></div><div className="portal-section-heading"><div><h2>Recent activity</h2><p>The latest updates to your requests.</p></div><button onClick={()=>setTab("requests")}>View all →</button></div><RequestList requests={requests.slice(0,3)}/></>}
    {tab==="requests"&&<div className="employee-columns"><section className="portal-card"><div className="portal-section-heading"><div><h2>Submit a request</h2><p>Scan a receipt for instant auto-fill, or enter manually.</p></div></div>
      <div className="mb-4 p-3.5 rounded-xl border border-dashed border-teal-300 bg-teal-50/50 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">📷</span>
            <div>
              <b className="text-xs text-teal-900 block font-semibold">Scan & Auto-fill Receipt</b>
              <small className="text-[11px] text-teal-700">Upload receipt photo or PDF to auto-fill amount & details</small>
            </div>
          </div>
          <label className="cursor-pointer px-3 py-1.5 text-xs font-semibold rounded-lg bg-teal-700 text-white hover:bg-teal-800 transition-colors shadow-xs">
            {scanning?"Reading…":"Choose Receipt"}
            <input type="file" accept="image/*,.pdf" className="hidden" disabled={scanning} onChange={handleReceiptUpload}/>
          </label>
        </div>
        {scanProgress&&<div className="text-xs text-teal-800 flex items-center gap-2"><span className="animate-spin text-sm">⏳</span><span>{scanProgress.label} ({scanProgress.percent}%)</span></div>}
        {scannedInfo&&<div className="text-[11px] bg-white border border-teal-200 rounded-lg p-2 text-teal-900 flex items-center justify-between"><span>✓ Extracted: <b>{scannedInfo.vendor}</b> · <b>${scannedInfo.amount}</b> {scannedInfo.date?`(${scannedInfo.date})`:""}</span><small className="text-slate-400">{scannedFile}</small></div>}
      </div>
      <form className="portal-form" onSubmit={submit}>
        <label>Request type<select value={form.kind} onChange={e=>setForm({...form,kind:e.target.value})}>{["Expense reimbursement","Invoice question","Policy clarification","Access request","Other"].map(x=><option key={x}>{x}</option>)}</select></label>
        <label>Subject<input required minLength="3" value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="A short summary"/></label>
        <div className="grid grid-cols-2 gap-2">
          <label>Amount ($)<input type="number" step="0.01" min="0" value={form.amount||""} onChange={e=>setForm({...form,amount:parseFloat(e.target.value)||0})} placeholder="0.00"/></label>
          <label>Merchant / Vendor<input value={form.vendor||""} onChange={e=>setForm({...form,vendor:e.target.value})} placeholder="e.g. Uber, Delta, Staples"/></label>
        </div>
        <label>Details<textarea required minLength="5" rows="4" value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Include the context Finance needs to help you."/></label>
        <button className="portal-primary" disabled={busy||scanning}>{busy?"Sending…":"Submit to Finance →"}</button>
      </form></section>
      <section><div className="portal-section-heading"><div><h2>Request history</h2><p>Follow the progress of every request.</p></div></div><RequestList requests={requests}/></section></div>}
    {tab==="resources"&&<><div className="portal-section-heading"><div><h2>Helpful information</h2><p>Company policies and guides for your finance tasks.</p></div></div><div className="resource-grid">{resources.map(r=><article className="resource-card" key={r.id}><span className="quick-icon purple">▤</span><h3>{r.title}</h3><p>{r.description}</p>{r.url?<a href={r.url} target="_blank" rel="noreferrer">Open resource ↗</a>:<small className="resource-shared-label">Shared by your Finance team</small>}</article>)}{!resources.length&&<div className="portal-card">No resources have been shared with your role yet.</div>}</div></>}
    {tab==="profile"&&<section className="portal-card profile-card"><div className="portal-section-heading"><div><h2>Personal information</h2><p>Your information is visible to you and authorized administrators.</p></div></div><form className="portal-form profile-form" onSubmit={saveProfile}><div className="profile-identity"><div className="avatar large">{profile.name.slice(0,1).toUpperCase()}</div><div><b>{user.email}</b><small>{user.role} account</small></div></div><label>Full name<input required minLength="2" value={profile.name} onChange={e=>setProfile({...profile,name:e.target.value})}/></label><label>Department<input value={profile.department} onChange={e=>setProfile({...profile,department:e.target.value})}/></label><label>Current password <small>Confirm changes with your password</small><input required type="password" autoComplete="current-password" value={profile.current_password} onChange={e=>setProfile({...profile,current_password:e.target.value})}/></label><label>New password <small>Optional · minimum 12 characters</small><input minLength="12" type="password" autoComplete="new-password" value={profile.new_password} onChange={e=>setProfile({...profile,new_password:e.target.value})}/></label><button className="portal-primary" disabled={busy}>Save changes</button></form></section>}
  </main></div>;
}

function RequestList({requests}){if(!requests.length)return <div className="request-empty"><span>✳</span><b>No requests yet</b><small>Requests you send to Finance will appear here.</small></div>;return <div className="request-list">{requests.map(r=><article key={r.id}><div className="request-dot">↗</div><div className="request-copy"><b>{r.title}</b><small>{r.kind} · {new Date(r.created).toLocaleDateString()}{r.vendor?` · ${r.vendor}`:""}</small>{r.amount>0&&<div className="text-xs font-semibold text-emerald-800 mt-0.5">${Number(r.amount).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}{r.receipt_name&&<span className="ml-2 font-normal text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded border border-teal-200">📎 {r.receipt_name}</span>}</div>}{r.review_note&&<p>{r.review_note}</p>}</div><span className={`request-status ${r.status}`}>{r.status.replace("_"," ")}</span></article>)}</div>}

export function MfaSetup({user,onEnabled,onLogout}) {
  const [setup,setSetup]=useState(null),[code,setCode]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
  useEffect(()=>{api.post("/auth/mfa/setup").then(r=>setSetup(r.data)).catch(e=>setError(e.response?.data?.detail||"Could not start authenticator setup."))},[]);
  const confirm=async e=>{e.preventDefault();setBusy(true);setError("");try{const {data}=await api.post("/auth/mfa/confirm",{code});onEnabled(data.user)}catch(e){setError(e.response?.data?.detail||"That code could not be verified.")}finally{setBusy(false)}};
  return <main className="mfa-screen"><section className="mfa-card"><div className="quick-icon teal">▣</div><div className="eyebrow">ADMIN ACCOUNT PROTECTION</div><h1>Set up two-step verification</h1><p>Before opening the administrator workspace, connect an authenticator app such as Microsoft Authenticator, Google Authenticator, or 1Password.</p><ol><li>In the app, choose <b>Add account</b> or <b>Enter setup key</b>.</li><li>Enter this Veri-Fi account and the setup key below.</li><li>Enter the current 6-digit code to confirm.</li></ol>{setup&&<div className="secret-box"><small>YOUR ONE-TIME SETUP KEY</small><code>{setup.secret}</code><button type="button" onClick={()=>navigator.clipboard?.writeText(setup.secret)}>Copy setup key</button><small>Keep this key private. Do not share it.</small></div>}{error&&<div className="auth-error" role="alert">{error}</div>}<form onSubmit={confirm}><label>Authenticator code<input autoComplete="one-time-code" inputMode="numeric" maxLength="8" value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,""))} placeholder="6-digit code" required/></label><button className="auth-submit" disabled={busy||!setup}>{busy?"Verifying…":"Verify and secure admin account →"}</button></form><button className="mfa-signout" onClick={onLogout}>Sign out</button><small className="mfa-account">Signed in as {user.email}</small></section></main>;
}
