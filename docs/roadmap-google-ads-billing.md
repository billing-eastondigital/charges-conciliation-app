# Roadmap — Google Ads billing generation inside Recon

> Goal: replicate the `remotetal-projects` billing system (billings / billing-api / billing-front)
> inside the recon app, so billing items are computed from Google Ads data directly in Supabase,
> feed `expected_charges` automatically, and the monthly xlsx upload becomes unnecessary for
> ad-spend clients.
>
> Source analysis: see memory `billing-system-repos.md` and the repos at
> `C:\Users\marco\Documents\remotetal-projects\`.

---

## Phase 0 — Decisions & prerequisites (before any code)

**0.1 — ADR `docs/decisions/0005-google-ads-billing-generation.md`**
Architectural change: new data source (Google Ads), new billing method, expected_charges
generated from campaign data. Must capture:
- Two new `billing_method` values replacing `ADS_AUTO` + `custom_rule`:
    - `ADS_REVENUE` — Google Ads API, formula uses `conversion_value_by_conv_time`
    - `ADS_COST`    — Google Ads API, formula uses campaign `cost` (spend)
  Existing methods unchanged: `AD_SPEND` (manual xlsx, direct amount no formula),
  `SUBSCRIPTION` (flat fee from `projection_amount`). No `custom_rule` field needed.
- Formula for both ADS variants: `total_bill = base_fee + revenue_base * billing_percentage / 100`
  where `revenue_base` = conversion_value (ADS_REVENUE) or cost (ADS_COST).
- Channel grouping: Shopping/Video/PMax/Display = "shopping bucket"; Search separate.
- Campaign filters: name must contain `'ED |'`; exclude Brand Search (ILIKE `'%Brand%'` and
  not `'%Non%Brand%'`); drop campaigns with cost=0 AND conv_value=0.
- Formula: `total_bill = google_bf + shopping_rev * pct/100 + search_rev * pct/100`.
- **Two day fields — different roles**:
  - `billing_day_one` = **Google Day**: the exact day that triggers ingestion + calculation.
    Only two values in practice: 1 or 20. For SUBSCRIPTION clients, this is also the charge day.
  - `billing_day_two` = **Estimated charge window**: informational only — the charge lands
    within a few days after the Google Day (e.g. day 1 Google Day → charge arrives by day 5).
    Does NOT drive any automation logic in recon.
- Billing window (ADS clients): Google Day 1 → previous full calendar month; Google Day 20 →
  day 20 of previous month to day 19 of current month. Timezone America/Los_Angeles.
- **RESOLVED — period attribution**: `expected_charges.period` = month of the Google Day
  (= month when the Stripe charge lands — the short charge window never crosses month boundary).
  A day-20 client running June 20 → expected_charge in "June 2026".
  Campaign window is metadata only (stored in `billing_detail` jsonb + `google_ads_campaigns`).

**0.2 — Confirmed with owner (no longer blocking)**
- ✅ Single `billing_percentage` for Shopping AND Search — confirmed, keep simple.
- ✅ `custom_rule = 'use_cost'` exists but rare (e.g. KTM) — modeled as per-client flag in billing plan.
- ✅ Non-day-1 clients exist — Batch 3 uses day 20. Only two Google Day values in practice: 1 and 20.
- ✅ Period attribution — confirmed: `expected_charges.period` = month of Google Day execution.
- ✅ `billing_day_two` is informational only (estimated charge window, ~5 days after Google Day).
  No automation logic needed. For SUBSCRIPTION, `billing_day_one` is the exact charge day.

**0.3 — What to request from the developer (blocking)**

1. **Rotate the Google Ads API key** — the current key is leaked in `billings/api-google-ads-doc.txt`.
   After rotation, provide: new API key + base URL of the Google Ads internal microservice.
   These go into Supabase secrets as `GADS_API_URL` and `GADS_API_KEY`.

2. **Client config CSV export** from the legacy RDS. Ask the developer to run this query and
   send the result as CSV:
   ```sql
   SELECT
     p.stripe_id, p.google_id, p.account_status,
     b.billing_percentage, b.billing_day_one, b.billing_day_two,
     b.plan, b.billing_details, b.notes, b.custom_rule,
     f.google_bf, f.batch
   FROM billing_app_client_platform_ids p
   LEFT JOIN billing_app_client_billing_settings b ON b.client = p.client
   LEFT JOIN billing_app_client_bfs f ON f.client = p.client
   WHERE p.account_status = 'ACTIVE'
   ORDER BY p.stripe_id;
   ```

**Deliverable**: approved ADR. No code.

---

## Phase 1 — Schema (migrations)

**1.1 — `google_ads_campaigns` table** (mirror of `billing_app_google_ads`, cleaned up)
```
id bigserial PK
google_id text NOT NULL            -- Ads customer ID (xxx-xxx-xxxx)
account_name text
campaign_name text NOT NULL
channel_type text NOT NULL         -- 'Shopping'|'Search'|'Performance Max'|'Display'|'Video'
campaign_status text
conversion_value numeric(12,2) NOT NULL DEFAULT 0
cost numeric(12,2) NOT NULL DEFAULT 0
currency text NOT NULL DEFAULT 'USD'
billing_date_from date NOT NULL
billing_date_to date NOT NULL
period_id / period_label FK → periods
created_at timestamptz DEFAULT now()
UNIQUE (google_id, campaign_name, billing_date_from, billing_date_to)  -- idempotent re-sync
```
Money as `numeric`, never TEXT (fixes legacy `client_bfs` flaw). Anon SELECT policy (RLS pattern).

**1.2 — Client config columns**
- `clients.google_id text NULL` (join key to Ads).
- On `client_billing_plans`: `billing_percentage numeric(5,2)`, `base_fee numeric(12,2)`,
  `billing_day_one smallint DEFAULT 1`, and extend `billing_method` check constraint to allow
  `'ADS_REVENUE'` and `'ADS_COST'`. No `custom_rule` column — the method encodes everything.
- Recreate `client_active_plans` view with explicit columns (known Postgres `SELECT *` landmine).

**1.3 — `expected_charges` provenance**
- Add `source text DEFAULT 'IMPORT'` (`'IMPORT'|'SUBSCRIPTION'|'ADS_AUTO'`) + nullable
  `billing_detail jsonb` (items breakdown: base fee, shopping rev/%, search rev/%, memo)
  for drill-down and invoice-text rendering.

**Deliverable**: 3 migration files, applied via `supabase db push`. Update `supabase/CLAUDE.md`.

---

## Phase 2 — Config backfill & UI for plan management

**2.1 — Backfill script** (`tools/scripts/import_legacy_billing_config.py`)
Reads the Phase 0.3 CSV export, matches by stripe_id, fills `clients.google_id` and the new
plan columns. Report unmatched rows; never guess.

**2.2 — Admin UI**
Extend Plan Management (admin/periods + clients page) Edit/Set-up dialogs with: Billing Method
`ADS_AUTO` option, Google ID, Billing %, Base Fee, Custom Rule toggle. Reuse existing
`EditPlanDialog` / server actions; add anon UPDATE policies if a new table write appears.

**Deliverable**: every ad-spend client has google_id + percentage + base fee in the DB.

---

## Phase 3 — Ingestion: `ingest-google-ads` edge function ✅ COMPLETE

**Ingestion pattern — runs ONCE per client per billing cycle, not daily accumulation.**
Google Ads may adjust conversion attribution up until the last day of the period. Fetching
on `billing_day_one` guarantees the window is closed and numbers are final. The daily cron
simply checks "which clients have their billing_day_one = today?" and runs only those.
This matches the legacy script behavior exactly (`if billing_day_one != today: continue`).

Implementation:
1. Input: `{ period_label: "auto" | "June 2026" }` → resolves the target period (= the period
   where expected_charges will land). For each client, the campaign window is derived from
   `billing_day_one`: if day=1 → previous full calendar month; if day=N → from day N of
   previous month to day N-1 of current month. Timezone: America/Los_Angeles.
2. For each client with `billing_method IN ('ADS_REVENUE','ADS_COST')` and non-null `google_id`
   and active plan whose `billing_day_one` = today:
   call `GET {GADS_API_URL}/api/metrics/campaign-performance?customerId&startDate&endDate`
   (X-API-Key header; strip dashes from google_id).
3. Map channelType codes (2=Search, 3=Display, 4=Shopping, 6=Video, 10=PMax). Store ALL
   campaigns including Brand Search and zero-activity rows — filtering happens at calculation
   time (Phase 4), never at ingest (forensic rule: never silently drop source rows).
4. Upsert into `google_ads_campaigns` (idempotent via the unique constraint). Data is fixed
   after this point — no subsequent updates for the same window.
5. Per-client try/catch — one failing account must not abort the run.
6. Immediately trigger Phase 4 calculation for the processed clients (same pattern as
   `ingest-stripe` → `reconcile-period`).
7. Response shape: `{ ok, period_label, clients_processed: N, inserted: N, skipped: N }`.

**Cron**: extend the daily `sync-stripe-daily` chain or add `sync-gads-daily` (separate is safer);
schedule respecting billing_day_one logic — simplest: run daily, function itself decides which
clients are due (exactly like the legacy script).

**Deliverable**: deployed function + cron migration + manual trigger button in `/admin/import`
Pipeline Status panel.

---

## Phase 4 — Billing calculation → `expected_charges` ✅ COMPLETE

Port `inser_final_report.py` SQL to a Postgres function `generate_ads_billing(period_label)`:
1. Aggregate `google_ads_campaigns` per google_id for the period window, applying:
   Brand-Search exclusion, channel buckets, use_cost rule, percentage, base fee.
2. Fixed-fee branch: `ADS_AUTO` clients with base_fee > 0 and no google_id → flat row.
3. Write/refresh `expected_charges` rows with `source = 'ADS_AUTO'`, amount = total_bill
  (numeric(12,4)), `billing_detail` jsonb with items 1–3 texts + amounts + memo
  ("{Client} {Month} Invoice").
4. Idempotent: delete-and-reinsert only rows with `source = 'ADS_AUTO'` for that period —
   never touch imported or subscription rows.

Wire into `reconcile-period` exactly where SUBSCRIPTION auto-gen runs today: subscriptions
first, then ads billing, then reconcile. **Regression gate (workflow rule 4)**: re-run a closed
period in dry-run and diff `reconciliation_results` — zero changes expected for non-ADS_AUTO
clients before merging.

**Deliverable**: SQL function migration + `reconcile-period` update + regression diff report.

---

## Phase 5 — UI ✅ COMPLETE (2026-06-12)

**5.1 — Billing tab rework** (`app/(dashboard)/billing/`)
From in-memory editable table → reads `expected_charges` + `billing_detail` for the selected
period: columns Client | Batch | Base Fee | Shopping Rev | Shopping % | Search Rev | Search % |
Total Bill | Items | Memo | Source badge (IMPORT / SUBSCRIPTION / ADS_AUTO). formatMoney()
everywhere; StatusBadge pattern for source.

**5.2 — New Google Ads page** (`app/(dashboard)/ads/`)
Raw campaign table per period (account, campaign, channel, cost, conv value, billable flag
showing which rows were excluded and why — Brand, no 'ED |' prefix). This is the drill-down
that proves every billed dollar (audit story).

**5.3 — Client detail** (`client/[stripe_id]/`)
Show google_id + ads-billing config on the header card; campaign history section.

**Deliverable**: screenshots in PR per workflow rule 5.

---

## Phase 6 — Cutover & validation ← NEXT

1. **Parallel month**: run one full month with both systems (legacy RDS + recon) and diff
   `billing_app_final_report.total_bill` vs `expected_charges.expected_amount` per stripe_id.
   Tolerance ±$0.01. Investigate every mismatch before trusting recon.
2. Flip clients to `ADS_AUTO` in batches (start with simple day-1, conversion-value clients).
3. Update runbooks (`docs/runbooks/monthly-close.md`) — xlsx upload becomes exception-only.
4. Decommission decision for legacy repos (owner call; not ours).

---

## Phase 7 — Make.com invoice automation (future)

**Goal**: close the full cycle inside recon — billing calculated → invoice generated → link stored.

**Flow**:
1. A Make.com scenario watches Supabase for `expected_charges` rows where
   `source IN ('ADS_REVENUE','ADS_COST','AD_SPEND')` and `invoice_url IS NULL` and the
   period is ready to bill (Google Day has passed).
2. Make reads the `billing_detail` jsonb (line items: base fee, shopping rev/%, search rev/%,
   memo, DFW if present) and creates a Stripe Invoice via the Stripe API with those exact
   line items.
3. On success, Make writes the generated invoice URL back to `expected_charges.invoice_url`
   (new column). The billing table in recon renders it as a clickable link per row.
4. Owner reviews invoices in recon before sending — one-click "Send" triggers Make to
   finalize and send the Stripe invoice to the client.

**Schema addition needed** (migration at phase start):
- `expected_charges.invoice_url text NULL` — Stripe hosted invoice URL.
- `expected_charges.invoice_status text NULL` — `'draft'|'open'|'paid'|'void'`.

**Why Make and not a Supabase edge function**: Make handles the Stripe Invoice API complexity,
retry logic, and gives a no-code audit trail of every invoice action without adding API key
management for Stripe invoicing to the recon codebase.

**Prerequisite**: Phase 5 billing UI must be complete and line items must be validated against
the legacy system (Phase 6) before automating invoice generation — wrong line items sent to
clients is worse than doing it manually.

**Deliverable**: Make scenario + migration + invoice_url column rendered in billing tab.

---

## Sequence & sizing

| Phase | Depends on | Size | Status |
|---|---|---|---|
| 0 ADR + key rotation + config export | — | S | ✅ |
| 1 Migrations | 0 | S | ✅ |
| 2 Backfill + plan UI | 1 | M | ✅ |
| 3 ingest-google-ads | 1, 0.3 | M | ✅ validated 2026-06-12 |
| 4 Calculation → expected_charges | 2, 3 | L | ✅ validated 2026-06-12 |
| 5 UI | 4 | M | ✅ 2026-06-12 |
| 6 Parallel run + cutover | 5 | M (calendar-bound: one full month) | ← NEXT |
| 7 Make.com invoice automation | 6 | M | future |

Critical path: 0 → 1 → 3 → 4. Phase 2 UI and Phase 5 can overlap with neighbors.

## Confirmed business rules (from client config CSV analysis)

- **billing_day_one = 31**: use last day of month when the month has fewer days (e.g. Feb 28/29).
- **Billing days in use**: 1, 4, 6, 7, 8, 12, 13, 15, 19, 20, 22, 28, 31 — window logic must be
  fully generic, not hardcoded for day-1 and day-20 only.
- **google_id ↔ stripe_id**: target relationship is 1-to-1. Multi-google_id rows for the same
  stripe_id (cus_MAQFq6FlG4sGc3, cus_Gks5Luf2oz80Vv, cus_OinjM3GcjQrwhs) are legacy data
  quality issues to correct in a future cleanup — not modeled as a junction table.
  During backfill: flag these for manual review, do not auto-assign.
- **Clients that will always be AD_SPEND (never automated)**:
  - `cus_GjG9nvTKNHvKm3` — 2% of Year-over-Year Revenue Growth, explicitly "DO IT MANUALLY"
  - `cus_Q14kHfVtV7mClW` — "Custom. Billed by Gabriel"
  - `paypal` — not a real Stripe ID, managed via PayPal by Gabriel
  - `cus_NzutB5xP7tpKlr` — Amazon flat rate, no batch assigned
  - `cus_Oz1JPWE4Uew8XA` — billing_day_one = NULL, incomplete config

## Out of scope for now — future integrations

- **DFW charges**: additional per-client fee (typically $20, sometimes variable based on product
  count). Currently added manually. Future: integrate with **DataFeedWatch** API as the data
  source. Model as `dfw_amount numeric` on billing plan when that integration is built.
- **Bing revenue**: Bing campaign data currently not available via API integration. Future:
  add Bing Ads API as a second ingestion source alongside Google Ads, using the same
  `google_ads_campaigns`-style table (`bing_ads_campaigns`). Same calculation pattern,
  separate channel bucket.

Both items will require their own ADRs and schema migrations when prioritized.

## Risks
- **Billing-window vs calendar-period mismatch** (non-day-1 clients) — RESOLVED: period =
  month of billing execution. Window is metadata only.
- **Google Ads internal API is a black box** (separate repo, not analyzed) — confirm uptime/owner;
  recon takes a hard dependency on it. Production URL still needed (localhost in .env).
- **Legacy config data quality** (base fees stored as TEXT, free-text rules, NULL billing days)
  — backfill script must validate and report, never coerce silently.
- **Double-billing during transition** — a client must never be both `ADS_REVENUE`/`ADS_COST`
  and present in the monthly xlsx import; add a guard in `ingest-billing` that rejects xlsx
  rows for ADS_REVENUE/ADS_COST clients.
- **billing_day_one = 31** — use last day of month for months with fewer days (confirmed).
