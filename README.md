# Veri-Fi — Invoice & Expense Checker

An explainable accounts-payable review dashboard. Deterministic rules make high-confidence screening decisions, a trained Isolation Forest surfaces unusual in-limit spend for human review, and optional Azure OpenAI only explains the evidence. The app works without an AI key: explanations and chat use a local rules-based fallback.

## Role-based workspace

Veri-Fi includes a secured administrator console and a separate employee workspace. Administrators manage accounts and roles, review employee requests, publish employee resources, configure employee access, and view workspace analytics and activity. Employees can update their profile, change their password, submit requests, follow request status, and open shared resources. Invoice screening and policy tools are restricted to authenticated administrators.

### Local showcase accounts

On first startup the local app seeds these demo accounts (passwords are hashed with Argon2id):

- Administrator: `admin@verifi.local` / `VeriFiAdmin!2026`
- Employee: `employee@verifi.local` / `VeriFiEmployee!2026`

The first administrator sign-in requires setting up an authenticator app. Admin sessions use time-based one-time codes on later sign-ins. For a local showcase, keep the seeded credentials private. Before a shared or public deployment, set `VERIFI_ADMIN_PASSWORD` and `VERIFI_EMPLOYEE_PASSWORD` before the first launch, use HTTPS, and configure secure cookies with `VERIFI_COOKIE_SECURE=true`. The SQLite database is created in `backend/audit.db`; local databases already seeded will retain their existing account passwords.

Sessions are opaque random tokens stored as hashes, held in `HttpOnly`, `SameSite=Strict` cookies, expire after eight hours, and are invalidated at logout and password reset. Mutating requests use a CSRF token. Repeated failed sign-ins are temporarily rate-limited. Audit entries record sign-in events, role/account changes, access changes, employee requests, and admin actions.

This is a hackathon/local demonstration, not a production identity provider. Password recovery is administrator-assisted; add an email delivery and recovery-token workflow before real deployment. Use a managed database and secret management for a shared environment, and complete a security review before handling real employee or financial data.

## Hackathon demo in five minutes

1. Start the backend and frontend using the commands below, then open **http://localhost:5173**.
2. Click **Start 90-second demo**. It loads the seeded 93 invoices and guides you through the run summary, an exact duplicate, an uncertain match, a reviewer decision, and the audit log.
3. Explain the distinction: **Flagged** means a high-confidence rule match; **Needs review** means the signals are uncertain and a person decides.
4. Point out the trained anomaly-model banner and open a model-only exception to show its score, vendor peer comparison, and human-review guardrail.
5. Finish with **Risk overview**, **Limits**, and **Ask the assistant**. These show prioritization, reviewer control, and plain-English access to the same evidence. Veri-Fi auto-passes clean invoices; exceptions remain available to reviewers with explanations and matched evidence where applicable.

The dashboard uses a compact workspace menu on desktop and a scrollable section bar on mobile. Its **Recommended next review** card surfaces the highest-priority open exception with the amount and ranking rationale, so the next action is clear during a live demo.

To demonstrate real file intake, download **Example CSV** in the app, then upload it. It uses familiar export headers and includes clean rows, an exact duplicate, a near duplicate, a limit exception, a split claim, and a missing field.

### 20-second pitch

“Invoice teams spend time checking every row, but exact-match rules miss near-duplicates and manual spot checks are hard to audit. Veri-Fi screens the full file with transparent rules, auto-passes clean rows, and sends exceptions to people with explanations and matched evidence. It records every decision. AI is optional and only explains; it never decides whether an invoice passes.”

## Start the app

### 1. Backend (port 8000)
Needs Python 3.10 through 3.13 (developed and tested on 3.12).
```bash
python -m venv .venv
.venv\Scripts\activate          # Windows   (macOS/Linux: source .venv/bin/activate)
pip install -r requirements.txt
python tests/test_rules.py      # checks the engine against the answer key
cd backend
uvicorn main:app --reload --port 8000
```
Without a frontend build, http://localhost:8000 serves the no-build CDN version in `frontend/legacy`.

### 2. Frontend (Vite + React + Tailwind)
```bash
cd frontend
npm install
npm run dev        # http://localhost:5173, proxies /api to port 8000
npm run build      # optional: creates frontend/dist, then http://localhost:8000 serves it
```

For the polished demo, run `npm run build` before starting the backend or keep the Vite dev server running. Without a build, the backend serves the older CDN fallback UI.

## Optional integrations

### PostgreSQL audit log
```bash
docker compose up -d
```
Copy `.env.example` to `.env` and uncomment `DATABASE_URL`. Restart the backend and open
http://localhost:8000/api/health, which should show `"audit_db": "postgres"`. Without `DATABASE_URL`, a local SQLite file is used.

