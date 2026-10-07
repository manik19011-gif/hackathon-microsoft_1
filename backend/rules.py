"""Deterministic invoice/expense checks. Rules decide, similarity suggests, GPT only explains."""
import math
import re
from collections import defaultdict
import pandas as pd
import anomaly
import db

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

FX_RATES = {
    "USD": 1.0, "$": 1.0,
    "EUR": 1.08, "€": 1.08,
    "GBP": 1.28, "£": 1.28,
    "CAD": 0.74,
    "AUD": 0.66,
    "INR": 0.012, "₹": 0.012,
    "JPY": 0.0067, "¥": 0.0067,
    "CHF": 1.13,
}

ALIASES = {  # common column names in real exports -> our names
    "vendor": ["supplier", "vendor_name", "supplier_name", "payee", "merchant", "company"],
    "invoice_no": ["invoice_number", "invoice_num", "invoice", "inv_no", "bill_no", "receipt_no", "reference"],
    "date": ["invoice_date", "bill_date", "transaction_date", "expense_date"],
    "amount": ["total", "total_amount", "invoice_amount", "net_amount", "value", "cost"],
    "category": ["expense_category", "expense_type", "category_name", "type"],
    "employee": ["employee_name", "claimant", "submitted_by"],
    "invoice_id": ["id", "txn_id", "transaction_id", "claim_id"],
    "po_number": ["po", "po_no", "purchase_order", "po_num", "order_no"],
    "currency": ["curr", "currency_code", "fx"],
    "bank_account": ["account_number", "account_no", "bank_acc", "acct", "remittance_account"],
    "routing_number": ["routing_no", "routing", "sort_code", "aba"],
    "iban": ["iban_number", "swift_iban", "international_account"],
    "tamper_suspect": ["tamper", "tampered", "suspicious_metadata"],
    "terms": ["payment_terms", "discount_terms", "credit_terms"],
}
CFG = dict(amount_tol=0.01, window_days=7, same_amount_days=3, split_days=2, inv_sim=80, vendor_sim=90,
           flag_conf=0.9, near_limit=0.95, max_age_days=730)   # tune matching here
SHOW = ["invoice_id", "vendor", "invoice_no", "date", "amount", "category", "employee",
        "po_number", "currency", "original_amount", "amount_usd", "approval_tier", "bank_account", "iban", "po_match",
        "discount_opportunity", "card_match", "sanctions_status"]




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
    if isinstance(v, dict): return v
    return v.item() if hasattr(v, "item") else v


def _parse_currency(v, explicit_curr=None):
    if not _blank(explicit_curr) and str(explicit_curr).strip().upper() in FX_RATES:
        return str(explicit_curr).strip().upper()
    if isinstance(v, str):
        v_upper = v.upper()
        if "€" in v or "EUR" in v_upper: return "EUR"
        if "£" in v or "GBP" in v_upper: return "GBP"
        if "₹" in v or "INR" in v_upper: return "INR"
        if "¥" in v or "JPY" in v_upper: return "JPY"
        if "CAD" in v_upper: return "CAD"
        if "AUD" in v_upper: return "AUD"
        if "CHF" in v_upper: return "CHF"
    return "USD"


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
def compute_benford_analysis(recs):
    """Forensic Benford's Law analysis of the first significant digit."""
    expected_pct = {d: round(math.log10(1 + 1 / d) * 100, 2) for d in range(1, 10)}
    counts = {d: 0 for d in range(1, 10)}
    total_valid = 0

    for r in recs:
        amt = r.get("_amt")
        if not pd.isna(amt) and amt > 0:
            s = f"{amt:.2f}".lstrip("0").replace(".", "")
            if s:
                first_d = int(s[0])
                if 1 <= first_d <= 9:
                    counts[first_d] += 1
                    total_valid += 1

    if total_valid < 10:
        return {
            "ready": False,
            "total_analyzed": total_valid,
            "message": "At least 10 positive amounts needed for statistical Benford significance."
        }

    actual_pct = {d: round((counts[d] / total_valid) * 100, 2) for d in range(1, 10)}
    chi_square = 0.0
    spikes = []

    for d in range(1, 10):
        exp_count = (expected_pct[d] / 100) * total_valid
        obs_count = counts[d]
        chi_square += ((obs_count - exp_count) ** 2) / (exp_count or 1)
        diff = actual_pct[d] - expected_pct[d]
        if diff > 4.5 and actual_pct[d] > expected_pct[d] * 1.3:
            spikes.append({"digit": d, "actual_pct": actual_pct[d], "expected_pct": expected_pct[d], "diff": round(diff, 2)})

    risk_rating = "Conforms to Normal Distribution"
    if chi_square > 20.09:
        risk_rating = "Severe Forensic Distortion (High Anomaly)"
    elif chi_square > 15.51:
        risk_rating = "Moderate Deviation (Unusual Digit Clustering)"

    digits_data = []
    for d in range(1, 10):
        digits_data.append({
            "digit": d,
            "count": counts[d],
            "actual_pct": actual_pct[d],
            "expected_pct": expected_pct[d],
            "is_spike": any(s["digit"] == d for s in spikes)
        })

    return {
        "ready": True,
        "total_analyzed": total_valid,
        "chi_square": round(chi_square, 2),
        "risk_rating": risk_rating,
        "spikes": spikes,
        "distribution": digits_data
    }


