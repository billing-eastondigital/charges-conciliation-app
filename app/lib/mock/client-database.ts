// ============================================================
// Client database — mock data (Phase 1)
// Source: client-data-base.xlsx (Hoja1, 61 rows → 53 unique clients)
// Normalized: one ClientRecord per stripe_id.
// Billing plan history: one ClientBillingPlan per plan period.
//
// Current state: all clients have a single plan starting 2026-01-01
// (their situation as of the April 2026 reconciliation).
// When a plan change is recorded, add a second entry to billing_plans[]
// with effective_from = first day of the new plan and close the previous
// by setting its effective_to = same date.
//
// Projection type auto-derived from billing_pct unless overridden:
//   billing_pct == 0     → FIXED  (flat rate, predictable)
//   0 < pct <= 2        → ROLLING_3 (revenue %, varies monthly)
//   pct >= 10            → LAST_PERIOD (highly variable)
//
// ⚠ Data quality notes:
//   - cus_KpAN7dkWaFdz3B (simplyinspiredgoods.com): LOST — added manually
//   - cus_Q6Hm4ikzgMKpLU (slavik@bellaphytologic.com): in April, missing from DB
//   - cus_RyRxOBvhJBvNpE (ppucheu@pbm-solutions.com): consulting, missing from DB
// ============================================================

import type { ClientRecord, ClientBillingPlan, BatchLabel, ProjectionType } from "../types";

// ── Helpers ────────────────────────────────────────────────────────────────

function plan(
  billing_pct: number,
  billing_plan: string,
  billing_details: string,
  billing_day: number | null,
  notes: string | null,
  projection_amount: number | null,
  overrides: {
    projection_type?: ProjectionType;
    manual_overrides?: Record<string, number>;
    effective_from?: string;
    effective_to?: string | null;
  } = {}
): ClientBillingPlan {
  return {
    billing_plan,
    billing_details,
    billing_method: "AD_SPEND" as const,
    billing_pct,
    billing_day,
    notes,
    projection_type:
      overrides.projection_type ??
      (billing_pct === 0 ? "FIXED" : billing_pct >= 10 ? "LAST_PERIOD" : "ROLLING_3"),
    projection_amount,
    manual_overrides: overrides.manual_overrides ?? {},
    effective_from: overrides.effective_from ?? "2026-01-01",
    effective_to: overrides.effective_to ?? null,
  };
}

function client(
  stripe_id: string | null,
  display_name: string,
  primary_email: string,
  batch: BatchLabel,
  google_id: string | null,
  accounts: string[],
  billing_plans: ClientBillingPlan[],
  overrides: Partial<Pick<ClientRecord, "account_status" | "is_active" | "deactivated_month" | "start_date" | "end_date">> = {}
): ClientRecord {
  return {
    id:           stripe_id ?? crypto.randomUUID(),
    stripe_id,
    display_name,
    primary_email,
    account_status: overrides.account_status ?? "ACTIVE",
    batch,
    google_id,
    accounts,
    is_active: overrides.is_active ?? true,
    deactivated_month: overrides.deactivated_month ?? null,
    start_date: overrides.start_date ?? null,
    end_date: overrides.end_date ?? null,
    billing_plans,
  };
}

