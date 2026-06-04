---
name: monthly-close
description: Run the full month-end reconciliation close. Use when the user says "cerrar mes", "monthly close", "cerrar abril", "close April", "run the close", "preparar cierre", "finalizar mes", "cierre mensual", "terminar período", or any time the user wants to finalize a billing period after Stripe charges have settled. This skill orchestrates the entire pipeline — Stripe data refresh, engine run, comparison vs prior month, exception triage, and review packet preparation — and stops to confirm with the user before any irreversible action (sign-off, archival).
---

# Monthly Close

You are running an end-of-month reconciliation close. Be methodical, surface anomalies, never silently widen tolerances or skip data.

## Inputs you need

Before starting, confirm:
- **Period to close** (e.g. "April 2026"). If ambiguous, ask.
- **Whether the period is final**: if today is before the 5th business day after period end, warn that Stripe charges may still settle and ask whether to proceed anyway.

## Procedure

Follow `docs/runbooks/monthly-close.md`. At each step, output a short status line and pause for the user before destructive operations (writes to Supabase, archive of source files).

### Step 1 — Verify Stripe data is current

Verify Stripe data is current: check that `stripe_charges` rows exist for the period via Supabase, or trigger a manual sync from `/admin/import`.

```sql
SELECT COUNT(*), SUM(amount) AS total_amount
FROM stripe_charges
WHERE period_label = '{period_label}' AND charge_status = 'PAID_NET';
```

If the count is 0 or unexpectedly low, do not proceed — instruct the user to sync charges via `/admin/import` first.

### Step 2 — Verify billing data is loaded

Verify data via Supabase: confirm `expected_charges` rows are loaded for the period before running the engine.

```sql
SELECT COUNT(*), SUM(expected_amount) AS total_billed
FROM expected_charges
WHERE period_label = '{period_label}';
```

If the count is 0, instruct the user to upload the billing xlsx via `/admin/import`.

### Step 3 — Run the engine for this period only

```bash
python3 -m reconciliation_engine.cli --period "{period_label}"
```

Read the engine output and report:
- Summary row count, discrepancy count
- Total Billed, Collected, Variance
- Run ID recorded in `reconciliation_runs`

### Step 4 — Diff vs prior month

```sql
SELECT
  'this_period' AS bucket,
  COUNT(*) FILTER (WHERE recon_status = 'MATCH') AS matches,
  COUNT(*) FILTER (WHERE recon_status = 'MISSING_PAYMENT') AS missing,
  COUNT(*) FILTER (WHERE recon_status = 'STRIPE_ONLY') AS stripe_only,
  COUNT(*) FILTER (WHERE recon_status IN ('UNDERPAID','OVERPAID')) AS variance,
  SUM(expected_amount) AS billed, SUM(collected_amount) AS collected
FROM reconciliation_results WHERE period_label = '{this_period}'
UNION ALL
SELECT 'prior_period',
  COUNT(*) FILTER (WHERE recon_status = 'MATCH'),
  COUNT(*) FILTER (WHERE recon_status = 'MISSING_PAYMENT'),
  COUNT(*) FILTER (WHERE recon_status = 'STRIPE_ONLY'),
  COUNT(*) FILTER (WHERE recon_status IN ('UNDERPAID','OVERPAID')),
  SUM(expected_amount), SUM(collected_amount)
FROM reconciliation_results WHERE period_label = '{prior_period}';
```

Surface deltas. Anything > ±20% on counts or > ±10% on totals → flag and ask the user whether to investigate before continuing.

### Step 5 — Find recurring exceptions

```sql
SELECT stripe_id, display_name, recon_status,
       COUNT(*) AS streak_months,
       SUM(variance) AS total_variance
FROM reconciliation_results
WHERE recon_status IN ('UNDERPAID','MISSING_PAYMENT')
  AND period_label IN ('{this_period}', '{prior_period}', '{two_back}')
GROUP BY stripe_id, display_name, recon_status
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

### Step 7 — Sign-off (DO NOT do without explicit user confirmation)

After the user reviews, only then:
- Update `periods` table: `is_closed = true`, `closed_at = now()`.
- Move source files to `reports/closed/{YYYY-MM}/` with their hashes (if local copies exist).

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
```

## Forensic guardrails — never violate

- Do not modify the engine's tolerance, refund policy, or grain to "fix" a discrepancy. If the math doesn't match, the input data or business rules are wrong, not the engine.
- Do not mark a period closed if any exception in that period has `resolution_status = 'open'`. All exceptions need resolution or explicit "won't fix" before sign-off.
