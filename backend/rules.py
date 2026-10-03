"""Deterministic invoice/expense checks. Rules decide, similarity suggests, GPT only explains."""
import re
from collections import defaultdict
import pandas as pd

try:
    from rapidfuzz import fuzz
    def sim(a, b): return fuzz.ratio(a, b)
except ImportError:  # still works without rapidfuzz
    from difflib import SequenceMatcher
    def sim(a, b): return 100 * SequenceMatcher(None, a, b).ratio()

REQUIRED = ["vendor", "invoice_no", "date", "amount", "category"]
LIMITS = {"travel": 1500, "meals": 150, "software": 5000, "office supplies": 800,
          "consulting": 20000, "utilities": 3000, "marketing": 10000}
DEFAULT_LIMIT = 5000
ALIASES = {  # common column names in real exports -> our names
    "vendor": ["supplier", "vendor_name", "supplier_name", "payee", "merchant", "company"],
    "invoice_no": ["invoice_number", "invoice_num", "invoice", "inv_no", "bill_no", "receipt_no", "reference"],
    "date": ["invoice_date", "bill_date", "transaction_date", "expense_date"],
    "amount": ["total", "total_amount", "invoice_amount", "net_amount", "value", "cost"],
    "category": ["expense_category", "expense_type", "category_name", "type"],
    "employee": ["employee_name", "claimant", "submitted_by"],
    "invoice_id": ["id", "txn_id", "transaction_id", "claim_id"],
}
CFG = dict(amount_tol=0.01, window_days=7, same_amount_days=3, split_days=2, inv_sim=80, vendor_sim=90,
           flag_conf=0.9, near_limit=0.95, max_age_days=730)   # tune matching here
SHOW = ["invoice_id", "vendor", "invoice_no", "date", "amount", "category", "employee"]


def set_limits(limits, default=None):
    """Replace the category limits (used by the Limits page)."""
    global DEFAULT_LIMIT
    LIMITS.clear(); LIMITS.update({str(k).strip().lower(): float(v) for k, v in limits.items()})
    if default is not None: DEFAULT_LIMIT = float(default)


def get_limits(): return {"limits": dict(LIMITS), "default": DEFAULT_LIMIT}


def _limit(cat): return LIMITS.get(str(cat).strip().lower(), DEFAULT_LIMIT)


def _blank(v): return bool(pd.isna(v)) or str(v).strip() == ""
_SUFFIX = {"ltd", "limited", "inc", "llc", "llp", "pvt", "private", "co", "corp", "corporation"}
def _vendor(v):
    toks = [t for t in re.findall(r"[a-z0-9]+", "" if _blank(v) else str(v).lower()) if t not in _SUFFIX]
    return "".join(toks)
def _norm(v): return "" if _blank(v) else re.sub(r"[^a-z0-9]", "", str(v).lower())


def _num(v):
    if isinstance(v, str):  # "Rs. 1,200.50", "$1,200", "(45.00)" for negatives
        neg = v.strip().startswith("(") and v.strip().endswith(")")
        m = re.search(r"-?\d+(?:\.\d+)?", v.replace(",", ""))
        v = m.group(0) if m else ""
        if neg and v: v = "-" + v.lstrip("-")
    try: return float(v)
    except (TypeError, ValueError): return float("nan")


def _date(v):
    if isinstance(v, str) and re.match(r"^\s*\d{1,2}[/.-]\d{1,2}[/.-]\d{4}\s*$", v):
        return pd.to_datetime(v.strip(), dayfirst=True, errors="coerce")   # dd/mm/yyyy
    return pd.to_datetime(v, errors="coerce")


def _clean(v):
    if _blank(v): return None
    if isinstance(v, pd.Timestamp): return v.strftime("%Y-%m-%d")
    return v.item() if hasattr(v, "item") else v


def _public(r): return {k: _clean(r.get(k)) for k in SHOW}


def _sig(label, value, strength):
    """One ingredient of a duplicate score, shown to the reviewer as a bar (strength 0..1)."""
    return {"label": label, "value": value, "strength": round(max(0.0, min(1.0, strength)), 2)}


