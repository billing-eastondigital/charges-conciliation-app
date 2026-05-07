---
name: monthly-close
description: Run the full month-end reconciliation close. Use when the user says "cerrar mes", "monthly close", "cerrar abril", "close April", "run the close", "preparar cierre", or any time the user wants to finalize a billing period after Stripe charges have settled. This skill orchestrates the entire pipeline — Stripe data refresh, engine run, comparison vs prior month, exception triage, and review packet preparation — and stops to confirm with the user before any irreversible action (sign-off, archival).
---

# Monthly Close

You are running an end-of-month reconciliation close. Be methodical, surface anomalies, never silently widen tolerances or skip data.

## Inputs you need

Before starting, confirm:
- **Period to close** (e.g. "April 2026"). If ambiguous, ask.
- **Source files**: master billing workbook path; Stripe CSV(s) covering the period.
- **Whether the period is final**: if today is before the 5th business day after period end, warn that Stripe charges may still settle and ask whether to proceed anyway.

## Procedure

Follow `docs/runbooks/monthly-close.md`. At each step, output a short status line and pause for the user before destructive operations (writes to `reconciliation.db`, archive of source files).

### Step 1 — Refresh source data

If `tools/scripts/stripe_pull.py` exists and `STRIPE_SECRET_KEY` is set, run it for the period. Otherwise, ask the user to drop the CSV at `data/stripe_{period}.csv`.

### Step 2 — Run the engine for this period only

```bash
python -m reconciliation_engine.cli \
    --period "{period_label}" \
    --xlsx ./data/billing.xlsx \
    --csv  ./data/stripe_{period}.csv \
    --out  ./reports/{period_slug}.xlsx
```

Read the resulting `Run_Metadata` tab and report:
- Source-file SHA-256 hashes
- Summary row count, discrepancy count
- Total Billed, Collected, Variance

### Step 3 — Refresh the historical cache

```bash
python -m reconciliation_engine.historical_ingest \
    --xlsx ./data/billing.xlsx --csv ./data/stripe_*.csv \
    --db ./reconciliation.db
```

### Step 4 — Diff vs prior month

Query SQLite/Postgres:

```sql
SELECT
  'this_period' AS bucket,
  COUNT(*) FILTER (WHERE status = 'MATCH') AS matches,
  COUNT(*) FILTER (WHERE status = 'MISSING_PAYMENT') AS missing,
  COUNT(*) FILTER (WHERE status = 'UNBILLED_PAYMENT') AS unbilled,
  COUNT(*) FILTER (WHERE status IN ('UNDERPAID','OVERPAID')) AS variance,
  SUM(expected_amount) AS billed, SUM(collected_amount) AS collected
FROM reconciliation_results WHERE period_label = '{this_period}'
UNION ALL
SELECT 'prior_period', ... FROM reconciliation_results WHERE period_label = '{prior_period}';
```

Surface deltas. Anything > ±20% on counts or > ±10% on totals → flag and ask the user whether to investigate before continuing.

### Step 5 — Find recurring exceptions

```sql
SELECT stripe_id, account_names, status,
       COUNT(*) AS streak_months,
       SUM(variance) AS total_variance
FROM reconciliation_results
WHERE status IN ('UNDERPAID','MISSING_PAYMENT')
  AND period_label IN ('{this_period}', '{prior_period}', '{two_back}')
GROUP BY stripe_id, account_names, status
HAVING COUNT(*) >= 2
ORDER BY ABS(SUM(variance)) DESC;
```

Any client appearing for 2+ consecutive months in the same exception status is a structural problem, not a one-off. Highlight these specifically and suggest invoking `exception-triage` on each.

### Step 6 — Prepare the owner's review packet

Generate a one-page summary in `reports/{period_slug}_summary.md`:
- Headline: total billed, collected, exceptions count.
- Top 5 exceptions by amount-at-risk with one-line cause if known.
- Recurring exceptions (from step 5).
- Comparison to prior month (key deltas).
- Link to the dashboard period view.

Attach the Excel report from step 2.

### Step 7 — Sign-off (DO NOT do without explicit user confirmation)

After the user reviews, only then:
- Update `periods` table: `closed = true`, `closed_at = now()`.
- Move source files to `reports/closed/{YYYY-MM}/` with their hashes.

## Output format

End your run with a structured summary the user can paste into Slack/email:

```
Monthly Close — {period}
─────────────────────────
Billed:     ${...}
Collected:  ${...}
Variance:   ${...}  ({pct}% vs prior month)
Matches:    {n} / {total}
Exceptions: {n}  (top 3 below)
  1. {client} — {status} — ${amount} — {note}
  2. ...
At risk:    ${total_underpaid + total_missing}
Report:     reports/{period_slug}.xlsx (sha256: {short_hash})
```

## Forensic guardrails — never violate

- Do not modify the engine's tolerance, refund policy, or grain to "fix" a discrepancy. If the math doesn't match, the input data or business rules are wrong, not the engine.
- Do not run the close if `data/billing.xlsx` was modified after the engine's last successful run on a closed period — it would silently rewrite history.
- Do not mark a period closed if any exception in that period has `status = 'open'`. All exceptions need resolution or explicit "won't fix" before sign-off.
