import io, json
from datetime import datetime
from pathlib import Path

import pandas as pd
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import db, llm, rules
from db import sql

BASE = Path(__file__).resolve().parent.parent
STATE = {"run": None, "res": None, "df": None}
REASONS = {"legit_repeat": "legit repeat", "confirmed_duplicate": "confirmed duplicate", "vendor_error": "vendor error", "other": "other", "": "not given"}
app = FastAPI(title="Veri-Fi — Invoice & Expense Checker")


def now(): return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def run(df, keep=None):
    try:
        res = rules.analyze(df)
    except ValueError as e:
        raise HTTPException(400, str(e))
    for r in res["rows"]:                       # carry reviewer decisions over a re-check
        if keep and r["status"] != "AUTO_PASS" and r["invoice_id"] in keep: r["human_decision"], r["human_reason"] = keep[r["invoice_id"]]
    STATE.update(run=datetime.now().strftime("%Y%m%d-%H%M%S"), res=res, df=df)
    db.save_run(STATE["run"], now(), res)
    db.save_source(STATE["run"], json.loads(df.to_json(orient="records", date_format="iso")))
    sql("INSERT INTO audit(ts,run_id,invoice_id,actor,decision,detail) VALUES (?,?,?,?,?,?)",
        [(now(), STATE["run"], r["invoice_id"], "system", r["status"], r["explanation"]) for r in res["rows"]], many=True)
    return res


def need_results():
    if not STATE["res"]: raise HTTPException(400, "Load the sample data or upload a file first.")
    return STATE["res"]


@app.post("/api/analyze")
async def upload(file: UploadFile = File(...)):
    raw = await file.read()
    if len(raw) > 10_000_000: raise HTTPException(400, "The file is larger than 10 MB. Split it and upload the parts.")
    try:
        name = (file.filename or "").lower()
        df = pd.read_excel(io.BytesIO(raw)) if name.endswith((".xlsx", ".xls")) else pd.read_csv(io.BytesIO(raw))
    except Exception as e:
        raise HTTPException(400, f"Could not read the file as CSV or Excel: {e}")
    if df.empty: raise HTTPException(400, "The file has no rows.")
    if len(df) > 50_000: raise HTTPException(400, "The file has more than 50,000 rows. Split it and upload the parts.")
    return run(df)


@app.post("/api/sample")
def sample():
    path = BASE / "data" / "sample_invoices.csv"
    if not path.exists(): raise HTTPException(404, "Run `python data/make_sample.py` first.")
    return run(pd.read_csv(path))


@app.get("/api/demo-upload.csv")
def demo_upload():
    """Download a small, realistic-shaped CSV for trying the upload flow."""
    path = BASE / "data" / "upload_demo.csv"
    if not path.exists(): raise HTTPException(404, "The example CSV is missing.")
    return FileResponse(path, media_type="text/csv", filename="invoice_upload_example.csv")


@app.get("/api/health")
def health(): return {"ok": True, "audit_db": db.backend()}


@app.get("/api/results")
def results(): return STATE["res"] or {}


@app.get("/api/audit")
def audit(): return sql("SELECT ts, invoice_id, actor, decision, detail FROM audit ORDER BY id DESC LIMIT 500", fetch=True)


class Review(BaseModel):
    invoice_id: str
    decision: str
    reason: str = ""      # the new UI requires one; the API accepts none so older clients keep working


@app.post("/api/review")
def review(body: Review):
    res = need_results()
    if body.decision not in ("APPROVED", "REJECTED"): raise HTTPException(400, "Decision must be APPROVED or REJECTED.")
    row = next((r for r in res["rows"] if r["invoice_id"] == body.invoice_id), None)
    if not row: raise HTTPException(404, "Invoice not found.")
    if body.reason not in REASONS: raise HTTPException(400, "Unknown reason.")
    row["human_decision"], row["human_reason"] = body.decision, body.reason or None
    db.save_run(STATE["run"], now(), res)
    sql("INSERT INTO audit(ts,run_id,invoice_id,actor,decision,detail) VALUES (?,?,?,?,?,?)",
        (now(), STATE["run"], body.invoice_id, "human", body.decision, "Reviewer decision on " + row["status"] + " (reason: " + REASONS[body.reason] + ")"))
    return row


@app.get("/api/explain/{invoice_id}")
def explain(invoice_id: str):
    row = next((r for r in need_results()["rows"] if r["invoice_id"] == invoice_id), None)
    if not row: raise HTTPException(404, "Invoice not found.")
    text, source = llm.explain(row)
    return {"text": text, "source": source}


class Ask(BaseModel):
    question: str


@app.post("/api/chat")
def chat(body: Ask):
    answer, source = llm.chat(body.question, need_results())
    return {"answer": answer, "source": source}