def _dup(a, b):
    """Return (confidence, rule, message-template) if b looks like a repeat of a."""
    if pd.isna(a["_amt"]) or pd.isna(b["_amt"]): return None
    same_v = a["_v"] == b["_v"]
    diff = abs(a["_amt"] - b["_amt"])
    exact_amt = diff < 0.005
    close = diff <= CFG["amount_tol"] * max(abs(a["_amt"]), abs(b["_amt"]))
    if same_v and a["_n"] and a["_n"] == b["_n"] and exact_amt:
        return (0.98, "R3_EXACT_DUPLICATE", "Exact duplicate: same vendor, invoice no. and amount as {id}.",
                [_sig("Vendor", "same", 1), _sig("Invoice no.", "identical", 1), _sig("Amount", "identical", 1)])
    if not close or pd.isna(a["_date"]) or pd.isna(b["_date"]): return None
    days = abs((a["_date"] - b["_date"]).days)
    if days > CFG["window_days"]: return None
    pen, who = (0.0, "same vendor") if same_v else (0.1, "similar vendor name")
    s = sim(a["_n"], b["_n"]) if a["_n"] and b["_n"] else 0
    lo = CFG["inv_sim"]
    rel = diff / max(abs(a["_amt"]), abs(b["_amt"]), 0.01)
    sig = [_sig("Vendor", "same" if same_v else "similar name", 1 if same_v else 0.7),
           _sig("Invoice no. similarity", f"{s:.0f}%", s / 100),
           _sig("Amount difference", f"{rel * 100:.1f}%", 1 - rel / CFG["amount_tol"]),
           _sig("Days apart", str(days), 1 - days / CFG["window_days"])]
    if s >= lo:
        return (round(0.6 + 0.25 * (s - lo) / (100 - lo) - pen, 2), "R4_NEAR_DUPLICATE",
                f"Possible duplicate of {{id}}: {who}, invoice no. {s:.0f}% similar, amount within 1%, {days} day(s) apart.", sig)
    if exact_amt and days <= CFG["same_amount_days"]:
        return (round(0.5 - pen, 2), "R4_NEAR_DUPLICATE",
                f"Possible duplicate payment of {{id}}: {who} and same amount, {days} day(s) apart, different invoice no.", sig)
    return None


