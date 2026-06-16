# CLAUDE.md — Recon App project memory

> This file is your project memory. Read it at the start of every session.
> Subdirectory `CLAUDE.md` files refine context for `engine/`, `app/`, and `supabase/`.

**Language**: All UI copy, labels, comments, and code output must be in **English**.

---

## 1. What this project is

A forensic Stripe ↔ Accounts Receivable reconciliation system. The business owner runs an agency that bills clients monthly via Stripe; this app tells them — with audit-grade traceability — who paid correctly, who underpaid, who didn't pay, and who paid without a billing line.

**Three layers**:

1. **Engine** (`engine/`) — Python + Pandas. Pure functions. Loads the master billing workbook + Stripe `unified_payments` exports, classifies every charge (`PAID_NET` / `FAILED_RETRY` / `FAILED_HARD` / `REFUNDED`), reconciles per `(period, cus_id)`, emits structured results.
2. **Persistence** (`supabase/`) — Postgres (Supabase). The engine writes results here. Schema is normalized: `periods`, `clients`, `expected_charges`, `stripe_charges`, `reconciliation_results`, `exceptions`.
3. **App** (`app/`) — Next.js + React + Tailwind + shadcn/ui. Reads from Supabase via PostgREST/RPC. Three views: Period (KPIs + drill-down), Annual (variance trend), Exception Queue (resolution workflow).

**Non-goals**: payment processing, invoicing UI, replacing Stripe Dashboard. We reconcile what already happened — we don't bill or charge.

---

## 2. Stack & conventions

- **Engine**: Python 3.11+, Pandas, openpyxl, dataclasses, type hints throughout. No magic numbers — every threshold lives in `engine/reconciliation_engine/config.py` (`ReconciliationConfig`).
- **Backend**: Supabase (Postgres 15 + PostgREST + Auth + Edge Functions in Deno/TypeScript).
- **Frontend**: Next.js 14 App Router, React 18, Tailwind, shadcn/ui, recharts for charts, TanStack Table for grids.
- **Auth**: Supabase Auth with email magic link. RLS policies on every table — no direct table reads from the client without RLS.
- **Money**: Always `numeric(12,4)` for `expected_amount` (4dp because the AR sheet uses 4dp), `numeric(12,2)` for Stripe amounts. Never use JS `number` for money in app code — use string-based decimal libs (`dinero.js` or string formatting on the read side).
- **Dates**: Always ISO 8601 in DB. `created_at` is `timestamptz`. Period ranges are inclusive `[start_date, end_date]`.
- **IDs**: Stripe IDs (`cus_…`, `ch_…`, `in_…`) are the canonical foreign keys, not surrogate UUIDs. The exception is `exceptions.id` and `reconciliation_results.id` which use bigserial.
- **Naming**: snake_case in DB and Python; camelCase in TypeScript; kebab-case in file names except Next.js conventions.

---

## 3. Critical business rules — DO NOT violate without an ADR

These are the forensic invariants. Breaking them silently corrupts the audit trail.

