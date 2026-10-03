# 3-minute demo script

For a fast walkthrough, click **Start 90-second demo**. The app loads the sample and guides you through the story. For a longer presentation, use the five-minute script below. The sample has 93 invoices: 63 pass automatically, 18 are flagged, 12 need review, and approximately ₹39,628 is estimated at risk.

**0:00 The problem (20 s).** Finance teams check thousands of invoices by hand, so duplicates and over-limit claims slip through. ERP rules only catch exact rule breaks, and spot checks cover a sample.

**0:20 Every row is screened (30 s).** Point at the summary cards: all 93 rows were checked, 63 clean ones passed with no human time. Only the exceptions need a person.

**0:50 An explainable flag (45 s).** Open **INV-1057**. The flag says: "Exact duplicate: same vendor, invoice no. and amount as INV-1030." The matched record is shown side by side, so the reviewer does not have to search for it. Click **Explain with AI** to show the plain-English version.

**1:35 Fuzzy cases go to a human (30 s).** Open **INV-1061**: "Possible duplicate of INV-1047: same vendor, invoice no. 88% similar, amount within 1%, 1 day(s) apart." The confidence is 69%, below the auto-flag line, so it is routed to review instead of being decided by a rule. Click **Approve** or **Reject**.

**2:05 More patterns (30 s).** **INV-1070** is over its category limit. **INV-1091** is a split claim: small claims that together break the limit. **INV-1088** is the same person, same amount, same day, different vendor.

**2:35 Audit and control (25 s).** Open **Audit log**: every automatic and human decision is recorded. Open **Limits**, lower a limit, save, and watch the invoices re-check. Then use **Ask the assistant** ("show duplicates") and **Download report**.

**Optional upload proof.** Download **Example CSV** from the app, then upload it. The column mapper recognizes the supplier, invoice number, date, total, expense type, employee, and transaction ID headers.

## If something goes wrong
- No internet or Azure: everything still works. Explanations and chat fall back to rule-based text.
- Keep a screen recording of a full run as a backup.
- Re-run `python tests/smoke_api.py` before presenting to confirm the server is healthy.
