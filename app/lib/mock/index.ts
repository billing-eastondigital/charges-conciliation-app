export { april2026Results, april2026Kpis, april2026FailedCharges } from "./april-2026";
export { april2026Exceptions } from "./exceptions";
export { monthly2026, kpis2026 } from "./annual-2026";
export { clientRules2026 } from "./clients";
export { clientDatabase, findClient } from "./client-database";
export { budget2026, budgetKpis2026, BUDGET_MONTHS_2026, BUDGET_YTD_CUTOFF_2026 } from "./budget-2026";

export const CURRENT_PERIOD = "April 2026";
export const CURRENT_YEAR   = 2026;

export const PERIODS = [
  { period_label: "January 2026",  start_date: "2026-01-01", end_date: "2026-01-31", closed: true  },
  { period_label: "February 2026", start_date: "2026-02-01", end_date: "2026-02-28", closed: true  },
  { period_label: "March 2026",    start_date: "2026-03-01", end_date: "2026-03-31", closed: true  },
  { period_label: "April 2026",    start_date: "2026-04-01", end_date: "2026-04-30", closed: false },
];
