# Recon App — Easton Digital

Forensic Stripe ↔ Accounts Receivable reconciliation system. Tells you who paid correctly, who underpaid, who didn't pay, and who paid without a billing line — with audit-grade traceability.

## Architecture

```
Stripe API ──── Edge Fn + cron ──────────────────→ stripe_charges
Billing xlsx ── /admin/import (upload UI) ────────→ expected_charges
                                                         ↓
                                          Python CLI reconciliation engine
                                                         ↓
                                        reconciliation_results + exceptions
                                                         ↓
                                              Next.js dashboard
```

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
| `/budget/[year]` | Per-client budget projections vs actuals |
| `/clients` | Client directory (53 clients) + Won & Churned history |
| `/client/[stripe_id]` | Single client: recon history · plan history · exceptions |
| `/audit/[period]` | Audit packet: methodology · AR lines · exceptions · hashes |
| `/billing` | Editable AR sheet (41 columns) |
| `/stripe` | Stripe transactions table (read-only) |
| `/admin/periods` | Plan management per client |
| `/admin/import` | Upload billing xlsx → ingests to expected_charges |

## Build status

| Layer | Status |
|---|---|
| Supabase schema (9 migrations) | Applied |
| Seed data (April 2026, 62 clients) | Loaded |
| Next.js dashboard | All pages live — Supabase wired |
| /admin/import (xlsx upload) | Built |
| Python reconciliation engine | Built (DB-driven) |
| Stripe API auto-pull (Edge Fn + cron) | Pending |
| Historical ingest (Jan–Mar 2026) | Pending |
| Exception resolution UI | Pending |

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

## Key business rules

1. Reconciliation grain = `(period, cus_id)` — never per-charge
2. Match tolerance = ±$0.01
3. Only `PAID_NET` charges count toward collected amount
4. `Refunded` and `Failed` rows are never filtered — they surface as exceptions
5. Period attribution = `charge.created_at` within `[period.start_date, period.end_date]`
6. Every run hashes its source files (SHA-256) for reproducibility

See `CLAUDE.md` §3 for the full invariant list.
