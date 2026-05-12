import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buildBudgetRows } from "@/lib/budget";
import type { ClientProjectionRule, ClientBillingPlan, BatchLabel, ProjectionType } from "@/lib/types";
import { BudgetKpiStrip } from "./_components/BudgetKpiStrip";
import { BudgetTable } from "./_components/BudgetTable";

const BUDGET_MONTHS_2026 = [
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
];

const PERIOD_TO_MONTH: Record<string, string> = {
  "January 2026":  "2026-01",
  "February 2026": "2026-02",
  "March 2026":    "2026-03",
  "April 2026":    "2026-04",
};

const YTD_CUTOFF = "2026-04";
const NEXT_MONTH = "2026-05";

interface BudgetPageProps {
  params: Promise<{ year: string }>;
}

export default async function BudgetPage({ params }: BudgetPageProps) {
  const { year } = await params;
  const yearNum = parseInt(year, 10);
  if (yearNum !== 2026) notFound();

  const supabase = await createClient();

  // Fetch clients with their billing plans + reconciliation actuals in parallel
  const [{ data: clientRows }, { data: reconRows }] = await Promise.all([
    supabase
      .from("clients")
      .select("id, stripe_id, display_name, primary_email, batch, is_active, deactivated_month, client_billing_plans(billing_plan, billing_details, billing_pct, billing_day, notes, projection_type, projection_amount, manual_overrides, effective_from, effective_to)")
      .order("display_name"),
    supabase
      .from("reconciliation_results")
      .select("stripe_id, period_label, collected_amount")
      .in("period_label", Object.keys(PERIOD_TO_MONTH)),
  ]);

  // Build actuals map: stripe_id → { "2026-04": amount }
  const actuals: Record<string, Record<string, number>> = {};
  for (const row of reconRows ?? []) {
    const monthKey = PERIOD_TO_MONTH[row.period_label];
    if (!monthKey || !row.stripe_id) continue;
    if (!actuals[row.stripe_id]) actuals[row.stripe_id] = {};
    actuals[row.stripe_id][monthKey] = parseFloat(String(row.collected_amount ?? "0"));
  }

  // Build ClientProjectionRule[] from DB rows
  const clients: ClientProjectionRule[] = (clientRows ?? [])
    .filter((c) => c.stripe_id) // skip clients without a Stripe ID
    .map((c) => ({
      stripe_id:         c.stripe_id!,
      display_name:      c.display_name,
      primary_email:     c.primary_email,
      batch:             (c.batch ?? "—") as BatchLabel,
      is_active:         c.is_active,
      deactivated_month: c.deactivated_month ?? null,
      billing_plans: ((c.client_billing_plans as unknown[]) ?? []).map((p: unknown) => {
        const plan = p as Record<string, unknown>;
        return {
          billing_plan:       String(plan.billing_plan ?? ""),
          billing_details:    plan.billing_details ? String(plan.billing_details) : null,
          billing_pct:        Number(plan.billing_pct ?? 0),
          billing_day:        plan.billing_day ? Number(plan.billing_day) : null,
          notes:              plan.notes ? String(plan.notes) : null,
          projection_type:    String(plan.projection_type ?? "FIXED") as ProjectionType,
          projection_amount:  plan.projection_amount != null ? Number(plan.projection_amount) : null,
          manual_overrides:   (plan.manual_overrides as Record<string, number>) ?? {},
          effective_from:     String(plan.effective_from ?? ""),
          effective_to:       plan.effective_to ? String(plan.effective_to) : null,
        } satisfies ClientBillingPlan;
      }),
    }));

  const budgetRows = buildBudgetRows(clients, actuals, BUDGET_MONTHS_2026, YTD_CUTOFF);

  // Aggregate KPIs
  const sum = (field: "ytd_projected" | "ytd_actual" | "ytd_delta" | "full_year_projected") =>
    budgetRows.reduce((s, r) => s + r[field], 0);

  const kpis = {
    full_year_projected:  sum("full_year_projected"),
    ytd_projected:        sum("ytd_projected"),
    ytd_actual:           sum("ytd_actual"),
    ytd_delta:            sum("ytd_delta"),
    active_clients:       budgetRows.filter((r) => r.is_active).length,
    churned_clients:      budgetRows.filter((r) => !r.is_active).length,
    next_month_projected: budgetRows.reduce(
      (s, r) => s + (r.months.find((m) => m.month_key === NEXT_MONTH)?.projected ?? 0),
      0,
    ),
  };

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div>
        <h1 className="text-xl font-semibold text-[#3a3a3a]">{yearNum} Budget — Projected vs Actual</h1>
        <p className="text-sm text-[#6b7280] mt-0.5">
          Per-client monthly projection with real collected amounts. Highlighted columns = actual data loaded.
          Projections use per-client rules defined in the client database.
        </p>
      </div>

      <BudgetKpiStrip kpis={kpis} year={yearNum} />

      <BudgetTable
        rows={budgetRows}
        months={[...BUDGET_MONTHS_2026]}
        ytdCutoff={YTD_CUTOFF}
      />
    </div>
  );
}
