import { notFound } from "next/navigation";
import { KpiStrip } from "./_components/KpiStrip";
import { ReconTable } from "./_components/ReconTable";
import { april2026Results, april2026Kpis } from "@/lib/mock";

interface Props {
  params: Promise<{ label: string }>;
}

export default async function PeriodPage({ params }: Props) {
  const { label } = await params;
  const periodLabel = decodeURIComponent(label);

  // Phase 1: mock data — swap for DB query in Phase 2
  if (periodLabel !== "April 2026") notFound();
  const results = april2026Results;
  const kpis = april2026Kpis;

  return (
    <div className="px-6 py-6 space-y-5 max-w-[1480px]">
      {/* Header */}
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[#3a3a3a]">{periodLabel}</h1>
          <p className="text-sm text-[#6b7280] mt-0.5">
            Stripe ↔ AR reconciliation · {kpis.client_count} clients
          </p>
        </div>
        <span className="text-xs bg-amber-100 text-amber-800 border border-amber-200 px-2.5 py-1 rounded-sm font-medium">
          Open period
        </span>
      </div>

      {/* KPIs */}
      <KpiStrip kpis={kpis} />

      {/* Reconciliation table */}
      <div>
        <h2 className="text-sm font-semibold text-[#3a3a3a] mb-3 uppercase tracking-wide">
          Reconciliation Detail
        </h2>
        <ReconTable results={results} />
      </div>
    </div>
  );
}
