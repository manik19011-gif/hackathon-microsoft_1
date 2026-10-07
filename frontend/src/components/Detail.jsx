import { useState, useEffect } from "react";
import api from "../api";
import { FIELDS } from "../ui";
import Timeline from "./Timeline";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Sparkles, Mail, Copy, Send, CheckCircle2, XCircle, AlertTriangle, ShieldAlert, CreditCard, ArrowRight } from "lucide-react";

const REASONS = [
  ["legit_repeat", "Legit repeat"],
  ["confirmed_duplicate", "Confirmed duplicate"],
  ["vendor_error", "Vendor error"],
  ["other", "Other"]
];

export default function Detail({ row, onClose, onDecide, rows, onPick, saving = false, error = "" }) {
  const [ai, setAi] = useState(null);
  const [reason, setReason] = useState("");
  const [explaining, setExplaining] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeSubject, setDisputeSubject] = useState("");
  const [disputeBody, setDisputeBody] = useState("");
  const [disputeSaved, setDisputeSaved] = useState(false);
  const [disputeSaving, setDisputeSaving] = useState(false);

  useEffect(() => {
    setAi(null);
    setReason("");
    setDisputeOpen(false);
    setDisputeSaved(false);
    const sub = `Billing Discrepancy Notice: Invoice ${row.invoice_no || row.invoice_id} - ${row.vendor || "Vendor"}`;
    const bod = `Dear Accounts Receivable Team at ${row.vendor || "Vendor"},\n\nRegarding Invoice ${row.invoice_no || row.invoice_id} dated ${row.date || "N/A"} in the amount of $${row.amount_usd || row.amount}:\n\nOur financial compliance and internal controls system (Veri-Fi) has flagged the following discrepancy requiring formal clarification prior to payment release:\n\n• Finding: ${row.explanation || "Exception flagged during automated pre-payment audit."}\n${row.po_match ? `• PO Reference: ${row.po_number} (${row.po_match.status})\n` : ""}${row.sanctions_status ? `• Watchlist Screen: Entity requires compliance review.\n` : ""}\nPlease review this matter and provide either a revised invoice, credit memorandum, or necessary proof of fulfillment.\n\nSincerely,\nAccounts Payable & Internal Audit\nVeri-Fi Corporate Treasury`;
    setDisputeSubject(sub);
    setDisputeBody(bod);
  }, [row.invoice_id]);

  const open = row.status !== "AUTO_PASS";
  const decide = d => { if (open && reason && !saving) onDecide(row.invoice_id, d, reason); };

  useEffect(() => {
    const h = e => {
      if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;
      if (e.key === "Escape") onClose();
      else if (open && /^[1-4]$/.test(e.key)) setReason(REASONS[Number(e.key) - 1][0]);
      else if (e.key.toLowerCase() === "a") decide("APPROVED");
      else if (e.key.toLowerCase() === "r") decide("REJECTED");
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  const explain = async () => {
    setExplaining(true);
    try {
      const { data } = await api.get("/explain/" + encodeURIComponent(row.invoice_id));
      setAi(data);
    } catch (e) {
      setAi({ text: e.response?.data?.detail || "Could not load the explanation.", source: "error" });
    } finally {
      setExplaining(false);
    }
  };

  const saveDispute = async () => {
    setDisputeSaving(true);
    try {
      await api.post("/disputes", {
        invoice_id: row.invoice_id,
        vendor: row.vendor || "Unknown Vendor",
        subject: disputeSubject,
        body: disputeBody
      });
      setDisputeSaved(true);
    } catch (e) {
      alert("Could not save dispute notice: " + (e.response?.data?.detail || e.message));
    } finally {
      setDisputeSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="presentation">
      <div className="fixed inset-0 bg-background/80 backdrop-blur-sm transition-opacity" onClick={onClose} aria-label="Close invoice details" />
      <aside role="dialog" aria-modal="true" aria-label={"Invoice details: " + row.invoice_id} className="relative z-50 w-full max-w-xl h-full border-l bg-card text-card-foreground shadow-2xl overflow-y-auto p-6 space-y-5">
        <div className="flex justify-between items-start pb-2 border-b">
          <div>
            <h2 className="text-xl font-bold tracking-tight">{row.invoice_id}</h2>
            <p className="text-sm text-muted-foreground">{row.vendor || "No vendor recorded"}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close invoice details" className="rounded-full">
            ✕
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={row.status === "FLAGGED" ? "destructive" : row.status === "NEEDS_REVIEW" ? "secondary" : "default"}>
            {row.status}
          </Badge>
          {row.flags.some(f => f.rule !== "R10_MODEL_OUTLIER") && (
            <span className="text-xs text-muted-foreground font-medium">Rule score {Math.round(row.confidence * 100)}%</span>
          )}
          {row.human_decision && (
            <Badge variant="outline" className="text-xs">
              Reviewer: {row.human_decision.toLowerCase()}{row.human_reason ? " (" + row.human_reason.replace("_", " ") + ")" : ""}
            </Badge>
          )}
        </div>

        {/* Enterprise & Forensic Intelligence Badges */}
        <div className="flex flex-wrap gap-1.5 text-xs">
          {row.sanctions_status && (
            <Badge variant="destructive" className="flex items-center gap-1">
              <ShieldAlert className="h-3 w-3" /> OFAC / AML WATCHLIST MATCH ({row.sanctions_status.source})
            </Badge>
          )}
          {row.card_match && (
            <Badge variant="secondary" className="flex items-center gap-1 bg-amber-500/15 text-amber-900 dark:text-amber-200 border-amber-500/30">
              <CreditCard className="h-3 w-3" /> CORP CARD DOUBLE-DIP (*{row.card_match.card_last4} &bull; ${row.card_match.amount})
            </Badge>
          )}
          {row.discount_opportunity && (
            <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-900 dark:text-emerald-200 border-emerald-500/30">
              💰 Save ${row.discount_opportunity.savings} ({row.discount_opportunity.terms})
            </Badge>
          )}
          {row.approval_tier && (
            <Badge variant="outline">
              🏛 {row.approval_tier}
            </Badge>
          )}
          {row.currency && row.currency !== "USD" && (
            <Badge variant="outline">
              💱 {row.currency} {Number(row.original_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })} ≈ ${Number(row.amount_usd).toLocaleString(undefined, { minimumFractionDigits: 2 })} USD
            </Badge>
          )}
          {row.po_number && (
            <Badge variant="outline">
              📄 PO: {row.po_number}{row.po_match?.status === "MATCHED" ? " (3-Way Matched ✓)" : row.po_match?.status === "OVER_TOLERANCE" ? " (Price Variance ⚠)" : ""}
            </Badge>
          )}
          {row.bank_account && (
            <Badge variant="outline">
              🏦 Remittance: ****{String(row.bank_account).slice(-4)}
            </Badge>
          )}
        </div>

        {/* Action Discrepancy Button */}
        {row.status !== "AUTO_PASS" && (
          <div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDisputeOpen(v => !v)}
              className="w-full flex items-center justify-center gap-2 border-primary/30 hover:bg-primary/5"
            >
              <Mail className="h-4 w-4 text-primary" /> Action Discrepancy: Draft Vendor Dispute Letter
            </Button>
          </div>
        )}

        {/* Dispute Letter Drafter Modal / Panel */}
        {disputeOpen && (
          <Card className="border-primary/20 bg-muted/40">
            <CardHeader className="p-4 pb-2">
              <div className="flex justify-between items-center">
                <CardTitle className="text-xs uppercase font-bold tracking-wider">
                  Formal Vendor Clarification &amp; Dispute Drafter
                </CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setDisputeOpen(false)} className="h-6 w-6 p-0">✕</Button>
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-2 space-y-3">
              <div>
                <label className="text-[11px] font-bold block mb-1">Subject</label>
                <Input
                  value={disputeSubject}
                  onChange={e => setDisputeSubject(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold block mb-1">Letter Body</label>
                <textarea
                  rows={6}
                  value={disputeBody}
                  onChange={e => setDisputeBody(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-md border border-input bg-background font-mono leading-relaxed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { navigator.clipboard.writeText(disputeBody); alert("Dispute letter copied to clipboard!"); }}
                    className="h-8 text-xs"
                  >
                    <Copy className="h-3.5 w-3.5 mr-1" /> Copy Text
                  </Button>
                  <Button
                    asChild
                    variant="secondary"
                    size="sm"
                    className="h-8 text-xs"
                  >
                    <a
                      href={`mailto:ar@${String(row.vendor || 'supplier').toLowerCase().replace(/[^a-z0-9]/g, '')}.com?subject=${encodeURIComponent(disputeSubject)}&body=${encodeURIComponent(disputeBody)}`}
                    >
                      <Send className="h-3.5 w-3.5 mr-1" /> Open Mail Client
                    </a>
                  </Button>
                </div>
                <Button
                  size="sm"
                  disabled={disputeSaving || disputeSaved}
                  onClick={saveDispute}
                  className="h-8 text-xs"
                >
                  {disputeSaved ? "✓ Dispute Logged" : disputeSaving ? "Logging..." : "Log Dispute"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {row.model_anomaly_score !== null && row.model_anomaly_score !== undefined && (
          <Card className="border-teal-500/20 bg-teal-500/5">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-foreground">Trained model anomaly score</span>
                <Badge variant="outline" className="font-bold border-teal-500 text-teal-600 dark:text-teal-400">
                  {Number(row.model_anomaly_score).toFixed(1)} / 100
                </Badge>
              </div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Percentile against a separate synthetic clean-invoice baseline. It indicates rarity, not a fraud probability; only a human reviewer can decide what happens next.
              </p>
            </CardContent>
          </Card>
        )}

        {error && (
          <div role="alert" className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> {error}
          </div>
        )}

        <Timeline rows={rows || []} row={row} onPick={onPick} />

        {row.flags.map((f, i) => (
          <Card key={i} className="border">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm font-semibold flex items-center justify-between">
                <span>{f.rule}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {f.rule === "R10_MODEL_OUTLIER" ? "(low-confidence model signal)" : `(rule score ${Math.round(f.confidence * 100)}%)`}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-1 space-y-3">
              <p className="text-xs text-foreground leading-relaxed">{f.message}</p>
              {(f.signals || []).length > 0 && (
                <div className="space-y-1.5 pt-2">
                  {f.signals.map(s => (
                    <div key={s.label} className="flex items-center gap-2 text-xs">
                      <span className="w-36 text-muted-foreground truncate">{s.label}</span>
                      <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: Math.round(s.strength * 100) + "%" }} />
                      </div>
                      <span className="w-20 text-right font-mono text-[11px]">{s.value}</span>
                    </div>
                  ))}
                  <p className="text-[11px] text-muted-foreground pt-1">
                    {f.rule === "R10_MODEL_OUTLIER" ? "These peer and policy signals explain a rarity score against synthetic baseline." : "Built from signals above. Rule score, not calibrated probability."}
                  </p>
                </div>
              )}
              {f.matched && (
                <div className="pt-2">
                  <Table className="text-xs">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="h-7 text-muted-foreground"></TableHead>
                        <TableHead className="h-7 font-bold">This invoice</TableHead>
                        <TableHead className="h-7 font-bold">Matched {f.matched.invoice_id}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {FIELDS.map(([k, l]) => (
                        <TableRow key={k} className="h-7">
                          <TableCell className="py-1 text-muted-foreground font-medium">{l}</TableCell>
                          <TableCell className="py-1 font-mono">{row[k] ?? "-"}</TableCell>
                          <TableCell className="py-1 font-mono">{f.matched[k] ?? "-"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        ))}

        {!open && <p className="text-sm text-muted-foreground">{row.explanation}</p>}

        {open && (
          <div className="pt-2 space-y-4">
            <Button
              variant="outline"
              size="sm"
              onClick={explain}
              disabled={explaining}
              className="gap-1.5 text-xs"
            >
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              {explaining ? "Preparing explanation…" : "Explain with AI"}
            </Button>

            {ai && (
              <div className="text-xs rounded-lg border bg-muted/50 p-3 leading-relaxed">
                <p>{ai.text}</p>
                <span className="block text-[10px] text-muted-foreground mt-1.5">Source: {ai.source}</span>
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-2">Audit Decision Reason (required)</label>
              <div className="flex flex-wrap gap-2">
                {REASONS.map(([k, l], i) => (
                  <Button
                    key={k}
                    variant={reason === k ? "default" : "outline"}
                    size="sm"
                    onClick={() => setReason(k)}
                    className="text-xs rounded-full h-8"
                  >
                    {i + 1}. {l}
                  </Button>
                ))}
              </div>
            </div>

            <Separator />

            <div className="flex items-center gap-3 pt-2">
              <Button
                disabled={!reason || saving}
                onClick={() => decide("APPROVED")}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
              >
                <CheckCircle2 className="h-4 w-4" /> {saving ? "Saving…" : "Approve (A)"}
              </Button>
              <Button
                disabled={!reason || saving}
                variant="destructive"
                onClick={() => decide("REJECTED")}
                className="flex-1 gap-1.5"
              >
                <XCircle className="h-4 w-4" /> {saving ? "Saving…" : "Reject (R)"}
              </Button>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