// ─────────────────────────────────────────────────────────────
// BATCH 1 — Full-service (Google Shopping + variable revenue)
// ─────────────────────────────────────────────────────────────
const BATCH_1: ClientRecord[] = [
  client("cus_Gks5Luf2oz80Vv", "WIM Group", "wsinmotion@gmail.com", "1", "340-667-9925",
    ["WIM - All Time Trading", "WIM - Wholesale Sock Deals", "WIM - You Love Organic"],
    [plan(10, "Advanced Accounts - Custom Pricing",
      "Fix fee $1,000 + 10% of Ad Spend from previous month for Google and Bing",
      1, "Manually — charge $1,000 every Monday — Invoice in Harvest",
      4000.00, { projection_type: "LAST_PERIOD" })]),

  client("cus_GNUYupp8Hh4cSP", "KTM Twins", "taryn@ncyyamaha.com", "1", "649-947-9595",
    ["ktmtwins.com"],
    [plan(12, "Advanced Accounts - Custom Pricing",
      "Charge 12% of ad spend from previous month for AdWords and Bing — varies monthly",
      1, "Manually — charge % of Campaign COST not REVENUE",
      1501.98, { projection_type: "LAST_PERIOD" })]),

  client("cus_IMNaYfltkdPXuv", "McKinley Leather", "info@mckinleyleather.com", "1", "443-743-0284",
    ["mckinleyleather.com"],
    [plan(2, "Google Shop+Google Ads+DFW",
      "Google Shopping + Text Ads - $399 + 2% of ad revenue (NEW 2021) + $20 DFW",
      1, null, 512.40)]),

  client("cus_JR5mL46ckKKJiR", "Just Men's Shoes", "sales@justmenshoes.com", "1", "300-423-8601",
    ["justmenshoes.com"],
    [plan(2, "Google Shop+Google ads+DFW",
      "Google Shopping + Text Ads - $320/mo + 2% revenue + Bing $100/mo + 2% revenue + DFW",
      1, "Add DFW (10,000+ products). Take 2% from 'JMS Brands' but not 'Brand Terms'.",
      1545.60)]),

  client("cus_L4vWBzInyrA8RN", "Your Elegant Bar", "bsingh@yourelegantbar.com", "1", "871-387-6103",
    ["yourelegantbar.com"],
    [plan(2, "Google Shop+Google Ads",
      "Google Shopping + Text Ads - $399 + 2% of ad revenue (NEW 2021)",
      1, "Filter out Brand Text Ads", 1746.95)]),

  client("cus_MjtOD8HI7vVrzm", "The Positive Christian", "ckloan@gmail.com", "1", "362-249-0196",
    ["thepositivechristian.com"],
    [plan(2, "Google Shop+Google Ads",
      "Google Shopping + Text Ads - $399 + 2% of ad revenue (NEW 2021)",
      1, null, 552.19)]),

  client("cus_RnWyNOxHOXVL3t", "J Devlin Glass Art", "shalligan@jdevlinglassart.com", "1", "923-161-0221",
    ["jdevlinglassart.com"],
    [plan(2, "Google Shop+Google Ads+DFW",
      "Google Shopping + Text Ads - $399 + 2% of ad revenue (NEW 2021) + DFW",
      1, null, 834.09)]),

  client("cus_Q1nzEwQxTHo44M", "The Squire Shop", "april@shopsquireshop.com", "1", "526-865-7281",
    ["shopsquireshop.com"],
    [plan(2, "Google Shop+DFW",
      "Google Shopping - $299 + 2% of ad revenue + $20 DFW",
      1, "Add $20 DFW", 299.00)]),
];

// ─────────────────────────────────────────────────────────────
// BATCH 2 — Standard Google Shopping accounts
// ─────────────────────────────────────────────────────────────
const BATCH_2: ClientRecord[] = [
  client("cus_EJMKHEPaZ23L9y", "Mouldings / White River", "renriquez@whiteriver.com", "2", "842-648-8421",
    ["mouldings.com"],
    [plan(2, "Google Shop+Google Ads+DFW",
      "Google Shopping + Text Ads - $349 + 2% of ad revenue (OLD) + $40 variable DFW (2 stores)",
      1, "Mouldings & White River same invoice. Add $40 DFW 2 stores. Filter brand text ads.",
      4001.50)]),

  client("cus_HN0odgEcZ6VkPR", "Mary J Skin", "hello@maryjskin.net", "2", "338-192-2941",
    ["maryjskin.net"],
    [plan(2, "Google Shop+Google Ads",
      "Google Shopping + Text Ads - $349 + 2% of ad revenue (OLD)",
      1, null, 356.11)]),

  client("cus_HOlII80xvF057s", "Pillar Styles", "spells77@gmail.com", "2", "863-376-9880",
    ["pillarstyles.com"],
    [plan(2, "Google Shop+DFW",
      "Google Shopping - $199 + 2% of ad revenue + $20 DFW",
      1, null, 279.58)]),

  client("cus_HR1JG8drEbsyIx", "Athletico Gear", "jbrown@athleticogear.com", "2", "603-855-8382",
    ["athleticogear.com"],
    [plan(2, "Google Shop+DFW",
      "Google Shopping - $299 + 2% of ad revenue + $20 DFW",
      1, "Filter out non-ED Pmax campaign & charge $20 DFW", 509.83)]),

  client("cus_LF3m2e8OrXMsUK", "pureSCRUBS", "sv@purescrubs.com", "2", "822-002-1798",
    ["purescrubs.com"],
    [plan(2, "Google Shop",
      "Google Shopping - $299 + 2% of ad revenue",
      1, "Smart campaign is not ours — filter out", 334.02)]),

  client("cus_M6Ex2LIAHaqE31", "Ear Mall", "chrishuddleston566@gmail.com", "2", "753-500-8938",
    ["earmall.com"],
    [plan(2, "Google Shop",
      "Google Shopping - $199 + 2% of ad revenue",
      1, null, 309.95)]),

  client("cus_QUbjD69JAUgYEI", "Dallas Designer Handbags", "accounts@dallasdesignerhandbags.com", "2", "562-623-1101",
    ["dallasdesignerhandbags.com"],
    [plan(2, "Google Shop+Google Ads+BING+DFW",
      "Google Shopping, Bing Shopping, Text Ads & Remarketing - $399 + 2% of ad revenue",
      1, "Add DFW — figure every month due to higher product count", 1772.75)]),

  client("cus_TyLzeArSBSoOIM", "Tanceuticals", "gregpetriekis@yahoo.com", "2", "976-247-0644",
    ["tanceuticals.com"],
    [plan(2, "Google Shop",
      "Google Shopping - $299 + 2% of ad revenue",
      1, "Filter out non-ED and Shopping Brand ads", 518.88)]),
];

