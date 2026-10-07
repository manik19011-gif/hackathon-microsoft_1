import { useState, useEffect } from "react";
import api from "../api";
import { money } from "../ui";

export default function Forensics({ res }) {
  const [benford, setBenford] = useState(res?.benford || null);
  const [loading, setLoading] = useState(!benford);

  useEffect(() => {
    if (!benford) {
      setLoading(true);
      api.get("/forensics/benford")
        .then(r => setBenford(r.data))
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [res]);

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Calculating Benford's Law forensic distribution...</div>;
  }

  if (!benford || !benford.ready) {
    return (
      <div className="empty-state mt-6">
        <div className="empty-icon">▲</div>
        <h3>Forensic Dataset Required</h3>
        <p>Benford's Law analysis requires at least 10 positive transaction amounts. Load the sample batch or upload invoice data to inspect first-digit conformity.</p>
      </div>
    );
  }

  const { distribution, chi_square, risk_rating, spikes, total_analyzed } = benford;
  const isHighRisk = risk_rating === "High Forensic Anomaly";
  const isModerate = risk_rating === "Moderate Deviation";

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-5">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-blue-600">Forensic Fraud Detection</div>
            <h2 className="text-xl font-bold text-slate-900 mt-0.5">Benford's Law First-Digit Distribution</h2>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl">
              Naturally occurring financial transactions follow a logarithmic digit frequency (Frank Benford, 1938). Significant divergence from expected frequencies indicates manual number fabrication, split claims, or threshold-skimming smurfing.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-[11px] font-semibold text-slate-400 uppercase">Chi-Square (χ²)</div>
              <div className="text-xl font-extrabold text-slate-900">{chi_square}</div>
            </div>
            <span className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider ${
              isHighRisk ? "bg-red-100 text-red-800 border border-red-300" :
              isModerate ? "bg-amber-100 text-amber-800 border border-amber-300" :
              "bg-emerald-100 text-emerald-800 border border-emerald-300"
            }`}>
              {risk_rating}
            </span>
          </div>
        </div>

        {/* Visual Bar Chart comparing Observed vs Expected */}
        <div className="mt-6">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2 font-medium">
            <span>First Digit (1-9)</span>
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-blue-600 inline-block"/> Observed Frequency</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-slate-300 inline-block"/> Benford Expected</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-500 inline-block"/> Statistical Spike (&gt;5%)</span>
            </div>
          </div>

          <div className="grid grid-cols-9 gap-3 pt-4 pb-2 items-end h-64 border-b border-slate-200">
            {distribution.map(d => {
              const maxPct = 40;
              const obsHeight = Math.min(100, (d.observed_pct / maxPct) * 100);
              const expHeight = Math.min(100, (d.benford_pct / maxPct) * 100);
              const isSpike = d.is_spike;

              return (
                <div key={d.digit} className="flex flex-col items-center h-full justify-end group relative">
                  {/* Tooltip */}
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none absolute -top-12 bg-slate-900 text-white text-[11px] rounded py-1 px-2 z-20 whitespace-nowrap shadow-lg">
                    Digit {d.digit}: {d.observed_pct}% observed vs {d.benford_pct}% expected ({d.count} invoices)
                  </div>

                  <div className="w-full flex items-end justify-center gap-1 h-48">
                    {/* Observed Bar */}
                    <div
                      style={{ height: `${obsHeight}%` }}
                      className={`w-1/2 rounded-t transition-all ${
                        isSpike ? "bg-red-500 hover:bg-red-600" : "bg-blue-600 hover:bg-blue-700"
                      }`}
                    />
                    {/* Expected Reference Bar */}
                    <div
                      style={{ height: `${expHeight}%` }}
                      className="w-1/2 rounded-t bg-slate-200 hover:bg-slate-300 transition-all"
                    />
                  </div>

                  <div className="text-center mt-2">
                    <span className="block font-bold text-sm text-slate-800">{d.digit}</span>
                    <span className={`block text-[10px] font-semibold ${isSpike ? "text-red-600" : "text-slate-500"}`}>
                      {d.observed_pct}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Spike Alerts */}
        {spikes && spikes.length > 0 && (
          <div className="mt-5 p-3.5 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-3">
            <span className="text-lg">⚠</span>
            <div className="text-xs text-amber-900">
              <b className="font-bold">Anomalous Digit Concentrations Detected:</b>
              <p className="mt-0.5">
                Digits <strong>{spikes.join(", ")}</strong> exceed theoretical Benford bounds by more than 5.0%. Review invoices beginning with these amounts for repeated micro-claims, artificial policy threshold structuring (e.g. $4,990 to evade $5,000 limits), or copied templates.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Numerical Analysis Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Detailed Digit Goodness-of-Fit Table</h3>
          <span className="text-xs text-slate-500 font-medium">Sample Population: {total_analyzed} positive claims</span>
        </div>
        <table className="w-full text-xs text-left">
          <thead className="bg-slate-100 text-slate-600 uppercase font-semibold border-b border-slate-200">
            <tr>
              <th className="py-2.5 px-4">Digit</th>
              <th className="py-2.5 px-4">Invoice Count</th>
              <th className="py-2.5 px-4">Observed %</th>
              <th className="py-2.5 px-4">Benford Expected %</th>
              <th className="py-2.5 px-4">Variance (Δ)</th>
              <th className="py-2.5 px-4">Forensic Assessment</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {distribution.map(d => (
              <tr key={d.digit} className={d.is_spike ? "bg-red-50/40" : "hover:bg-slate-50"}>
                <td className="py-2.5 px-4 font-bold text-slate-900">Leading Digit {d.digit}</td>
                <td className="py-2.5 px-4 text-slate-700">{d.count}</td>
                <td className="py-2.5 px-4 font-semibold text-slate-900">{d.observed_pct}%</td>
                <td className="py-2.5 px-4 text-slate-500">{d.benford_pct}%</td>
                <td className={`py-2.5 px-4 font-bold ${
                  d.variance > 0 ? "text-blue-700" : "text-slate-600"
                }`}>
                  {d.variance > 0 ? `+${d.variance}%` : `${d.variance}%`}
                </td>
                <td className="py-2.5 px-4">
                  {d.is_spike ? (
                    <span className="inline-block px-2 py-0.5 rounded bg-red-100 text-red-700 font-bold text-[10px]">
                      ANOMALOUS SPIKE
                    </span>
                  ) : (
                    <span className="text-slate-500">Conforming</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