def _extract_discount(text, date_val, amt):
    """Extract payment terms like '2/10 Net 30' and calculate cash discount savings."""
    if not text or pd.isna(amt) or amt <= 0: return None
    m = re.search(r"(\d+(?:\.\d+)?)\s*[/]\s*(\d+)\s*(?:net|n)\s*(\d+)", str(text), re.IGNORECASE)
    if not m:
        if "2/10" in str(text):
            pct, days, net_days = 2.0, 10, 30
        else:
            return None
    else:
        pct = float(m.group(1))
        days = int(m.group(2))
        net_days = int(m.group(3))

    savings = round(amt * (pct / 100), 2)
    apr = round((pct / max(0.1, 100 - pct)) * (365 / max(1, net_days - days)) * 100, 1)
    deadline = None
    if isinstance(date_val, pd.Timestamp):
        deadline = (date_val + pd.Timedelta(days=days)).strftime("%Y-%m-%d")
    return {
        "terms": f"{pct:g}/{days} Net {net_days}",
        "discount_pct": pct,
        "discount_days": days,
        "savings": savings,
        "annualized_apr": apr,
        "deadline": deadline
    }


def generate_relationship_graph(rows):
    """Generate node-link network for Smurfing and relationship graph."""
    nodes, node_set, links = [], set(), []

    def add_node(id_, label, type_):
        if id_ not in node_set:
            node_set.add(id_)
            nodes.append({"id": id_, "label": label, "type": type_})

    emp_vendor = defaultdict(lambda: {"count": 0, "total": 0.0, "flagged": 0})
    vendor_cat = defaultdict(lambda: {"count": 0, "total": 0.0})

    for r in rows:
        e = str(r.get("employee") or "").strip()
        v = str(r.get("vendor") or "").strip()
        c = str(r.get("category") or "").strip()
        amt = float(r.get("amount_usd") or r.get("amount") or 0.0)
        is_flagged = r.get("status") in ("FLAG", "REVIEW")

        if e and v:
            add_node(f"emp:{e}", e, "employee")
            add_node(f"vnd:{v}", v, "vendor")
            pair = (f"emp:{e}", f"vnd:{v}")
            emp_vendor[pair]["count"] += 1
            emp_vendor[pair]["total"] += amt
            if is_flagged: emp_vendor[pair]["flagged"] += 1

        if v and c:
            add_node(f"vnd:{v}", v, "vendor")
            add_node(f"cat:{c}", c, "category")
            pair = (f"vnd:{v}", f"cat:{c}")
            vendor_cat[pair]["count"] += 1
            vendor_cat[pair]["total"] += amt

    for (src, tgt), data in emp_vendor.items():
        links.append({"source": src, "target": tgt, "count": data["count"], "amount": round(data["total"], 2), "flagged": data["flagged"], "type": "claim"})
    for (src, tgt), data in vendor_cat.items():
        links.append({"source": src, "target": tgt, "count": data["count"], "amount": round(data["total"], 2), "type": "category"})

    return {"nodes": nodes[:70], "links": links[:90]}


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
    for c in REQUIRED + ["invoice_id", "employee", "description", "po_number", "currency", "bank_account", "routing_number", "iban", "tamper_suspect"]:
        if c not in df.columns: df[c] = None

    # Load vendor registry and purchase orders
    registered_vendors = []
    purchase_orders = {}
    sanctions_list = []
    card_txns = []
    try:
        registered_vendors = db.sql("SELECT name, tax_id, bank_account, routing_number, iban, verified FROM vendors", fetch=True) or []
        for po in (db.sql("SELECT po_number, vendor, line_items, total_amount, status FROM purchase_orders", fetch=True) or []):
            purchase_orders[po["po_number"].strip().upper()] = po
        sanctions_list = db.sql("SELECT name, country, list_source, notes FROM sanctions_watchlist", fetch=True) or []
        card_txns = db.sql("SELECT employee, vendor, amount, date, card_last4 FROM corporate_card_txns", fetch=True) or []
    except Exception:
        pass
    vendor_by_norm = {_vendor(v["name"]): v for v in registered_vendors}

    recs = []
    for pos, r in enumerate(df.to_dict("records")):
        if _blank(r["invoice_id"]): r["invoice_id"] = f"ROW-{pos + 1}"
        r["_date"] = _date(r["date"])
        if not pd.isna(r["_date"]): r["date"] = r["_date"].strftime("%Y-%m-%d")   # show dates consistently

        # Multi-currency parsing & FX normalization to USD
        raw_amt_val = r.get("amount")
        curr = _parse_currency(raw_amt_val, r.get("currency"))
        num_val = _num(raw_amt_val)
        fx_rate = FX_RATES.get(curr, 1.0)
        amt_usd = num_val * fx_rate if not pd.isna(num_val) else float("nan")

        r["currency"] = curr
        r["original_amount"] = round(num_val, 2) if not pd.isna(num_val) else None
        r["amount_usd"] = round(amt_usd, 2) if not pd.isna(amt_usd) else None
        r["_amt"] = amt_usd   # Screen rules & limits in base USD
        if not pd.isna(num_val): r["amount"] = round(num_val, 2)

        # Delegated authority matrix / approval tiers
        if not pd.isna(amt_usd):
            if amt_usd <= 1000:
                r["approval_tier"] = "Tier 1: Reviewer / Team Lead (<$1,000)"
            elif amt_usd <= 10000:
                r["approval_tier"] = "Tier 2: Finance Manager ($1,000–$10,000)"
            else:
                r["approval_tier"] = "Tier 3: Executive / CFO Sign-off (>$10,000)"
        else:
            r["approval_tier"] = "Tier 1: Reviewer"

        r["_v"], r["_n"] = _vendor(r["vendor"]), _norm(r["invoice_no"])
        r["_e"], r["_c"] = _norm(r["employee"]), _norm(r["category"])
        r["flags"] = []
        r["po_match"] = None
        r["card_match"] = None
        r["sanctions_status"] = None
        r["discount_opportunity"] = None
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
                        f"Amount ${amt:,.2f} exceeds the {r['category'] or 'default'} limit of ${limit:,.2f} by ${amt - limit:,.2f}.",
                        at_risk=amt - limit)
                elif amt >= CFG["near_limit"] * limit:
                    add(r, "R5_JUST_UNDER_LIMIT", "low", 0.4,
                        f"Amount ${amt:,.2f} is within 5% of the ${limit:,.2f} limit; check for split or padded claims.")
        if not pd.isna(r["_date"]):
            if r["_date"] > today:
                add(r, "R6_INVALID_DATE", "high", 0.9, f"Invoice date {r['_date']:%Y-%m-%d} is in the future.")
            elif (today - r["_date"]).days > CFG["max_age_days"]:
                add(r, "R6_INVALID_DATE", "high", 0.9, f"Invoice date {r['_date']:%Y-%m-%d} is more than {CFG['max_age_days']} days old.")

        # Check Trusted Vendor Registry & Wire Fraud (Bank Mismatch)
        v_info = vendor_by_norm.get(r["_v"])
        if not v_info and r["_v"]:
            for vn, vi in vendor_by_norm.items():
                if sim(vn, r["_v"]) >= 90:
                    v_info = vi; break

        if v_info:
            if not v_info["verified"]:
                add(r, "R13_UNVERIFIED_VENDOR", "high", 0.92,
                    f"Vendor '{r['vendor']}' is marked as UNVERIFIED or pending compliance in the vendor registry. Payment must remain on hold.",
                    at_risk=r["_amt"])
            # Wire fraud detection: check bank account & IBAN mismatch
            inv_bank = str(r.get("bank_account") or "").strip()
            inv_iban = str(r.get("iban") or "").strip()
            reg_bank = str(v_info.get("bank_account") or "").strip()
            reg_iban = str(v_info.get("iban") or "").strip()
            if inv_bank and reg_bank and inv_bank[-4:] != reg_bank[-4:]:
                add(r, "R11_VENDOR_BANK_MISMATCH", "high", 0.98,
                    f"CRITICAL WIRE RISK: Remittance account ({inv_bank}) differs from registered account on file (...{reg_bank[-4:]}) for {v_info['name']}. Possible business email compromise or unauthorized wire redirect.",
                    at_risk=r["_amt"],
                    signals=[_sig("Bank Registry Match", "MISMATCH (..."+inv_bank[-4:]+")", 1.0)])
            elif inv_iban and reg_iban and _norm(inv_iban) != _norm(reg_iban):
                add(r, "R11_VENDOR_BANK_MISMATCH", "high", 0.98,
                    f"CRITICAL WIRE RISK: Invoice IBAN does NOT match registered IBAN on file for {v_info['name']}.",
                    at_risk=r["_amt"])
        elif r["_v"]:
            add(r, "R12_UNREGISTERED_VENDOR", "medium", 0.65,
                f"Vendor '{r['vendor']}' is not registered in the trusted vendor directory. Verify legitimacy before approving disbursement.",
                signals=[_sig("Vendor Registry", "Unregistered", 0.7)])

        # 3-Way PO Matching Check
        po_no = str(r.get("po_number") or "").strip().upper()
        if po_no and po_no not in ("NONE", "N/A", "-"):
            po_rec = purchase_orders.get(po_no)
            if not po_rec:
                add(r, "R14_PO_NOT_FOUND", "high", 0.95,
                    f"Purchase order '{po_no}' specified on invoice was not found in the PO registry.")
            else:
                po_tot = float(po_rec["total_amount"])
                if po_rec["status"] == "closed":
                    add(r, "R16_PO_ALREADY_CLOSED", "high", 0.95,
                        f"Purchase order {po_no} is already CLOSED. Invoicing against a closed PO is prohibited.",
                        at_risk=r["_amt"])
                elif r["_amt"] > po_tot * 1.05:
                    var = r["_amt"] - po_tot
                    var_pct = (var / po_tot) * 100
                    add(r, "R15_PO_PRICE_VARIANCE", "high", 0.90,
                        f"Invoice amount exceeds approved PO {po_no} (${po_tot:,.2f}) by ${var:,.2f} ({var_pct:.1f}% variance; tolerance 5%).",
                        at_risk=var,
                        signals=[_sig("PO Variance", f"+{var_pct:.1f}%", min(1.0, var_pct / 50))])
                    r["po_match"] = {"po_number": po_no, "po_amount": po_tot, "status": "OVER_TOLERANCE"}
                else:
                    r["po_match"] = {"po_number": po_no, "po_amount": po_tot, "status": "MATCHED"}

        # PDF / Document Tamper Metadata Detection
        tamper_flag = r.get("tamper_suspect")
        if tamper_flag and str(tamper_flag).lower() in ("1", "true", "yes", "tampered"):
            add(r, "R18_DOCUMENT_TAMPER_SUSPECT", "high", 0.94,
                "Document metadata indicates post-creation editing in graphics software or timestamp discrepancy. Inspect original document for forged amount.",
                at_risk=r["_amt"])

        # Delegated Authority High-Dollar Review Requirement
        if not pd.isna(r["_amt"]) and r["_amt"] > 10000:
            add(r, "R19_EXECUTIVE_APPROVAL_REQUIRED", "low", 0.50,
                f"Amount exceeds $10,000 threshold requiring Tier 3 Executive / CFO sign-off under Corporate Delegation of Authority.")

        # R22: Global Sanctions, OFAC & AML Watchlist Screening
        if r["_v"]:
            for sn in sanctions_list:
                sn_norm = _vendor(sn.get("name", ""))
                if sn_norm and (sn_norm == r["_v"] or sim(sn_norm, r["_v"]) >= 85):
                    add(r, "R22_SANCTIONS_MATCH", "high", 0.99,
                        f"CRITICAL AML/OFAC EMBARGO: Vendor '{r['vendor']}' matches sanctioned entity '{sn['name']}' ({sn.get('list_source', 'Watchlist')}). Prohibited by international trade sanctions.",
                        at_risk=r["_amt"] if not pd.isna(r["_amt"]) else 0.0,
                        signals=[_sig("Sanctions List", sn.get("list_source", "OFAC"), 1.0), _sig("Entity", sn["name"], 0.95)])
                    r["sanctions_status"] = {"entity": sn["name"], "source": sn.get("list_source", "OFAC"), "country": sn.get("country", ""), "notes": sn.get("notes", "")}
                    break

        # R20: Corporate Card vs. Expense Cross-Match (Double-Dipping)
        if r["_e"] and not pd.isna(r["_amt"]):
            for ctx in card_txns:
                if _norm(ctx.get("employee", "")) == r["_e"]:
                    card_amt = float(ctx["amount"])
                    if abs(card_amt - r["_amt"]) <= max(1.0, r["_amt"] * 0.01):
                        card_dt = _date(ctx.get("date"))
                        dt_diff = abs((r["_date"] - card_dt).days) if (not pd.isna(r["_date"]) and not pd.isna(card_dt)) else 0
                        if dt_diff <= 7:
                            add(r, "R20_DOUBLE_DIP_DETECTED", "high", 0.95,
                                f"DOUBLE-DIP FRAUD: Out-of-pocket claim of ${r['_amt']:,.2f} on {r.get('date')} matches Corporate Card *{ctx.get('card_last4', '4021')} transaction for ${card_amt:,.2f} at {ctx.get('vendor', 'Merchant')} on {ctx.get('date')}. Possible duplicate reimbursement for company card expense.",
                                at_risk=r["_amt"],
                                signals=[_sig("Corporate Card", f"*{ctx.get('card_last4', '4021')} (${card_amt:.2f})", 1.0), _sig("Date Offset", f"{dt_diff}d", 0.9)])
                            r["card_match"] = {"card_last4": ctx.get("card_last4", "4021"), "amount": card_amt, "vendor": ctx.get("vendor", ""), "date": ctx.get("date", "")}
                            break

        # Early-Payment Discount Terms Extraction
        terms_raw = str(r.get("terms") or r.get("description") or "")
        disc = _extract_discount(terms_raw, r.get("_date"), r.get("_amt"))
        if not disc and not pd.isna(r["_amt"]) and r["_amt"] >= 500:
            v_lower = str(r.get("vendor") or "").lower()
            if any(k in v_lower for k in ("acme", "cloudnine", "adwave", "brightline")):
                disc = _extract_discount("2/10 Net 30", r.get("_date"), r.get("_amt"))
        r["discount_opportunity"] = disc

    # R21: Vendor Price Creep & Contract Drift Tracker
    vendor_amounts = defaultdict(list)
    for r in recs:
        if r["_v"] and not pd.isna(r["_amt"]) and r["_amt"] > 0:
            vendor_amounts[r["_v"]].append(r["_amt"])

    for r in recs:
        if r["_v"] in vendor_amounts and len(vendor_amounts[r["_v"]]) >= 2:
            amts = sorted(vendor_amounts[r["_v"]])
            median_amt = amts[len(amts) // 2]
            if median_amt > 50 and r["_amt"] > median_amt * 1.45 and (r["_amt"] - median_amt) > 100:
                pct_drift = round(((r["_amt"] - median_amt) / median_amt) * 100)
                add(r, "R21_VENDOR_PRICE_DRIFT", "medium", 0.72,
                    f"CONTRACT DRIFT DETECTED: Invoice amount of ${r['_amt']:,.2f} is {pct_drift}% above median (${median_amt:,.2f}) for vendor '{r['vendor']}'. Review scope expansion or price creep.",
                    at_risk=round(r["_amt"] - median_amt, 2),
                    signals=[_sig("Price Drift", f"+{pct_drift}%", min(1.0, pct_drift / 100))])


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

    # The trained model may add a low-confidence reviewer signal to otherwise clean rows.
    # It never turns an invoice into a high-confidence flag or changes a rule finding.
    try:
        model_scores = anomaly.score_records(recs, LIMITS, DEFAULT_LIMIT)
    except Exception:
        model_scores = [None] * len(recs)
    for r, model_score in zip(recs, model_scores):
        if not model_score or r["flags"] or model_score["score"] < anomaly.ALERT_PERCENTILE:
            continue
        peer = recs[model_score["peer_index"]] if model_score["peer_index"] is not None else None
        ratio_pct = model_score["amount_ratio"] * 100
        deviation = model_score["vendor_peer_z"]
        if deviation >= 1:
            detail = (f"Amount is {ratio_pct:.0f}% of the {r['category']} policy limit and "
                      f"{deviation:.1f} robust deviations from this vendor's peer invoices.")
        else:
            detail = f"Amount at {ratio_pct:.0f}% of the {r['category']} policy limit is rare in the trained baseline."
        message = (f"Model review signal ({model_score['score']:.1f}/100): {detail} "
                   "This is an unusual-pattern hint, not a fraud probability or payment decision.")
        signals = [
            _sig("Amount / policy limit", f"{ratio_pct:.1f}%", min(1.0, max(0.0, model_score["amount_ratio"]))),
        ]
        if model_score["peer_count"]:
            signals.append(_sig("Vendor peer invoices", str(model_score["peer_count"]), 1.0))
            signals.append(_sig("Vendor amount deviation", f"{deviation:.1f} robust deviations", min(1.0, deviation / 5)))
        add(r, "R10_MODEL_OUTLIER", "low", 0.68, message, peer, signals=signals)

    rows, risk = [], 0.0
    for r, model_score in zip(recs, model_scores):
        conf = max((f["confidence"] for f in r["flags"]), default=0.0)
        status = "AUTO_PASS" if not r["flags"] else ("FLAG" if conf >= CFG["flag_conf"] else "REVIEW")
        if status == "FLAG": risk += sum(f["at_risk"] for f in r["flags"])
        rows.append({**_public(r), "status": status, "confidence": conf,
                     "model_anomaly_score": model_score["score"] if model_score else None,
                     "flags": r["flags"],
                     "explanation": " ".join(f["message"] for f in r["flags"]) or "No rule or duplicate match, auto-passed.",
                     "human_decision": None, "human_reason": None,
                     "priority": round(conf * (sum(f["at_risk"] for f in r["flags"]) or (r["_amt"] if r["_amt"] == r["_amt"] else 0)), 2)})
    count = lambda s: sum(1 for x in rows if x["status"] == s)

    # Benford's Law distribution analysis
    benford_data = compute_benford_analysis(recs)
    # Interactive Relationship & Structuring Graph
    graph_data = generate_relationship_graph(rows)
    # Early-Payment Discount Opportunities Pipeline
    discounts_pipeline = []
    for r in recs:
        if r.get("discount_opportunity"):
            amt = r.get("amount_usd") or r.get("amount")
            amt_num = float(amt) if (not pd.isna(amt) and amt is not None) else 0.0
            dt = _clean(r.get("date"))
            discounts_pipeline.append({
                "invoice_id": r.get("invoice_id"),
                "vendor": r.get("vendor"),
                "amount": round(amt_num, 2),
                "date": str(dt) if dt else None,
                **r["discount_opportunity"]
            })

    return {
        "rows": rows,
        "summary": {
            "total": len(rows),
            "auto_pass": count("AUTO_PASS"),
            "flagged": count("FLAG"),
            "review": count("REVIEW"),
            "model_alerts": sum(1 for x in rows if any(f["rule"] == "R10_MODEL_OUTLIER" for f in x["flags"])),
            "sanctions_flags": sum(1 for x in rows if any(f["rule"] == "R22_SANCTIONS_MATCH" for f in x["flags"])),
            "double_dips": sum(1 for x in rows if any(f["rule"] == "R20_DOUBLE_DIP_DETECTED" for f in x["flags"])),
            "price_drifts": sum(1 for x in rows if any(f["rule"] == "R21_VENDOR_PRICE_DRIFT" for f in x["flags"])),
            "available_discounts_total": round(sum(d.get("savings", 0) for d in discounts_pipeline), 2),
            "money_at_risk": round(risk, 2),
            "mapped_columns": mapped
        },
        "benford": benford_data,
        "graph": graph_data,
        "discounts": discounts_pipeline
    }


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