1. **Reconciliation grain = `(period, cus_id)`.** Multiple AR billing rows that share a Stripe customer ID are merged into one reconciliation row, but the constituent rows MUST stay individually visible in `expected_charges` for drill-down. Never silently drop a billing line.
2. **Aggregation runs only on `PAID_NET` charges, never on raw `Status=Paid`.** A Failed retry against an already-Paid invoice is informational, not collectable. Double-counting it is a forensic violation.
3. **`Refunded` and `Failed` rows are never filtered out.** They must surface as exceptions even when the customer has no AR row that period.
4. **Match tolerance = ±$0.01.** Anything outside is `UNDERPAID` or `OVERPAID`. Don't widen the tolerance to "fix" a discrepancy — find the cause.
5. **Period attribution = `charge.created_at` within `[period.start_date, period.end_date]`.** Stripe API ingest is live (`ingest-stripe` Edge Function). Main account uses EST timezone offset (+5h UTC window). Switch to `invoice.period_start` is a future improvement (see `docs/decisions/0004-period-attribution.md`).
6. **Source files must be hashed.** Every reconciliation run records SHA-256 of the inputs in `Run_Metadata` (Excel) or `reconciliation_runs` (DB). A report must always be reproducible from inputs.
7. **`cus_id` is the join key, NOT a unique key for billing.** The same `cus_id` legitimately maps to multiple Account Names (one client paying for multiple domains). See `docs/decisions/0001-cus-id-merge-strategy.md`.
8. **Client lifecycle classification rules (New / Churned) — canonical definition, same on every page:**
   - **New client** — `clients.start_date` falls within `[period.start_date, period.end_date]`. This covers two cases:
     a. Client manually added to the DB with a `start_date` in the period.
     b. First-time Stripe customer auto-created by `ingest-stripe` — the edge function sets `start_date` to the date of the customer's first charge.
   - **Lost/Churned client** — `clients.account_status = 'LOST'` **AND** `clients.deactivated_month = YYYY-MM` of the period. Manual signal only — never auto-detected from payment history.
   - **Never auto-resolve churn** — a LOST client who made a payment in their final month still appears in both the Churned list AND reconciles as MATCH (see simplyinspiredgoods.com, April 2026). The lifecycle signal and the payment outcome are independent.
   - **Enforcement** — the Period page (ClientLifecycleSection + MoMDelta bridge), the Clients / Won & Churned tab, and any future pages all use these two DB-field conditions. Do not reintroduce reconciliation-diff–based new/churned detection.
9. **ADS campaign billability = ED naming convention.** Only campaigns whose name matches the regex `ED\s+\|` (case-insensitive) are billable. This catches `"ED | ..."`, `"PMax: ED | ..."`, `"ED  | ..."` (double-space). Campaigns not matching are excluded as `"Non-ED campaign"`. This rule is enforced in BOTH `isEdCampaign()` in `app/(dashboard)/ads/page.tsx` AND in `generate_ads_billing()` SQL (`campaign_name ~* 'ED\s+\|'`). Do not widen this filter without business approval.
10. **Manual campaign overrides survive re-ingest.** `google_ads_campaign_overrides` rows are read by `generate_ads_billing()` on every run via a NOT EXISTS correlated subquery. Setting an override calls `generate_ads_billing()` immediately via server action — billing reflects the change without waiting for the daily cron.

---

## 3b. Automated pipeline (live as of 2026-06-05)

The daily cron (`sync-stripe-daily`, 08:00 UTC) triggers `ingest-stripe`, which now runs the full pipeline end-to-end without any manual steps:

```
pg_cron 08:00 UTC
  → ingest-stripe edge function
      1. Sync Stripe charges (main + launch accounts) → stripe_charges
      2. Settlement catch-up: re-sync previous open period if pending ACH charges exist
      3. Auto-call reconcile-period for the current period
      4. Auto-call reconcile-period for the previous period (if catch-up ran)
```

`reconcile-period` also runs the following before reconciling:
- **SUBSCRIPTION**: deletes+reinserts `expected_charges` from `projection_amount` for all `billing_method = 'SUBSCRIPTION'` clients (idempotent)
- **ADS**: calls `generate_ads_billing()` which deletes+reinserts from `google_ads_spend` for all `billing_method IN ('ADS_REVENUE','ADS_COST')` clients (idempotent)
- **IMPORT rows cleanup**: auto-deletes any IMPORT rows for SUB/ADS clients before reinserting
- Then runs normal reconciliation

This means subscription and ADS clients flow through automatically — no billing xlsx upload needed each month.

**Response shape from `ingest-stripe`:**
```json
{
  "ok": true,
  "period_label": "June 2026",
  "total_inserted": 45,
  "accounts": { "main": { "inserted": 41 }, "launch": { "inserted": 4 } },
  "auto_reconcile": {
    "current": { "ok": true, "run_id": 15, "counts": { "MATCH": 38, ... } },
    "catchup": null
  }
}
```

If no billing sheet has been uploaded, `auto_reconcile.current` = `{ ok: false, skipped: true }` — the sync still succeeds.

### Billing method (`client_billing_plans.billing_method`)

