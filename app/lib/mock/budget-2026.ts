// ============================================================
// Budget 2026 — computed from client rules + April actuals
//
// Actuals available per client: April 2026 only (from reconciliation).
// Jan–Mar: per-client actuals not yet loaded → shown as projection only.
// May–Dec: projected only.
//
// When Phase 2 (Supabase) is wired, replace this with a server-side
// call to buildBudgetRows(clients, actuals from DB, months, ytdCutoff).
// ============================================================

import { clientRules2026 } from "./clients";
import { april2026Results } from "./april-2026";
import { buildBudgetRows } from "../budget";
import type { ClientBudgetRow } from "../types";

export const BUDGET_MONTHS_2026 = [
  { key: "2026-01", short: "Jan" },
  { key: "2026-02", short: "Feb" },
  { key: "2026-03", short: "Mar" },
  { key: "2026-04", short: "Apr" },
  { key: "2026-05", short: "May" },
  { key: "2026-06", short: "Jun" },
  { key: "2026-07", short: "Jul" },
  { key: "2026-08", short: "Aug" },
  { key: "2026-09", short: "Sep" },
  { key: "2026-10", short: "Oct" },
  { key: "2026-11", short: "Nov" },
  { key: "2026-12", short: "Dec" },
] as const;

// Build actuals map: stripe_id → { "2026-04": collected }
// Only April 2026 has per-client reconciliation data in Phase 1.
const actuals2026: Record<string, Record<string, number>> = {};
for (const r of april2026Results) {
  const id = r.stripe_id; // may be "" for margaret
  if (!actuals2026[id]) actuals2026[id] = {};
  actuals2026[id]["2026-04"] = parseFloat(r.collected_amount);
}

// YTD through April (last reconciled period)
export const BUDGET_YTD_CUTOFF_2026 = "2026-04";

export const budget2026: ClientBudgetRow[] = buildBudgetRows(
  clientRules2026,
  actuals2026,
  [...BUDGET_MONTHS_2026],
  BUDGET_YTD_CUTOFF_2026,
);

// ── Aggregate KPIs ──────────────────────────────────────────
function sumRows(rows: ClientBudgetRow[], field: keyof ClientBudgetRow): number {
  return rows.reduce((s, r) => s + (r[field] as number), 0);
}

export const budgetKpis2026 = {
  full_year_projected: sumRows(budget2026, "full_year_projected"),
  ytd_projected:       sumRows(budget2026, "ytd_projected"),
  ytd_actual:          sumRows(budget2026, "ytd_actual"),
  ytd_delta:           sumRows(budget2026, "ytd_delta"),
  active_clients:      budget2026.filter((r) => r.is_active).length,
  churned_clients:     budget2026.filter((r) => !r.is_active).length,
  // MRR = sum of May projected (next open month)
  next_month_projected: budget2026.reduce(
    (s, r) => s + (r.months.find((m) => m.month_key === "2026-05")?.projected ?? 0),
    0,
  ),
};
