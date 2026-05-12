import { createClient } from "@/lib/supabase/server";
import { KpiStrip } from "./_components/KpiStrip";
import { ReconTable } from "./_components/ReconTable";
import { PeriodSelector } from "./_components/PeriodSelector";
import { ClientLifecycleSection } from "./_components/ClientLifecycleSection";
import { MoMDeltaSection } from "./_components/MoMDeltaSection";
import { aprilMoMBridge } from "@/lib/mock";
import type { ReconciliationResult, PeriodKpis, Period, ClientRecord } from "@/lib/types";

interface Props {
  params: Promise<{ label: string }>;
}

export default async function PeriodPage({ params }: Props) {
  const { label } = await params;
  const periodLabel = decodeURIComponent(label);

  const supabase = await createClient();

  // Fetch all periods for the selector
  const { data: periodsRows } = await supabase
    .from("periods")
    .select("period_label, start_date, end_date, is_closed")
    .order("start_date", { ascending: true });

  const allPeriods: Period[] = (periodsRows ?? []).map((p) => ({
    period_label: p.period_label,
    start_date: p.start_date,
    end_date: p.end_date,
    closed: p.is_closed,
  }));

  const period = allPeriods.find((p) => p.period_label === periodLabel) ?? null;

  // Fetch reconciliation results for this period (join clients for accounts[])
  const { data: resultRows } = await supabase
    .from("reconciliation_results")
    .select("*, clients(accounts)")
    .eq("period_label", periodLabel);

  const results: ReconciliationResult[] = (resultRows ?? []).map((r) => ({
    id: r.id,
    period_label: r.period_label,
    stripe_id: r.stripe_id ?? "",
    display_name: r.display_name ?? "",
    primary_email: r.primary_email ?? "",
    expected_amount: parseFloat(r.expected_amount).toFixed(4),
    collected_amount: parseFloat(r.collected_amount).toFixed(2),
    variance: parseFloat(r.variance).toFixed(4),
    status: r.recon_status as ReconciliationResult["status"],
    batch: (r.batch ?? "—") as ReconciliationResult["batch"],
    constituent_accounts: (r.clients as { accounts: string[] } | null)?.accounts ?? [],
  }));

  const hasData = results.length > 0;

  // Compute KPIs from results
  const kpis: PeriodKpis | null = hasData ? {
    period_label: periodLabel,
    total_expected:  results.reduce((s, r) => s + parseFloat(r.expected_amount),  0).toFixed(4),
    total_collected: results.reduce((s, r) => s + parseFloat(r.collected_amount), 0).toFixed(2),
    total_variance:  results.reduce((s, r) => s + parseFloat(r.variance),          0).toFixed(4),
    match_count:    results.filter((r) => r.status === "MATCH").length,
    exception_count: results.filter((r) => r.status !== "MATCH").length,
    failed_hard_count: results.filter((r) => r.status === "FAILED_HARD").length,
    missing_count:  results.filter((r) => r.status === "MISSING_PAYMENT").length,
    overpaid_count: results.filter((r) => r.status === "OVERPAID").length,
    client_count:   results.length,
  } : null;

  // Client lifecycle — new and churned this period
  const monthKey = period?.start_date?.slice(0, 7) ?? null;
  let newClients: ClientRecord[] = [];
  let churnedClients: ClientRecord[] = [];

  if (period && monthKey) {
    const { data: lifecycleRows } = await supabase
      .from("clients")
      .select("stripe_id, display_name, primary_email, account_status, batch, google_id, accounts, is_active, deactivated_month, start_date, end_date")
      .or(`and(start_date.gte.${period.start_date},start_date.lte.${period.end_date}),deactivated_month.eq.${monthKey}`);

    const toRecord = (c: NonNullable<typeof lifecycleRows>[number]): ClientRecord => ({
      stripe_id: c.stripe_id ?? null,
      display_name: c.display_name,
      primary_email: c.primary_email,
      account_status: c.account_status as ClientRecord["account_status"],
      batch: (c.batch ?? "—") as ClientRecord["batch"],
      google_id: c.google_id ?? null,
      accounts: c.accounts ?? [],
      is_active: c.is_active,
      deactivated_month: c.deactivated_month ?? null,
      start_date: c.start_date ?? null,
      end_date: c.end_date ?? null,
      billing_plans: [],
    });

    newClients = (lifecycleRows ?? [])
      .filter((c) => c.start_date && c.start_date >= period.start_date && c.start_date <= period.end_date)
      .map(toRecord);
    churnedClients = (lifecycleRows ?? [])
      .filter((c) => c.deactivated_month === monthKey)
      .map(toRecord);
  }

  return (
    <div className="px-6 py-6 space-y-5 max-w-[1480px]">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[#3a3a3a]">{periodLabel}</h1>
          <p className="text-sm text-[#6b7280] mt-0.5">
            Stripe ↔ AR reconciliation{kpis ? ` · ${kpis.client_count} clients` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <PeriodSelector
            periods={[...allPeriods].reverse()}
            current={periodLabel}
          />
          {period && !period.closed && (
            <span className="text-xs bg-amber-100 text-amber-800 border border-amber-200 px-2.5 py-1 rounded-sm font-medium">
              Open period
            </span>
          )}
          {period?.closed && (
            <span className="text-xs bg-green-100 text-green-700 border border-green-200 px-2.5 py-1 rounded-sm font-medium">
              Closed
            </span>
          )}
        </div>
      </div>

      {!hasData ? (
        <div className="py-16 text-center text-sm text-[#9ca3af] border border-[#eeeeee] rounded-[2px]">
          No reconciliation data available for {periodLabel} yet.
        </div>
      ) : (
        <>
          {/* KPIs */}
          <KpiStrip kpis={kpis!} />

          {/* MoM delta explanation */}
          <MoMDeltaSection bridge={aprilMoMBridge} />

          {/* Client lifecycle */}
          <ClientLifecycleSection newClients={newClients} churnedClients={churnedClients} />

          {/* Reconciliation table */}
          <div>
            <h2 className="text-sm font-semibold text-[#3a3a3a] mb-3 uppercase tracking-wide">
              Reconciliation Detail
            </h2>
            <ReconTable results={results} />
          </div>
        </>
      )}
    </div>
  );
}