// ─────────────────────────────────────────────────────────────
// BATCH 3 — Growth & larger accounts
// ─────────────────────────────────────────────────────────────
const BATCH_3: ClientRecord[] = [
  client("cus_L7b1kOJY2PJeOW", "AdMore Lighting", "david@admorelighting.com", "3", "417-571-0383",
    ["admorelighting.com"],
    [plan(2, "Google Shop+Google Ads",
      "Google Shopping + Text Ads - $399 + 2% of ad revenue (NEW 2021)",
      1, null, 548.93)]),

  client("cus_HWgmu82x3l9rCZ", "Designer Frames Outlet", "albert.dfo@gmail.com", "3", "949-658-9180",
    ["Designerframesoutlet.com"],
    [plan(0.5, "Google Shop+Google Ads+BING",
      "Google & Bing - $399/month + 0.5% of revenue (Shopping only, not Brand)",
      20, null, 4001.26)]),

  // ⚠ Not in client DB — LOST, churned April 2026 (paid last invoice that month)
  client("cus_KpAN7dkWaFdz3B", "Simply Inspired Goods", "mike@simplyinspiredgoods.com", "3", null,
    ["simplyinspiredgoods.com"],
    [plan(0, "Google Shopping Starter Plan",
      "Google Shopping Management Starter Plan - $320.86/month",
      null, "LOST — account marked inactive", 320.86)],
    { account_status: "LOST", is_active: false, deactivated_month: "2026-04" }),

  client("cus_LKim7EZYOVj9jF", "Quilted Joy", "angela@quiltedjoy.com", "3", "699-862-2686",
    ["quiltedjoy.com"],
    [plan(2, "Google Shop+Google Ads+BING+DFW",
      "Google Shopping & Bing Shopping - $399 + 2% of ad revenue",
      20, null, 1450.51)]),

  client("cus_LpoMNpDjbzi6fz", "Pops Corn", "lonnie@popscorn.com", "3", "321-590-3425",
    ["popscorn.com"],
    [plan(2, "Google Shop+Google Ads+DFW",
      "Google Shopping - $199 + 2% of ad revenue (text ads Brand only)",
      20, "Text ads are Brand only — no revenue % or monthly mgmt fee", 489.79)]),

  client("cus_Ouw9vXPsi6rIp5", "Rag & Bone Bindery", "ilira@ragandbonebindery.com", "3", "208-524-9008",
    ["ragandbonebindery.com"],
    [plan(2, "Google Shop+DFW",
      "Google Shopping - $199 + 2% of ad revenue + $20 DFW",
      20, "Charge DFW. Text ads branded only — no revenue % or mgmt fee", 441.27)]),

  client("cus_PInUMrDJgQWDKt", "NY Spice Shop", "nyspiceshop@gmail.com", "3", "404-344-5221",
    ["nyspiceshop.com"],
    [plan(2, "Google Shop",
      "Google Shopping - $299 + 2% of ad revenue",
      20, null, 801.98)]),

  client("cus_PIpVQvQrcL0N9x", "Gongs Unlimited", "takk@gongs-unlimited.com", "3", "103-105-7748",
    ["gongs-unlimited.com"],
    [plan(2, "Google Shop+Google Ads",
      "Google Shopping + Text Ads - $399 + 2% of ad revenue (NEW 2021)",
      20, "Filter out 'ED | Search | Brand' for text ads but take revenue from rest",
      3960.06)]),

  client("cus_PldCRQBIaCoGiO", "JRG Supply", "challigan@jrgsupply.com", "3", "719-331-3341",
    ["jrgsupply.com"],
    [plan(2, "Google Growth Plan",
      "Google Shopping Management Growth Plan - $650/month + 2% of revenue",
      20, null, 2098.88)]),

  client("cus_PwTdKcMGMbuEIv", "Emma Lou's Boutique", "paul@rushapparel.com", "3", "954-760-2364",
    ["Emma Lous Boutique"],
    [plan(2, "Google Growth Plan",
      "Google Shopping Management Growth Plan - $650/month + 2% of revenue",
      20, null, 1314.22)]),

  client("cus_PO1KaeaHsr0gzb", "Poker Chips", "dcampbell@chipco.com", "3", "765-518-5119",
    ["pokerchips.com"],
    [plan(2, "Google Shop+Google Ads",
      "Google Shopping & Text Ads - $399/month + 2% of ad revenue",
      1, "Filter out 'Custom Poker Chips' for text ads", 399.00)]),

  client("cus_ODTpkZCeWeIqPF", "Bird Supplies", "birdsupplies@gmail.com", "3", "434-220-0150",
    ["birdsupplies.com"],
    [plan(2, "Google Shop",
      "Google Shopping - $299 + 2% of ad revenue",
      20, null, 299.00)]),
];

