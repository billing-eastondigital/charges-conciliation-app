# Runbook: Monthly Close

**Owner**: Marco. **Frequency**: once per month, after the 5th business day. **Skill that automates this**: `.claude/skills/monthly-close/SKILL.md`.

## Preconditions

- All charges for the period have settled in Stripe (give it ≥ 3 business days after period end).
- The master billing workbook has the `{Month} {YY} Billing` tab populated with `Total to Bill` for the period.
- All ACTIVE accounts in the period tab have a non-empty `Stripe Id`. Anything blank goes through `data-quality` skill first.

## Procedure

1. **Refresh source data**

   ```bash
   # Pull Stripe charges for the period (manual export OR API)
   python tools/scripts/stripe_pull.py --since 2026-04-01 --until 2026-04-30 \
       --out data/stripe_april_2026.csv

   # Confirm the billing workbook is current
   ls -la data/billing.xlsx
   ```

2. **Run the engine for the period**

   ```bash
   python -m reconciliation_engine.cli \
       --period "April 2026" \
       --xlsx ./data/billing.xlsx \
       --csv  ./data/stripe_april_2026.csv \
       --out  ./reports/april_2026.xlsx
   ```

3. **Refresh the historical cache** (if Postgres / SQLite is the source of truth for the dashboard)

   ```bash
   python -m reconciliation_engine.historical_ingest \
       --xlsx ./data/billing.xlsx \
       --csv  ./data/stripe_*.csv \
       --db   ./reconciliation.db
   ```

   In production (Supabase): trigger the `ingest-period` Edge Function with the period label.

4. **Sanity-check the new period's numbers**

   - Open the report's `Summary` tab. Total Expected ≈ what you projected? (Compare to `docs/runbooks/monthly-close-prior-baselines.md` if you keep one.)
   - Total Collected vs Expected — variance within usual range? (Pull last 3 months from the dashboard's Annual view.)
   - Exception count — within usual range? (Typical is 5–10 exceptions per ~50 active clients.)

5. **Compare to prior month**

   In the dashboard, open Period view for the new period and the prior period side-by-side. Note:
   - New `MISSING_PAYMENT` clients (didn't pay last month — collection escalation needed).
   - Same-client `UNDERPAID` recurrence (likely a billing rule misconfiguration).
   - New `UNBILLED_PAYMENT` (payment landed without an AR line — usually annual or catch-up; verify).

6. **Triage exceptions** (use `exception-triage` skill)

   - Open exception queue.
   - For each: assign to Marco or owner, add a brief note, mark severity.
   - For UNDERPAID/MISSING_PAYMENT: trigger `client-outreach` skill to draft email.

7. **Prepare review packet for owner**

   - Excel report from step 2.
   - Dashboard URL with period filter set to new period.
   - One-page summary memo: total billed, total collected, top 3 exceptions, total at risk.

8. **Sign off**

   - Mark the period `closed` in the dashboard (sets a flag preventing further re-runs without explicit unlock).
   - Archive the report Excel + the source files (with their hashes) in `reports/closed/{YYYY-MM}/`.

## Failure modes

| Symptom | Likely cause | Fix |
|---|---|---|
| Engine errors on a billing tab load | Old sheet data quality issue (float NaNs) | Run `data-quality` skill on that tab |
| Sudden spike in MISSING_PAYMENT | Stripe export missing days | Re-export Stripe with confirmed full date range |
| Sudden spike in UNBILLED_PAYMENT | Wrong tab ingested or AR sheet not updated for the period | Verify `Total to Bill` populated on the new tab |
| Variance for one client way off | Custom billing not reflected in `Total to Bill` | Check `Custom Billing Notes` column in master sheet; update tab; re-run |