| Value | Meaning |
|---|---|
| `AD_SPEND` (default) | Expected charge comes from the billing xlsx uploaded via `/admin/import` each month |
| `SUBSCRIPTION` | Flat fee auto-generated from `projection_amount` at reconcile time — no monthly import needed |
| `ADS_REVENUE` | Fee = `base_fee` + `billing_percentage` × Google Shopping+Search revenue (by conversion time) |
| `ADS_COST` | Fee = `base_fee` + `billing_percentage` × Google Shopping+Search cost |

Set via Admin → Plan Management → Edit or Set up plan → Billing Method.
Back-fill rule: clients with `batch = 'SUBSCRIPTION'` were automatically set to `billing_method = 'SUBSCRIPTION'` in migration `20260605000001`.

Set via Admin → Plan Management → Edit or Set up plan → Billing Method. The edit modal shows all 4 methods; `base_fee` field appears conditionally for ADS methods; `billing_percentage` (4dp) is the canonical field.

**Multi-account ADS clients**: additional Google Ads customer IDs stored in `client_platform_ids.other_ids->'google_ads_additional_customer_ids'` (jsonb array). Both `ingest-google-ads` and `generate_ads_billing` process ALL IDs and sum spend across accounts. Example: `cus_MAQFq6FlG4sGc3` has primary `4631988316` + additional `8378921672`.

**ADS revenue metric**: `conversionValueByConversionTime` — NOT `conversionValue`. The API returns both; only `ByConversionTime` matches what Google Ads UI shows. Using click-time attribution causes systematic undercount.

**ADS billing formula** (per client per period):
```
expected_amount = base_fee + (shopping_revenue + search_revenue + bing_revenue) × billing_percentage + dfw
```
`bing_revenue` and `dfw` are manually entered in the billing page per period and stored in `billing_detail` jsonb. Entering either field immediately recalculates `expected_amount` via `updateAdsBillingDetail` server action.

**Campaign exclusions** (two layers, both in `generate_ads_billing` SQL and `isEdCampaign()` in `ads/page.tsx`):
1. ED filter: `campaign_name ~* 'ED\s+\|'` — only Easton Digital-managed campaigns are billable
2. Brand exclusions: hardcoded arrays `shopping_exclusions` / `search_exclusions` for brand campaigns
3. Manual overrides: `google_ads_campaign_overrides` table — per campaign, per period, survives re-ingest

---

## 4. Repository layout

```
recon-app/
├── CLAUDE.md                 # ← you are here
├── README.md                 # human onboarding
├── docs/
│   ├── architecture.md       # system diagram + data flow
│   ├── decisions/            # ADRs (one .md per architectural decision)
│   └── runbooks/             # operational playbooks (monthly-close, etc.)
├── .claude/
│   ├── settings.json         # Claude Code/Cowork tool permissions
│   ├── hooks/                # pre-commit / pre-deploy guardrails
│   └── skills/               # reusable agent workflows (see §5)
├── tools/
│   ├── scripts/              # one-offs (stripe puller, data fixers)
│   └── prompts/              # reusable prompts (e.g. ADR template)
├── data/                     # Source files (gitignored — never commit)
│   ├── april_2026_billing.xlsx
│   ├── stripe_april_2026.csv
│   └── clients.xlsx
├── engine/                   # Python reconciliation engine
│   └── CLAUDE.md             # subdir-specific context
├── app/                      # Next.js dashboard
│   ├── CLAUDE.md
│   └── lib/mock/             # TypeScript fixtures derived from real data
└── supabase/
    ├── CLAUDE.md
    ├── migrations/           # SQL migrations
    └── functions/            # Edge Functions (TypeScript/Deno)
```

---

## 5. Skills (agent workflows)

Each skill in `.claude/skills/{name}/SKILL.md` defines a triggered, repeatable operation. Use skills, don't reinvent. New repeated workflows should become skills.

| Skill | Use when |
|---|---|
| `monthly-close` | End of month — full close pipeline (ingest → reconcile → diff vs prior → review packet) |
| `exception-triage` | Daily — work the open exception queue with priority + history lookup |
| `client-outreach` | Need to contact a client about UNDERPAID / MISSING_PAYMENT (drafts ES/EN) |
| `audit-prep` | Auditor requests a packet for a period |
| `period-comparison` | Compare two periods, flag anomalies |
| `feature-dev` | Add a feature to the engine, DB schema, or UI |
| `data-quality` | Diagnose + fix issues in the master billing workbook |
| `release` | Version bump + changelog + deploy |
| `stripe-recon-gap` | Explain dollar-for-dollar why Stripe PAID_NET ≠ reconciliation collected total for a period |

