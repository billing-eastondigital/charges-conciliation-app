import { createClient } from "@/lib/supabase/server";
import { KpiStrip } from "./_components/KpiStrip";
import { ReconTable } from "./_components/ReconTable";
import { PeriodSelector } from "./_components/PeriodSelector";
import { ClientLifecycleSection } from "./_components/ClientLifecycleSection";
import { MoMDeltaSection } from "./_components/MoMDeltaSection";
import type { ReconciliationResult, PeriodKpis, Period, ClientRecord } from "@/lib/types";
import type { MoMBridgeData } from "@/lib/mock/mom-bridge-2026";

interface Props {
  params: Promise<{ label: string }>;
}

export default async function PeriodPage({ params }: Props) {
  const { label } = await params;
  const periodLabel = decodeURIComponent(label);

  const supabase = await createClient();

  // Fetch periods + results + client lifecycle + exceptions in parallel
  const [{ data: periodsRows }, { data: resultRows }, { data: lifecycleRows }, { data: exceptionRows }] = await Promise.all([
    supabase.from("periods").select("period_label, start_date, end_date, is_closed").order("start_date"),
    supabase.from("reconciliation_results").select("*, clients(accounts)").eq("period_label", periodLabel),
    supabase.from("clients").select("id, stripe_id, display_name, primary_email, account_status, batch, google_id, accounts, is_active, deactivated_month, start_date, end_date"),
    supabase.from("exceptions").select("stripe_id, resolution_status").eq("period_label", periodLabel),
  ]);

  // Build stripe_id → aggregate resolution map.
  // A client is "fully resolved" when ALL their exceptions are in a terminal state.
  // Terminal: RESOLVED or WONT_FIX. Non-terminal: OPEN or ESCALATED.
  type ResolutionValue = "OPEN" | "RESOLVED" | "WONT_FIX" | "ESCALATED";
  const exceptionResolutionMap = new Map<string, ResolutionValue>();
  const exceptionsByStripeId = new Map<string, ResolutionValue[]>();
  for (const ex of exceptionRows ?? []) {
    if (!ex.stripe_id) continue;
    const list = exceptionsByStripeId.get(ex.stripe_id) ?? [];
    list.push(ex.resolution_status as ResolutionValue);
    exceptionsByStripeId.set(ex.stripe_id, list);
  }
  for (const [stripeId, statuses] of exceptionsByStripeId) {
    const hasOpen      = statuses.some((s) => s === "OPEN");
    const hasEscalated = statuses.some((s) => s === "ESCALATED");
    const allTerminal  = statuses.every((s) => s === "RESOLVED" || s === "WONT_FIX");
    const hasWontFix   = statuses.some((s) => s === "WONT_FIX");
    if (hasOpen)            exceptionResolutionMap.set(stripeId, "OPEN");
    else if (hasEscalated)  exceptionResolutionMap.set(stripeId, "ESCALATED");
    else if (allTerminal)   exceptionResolutionMap.set(stripeId, hasWontFix ? "WONT_FIX" : "RESOLVED");
  }

  const allPeriods: Period[] = (periodsRows ?? []).map((p) => ({
    period_label: p.period_label,
    start_date:   p.start_date,
    end_date:     p.end_date,
    closed:       p.is_closed,
  }));

  const period = allPeriods.find((p) => p.period_label === periodLabel) ?? null;

  const results: ReconciliationResult[] = (resultRows ?? []).map((r) => ({
    id:               r.id,
    period_label:     r.period_label,
    stripe_id:        r.stripe_id ?? "",
    display_name:     r.display_name ?? "",
    primary_email:    r.primary_email ?? "",
    expected_amount:  parseFloat(r.expected_amount).toFixed(4),
    collected_amount: parseFloat(r.collected_amount).toFixed(2),
    variance:         parseFloat(r.variance).toFixed(4),
    status:           r.recon_status as ReconciliationResult["status"],
    batch:            (r.batch ?? "—") as ReconciliationResult["batch"],
    constituent_accounts: (r.clients as { accounts: string[] } | null)?.accounts ?? [],
    account_status:        (r.account_status ?? null) as ReconciliationResult["account_status"],
    exception_resolution:  (r.stripe_id ? (exceptionResolutionMap.get(r.stripe_id) ?? null) : null) as ReconciliationResult["exception_resolution"],
  }));

  const hasData = results.length > 0;

  // KPIs
  const kpis: PeriodKpis | null = hasData ? {
    period_label:      periodLabel,
    total_expected:    results.reduce((s, r) => s + parseFloat(r.expected_amount),  0).toFixed(4),
    total_collected:   results.reduce((s, r) => s + parseFloat(r.collected_amount), 0).toFixed(2),
    total_variance:    results.reduce((s, r) => s + parseFloat(r.variance),         0).toFixed(4),
    match_count:       results.filter((r) => r.status === "MATCH").length,
    exception_count:   results.filter((r) => r.status !== "MATCH").length,
    failed_hard_count: results.filter((r) => r.status === "FAILED_HARD").length,
    missing_count:     results.filter((r) => r.status === "MISSING_PAYMENT").length,
    overpaid_count:    results.filter((r) => r.status === "OVERPAID").length,
    client_count:      results.length,
  } : null;

  // Client lifecycle
  const monthKey = period?.start_date?.slice(0, 7) ?? null;
  const toRecord = (c: NonNullable<typeof lifecycleRows>[number]): ClientRecord => ({
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
    billing_plans:     [],
  });

  const allClients = (lifecycleRows ?? []).map(toRecord);
  const newClients = period
    ? allClients.filter((c) => c.start_date && c.start_date >= period.start_date && c.start_date <= period.end_date)
    : [];
  const churnedClients = monthKey
    ? allClients.filter((c) => c.account_status === "LOST" && c.deactivated_month === monthKey)
    : [];

  // ── MoM bridge computed from stripe_charges ──────────────────────────────
  let bridge: MoMBridgeData | null = null;
  let prevCollectedMap: Map<string, number> | undefined;

  if (period) {
    const sortedPeriods = [...allPeriods].sort((a, b) => a.start_date.localeCompare(b.start_date));
    const currentIdx = sortedPeriods.findIndex((p) => p.period_label === periodLabel);
    const prevPeriod = currentIdx > 0 ? sortedPeriods[currentIdx - 1] : null;

    if (prevPeriod) {
      // Use reconciliation_results as source of truth for the MoM bridge —
      // avoids double-counting from duplicate stripe_charges rows (CSV vs API loads)
      const [{ data: currRecon }, { data: prevRecon }] = await Promise.all([
        supabase.from("reconciliation_results").select("stripe_id, collected_amount, display_name, primary_email").eq("period_label", periodLabel),
        supabase.from("reconciliation_results").select("stripe_id, collected_amount, display_name, primary_email").eq("period_label", prevPeriod.period_label),
      ]);

      // Build stripe_id → collected maps
      const currMap = new Map<string, { collected: number; email: string }>();
      for (const r of currRecon ?? []) {
        const key = r.stripe_id ?? r.primary_email ?? "unknown";
        const collected = parseFloat(String(r.collected_amount ?? 0));
        if (collected > 0) currMap.set(key, { collected, email: r.display_name ?? r.primary_email ?? key });
      }
      const prevMap = new Map<string, number>();
      for (const r of prevRecon ?? []) {
        const key = r.stripe_id ?? r.primary_email ?? "unknown";
        const collected = parseFloat(String(r.collected_amount ?? 0));
        if (collected > 0) prevMap.set(key, collected);
      }

      // Expose prior-period collected amounts to the reconciliation table
      prevCollectedMap = prevMap;

      // Name lookup: currMap already carries display_name in the .email field
      const clientNameMap = new Map([...currMap.entries()].map(([k, v]) => [k, v.email]));

      const priorCollected   = [...prevMap.values()].reduce((s, v) => s + v, 0);
      const currentCollected = [...currMap.values()].reduce((s, v) => s + v.collected, 0);

      // Use the same DB-field definitions as ClientLifecycleSection and the
      // Clients / Won & Churned tab so all pages agree on who is new vs churned.
      //   New     = clients.start_date falls within this period
      //   Churned = clients.account_status = 'LOST' AND deactivated_month = period month
      const newClientSet     = new Set(newClients.map((c) => c.stripe_id).filter(Boolean) as string[]);
      const churnedClientSet = new Set(churnedClients.map((c) => c.stripe_id).filter(Boolean) as string[]);

      const newClientKeys     = [...currMap.keys()].filter((k) => newClientSet.has(k));
      const churnedClientKeys = [...churnedClientSet];          // use DB list, not currMap/prevMap diff
      const retainedKeys      = [...currMap.keys()].filter((k) => !newClientSet.has(k) && !churnedClientSet.has(k));

      // New revenue  = what new clients brought in this period
      // Churned loss = what churned clients brought in the PRIOR period (recurring revenue gone)
      const newClientsRevenue   = newClientKeys.reduce((s, k) => s + (currMap.get(k)?.collected ?? 0), 0);
      const churnedRevenueLost  = churnedClientKeys.reduce((s, k) => s + (prevMap.get(k) ?? 0), 0);

      const retainedPriorTotal   = retainedKeys.reduce((s, k) => s + (prevMap.get(k) ?? 0), 0);
      const retainedCurrentTotal = retainedKeys.reduce((s, k) => s + (currMap.get(k)?.collected ?? 0), 0);
      const retainedDelta        = retainedCurrentTotal - retainedPriorTotal;

      const avgTicketPrior   = retainedKeys.length > 0 ? retainedPriorTotal   / retainedKeys.length : 0;
      const avgTicketCurrent = retainedKeys.length > 0 ? retainedCurrentTotal / retainedKeys.length : 0;

      // Top movers: retained clients sorted by |delta|
      const movers = retainedKeys
        .map((k) => ({
          name:    clientNameMap.get(k) ?? currMap.get(k)?.email ?? k,
          prior:   prevMap.get(k) ?? 0,
          current: currMap.get(k)?.collected ?? 0,
          delta:   (currMap.get(k)?.collected ?? 0) - (prevMap.get(k) ?? 0),
        }))
        .filter((m) => Math.abs(m.delta) > 0.005)
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
        .slice(0, 6);

      bridge = {
        prior_period:       prevPeriod.period_label,
        current_period:     periodLabel,
        prior_collected:    priorCollected,
        current_collected:  currentCollected,
        delta:              currentCollected - priorCollected,
        new_clients_revenue: newClientsRevenue,
        new_client_count:    newClientKeys.length,
        new_clients: newClientKeys.slice(0, 5).map((k) => {
          const meta = newClients.find((c) => c.stripe_id === k);
          return {
            name:   clientNameMap.get(k) ?? currMap.get(k)?.email ?? meta?.display_name ?? k,
            amount: currMap.get(k)?.collected ?? 0,
          };
        }),
        churned_revenue_lost:  churnedRevenueLost,
        churned_client_count:  churnedClientKeys.length,
        retained_delta:        retainedDelta,
        retained_count:        retainedKeys.length,
        avg_ticket_prior:      avgTicketPrior,
        avg_ticket_current:    avgTicketCurrent,
        avg_ticket_delta:      avgTicketCurrent - avgTicketPrior,
        top_movers:            movers,
      };
    }
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
          <PeriodSelector periods={[...allPeriods].reverse()} current={periodLabel} />
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
          <KpiStrip kpis={kpis!} />

          {bridge && <MoMDeltaSection bridge={bridge} />}

          <ClientLifecycleSection newClients={newClients} churnedClients={churnedClients} />

          <div>
            <h2 className="text-sm font-semibold text-[#3a3a3a] mb-3 uppercase tracking-wide">
              Reconciliation Detail
            </h2>
            <ReconTable results={results} prevCollectedMap={prevCollectedMap} />
          </div>
        </>
      )}
    </div>
  );
}
