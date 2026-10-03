import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
import pandas as pd
import rules


def test_sample_matches_answer_key():
    res = rules.analyze(pd.read_csv(ROOT / "data" / "sample_invoices.csv"), today="2026-10-03")
    by = {r["invoice_id"]: r for r in res["rows"]}
    exp = pd.read_csv(ROOT / "data" / "expected_flags.csv")
    for _, e in exp.iterrows():
        got = {f["rule"] for f in by[e.invoice_id]["flags"]}
        assert e.rule in got, f"{e.invoice_id}: expected {e.rule}, got {got}"
    extra = [i for i, r in by.items() if r["status"] != "AUTO_PASS" and i not in set(exp.invoice_id)]
    assert not extra, f"false positives: {extra}"
    for r in res["rows"]:
        for f in r["flags"]:
            if f["rule"].startswith(("R3", "R4")): assert f["matched"], "duplicate flags must cite the matched record"
    print(res["summary"])


def test_vendor_names_normalise():
    assert rules._vendor("Acme Office Supplies Ltd.") == rules._vendor("ACME OFFICE SUPPLIES") == "acmeofficesupplies"


def test_real_world_columns_and_formats():
    df = pd.DataFrame({"Supplier": ["Acme", "Acme"], "Invoice Number": ["A-1", "A-1"], "Invoice Date": ["03/10/2026", "03/10/2026"],
                       "Total": ["Rs. 1,200.50", "1200.50"], "Expense Type": ["Software", "Software"]})
    res = rules.analyze(df, today="2026-10-03")
    assert res["summary"]["mapped_columns"]["supplier"] == "vendor"
    assert res["rows"][0]["date"] == "2026-10-03" and res["rows"][0]["amount"] == 1200.5   # dd/mm/yyyy, currency text
    assert res["rows"][1]["status"] == "FLAG", "exact duplicate should be caught after column mapping"


def test_unusable_file_is_rejected():
    try: rules.analyze(pd.DataFrame({"foo": [1], "bar": [2]}))
    except ValueError: return
    raise AssertionError("expected ValueError")


def test_split_claims():
    base = {"vendor": ["A Cafe", "B Diner"], "invoice_no": ["1", "2"], "date": ["2026-09-01", "2026-09-02"],
            "amount": [100, 80], "category": ["Meals", "Meals"], "employee": ["Sam", "Sam"]}
    res = rules.analyze(pd.DataFrame(base), today="2026-10-03")
    assert [r["status"] for r in res["rows"]] == ["AUTO_PASS", "REVIEW"] and res["rows"][1]["flags"][0]["rule"] == "R9_SPLIT_CLAIM"
    res = rules.analyze(pd.DataFrame({**base, "employee": ["Sam", "Priya"]}), today="2026-10-03")
    assert all(r["status"] == "AUTO_PASS" for r in res["rows"]), "different people must not be combined"


def test_results_survive_restart():
    import tempfile, db
    db.SQLITE = Path(tempfile.mkdtemp()) / "t.db"
    assert db.load_latest() == (None, None)
    db.save_run("run1", "2026-10-03 10:00:00", {"rows": [], "summary": {"total": 0}})
    db.save_run("run1", "2026-10-03 10:05:00", {"rows": [], "summary": {"total": 1}})   # re-save after a review decision
    assert db.load_latest() == ("run1", {"rows": [], "summary": {"total": 1}})


def test_limits_can_be_changed():
    saved = rules.get_limits()
    try:
        rules.set_limits({"meals": 50}, 1000)
        df = pd.DataFrame({"vendor": ["A Cafe"], "invoice_no": ["1"], "date": ["2026-09-01"], "amount": [100], "category": ["Meals"]})
        assert rules.analyze(df, today="2026-10-03")["rows"][0]["flags"][0]["rule"] == "R2_OVER_LIMIT"
    finally:
        rules.set_limits(saved["limits"], saved["default"])
    assert rules.analyze(df, today="2026-10-03")["rows"][0]["status"] == "AUTO_PASS"


def test_old_runs_are_pruned():
    import tempfile, db
    db.SQLITE = Path(tempfile.mkdtemp()) / "t.db"
    for i in range(7): db.save_run(f"run{i}", f"2026-10-03 10:0{i}:00", {"rows": [], "summary": {}})
    kept = sorted(r["run_id"] for r in db.sql("SELECT run_id FROM runs", fetch=True))
    assert kept == [f"run{i}" for i in range(2, 7)], kept


def test_priority_and_signals():
    res = rules.analyze(pd.read_csv(ROOT / "data" / "sample_invoices.csv"), today="2026-10-03")
    by = {r["invoice_id"]: r for r in res["rows"]}
    top = max((r for r in res["rows"] if r["status"] != "AUTO_PASS"), key=lambda r: r["priority"])
    assert top["invoice_id"] == "INV-1080" and by["INV-1001"]["priority"] == 0
    sig = by["INV-1061"]["flags"][0]["signals"]
    assert [s["label"] for s in sig][1] == "Invoice no. similarity" and all(0 <= s["strength"] <= 1 for s in sig)


def test_learning_suggestion_needs_evidence():
    def row(sim, d): return {"human_decision": d, "flags": [{"rule": "R4_NEAR_DUPLICATE", "signals": [{"label": "Invoice no. similarity", "strength": sim / 100}]}]}
    assert rules.suggest([row(82, "APPROVED")] * 4)[0]["suggested"] == rules.CFG["inv_sim"] + 6
    assert rules.suggest([row(82, "APPROVED")] * 2) == []     # too little evidence
    assert rules.suggest([row(82, "REJECTED")] * 4) == []     # reviewers agree with the rule


if __name__ == "__main__":
    test_sample_matches_answer_key(); test_vendor_names_normalise(); test_real_world_columns_and_formats(); test_unusable_file_is_rejected(); test_split_claims(); test_results_survive_restart(); test_limits_can_be_changed(); test_old_runs_are_pruned(); test_priority_and_signals(); test_learning_suggestion_needs_evidence(); print("OK")
