import { KpiStrip } from "./_components/KpiStrip";
import { ReconTable } from "./_components/ReconTable";
import { PeriodSelector } from "./_components/PeriodSelector";
import { ClientLifecycleSection } from "./_components/ClientLifecycleSection";
import { april2026Results, april2026Kpis, PERIODS, clientDatabase } from "@/lib/mock";

interface Props {
  params: Promise<{ label: string }>;
}

export default async function PeriodPage({ params }: Props) {
  const { label } = await params;
  const periodLabel = decodeURIComponent(label);

  // Phase 1: only April 2026 has data; other periods show a placeholder
  const hasData = periodLabel === "April 2026";
  const results = hasData ? april2026Results : [];
  const kpis = hasData ? april2026Kpis : null;
  const period = PERIODS.find((p) => p.period_label === periodLabel);

  // Client lifecycle — new and churned this period
  const monthKey = period?.start_date?.slice(0, 7) ?? null; // "2026-04"
  const newClients = clientDatabase.filter(
    (c) => c.start_date && period &&
      c.start_date >= period.start_date && c.start_date <= period.end_date
  );
  const churnedClients = clientDatabase.filter(
    (c) => monthKey && c.deactivated_month === monthKey
  );

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
            periods={[...PERIODS].reverse()}
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