// ─────────────────────────────────────────────────────────────
// BATCH SUBSCRIPTION — Flat-rate plans ($475 / $399)
// ─────────────────────────────────────────────────────────────
const BATCH_SUBSCRIPTION: ClientRecord[] = [
  client("cus_OmyL3eKyTwAn7O", "accounts@alisonsmontessori.com", "accounts@alisonsmontessori.com", "SUBSCRIPTION", null,
    ["accounts@alisonsmontessori.com"],
    [plan(0, "Google Shopping Starter Plan", "Google Shopping Management Starter Plan - $475/month", 1, "AUTOMATIC", 475.00)]),

  client("cus_HMwHt2FOxWLy8x", "Rings By Lux", "ringsbylux@gmail.com", "SUBSCRIPTION", "836-943-6790",
    ["ringsbylux.com"],
    [plan(0, "Google Shopping Starter Plan", "Google Shopping Management Starter Plan - $475", 8, "AUTOMATIC", 475.00)]),

  client("cus_MBlqclhGkaWbp7", "Skips Garage", "ken@skipsgarage.com", "SUBSCRIPTION", null,
    ["skipsgarage.com"],
    [plan(0, "Amazon Plan", "Amazon Ad Management - $399/month flat rate", 1, "Same Customer ID as Tailgate Pro", 399.00)]),

  client("cus_NHEkhkK5qPmO8o", "High Cotton Ties", "peter@highcottonties.com", "SUBSCRIPTION", "916-153-2155",
    ["highcottonties.com"],
    [plan(0, "Google Shopping Starter Plan", "Google Shopping Management Starter Plan - $475", 8, "Only Google base fee", 475.00)]),

  client("cus_NzutB5xP7tpKlr", "TrackmateGPS", "andrew@creativeavocado.io", "SUBSCRIPTION", null,
    ["trackmategps.com"],
    [plan(0, "Amazon Plan", "Flat monthly rate for Amazon $475", 1, "Not a WIM Group — see Gabriel's email for payment plan", 475.00)]),

  client("cus_OuwrMB5A8wG0Tm", "Pedi Pocket Blanket", "katherin@pedipocketblanket.com", "SUBSCRIPTION", null,
    ["pedipocketblanket.com"],
    [plan(0, "Google Shopping Starter Plan", "Google Shopping Management Starter Plan - $475/month", 8, "AUTOMATIC", 475.00)]),

  client("cus_Oz1JPWE4Uew8XA", "Vital Wise Shop", "business@vitalwiseshop.com", "SUBSCRIPTION", null,
    ["vitalwiseshop.com"],
    [plan(0, "Google Shopping Starter Plan", "Google Shopping Management Starter Plan - $475/month", null, "AUTOMATIC", 475.00)]),

  client("cus_PyNx1GjDB2FRJh", "Bean Goods", "claire@beangoods.com", "SUBSCRIPTION", null,
    ["beangoods.com"],
    [plan(0, "Google Shopping Starter Plan", "Google Shopping Management Starter Plan - $475/month", 7, "AUTOMATIC", 475.00)]),

  // ⚠ Missing from client DB — in April as SUBSCRIPTION $475
  client("cus_Q6Hm4ikzgMKpLU", "slavik@bellaphytologic.com", "slavik@bellaphytologic.com", "SUBSCRIPTION", null,
    ["slavik@bellaphytologic.com"],
    [plan(0, "Google Shopping Starter Plan", "Google Shopping Management Starter Plan - $475/month", 1, "AUTOMATIC — ⚠ missing from client DB, add Stripe ID", 475.00)]),

  client("cus_QhMNKJ23jRrM3E", "angie@bobodesignstudio.com", "angie@bobodesignstudio.com", "SUBSCRIPTION", null,
    ["angie@bobodesignstudio.com"],
    [plan(0, "Google Shopping Starter Plan", "Google Shopping Management Starter Plan - $475/month", 1, "AUTOMATIC", 475.00)]),

  client("cus_Rgkuafb4zbdprf", "abby@vivianlou.com", "abby@vivianlou.com", "SUBSCRIPTION", null,
    ["abby@vivianlou.com"],
    [plan(0, "Google Shopping Starter Plan", "Google Shopping Management Starter Plan - $475/month", 31, "AUTOMATIC", 475.00)]),

  client("cus_SFWU1lLTiWM73N", "gcypher@cypherpickleball.com", "gcypher@cypherpickleball.com", "SUBSCRIPTION", null,
    ["gcypher@cypherpickleball.com"],
    [plan(0, "Google Shopping Starter Plan", "Google Shopping Management Starter Plan - $475/month", 4, "AUTOMATIC", 475.00)]),

  client("cus_SFxQJAm3hkdcEZ", "webstore@laeducativapr.com", "webstore@laeducativapr.com", "SUBSCRIPTION", null,
    ["webstore@laeducativapr.com"],
    [plan(0, "Google Shopping Starter Plan", "Google Shopping Management Starter Plan - $475/month", 4, "AUTOMATIC", 475.00)]),

  client("cus_Sgavq2Eogudl9V", "hill3312@gmail.com", "hill3312@gmail.com", "SUBSCRIPTION", null,
    ["hill3312@gmail.com"],
    [plan(0, "Google Shopping Starter Plan", "Google Shopping Management Starter Plan - $475/month", 15, "AUTOMATIC", 475.00)]),
];

