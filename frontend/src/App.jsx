import { useState, useEffect, lazy, Suspense } from "react";
import api from "./api";
import { Badge, Stat, money } from "./ui";
import Detail from "./components/Detail";
import Audit from "./components/Audit";
import Chat from "./components/Chat";
import Limits from "./components/Limits";
import Risk from "./components/Risk";
import Learning from "./components/Learning";
import Progress from "./components/Progress";
import Admin from "./components/Admin";
import Forensics from "./components/Forensics";
import Discounts from "./components/Discounts";
import RelationshipGraph from "./components/RelationshipGraph";
import { EmployeePortal, MfaSetup, SignIn } from "./components/Auth";

// shadcn UI component imports
import { Button } from "./components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "./components/ui/card";
import { Input } from "./components/ui/input";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "./components/ui/table";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator
} from "./components/ui/dropdown-menu";

// Lucide Icons
import {
  Layers,
  BarChart3,
  Percent,
  Network,
  AlertTriangle,
  FileCheck,
  ShieldCheck,
  Sparkles,
  HelpCircle,
  Settings2,
  Scan,
  FileSpreadsheet,
  Play,
  Upload,
  Download,
  CreditCard,
  ChevronDown,
  Sun,
  Moon,
  Search,
  LogOut,
  ArrowRight,
  ArrowUpDown,
  CheckCircle2,
  AlertCircle
} from "lucide-react";

const OCRIntake = lazy(() => import("./components/OCRIntake"));

const TOUR = [
  { title: "Screen the whole file", body: "Start with the run summary. Every invoice was checked; only exceptions need a person’s attention." },
  { title: "Show an exact duplicate", body: "This is a high-confidence match. Open the evidence to compare the two invoice records side by side." },
  { title: "Show an uncertain match", body: "This near duplicate is routed to review because similarity is a signal, not proof. A person makes the final call." },
  { title: "Record a reviewer decision", body: "Choose a reason, then approve or reject. The decision is saved to the audit log." },
  { title: "Close with accountability", body: "The audit log keeps the system and reviewer actions together with verified SOX/SOC-2 packaging." }
];

export default function App() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [dark, setDark] = useState(() => localStorage.getItem("verifi_theme") === "dark");

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("verifi_theme", dark ? "dark" : "light");
  }, [dark]);

  const toggleDark = () => setDark((d) => !d);

  useEffect(() => {
    const expired = () => {
      setUser(null);
      setAuthReady(true);
      api.get("/auth/csrf").catch(() => {});
    };
    window.addEventListener("verifi:session-expired", expired);
    api.get("/auth/me").then((r) => setUser(r.data.user)).catch(() => {}).finally(() => setAuthReady(true));
    api.get("/auth/csrf").catch(() => {});
    return () => window.removeEventListener("verifi:session-expired", expired);
  }, []);

  const logout = async () => {
    try { await api.post("/auth/logout"); } catch {}
    setUser(null);
    setAuthReady(true);
    api.get("/auth/csrf").catch(() => {});
  };

  if (!authReady) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-background text-foreground">
        <span className="w-10 h-10 rounded-xl bg-primary text-primary-foreground grid place-items-center font-bold text-lg animate-pulse">✳</span>
        <b className="text-lg">Veri-Fi</b>
        <small className="text-xs text-muted-foreground">Securing your finance workspace…</small>
      </div>
    );
  }

  if (!user) return <SignIn onSignedIn={setUser} dark={dark} onToggleDark={toggleDark} />;
  if (user.role === "employee") return <EmployeePortal user={user} onLogout={logout} onUserUpdated={setUser} dark={dark} onToggleDark={toggleDark} />;
  if (!user.mfa_enabled) return <MfaSetup user={user} onEnabled={setUser} onLogout={logout} />;
  return <Workspace user={user} onLogout={logout} dark={dark} onToggleDark={toggleDark} />;
}

