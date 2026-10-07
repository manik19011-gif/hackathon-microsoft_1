import { useState, useEffect } from "react";
import api from "../api";
import { money } from "../ui";

export default function Discounts({ res, onSelectInvoice }) {
  const [discounts, setDiscounts] = useState(res?.discounts || []);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!res?.discounts) {
      setLoading(true);
      api.get("/discounts/pipeline")
        .then(r => setDiscounts(r.data))
        .catch(() => {})
        .finally(() => setLoading(false));
    } else {
      setDiscounts(res.discounts);
    }
  }, [res]);

  const totalSavings = discounts.reduce((acc, d) => acc + (d.savings || 0), 0);
  const totalSpend = discounts.reduce((acc, d) => acc + (d.amount || 0), 0);
  const avgApr = discounts.length > 0 ? (discounts.reduce((acc, d) => acc + (d.annualized_apr || 0), 0) / discounts.length).toFixed(1) : "0.0";

  return (
    <div className="space-y-6">
      {/* Top Banner & Treasury Insights */}
      <div className="bg-gradient-to-r from-emerald-900 to-teal-900 text-white rounded-xl p-6 shadow-sm border border-emerald-800">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-emerald-300">Working Capital & Treasury Optimizer</div>
            <h2 className="text-2xl font-extrabold tracking-tight mt-1">Early-Payment Discount Pipeline</h2>
            <p className="text-xs text-emerald-100/80 mt-1 max-w-2xl leading-relaxed">
              Suppliers offer dynamic terms (e.g., 2/10 Net 30) for accelerated settlement. Paying within 10 days yields an annualized return exceeding 36% APR—delivering guaranteed risk-free cash savings directly to EBITDA.
            </p>
          </div>
          <div className="flex gap-4">
            <div className="bg-white/10 backdrop-blur-md rounded-lg p-3 text-center min-w-[120px] border border-white/15">
              <div className="text-[11px] text-emerald-200 uppercase font-bold">Total Capture Savings</div>
              <div className="text-2xl font-black text-emerald-300 mt-0.5">${totalSavings.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
            </div>
            <div className="bg-white/10 backdrop-blur-md rounded-lg p-3 text-center min-w-[100px] border border-white/15">
              <div className="text-[11px] text-emerald-200 uppercase font-bold">Weighted APR</div>
              <div className="text-2xl font-black text-white mt-0.5">{avgApr}%</div>
            </div>
          </div>
        </div>
      </div>

      {/* Eligible Invoices Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
            Available Discount Opportunities ({discounts.length})
          </h3>
          <span className="text-xs text-slate-500 font-medium">Eligible Payables: {money(totalSpend)}</span>
        </div>

        {discounts.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            <div className="text-2xl mb-2">💰</div>
            <p className="font-medium text-slate-700">No active early-payment discounts detected in this batch.</p>
            <p className="text-xs text-slate-400 mt-1">Include credit terms (such as '2/10 Net 30' or '1/15 Net 45') in vendor contracts or invoice descriptions to unlock dynamic discount yields.</p>
          </div>
        ) : (
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-100 text-slate-600 uppercase font-semibold border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-4">Invoice ID</th>
                <th className="py-2.5 px-4">Vendor</th>
                <th className="py-2.5 px-4">Invoice Total</th>
                <th className="py-2.5 px-4">Payment Terms</th>
                <th className="py-2.5 px-4">Discount Deadline</th>
                <th className="py-2.5 px-4">Potential Savings ($)</th>
                <th className="py-2.5 px-4">Annualized Yield (APR)</th>
                <th className="py-2.5 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {discounts.map(d => (
                <tr key={d.invoice_id} className="hover:bg-slate-50 transition-colors">
                  <td className="py-3 px-4 font-bold text-blue-600">{d.invoice_id}</td>
                  <td className="py-3 px-4 font-semibold text-slate-800">{d.vendor}</td>
                  <td className="py-3 px-4 font-medium text-slate-900">{money(d.amount)}</td>
                  <td className="py-3 px-4">
                    <span className="inline-block px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200 font-semibold text-[11px]">
                      {d.terms}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-medium text-amber-700">
                    {d.deadline ? `Pay by ${d.deadline}` : `${d.discount_days} days from invoice`}
                  </td>
                  <td className="py-3 px-4 font-bold text-emerald-600 text-sm">
                    +${Number(d.savings).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-3 px-4 font-bold text-indigo-700">
                    {d.annualized_apr}% APR
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={() => onSelectInvoice && onSelectInvoice(d.invoice_id)}
                      className="px-2.5 py-1 rounded bg-slate-900 text-white font-medium hover:bg-slate-800 text-[11px] transition-colors"
                    >
                      Prioritize Pay &rarr;
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Yield comparison guide */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 text-xs text-slate-600">
        <h4 className="font-bold text-slate-800 text-sm mb-2">Treasury Benchmarking: 2/10 Net 30 vs Other Capital Uses</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3">
          <div className="bg-white p-3 rounded-lg border border-slate-200">
            <div className="font-bold text-slate-800">Commercial Paper / Treasuries</div>
            <div className="text-xl font-black text-slate-500 mt-1">~4.5% - 5.2%</div>
            <p className="text-[11px] text-slate-400 mt-1">Standard short-term cash yields held in corporate treasury money market funds.</p>
          </div>
          <div className="bg-white p-3 rounded-lg border border-slate-200">
            <div className="font-bold text-slate-800">Late Payment Penalty</div>
            <div className="text-xl font-black text-red-500 mt-1">-18.0% APR</div>
            <p className="text-[11px] text-slate-400 mt-1">Average supplier interest charged on past-due AP invoices past 60 days.</p>
          </div>
          <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-300">
            <div className="font-bold text-emerald-900">Veri-Fi Early-Pay Capture</div>
            <div className="text-xl font-black text-emerald-600 mt-1">36.7% APR</div>
            <p className="text-[11px] text-emerald-700 mt-1">Risk-free return on operating capital by accelerating verified AP approvals.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
