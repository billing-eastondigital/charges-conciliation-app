// ============================================================
// Budget computation engine — pure functions, no side effects
//
// Key design: billing plan changes are temporal.
// For each client × month, the engine resolves which billing plan was
// active that month (effective_from <= month < effective_to) and uses
// THAT plan's projection rules — so historical projections stay accurate
// even after a client switches plans.
//
// Phase 1: runs against mock data (lib/mock/budget-2026.ts)
// Phase 2: same functions called server-side with Supabase data
// ============================================================

import type {
  ClientProjectionRule,
  ClientBillingPlan,
  ClientBudgetRow,
  BudgetMonthData,
  ProjectionType,
} from "./types";

// ── Plan resolution ────────────────────────────────────────────────────────

/**
 * Returns the billing plan active on the first day of `monthKey` ("YYYY-MM").
 * A plan is active when effective_from <= target < effective_to
 * (or effective_to IS NULL for the currently open plan).
 */
export function getActivePlan(
  plans: ClientBillingPlan[],
  monthKey: string,
): ClientBillingPlan | null {
  const target = monthKey + "-01"; // "2026-04" → "2026-04-01"
  const active = plans.filter(
    (p) =>
      p.effective_from <= target &&
      (p.effective_to === null || p.effective_to > target),
  );
  // If somehow two plans overlap (data error), prefer the most recent
  return active.sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0] ?? null;
}

/** Returns the currently active plan (effective_to IS NULL), or the most recent. */
export function getCurrentPlan(plans: ClientBillingPlan[]): ClientBillingPlan | null {
  const open = plans.find((p) => p.effective_to === null);
  if (open) return open;
  return plans.sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0] ?? null;
}

// ── Projection computation ─────────────────────────────────────────────────

/**
 * Compute the projected amount for one client in one month.
 * Returns null when the client has churned (deactivated_month reached)
 * or when no billing plan was active that month.
 */
function computeProjected(
  client: ClientProjectionRule,
  monthKey: string,
  historicalActuals: Record<string, number>, // monthKey -> actual collected for this client
): number | null {
  // Churned: projection stops
  if (client.deactivated_month && monthKey >= client.deactivated_month) return null;

  const plan = getActivePlan(client.billing_plans, monthKey);
  if (!plan) return null; // no plan active this month (e.g. client not yet onboarded)

  switch (plan.projection_type) {
    case "FIXED":
      return plan.projection_amount ?? 0;

    case "LAST_PERIOD": {
      const prior = Object.entries(historicalActuals)
        .filter(([k]) => k < monthKey)
        .sort(([a], [b]) => b.localeCompare(a));
      return prior[0]?.[1] ?? plan.projection_amount ?? 0;
    }

    case "ROLLING_3": {
      const vals = Object.entries(historicalActuals)
        .filter(([k]) => k < monthKey)
        .sort(([a], [b]) => b.localeCompare(a))
        .slice(0, 3)
        .map(([, v]) => v);
      if (!vals.length) return plan.projection_amount ?? 0;
      return vals.reduce((s, v) => s + v, 0) / vals.length;
    }

    case "ROLLING_6": {
      const vals = Object.entries(historicalActuals)
        .filter(([k]) => k < monthKey)
        .sort(([a], [b]) => b.localeCompare(a))
        .slice(0, 6)
        .map(([, v]) => v);
      if (!vals.length) return plan.projection_amount ?? 0;
      return vals.reduce((s, v) => s + v, 0) / vals.length;
    }

    case "MANUAL":
      return plan.manual_overrides?.[monthKey] ?? plan.projection_amount ?? 0;
  }
}

// ── Row builder ────────────────────────────────────────────────────────────

/**
 * Build the full budget row for every client.
 *
 * @param clients     Projection rules per client (from DB in Phase 2)
 * @param actuals     stripe_id → monthKey → actual collected amount
 * @param months      Ordered month list for the year
 * @param ytdCutoff   Last month included in YTD totals ("2026-04")
 */
export function buildBudgetRows(
  clients: ClientProjectionRule[],
  actuals: Record<string, Record<string, number>>,
  months: Array<{ key: string; short: string }>,
  ytdCutoff: string,
): ClientBudgetRow[] {
  return clients.map((client) => {
    const clientActuals = actuals[client.stripe_id] ?? {};

    const monthData: BudgetMonthData[] = months.map(({ key, short }) => {
      const projected = computeProjected(client, key, clientActuals);
      const actual    = clientActuals[key] ?? null;
      const delta     = actual !== null && projected !== null ? actual - projected : null;
      return { month_key: key, month_short: short, projected, actual, delta };
    });

    const ytdMonths = monthData.filter((m) => m.month_key <= ytdCutoff);

    const ytd_projected      = ytdMonths.reduce((s, m) => s + (m.projected ?? 0), 0);
    const ytd_actual         = ytdMonths.filter((m) => m.actual !== null).reduce((s, m) => s + (m.actual ?? 0), 0);
    const ytd_delta          = ytdMonths.filter((m) => m.delta !== null).reduce((s, m) => s + (m.delta ?? 0), 0);
    const full_year_projected = monthData.reduce((s, m) => s + (m.projected ?? 0), 0);

    const currentPlan = getCurrentPlan(client.billing_plans);

    return {
      stripe_id:             client.stripe_id,
      display_name:          client.display_name,
      primary_email:         client.primary_email,
      batch:                 client.batch,
      is_active:             client.is_active,
      active_projection_type: currentPlan?.projection_type ?? null,
      plan_count:            client.billing_plans.length,
      months:                monthData,
      ytd_projected,
      ytd_actual,
      ytd_delta,
      full_year_projected,
    };
  });
}
