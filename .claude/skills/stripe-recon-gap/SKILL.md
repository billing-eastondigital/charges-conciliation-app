---
name: stripe-recon-gap
description: Diagnose the gap between Stripe PAID_NET total and the reconciliation collected total for a period. Use when the user says "stripe shows X but period page shows Y", "there's a $X discrepancy", "missing amount in period page", "gap between stripe and reconciliation", "why does collected not match", or "discrepancy in collected amounts".
---

# Stripe ↔ Reconciliation Gap Analysis

You are a forensic analyst. Your job is to explain, to the dollar, why the Stripe PAID_NET total for a period differs from the reconciliation `collected_amount` total shown on the Period page. Every dollar of gap must be accounted for with a named root cause.

## Inputs

The user must provide a `period_label` (e.g. "April 2026"). If not given, ask for it before proceeding.

---

## Procedure

### Step 1 — Establish the gap

Run both totals simultaneously:

```sql
-- Stripe gross PAID_NET for the period
SELECT
  SUM(amount)                                          AS stripe_paid_net,
  COUNT(*)                                             AS stripe_charge_count,
  COUNT(CASE WHEN stripe_id IS NULL THEN 1 END)        AS null_stripe_id_count,
  SUM(CASE WHEN stripe_id IS NULL THEN amount ELSE 0 END) AS null_stripe_id_amount
FROM stripe_charges
WHERE period_label = '{period_label}'
  AND charge_status = 'PAID_NET';
```

```sql
-- Reconciliation collected total for the period
SELECT
  SUM(collected_amount)  AS recon_collected,
  COUNT(*)               AS result_count,
  MAX(run_id)            AS latest_run_id
FROM reconciliation_results
WHERE period_label = '{period_label}';
```

Compute: `gap = stripe_paid_net - recon_collected`

If gap = 0, report "No discrepancy found" and stop.

---

### Step 2 — Find unattributed charges (biggest driver)

These are PAID_NET charges whose `stripe_id` does not appear in any reconciliation result for the period. They will never contribute to `collected_amount`.

```sql
SELECT
  sc.charge_id,
  sc.stripe_id,
  sc.customer_email,
  sc.amount,
  sc.created_at_stripe,
  sc.source_account,
  c.display_name
FROM stripe_charges sc
LEFT JOIN reconciliation_results rr
  ON rr.period_label = '{period_label}' AND rr.stripe_id = sc.stripe_id
LEFT JOIN clients c ON c.stripe_id = sc.stripe_id
WHERE sc.period_label = '{period_label}'
  AND sc.charge_status = 'PAID_NET'
  AND rr.stripe_id IS NULL
ORDER BY sc.amount DESC;
```

For each unattributed charge, classify the root cause:

| Root cause | Signal | Fix |
|---|---|---|
| **No Stripe ID** | `stripe_id IS NULL` | Add customer ID to billing sheet, re-run engine |
| **New customer** | `stripe_id` not in `clients` table | Auto-placeholder should have been created; check client DB |
| **Wrong period** | Charge date near month boundary | Verify EST vs UTC timezone; may belong to adjacent period |
| **Post-duplicate-cleanup orphan** | Charge was previously reconciled under old CSV charge_id | Re-run engine to regenerate results |
| **STRIPE_ONLY not yet reconciled** | Engine hasn't been run since charge was loaded | Re-run engine |

---

### Step 3 — Check for over-attribution (gap could be negative)

If `recon_collected > stripe_paid_net`, the engine counted more than Stripe shows. Common causes:

```sql
-- Charges counted in reconciliation but NOT in stripe_charges PAID_NET
-- (e.g. FAILED_RETRY counted as PAID, or duplicate CSV rows still present)
SELECT
  rr.stripe_id,
  rr.display_name,
  rr.collected_amount   AS recon_says,
  COALESCE(sc_agg.total_paid, 0) AS stripe_says,
  rr.collected_amount - COALESCE(sc_agg.total_paid, 0) AS over_count
FROM reconciliation_results rr
LEFT JOIN (
  SELECT stripe_id, SUM(amount) AS total_paid
  FROM stripe_charges
  WHERE period_label = '{period_label}' AND charge_status = 'PAID_NET'
  GROUP BY stripe_id
) sc_agg ON sc_agg.stripe_id = rr.stripe_id
WHERE rr.period_label = '{period_label}'
  AND ABS(rr.collected_amount - COALESCE(sc_agg.total_paid, 0)) > 0.01
ORDER BY ABS(rr.collected_amount - COALESCE(sc_agg.total_paid, 0)) DESC;
```

