# Hackathon pitch notes

## One-line pitch

**An explainable invoice review assistant that extracts invoice documents, screens every row with rules and a trained anomaly model, sends uncertain cases to people, and keeps the evidence and decisions auditable.**

## Fit to the problem statement

- **Invoice / expense intake:** accepts CSV and Excel uploads and extracts fields from invoice photos and PDFs, with reviewer confirmation before checks.
- **Rule checks and short report:** checks required fields, duplicates, dates, category limits, and possible split claims; the exception report is downloadable as CSV.
- **Enterprise-grade routing:** clean rows auto-pass. Every flagged or uncertain exception stays in the human review queue; the trained anomaly model can only add low-confidence review signals, never auto-approve or reject.
- **Explainable findings:** each row has a plain-language rule explanation. Duplicate and related-claim findings include the matched invoice and side-by-side evidence when a comparison applies; model alerts show their amount-to-limit and vendor-peer signals.
- **Auditability:** the log records each system screening outcome, every reviewer decision and reason, and approved rule changes.

## 45-second spoken version

Finance teams have to check every invoice, but exact-match rules miss near duplicates and manual spot checks are difficult to audit. Veri-Fi can read an invoice photo or PDF in the browser, lets a reviewer confirm the extracted fields, and then screens the invoice alongside the current run. Deterministic checks find duplicates, missing fields, invalid dates, category-limit violations, and possible split claims. A trained Isolation Forest, calibrated on a separate synthetic invoice baseline, can add low-confidence outlier cases to the review queue. Reviewers see the rule or model signals and matched vendor peers where available. Every system finding and reviewer action is recorded. Neither the anomaly model nor optional language-model explanations approves or rejects an invoice. Demo counts are synthetic inputs, not measured production results.

## Suggested three-slide story

### 1. The gap

- Teams spend time checking routine invoices and still miss subtle duplicates.
- Exact matches are not enough: invoice numbers and vendor names can vary.
- Review decisions need a reason and a traceable record.

### 2. The product

- Screen every row with deterministic, configurable checks.
- Compare likely duplicates and show the matched record.
- Keep uncertain cases with a human reviewer; log the reason and decision.
- Use AI only for optional explanations and questions about the loaded data.

### 3. The demo and next step

- Start the guided demo, inspect the exact and fuzzy duplicate examples, and record one review decision.
- If time allows, scan a clear invoice photo or PDF, correct one extracted field, and show the new invoice being checked against the current run.
- Show the audit entry, then the vendor/category risk overview.
- Next: test against anonymized finance exports, collect reviewer feedback, and measure precision, recall, and review time before making real-world impact claims.

## Architecture

```mermaid
flowchart LR
    A[CSV / Excel] --> B[Column mapping and normalization]
    I[Invoice photo / PDF] --> O[In-browser extraction]
    O --> M[Reviewer confirms fields]
    M --> B
    B --> C[Deterministic invoice rules]
    B --> D[Vendor and invoice similarity]
    B --> M[Trained anomaly model]
    C --> E[Pass / Flag / Review]
    D --> E
    M --> E
    E --> F[Human review with matched evidence]
    E --> G[Audit log and reports]
    F --> G
    E --> H[Optional AI explanation and Q&A]
```

## Likely judge questions

**Why use AI at all?**

The approval decision needs to be repeatable and reviewable, so rules decide. Similarity identifies candidates; the reviewer resolves ambiguous cases. Optional AI makes the evidence easier to understand and query.

**How do you avoid false positives?**

The demo distinguishes high-confidence flags from lower-confidence review items. Similarity thresholds are configurable, matched records and signals are visible, and reviewer decisions are recorded. Production use would require validation on representative, anonymized data and measurement of precision and recall.

**What does “money at risk” mean?**

It is a screening estimate based on flagged duplicate amounts and over-limit excesses. It is not a confirmed loss or a payment instruction.

**What data is in the demo?**

All included invoices are synthetic. The project ships with a 93-row scenario set and a small example upload CSV using common finance-export column names.

## Be precise about demo metrics

The 93-row sample, its flags, and the time-saved estimate are demo inputs. Do not present them as measured customer outcomes. The time estimate is adjustable in the interface; it is not benchmarked.
