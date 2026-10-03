"""Builds data/sample_invoices.csv (93 rows) with planted problems, plus expected_flags.csv as the answer key."""
import csv, random
from datetime import date, timedelta
from pathlib import Path

random.seed(7)
OUT = Path(__file__).parent
VENDORS = {"Acme Office Supplies": "Office Supplies", "SkyHigh Travels": "Travel", "Cafe Bloom": "Meals",
           "CloudNine Software": "Software", "Brightline Consulting": "Consulting",
           "PowerGrid Utilities": "Utilities", "AdWave Media": "Marketing"}
LIMITS = {"Travel": 1500, "Meals": 150, "Software": 5000, "Office Supplies": 800,
          "Consulting": 20000, "Utilities": 3000, "Marketing": 10000}
EMP = ["Aarav Mehta", "Priya Nair", "Rohan Gupta", "Sara Khan", "Vikram Rao"]
COLS = ["invoice_id", "vendor", "invoice_no", "date", "amount", "category", "employee", "description"]
n = [1000]


def new(v=None):
    n[0] += 1
    v = v or random.choice(list(VENDORS)); cat = VENDORS[v]
    return dict(invoice_id=f"INV-{n[0]}", vendor=v, invoice_no=f"{v[:3].upper()}-{random.randint(10000, 99999)}",
                date=(date(2026, 8, 1) + timedelta(days=random.randint(0, 55))).isoformat(),
                amount=round(LIMITS[cat] * random.uniform(0.1, 0.8), 2), category=cat,
                employee=random.choice(EMP), description=f"{cat} - {v}")


def copy_of(r):
    n[0] += 1
    return {**r, "invoice_id": f"INV-{n[0]}"}


rows, expected = [], []
clean = [new() for _ in range(56)]
for i, r in enumerate(clean):          # keep ordinary rows clear of split-claim patterns
    while any(a["employee"] == r["employee"] and a["category"] == r["category"]
              and abs((date.fromisoformat(a["date"]) - date.fromisoformat(r["date"])).days) <= 2 for a in clean[:i]):
        r["employee"] = random.choice(EMP)
rows += clean
picks = random.sample(clean, 8)
for r in picks[:4]:                                   # exact duplicates
    d = copy_of(r); rows.append(d); expected.append((d["invoice_id"], "R3_EXACT_DUPLICATE"))
for r in picks[4:]:                                   # near duplicates: one digit off, 1-2 days later
    d = copy_of(r)
    d["invoice_no"] = r["invoice_no"][:-1] + str((int(r["invoice_no"][-1]) + 1) % 10)
    d["date"] = (date.fromisoformat(r["date"]) + timedelta(days=random.randint(1, 2))).isoformat()
    rows.append(d); expected.append((d["invoice_id"], "R4_NEAR_DUPLICATE"))
for f in ["vendor", "invoice_no", "category", "date", "amount"]:   # missing fields
    r = new(); r[f] = ""; rows.append(r); expected.append((r["invoice_id"], "R1_MISSING_FIELD"))
for _ in range(5):                                    # over limit
    r = new(); r["amount"] = round(LIMITS[r["category"]] * random.uniform(1.15, 1.8), 2)
    rows.append(r); expected.append((r["invoice_id"], "R2_OVER_LIMIT"))
for _ in range(3):                                    # just under limit
    r = new(); r["amount"] = round(LIMITS[r["category"]] * 0.97, 2)
    rows.append(r); expected.append((r["invoice_id"], "R5_JUST_UNDER_LIMIT"))
for d in ["2027-03-15", "2019-01-10"]:                # impossible dates
    r = new(); r["date"] = d; rows.append(r); expected.append((r["invoice_id"], "R6_INVALID_DATE"))

rest = [r for r in clean if r not in picks]
v1, v2, v3 = random.sample(rest, 3)
for r, how in ((v1, "suffix"), (v2, "case")):         # same invoice, vendor and number written differently
    d = copy_of(r)
    d["vendor"] = r["vendor"] + " Ltd." if how == "suffix" else r["vendor"].upper()
    d["invoice_no"] = " " + r["invoice_no"].lower() + " "
    rows.append(d); expected.append((d["invoice_id"], "R3_EXACT_DUPLICATE"))
d = copy_of(v3); d["vendor"] = v3["vendor"][:3] + v3["vendor"][4:]   # vendor typo: needs human review
rows.append(d); expected.append((d["invoice_id"], "R4_NEAR_DUPLICATE"))
rest = [r for r in rest if r not in (v1, v2, v3)]
for r, gap in zip(random.sample(rest, 5), (30, 30, 30, 10, 10)):     # legitimate repeats: must NOT be flagged
    d = copy_of(r)
    d["invoice_no"] = f"{r['vendor'][:3].upper()}-{random.randint(10000, 99999)}"
    d["date"] = (date.fromisoformat(r["date"]) - timedelta(days=gap)).isoformat()
    rows.append(d)

for r in random.sample(rest, 2):                      # same person, same day, same amount, different vendor
    d = copy_of(r); d["vendor"] = "Metro Trade Partners"; d["invoice_no"] = f"MTP-{random.randint(10000, 99999)}"
    rows.append(d); expected.append((d["invoice_id"], "R8_EMPLOYEE_REPEAT"))

for v, fracs in (("SkyHigh Travels", (0.55, 0.6)), ("CloudNine Software", (0.5, 0.58))):   # claims that together break the limit
    emp = random.choice(EMP)
    for k, frac in enumerate(fracs):
        r = new(v); r["employee"] = emp; r["amount"] = round(LIMITS[r["category"]] * frac, 2)
        r["date"] = (date(2026, 9, 10) + timedelta(days=k)).isoformat(); rows.append(r)
    expected.append((r["invoice_id"], "R9_SPLIT_CLAIM"))

with open(OUT / "sample_invoices.csv", "w", newline="") as f:
    w = csv.DictWriter(f, COLS); w.writeheader(); w.writerows(rows)
with open(OUT / "expected_flags.csv", "w", newline="") as f:
    w = csv.writer(f); w.writerow(["invoice_id", "rule"]); w.writerows(expected)
print(f"wrote {len(rows)} invoices, {len(expected)} planted problems")