def analyze(df, today=None):
    today = pd.Timestamp(today) if today is not None else pd.Timestamp.today().normalize()
    df = df.copy()
    df.columns = [re.sub(r"[^a-z0-9]+", "_", str(c).lower()).strip("_") for c in df.columns]
    mapped = {}
    for canon, names in ALIASES.items():
        if canon not in df.columns:
            hit = next((n for n in names if n in df.columns), None)
            if hit: df = df.rename(columns={hit: canon}); mapped[hit] = canon
    absent = [c for c in REQUIRED if c not in df.columns]
    if len(absent) >= 3:
        raise ValueError("Could not find columns for: " + ", ".join(absent) + ". Expected vendor, invoice_no, date, "
                         "amount, category (or equivalents such as supplier, invoice number, total).")
    for c in REQUIRED + ["invoice_id", "employee", "description"]:
        if c not in df.columns: df[c] = None
    recs = []
    for pos, r in enumerate(df.to_dict("records")):
        if _blank(r["invoice_id"]): r["invoice_id"] = f"ROW-{pos + 1}"
        r["_date"] = _date(r["date"])
        if not pd.isna(r["_date"]): r["date"] = r["_date"].strftime("%Y-%m-%d")   # show dates consistently
        r["_amt"] = _num(r["amount"])
        if not pd.isna(r["_amt"]): r["amount"] = r["_amt"]   # show parsed numbers
        r["_v"], r["_n"] = _vendor(r["vendor"]), _norm(r["invoice_no"])
        r["_e"], r["_c"] = _norm(r["employee"]), _norm(r["category"])
        r["flags"] = []
        r["_i"] = pos
        recs.append(r)

    def add(r, rule, sev, conf, msg, match=None, at_risk=0.0, signals=None):
        r["flags"].append({"rule": rule, "severity": sev, "confidence": conf, "message": msg,
                           "matched": _public(match) if match else None, "at_risk": at_risk, "signals": signals or []})

    for r in recs:
        miss = [f for f in REQUIRED if _blank(r[f])]
        if miss: add(r, "R1_MISSING_FIELD", "high", 0.99, "Missing required field(s): " + ", ".join(miss) + ".")
        amt = r["_amt"]
        if not pd.isna(amt):
            if amt <= 0:
                add(r, "R7_INVALID_AMOUNT", "high", 0.99, f"Amount {amt:,.2f} is zero or negative.")
            else:
                limit = LIMITS.get(str(r["category"]).strip().lower(), DEFAULT_LIMIT)
                if amt > limit:
                    add(r, "R2_OVER_LIMIT", "high", 0.95,
                        f"Amount {amt:,.2f} exceeds the {r['category'] or 'default'} limit of {limit:,.2f} by {amt - limit:,.2f}.",
                        at_risk=amt - limit)
                elif amt >= CFG["near_limit"] * limit:
                    add(r, "R5_JUST_UNDER_LIMIT", "low", 0.4,
                        f"Amount {amt:,.2f} is within 5% of the {limit:,.2f} limit; check for split or padded claims.")
        if not pd.isna(r["_date"]):
            if r["_date"] > today:
                add(r, "R6_INVALID_DATE", "high", 0.9, f"Invoice date {r['_date']:%Y-%m-%d} is in the future.")
            elif (today - r["_date"]).days > CFG["max_age_days"]:
                add(r, "R6_INVALID_DATE", "high", 0.9, f"Invoice date {r['_date']:%Y-%m-%d} is more than {CFG['max_age_days']} days old.")

    # Candidate lookups keep this fast on big files: similar vendor names are resolved once per unique name,
    # and per-person checks only look at that person's rows in the same category.
    names = sorted({r["_v"] for r in recs if r["_v"]})
    near = {v: [w for w in names if w == v or sim(w, v) >= CFG["vendor_sim"]] for v in names}
    seen, by_ec = defaultdict(list), defaultdict(list)
    for b in recs:
        key = (b["_e"], b["_c"])
        if b["_v"]:
            best = None
            for a in sorted((x for w in near[b["_v"]] for x in seen[w]), key=lambda x: x["_i"]):
                hit = _dup(a, b)
                if hit and (best is None or hit[0] > best[0]): best = (*hit, a)
            if best:
                conf, rule, msg, sig, a = best
                add(b, rule, "high" if conf >= CFG["flag_conf"] else "medium", conf, msg.format(id=a["invoice_id"]), a,
                    at_risk=b["_amt"] if conf >= CFG["flag_conf"] else 0.0, signals=sig)
            elif b["_e"] and b["_c"] and not pd.isna(b["_amt"]) and not pd.isna(b["_date"]):
                for a in by_ec[key]:
                    if not pd.isna(a["_date"]) and a["_date"] == b["_date"] and abs(a["_amt"] - b["_amt"]) < 0.005:
                        add(b, "R8_EMPLOYEE_REPEAT", "medium", 0.55,
                            f"{b['employee']} claimed the same amount in the same category on the same day as {a['invoice_id']}.", a)
                        break
            seen[b["_v"]].append(b)
        if b["_e"] and b["_c"]: by_ec[key].append(b)

    # split claims: several small claims by one person, same category, a couple of days apart, that together break the limit
    DUP = ("R2_OVER_LIMIT", "R3_EXACT_DUPLICATE", "R4_NEAR_DUPLICATE", "R8_EMPLOYEE_REPEAT")
    ok = lambda r: not any(f["rule"] in DUP for f in r["flags"])
    grp = defaultdict(list)
    for b in recs:
        key = (b["_e"], b["_c"])
        cands = list(grp[key])
        if b["_e"] and b["_c"]: grp[key].append(b)
        if not (b["_e"] and b["_c"]) or pd.isna(b["_amt"]) or pd.isna(b["_date"]) or b["_amt"] <= 0 or not ok(b): continue
        limit = _limit(b["category"])
        if b["_amt"] > limit: continue
        prior = [a for a in cands if not pd.isna(a["_date"]) and not pd.isna(a["_amt"]) and a["_amt"] > 0 and ok(a)
                 and abs((a["_date"] - b["_date"]).days) <= CFG["split_days"]]
        total = b["_amt"] + sum(a["_amt"] for a in prior)
        if prior and total > limit:
            ids = ", ".join(a["invoice_id"] for a in prior)
            add(b, "R9_SPLIT_CLAIM", "medium", 0.6,
                f"Possible split claim: with {ids} within {CFG['split_days']} days, {b['employee']}'s {b['category']} claims total {total:,.2f}, over the {limit:,.2f} limit.", prior[0])

    rows, risk = [], 0.0
    for r in recs:
        conf = max((f["confidence"] for f in r["flags"]), default=0.0)
        status = "AUTO_PASS" if not r["flags"] else ("FLAG" if conf >= CFG["flag_conf"] else "REVIEW")
        if status == "FLAG": risk += sum(f["at_risk"] for f in r["flags"])
        rows.append({**_public(r), "status": status, "confidence": conf, "flags": r["flags"],
                     "explanation": " ".join(f["message"] for f in r["flags"]) or "No rule or duplicate match, auto-passed.",
                     "human_decision": None, "human_reason": None,
                     "priority": round(conf * (sum(f["at_risk"] for f in r["flags"]) or (r["_amt"] if r["_amt"] == r["_amt"] else 0)), 2)})
    count = lambda s: sum(1 for x in rows if x["status"] == s)
    return {"rows": rows, "summary": {"total": len(rows), "auto_pass": count("AUTO_PASS"), "flagged": count("FLAG"),
                                      "review": count("REVIEW"), "money_at_risk": round(risk, 2), "mapped_columns": mapped}}


def suggest(rows):
    """Turn reviewer decisions into rule-tuning suggestions. A person applies them; nothing changes silently."""
    cur = CFG["inv_sim"]
    def sim(r):
        for fl in r["flags"]:
            if fl["rule"] == "R4_NEAR_DUPLICATE":
                for s in fl.get("signals", []):
                    if s["label"] == "Invoice no. similarity": return round(s["strength"] * 100)
        return 0
    band = [r for r in rows if r.get("human_decision") and cur <= sim(r) < cur + 6]
    ok = [r for r in band if r["human_decision"] == "APPROVED"]
    if len(band) >= 3 and len(ok) / len(band) >= 0.8:
        return [{"param": "inv_sim", "current": cur, "suggested": cur + 6,
                 "evidence": f"You approved {len(ok)} of {len(band)} near-duplicate flags with {cur}-{cur + 5}% invoice-number similarity."}]
    return []
