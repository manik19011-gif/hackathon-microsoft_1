# 3.5-minute demo script

For a fast walkthrough, click **Start 90-second demo**. The app loads the sample and guides you through the story. For a longer presentation, use the five-minute script below. The sample contains 93 synthetic invoices; live summary counts and estimated risk can change with the saved policy limits and model signals.

## Optional role-based workflow (about 60 seconds)

Sign in as an employee and show the employee-friendly overview, a request submission, request status tracking, and shared resources. Then sign out and sign in as an administrator. On the first admin sign-in, enroll an authenticator app. Open **Admin console** to show the account/role table, the request queue, shared resource publishing, role access settings, and 7/30/90-day workspace activity. Admin actions appear in the audit stream. Use the built-in demo credentials only on a local machine; replace them for any shared presentation environment.

**0:00 The problem (20 s).** Finance teams check thousands of invoices by hand, so duplicates and over-limit claims slip through. ERP rules only catch exact rule breaks, and spot checks cover a sample.

**0:20 Every row is screened (30 s).** Point at the summary cards: all 93 rows were checked, 62 clean ones passed with no human time. The review queue contains rule exceptions and low-confidence model signals.

**0:50 An explainable flag (45 s).** Open **INV-1057**. The flag says: "Exact duplicate: same vendor, invoice no. and amount as INV-1030." The matched record is shown side by side, so the reviewer does not have to search for it. Click **Explain with AI** to show the plain-English version.

**1:35 Fuzzy cases go to a human (30 s).** Open **INV-1061**: "Possible duplicate of INV-1047: same vendor, invoice no. 88% similar, amount within 1%, 1 day(s) apart." The confidence is 69%, below the auto-flag line, so it is routed to review instead of being decided by a rule. Click **Approve** or **Reject**.

**2:05 More patterns (30 s).** **INV-1070** is over its category limit. **INV-1091** is a split claim: small claims that together break the limit. **INV-1088** is the same person, same amount, same day, different vendor.

**2:35 Trained anomaly signal (25 s).** Open **INV-1052**. The Isolation Forest gives it a 99.2/100 anomaly percentile because its amount is unusual relative to the loaded vendor peers. Point out the matched invoice and signal details. This is a rarity score against synthetic demo data, not fraud probability; the row remains for human review. The shipped model was trained on 40,000 synthetic clean invoices and calibrated separately on 8,000 synthetic rows.

**3:00 Audit and control (25 s).** Open **Audit log**: every automatic and human decision is recorded. Open **Limits**, lower a limit, save, and watch the invoices re-check. Then use **Ask the assistant** ("show duplicates") and **Download report**.

**Optional upload proof.** Download **Example CSV** from the app, then upload it. The column mapper recognizes the supplier, invoice number, date, total, expense type, employee, and transaction ID headers.

**Optional document-intake proof.** Choose **Scan invoice**, select a clear invoice photo or PDF, correct any uncertain field, and confirm it. Point out that the document is processed in the browser and the confirmed invoice is checked against the current run, where duplicate evidence can be surfaced.

## If something goes wrong
- No Azure: explanations and chat fall back to rule-based text. The first scanned-image OCR needs internet to download its engine and English model; text-based PDFs can be extracted locally by the browser.
- Keep a screen recording of a full run as a backup.
- Re-run `python tests/smoke_api.py` before presenting to confirm the server is healthy.

