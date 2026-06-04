---
name: audit-prep
description: Prepare a forensic audit packet for one or more reconciliation periods. Use when the user says "preparar auditoría {período}", "audit packet for {period}", "year-end audit", "auditor needs {year}", "verificar período", "documentar cierre", "preparar para contador", or any request for documentation that an external auditor or accountant will review. This skill assembles the underlying source data with their hashes, the methodology document, the engine version, and a one-page executive summary — all bundled into a reproducible folder.
---

# Audit Prep

You are assembling material an external auditor will use to verify the reconciliation. Everything must be traceable, hashed, and reproducible.

## Inputs

- Period(s) to audit (single month, range like Q1 2026, or full year).
- Output folder, default: `audit/{period_or_range}/`.

## Procedure

### Step 1 — Verify reproducibility

For each requested period:
1. Fetch run metadata from `reconciliation_runs` — record the `run_id`, `created_at`, and engine version (git commit SHA) used at close time.
2. Verify the engine version. If the engine has changed since close time, note this prominently in the summary; auditors care about this.

Note: In Phase 3, source data lives in Supabase (`expected_charges`, `stripe_charges`). To archive, export both tables for the period to CSV using the Supabase dashboard before closing.

```sql
SELECT run_id, period_label, created_at, engine_version, total_results, total_matches
FROM reconciliation_runs
WHERE period_label = '{period_label}'
ORDER BY run_id DESC LIMIT 5;
```

### Step 2 — Re-run reconciliation (verification)

```bash
python3 -m reconciliation_engine.cli --period "{period_label}"
```

Diff the rerun result counts against the archived run. Any difference is a finding the auditor must see.

```sql
-- Compare current results to prior run
SELECT recon_status, COUNT(*) AS current_count
FROM reconciliation_results
WHERE period_label = '{period_label}'
GROUP BY recon_status
ORDER BY recon_status;
```

### Step 3 — Assemble the packet

Folder structure:

```
audit/{period_or_range}/
├── 00_executive_summary.md          # one-page, plain English
├── 01_methodology.md                # how reconciliation works (copy from docs/architecture.md + decisions/)
├── 02_decisions/                    # all ADRs that were active during the period
│   ├── 0001-cus-id-merge-strategy.md
│   ├── 0002-charge-classification.md
│   └── ...
├── 03_reports/
│   └── {period}_results.csv         # export of reconciliation_results for the period
├── 04_sources/
│   ├── expected_charges_{period}.csv  # export from Supabase expected_charges
│   ├── stripe_charges_{period}.csv    # export from Supabase stripe_charges
│   └── HASHES.txt                     # SHA-256 of each exported source file
├── 05_exceptions_log.csv            # all exceptions in the period, including resolution notes
└── 06_engine/
    ├── version.txt                  # git SHA + git tag
    └── config.json                  # ReconciliationConfig values used at close time
```

### Step 4 — Write the executive summary

`00_executive_summary.md` — max one printed page. Sections:
1. **Period covered** + total billed, collected, variance.
2. **Methodology in 4 bullets**: grain (cus_id), classification (PAID_NET only feeds Collected), tolerance ($0.01), period attribution (current rule).
3. **Reconciliation results**: table of status counts and dollar amounts.
4. **Exceptions**: count + total at risk + resolution rate (X of Y resolved).
5. **Verification**: engine re-run produces identical results (or, if not, the exact differences and why).
6. **Engine version**: commit SHA + date.

### Step 5 — Sign the packet

Generate a `MANIFEST.txt`:

```
Audit packet for {period_or_range}
Generated: {ISO timestamp UTC}
Engine: {git_sha} ({git_tag})
Files:
  00_executive_summary.md   sha256={...}
  01_methodology.md          sha256={...}
  03_reports/{...}.csv      sha256={...}
  04_sources/expected_charges_{period}.csv  sha256={...}
  04_sources/stripe_charges_{period}.csv    sha256={...}
  ...
```

Manifest hash itself can be embedded in a sign-off email.

## Forensic guardrails

- Never alter archived source files — even to fix a typo. If a fix is needed, re-run is a NEW file with a new hash, and both old and new are kept.
- Never change a decision retroactively without a superseding ADR. ADRs are append-only.
- If the user asks you to "make this number match" — STOP. Ask what the truth is. The packet must reflect reality, not a target.
