"""Azure OpenAI for explanations and chat. Falls back to rule-based text if unconfigured or failing."""
import json, os
from pathlib import Path
import requests

_env = Path(__file__).resolve().parent.parent / ".env"
if _env.exists():
    for line in _env.read_text().splitlines():
        if "=" in line and not line.strip().startswith("#"):
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())

SYSTEM = ("You are an accounts-payable assistant. Answer ONLY from the JSON data provided. Cite invoice IDs and "
          "matched records. Be brief (max 4 sentences). If the data does not contain the answer, say so. Never change a decision.")


def configured():
    return all(os.getenv(k) for k in ("AZURE_OPENAI_ENDPOINT", "AZURE_OPENAI_KEY", "AZURE_OPENAI_DEPLOYMENT"))


def _call(question, data):
    url = (f"{os.environ['AZURE_OPENAI_ENDPOINT'].rstrip('/')}/openai/deployments/"
           f"{os.environ['AZURE_OPENAI_DEPLOYMENT']}/chat/completions?api-version=2024-06-01")
    body = {"messages": [{"role": "system", "content": SYSTEM},
                         {"role": "user", "content": f"DATA:\n{json.dumps(data, default=str)}\n\nQUESTION: {question}"}],
            "temperature": 0.1, "max_tokens": 300}
    r = requests.post(url, headers={"api-key": os.environ["AZURE_OPENAI_KEY"]}, json=body, timeout=15)
    r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"].strip()


def _slim(r):
    d = {k: r[k] for k in ("invoice_id", "vendor", "invoice_no", "date", "amount", "category", "status", "explanation")}
    d["matched"] = [f["matched"]["invoice_id"] for f in r["flags"] if f["matched"]]
    return d


def explain(row):
    if configured():
        try:
            return _call("Explain in plain English why this invoice got its status and what the reviewer should check.", _slim(row)), "azure-openai"
        except Exception:
            pass
    return row["explanation"], "rules"


def _has(r, *rules): return any(f["rule"] in rules for f in r["flags"])


def local_answer(q, res):
    rows, s, ql = res["rows"], res["summary"], q.lower()
    for r in rows:
        if r["invoice_id"].lower() in ql:
            return f"{r['invoice_id']} is {r['status'].replace('_', ' ').lower()}. {r['explanation']}"
    groups = [("duplic", "possible duplicates", ("R3_EXACT_DUPLICATE", "R4_NEAR_DUPLICATE")),
              ("limit", "limit issues", ("R2_OVER_LIMIT", "R5_JUST_UNDER_LIMIT")),
              ("missing", "rows with missing fields", ("R1_MISSING_FIELD",)),
              ("date", "date problems", ("R6_INVALID_DATE",)),
              ("repeat", "repeat claims by the same employee", ("R8_EMPLOYEE_REPEAT",)),
              ("split", "possible split claims", ("R9_SPLIT_CLAIM",))]
    for key, label, rules in groups:
        if key in ql:
            hit = [r["invoice_id"] for r in rows if _has(r, *rules)]
            return f"{len(hit)} {label}: " + (", ".join(hit[:15]) or "none") + "."
    return (f"{s['total']} invoices checked: {s['auto_pass']} auto-passed, {s['flagged']} flagged, "
            f"{s['review']} need review. Estimated money at risk: {s['money_at_risk']:,.2f}.")


def chat(question, res):
    if configured():
        try:
            ctx = {"summary": res["summary"], "exceptions": [_slim(r) for r in res["rows"] if r["status"] != "AUTO_PASS"][:60]}
            return _call(question, ctx), "azure-openai"
        except Exception:
            pass
    return local_answer(question, res), "rules"