---

## 6. Workflow expectations for Claude

1. **Read `CLAUDE.md` for the area you're touching first.** Root → subdirectory → skill.
2. **Architectural changes need an ADR.** Write `docs/decisions/{NNNN}-{slug}.md` BEFORE the code change. Templates are in `tools/prompts/adr-template.md`. Number monotonically.
3. **Schema changes go through migrations.** Never `ALTER TABLE` ad hoc. Add a new file in `supabase/migrations/{timestamp}_{description}.sql`. Update `engine/reconciliation_engine/config.py` + the relevant `CLAUDE.md` if column names change.
4. **Engine changes need regression tests.** Re-run the historical ingest against the cached data and diff `reconciliation_results`. Any change in MATCH count or total variance for a closed period is a red flag — surface it before committing.
5. **Frontend changes need a screenshot in the PR description** (or a Storybook story in `app/stories/` for the component).
6. **Money in the UI is always formatted via the shared `formatMoney(amount, currency)` helper** in `app/lib/format.ts` — never inline `toFixed(2)`.
7. **No direct Supabase reads from client components** without RLS. Use server components or server actions for any cross-tenant data.

---

## 7. Daily commands

```bash
# Engine: run reconciliation for one period
python -m reconciliation_engine.cli \
    --period "April 2026" \
    --xlsx ./data/billing.xlsx \
    --csv  ./data/stripe_april.csv \
    --out  ./reports/april_2026.xlsx

# Engine: refresh historical SQLite cache from all months
python -m reconciliation_engine.historical_ingest \
    --xlsx ./data/billing.xlsx \
    --csv  ./data/stripe_2024.csv \
    --csv  ./data/stripe_2025.csv \
    --csv  ./data/stripe_2026.csv \
    --db   ./reconciliation.db

# App: dev server
pnpm dev                       # Next.js on :3000
pnpm test                      # Vitest
pnpm lint && pnpm typecheck

# Supabase: local dev
supabase start
supabase db reset              # apply migrations from scratch
supabase functions serve       # edge functions locally
supabase db push               # push migrations to remote
```

---

## 8. Development strategy

### App-first, data-first

We build the **final production app from day one** — no throwaway prototypes. The iteration cycle is:

1. Real source files → TypeScript fixtures → app renders real data with mock DB
2. Schema Supabase wired → app reads from DB (fixtures become seed data)
3. Engine Python wired → full pipeline live

### Source data (canonical inputs)

Real files live in `data/` (gitignored — never commit client data):

```
data/
├── billing_april_2026.xlsx     # AR master workbook — April 2026 (tab: Hoja1, 51 rows)
├── stripe_2026_ytd.csv         # Stripe unified_payments — Jan–Apr 2026 (246 rows, 59 in April)
└── clients.xlsx                # Client master (Stripe ID → name, email, status) — TBD
```

The **April 2026** period is the canonical fixture for development. All mock TypeScript data in `app/lib/mock/` is derived from these real files.

### Clients database

A separate `clients` master table exists beyond what Stripe exposes. The owner provided a client model — it extends `clients(stripe_id PK, display_name, primary_email, is_active)` with additional fields TBD once the model is shared. The schema will be captured in a migration and documented here when received.

### Iteration path

- **Phase 1**: App with TypeScript mock fixtures, no DB (fastest feedback loop with owner)
- **Phase 2**: Supabase schema + seed from April fixtures, app reads real DB
- **Phase 3**: Engine Python processes real files → writes to DB → app reflects live reconciliation
- **Phase 4**: Add more periods (historical ingest), extend clients DB, add remaining views

---

## 9. Known landmines (read before touching)

