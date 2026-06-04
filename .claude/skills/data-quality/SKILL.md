---
name: data-quality
description: Diagnose data quality problems in the billing data and propose fixes WITHOUT silently rewriting history. Use when the user says "the engine is failing on {period}", "weird numbers in {period}", "data quality issue", "fix the AR sheet", "el motor falla con {período}", "importación falló", "upload failed", "el import no funcionó", or when the engine produces obviously wrong results for a period. This skill identifies the root cause (missing Stripe ID, malformed numbers, embedded notes, locale-specific decimal separators) and proposes a fix that is auditable and reversible.
---

# Data Quality

You are diagnosing dirty data. Your goal is to identify the problem precisely, not to make symptoms go away. Every fix proposal must be auditable and reversible.

## Common issues seen in this workbook

| Symptom | Likely cause | Fix pattern |
|---|---|---|
| `sequence item 0: expected str instance, float found` | NaN floats in cells expected to be strings (Account Name, Email, Stripe Id) | Defensive cast in code (already in place); for sheet-level repair, replace NaN with empty string in source and re-upload via /admin/import |
| Stripe Id cell contains an email address or free-text note | Manual data-entry where the field was repurposed | Move the note to `Custom Billing Notes`; leave Stripe Id empty if unknown; flag the row |
| `Total to Bill` shows zero for an ACTIVE account | Formula didn't propagate, OR the row is genuinely $0 (rare) | Inspect adjacent columns (Google Revenue, Base Fee, etc.); recompute by formula; if intentional, document |
| Decimal separator inconsistency (e.g. `1.234,56`) | Locale-specific Excel save (es-AR locale) | Normalize in the source file, then re-upload via /admin/import |
| Same `Stripe Id` for accounts that aren't actually one client | Copy-paste error during AR sheet maintenance | THIS IS NOT A FIX — flag it, ask the user. Do not change `Stripe Id` without confirmation. |

## Procedure

### Step 1 — Reproduce the problem

Query Supabase to inspect the loaded data:

```sql
SELECT account_name, stripe_id, expected_amount, batch
FROM expected_charges
WHERE period_label = '{period}'
ORDER BY account_name;
```

Look for:
- null `stripe_id` with non-zero `expected_amount` (can't be reconciled)
- duplicate account names (possible double-upload)
- zero `expected_amount` rows that appear active (placeholder rows)

If the issue is in the original xlsx before upload, and the file is available locally:

```python
python3 -c "import openpyxl; wb=openpyxl.load_workbook('./data/billing.xlsx'); ws=wb.active; [print(r) for r in list(ws.iter_rows(values_only=True))[0:5]]"
```

### Step 2 — Inspect the offending rows

For rows with missing or suspicious values, pull more detail:

```sql
SELECT *
FROM expected_charges
WHERE period_label = '{period}'
  AND (stripe_id IS NULL OR expected_amount = 0 OR expected_amount IS NULL)
ORDER BY account_name;
```

Look for:
- Mixed types or unexpected values in `stripe_id` (e.g. an email address instead of a cus_ ID)
- Rows that are clearly inactive placeholders vs rows that should have real amounts
- Duplicate stripe_ids that shouldn't map to the same client

### Step 3 — Classify the issue

| Class | Action |
|---|---|
| Code defect (engine doesn't tolerate valid-but-unusual data) | Fix the engine, add a regression test, no sheet change |
| Data-entry error in the sheet (typo, wrong column) | Propose sheet edit; show before/after; user fixes in source file and re-uploads via /admin/import |
| Genuinely missing data (no Stripe Id for an active account) | Flag for the user — engine cannot reconcile this row, will be in `expected_charges` but no match |
| Ambiguity (one Stripe Id, multiple Account Names, but unclear if intentional) | DO NOT touch — ask the user to confirm via `client_directory` |

### Step 4 — Propose the fix

Output:

```
ISSUE
─────
Period:  {period}
Row:     {account_name}
Symptom: {error or anomaly}

ROOT CAUSE
──────────
{1-2 sentence diagnosis with evidence from the inspection}

PROPOSED FIX
────────────
{ONE OF:}

A) Code change (engine bug)
   File:    engine/reconciliation_engine/{module}.py
   Change:  {diff snippet}
   Test:    pytest engine/tests/test_{module}.py -k {name}
   Risk:    {what closed periods could this affect?}

B) Sheet edit (data correction)
   Account: {account_name}
   Field:   {column}
   Before:  '{current_value}'
   After:   '{proposed_value}'
   Note:    Why this is the right value.
   Action:  Fix in the billing sheet source file, then re-upload via /admin/import.
   Audit:   Add note to 'Custom Billing Notes' column for this row: "Corrected {YYYY-MM-DD}: was '{old}', set to '{new}', reason: {...}"

C) Engine guard (sheet stays as-is, engine handles it gracefully)
   File:    engine/reconciliation_engine/{module}.py
   Change:  {diff snippet for defensive parsing}
   Tradeoff: row will be excluded with a warning, not crash

REVERSIBILITY
─────────────
{How to undo this if we later learn it's wrong}
```

### Step 5 — Wait for approval

Never apply a sheet edit autonomously. Code changes follow the `feature-dev` flow. The user approves before anything is written.

## Forensic guardrails

- Sheet edits to closed periods require confirmation that we're correcting an error we've now discovered, not rewriting history. If the period is closed and the change would alter `reconciliation_results`, suggest re-running `audit-prep` to update the audit packet with a note explaining the correction.
- Never "round" a number to make it match. If `$504.7892` looks weird, ask why — it's probably correct (4dp `Total to Bill` from a percentage formula).
- Do not propose deleting rows. If a row is wrong, mark it with a note in `Custom Billing Notes`; the engine ignores rows with no Stripe Id automatically.
