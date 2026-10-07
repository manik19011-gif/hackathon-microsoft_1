import { useState, useEffect } from "react";
import api from "../api";
import { Badge, FIELDS } from "../ui";
import Timeline from "./Timeline";

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
    <div className="fixed inset-0 z-40" role="presentation">
      <button className="absolute inset-0 w-full h-full bg-slate-950/40" onClick={onClose} aria-label="Close invoice details" />
      <aside role="dialog" aria-modal="true" aria-label={"Invoice details: " + row.invoice_id} className="absolute inset-y-0 right-0 w-full max-w-xl bg-white shadow-2xl overflow-y-auto p-6">
        <div className="flex justify-between items-start">
          <div>
            <div className="text-lg font-semibold">{row.invoice_id}</div>
            <div className="text-sm text-slate-500">{row.vendor || "No vendor"}</div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900 text-xl leading-none rounded p-2" aria-label="Close invoice details">×</button>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <Badge s={row.status} />
          {row.flags.some(f => f.rule !== "R10_MODEL_OUTLIER") && (
            <span className="text-sm text-slate-500">Rule score {Math.round(row.confidence * 100)}%</span>
          )}
          {row.human_decision && (
            <span className="text-sm font-medium">Reviewer: {row.human_decision.toLowerCase()}{row.human_reason ? " (" + row.human_reason.replace("_", " ") + ")" : ""}</span>
          )}
        </div>

        {/* Enterprise & Forensic Intelligence Badges */}
        <div className="mt-2.5 flex flex-wrap gap-1.5 text-xs">
          {row.sanctions_status && (
            <span className="px-2.5 py-1 rounded bg-red-100 border border-red-300 text-red-900 font-bold flex items-center gap-1">
              ⛔ OFAC / AML WATCHLIST MATCH ({row.sanctions_status.source})
            </span>
          )}
          {row.card_match && (
            <span className="px-2.5 py-1 rounded bg-amber-100 border border-amber-300 text-amber-900 font-bold flex items-center gap-1">
              💳 CORP CARD DOUBLE-DIP (*{row.card_match.card_last4} &bull; ${row.card_match.amount})
            </span>
          )}
          {row.discount_opportunity && (
            <span className="px-2.5 py-1 rounded bg-emerald-100 border border-emerald-300 text-emerald-900 font-bold flex items-center gap-1">
              💰 EARLY-PAY DISCOUNT: Save ${row.discount_opportunity.savings} ({row.discount_opportunity.terms})
            </span>
          )}
          {row.approval_tier && (
            <span className="px-2.5 py-1 rounded bg-indigo-50 border border-indigo-200 text-indigo-900 font-medium">
              🏛 {row.approval_tier}
            </span>
          )}
          {row.currency && row.currency !== "USD" && (
            <span className="px-2.5 py-1 rounded bg-teal-50 border border-teal-200 text-teal-900 font-medium">
              💱 {row.currency} {Number(row.original_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })} ≈ ${Number(row.amount_usd).toLocaleString(undefined, { minimumFractionDigits: 2 })} USD
            </span>
          )}
          {row.po_number && (
            <span className="px-2.5 py-1 rounded bg-blue-50 border border-blue-200 text-blue-900 font-medium">
              📄 PO: {row.po_number}{row.po_match?.status === "MATCHED" ? " (3-Way Matched ✓)" : row.po_match?.status === "OVER_TOLERANCE" ? " (Price Variance ⚠)" : ""}
            </span>
          )}
          {row.bank_account && (
            <span className="px-2.5 py-1 rounded bg-slate-100 border border-slate-300 text-slate-800">
              🏦 Remittance: ****{String(row.bank_account).slice(-4)}
            </span>
          )}
        </div>

        {/* Action Discrepancy Button */}
        {row.status !== "AUTO_PASS" && (
          <div className="mt-3">
            <button
              onClick={() => setDisputeOpen(v => !v)}
              className="px-3 py-1.5 rounded-lg border border-purple-300 bg-purple-50 hover:bg-purple-100 text-purple-900 text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <span>✉</span> Action Discrepancy: Draft Vendor Dispute Letter
            </button>
          </div>
        )}

        {/* Dispute Letter Drafter Modal / Panel */}
        {disputeOpen && (
          <div className="mt-3 p-4 rounded-xl border border-purple-200 bg-purple-50/50 space-y-3">
            <div className="flex justify-between items-center">
              <b className="text-xs uppercase font-extrabold text-purple-900 tracking-wider">
                Formal Vendor Clarification &amp; Dispute Drafter
              </b>
              <button onClick={() => setDisputeOpen(false)} className="text-purple-400 hover:text-purple-700 font-bold text-sm">✕</button>
            </div>
            <div>
              <label className="text-[11px] font-bold text-purple-900 block mb-1">Subject</label>
              <input
                value={disputeSubject}
                onChange={e => setDisputeSubject(e.target.value)}
                className="w-full text-xs p-2 rounded border border-purple-200 bg-white"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-purple-900 block mb-1">Letter Body</label>
              <textarea
                rows={7}
                value={disputeBody}
                onChange={e => setDisputeBody(e.target.value)}
                className="w-full text-xs p-2 rounded border border-purple-200 bg-white font-mono leading-relaxed"
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex gap-2">
                <button
                  onClick={() => { navigator.clipboard.writeText(disputeBody); alert("Dispute letter copied to clipboard!"); }}
                  className="px-2.5 py-1 rounded bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold"
                >
                  📋 Copy Text
                </button>
                <a
                  href={`mailto:ar@${String(row.vendor || 'supplier').toLowerCase().replace(/[^a-z0-9]/g, '')}.com?subject=${encodeURIComponent(disputeSubject)}&body=${encodeURIComponent(disputeBody)}`}
                  className="px-2.5 py-1 rounded bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold inline-block"
                >
                  🚀 Open Mail Client
                </a>
              </div>
              <button
                disabled={disputeSaving || disputeSaved}
                onClick={saveDispute}
                className="px-3 py-1 rounded bg-purple-800 text-white text-xs font-bold hover:bg-purple-900 disabled:opacity-50"
              >
                {disputeSaved ? "✓ Dispute Logged" : disputeSaving ? "Logging..." : "Log Official Dispute"}
              </button>
            </div>
          </div>
        )}

        {row.model_anomaly_score !== null && row.model_anomaly_score !== undefined && (
          <div className="mt-4 rounded-xl border border-teal-200 bg-teal-50 p-3">
            <div className="flex items-center justify-between gap-3">
              <b className="text-sm text-teal-950">Trained model anomaly score</b>
              <span className="rounded-full bg-white px-2.5 py-1 text-sm font-semibold text-teal-800">
                {Number(row.model_anomaly_score).toFixed(1)} / 100
              </span>
            </div>
            <p className="mt-1 text-xs leading-5 text-teal-900">
              Percentile against a separate synthetic clean-invoice baseline. It indicates rarity, not a fraud probability; only a human reviewer can decide what happens next.
            </p>
          </div>
        )}

        {error && <div role="alert" className="mt-3 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
        <Timeline rows={rows || []} row={row} onPick={onPick} />

        {row.flags.map((f, i) => (
          <div key={i} className="mt-4 border border-slate-200 rounded-lg p-3">
            <div className="text-sm font-medium">
              {f.rule} <span className="text-slate-500 font-normal">{f.rule === "R10_MODEL_OUTLIER" ? "(low-confidence model signal)" : "(rule score " + Math.round(f.confidence * 100) + "%)"}</span>
            </div>
            <p className="text-sm mt-1">{f.message}</p>
            {(f.signals || []).length > 0 && (
              <div className="mt-3 space-y-1">
                {f.signals.map(s => (
                  <div key={s.label} className="flex items-center gap-2 text-xs">
                    <span className="w-40 text-slate-500">{s.label}</span>
                    <div className="flex-1 h-1.5 bg-slate-100 rounded">
                      <div className="h-1.5 bg-blue-500 rounded" style={{ width: Math.round(s.strength * 100) + "%" }} />
                    </div>
                    <span className="w-20 text-right">{s.value}</span>
                  </div>
                ))}
                <p className="text-xs text-slate-400">
                  {f.rule === "R10_MODEL_OUTLIER" ? "These peer and policy signals explain a rarity score against the model’s synthetic baseline; it is not a fraud probability." : "Built from the signals above. It is a rule score, not a calibrated probability."}
                </p>
              </div>
            )}
            {f.matched && (
              <table className="w-full text-sm mt-3">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="py-1"></th>
                    <th>This invoice</th>
                    <th>Matched {f.matched.invoice_id}</th>
                  </tr>
                </thead>
                <tbody>
                  {FIELDS.map(([k, l]) => (
                    <tr key={k} className="border-t border-slate-100">
                      <td className="py-1 text-slate-500">{l}</td>
                      <td>{row[k] ?? "-"}</td>
                      <td>{f.matched[k] ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}

        {!open && <p className="mt-4 text-sm text-slate-600">{row.explanation}</p>}

        {open && (
          <div className="mt-4">
            <button onClick={explain} disabled={explaining} className="text-sm text-blue-700 underline disabled:opacity-50">
              {explaining ? "Preparing explanation…" : "Explain with AI"}
            </button>
            {ai && (
              <p className="text-sm mt-2 bg-slate-50 rounded p-3">
                {ai.text}
                <span className="block text-xs text-slate-400 mt-1">Source: {ai.source}</span>
              </p>
            )}
            <div className="mt-5 text-sm text-slate-500">Reason (required)</div>
            <div className="mt-1 flex flex-wrap gap-2">
              {REASONS.map(([k, l], i) => (
                <button
                  key={k}
                  onClick={() => setReason(k)}
                  className={"px-3 py-1 rounded-full border text-sm " + (reason === k ? "bg-blue-600 text-white border-blue-600" : "border-slate-300 bg-white")}
                >
                  {i + 1}. {l}
                </button>
              ))}
            </div>
            <div className="mt-4 flex gap-2">
              <button disabled={!reason || saving} onClick={() => decide("APPROVED")} className="px-3 py-1.5 rounded bg-emerald-600 text-white text-sm disabled:opacity-40">
                {saving ? "Saving…" : "Approve (A)"}
              </button>
              <button disabled={!reason || saving} onClick={() => decide("REJECTED")} className="px-3 py-1.5 rounded bg-red-600 text-white text-sm disabled:opacity-40">
                {saving ? "Saving…" : "Reject (R)"}
              </button>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
