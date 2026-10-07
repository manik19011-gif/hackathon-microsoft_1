import { useEffect, useState } from "react";
import api from "../api";
import { documentText, parseInvoiceText } from "./OCRIntake";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";
import { 
  ShieldCheck, 
  Lock, 
  ArrowRight, 
  User, 
  Sparkles, 
  Camera, 
  FileText, 
  Sun, 
  Moon, 
  CheckCircle2, 
  AlertCircle,
  LogOut,
  Building,
  KeyRound
} from "lucide-react";

export function SignIn({ onSignedIn, dark, onToggleDark }) {
  const [mode, setMode] = useState("signin"); // "signin" | "signup"
  const [email, setEmail] = useState("admin@verifi.local");
  const [password, setPassword] = useState("VeriFiAdmin!2026");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);

  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regDept, setRegDept] = useState("Operations");
  const [regPassword, setRegPassword] = useState("");
  const [regShow, setRegShow] = useState(false);

  useEffect(() => {
    api.get("/auth/csrf").catch(() => {});
  }, []);

  const submitLogin = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post("/auth/login", { email, password, otp });
      onSignedIn(data.user);
    } catch (err) {
      setError(err.response?.data?.detail || "Unable to sign in. Check your credentials.");
    } finally {
      setBusy(false);
    }
  };

  const submitRegister = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post("/auth/register", {
        name: regName.trim(),
        email: regEmail.trim(),
        department: regDept.trim(),
        password: regPassword,
      });
      onSignedIn(data.user);
    } catch (err) {
      setError(err.response?.data?.detail || "Unable to create employee account.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen grid lg:grid-cols-2 bg-background text-foreground">
      {/* Brand & Value Proposition Column */}
      <section className="relative hidden lg:flex flex-col justify-between p-12 bg-sidebar text-sidebar-foreground border-r border-sidebar-border overflow-hidden">
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary text-primary-foreground grid place-items-center font-bold text-lg shadow-sm">
            ✳
          </div>
          <div>
            <h2 className="font-bold tracking-tight text-lg leading-tight">Veri-Fi</h2>
            <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Autonomous AP Guardian</p>
          </div>
        </div>

        <div className="relative z-10 max-w-lg my-auto space-y-6">
          <Badge variant="outline" className="border-primary/40 text-primary bg-primary/10 gap-1.5 py-1 px-3">
            <Sparkles className="w-3.5 h-3.5" /> Built for Trusted Finance Teams
          </Badge>
          <h1 className="text-4xl lg:text-5xl font-extrabold tracking-tight leading-tight">
            Every invoice, <br />
            <span className="text-primary">fully accountable.</span>
          </h1>
          <p className="text-muted-foreground text-base leading-relaxed">
            One intelligent workspace for automated duplicate screening, employee expense OCR intake, and an immutable SOX/SOC-2 audit trail.
          </p>
          <div className="space-y-3 pt-2">
            {[
              "Autonomous Benford & duplicate anomaly checks",
              "Human review decision logging & policy limits",
              "Role-tailored access with instant zero-key fallback"
            ].map((pt, i) => (
              <div key={i} className="flex items-center gap-3 text-sm font-medium">
                <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                <span>{pt}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 flex items-center justify-between text-xs text-muted-foreground border-t border-sidebar-border pt-4">
          <span>SECURE · EXPLAINABLE · HUMAN-LED</span>
          <span>ENTERPRISE RELEASE 2.4</span>
        </div>
      </section>

      {/* shadcn Authentication Block Column */}
      <section className="flex flex-col items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 lg:hidden">
              <span className="w-8 h-8 rounded-lg bg-primary text-primary-foreground grid place-items-center font-bold">✳</span>
              <span className="font-bold tracking-tight text-base">Veri-Fi</span>
            </div>
            {onToggleDark && (
              <Button
                variant="outline"
                size="sm"
                onClick={onToggleDark}
                className="ml-auto gap-2 text-xs"
                title="Toggle light/dark theme"
              >
                {dark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                <span>{dark ? "Light" : "Dark"}</span>
              </Button>
            )}
          </div>

          <Card className="border-border shadow-xl bg-card">
            <CardHeader className="space-y-1 pb-4">
              <Tabs value={mode} onValueChange={(v) => { setMode(v); setError(""); }} className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="signin">Sign In</TabsTrigger>
                  <TabsTrigger value="signup">Employee Sign Up</TabsTrigger>
                </TabsList>
              </Tabs>
              <CardTitle className="text-xl font-bold tracking-tight pt-3">
                {mode === "signin" ? "Sign in to workspace" : "Create employee profile"}
              </CardTitle>
              <CardDescription>
                {mode === "signin" 
                  ? "Enter your credentials to access audit and review queues." 
                  : "Submit expense claims and access team reimbursement guides."}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              {error && (
                <div className="p-3 text-xs rounded-md bg-destructive/15 text-destructive border border-destructive/20 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {mode === "signin" ? (
                <form onSubmit={submitLogin} className="space-y-3.5">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">Email address</label>
                    <Input
                      autoComplete="username"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="admin@verifi.local"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-foreground">Password</label>
                      <button
                        type="button"
                        onClick={() => setShow(!show)}
                        className="text-[11px] text-muted-foreground hover:text-foreground font-medium"
                      >
                        {show ? "Hide" : "Show"}
                      </button>
                    </div>
                    <Input
                      autoComplete="current-password"
                      type={show ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                      <span>Authenticator code</span>
                      <span className="text-[10px] text-muted-foreground font-normal">Optional / MFA enrolled</span>
                    </label>
                    <Input
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={8}
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                      placeholder="6-digit code (leave blank for demo)"
                    />
                  </div>

                  <Button type="submit" disabled={busy} className="w-full gap-2 mt-2">
                    {busy ? "Signing in…" : "Sign In Securely"}
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </form>
              ) : (
                <form onSubmit={submitRegister} className="space-y-3.5">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">Full name</label>
                    <Input
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      placeholder="e.g. Alex Morgan"
                      required
                      minLength={2}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">Department</label>
                    <select
                      value={regDept}
                      onChange={(e) => setRegDept(e.target.value)}
                      className="w-full h-10 px-3 py-2 text-sm rounded-md border border-input bg-background text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {["Operations", "Finance", "Engineering", "Marketing", "Sales", "Human Resources", "Product", "Support"].map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">Work email</label>
                    <Input
                      type="email"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      placeholder="alex@company.com"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-foreground">Password</label>
                      <button
                        type="button"
                        onClick={() => setRegShow(!regShow)}
                        className="text-[11px] text-muted-foreground hover:text-foreground font-medium"
                      >
                        {regShow ? "Hide" : "Show"}
                      </button>
                    </div>
                    <Input
                      type={regShow ? "text" : "password"}
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      required
                      minLength={8}
                      placeholder="Minimum 8 characters"
                    />
                  </div>

                  <Button type="submit" disabled={busy} className="w-full gap-2 mt-2">
                    {busy ? "Creating account…" : "Register & Sign In"}
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </form>
              )}
            </CardContent>

            <CardFooter className="flex flex-col space-y-3 pt-0 border-t border-border mt-3 p-4">
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Lock className="w-3.5 h-3.5" />
                <span>Protected session · Session expires after 8 hours</span>
              </div>
              <details className="w-full text-xs text-muted-foreground pt-1 cursor-pointer">
                <summary className="font-semibold text-foreground hover:text-primary">Demo Sign-In Quick Reference</summary>
                <div className="p-2.5 mt-2 rounded bg-muted text-[11px] space-y-1">
                  <p><b>Admin</b>: <code>admin@verifi.local</code> / <code>VeriFiAdmin!2026</code></p>
                  <p><b>Employee</b>: <code>employee@verifi.local</code> / <code>VeriFiEmployee!2026</code></p>
                </div>
              </details>
            </CardFooter>
          </Card>
        </div>
      </section>
    </main>
  );
}

export function EmployeePortal({ user, onLogout, onUserUpdated, dark, onToggleDark }) {
  const [tab, setTab] = useState("home");
  const [requests, setRequests] = useState([]);
  const [resources, setResources] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState({ kind: "Expense reimbursement", title: "", description: "", amount: 0, vendor: "", receipt_name: "" });
  const [profile, setProfile] = useState({ name: user.name, department: user.department, current_password: "", new_password: "" });

  const [scanProgress, setScanProgress] = useState(null);
  const [scannedFile, setScannedFile] = useState("");
  const [scannedInfo, setScannedInfo] = useState(null);
  const [scanning, setScanning] = useState(false);

  const refresh = async () => {
    setError("");
    try {
      const [r, d] = await Promise.all([api.get("/employee/requests"), api.get("/employee/resources")]);
      setRequests(r.data);
      setResources(d.data);
    } catch (e) {
      setError(e.response?.data?.detail || "Could not load workspace.");
    }
  };

  useEffect(() => { refresh(); }, []);

  const handleReceiptUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanning(true);
    setScanProgress({ label: "Loading in-browser OCR engine…", percent: 0 });
    setError("");
    setMessage("");
    try {
      const res = await documentText(file, setScanProgress);
      const parsed = parseInvoiceText(res.text);
      const f = parsed.fields;
      const amt = f.amount ? parseFloat(f.amount) : 0.0;
      const vendorName = f.vendor || "Merchant";
      setScannedFile(file.name);
      setScannedInfo({ vendor: vendorName, amount: amt, date: f.date, category: f.category });
      setForm((prev) => ({
        ...prev,
        kind: "Expense reimbursement",
        title: `[Reimbursement] ${vendorName}${amt > 0 ? ` - $${amt.toFixed(2)}` : ""}`,
        description: `Expense reimbursement for ${vendorName}${f.date ? ` on ${f.date}` : ""}.\nCategory: ${f.category || "General Business"}.\nAttached receipt: ${file.name} (OCR confidence: ${res.confidence || 94}%).`,
        amount: amt,
        vendor: vendorName,
        receipt_name: file.name,
      }));
      setMessage(`Receipt recognized! Auto-filled $${amt > 0 ? amt.toFixed(2) : "0.00"} from ${vendorName}.`);
    } catch (err) {
      setError(err.message || "Could not read receipt document.");
    } finally {
      setScanning(false);
      setScanProgress(null);
      e.target.value = "";
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");
    try {
      await api.post("/employee/requests", form);
      setForm({ kind: "Expense reimbursement", title: "", description: "", amount: 0, vendor: "", receipt_name: "" });
      setScannedInfo(null);
      setScannedFile("");
      setMessage("Your reimbursement request was submitted to Finance.");
      await refresh();
    } catch (e) {
      setError(e.response?.data?.detail || "Request could not be submitted.");
    } finally {
      setBusy(false);
    }
  };

  const saveProfile = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const { data } = await api.put("/employee/profile", profile);
      onUserUpdated(data.user);
      setProfile({ ...profile, name: data.user.name, department: data.user.department, current_password: "", new_password: "" });
      setMessage(data.password_changed ? "Profile and password updated. Please sign in again." : "Profile updated.");
      if (data.password_changed) await onLogout();
    } catch (e) {
      setError(e.response?.data?.detail || "Profile could not be updated.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-[250px_1fr] bg-background text-foreground">
      {/* Sidebar Rail */}
      <aside className="border-r border-border bg-sidebar text-sidebar-foreground p-5 flex flex-col justify-between">
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl bg-primary text-primary-foreground grid place-items-center font-bold">✳</span>
            <div>
              <b className="text-base tracking-tight block leading-tight">Veri-Fi</b>
              <small className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Employee Hub</small>
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-[10px] font-bold text-muted-foreground uppercase px-2 mb-2 tracking-wider">Workspace</div>
            {[
              ["home", "Overview", "⌂"],
              ["requests", "My Requests", "↗"],
              ["resources", "Resources", "▤"],
              ["profile", "Profile", "○"],
            ].map(([id, label, icon]) => (
              <Button
                key={id}
                variant={tab === id ? "secondary" : "ghost"}
                className={`w-full justify-start gap-2.5 text-xs font-semibold ${tab === id ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground"}`}
                onClick={() => { setTab(id); setMessage(""); setError(""); }}
              >
                <span>{icon}</span>
                <span>{label}</span>
                {id === "requests" && requests.some((r) => r.status === "pending") && (
                  <Badge variant="destructive" className="ml-auto text-[10px] h-4 px-1.5">
                    {requests.filter((r) => r.status === "pending").length}
                  </Badge>
                )}
              </Button>
            ))}
          </div>
        </div>

        <div className="pt-4 border-t border-sidebar-border flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-primary/20 text-primary font-bold grid place-items-center text-xs shrink-0">
              {user.name.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold truncate leading-tight">{user.name}</p>
              <p className="text-[10px] text-muted-foreground truncate">{user.department || "Employee"}</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onLogout} title="Sign Out">
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="p-6 lg:p-10 max-w-6xl w-full mx-auto space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
          <div>
            <Badge variant="outline" className="text-primary border-primary/30 text-[10px] uppercase font-bold tracking-wider mb-1">
              Self-Service Hub
            </Badge>
            <h1 className="text-2xl font-extrabold tracking-tight">
              {tab === "home" ? `Welcome back, ${user.name.split(" ")[0]}` : { requests: "My Requests", resources: "Company Resources", profile: "Account Profile" }[tab]}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {onToggleDark && (
              <Button variant="outline" size="sm" onClick={onToggleDark} className="gap-1.5 text-xs">
                {dark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                <span>{dark ? "Light" : "Dark"}</span>
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={onLogout} className="gap-1.5 text-xs">
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </Button>
          </div>
        </header>

        {error && (
          <div className="p-3 text-xs rounded-lg bg-destructive/15 text-destructive border border-destructive/20 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {message && (
          <div className="p-3 text-xs rounded-lg bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{message}</span>
          </div>
        )}

        {tab === "home" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card className="shadow-xs cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setTab("requests")}>
                <CardHeader className="p-4 pb-1">
                  <CardTitle className="text-xs uppercase text-muted-foreground font-semibold">Open Claims</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-1">
                  <div className="text-2xl font-bold">{requests.filter((r) => ["pending", "in_progress"].includes(r.status)).length}</div>
                  <p className="text-[11px] text-muted-foreground mt-1">Pending finance approval →</p>
                </CardContent>
              </Card>

              <Card className="shadow-xs cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setTab("requests")}>
                <CardHeader className="p-4 pb-1">
                  <CardTitle className="text-xs uppercase text-muted-foreground font-semibold">Processed</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-1">
                  <div className="text-2xl font-bold">{requests.filter((r) => ["approved", "rejected"].includes(r.status)).length}</div>
                  <p className="text-[11px] text-muted-foreground mt-1">Reviewed requests →</p>
                </CardContent>
              </Card>

              <Card className="shadow-xs cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setTab("resources")}>
                <CardHeader className="p-4 pb-1">
                  <CardTitle className="text-xs uppercase text-muted-foreground font-semibold">Guides & Docs</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-1">
                  <div className="text-2xl font-bold">{resources.length}</div>
                  <p className="text-[11px] text-muted-foreground mt-1">AP policy handbooks →</p>
                </CardContent>
              </Card>
            </div>

            <Card className="shadow-sm border-border">
              <CardHeader className="p-5 pb-3">
                <CardTitle className="text-base font-bold">Recent Request Activity</CardTitle>
                <CardDescription>Latest submission status from internal finance.</CardDescription>
              </CardHeader>
              <CardContent className="p-5 pt-0">
                <RequestList requests={requests.slice(0, 5)} />
              </CardContent>
            </Card>
          </div>
        )}

        {tab === "requests" && (
          <div className="grid lg:grid-cols-[1fr_1.1fr] gap-6 items-start">
            <Card className="shadow-sm border-border">
              <CardHeader className="p-5 pb-3">
                <CardTitle className="text-base font-bold">Submit Reimbursement</CardTitle>
                <CardDescription>Scan receipt or invoice for instant field auto-fill.</CardDescription>
              </CardHeader>
              <CardContent className="p-5 pt-0 space-y-4">
                <div className="p-3.5 rounded-lg border border-dashed border-primary/40 bg-primary/5 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <Camera className="w-5 h-5 text-primary" />
                      <div>
                        <b className="text-xs font-bold block text-foreground">Scan Receipt Document</b>
                        <small className="text-[11px] text-muted-foreground">Upload image or PDF to auto-extract amount & merchant</small>
                      </div>
                    </div>
                    <label className="cursor-pointer">
                      <Button variant="default" size="sm" asChild disabled={scanning}>
                        <span>{scanning ? "Reading…" : "Choose File"}</span>
                      </Button>
                      <input type="file" accept="image/*,.pdf" className="hidden" disabled={scanning} onChange={handleReceiptUpload} />
                    </label>
                  </div>
                  {scanProgress && (
                    <div className="text-xs text-primary font-medium flex items-center gap-2">
                      <span className="animate-spin text-sm">⏳</span>
                      <span>{scanProgress.label} ({scanProgress.percent}%)</span>
                    </div>
                  )}
                  {scannedInfo && (
                    <div className="text-xs bg-card border border-border rounded p-2 flex items-center justify-between">
                      <span>✓ Auto-extracted: <b>{scannedInfo.vendor}</b> · <b>${scannedInfo.amount}</b></span>
                      <small className="text-muted-foreground">{scannedFile}</small>
                    </div>
                  )}
                </div>

                <form onSubmit={submit} className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold">Request type</label>
                    <select
                      value={form.kind}
                      onChange={(e) => setForm({ ...form, kind: e.target.value })}
                      className="w-full h-9 px-3 py-1.5 text-xs rounded-md border border-input bg-background"
                    >
                      {["Expense reimbursement", "Invoice question", "Policy clarification", "Access request", "Other"].map((x) => (
                        <option key={x} value={x}>{x}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold">Subject</label>
                    <Input
                      required
                      minLength={3}
                      value={form.title}
                      onChange={(e) => setForm({ ...form, title: e.target.value })}
                      placeholder="e.g. Travel meal reimbursement"
                      className="h-9 text-xs"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold">Amount ($)</label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={form.amount || ""}
                        onChange={(e) => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })}
                        placeholder="0.00"
                        className="h-9 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold">Vendor / Merchant</label>
                      <Input
                        value={form.vendor || ""}
                        onChange={(e) => setForm({ ...form, vendor: e.target.value })}
                        placeholder="e.g. Delta, Uber"
                        className="h-9 text-xs"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold">Details & Business Purpose</label>
                    <textarea
                      required
                      minLength={5}
                      rows={3}
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                      placeholder="Include business purpose..."
                      className="w-full p-2.5 text-xs rounded-md border border-input bg-background resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </div>

                  <Button type="submit" disabled={busy || scanning} className="w-full mt-2 gap-2">
                    {busy ? "Submitting…" : "Submit Claim to Finance"}
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card className="shadow-sm border-border">
              <CardHeader className="p-5 pb-3">
                <CardTitle className="text-base font-bold">Request History</CardTitle>
                <CardDescription>Track status across approval pipelines.</CardDescription>
              </CardHeader>
              <CardContent className="p-5 pt-0">
                <RequestList requests={requests} />
              </CardContent>
            </Card>
          </div>
        )}

        {tab === "resources" && (
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
            {resources.map((r) => (
              <Card key={r.id} className="shadow-xs hover:border-primary/50 transition-colors">
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <FileText className="w-4 h-4 text-primary" />
                    <span>{r.title}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0 space-y-3">
                  <p className="text-xs text-muted-foreground line-clamp-3">{r.description}</p>
                  {r.url ? (
                    <Button variant="link" size="sm" asChild className="p-0 h-auto text-xs text-primary">
                      <a href={r.url} target="_blank" rel="noreferrer">Open Resource ↗</a>
                    </Button>
                  ) : (
                    <small className="text-[10px] text-muted-foreground block font-medium">Shared by Finance Team</small>
                  )}
                </CardContent>
              </Card>
            ))}
            {!resources.length && (
              <p className="text-xs text-muted-foreground p-4">No team resources shared yet.</p>
            )}
          </div>
        )}

        {tab === "profile" && (
          <Card className="max-w-lg shadow-sm border-border">
            <CardHeader className="p-5 pb-3">
              <CardTitle className="text-base font-bold">Update Account Profile</CardTitle>
              <CardDescription>Keep contact details and security credentials up to date.</CardDescription>
            </CardHeader>
            <CardContent className="p-5 pt-0">
              <form onSubmit={saveProfile} className="space-y-3.5">
                <div className="space-y-1">
                  <label className="text-xs font-semibold">Full name</label>
                  <Input
                    required
                    minLength={2}
                    value={profile.name}
                    onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold">Department</label>
                  <Input
                    value={profile.department}
                    onChange={(e) => setProfile({ ...profile, department: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold">Current password (verify identity)</label>
                  <Input
                    required
                    type="password"
                    value={profile.current_password}
                    onChange={(e) => setProfile({ ...profile, current_password: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold">New password (optional)</label>
                  <Input
                    minLength={12}
                    type="password"
                    value={profile.new_password}
                    onChange={(e) => setProfile({ ...profile, new_password: e.target.value })}
                    placeholder="Minimum 12 characters"
                  />
                </div>
                <Button type="submit" disabled={busy} className="mt-2">Save Profile Changes</Button>
              </form>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}

function RequestList({ requests }) {
  if (!requests.length) {
    return (
      <div className="p-8 text-center text-muted-foreground text-xs border border-dashed rounded-lg">
        No claims submitted yet. Use the form above to submit your first request.
      </div>
    );
  }
  return (
    <div className="divide-y divide-border rounded-lg border border-border overflow-hidden bg-card">
      {requests.map((r) => (
        <div key={r.id} className="p-3.5 flex items-center justify-between gap-3 text-xs hover:bg-muted/40 transition-colors">
          <div className="min-w-0 space-y-0.5">
            <p className="font-semibold text-foreground truncate">{r.title}</p>
            <p className="text-[11px] text-muted-foreground">
              {r.kind} · {new Date(r.created).toLocaleDateString()} {r.vendor ? `· ${r.vendor}` : ""}
            </p>
            {r.amount > 0 && (
              <p className="font-bold text-foreground">
                ${Number(r.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                {r.receipt_name && <span className="ml-2 font-normal text-muted-foreground">📎 {r.receipt_name}</span>}
              </p>
            )}
            {r.review_note && <p className="text-[11px] text-muted-foreground italic">Note: {r.review_note}</p>}
          </div>
          <Badge
            variant={r.status === "approved" ? "default" : r.status === "rejected" ? "destructive" : "secondary"}
            className="capitalize shrink-0 font-medium text-[10px]"
          >
            {r.status.replace("_", " ")}
          </Badge>
        </div>
      ))}
    </div>
  );
}

export function MfaSetup({ user, onEnabled, onLogout }) {
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.post("/auth/mfa/setup")
      .then((r) => setSetup(r.data))
      .catch((e) => setError(e.response?.data?.detail || "Could not initialize authenticator setup."));
  }, []);

  const confirm = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post("/auth/mfa/confirm", { code });
      onEnabled(data.user);
    } catch (e) {
      setError(e.response?.data?.detail || "Verification code is invalid.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen grid place-items-center p-6 bg-background text-foreground">
      <Card className="w-full max-w-md shadow-xl border-border bg-card">
        <CardHeader className="space-y-1">
          <Badge variant="outline" className="w-fit border-primary/40 text-primary gap-1 mb-1">
            <KeyRound className="w-3.5 h-3.5" /> Two-Step Verification
          </Badge>
          <CardTitle className="text-xl font-bold">Secure Administrator Workspace</CardTitle>
          <CardDescription>
            Connect an authenticator app (Microsoft Authenticator, Google Authenticator) before accessing privileged controls.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ol className="list-decimal list-inside text-xs text-muted-foreground space-y-1.5 leading-relaxed">
            <li>Open your authenticator app and choose <b>Add account</b>.</li>
            <li>Enter your setup key below.</li>
            <li>Enter the current 6-digit verification code to confirm.</li>
          </ol>

          {setup && (
            <div className="p-3 bg-muted rounded-md space-y-2 border border-border">
              <span className="text-[10px] uppercase font-bold text-muted-foreground block">Your One-Time Setup Key</span>
              <code className="text-xs font-mono font-bold block select-all break-all">{setup.secret}</code>
              <Button
                variant="outline"
                size="sm"
                type="button"
                className="w-full text-xs h-7"
                onClick={() => navigator.clipboard?.writeText(setup.secret)}
              >
                Copy Key to Clipboard
              </Button>
            </div>
          )}

          {error && (
            <div className="p-2.5 text-xs rounded bg-destructive/15 text-destructive border border-destructive/20">
              {error}
            </div>
          )}

          <form onSubmit={confirm} className="space-y-3 pt-1">
            <div className="space-y-1">
              <label className="text-xs font-semibold">6-Digit Authenticator Code</label>
              <Input
                autoComplete="one-time-code"
                inputMode="numeric"
                maxLength={8}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="000 000"
                required
              />
            </div>
            <Button type="submit" disabled={busy || !setup} className="w-full">
              {busy ? "Verifying…" : "Confirm & Open Admin Workspace"}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex justify-between items-center text-xs text-muted-foreground border-t border-border p-4">
          <button onClick={onLogout} className="text-xs hover:text-foreground underline">Sign Out</button>
          <span>{user.email}</span>
        </CardFooter>
      </Card>
    </main>
  );
}
