import { createClient } from "@/lib/supabase/server";
import { PlanManagerTable } from "./_components/PlanManagerTable";
import { addPlan, updatePlan, changePlan } from "./actions";
import type { ClientRecord } from "@/lib/types";

export default async function AdminPeriodsPage() {
  const supabase = await createClient();

  const { data: rows } = await supabase
    .from("clients")
    .select("*, client_billing_plans(*)")
    .order("display_name");

  const clients: ClientRecord[] = (rows ?? []).map((c) => ({
    stripe_id:        c.stripe_id ?? null,
    display_name:     c.display_name,
    primary_email:    c.primary_email,
    account_status:   c.account_status as ClientRecord["account_status"],
    batch:            (c.batch ?? "—") as ClientRecord["batch"],
    google_id:        c.google_id ?? null,
    accounts:         c.accounts ?? [],
    is_active:        c.is_active,
    deactivated_month: c.deactivated_month ?? null,
    start_date:       c.start_date ?? null,
    end_date:         c.end_date ?? null,
    billing_plans: (c.client_billing_plans ?? [])
      .sort((a: { effective_from: string }, b: { effective_from: string }) =>
        a.effective_from.localeCompare(b.effective_from))
      .map((p: {
        billing_plan: string; billing_details: string | null; billing_method: string | null;
        billing_pct: number; billing_day: number | null; notes: string | null;
        projection_type: string; projection_amount: number | null;
        manual_overrides: Record<string, number>;
        effective_from: string; effective_to: string | null;
      }) => ({
        billing_plan:      p.billing_plan,
        billing_details:   p.billing_details ?? null,
        billing_method:    (p.billing_method ?? "AD_SPEND") as ClientRecord["billing_plans"][number]["billing_method"],
        billing_pct:       p.billing_pct,
        billing_day:       p.billing_day ?? null,
        notes:             p.notes ?? null,
        projection_type:   p.projection_type as ClientRecord["billing_plans"][number]["projection_type"],
        projection_amount: p.projection_amount ?? null,
        manual_overrides:  p.manual_overrides ?? {},
        effective_from:    p.effective_from,
        effective_to:      p.effective_to ?? null,
      })),
  }));

  return (
    <div className="px-6 py-6 space-y-5 max-w-[1480px]">
      <div>
        <h1 className="text-2xl font-semibold text-[#3a3a3a]">Plan Management</h1>
        <p className="text-sm text-[#6b7280] mt-0.5">
          View and update billing plans for all clients.
        </p>
      </div>
      <PlanManagerTable
        initialClients={clients}
        addPlan={addPlan}
        updatePlan={updatePlan}
        changePlan={changePlan}
      />
    </div>
  );
}
