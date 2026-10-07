import { Badge as ShadcnBadge } from "./components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";

export const money = n => n == null ? "-" : "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const STATUS = {
  AUTO_PASS: ["Auto-passed", "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"],
  FLAG: ["Flagged", "bg-destructive/15 text-destructive border-destructive/30"],
  REVIEW: ["Needs review", "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30"]
};

export const Badge = ({ s }) => {
  const [label, style] = STATUS[s] || [s || "Unknown", "bg-muted text-muted-foreground border-border"];
  return (
    <ShadcnBadge variant="outline" className={`font-semibold px-2 py-0.5 text-xs ${style}`}>
      {label}
    </ShadcnBadge>
  );
};

export const Stat = ({ label, value, tone, hint }) => (
  <Card className="shadow-xs transition-shadow hover:shadow-sm" title={hint}>
    <CardHeader className="p-4 pb-1">
      <CardTitle className="text-xs font-medium text-muted-foreground tracking-wide uppercase">{label}</CardTitle>
    </CardHeader>
    <CardContent className="p-4 pt-0">
      <div className={`text-2xl font-bold tracking-tight ${tone || "text-foreground"}`}>{value}</div>
      {hint && <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2 leading-tight">{hint}</p>}
    </CardContent>
  </Card>
);

export const FIELDS = [["vendor", "Vendor"], ["invoice_no", "Invoice no."], ["date", "Date"], ["amount", "Amount"]];


