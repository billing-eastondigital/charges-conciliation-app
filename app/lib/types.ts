// ============================================================
// Core domain types — define here first, implement DB queries second
// All types must match the Supabase schema (supabase/CLAUDE.md)
// ============================================================

export type ReconciliationStatus =
  | "MATCH"
  | "UNDERPAID"
  | "OVERPAID"
  | "FAILED_HARD"
  | "MISSING_PAYMENT"
  | "REFUNDED"
  | "STRIPE_ONLY";

export type AccountStatus = "ACTIVE" | "LOST" | "INACTIVE";

export type BillingMethod = "AD_SPEND" | "SUBSCRIPTION" | "ADS_REVENUE" | "ADS_COST";

export type ExceptionStatus = "OPEN" | "RESOLVED" | "WONT_FIX";

// ------------------------------------------------------------
// Periods
// ------------------------------------------------------------
export interface Period {
  period_label: string; // e.g. "April 2026"
  start_date: string;   // ISO 8601
  end_date: string;     // ISO 8601
  closed: boolean;
}

// ------------------------------------------------------------
// Clients
// ------------------------------------------------------------

/** Simplified client record (legacy — prefer ClientRecord) */
export interface Client {
  stripe_id: string;         // cus_…
  display_name: string;
  primary_email: string;
  is_active: boolean;
  account_status: AccountStatus;
}

/**
 * One billing plan period for a client.
 * Mirrors the `client_billing_plans` table (supabase/migrations/0002_billing_plans.sql).
 *
 * A client can have multiple plans over time but only ONE is active at any
 * given date: the one where effective_from <= date < effective_to (or
 * effective_to IS NULL for the currently active plan).
 *
 * The projection rule (type + amount) is stored per-plan so that if a client
 * switches from a flat-rate plan to a percentage plan, historical budget
 * projections stay accurate.
 */
export interface ClientBillingPlan {
  billing_plan: string;            // e.g. "Google Shopping Starter Plan"
  billing_details: string | null;  // full pricing description
  /** How the expected charge is produced each period */
  billing_method: BillingMethod;
  billing_pct: number;             // legacy 2dp field — use billing_percentage instead
  billing_percentage?: number;     // canonical 4dp percentage (0.02 = 2%)
  billing_day: number | null;      // day of month for invoicing (1–31)
  notes: string | null;
  projection_type: ProjectionType;
  projection_amount: number | null;
  /** "YYYY-MM" -> amount overrides (MANUAL type) */
  manual_overrides: Record<string, number>;
  /** ISO date "YYYY-MM-DD" — when this plan takes effect */
  effective_from: string;
  /** ISO date "YYYY-MM-DD" — when this plan ends (null = currently active) */
  effective_to: string | null;
}

/**
 * Full client database record.
 * Mirrors the `clients` + `client_billing_plans` tables.
 * billing_plans is ordered ascending by effective_from.
 */
export interface ClientRecord {
  id: string;                 // internal UUID PK — always present
  stripe_id: string | null;   // cus_… — null for non-Stripe clients
  display_name: string;
  primary_email: string;
  account_status: AccountStatus;
  /** Billing batch from the AR sheet — stored per client for grouping */
  batch: BatchLabel;
  google_id: string | null;   // internal Google Ads account ID
  /** All sub-account names billed under this stripe_id */
  accounts: string[];
  is_active: boolean;
  /** "YYYY-MM" — projection stops at this month when client churns */
  deactivated_month: string | null;
  start_date: string | null;
  end_date: string | null;
  /** Full billing plan history, ordered by effective_from ASC */
  billing_plans: ClientBillingPlan[];
}

// ------------------------------------------------------------
// Reconciliation results (grain: period + stripe_id)
// ------------------------------------------------------------
export type BatchLabel = "1" | "2" | "3" | "SUBSCRIPTION" | "5" | "Consulting" | "Multiple" | "—";

export interface ReconciliationResult {
  id: number;
  period_label: string;
  stripe_id: string;
  display_name: string;       // joined from clients
  primary_email: string;
  expected_amount: string;    // numeric string — never JS number
  collected_amount: string;   // numeric string
  variance: string;           // collected - expected
  status: ReconciliationStatus;
  batch: BatchLabel;          // billing batch from AR sheet
  constituent_accounts: string[]; // account names merged under this cus_id
  account_status?: AccountStatus | null;
  exception_resolution?: "OPEN" | "RESOLVED" | "WONT_FIX" | "ESCALATED" | null;
}

// ------------------------------------------------------------
// Expected charges (AR lines — drill-down grain)
// ------------------------------------------------------------
export interface ExpectedCharge {
  id: number;
  period_label: string;
  stripe_id: string;
  account_name: string;
  plan: string;
  total_to_bill: string;      // numeric string, 4dp
  memo: string | null;
}

