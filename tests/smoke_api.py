"""Run against a live server:  python tests/smoke_api.py [http://localhost:8000]"""
import io, sys
import requests

B = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000").rstrip("/") + "/api"
fails = []


def check(name, ok):
    print(("PASS  " if ok else "FAIL  ") + name)
    if not ok: fails.append(name)


res = requests.post(B + "/sample").json()
s = res["summary"]
check("sample loads and screens every row", s["total"] > 0 and s["auto_pass"] + s["flagged"] + s["review"] == s["total"])
flag = next(r for r in res["rows"] if r["status"] == "FLAG")
check("results endpoint returns the same run", requests.get(B + "/results").json()["summary"]["total"] == s["total"])
check("explain works", bool(requests.get(f"{B}/explain/{flag['invoice_id']}").json()["text"]))
check("chat works", bool(requests.post(B + "/chat", json={"question": "show duplicates"}).json()["answer"]))
check("review is saved", requests.post(B + "/review", json={"invoice_id": flag["invoice_id"], "decision": "APPROVED"}).json()["human_decision"] == "APPROVED")
check("audit log has the human decision", any(a["actor"] == "human" for a in requests.get(B + "/audit").json()))
rep = requests.get(B + "/report.csv")
check("report downloads as CSV", rep.status_code == 200 and "invoice_id" in rep.text.splitlines()[0])
lim = requests.get(B + "/limits").json()
check("limits can be read", "limits" in lim and lim["default"] > 0)
check("bad limits are rejected", requests.put(B + "/limits", json={"limits": {"meals": -1}, "default": 100}).status_code == 400)
csv = "Supplier,Invoice Number,Invoice Date,Total,Expense Type\nAcme,A-1,2026-09-01,100,Software\nAcme,A-1,2026-09-01,100,Software\n"
up = requests.post(B + "/analyze", files={"file": ("t.csv", io.BytesIO(csv.encode()))}).json()
check("upload maps columns and catches the duplicate", up["summary"]["mapped_columns"].get("supplier") == "vendor" and up["rows"][1]["status"] == "FLAG")
check("unusable file is rejected", requests.post(B + "/analyze", files={"file": ("x.csv", io.BytesIO(b"foo,bar\n1,2\n"))}).status_code == 400)
pv = requests.post(B + "/limits/preview", json={"limits": {"meals": 50}, "default": lim["default"]}).json()
check("limit preview shows impact without saving", pv["then"]["flagged"] >= pv["now"]["flagged"] and requests.get(B + "/limits").json() == lim)
requests.post(B + "/sample")   # leave the sample loaded for the demo
print("\nAll checks passed." if not fails else f"\n{len(fails)} check(s) failed.")
sys.exit(1 if fails else 0)
