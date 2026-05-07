// ============================================================
// Mock data — 2026 YTD annual view
// Stripe collected figures: real (from data/stripe_2026_ytd.csv)
// Expected figures: Jan–Mar estimated (no AR sheet available for those months yet)
// April expected: from data/billing_april_2026.xlsx
// ============================================================

export interface MonthlyAggregate {
  period_label: string;
  month_short: string;      // "Jan", "Feb", etc.
  expected: number;
  collected: number;
  variance: number;
  match_count: number;
  exception_count: number;
  client_count: number;
  closed: boolean;
}

export const monthly2026: MonthlyAggregate[] = [
  {
    period_label:    "January 2026",
    month_short:     "Jan",
    expected:        80_950.00,   // estimated — AR sheet pending
    collected:       81_907.73,   // real Stripe data
    variance:        957.73,
    match_count:     44,
    exception_count: 4,
    client_count:    48,
    closed:          true,
  },
  {
    period_label:    "February 2026",
    month_short:     "Feb",
    expected:        53_800.00,   // estimated — AR sheet pending
    collected:       52_959.90,   // real Stripe data
    variance:        -840.10,
    match_count:     38,
    exception_count: 4,
    client_count:    42,
    closed:          true,
  },
  {
    period_label:    "March 2026",
    month_short:     "Mar",
    expected:        61_100.00,   // estimated — AR sheet pending
    collected:       61_510.24,   // real Stripe data
    variance:        410.24,
    match_count:     37,
    exception_count: 4,
    client_count:    41,
    closed:          true,
  },
  {
    period_label:    "April 2026",
    month_short:     "Apr",
    expected:        59_743.53,   // real — from billing_april_2026.xlsx
    collected:       59_962.36,   // real Stripe data
    variance:        218.83,
    match_count:     35,
    exception_count: 10,
    client_count:    45,
    closed:          false,
  },
];

export interface AnnualKpis {
  year: number;
  total_expected: number;
  total_collected: number;
  total_variance: number;
  avg_monthly_collected: number;
  best_month: string;
  worst_month: string;
  closed_months: number;
  open_months: number;
}

export const kpis2026: AnnualKpis = {
  year:                   2026,
  total_expected:         monthly2026.reduce((s, m) => s + m.expected, 0),
  total_collected:        monthly2026.reduce((s, m) => s + m.collected, 0),
  total_variance:         monthly2026.reduce((s, m) => s + m.variance, 0),
  avg_monthly_collected:  monthly2026.reduce((s, m) => s + m.collected, 0) / monthly2026.length,
  best_month:             "January 2026",
  worst_month:            "February 2026",
  closed_months:          monthly2026.filter((m) => m.closed).length,
  open_months:            monthly2026.filter((m) => !m.closed).length,
};
