import { createClient } from "@/lib/supabase/server";
import ClientsPageClient from "./_components/ClientsPageClient";
import type { ClientRecord, Period } from "@/lib/types";

export default async function ClientsPage() {
  const supabase = await createClient();

  const [{ data: rows }, { data: periodsRows }, { data: reconAgg }] = await Promise.all([
    supabase.from("clients").select("*, client_billing_plans(*)").order("display_name"),
    supabase.from("periods").select("period_label, start_date, end_date, is_closed").order("start_date"),
    supabase.from("reconciliation_results").select("period_label, id"),
  ]);

  const clients: ClientRecord[] = (rows ?? []).map((c) => ({
    id:                c.id as string,
    stripe_id:         c.stripe_id ?? null,
    display_name:      c.display_name,
    primary_email:     c.primary_email,
    account_status:    c.account_status as ClientRecord["account_status"],
    batch:             (c.batch ?? "—") as ClientRecord["batch"],
    google_id:         c.google_id ?? null,
    accounts:          c.accounts ?? [],
    is_active:         c.is_active,
    deactivated_month: c.deactivated_month ?? null,
    start_date:        c.start_date ?? null,
    end_date:          c.end_date ?? null,
    billing_plans: (c.client_billing_plans ?? [])
      .sort((a: { effective_from: string }, b: { effective_from: string }) =>
        a.effective_from.localeCompare(b.effective_from))
      .map((p: {
        billing_plan: string; billing_details: string | null; billing_method: string | null;
        billing_pct: number; billing_percentage: number | null; billing_day: number | null;
        notes: string | null; projection_type: string; projection_amount: number | null;
        manual_overrides: Record<string, number>; effective_from: string; effective_to: string | null;
      }) => ({
        billing_plan:       p.billing_plan,
        billing_details:    p.billing_details ?? null,
        billing_method:     (p.billing_method ?? "AD_SPEND") as ClientRecord["billing_plans"][number]["billing_method"],
        billing_pct:        parseFloat(String(p.billing_pct)),
        billing_percentage: p.billing_percentage != null ? parseFloat(String(p.billing_percentage)) : 0,
        billing_day:        p.billing_day ?? null,
        notes:              p.notes ?? null,
        projection_type:    p.projection_type as ClientRecord["billing_plans"][number]["projection_type"],
        projection_amount:  p.projection_amount != null ? parseFloat(String(p.projection_amount)) : null,
        manual_overrides:   p.manual_overrides ?? {},
        effective_from:     p.effective_from,
        effective_to:       p.effective_to ?? null,
      })),
  }));

  const periods: Period[] = (periodsRows ?? []).map((p) => ({
    period_label: p.period_label,
    start_date:   p.start_date,
    end_date:     p.end_date,
    closed:       p.is_closed,
  }));

  // client_count per period from reconciliation_results
  const periodClientCounts: Record<string, number> = {};
  for (const r of reconAgg ?? []) {
    periodClientCounts[r.period_label] = (periodClientCounts[r.period_label] ?? 0) + 1;
  }

  return <ClientsPageClient initialClients={clients} periods={periods} periodClientCounts={periodClientCounts} />;
}