### Azure OpenAI explanations (optional)
Fill in the three `AZURE_OPENAI_*` values in `.env`. If a call fails, the app falls back to rule-based text.

## Uploading your own file
Common column names are matched automatically (supplier, invoice number, total, expense type and similar), currency text such as `Rs. 1,200.50` is read as a number, and `dd/mm/yyyy` dates are read day-first. The dashboard shows which columns were matched. `frontend/legacy` is the older no-build page and does not have the new search and sorting.

## Limits and risk views
The **Limits** tab edits the category limits and re-checks the loaded invoices (reviewer decisions are kept). **Risk overview** ranks the estimated exposure by vendor and category. Bar values include only high-confidence flagged amounts; review cases are counted separately.

## Review queue and learning
**Start review** walks the exceptions in priority order (rule score x money exposed) and moves to the next one after each decision. Keys: 1-4 pick the reason, A approves, R rejects. Every decision needs a reason, which goes to the audit log and to **Download reviewer feedback**. When reviewers keep approving near-duplicate flags in the lowest similarity band, a suggestion appears to raise `inv_sim`; it only changes after someone clicks **Apply and re-check**, and the change is audit-logged.

The results page also shows review progress, the amount protected by rejections and an editable time-saved estimate. The time saved is a reviewer-adjustable estimate, not a measured benchmark. Opening an invoice shows that vendor's invoices on a timeline. On the **Limits** tab, edits show their effect (flagged, review, money at risk) before you save.

## Trained anomaly model

The shipped `backend/models/invoice_anomaly.joblib` is an Isolation Forest trained by `backend/train_model.py` on 40,000 reproducibly generated synthetic clean invoices and calibrated on a separate 8,000-row synthetic set. Its features are amount relative to the category policy limit and deviation from same-vendor/category invoice peers in the loaded batch. Rows in the rarest 1.5% of the calibration baseline, if not already caught by a rule, receive a **low-confidence model review signal**. The model cannot create a high-confidence flag, auto-pass, approve, reject, or make payment decisions. Its score is a percentile against synthetic data, not a fraud probability or a measured production metric.

To rebuild the artifact after changing model code, activate the environment and run `python backend/train_model.py`. The model package is installed with `requirements.txt`. For real deployment, replace the synthetic baseline with an approved, representative, labeled data set and evaluate precision, recall, calibration, and false-positive rates with finance reviewers.

### Scan an invoice document

Choose **Scan invoice** to read an invoice image (PNG/JPG/WebP) or a PDF of up to five pages. Digital PDFs use their embedded text; image-only pages use Tesseract OCR in the browser. Verify or correct the vendor, invoice number, date, total, and category before sending the extracted fields to Veri-Fi. The original document and raw OCR text stay in the browser; confirmed fields are appended to the current run so duplicate checks can compare them with loaded records. First image OCR needs internet to download the OCR worker and English model. Extraction is a convenience, not a payment decision.

## Restarts
The latest results, including reviewer decisions, are saved in the database and reloaded when the backend restarts.

## Checks before you present
`python tests/test_rules.py` tests the rules. With the server running, `python tests/smoke_api.py` checks every endpoint. `DEMO.md` has a 3-minute script using real invoice IDs from the sample data.

Files over 10 MB or 50,000 rows are rejected. The database keeps the last 5 runs, and the audit log is never pruned. “Money at risk” is a screening estimate based on detected over-limit excesses and duplicate amounts; reviewers should validate exceptions before payment decisions.

## Tuning
All matching thresholds live in `CFG` at the top of `backend/rules.py` (date window, amount tolerance,
invoice-number and vendor similarity, flag confidence). `python data/make_sample.py` regenerates the sample
CSV (93 rows: planted problems plus legitimate repeats that must not be flagged) and `expected_flags.csv`.

## Presentation notes

See [HACKATHON_PITCH.md](HACKATHON_PITCH.md) for a short pitch, architecture diagram, judge questions, and a next-step roadmap. The sample data is synthetic and the time-saved number is an editable estimate; present both as demo aids, not measured production outcomes.

## Run Veri-Fi on another computer

1. Install Python 3.10 through 3.13 on the target computer.
2. Extract the ZIP to a normal folder.
3. On Windows, double-click `START_VERI_FI.bat`. On macOS/Linux, run `bash START_VERI_FI.sh` from that folder.
4. The first launch installs the Python packages (internet access required), starts the app, and opens `http://localhost:8000`.

The polished frontend build is included, so Node.js is not required. Azure OpenAI is optional; without its credentials Veri-Fi uses its local explanation fallback. Keep the server window open while using the app.
