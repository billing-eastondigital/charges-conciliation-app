---
name: period-comparison
description: Compare two reconciliation periods and surface anomalies, growth, and decline. Use when the user says "compare April vs March", "comparar abril contra marzo", "month-over-month", "QoQ", "YoY", "what changed since last period", or any request to understand differences between two reconciled periods. Returns per-client deltas, new exceptions, resolved exceptions, churn (clients lost), and revenue trends.
---

# Period Comparison

You are computing a structured diff between two closed periods. Goal: tell the user what changed and what's noteworthy, not just dump numbers.

## Inputs

- Period A (the more recent / "this")
- Period B (the older / "prior")

If only one is given, default Period B to the immediately prior month.

## Procedure

### Step 1 — High-level totals

```sql
WITH t AS (
  SELECT period_label,
         SUM(expected_amount)  AS billed,
         SUM(collected_amount) AS collected,
         SUM(variance)         AS variance,
         COUNT(*)                                  AS n_clients,
         COUNT(*) FILTER (WHERE status = 'MATCH')  AS n_matches,
         COUNT(*) FILTER (WHERE status <> 'MATCH') AS n_exceptions
  FROM reconciliation_results
  WHERE period_label IN (?, ?)
  GROUP BY period_label
)
SELECT * FROM t;
```

Compute deltas: absolute and percent.

### Step 2 — Client-level changes

```sql
SELECT
  COALESCE(a.stripe_id, b.stripe_id) AS stripe_id,
  COALESCE(a.account_names, b.account_names) AS client,
  b.expected_amount AS expected_prior,
  a.expected_amount AS expected_this,
  b.collected_amount AS collected_prior,
  a.collected_amount AS collected_this,
  b.status AS status_prior,
  a.status AS status_this,
  COALESCE(a.collected_amount,0) - COALESCE(b.collected_amount,0) AS collected_delta
FROM reconciliation_results a
FULL OUTER JOIN reconciliation_results b
  ON a.stripe_id = b.stripe_id
WHERE a.period_label = ? AND b.period_label = ?;
```

Bucket into:
- **New clients** (in A, not in B)
- **Lost clients / churn** (in B, not in A — and check if their `account_status = LOST`)
- **Improved**: `status_prior <> 'MATCH'` AND `status_this = 'MATCH'`
- **Regressed**: `status_prior = 'MATCH'` AND `status_this <> 'MATCH'`
- **Persistent exceptions**: same non-MATCH status both periods
- **Material variance changes**: |collected_delta| > $500 even if both are MATCH (large client growth/shrink)

### Step 3 — Exception changes

```sql
SELECT period_label, status, COUNT(*) AS n, SUM(ABS(variance)) AS at_risk
FROM reconciliation_results
WHERE period_label IN (?, ?) AND status <> 'MATCH'
GROUP BY period_label, status;
```

Note any new exception types appearing or disappearing.

### Step 4 — Output

Lead with the headline, then drill in:

```
{period_a} vs {period_b}
─────────────────────────
Billed:     ${a} → ${b}   (Δ ${delta}, {pct}%)
Collected:  ${a} → ${b}   (Δ ${delta}, {pct}%)
Variance:   ${a} → ${b}
Matches:    {a}/{n} → {b}/{n}
Exceptions: {a} → {b}

NOTABLE CHANGES
──────────────
NEW CLIENTS ({n}):
  - {client} — ${expected_this}
  ...

CHURN ({n}):
  - {client} — last billed {amount}
  ...

REGRESSED ({n}):  ← clients that matched last period but not this one
  - {client} — was MATCH, now {status_this} (${collected_delta})
  ...

IMPROVED ({n}):  ← collections cleared up
  - {client} — was {status_prior}, now MATCH
  ...

PERSISTENT EXCEPTIONS ({n}):  ← still broken — needs intervention
  - {client} — {status} for {streak} consecutive periods (${total_at_risk})
  ...

REVENUE MOVERS ({n} largest |delta|):
  - {client} — ${collected_prior} → ${collected_this}  (${delta})
  ...
```

### Step 5 — Suggest follow-ups

For each NOTABLE bucket, suggest the next skill:
- REGRESSED → invoke `exception-triage` for these specific cus_ids
- PERSISTENT → invoke `client-outreach` (firm tone)
- New clients with anomalous amounts → invoke `data-quality` to check the AR sheet

## Guardrails

- Don't report comparisons against periods that aren't `closed = true`. Open periods are still mutating.
- If both periods don't have substantial data (< 5 reconciled rows), say so and stop.
- Percent deltas should suppress when the base is < $100 (a 200% change on $10 → $30 is noise, not signal).
