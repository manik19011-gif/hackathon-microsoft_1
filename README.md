# Veri-Fi — Invoice & Expense Checker

An explainable accounts-payable review dashboard. Deterministic rules make the screening decisions, similarity signals identify cases for a person to review, and optional Azure OpenAI only explains the evidence. The app works without an AI key: explanations and chat use a local rules-based fallback.

## Hackathon demo in five minutes

1. Start the backend and frontend using the commands below, then open **http://localhost:5173**.
2. Click **Start 90-second demo**. It loads the seeded 93 invoices and guides you through the run summary, an exact duplicate, an uncertain match, a reviewer decision, and the audit log.
3. Explain the distinction: **Flagged** means a high-confidence rule match; **Needs review** means the signals are uncertain and a person decides.
4. Finish with **Risk overview**, **Limits**, and **Ask the assistant**. These show prioritization, reviewer control, and plain-English access to the same evidence. Veri-Fi auto-passes clean invoices; exceptions remain available to reviewers with explanations and matched evidence where applicable.

The dashboard uses a compact workspace menu on desktop and a scrollable section bar on mobile. Its **Recommended next review** card surfaces the highest-priority open exception with the amount and ranking rationale, so the next action is clear during a live demo.

To demonstrate real file intake, download **Example CSV** in the app, then upload it. It uses familiar export headers and includes clean rows, an exact duplicate, a near duplicate, a limit exception, a split claim, and a missing field.

### 20-second pitch

“Invoice teams spend time checking every row, but exact-match rules miss near-duplicates and manual spot checks are hard to audit. Veri-Fi screens the full file with transparent rules, auto-passes clean rows, and sends exceptions to people with explanations and matched evidence. It records every decision. AI is optional and only explains; it never decides whether an invoice passes.”

## Start the app

### 1. Backend (port 8000)
Needs Python 3.10 or newer (developed and tested on 3.12).
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
