---
name: data-quality
description: Diagnose data quality problems in the master billing workbook and propose fixes WITHOUT silently rewriting history. Use when the user says "the engine is failing on {tab}", "weird numbers in {sheet}", "data quality issue", "fix the AR sheet", "el motor falla con {hoja}", or when historical_ingest skips a period or produces obviously wrong results. This skill identifies the root cause (missing Stripe ID, malformed numbers, embedded notes, locale-specific decimal separators) and proposes a fix that is auditable and reversible.
---

# Data Quality

You are diagnosing dirty data. Your goal is to identify the problem precisely, not to make symptoms go away. Every fix proposal must be auditable and reversible.

## Common issues seen in this workbook

| Symptom | Likely cause | Fix pattern |
|---|---|---|
| `sequence item 0: expected str instance, float found` on a tab | NaN floats in cells expected to be strings (Account Name, Email, Stripe Id) | Defensive cast in code (already in place); for sheet-level repair, replace NaN with empty string in source |
| Stripe Id cell contains an email address or free-text note | Manual data-entry where the field was repurposed | Move the note to `Custom Billing Notes`; leave Stripe Id empty if unknown; flag the row |
| `Total to Bill` shows zero for an ACTIVE account | Formula didn't propagate, OR the row is genuinely $0 (rare) | Inspect adjacent columns (Google Revenue, Base Fee, etc.); recompute by formula; if intentional, document |
| Decimal separator inconsistency (e.g. `1.234,56`) | Locale-specific Excel save (es-AR locale) | Normalize on ingest with `pd.to_numeric(..., errors='coerce')` after stripping locale chars |
| Date in column but engine ignores it | Excel "Date" mode vs Text mode mismatch | `pd.to_datetime(..., errors='coerce')` |
| Same `Stripe Id` for accounts that aren't actually one client | Copy-paste error during AR sheet maintenance | THIS IS NOT A FIX — flag it, ask the user. Do not change `Stripe Id` without confirmation. |

## Procedure

### Step 1 — Reproduce the problem

```bash
python -c "
from reconciliation_engine.loaders import load_billing_sheet
df = load_billing_sheet('./data/billing.xlsx', '{sheet_name}')
print(df.info())
print(df.head(20))
"
```

Or if `historical_ingest.py` is skipping the tab, the error message in the skip line tells you which exception was raised. Re-run with `python -X tracebacks` to see the full trace.

### Step 2 — Inspect the offending cells

```python
import pandas as pd
raw = pd.read_excel('./data/billing.xlsx', sheet_name='{sheet}', header=None)
# Show the rows around the problem index, with all 50 columns
print(raw.iloc[{row-2}:{row+3}].to_string())
```

Look for:
- Mixed types in a column (some strings, some floats, some NaT)
- Cells that contain commentary instead of values (e.g. "ask Greg" in the Total to Bill column)
- Trailing whitespace, hidden characters
- Merged cells (Excel oddity that produces NaN in all but the top-left)

### Step 3 — Classify the issue

| Class | Action |
|---|---|
| Code defect (engine doesn't tolerate valid-but-unusual data) | Fix the engine, add a regression test, no sheet change |
| Data-entry error in the sheet (typo, wrong column) | Propose sheet edit; show before/after; user applies |
| Genuinely missing data (no Stripe Id for an active account) | Flag for the user — engine cannot reconcile this row, will be in `expected_charges` but no match |
| Ambiguity (one Stripe Id, multiple Account Names, but unclear if intentional) | DO NOT touch — ask the user to confirm via `client_directory` |

### Step 4 — Propose the fix

Output:

```
ISSUE
─────
Sheet:   {sheet}
Row:     {row} (Account Name: {name})
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
   Cell:    {sheet}!{ref}
   Before:  '{current_value}'
   After:   '{proposed_value}'
   Note:    Why this is the right value.
   Audit:   Add note to 'Custom Billing Notes' column row {row}: "Corrected {YYYY-MM-DD}: was '{old}', set to '{new}', reason: {...}"

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
