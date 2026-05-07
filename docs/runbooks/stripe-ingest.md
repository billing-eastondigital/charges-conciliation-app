# Runbook: Stripe Data Ingest

**Purpose**: refresh the Stripe charges that feed the engine. Two modes — manual CSV (today) and API (V2).

## Mode A — Manual CSV export (today's default)

1. Log into Stripe Dashboard → Payments → Export.
2. Date range: full period(s) you need. Tip: export by year (Jan 1 – Dec 31) for clean historical files.
3. Format: CSV.
4. Columns: leave default — the engine reads `id`, `Created date (UTC)`, `Amount`, `Amount Refunded`, `Currency`, `Status`, `Customer ID`, `Invoice ID`, `Description`, `Decline Reason`, `Customer Email`. Extra columns are ignored.
5. Save to `data/unified_payments_{YYYY}.csv`.
6. Run historical ingest as in `monthly-close.md` step 3.

## Mode B — Stripe API (V2)

Use this when you want unattended monthly close. Requires `STRIPE_SECRET_KEY` (read-only restricted key recommended).

```bash
# tools/scripts/stripe_pull.py
python tools/scripts/stripe_pull.py \
    --since 2026-04-01 \
    --until 2026-04-30 \
    --out data/stripe_april_2026.csv
```

The script:
- Paginates `stripe.Charge.list()` filtered by `created` date range.
- For each charge, expands `invoice` and writes the same column shape the engine expects.
- Idempotent: re-running for the same date range overwrites the file.

**Restricted key permissions needed**:
- `Charges`: read
- `Invoices`: read
- `Customers`: read

## Mode C — Edge Function (production)

The `supabase/functions/ingest-period/index.ts` Edge Function calls the same Stripe API logic and upserts directly into `stripe_charges`. Triggered by:
- Cron (nightly / on the 6th of each month for the prior month's close)
- Webhook (Stripe `invoice.payment_succeeded`, `charge.refunded` for near-real-time updates)

## Period attribution policy

**Today**: a charge belongs to a period if `charge.created_at` falls inside `[period.start_date, period.end_date]`.

**Known limitation**: a May 5 charge that pays April's invoice will land in May, not April. This will produce a false MISSING_PAYMENT in April and a false UNBILLED_PAYMENT in May.

**V2 fix**: when API mode is wired, switch to `invoice.period_start` for attribution. See `decisions/0004-period-attribution.md`. This is a one-line change in `engine/reconciliation_engine/historical_ingest.py:filter_charges_to_period`.

## Validation after ingest

```sql
-- Top 5 sanity checks (run in Supabase SQL editor or sqlite3)
SELECT period_label, COUNT(*) FROM stripe_charges GROUP BY period_label ORDER BY 1;
SELECT classification, COUNT(*) FROM stripe_charges GROUP BY classification;
SELECT COUNT(DISTINCT stripe_id) FROM stripe_charges WHERE classification = 'PAID_NET';
SELECT SUM(paid_net) FROM stripe_charges WHERE period_label = 'April 2026';
SELECT * FROM stripe_charges WHERE stripe_id IS NULL OR stripe_id = '';
```