function Workspace({ user, onLogout, dark, onToggleDark }) {
  const [res, setRes] = useState(null);
  const [tab, setTab] = useState("results");
  const [filter, setFilter] = useState("ALL");
  const [sel, setSel] = useState(null);
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState("Checking invoices…");
  const [err, setErr] = useState("");
  const [downloadMsg, setDownloadMsg] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState(null);
  const [exceptionsFirst, setExceptionsFirst] = useState(true);
  const [demoTour, setDemoTour] = useState(false);
  const [demoStep, setDemoStep] = useState(0);
  const [ocrOpen, setOcrOpen] = useState(false);
  const [modelInfo, setModelInfo] = useState(null);
  const [payMenu, setPayMenu] = useState(false);

  const refresh = async () => {
    const { data } = await api.get("/results");
    setRes(data.rows ? data : null);
  };

  useEffect(() => {
    refresh().catch(() => {});
    api.get("/model").then((r) => setModelInfo(r.data)).catch(() => {});
  }, []);

  const load = async (p) => {
    setBusyLabel("Checking invoices…");
    setBusy(true);
    setErr("");
    try {
      const { data } = await p;
      setRes(data);
      setSel(null);
      return true;
    } catch (e) {
      setErr(e.response?.data?.detail || e.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const upload = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const fd = new FormData();
    fd.append("file", f);
    load(api.post("/analyze", fd));
    e.target.value = "";
  };

  const downloadFile = async (path, filename) => {
    setDownloadMsg("");
    setErr("");
    try {
      const { data, headers } = await api.get(path, { responseType: "blob" });
      const href = URL.createObjectURL(new Blob([data], { type: headers["content-type"] || "text/csv" }));
      const a = document.createElement("a");
      a.href = href;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(href), 1500);
      setDownloadMsg(
        filename === "reviewer_feedback.csv" && !res?.rows?.some((r) => r.human_decision)
          ? "Feedback export downloaded with headers."
          : `${filename} downloaded successfully.`
      );
    } catch (e) {
      setErr(e.response?.data?.detail || `Could not download ${filename}.`);
    }
  };

  const queue = res ? res.rows.filter((r) => r.status !== "AUTO_PASS" && !r.human_decision).sort((a, b) => (b.priority || 0) - (a.priority || 0)) : [];

  const decide = async (id, decision, reason) => {
    const i = queue.findIndex((r) => r.invoice_id === id);
    setErr("");
    setBusyLabel("Saving review decision…");
    setBusy(true);
    try {
      await api.post("/review", { invoice_id: id, decision, reason });
      await refresh();
      setSel(queue[i + 1]?.invoice_id ?? null);
      if (demoTour && demoStep === 3) setDemoStep(4);
    } catch (e) {
      setErr(e.response?.data?.detail || e.message || "Could not save the review decision.");
    } finally {
      setBusy(false);
    }
  };

  const startDemo = async () => {
    if (await load(api.post("/sample"))) {
      setTab("results");
      setFilter("ALL");
      setQ("");
      setExceptionsFirst(true);
      setDemoStep(0);
      setDemoTour(true);
    }
  };

  const stopDemo = () => {
    setDemoTour(false);
    setSel(null);
    setTab("results");
    setFilter("ALL");
    setQ("");
  };

  useEffect(() => {
    if (!demoTour) return;
    const step = demoStep;
    if (step === 0) { setTab("results"); setFilter("ALL"); setQ(""); setSel(null); }
    if (step === 1) { setTab("results"); setFilter("FLAG"); setQ("INV-1057"); setSel("INV-1057"); }
    if (step === 2) { setTab("results"); setFilter("REVIEW"); setQ("INV-1061"); setSel("INV-1061"); }
    if (step === 3) { setTab("results"); setFilter("ALL"); setQ(""); setSel("INV-1061"); }
    if (step === 4) { setTab("audit"); setFilter("ALL"); setQ(""); setSel(null); }
  }, [demoTour, demoStep]);

  const ORDER = { FLAG: 0, REVIEW: 1, AUTO_PASS: 2 };
  const hit = (r) => !q || [r.invoice_id, r.vendor, r.invoice_no].some((v) => String(v || "").toLowerCase().includes(q.toLowerCase()));
  const val = (r, k) => (k === "status" ? ORDER[r.status] : r[k]) ?? "";
  const rows = res
    ? res.rows
        .filter((r) => (filter === "ALL" || r.status === filter) && hit(r))
        .sort((a, b) =>
          exceptionsFirst
            ? (ORDER[a.status] - ORDER[b.status] || (b.priority || 0) - (a.priority || 0))
            : sort
            ? (val(a, sort.key) > val(b, sort.key) ? 1 : val(a, sort.key) < val(b, sort.key) ? -1 : 0) * sort.dir
            : 0
        )
    : [];

  const row = res && sel ? res.rows.find((r) => r.invoice_id === sel) : null;
  const s = res && res.summary;

  const th = (k, l, cls = "") => (
    <TableHead
      className={`${cls} cursor-pointer select-none text-xs font-semibold`}
      onClick={() => {
        setExceptionsFirst(false);
        setSort((s) => (s && s.key === k ? { key: k, dir: -s.dir } : { key: k, dir: 1 }));
      }}
    >
      <div className="flex items-center gap-1">
        <span>{l}</span>
        {sort && sort.key === k ? (
          <span className="text-[10px] text-primary">{sort.dir > 0 ? "▲" : "▼"}</span>
        ) : (
          <ArrowUpDown className="w-3 h-3 opacity-30" />
        )}
      </div>
    </TableHead>
  );

  const sections = [
    ["results", "Review queue", <Layers className="w-4 h-4" />],
    ["forensics", "Forensic & Benford", <BarChart3 className="w-4 h-4" />],
    ["discounts", "Working Capital & AP", <Percent className="w-4 h-4" />],
    ["network", "Relationship Graph", <Network className="w-4 h-4" />],
    ["risk", "Risk insights", <AlertTriangle className="w-4 h-4" />],
    ["audit", "Audit trail", <FileCheck className="w-4 h-4" />],
    ["limits", "Policy limits", <ShieldCheck className="w-4 h-4" />],
    ["chat", "Ask assistant", <Sparkles className="w-4 h-4" />],
    ["how", "How it works", <HelpCircle className="w-4 h-4" />],
    ["admin", "Admin console", <Settings2 className="w-4 h-4" />]
  ];

  return (
    <div className="min-h-screen grid lg:grid-cols-[240px_1fr] bg-background text-foreground">
      {/* Sidebar Rail Block */}
      <aside className="border-r border-sidebar-border bg-sidebar text-sidebar-foreground p-5 flex flex-col justify-between">
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl bg-primary text-primary-foreground grid place-items-center font-bold shadow-xs">✳</span>
            <div>
              <b className="text-base tracking-tight block leading-tight text-sidebar-foreground">Veri-Fi</b>
              <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Invoice Control</span>
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-[10px] font-bold text-muted-foreground uppercase px-2 mb-2 tracking-wider">Workspace</div>
            {sections.map(([k, l, icon]) => (
              <Button
                key={k}
                variant={tab === k ? "secondary" : "ghost"}
                className={`w-full justify-start gap-2.5 text-xs font-semibold ${
                  tab === k ? "bg-sidebar-accent text-sidebar-accent-foreground font-bold shadow-xs" : "text-sidebar-foreground"
                }`}
                onClick={() => setTab(k)}
              >
                <span>{icon}</span>
                <span>{l}</span>
                {k === "results" && res && queue.length > 0 && (
                  <Badge variant="destructive" className="ml-auto text-[10px] h-4 px-1.5 font-bold">
                    {queue.length}
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
              <p className="text-xs font-bold truncate leading-tight text-sidebar-foreground">{user.name}</p>
              <p className="text-[10px] text-muted-foreground truncate">Administrator</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onLogout} title="Sign Out">
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </aside>

      {/* Main Workspace Block */}
      <main className={`p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6 ${tab === "admin" ? "admin-mode" : ""}`}>
        {/* Header Block */}
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary text-primary-foreground grid place-items-center font-bold text-lg shadow-sm">
              ✳
            </div>
            <div>
              <div className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground">Accounts Payable · Control Center</div>
              <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">Veri-Fi</h1>
              <p className="text-xs text-muted-foreground">Autonomous AP Invoice &amp; Expense Screening</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={onToggleDark} className="gap-1.5 text-xs">
              {dark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              <span>{dark ? "Light" : "Dark"}</span>
            </Button>

            <Button variant="outline" size="sm" disabled={busy} onClick={() => setOcrOpen(true)} className="gap-1.5 text-xs text-primary border-primary/30">
              <Scan className="w-3.5 h-3.5" />
              <span>Scan Invoice</span>
            </Button>

            <Button variant="outline" size="sm" disabled={busy} onClick={() => load(api.post("/sample"))} className="gap-1.5 text-xs">
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Load 93 Demo Set</span>
            </Button>

            <Button variant="outline" size="sm" disabled={busy} onClick={startDemo} className="gap-1.5 text-xs">
              <Play className="w-3.5 h-3.5" />
              <span>90s Demo</span>
            </Button>

            <Button variant="outline" size="sm" asChild className="gap-1.5 text-xs cursor-pointer">
              <label>
                <Upload className="w-3.5 h-3.5" />
                <span>Upload File</span>
                <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={upload} />
              </label>
            </Button>

            <Button variant="ghost" size="sm" onClick={() => downloadFile("/demo-upload.csv", "invoice_upload_example.csv")} className="gap-1.5 text-xs">
              <Download className="w-3.5 h-3.5" />
              <span>Example CSV</span>
            </Button>

            {res && (
              <>
                <Button variant="outline" size="sm" onClick={() => downloadFile("/report.csv", "exception_report.csv")} className="gap-1.5 text-xs">
                  <Download className="w-3.5 h-3.5" />
                  <span>Report</span>
                </Button>
                <Button variant="outline" size="sm" onClick={() => downloadFile("/feedback.csv", "reviewer_feedback.csv")} className="gap-1.5 text-xs">
                  <Download className="w-3.5 h-3.5" />
                  <span>Feedback</span>
                </Button>

                {/* Disbursements & ACH Dropdown Menu Block */}
                <DropdownMenu open={payMenu} onOpenChange={setPayMenu}>
                  <DropdownMenuTrigger asChild>
                    <Button variant="default" size="sm" className="gap-1.5 text-xs font-semibold">
                      <CreditCard className="w-3.5 h-3.5" />
                      <span>Disbursements &amp; ACH</span>
                      <ChevronDown className="w-3.5 h-3.5 ml-0.5 opacity-70" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64">
                    <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-muted-foreground">Payment Batch Export</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => { downloadFile("/export/nacha", `nacha_batch_${new Date().toISOString().slice(0, 10)}.ach`); setPayMenu(false); }}>
                      <div className="flex flex-col">
                        <span className="font-semibold text-xs">NACHA ACH (.ach)</span>
                        <span className="text-[10px] text-muted-foreground">Fixed-width 94-char US bank file</span>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { downloadFile("/export/sepa", `sepa_batch_${new Date().toISOString().slice(0, 10)}.xml`); setPayMenu(false); }}>
                      <div className="flex flex-col">
                        <span className="font-semibold text-xs">SEPA XML (pain.001.001.03)</span>
                        <span className="text-[10px] text-muted-foreground">ISO 20022 Euro wire transfer</span>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { downloadFile("/export/erp", `erp_ap_batch_${new Date().toISOString().slice(0, 10)}.csv`); setPayMenu(false); }}>
                      <div className="flex flex-col">
                        <span className="font-semibold text-xs">ERP AP Journal (.csv)</span>
                        <span className="text-[10px] text-muted-foreground">NetSuite &amp; SAP Import</span>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => { downloadFile("/export/audit-pack", `sox_audit_pack_${new Date().toISOString().slice(0, 10)}.html`); setPayMenu(false); }}>
                      <div className="flex flex-col">
                        <span className="font-semibold text-xs text-primary">SOX 404 &amp; SOC-2 Audit Pack (.html)</span>
                        <span className="text-[10px] text-muted-foreground">Cryptographically signed SHA-256 seal</span>
                      </div>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>
        </header>

        {downloadMsg && (
          <div className="p-3 text-xs rounded-lg bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30 flex items-center justify-between">
            <span>✓ {downloadMsg}</span>
            <button onClick={() => setDownloadMsg("")} className="text-sm font-bold opacity-70 hover:opacity-100">×</button>
          </div>
        )}
        {err && (
          <div className="p-3 text-xs rounded-lg bg-destructive/15 text-destructive border border-destructive/20 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{err}</span>
          </div>
        )}
        {busy && <div className="text-xs text-muted-foreground animate-pulse font-medium">{busyLabel}</div>}

        {/* Tab Route Content */}
        {tab === "admin" && (
          <div className="admin-tab-shell">
            <Admin user={user} onLogout={onLogout} onBack={() => setTab("results")} />
          </div>
        )}

        {tab === "results" && (
          <div className="space-y-6">
            {/* Intro Hero Block */}
            <Card className="border-border shadow-sm bg-card p-6 rounded-xl">
              <div className="flex flex-wrap items-center justify-between gap-6">
                <div className="space-y-1.5 max-w-xl">
                  <Badge variant="outline" className="border-primary/40 text-primary text-[10px] font-bold uppercase tracking-wider">
                    Explainable Automation
                  </Badge>
                  <h2 className="text-xl font-bold tracking-tight">Catch the exceptions. Keep every decision accountable.</h2>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Clean invoices pass automatically. Every exception stays in a human review queue with its rule explanation and matched duplicate record.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="gap-1.5 py-1 px-3 text-xs font-semibold"><b>01</b> Screen</Badge>
                  <Badge variant="secondary" className="gap-1.5 py-1 px-3 text-xs font-semibold"><b>02</b> Review</Badge>
                  <Badge variant="secondary" className="gap-1.5 py-1 px-3 text-xs font-semibold"><b>03</b> Audit</Badge>
                </div>
              </div>
            </Card>

            {/* Guided Tour Banner */}
            {demoTour && (
              <Card className="p-4 border-primary/40 bg-primary/5 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-primary uppercase tracking-widest">
                      Demo Walkthrough · Step {demoStep + 1} of {TOUR.length}
                    </span>
                    <h3 className="text-sm font-bold">{TOUR[demoStep].title}</h3>
                    <p className="text-xs text-muted-foreground">{TOUR[demoStep].body}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => (demoStep === 0 ? stopDemo() : setDemoStep(demoStep - 1))}>
                      {demoStep === 0 ? "Exit" : "Back"}
                    </Button>
                    {demoStep < TOUR.length - 1 ? (
                      <Button size="sm" onClick={() => setDemoStep(demoStep + 1)}>
                        {demoStep === 3 ? "Skip Decision" : "Next"} →
                      </Button>
                    ) : (
                      <Button size="sm" onClick={stopDemo}>Finish Demo</Button>
                    )}
                  </div>
                </div>
              </Card>
            )}

            {/* Empty State Block */}
            {!res && !busy && (
              <Card className="p-12 text-center border-dashed space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary grid place-items-center mx-auto text-xl font-bold">
                  ↗
                </div>
                <div className="max-w-md mx-auto space-y-2">
                  <h2 className="text-xl font-bold tracking-tight">Turn an invoice file into a focused review queue.</h2>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Load the 93-row demo set, upload your own AP file, or scan a photo/PDF to test instant OCR field extraction.
                  </p>
                </div>
                <div className="flex justify-center gap-3 pt-2">
                  <Button onClick={() => load(api.post("/sample"))} className="gap-2">
                    <FileSpreadsheet className="w-4 h-4" /> Load 93 Demo Invoices
                  </Button>
                  <Button variant="outline" onClick={() => setOcrOpen(true)} className="gap-2">
                    <Scan className="w-4 h-4" /> Scan Invoice
                  </Button>
                </div>
              </Card>
            )}

            {/* Data Loaded Dashboard Block */}
            {res && (
              <div className="space-y-6">
                {/* 5 KPI Stat Cards Block */}
                <div>
                  <div className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground mb-2">
                    Run Overview · {s.total} records screened
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <Stat label="Invoices checked" value={s.total} hint="All rows in the uploaded file were screened." />
                    <Stat label="Auto-passed" value={s.auto_pass} tone="text-emerald-600 dark:text-emerald-400" hint="No configured rule raised an exception." />
                    <Stat label="Flagged" value={s.flagged} tone="text-destructive" hint="High-confidence rule matches; review before action." />
                    <Stat label="Needs review" value={s.review} tone="text-amber-600 dark:text-amber-400" hint="Uncertain signals routed to human reviewer." />
                    <Stat label="Money at risk" value={money(s.money_at_risk)} hint="Estimated duplicate totals plus over-limit excess." />
                  </div>
                </div>

                {/* Machine Learning Anomaly Detection Banner */}
                {modelInfo?.ready && (
                  <Card className="p-4 border-border bg-card shadow-xs flex flex-wrap items-center justify-between gap-4">
                    <div className="space-y-0.5">
                      <div className="text-[10px] font-bold text-primary uppercase tracking-wider">Trained Isolation Forest Model</div>
                      <b className="text-xs">{modelInfo.algorithm} · {Number(modelInfo.training_rows).toLocaleString()} synthetic training records</b>
                    </div>
                    <p className="text-xs text-muted-foreground max-w-xl">
                      {s.model_alerts || 0} model-only signals detected. Score compares patterns against baseline without overriding human decisions.
                    </p>
                  </Card>
                )}

                <Progress rows={res.rows} summary={s} />

                {/* Next Recommended Priority Card Block */}
                {queue.length > 0 && (
                  <Card className="p-4 border-primary/40 bg-card shadow-sm flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-destructive/15 text-destructive grid place-items-center font-extrabold text-xs">
                        PRIORITY
                      </div>
                      <div>
                        <div className="text-[10px] font-bold text-primary uppercase tracking-wider">Recommended Next Review</div>
                        <h3 className="text-sm font-bold">{queue[0].invoice_id} · {queue[0].vendor || "Vendor not provided"}</h3>
                        <p className="text-[11px] text-muted-foreground">Highest-priority exception by signal strength and exposure.</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <span className="text-[10px] text-muted-foreground block font-bold uppercase">Exposure</span>
                        <b className="text-base font-bold">{money(queue[0].amount)}</b>
                      </div>
                      <Button onClick={() => setSel(queue[0].invoice_id)} className="gap-2">
                        Review Invoice <ArrowRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </Card>
                )}

                {/* Table Toolbar & Filters */}
                <div className="space-y-3">
                  <Learning key={res.rows.filter((r) => r.human_decision).length} onApplied={refresh} />

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {queue.length > 0 && (
                        <Button onClick={() => setSel(queue[0].invoice_id)} size="sm" className="gap-1.5 font-bold">
                          Start Review <Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1">{queue.length} left</Badge>
                        </Button>
                      )}
                      {queue.length === 0 && s.flagged + s.review > 0 && (
                        <Badge variant="outline" className="border-emerald-500/40 text-emerald-700 dark:text-emerald-400 gap-1 py-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Review queue cleared
                        </Badge>
                      )}
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={q}
                          onChange={(e) => setQ(e.target.value)}
                          placeholder="Search invoice, vendor or number…"
                          className="pl-8 h-9 text-xs w-64"
                        />
                      </div>
                      <Button
                        variant={exceptionsFirst ? "default" : "outline"}
                        size="sm"
                        onClick={() => { setExceptionsFirst((v) => !v); setSort(null); }}
                        className="text-xs h-9"
                      >
                        {exceptionsFirst ? "✓ Exceptions first" : "Exceptions first"}
                      </Button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {[["ALL", "All"], ["FLAG", "Flagged"], ["REVIEW", "Needs review"], ["AUTO_PASS", "Auto-passed"]].map(([k, l]) => (
                        <Button
                          key={k}
                          variant={filter === k ? "default" : "outline"}
                          size="sm"
                          onClick={() => setFilter(k)}
                          className="text-xs h-8"
                        >
                          {l}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {/* shadcn Table Block */}
                  <Card className="overflow-hidden border-border bg-card shadow-xs">
                    <Table>
                      <TableHeader className="bg-muted/50">
                        <TableRow>
                          {th("invoice_id", "Invoice", "p-3")}
                          {th("vendor", "Vendor")}
                          {th("invoice_no", "Invoice no.")}
                          {th("date", "Date")}
                          {th("amount", "Amount", "text-right")}
                          {th("status", "Status", "pl-4")}
                          <TableHead className="text-xs font-semibold">Why</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map((r) => (
                          <TableRow
                            key={r.invoice_id}
                            tabIndex={0}
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSel(r.invoice_id); } }}
                            onClick={() => setSel(r.invoice_id)}
                            className="cursor-pointer hover:bg-muted/50 transition-colors"
                          >
                            <TableCell className="p-3 font-semibold text-foreground">
                              <div>{r.invoice_id}</div>
                              {r.po_number && <span className="block text-[10px] text-primary font-mono font-normal">PO: {r.po_number}</span>}
                            </TableCell>
                            <TableCell className="text-xs font-medium">{r.vendor || "-"}</TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">{r.invoice_no || "-"}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{r.date || "-"}</TableCell>
                            <TableCell className="text-right font-medium">
                              {r.currency && r.currency !== "USD" ? (
                                <div>
                                  <span className="font-semibold text-foreground">{r.currency} {Number(r.original_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                  <span className="block text-[10px] text-muted-foreground">≈ ${Number(r.amount_usd).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                </div>
                              ) : (
                                money(r.amount)
                              )}
                            </TableCell>
                            <TableCell className="pl-4">
                              <Badge s={r.status} />
                              {r.approval_tier && <span className="block text-[10px] text-muted-foreground mt-0.5">{r.approval_tier.split(":")[0]}</span>}
                              {r.human_decision && <span className="block text-[11px] text-primary capitalize font-medium">{r.human_decision.toLowerCase()}</span>}
                            </TableCell>
                            <TableCell className="text-muted-foreground max-w-xs truncate text-xs">
                              {r.status === "AUTO_PASS" ? "" : r.flags.map((f) => f.rule.split("_").slice(1).join(" ").toLowerCase()).join(", ")}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {!rows.length && (
                      <div className="p-8 text-center text-xs text-muted-foreground">No invoices match this filter criteria.</div>
                    )}
                  </Card>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Modular Feature Tabs */}
        {tab === "forensics" && <div className="mt-6"><Forensics res={res} /></div>}
        {tab === "discounts" && <div className="mt-6"><Discounts res={res} onSelectInvoice={(id) => { setSel(id); setTab("results"); }} /></div>}
        {tab === "network" && <div className="mt-6"><RelationshipGraph res={res} onSelectInvoice={(id) => { setSel(id); setTab("results"); }} /></div>}
        {tab === "risk" && (
          <div className="mt-6 space-y-4">
            <div>
              <div className="text-[10px] font-bold text-primary uppercase tracking-widest">Portfolio Exposure</div>
              <h2 className="text-xl font-bold tracking-tight">Risk Insights</h2>
              <p className="text-xs text-muted-foreground">Concentration of flagged amounts and borderline exceptions across vendors and expense categories.</p>
            </div>
            {res ? (
              <Risk rows={res.rows} />
            ) : (
              <Card className="p-8 text-center space-y-3">
                <p className="text-xs text-muted-foreground">No dataset loaded yet. Load demo invoices to examine risk clusters.</p>
                <Button onClick={() => load(api.post("/sample"))}>Load Sample Data</Button>
              </Card>
            )}
          </div>
        )}

        {tab === "audit" && (
          <div className="mt-6 space-y-4">
            <div>
              <div className="text-[10px] font-bold text-primary uppercase tracking-widest">Compliance &amp; Traceability</div>
              <h2 className="text-xl font-bold tracking-tight">Audit Trail</h2>
              <p className="text-xs text-muted-foreground">Immutable log of system screenings, rule updates, and reviewer decisions.</p>
            </div>
            <Audit />
          </div>
        )}

        {tab === "limits" && (
          <div className="mt-6 space-y-4">
            <div>
              <div className="text-[10px] font-bold text-primary uppercase tracking-widest">Compliance Rules</div>
              <h2 className="text-xl font-bold tracking-tight">Policy Limits</h2>
              <p className="text-xs text-muted-foreground">Configure threshold ceilings for expense categories. Invoices exceeding limits trigger reviewer flags.</p>
            </div>
            <Limits onSaved={refresh} />
          </div>
        )}

        {tab === "chat" && (
          <div className="mt-6 space-y-4">
            <div>
              <div className="text-[10px] font-bold text-primary uppercase tracking-widest">AI &amp; Local Reasoning</div>
              <h2 className="text-xl font-bold tracking-tight">Ask Assistant</h2>
              <p className="text-xs text-muted-foreground">Query invoice exceptions, high-risk vendors, over-limit claims, and reviewer decisions.</p>
            </div>
            {res ? (
              <Chat />
            ) : (
              <Card className="p-8 text-center space-y-3">
                <p className="text-xs text-muted-foreground">Load an invoice batch first so the assistant can answer questions about your data.</p>
                <Button onClick={() => load(api.post("/sample"))}>Load Sample Data</Button>
              </Card>
            )}
          </div>
        )}

        {tab === "how" && <div className="mt-6"><HowItWorks /></div>}

        {/* Evidence Detail Modal / Drawer */}
        {row && (
          <Detail
            row={row}
            rows={res?.rows || []}
            error={err}
            saving={busy}
            onPick={setSel}
            onClose={() => setSel(null)}
            onDecide={decide}
          />
        )}

        {/* Invoice Scanner Modal */}
        {ocrOpen && (
          <Suspense fallback={<div className="fixed inset-0 z-50 grid place-items-center bg-background/80 backdrop-blur-sm p-4"><div className="text-xs font-semibold">Opening Scanner…</div></div>}>
            <OCRIntake
              onClose={() => setOcrOpen(false)}
              onAnalyze={(data) => {
                setRes(data);
                setSel(null);
                setTab("results");
                setFilter("ALL");
                setQ("");
                setExceptionsFirst(true);
                setErr("");
                setDemoTour(false);
              }}
            />
          </Suspense>
        )}
      </main>
    </div>
  );
}

function HowItWorks() {
  return (
    <Card className="p-6 md:p-8 space-y-6 border-border bg-card">
      <div className="space-y-1.5 max-w-2xl">
        <Badge variant="outline" className="text-primary border-primary/30 text-[10px] font-bold uppercase tracking-wider">
          Built for Human Oversight
        </Badge>
        <h2 className="text-2xl font-bold tracking-tight">Automation finds the signal. People own the decision.</h2>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Clean rows auto-pass. Every exception remains available for human review; the system never makes irreversible payment decisions without accountability.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { title: "01 · Deterministic Checks", desc: "Rules scan every row for duplicate invoices, missing fields, invalid dates, category limits, and possible split claims." },
          { title: "02 · Similarity Signals", desc: "Vendor and invoice-number similarity help rank likely matches. Borderline cases stay in the review queue." },
          { title: "03 · Trained Anomaly Model", desc: "An Isolation Forest trained on 40,000 synthetic clean invoices surfaces unusual spend patterns without hallucinations." },
          { title: "04 · Human Review Decisions", desc: "A reviewer sees side-by-side evidence, selects a business reason, and records an approval or rejection." },
          { title: "05 · Document Intake & Audit", desc: "Invoice photos and PDFs are read in the browser; reviewers confirm extracted fields with SOX 404 audit seals." }
        ].map((item, idx) => (
          <Card key={idx} className="p-4 shadow-xs border-border bg-card">
            <b className="text-xs font-bold text-primary block mb-1">{item.title}</b>
            <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
          </Card>
        ))}
      </div>
    </Card>
  );
}
