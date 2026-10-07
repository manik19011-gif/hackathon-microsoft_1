import { useState, useEffect, useMemo } from "react";
import api from "../api";
import { money } from "../ui";

export default function RelationshipGraph({ res, onSelectInvoice }) {
  const [graphData, setGraphData] = useState(res?.graph || null);
  const [loading, setLoading] = useState(false);
  const [selectedNode, setSelectedNode] = useState(null);
  const [filterType, setFilterType] = useState("all");

  useEffect(() => {
    if (!res?.graph) {
      setLoading(true);
      api.get("/forensics/graph")
        .then(r => setGraphData(r.data))
        .catch(() => {})
        .finally(() => setLoading(false));
    } else {
      setGraphData(res.graph);
    }
  }, [res]);

  const nodes = graphData?.nodes || [];
  const links = graphData?.links || [];

  // Compute 2D coordinates for visual layout
  const layout = useMemo(() => {
    if (!nodes.length) return { nodeMap: {}, width: 850, height: 500 };
    const width = 850, height = 500;
    const centerX = width / 2, centerY = height / 2;

    const employees = nodes.filter(n => n.type === "employee");
    const vendors = nodes.filter(n => n.type === "vendor");
    const categories = nodes.filter(n => n.type === "category");

    const nodeMap = {};

    // Arrange Employees in an inner-left semi-circle
    employees.forEach((n, i) => {
      const angle = (i / Math.max(1, employees.length)) * Math.PI * 1.6 - (Math.PI * 0.8);
      nodeMap[n.id] = {
        ...n,
        x: centerX - 260 + Math.cos(angle) * 110,
        y: centerY + Math.sin(angle) * 170,
        color: "#2563eb",
        icon: "👤"
      };
    });

    // Arrange Vendors in a central column / ring
    vendors.forEach((n, i) => {
      const angle = (i / Math.max(1, vendors.length)) * Math.PI * 2;
      nodeMap[n.id] = {
        ...n,
        x: centerX + Math.cos(angle) * 90,
        y: centerY + Math.sin(angle) * 150,
        color: "#7c3aed",
        icon: "🏢"
      };
    });

    // Arrange Categories on the right side
    categories.forEach((n, i) => {
      const angle = (i / Math.max(1, categories.length)) * Math.PI * 1.4 - (Math.PI * 0.7);
      nodeMap[n.id] = {
        ...n,
        x: centerX + 260 + Math.cos(angle) * 90,
        y: centerY + Math.sin(angle) * 160,
        color: "#059669",
        icon: "🏷"
      };
    });

    return { nodeMap, width, height };
  }, [nodes]);

  const activeLinks = useMemo(() => {
    return links.filter(l => layout.nodeMap[l.source] && layout.nodeMap[l.target]);
  }, [links, layout]);

  const suspiciousClusters = useMemo(() => {
    return links.filter(l => (l.flagged || 0) > 0 || l.count >= 3);
  }, [links]);

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-5">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-purple-600">Structuring & Anti-Smurfing Graph</div>
            <h2 className="text-xl font-bold text-slate-900 mt-0.5">Entity Relationship & Collusion Network</h2>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl">
              Visualizes cross-connections between Claimants, Vendors, and Expense Categories. Smurfing patterns (repeated split invoices funnelled to favorite merchants below review thresholds) cluster automatically.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium mr-1">Filter:</span>
            {["all", "employee", "vendor", "category"].map(t => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className={`px-2.5 py-1 rounded text-xs font-semibold capitalize border transition-all ${
                  filterType === t
                    ? "bg-purple-600 text-white border-purple-600"
                    : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Interactive SVG Network Map */}
        <div className="mt-5 relative bg-slate-950 rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center p-4">
          <svg
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            className="w-full h-[480px] select-none"
          >
            {/* Background Grid Pattern */}
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1e293b" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />

            {/* Links */}
            <g className="links">
              {activeLinks.map((l, i) => {
                const src = layout.nodeMap[l.source];
                const tgt = layout.nodeMap[l.target];
                const isSuspicious = (l.flagged || 0) > 0;
                const isSelected = selectedNode && (selectedNode.id === l.source || selectedNode.id === l.target);

                return (
                  <line
                    key={i}
                    x1={src.x}
                    y1={src.y}
                    x2={tgt.x}
                    y2={tgt.y}
                    stroke={
                      isSelected ? "#38bdf8" :
                      isSuspicious ? "#ef4444" : "#475569"
                    }
                    strokeWidth={isSelected ? 3 : isSuspicious ? 2.5 : Math.min(3, 1 + l.count * 0.5)}
                    strokeDasharray={isSuspicious ? "4 2" : undefined}
                    opacity={selectedNode && !isSelected ? 0.2 : 0.75}
                  />
                );
              })}
            </g>

            {/* Nodes */}
            <g className="nodes">
              {Object.values(layout.nodeMap).map(n => {
                if (filterType !== "all" && n.type !== filterType) return null;
                const isSelected = selectedNode?.id === n.id;
                const r = n.type === "vendor" ? 18 : 15;

                return (
                  <g
                    key={n.id}
                    transform={`translate(${n.x}, ${n.y})`}
                    className="cursor-pointer group"
                    onClick={() => setSelectedNode(n)}
                  >
                    {/* Pulsing ring for selected */}
                    {isSelected && (
                      <circle r={r + 8} fill="none" stroke="#38bdf8" strokeWidth="2" strokeDasharray="3 3" className="animate-spin" />
                    )}

                    <circle
                      r={r}
                      fill={n.color}
                      stroke="#ffffff"
                      strokeWidth={isSelected ? 3 : 1.5}
                      className="transition-all hover:scale-125"
                    />
                    <text
                      textAnchor="middle"
                      dy="4"
                      fontSize="11"
                      fill="#ffffff"
                      pointerEvents="none"
                    >
                      {n.icon}
                    </text>

                    {/* Label */}
                    <text
                      textAnchor="middle"
                      dy={r + 14}
                      fontSize="10"
                      fontWeight="600"
                      fill={isSelected ? "#38bdf8" : "#94a3b8"}
                      className="pointer-events-none drop-shadow"
                    >
                      {n.label.length > 18 ? n.label.slice(0, 16) + "…" : n.label}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>

          {/* Floating Selected Node Drawer */}
          {selectedNode && (
            <div className="absolute bottom-4 left-4 right-4 bg-slate-900/95 border border-slate-700 backdrop-blur-md rounded-lg p-4 text-white text-xs flex items-center justify-between shadow-2xl">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-base">{selectedNode.icon}</span>
                  <b className="text-sm font-bold text-white">{selectedNode.label}</b>
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 uppercase text-[10px] font-bold">
                    {selectedNode.type}
                  </span>
                </div>
                <div className="text-slate-400 mt-1">
                  Connected entity in transaction graph. Connected claims: {
                    activeLinks.filter(l => l.source === selectedNode.id || l.target === selectedNode.id).reduce((s, l) => s + l.count, 0)
                  } &bull; Total volume: {
                    money(activeLinks.filter(l => l.source === selectedNode.id || l.target === selectedNode.id).reduce((s, l) => s + l.amount, 0))
                  }
                </div>
              </div>
              <button
                onClick={() => setSelectedNode(null)}
                className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
              >
                Close ✕
              </button>
            </div>
          )}
        </div>

        {/* Suspicious Patterns & Clusters Table */}
        <div className="mt-6 border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              High-Frequency Counterparty Links &amp; Flagged Edges
            </h4>
            <span className="text-[11px] text-slate-500 font-medium">Edges with repeat volume or rule alerts</span>
          </div>
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-4">Source Entity</th>
                <th className="py-2.5 px-4">Target Entity</th>
                <th className="py-2.5 px-4">Claim Count</th>
                <th className="py-2.5 px-4">Aggregate Amount</th>
                <th className="py-2.5 px-4">Exceptions Triggered</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {suspiciousClusters.slice(0, 10).map((c, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="py-2.5 px-4 font-semibold text-blue-700">{c.source.replace(/^emp:|^vnd:/, '')}</td>
                  <td className="py-2.5 px-4 font-semibold text-purple-700">{c.target.replace(/^vnd:|^cat:/, '')}</td>
                  <td className="py-2.5 px-4 text-slate-700">{c.count} transactions</td>
                  <td className="py-2.5 px-4 font-bold text-slate-900">{money(c.amount)}</td>
                  <td className="py-2.5 px-4">
                    {(c.flagged || 0) > 0 ? (
                      <span className="px-2 py-0.5 rounded bg-red-100 text-red-700 font-bold text-[10px]">
                        {c.flagged} RISK EXCEPTION(S)
                      </span>
                    ) : (
                      <span className="text-slate-400">Repeated Claim Pattern</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
