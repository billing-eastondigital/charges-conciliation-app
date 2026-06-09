# Recon App — Easton Digital

Forensic Stripe ↔ Accounts Receivable reconciliation system. Tells you who paid correctly, who underpaid, who didn't pay, and who paid without a billing line — with audit-grade traceability.

## Architecture

```
pg_cron 08:00 UTC
  └─→ ingest-stripe (Edge Fn)
        ├── sync stripe_charges (main + launch Stripe accounts)
        ├── settlement catch-up (re-sync prior period if ACH pending)
        └── auto-call reconcile-period ──────────────────────────────────┐
                                                                         │
Billing xlsx ── /admin/import (upload) ──→ expected_charges              │
Subscription plans ── auto-generated ────→ expected_charges ────────────┘
                                                    ↓
                                         reconcile-period (Edge Fn)
                                                    ↓
                                   reconciliation_results + exceptions
                                                    ↓
                                          Next.js dashboard
```

The full pipeline runs automatically every morning. Manual triggers are still available via `/admin/import` (billing sheet upload) and the Reconcile button.

## Stack

- **Frontend**: Next.js 14 App Router · React 18 · Tailwind 4 · shadcn/ui · recharts
- **Backend**: Supabase (Postgres 15 · PostgREST · Auth · Edge Functions)
- **Engine**: Python 3.11 · Pandas · openpyxl
- **Package manager**: pnpm 10

## Quick start

```bash
# Dashboard (Next.js) — run from repo root
pnpm install
pnpm dev          # → http://localhost:3000

# Database (Supabase local)
supabase start
supabase db reset  # applies all migrations + seed

# Engine (Python)
pip install -e engine/
python -m reconciliation_engine.cli \
  --period "April 2026" \
  --xlsx ./data/billing_april_2026.xlsx \
  --csv  ./data/stripe_2026_ytd.csv
```

## Dashboard views

| Route | What it shows |
|---|---|
| `/period/[label]` | KPIs · MoM waterfall · client lifecycle · reconciliation table |
| `/exceptions` | Open exception queue with resolution workflow |
| `/annual/[year]` | Revenue trend chart + monthly table with avg ticket |
| `/budget/[year]` | Per-client budget projections vs actuals — YTD Proj · YTD Actual · FY Proj · FY Actual |
| `/clients` | Client directory (68+ clients) + Won & Churned history · billing plan editing · delete |
| `/client/[stripe_id]` | Single client: recon history · plan history · exceptions |
| `/audit/[period]` | Audit packet: methodology · AR lines · exceptions · hashes |
| `/billing` | Editable AR sheet (41 columns) |
| `/stripe` | Stripe transactions table (read-only) |
| `/admin/periods` | Plan management per client |
| `/admin/import` | Upload billing xlsx → ingests to expected_charges |

## Build status

| Layer | Status |
|---|---|
| Supabase schema (19 migrations) | Applied |
| Seed data (68+ clients, Jan–May 2026) | Loaded |
| Next.js dashboard | All pages live — Supabase wired |
| `/admin/import` (xlsx upload) | Live |
| Python reconciliation engine | Live (DB-driven, no Pandas) |
| `ingest-stripe` Edge Fn + daily cron | Live — main account; Launch key pending |
| `reconcile-period` Edge Fn (auto-triggered) | Live |
| Subscription auto-generation | Live (from `billing_method = SUBSCRIPTION`) |
| Historical ingest (Jan–Apr 2026) | Complete |
| Exception resolution UI | Live |
| Client billing plan editing from Clients page | Live |
| Client delete from Clients page | Live |
| Launch Stripe account API key | **Pending** — configure `STRIPE_SECRET_KEY_LAUNCH` secret |

## Agent skills

Say these to Claude and the right skill fires automatically:

| Phrase | Skill |
|---|---|
| "Run the monthly close for April" | `monthly-close` |
| "What's outstanding?" / "Triage exceptions" | `exception-triage` |
| "Draft an email to {client}" | `client-outreach` |
| "Audit packet for Q1 2026" | `audit-prep` |
| "Compare April vs March" | `period-comparison` |
| "Add a feature for {x}" | `feature-dev` |
| "The engine is failing on {sheet}" | `data-quality` |
| "Release v0.x.0" | `release` |

## Documentation

- `CLAUDE.md` — project memory and business rules (read first)
- `docs/architecture.md` — system diagram and data flow
- `docs/decisions/` — ADRs (architectural decision records)
- `docs/runbooks/` — operational playbooks (monthly close, etc.)
- `docs/data-april-2026.md` — canonical April 2026 data analysis

## Stripe accounts

The agency operates **two Stripe accounts**:

| Account | Identifier | Clients |
|---|---|---|
| Main account | Charge IDs contain `Bz2r3aRl9` | Most clients (batches 1–5, Consulting, Multiple) |
| Launch account | Charge IDs contain `JNvCoIloog` | Subscription clients billed via the Launch account (beehivehandmade, sugarbeeclothing, jewelrybybretta, threearrowsnutra, gr8beads, camoeverafter) |

The `ingest-stripe` Edge Function pulls from both accounts automatically when both secrets are configured. `STRIPE_SECRET_KEY_MAIN` is live; `STRIPE_SECRET_KEY_LAUNCH` is still pending — until it is set, Launch account charges must be loaded via CSV upload.

Period attribution: Main account charges are in EST (UTC-5) — the ingestion window is shifted +5 hours. Launch account charges use UTC as-is.

## Key business rules

1. Reconciliation grain = `(period, cus_id)` — never per-charge
2. Match tolerance = ±$0.01
3. Only `PAID_NET` charges count toward collected amount
4. `Refunded` and `Failed` rows are never filtered — they surface as exceptions
5. Period attribution = `charge.created_at` within `[period.start_date, period.end_date]`
6. Every run hashes its source files (SHA-256) for reproducibility
7. **New client** — `clients.start_date` within the period (manual add or first Stripe charge)
8. **Lost/Churned client** — `account_status = 'LOST'` AND `deactivated_month = YYYY-MM` (manual only)
9. **Subscription clients** — expected charge auto-generated from `projection_amount` each period; no xlsx import needed
10. A LOST client who paid in their final month is both Churned (lifecycle) AND MATCH (reconciliation) — these signals are independent

See `CLAUDE.md` §3 for the full invariant list.
