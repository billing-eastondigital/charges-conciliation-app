# ADR 0005 — Google Ads Spend Integration

**Date**: 2026-06-12  
**Status**: Accepted  
**Author**: Marco Graciotti

---

## Context

The agency bills most clients a percentage of their Google Ads spend plus a base fee. Today, the expected charge is derived from a manually maintained billing xlsx uploaded each month. This creates lag and human error: someone must pull the Google Ads figures, compute the fee, and enter it into the spreadsheet before reconciliation can run.

A Google Ads reporting service is available at `http://k8800cs0o0o8scos848gsc0c.3.219.249.84.sslip.io` (API key: stored in Supabase secret `GOOGLE_ADS_API_KEY`). It exposes ad spend by customer/campaign for any date range.

The client config CSV (`data_billing_app_client_platform_ids`) maps `stripe_id` → `google_ads_customer_id` (and other platform IDs for future use).

---

## Decision

### 1. New table: `google_ads_spend`

Stores raw ad spend pulled from the reporting service, one row per `(period_label, google_ads_customer_id, campaign_id)`. Immutable after ingest — re-pulls overwrite by deleting and re-inserting for the period.

### 2. New columns on `client_billing_plans`

| Column | Type | Purpose |
|---|---|---|
| `billing_method` | text | Extend existing enum: add `ADS_REVENUE` and `ADS_COST` alongside `AD_SPEND` and `SUBSCRIPTION` |
| `billing_day_one` | smallint | Day of month Google charges the client's card (actual charge date) |
| `billing_day_two` | smallint | ~3 days after billing_day_one — estimated window for charge to settle/appear in Stripe |
| `base_fee` | numeric(12,2) | Fixed monthly base fee (charged regardless of ad spend) |
| `billing_percentage` | numeric(5,4) | Fraction of ad spend charged as management fee (e.g. 0.1500 = 15%) |

`billing_method` enum values:
- `AD_SPEND` (existing default) — expected charge from xlsx import
- `SUBSCRIPTION` (existing) — flat fee from `projection_amount`
- `ADS_REVENUE` — fee = `base_fee + (google_ads_revenue * billing_percentage)`
- `ADS_COST` — fee = `base_fee + (google_ads_cost * billing_percentage)`

### 3. New columns on `expected_charges`

| Column | Type | Purpose |
|---|---|---|
| `source` | text | `'IMPORT'` (xlsx) \| `'SUBSCRIPTION'` \| `'ADS_REVENUE'` \| `'ADS_COST'` — how this row was generated |
| `billing_detail` | jsonb | Machine-readable breakdown: `{ base_fee, ad_spend, billing_pct, computed_fee }` |

### 4. New table: `client_platform_ids`

Maps `stripe_id` → platform customer IDs from the config CSV.

| Column | Type | Purpose |
|---|---|---|
| `stripe_id` | text PK | FK → clients.stripe_id |
| `google_ads_customer_id` | text | Google Ads customer ID (numeric string, no dashes) |
| `facebook_ads_account_id` | text | Future use |
| `other_ids` | jsonb | Catch-all for additional platforms |

---

## Consequences

**Positive**
- Eliminates manual ad-spend transcription for ADS_REVENUE/ADS_COST clients
- `billing_detail` jsonb makes every computed expected charge auditable dollar-for-dollar
- `source` column lets the UI distinguish auto-computed vs manually imported rows
- `client_platform_ids` is extensible to Facebook, TikTok, etc. without schema changes

**Negative / Risks**
- The Google Ads reporting service is self-hosted — if it's down, auto-generation of expected charges fails silently unless we add error handling in the edge function
- `billing_day_one` / `billing_day_two` are informational only in v1; they are not used for period attribution (that stays on `charge.created_at` per ADR 0004)

---

## Alternatives considered

- **Extend the billing xlsx** with a Google Ads column and keep importing manually — rejected because it doesn't remove the human error, just moves it
- **Store spend aggregated per client per period** — rejected in favor of campaign-level granularity so drill-down is possible in a future audit view

---

## Migration files

1. `20260612000001_add_client_platform_ids.sql`
2. `20260612000002_add_google_ads_spend.sql`
3. `20260612000003_extend_billing_plans_and_expected_charges.sql`
