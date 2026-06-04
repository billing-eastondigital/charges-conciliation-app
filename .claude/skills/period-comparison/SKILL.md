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
         COUNT(*)                                          AS n_clients,
         COUNT(*) FILTER (WHERE recon_status = 'MATCH')   AS n_matches,
         COUNT(*) FILTER (WHERE recon_status <> 'MATCH')  AS n_exceptions
  FROM reconciliation_results
  WHERE period_label IN ('{period_a}', '{period_b}')
  GROUP BY period_label
)
SELECT * FROM t;
```

Compute deltas: absolute and percent.

### Step 2 — Client-level changes

```sql
SELECT
  COALESCE(a.stripe_id, b.stripe_id) AS stripe_id,
  COALESCE(a.display_name, b.display_name) AS display_name,
  a.expected_amount AS expected_a, a.collected_amount AS collected_a, a.recon_status AS status_a,
  b.expected_amount AS expected_b, b.collected_amount AS collected_b, b.recon_status AS status_b,
  COALESCE(a.collected_amount, 0) - COALESCE(b.collected_amount, 0) AS collected_delta
FROM reconciliation_results a
FULL OUTER JOIN reconciliation_results b
  ON a.stripe_id = b.stripe_id
  AND a.period_label = '{period_a}'
  AND b.period_label = '{period_b}'
WHERE a.period_label = '{period_a}' OR b.period_label = '{period_b}';
```

Bucket into:
- **New clients** (in A, not in B)
- **Lost clients / churn** (in B, not in A — and check if their `account_status = LOST`)
- **Improved**: `status_b <> 'MATCH'` AND `status_a = 'MATCH'`
- **Regressed**: `status_b = 'MATCH'` AND `status_a <> 'MATCH'`
- **Persistent exceptions**: same non-MATCH status both periods
- **Material variance changes**: |collected_delta| > $500 even if both are MATCH (large client growth/shrink)

### Step 3 — Exception changes

```sql
SELECT period_label, recon_status, COUNT(*) AS n, SUM(ABS(variance)) AS at_risk
FROM reconciliation_results
WHERE period_label IN ('{period_a}', '{period_b}') AND recon_status <> 'MATCH'
GROUP BY period_label, recon_status;
```

Note any new exception types appearing or disappearing.

### Step 4 — Output

Lead with the headline, then drill in:

```
{period_a} vs {period_b}
─────────────────────────
Billed:     ${a} → ${b}   (delta ${delta}, {pct}%)
Collected:  ${a} → ${b}   (delta ${delta}, {pct}%)
Variance:   ${a} → ${b}
Matches:    {a}/{n} → {b}/{n}
Exceptions: {a} → {b}

NOTABLE CHANGES
──────────────
NEW CLIENTS ({n}):
  - {client} — ${expected_a}
  ...

CHURN ({n}):
  - {client} — last billed {amount}
  ...

REGRESSED ({n}):  <- clients that matched last period but not this one
  - {client} — was MATCH, now {status_a} (${collected_delta})
  ...

IMPROVED ({n}):  <- collections cleared up
  - {client} — was {status_b}, now MATCH
  ...

PERSISTENT EXCEPTIONS ({n}):  <- still broken — needs intervention
  - {client} — {recon_status} for {streak} consecutive periods (${total_at_risk})
  ...

REVENUE MOVERS ({n} largest |delta|):
  - {client} — ${collected_b} → ${collected_a}  (${delta})
  ...
```

### Step 5 — Suggest follow-ups

For each NOTABLE bucket, suggest the next skill:
- REGRESSED → invoke `exception-triage` for these specific cus_ids
- PERSISTENT → invoke `client-outreach` (firm tone)
- New clients with anomalous amounts → invoke `data-quality` to check the AR sheet

## Guardrails

- Don't report comparisons against periods that aren't `is_closed = true`. Open periods are still mutating.
- If both periods don't have substantial data (< 5 reconciled rows), say so and stop.
- Percent deltas should suppress when the base is < $100 (a 200% change on $10 → $30 is noise, not signal).