// ─────────────────────────────────────────────────────────────
// BATCH 5 — Setup + Coaching (S+C)
// ─────────────────────────────────────────────────────────────
const BATCH_5: ClientRecord[] = [
  client("cus_L7DrHmiMofn6ws", "Beehive Handmade", "sandra@beehivehandmade.com", "5", null,
    ["beehivehandmade.com"],
    [plan(0, "Coaching", "Google Shopping Setup + Coaching - Monthly Fee $299", 7, null, 299.00)]),

  // April expected $598 vs billing_details $299 — likely 2 service components; verify
  client("cus_LS8xakJItjgXhd", "Sugarbee Clothing", "hello@sugarbeeclothing.com", "5", null,
    ["sugarbeeclothing.com"],
    [plan(0, "Coaching",
      "Google Shopping Setup + Coaching - Monthly Fee $299 (billed $598 Apr 2026 — ⚠ verify split)",
      6, null, 598.00)]),

  client("cus_Mql0N9LiRyQDMW", "Jewelry by Bretta", "bretta@jewelrybybretta.com", "5", null,
    ["jewelrybybretta.com"],
    [plan(0, "Coaching",
      "Google Shopping Setup + Coaching - Monthly Fee $299 (billed $598 Apr 2026 — ⚠ verify split)",
      28, null, 598.00)]),
];