// ------------------------------------------------------------
// Stripe charges
// ------------------------------------------------------------
export interface StripeCharge {
  charge_id: string;          // ch_… or py_…
  period_label: string;
  stripe_id: string;          // cus_…
  amount: string;             // numeric string, 2dp
  amount_refunded: string;
  status: "Paid" | "Failed" | "Refunded";
  decline_reason: string | null;
  customer_email: string;
  invoice_id: string | null;
  created_at: string;         // ISO 8601
}

// ------------------------------------------------------------
// Exceptions
// ------------------------------------------------------------
export interface Exception {
  id: number;
  period_label: string;
  stripe_id: string | null;
  display_name: string;
  status: ExceptionStatus;
  reconciliation_status: ReconciliationStatus;
  variance: string;
  notes: string | null;
  assigned_to: string | null;
  created_at: string;
  resolved_at: string | null;
}

// ------------------------------------------------------------
// Budget / Projection
// ------------------------------------------------------------
export type ProjectionType = "FIXED" | "LAST_PERIOD" | "ROLLING_3" | "ROLLING_6" | "MANUAL";

export interface ClientProjectionRule {
  stripe_id: string;
  display_name: string;
  primary_email: string;
  batch: BatchLabel;
  is_active: boolean;
  /** "YYYY-MM" — projection goes null from this month onward (client churned) */
  deactivated_month: string | null;
  /** Full billing plan history — engine picks the active plan per month */
  billing_plans: ClientBillingPlan[];
}

export interface BudgetMonthData {
  month_key: string;    // "2026-04"
  month_short: string;  // "Apr"
  projected: number | null; // null = client churned this month
  actual: number | null;    // null = not yet reconciled
  delta: number | null;     // actual - projected (null if either is missing)
}

export interface ClientBudgetRow {
  stripe_id: string;
  display_name: string;
  primary_email: string;
  batch: BatchLabel;
  is_active: boolean;
  /** Projection type of the currently active billing plan (for display) */
  active_projection_type: ProjectionType | null;
  /** Number of distinct billing plans this client has had */
  plan_count: number;
  months: BudgetMonthData[];
  ytd_projected: number;
  ytd_actual: number;
  ytd_delta: number;
  full_year_projected: number;
}

// ------------------------------------------------------------
// Raw billing rows (AR Excel sheet — one row per account)
// ------------------------------------------------------------
/** Mirrors the billing spreadsheet columns exactly.
 *  One row per Account Name entry in the AR workbook.
 *  google_shopping_charge = "Amount to charge based on %" for Shopping,
 *  google_search_charge   = "Amount to charge based on %" for Search/Display,
 *  bing_charge            = "Amount to charge based on %" for BING.
 */
export interface BillingRow {
  id: number;
  account_name: string;
  batch: string;
  stripe_id: string | null;
  google_id: string | null;
  account_status: string;
  billing_year: number | null;
  billing_day: number | null;
  billing_month: string | null;
  dates_from: string | null;
  date_to: string | null;
  plan: string | null;
  monthly_billing_plan: string | null;
  billing_formula: string | null;
  notes: string | null;
  google_revenue_pct: string | null;
  coaching_flat_fee: string | null;
  base_fee_amazon: string | null;
  base_fee_google: string | null;
  google_growth_plan: string | null;
  projected_conversion_value: string | null;
  google_shopping_revenue: string | null;
  google_shopping_total: string | null;
  /** Amount to charge based on % — Google Shopping */
  google_shopping_charge: string | null;
  google_search_display: string | null;
  /** Amount to charge based on % — Google Search/Display */
  google_search_charge: string | null;
  bing_revenue: string | null;
  /** Amount to charge based on % — BING */
  bing_charge: string | null;
  others_dfw: string | null;
  total_to_bill: string;
  item_1: string | null;
  item_1_amount: string | null;
  item_2: string | null;
  item_2_amount: string | null;
  item_3: string | null;
  item_3_amount: string | null;
  item_4: string | null;
  item_4_amount: string | null;
  item_5: string | null;
  item_5_amount: string | null;
  memo: string | null;
  invoice_link: string | null;
}

// ------------------------------------------------------------
// Period KPIs (derived — used by KpiStrip)
// ------------------------------------------------------------
export interface PeriodKpis {
  period_label: string;
  total_expected: string;
  total_collected: string;
  total_variance: string;
  match_count: number;
  exception_count: number;
  failed_hard_count: number;
  missing_count: number;
  overpaid_count: number;
  client_count: number;
}