---

### Step 4 — Check for stale reconciliation results

If the engine was last run before recent stripe_charges changes (duplicate cleanup, new API sync), the results are out of date.

```sql
SELECT
  rr_run.run_id,
  rr_run.created_at       AS engine_ran_at,
  sc_last.last_charge_at  AS last_charge_loaded_at,
  rr_run.created_at < sc_last.last_charge_at AS results_are_stale
FROM (
  SELECT MAX(run_id) AS run_id, MAX(created_at) AS created_at
  FROM reconciliation_runs
  WHERE period_label = '{period_label}'
) rr_run,
(
  SELECT MAX(created_at) AS last_charge_loaded_at
  FROM stripe_charges
  WHERE period_label = '{period_label}'
) sc_last;
```

If `results_are_stale = true`, a re-run is required before the gap can be fully explained.

---

### Step 5 — Check for duplicate stripe_charges (if gap is large and positive)

Duplicate charges inflate the Stripe total without affecting reconciliation (which de-duplicates by stripe_id).

```sql
SELECT
  stripe_id,
  customer_email,
  COUNT(*)                AS charge_count,
  COUNT(DISTINCT source_account) AS sources,
  STRING_AGG(source_account::text, ', ' ORDER BY source_account NULLS FIRST) AS source_list,
  SUM(amount)             AS total_amount,
  MIN(created_at_stripe)  AS first_charge,
  MAX(created_at_stripe)  AS last_charge
FROM stripe_charges
WHERE period_label = '{period_label}'
  AND charge_status = 'PAID_NET'
GROUP BY stripe_id, customer_email
HAVING COUNT(*) > 1
ORDER BY SUM(amount) DESC;
```

Flag any customer where `sources > 1` (same customer charged by both CSV seed and API) — these are CSV vs API duplicates and should be deleted (keep `source_account = 'main'` for main account, keep Launch CSV rows for Launch clients).

---

## Output format

Produce a structured gap report:

```
STRIPE ↔ RECONCILIATION GAP REPORT — {period_label}
════════════════════════════════════════════════════

Stripe PAID_NET total : ${stripe_paid_net}
Reconciliation total  : ${recon_collected}
Gap                   : ${gap}

ROOT CAUSES
───────────
1. Unattributed charges (no stripe_id or no recon result): ${total_unattributed}
   - {charge_id} · {customer_email} · ${amount} · Cause: {root_cause}
   ...

2. Over-attribution (recon > stripe): ${over_count_total}
   - {stripe_id} · {display_name} · recon says ${X}, stripe says ${Y}
   ...

3. Stale results: {YES / NO}
   - Last engine run: {date}
   - Last charge loaded: {date}

4. Duplicate charges: {count found}
   - {details if any}

VERIFICATION
─────────────
Accounted gap: ${sum_of_all_causes}
Unexplained  : ${gap - accounted_gap}   ← should be $0.00

RECOMMENDED ACTIONS
────────────────────
{ordered list of concrete next steps, e.g.:}
1. Re-run the reconciliation engine: python3 -m reconciliation_engine.cli --period "{period_label}"
2. Add Stripe ID for {customer_email} to billing sheet and re-import
3. Delete duplicate CSV rows for {stripe_id} (source_account = null, non-Launch)
```

---

## Forensic guardrails

- Never mark the gap as "resolved" without explaining every dollar.
- A gap from a null-stripe_id charge is structural — it persists until the AR sheet is fixed. Document it, do not suppress it.
- Stale results must be flagged even if they don't explain the full gap — they mean the gap calculation itself may be wrong.
- If `unexplained > $0.01` after all steps, escalate — do not guess.
