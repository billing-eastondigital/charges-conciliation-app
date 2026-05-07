# Architecture

## System diagram

```
┌──────────────────────────────────────────────────────────────────────────┐
│  SOURCES                                                                  │
│  ──────                                                                   │
│  • {Year}_Billing_Internal.xlsx  (master AR workbook, ~30 monthly tabs)   │
│  • Stripe unified_payments CSV   (one or more, by date range)             │
│  • Stripe API (future)           via stripe-python                        │
└────────────────────────────────────────┬─────────────────────────────────┘
                                         │
                                         ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  ENGINE (Python · engine/reconciliation_engine/)                          │
│  ──────                                                                   │
│  loaders.py    → canonical dataframes                                     │
│  classifier.py → tag every charge: PAID_NET / FAILED_RETRY /              │
│                  FAILED_HARD / REFUNDED                                   │
│  reconciler.py → group by (period, cus_id) → variance + status            │
│  reporter.py   → multi-tab Excel with conditional formatting              │
│  historical_ingest.py → loop all periods → SQLite/Postgres                │
└────────────────────────────────────────┬─────────────────────────────────┘
                                         │
                          ┌──────────────┴──────────────┐
                          ▼                              ▼
              ┌───────────────────────┐    ┌───────────────────────────────┐
              │  Excel report (.xlsx) │    │  Postgres / Supabase          │
              │  for audit & email    │    │  ───────────                  │
              └───────────────────────┘    │  periods                      │
                                           │  clients                      │
                                           │  expected_charges             │
                                           │  stripe_charges               │
                                           │  reconciliation_results       │
                                           │  exceptions                   │
                                           │  + views (final_balance,      │
                                           │     annual_variance,          │
                                           │     open_exceptions)          │
                                           └─────────┬─────────────────────┘
                                                     │
                                                     ▼
                                  ┌──────────────────────────────────────┐
                                  │  APP (Next.js · app/)                 │
                                  │  ──────                               │
                                  │  /                  → dashboard home  │
                                  │  /period/[label]    → period view     │
                                  │  /annual/[year]     → trend view      │
                                  │  /exceptions        → action queue    │
                                  │  /audit/[period]    → audit packet    │
                                  └──────────────────────────────────────┘
```

## Data flow (monthly close)

1. **Marco** uploads the latest billing xlsx + Stripe CSV (or triggers Stripe API pull).
2. **Edge Function** `ingest-period` calls `engine.run_history()` (Python via subprocess or via a worker queue) for the new period.
3. **Engine** writes results into Postgres tables. Source-file SHA-256 stored in `reconciliation_runs` for forensic provenance.
4. **App** picks up new data automatically — Supabase realtime channel notifies the dashboard.
5. **Owner** opens the dashboard; sees the new period with discrepancies highlighted; works the exception queue.

## Key design choices (see `decisions/` for rationale)

| Decision | File |
|---|---|
| Composite/merged grain on `cus_id` | `decisions/0001-cus-id-merge-strategy.md` |
| Charge classification before aggregation | `decisions/0002-charge-classification.md` |
| ±$0.01 match tolerance | `decisions/0003-tolerance.md` |
| Period attribution by `created_at` (V1) → `invoice.period_start` (V2) | `decisions/0004-period-attribution.md` |
| SQLite for MVP cache, Postgres for production | `decisions/0005-storage-progression.md` |

## Non-functional requirements

- **Reproducibility**: any historical reconciliation must be reproducible from inputs + version of the engine. Source-file hashes + git commit SHA are recorded with every run.
- **Performance**: full historical re-ingest of 30 months must complete in under 60 seconds on a laptop.
- **Auditability**: from any number in the dashboard, a user must be able to drill down to the originating Stripe charge IDs and AR sheet rows in ≤ 3 clicks.
- **Idempotency**: re-running ingest for the same period overwrites prior results cleanly (upsert by `(period_label, stripe_id)`).