def rerun():
    """Re-check the loaded invoices (after a limit or threshold change), keeping reviewer decisions."""
    df = STATE["df"]
    if df is None:
        src = db.load_source()
        df = pd.DataFrame(src) if src else None
    if df is None: return False
    keep = {r["invoice_id"]: (r["human_decision"], r.get("human_reason")) for r in (STATE["res"] or {}).get("rows", []) if r["human_decision"]}
    run(df, keep)
    return True


class Limits(BaseModel):
    limits: dict
    default: float


@app.get("/api/limits")
def get_limits(): return rules.get_limits()


@app.put("/api/limits")
def put_limits(body: Limits):
    try:
        clean = {str(k).strip(): float(v) for k, v in body.limits.items() if str(k).strip()}
    except (TypeError, ValueError):
        raise HTTPException(400, "Limits must be numbers.")
    if body.default <= 0 or any(v <= 0 for v in clean.values()):
        raise HTTPException(400, "Limits must be greater than zero.")
    rules.set_limits(clean, body.default)
    db.set_setting("limits", json.dumps(rules.get_limits()))
    return {"rerun": rerun()}


@app.post("/api/limits/preview")
def preview_limits(body: Limits):
    """What would these limits change? Runs the checks on a copy and restores the saved limits."""
    try: clean = {str(k).strip(): float(v) for k, v in body.limits.items() if str(k).strip()}
    except (TypeError, ValueError): raise HTTPException(400, "Limits must be numbers.")
    if body.default <= 0 or any(v <= 0 for v in clean.values()): raise HTTPException(400, "Limits must be greater than zero.")
    df = STATE["df"]
    if df is None:
        src = db.load_source()
        df = pd.DataFrame(src) if src else None
    if df is None: raise HTTPException(400, "Load the sample data or upload a file first.")
    saved = rules.get_limits()
    try:
        rules.set_limits(clean, body.default)
        then = rules.analyze(df)["summary"]
    finally:
        rules.set_limits(saved["limits"], saved["default"])
    pick = lambda s: {k: s[k] for k in ("flagged", "review", "money_at_risk")}
    return {"now": pick(need_results()["summary"]), "then": pick(then)}


@app.get("/api/report.csv")
def report():
    rows = [r for r in need_results()["rows"] if r["status"] != "AUTO_PASS"]
    out = pd.DataFrame([{"invoice_id": r["invoice_id"], "vendor": r["vendor"], "invoice_no": r["invoice_no"],
                         "date": r["date"], "amount": r["amount"], "status": r["status"],
                         "rules": ";".join(f["rule"] for f in r["flags"]),
                         "matched_record": ";".join(f["matched"]["invoice_id"] for f in r["flags"] if f["matched"]),
                         "explanation": r["explanation"], "human_decision": r["human_decision"]} for r in rows])
    return Response(out.to_csv(index=False), media_type="text/csv",
                    headers={"Content-Disposition": "attachment; filename=exception_report.csv"})


@app.get("/api/learning")
def learning(): return rules.suggest((STATE["res"] or {}).get("rows", []))


class Apply(BaseModel):
    param: str
    value: int


@app.post("/api/learning/apply")
def apply_learning(body: Apply):
    if body.param != "inv_sim" or not 50 <= body.value <= 99: raise HTTPException(400, "Only inv_sim between 50 and 99 can be changed here.")
    old, rules.CFG["inv_sim"] = rules.CFG["inv_sim"], body.value
    db.set_setting("cfg", json.dumps(rules.CFG))
    sql("INSERT INTO audit(ts,run_id,invoice_id,actor,decision,detail) VALUES (?,?,?,?,?,?)",
        (now(), STATE["run"], "-", "human", "RULE_CHANGE", f"inv_sim changed from {old} to {body.value} (approved from a suggestion)"))
    return {"rerun": rerun()}


@app.get("/api/feedback.csv")
def feedback():
    rows = [r for r in need_results()["rows"] if r["human_decision"]]
    out = pd.DataFrame([{"invoice_id": r["invoice_id"], "vendor": r["vendor"], "amount": r["amount"], "status": r["status"],
                         "confidence": r["confidence"], "rules": ";".join(f["rule"] for f in r["flags"]),
                         "decision": r["human_decision"], "reason": r.get("human_reason")} for r in rows])
    return Response(out.to_csv(index=False), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=reviewer_feedback.csv"})


try:
    saved = db.get_setting("limits")
    if saved: cfg = json.loads(saved); rules.set_limits(cfg["limits"], cfg["default"])
    saved_cfg = db.get_setting("cfg")
    if saved_cfg: rules.CFG.update(json.loads(saved_cfg))
    STATE["run"], STATE["res"] = db.load_latest()      # restore the last run after a restart
except Exception as e:
    print("Could not restore the last run:", e)

UI = BASE / "frontend" / "dist"          # built by `npm run build`
if not UI.exists(): UI = BASE / "frontend" / "legacy"   # CDN fallback, no build needed
app.mount("/", StaticFiles(directory=UI, html=True), name="ui")