- **`Total to Bill` carries 4 decimals; Stripe is 2 decimals.** Never round at ingest — only at the comparison step (±$0.01 tolerance).
- **Old billing sheets (Dec 2023, Jan 2024) have float NaNs in string columns.** The reconciler's `_join_clean` aggregator handles this; don't remove the defensive cast.
- **One charge in the April 2026 source has no Customer ID** (`margaret@lblegalnurses.com`, $1,500). It goes to `unmatched_charges` and surfaces in the dashboard's exception view. Do not silently drop it.
- **`cus_MAQFq6FlG4sGc3` legitimately maps to 3 different domains** (realestateposts.com, addressesofdistinction.com, hallsigns.com). Same client, multiple billings. Do not add a "deduplication" pass on `cus_id`.
- **`cus_OinjM3GcjQrwhs` maps to 2 accounts** (cheapdealersupplies.com + cheapdealersupplies.com Amazon). Same merge logic applies.
- **Some Stripe IDs in old billing sheets contain free-text notes** (e.g. emails embedded in the cell). Parser tolerates these by filtering to `cus_…` prefix; don't assume the sheet is clean.
- **7 AR rows in April 2026 have no Stripe ID.** 4 are $0 (inactive/placeholders). 3 have real expected amounts and matching Stripe payments that can't be auto-joined: `tiradoalejandra.18@gmail.com` ($1,130 → MATCH if linked), `ppucheu@pbm-solutions.com` ($3,500 AR vs $3,550 Stripe → OVERPAID $50 if linked), `margaret@lblegalnurses.com` ($1,500 → MATCH if linked by email). These surface as STRIPE_ONLY exceptions until Stripe IDs are added to the billing sheet.
- **`richie@natcodb.com` has a large discrepancy**: AR expects $1,500, Stripe shows `cus_UJPVLKVt2c4Oh3` paid $3,500. Likely a one-time onboarding/setup fee on a new contract — not a billing error. Surface as exception, do not auto-resolve.
- **`cus_Mk1E5riYx9BQSb` is a REFUNDED charge with no AR row** ($518.89, gregpetriekis@yahoo.com). Must surface as an exception despite having no expected charge.
- **3 "(S + C)" accounts have MISSING_PAYMENT in April**: sugarbeeclothing.com, jewelrybybretta.com, beehivehandmade.com. No Stripe activity and no failed attempts — invoices may not have been created. Verify before contacting client.
- **`simplyinspiredgoods.com` is marked LOST** in AR but paid in April ($320.86, `cus_KpAN7dkWaFdz3B`). Surface account status in the client view. Still reconciles as MATCH.
- **`cus_OmyL3eKyTwAn7O`** (alisonsmontessori.com) OVERPAID by $175 ($475 expected, $650 paid). Likely a manual or off-cycle payment. Do not auto-resolve.

Full analysis: `docs/data-april-2026.md`

---

## 9. Audience

- **Primary user**: the agency owner. Non-technical, reads the dashboard daily. Cares about: who hasn't paid, how does this month compare to last, am I owed money.
- **Secondary user**: an external auditor reviewing year-end. Cares about: traceability of every dollar, methodology, source-file integrity.
- **Maintainer**: Marco (analyst-developer). Builds and operates the system. Cares about: reproducibility, low-friction monthly close.

When in doubt about UI copy or report framing, ask "would the owner understand this in 3 seconds?" If no, simplify.

---

## 10. Git workflow

Claude handles all git actions autonomously for this project. No confirmation is needed before staging, committing, or pushing to `main`.

**Rules:**
- After completing any feature, fix, or significant change: `git add -A`, commit with a descriptive message, and push to `main` using the configured SSH key.
- Push command: `GIT_SSH_COMMAND="ssh -i C:/Users/marco/.ssh/id_billing_eastondigital" git push`
- Commit message format: `feat: ...` / `fix: ...` / `chore: ...` — short and descriptive.
- Never amend published commits or force-push.
- If a push fails (e.g. diverged branch), surface the error to Marco before taking any destructive action.

---

## 11. Out of scope (don't accidentally build)

- Payment processing of any kind. We don't charge cards.
- Invoice generation. Stripe does that.
- A general-purpose accounting system. This is reconciliation, not bookkeeping.
- Multi-tenancy / SaaS. One agency, one Supabase project.
- Mobile native app. Mobile web is enough.
