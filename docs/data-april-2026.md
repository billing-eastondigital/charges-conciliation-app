# April 2026 — Canonical Dataset Analysis

> This document captures the full reconciliation picture for the April 2026 period.
> It is the **reference fixture** for development: mock data and seed data are derived from this analysis.
> Source files: `data/billing_april_2026.xlsx` (tab: Hoja1) + `data/stripe_2026_ytd.csv` (filtered to 2026-04-*)

---

## Source file summary

| File | Rows | Scope |
|---|---|---|
| `data/billing_april_2026.xlsx` | 51 AR rows | April 2026 billing only |
| `data/stripe_2026_ytd.csv` | 246 total / 59 April | Jan–Apr 2026, all statuses |

### AR billing columns (key)
`Account Name`, `Stripe Id`, `Account Status`, `Plan`, `Monthly Billing Plan`, `Total to Bill`, `Memo`, `Email on Stripe`

### Stripe CSV columns (key)
`id`, `Created date (UTC)`, `Amount`, `Amount Refunded`, `Status`, `Decline Reason`, `Customer ID`, `Customer Email`, `Invoice ID`

---

## April 2026 Stripe breakdown

| Status | Count | Notes |
|---|---|---|
| Paid | 48 | Total collected: $59,962.36 |
| Failed | 10 | Across 4 unique customers |
| Refunded | 1 | cus_Mk1E5riYx9BQSb — $518.89 |

---

## Reconciliation results (grain: cus_id)

Tolerance: ±$0.01. Classification: MATCH / OVERPAID / UNDERPAID / FAILED_HARD / MISSING_PAYMENT / STRIPE_ONLY.

### MATCH — 35 customers

| cus_id | Account(s) | Expected | Collected |
|---|---|---|---|
| cus_EJMKHEPaZ23L9y | mouldings.com | $4,001.50 | $4,001.50 |
| cus_GNUYupp8Hh4cSP | ktmtwins.com | $1,501.98 | $1,501.98 |
| cus_Gks5Luf2oz80Vv | WIM - alltimetrading.com | $4,000.00 | $4,000.00 |
| cus_HMwHt2FOxWLy8x | ringsbylux.com | $475.00 | $475.00 |
| cus_HN0odgEcZ6VkPR | maryjskin.net | $356.11 | $356.11 |
| cus_HOlII80xvF057s | pillarstyles.com | $279.58 | $279.58 |
| cus_HR1JG8drEbsyIx | athleticogear.com | $509.83 | $509.83 |
| cus_HWgmu82x3l9rCZ | Designerframesoutlet.com | $4,001.26 | $4,001.26 |
| cus_IMNaYfltkdPXuv | mckinleyleather.com | $512.40 | $512.40 *(failed first attempt: lost_card)* |
| cus_JR5mL46ckKKJiR | justmenshoes.com | $1,545.60 | $1,545.60 |
| cus_KpAN7dkWaFdz3B | simplyinspiredgoods.com | $320.86 | $320.86 *(account status: LOST)* |
| cus_L4vWBzInyrA8RN | yourelegantbar.com | $1,746.95 | $1,746.95 |
| cus_L7b1kOJY2PJeOW | admorelighting.com | $548.93 | $548.93 |
| cus_LF3m2e8OrXMsUK | purescrubs.com | $334.02 | $334.02 |
| cus_LKim7EZYOVj9jF | quiltedjoy.com | $1,450.51 | $1,450.51 |
| cus_LpoMNpDjbzi6fz | popscorn.com | $489.79 | $489.79 *(failed first attempt: do_not_honor)* |
| cus_MAQFq6FlG4sGc3 | realestateposts.com + addressesofdistinction.com + hallsigns.com | $1,391.64 | $1,391.64 |
| cus_MBlqclhGkaWbp7 | skipsgarage.com | $399.00 | $399.00 |
| cus_MjtOD8HI7vVrzm | thepositivechristian.com | $552.19 | $552.19 |
| cus_NHEkhkK5qPmO8o | highcottonties.com | $475.00 | $475.00 |
| cus_OinjM3GcjQrwhs | cheapdealersupplies.com + cheapdealersupplies.com (Amazon) | $1,082.17 | $1,082.17 |
| cus_Ouw9vXPsi6rIp5 | ragandbonebindery.com | $441.27 | $441.27 |
| cus_OuwrMB5A8wG0Tm | pedipocketblanket.com | $475.00 | $475.00 |
| cus_PInUMrDJgQWDKt | nyspiceshop.com | $801.98 | $801.98 |
| cus_PIpVQvQrcL0N9x | gongs-unlimited.com | $3,960.06 | $3,960.05 *(-$0.01, within tolerance)* |
| cus_PldCRQBIaCoGiO | jrgsupply.com | $2,098.88 | $2,098.88 |
| cus_PwTdKcMGMbuEIv | Emma Lous Boutique | $1,314.22 | $1,314.22 |
| cus_PyNx1GjDB2FRJh | beangoods.com | $475.00 | $475.00 |
| cus_Q14kHfVtV7mClW | sgilly@trility.net | $9,900.00 | $9,900.00 *(2 invoices: $6,000 + $3,900)* |
| cus_Q6Hm4ikzgMKpLU | slavik@bellaphytologic.com | $475.00 | $475.00 |
| cus_QUbjD69JAUgYEI | dallasdesignerhandbags.com | $1,772.75 | $1,772.75 |
| cus_QhMNKJ23jRrM3E | angie@bobodesignstudio.com | $475.00 | $475.00 |
| cus_SFWU1lLTiWM73N | gcypher@cypherpickleball.com | $475.00 | $475.00 |
| cus_Sgavq2Eogudl9V | hill3312@gmail.com | $475.00 | $475.00 |
| cus_TyLzeArSBSoOIM | tanceuticals.com | $518.88 | $518.89 *(+$0.01, within tolerance; 2 prior failures: insufficient_funds)* |

