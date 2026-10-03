import { useState, useEffect } from "react";
import api from "../api";

export default function Limits({ onSaved }) {
  const [rows, setRows] = useState([]), [def, setDef] = useState(5000), [name, setName] = useState(""), [msg, setMsg] = useState(""), [pv, setPv] = useState(null);
  useEffect(() => { api.get("/limits").then(({ data }) => { setRows(Object.entries(data.limits)); setDef(data.default); }).catch(() => {}); }, []);
  useEffect(() => {   // preview the impact 0.4 s after the last edit
    if (!rows.length) return;
    const t = setTimeout(() => {
      api.post("/limits/preview", { limits: Object.fromEntries(rows.map(([k, v]) => [k, Number(v)])), default: Number(def) })
        .then(({ data }) => setPv(data)).catch(() => setPv(null));
    }, 400);
    return () => clearTimeout(t);
  }, [rows, def]);
  const set = (i, v) => setRows(r => r.map((x, j) => (j === i ? [x[0], v] : x)));
  const add = () => {
    const n = name.trim().toLowerCase();
    if (!n || rows.some(r => r[0] === n)) return;
    setRows(r => [...r, [n, 1000]]); setName("");
  };
  const save = async () => {
    setMsg("");
    try {
      const { data } = await api.put("/limits", { limits: Object.fromEntries(rows.map(([k, v]) => [k, Number(v)])), default: Number(def) });
      setMsg(data.rerun ? "Saved. All invoices were checked again with the new limits." : "Saved. Load your file again to apply the new limits.");
      if (onSaved) onSaved();
    } catch (e) { setMsg(e.response?.data?.detail || "Could not save the limits."); }
  };
  const input = "border border-slate-300 rounded px-2 py-1 w-32 text-right";
  return <div className="bg-white rounded-lg border border-slate-200 p-4 max-w-xl">
    <p className="text-sm text-slate-500 mb-3">Claims above these amounts are flagged. Changing a limit re-checks the loaded invoices.</p>
    <table className="w-full text-sm"><tbody>
      {rows.map(([k, v], i) => <tr key={k} className="border-t border-slate-100">
        <td className="py-2 capitalize">{k}</td>
        <td className="text-right"><input type="number" min="1" value={v} onChange={e => set(i, e.target.value)} className={input} /></td>
        <td className="pl-2"><button onClick={() => setRows(r => r.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-600" aria-label={"Remove " + k}>x</button></td></tr>)}
      <tr className="border-t border-slate-100"><td className="py-2 text-slate-500">Any other category</td>
        <td className="text-right"><input type="number" min="1" value={def} onChange={e => setDef(e.target.value)} className={input} /></td><td></td></tr>
    </tbody></table>
    <div className="flex gap-2 mt-4">
      <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} placeholder="New category" className="border border-slate-300 rounded px-3 py-1 text-sm" />
      <button onClick={add} className="px-3 py-1 rounded border border-slate-300 text-sm">Add category</button>
      <button onClick={save} className="ml-auto px-4 py-1 rounded bg-blue-600 text-white text-sm">Save limits</button>
    </div>
    {pv && JSON.stringify(pv.now) !== JSON.stringify(pv.then) && <p className="mt-3 text-sm bg-amber-50 border border-amber-200 rounded p-2">
      If you save: flagged {pv.now.flagged} to {pv.then.flagged}, needs review {pv.now.review} to {pv.then.review}, money at risk {Number(pv.now.money_at_risk).toLocaleString("en-IN", { maximumFractionDigits: 0 })} to {Number(pv.then.money_at_risk).toLocaleString("en-IN", { maximumFractionDigits: 0 })}.</p>}
    {msg && <p className="mt-3 text-sm text-slate-600">{msg}</p>}
  </div>;
}