// ─────────────────────────────────────────────────────────────
// CONSULTING — Custom / ad-hoc billing
// ─────────────────────────────────────────────────────────────
const CONSULTING: ClientRecord[] = [
  client("cus_Q14kHfVtV7mClW", "sgilly@trility.net", "sgilly@trility.net", "Consulting", null,
    ["sgilly@trility.net"],
    [plan(0, "Advanced Accounts - Custom Pricing", "Custom. Billed by Gabriel",
      1, null, 9900.00, { projection_type: "LAST_PERIOD" })]),

  client("cus_SGRkJV1CrZMq0b", "tiradoalejandra.18@gmail.com", "tiradoalejandra.18@gmail.com", "Consulting", null,
    ["tiradoalejandra.18@gmail.com"],
    [plan(0, "Social Media Plan", "Social Media Management — variable monthly",
      4, null, 1130.00, { projection_type: "LAST_PERIOD" })]),

  // ⚠ New client April 2026 — paying via Stripe, not yet in client DB
  client("cus_RyRxOBvhJBvNpE", "ppucheu@pbm-solutions.com", "ppucheu@pbm-solutions.com", "Consulting", null,
    ["ppucheu@pbm-solutions.com"],
    [plan(0, "Advanced Accounts - Custom Pricing",
      "Custom consulting — variable (⚠ missing from client DB, add record)",
      null, null, 3550.00, { projection_type: "LAST_PERIOD",
        effective_from: "2026-04-01" })],
    { start_date: "2026-04-01" }),

  // richie — new client April 2026 — $3,500 onboarding fee; standard retainer $1,500/month
  client("cus_UJPVLKVt2c4Oh3", "richie@natcodb.com", "richie@natcodb.com", "Consulting", null,
    ["richie@natcodb.com"],
    [plan(0, "Advanced Accounts - Custom Pricing",
      "Custom retainer — $1,500/month (April 2026 had $3,500 setup fee — one-time)",
      2, "⚠ April: AR $1,500 vs Stripe $3,500 — likely onboarding fee. Verify with Gabriel.",
      1500.00, { projection_type: "MANUAL", manual_overrides: { "2026-04": 3500 },
        effective_from: "2026-04-01" })],
    { start_date: "2026-04-01" }),

  // margaret — no Stripe ID yet
  client(null, "margaret@lblegalnurses.com", "margaret@lblegalnurses.com", "Consulting", null,
    ["margaret@lblegalnurses.com"],
    [plan(0, "Advanced Accounts - Custom Pricing",
      "Custom — no Stripe ID, manual invoice (⚠ add Stripe ID to billing sheet)",
      2, null, 1500.00, { projection_type: "LAST_PERIOD" })]),

  client("cus_THezY3L1GTPWXk", "eduardo@caribbeanrealty.com", "eduardo@caribbeanrealty.com", "Consulting", null,
    ["eduardo@caribbeanrealty.com"],
    [plan(0, "Advanced Accounts - Custom Pricing", "Fix Fee $800/month",
      22, null, 800.00, { projection_type: "FIXED" })]),

  client("cus_UEAMptExozOqFW", "mateo@usframefactory.com", "mateo@usframefactory.com", "Consulting", null,
    ["mateo@usframefactory.com"],
    [plan(0, "Advanced Accounts - Custom Pricing", "Custom — amount TBD",
      27, null, null, { projection_type: "LAST_PERIOD" })]),
];

// ─────────────────────────────────────────────────────────────
// MULTIPLE — One Stripe ID billing multiple sub-accounts
// ─────────────────────────────────────────────────────────────
const MULTIPLE: ClientRecord[] = [
  client("cus_MAQFq6FlG4sGc3", "Real Estate Posts / Hall Signs", "mkeleher@proveli.com", "Multiple", null,
    ["realestateposts.com", "addressesofdistinction.com", "hallsigns.com"],
    [plan(2, "Google Shop+Google Ads+BING",
      "$399 flat (REP) + $399 + 2% revenue (Hall Signs) + $399 + 2% (AOD)",
      1, "3 sub-accounts on one invoice — Real Estate Posts, Addresses of Distinction, Hall Signs",
      1391.64)]),

  client("cus_OinjM3GcjQrwhs", "Cheap Dealer Supplies", "brandon@seibertventures.com", "Multiple", "152-908-0367",
    ["cheapdealersupplies.com", "cheapdealersupplies.com (Amazon)"],
    [plan(2, "Google Shop+DFW + Amazon Plan",
      "Google Shopping - $299 + 2% revenue + $20 DFW + Amazon $475/month",
      20, "Add $20 DFW — no charge for text ads", 1082.17)]),
];

// ─────────────────────────────────────────────────────────────
// Canonical export — 53 unique client records
// ─────────────────────────────────────────────────────────────
export const clientDatabase: ClientRecord[] = [
  ...BATCH_1,
  ...BATCH_2,
  ...BATCH_3,
  ...BATCH_SUBSCRIPTION,
  ...BATCH_5,
  ...CONSULTING,
  ...MULTIPLE,
];

/** Lookup by stripe_id (null-safe — returns null-stripe_id record for no-Stripe clients) */
export function findClient(stripeId: string | null): ClientRecord | undefined {
  if (!stripeId) return clientDatabase.find((c) => c.stripe_id === null);
  return clientDatabase.find((c) => c.stripe_id === stripeId);
}