### OVERPAID — 1 customer

| cus_id | Account | Expected | Collected | Variance |
|---|---|---|---|---|
| cus_OmyL3eKyTwAn7O | accounts@alisonsmontessori.com | $475.00 | $650.00 | **+$175.00** |

> Likely a manual payment or off-cycle invoice not reflected in April billing sheet.

### FAILED_HARD — 2 customers

| cus_id | Account | Expected | Failures | Decline reasons |
|---|---|---|---|---|
| cus_RnWyNOxHOXVL3t | jdevlinglassart.com | $834.09 | 4x | insufficient_funds (x4) |
| cus_M6Ex2LIAHaqE31 | earmall.com | $309.95 | 2x | previously_declined_do_not_retry, incorrect_number |

### MISSING_PAYMENT — 3 customers

No Stripe activity found in April. No failed attempts either — invoices may not have been created on Stripe.

| cus_id | Account | Expected |
|---|---|---|
| cus_LS8xakJItjgXhd | sugarbeeclothing.com (S + C) | $598.00 |
| cus_Mql0N9LiRyQDMW | jewelrybybretta.com (S + C) | $598.00 |
| cus_L7DrHmiMofn6ws | beehivehandmade.com (S + C) | $299.00 |

> All three are "(S + C)" accounts — possibly billed via a different mechanism or pending invoice creation.

### REFUNDED — 1 charge (no AR row)

| cus_id | Amount Refunded | Email | Notes |
|---|---|---|---|
| cus_Mk1E5riYx9BQSb | $518.89 | gregpetriekis@yahoo.com | No AR billing line for this customer. Refund dated 2026-04-27. Original charge 2026-04-22. |

---

## Data quality issues (AR rows with no Stripe ID)

These 7 AR rows lack a `Stripe Id` column value. Some have $0 expected (inactive/placeholder). Others have real expected amounts and matching Stripe payments — the join fails silently.

| Account Name | Expected | Matching Stripe cus_id | Collected | Status if linked |
|---|---|---|---|---|
| webstore@laeducativapr.com | $0.00 | — | — | N/A (inactive) |
| tiradoalejandra.18@gmail.com | $1,130.00 | cus_SGRkJV1CrZMq0b | $1,130.00 | **MATCH** (if linked) |
| ppucheu@pbm-solutions.com | $3,500.00 | cus_RyRxOBvhJBvNpE | $3,550.00 | **OVERPAID +$50** (if linked) |
| eduardo@caribbeanrealty.com | $0.00 | — | — | N/A (inactive) |
| mateo@usframefactory.com | $0.00 | — | — | N/A (inactive) |
| margaret@lblegalnurses.com | $1,500.00 | *(no cus_id in Stripe either)* | $1,500.00 | **MATCH** (if linked by email) |
| richie@natcodb.com | $1,500.00 | cus_UJPVLKVt2c4Oh3 | $3,500.00 | **OVERPAID +$2,000** (if linked) |

> **Action**: these Stripe IDs need to be added to the billing sheet. Until then, these customers surface as STRIPE_ONLY exceptions in the dashboard.
> `richie@natcodb.com` specifically has a large discrepancy ($1,500 expected vs $3,500 paid) — likely a setup/onboarding fee on a new contract, not a billing error.

---

## Known multi-account cus_ids (April 2026)

| cus_id | Accounts | Total Expected |
|---|---|---|
| cus_MAQFq6FlG4sGc3 | realestateposts.com ($504.79) + addressesofdistinction.com ($399.00) + hallsigns.com ($487.85) | $1,391.64 |
| cus_OinjM3GcjQrwhs | cheapdealersupplies.com ($607.17) + cheapdealersupplies.com Amazon ($475.00) | $1,082.17 |
| cus_Gks5Luf2oz80Vv | WIM - alltimetrading.com ($4,000) — note: billing sheet also mentions WIM-wholesalesockdeals.com | $4,000.00 |

---

## AR billing — Account status notes

- `ACTIVE`: standard active client
- `LOST`: simplyinspiredgoods.com (`cus_KpAN7dkWaFdz3B`) — marked LOST but still paid in April. Surface in dashboard.
- `(S + C)` accounts: sugarbeeclothing, jewelrybybretta, beehivehandmade — likely "Setup + Content" plan, may be billed separately

---

## April 2026 KPI summary (for mock data)

| Metric | Value |
|---|---|
| Total AR clients billed | 44 unique cus_ids (incl. multi-account merges) |
| Total expected | ~$59,800 *(AR rows with Stripe ID only)* |
| Total collected (Stripe Paid) | $59,962.36 |
| MATCH | 35 |
| OVERPAID | 1 |
| FAILED_HARD | 2 |
| MISSING_PAYMENT | 3 |
| REFUNDED (no AR) | 1 |
| AR rows with no Stripe ID | 7 (4 with $0, 3 with real amounts) |
