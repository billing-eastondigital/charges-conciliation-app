import { notFound } from "next/navigation";
import { monthly2026, kpis2026 } from "@/lib/mock/annual-2026";
import { AnnualChart } from "./_components/AnnualChart";
import { MonthlyTable } from "./_components/MonthlyTable";
import { formatMoney } from "@/lib/format";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface AnnualPageProps {
  params: Promise<{ year: string }>;
}

export default async function AnnualPage({ params }: AnnualPageProps) {
  const { year } = await params;
  const yearNum = parseInt(year, 10);

  if (yearNum !== 2026) notFound();

  const kpis = kpis2026;
  const data = monthly2026;

  const varNeg = kpis.total_variance < -0.005;
  const varPos = kpis.total_variance > 0.005;

  const collectionRatePct = kpis.total_expected > 0
    ? ((kpis.total_collected / kpis.total_expected) * 100).toFixed(1)
    : null;

  const variancePct = kpis.total_expected > 0
    ? `${kpis.total_variance >= 0 ? "+" : ""}${((kpis.total_variance / kpis.total_expected) * 100).toFixed(2)}% of expected`
    : null;

  // Avg ticket per client — latest month vs prior month
  const lastMonth  = data[data.length - 1];
  const priorMonth = data[data.length - 2] ?? null;
  const avgTicketLast  = lastMonth.client_count > 0 ? lastMonth.collected / lastMonth.client_count : 0;
  const avgTicketPrior = priorMonth && priorMonth.client_count > 0 ? priorMonth.collected / priorMonth.client_count : null;
  const avgTicketDelta = avgTicketPrior !== null ? avgTicketLast - avgTicketPrior : null;
  const avgTicketDeltaPct = avgTicketPrior ? ((avgTicketDelta! / avgTicketPrior) * 100) : null;

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#3a3a3a]">{yearNum} Annual Overview</h1>
          <p className="text-sm text-[#6b7280] mt-0.5">
            {kpis.closed_months} closed · {kpis.open_months} open
          </p>
        </div>
      </div>

      {/* YTD KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-[#dddddd] rounded-sm p-4">
          <p className="text-xs text-[#6b7280] uppercase tracking-wide mb-1">YTD Expected</p>
          <p className="text-lg font-semibold font-mono text-[#3a3a3a]">
            {formatMoney(kpis.total_expected)}
          </p>
        </div>
        <div className="bg-white border border-[#dddddd] rounded-sm p-4">
          <p className="text-xs text-[#6b7280] uppercase tracking-wide mb-1">YTD Collected</p>
          <p className="text-lg font-semibold font-mono text-[#0170B9]">
            {formatMoney(kpis.total_collected)}
          </p>
          {collectionRatePct && (
            <p className="text-xs text-[#6b7280] mt-1">{collectionRatePct}% of expected</p>
          )}
        </div>
        <div className="bg-white border border-[#dddddd] rounded-sm p-4">
          <p className="text-xs text-[#6b7280] uppercase tracking-wide mb-1">Net Variance</p>
          <p className={`text-lg font-semibold font-mono ${
            varNeg ? "text-red-700" : varPos ? "text-green-700" : "text-[#6b7280]"
          }`}>
            {varPos ? "+" : ""}{formatMoney(kpis.total_variance)}
          </p>
          {variancePct && (
            <p className={`text-xs mt-1 ${varNeg ? "text-red-600" : varPos ? "text-green-700" : "text-[#6b7280]"}`}>
              {variancePct}
            </p>
          )}
        </div>
        <div className="bg-white border border-[#dddddd] rounded-sm p-4">
          <p className="text-xs text-[#6b7280] uppercase tracking-wide mb-1">Avg / Month</p>
          <p className="text-lg font-semibold font-mono text-[#3a3a3a]">
            {formatMoney(kpis.avg_monthly_collected)}
          </p>
        </div>

        {/* Avg ticket per client */}
        <div className="bg-white border border-[#dddddd] border-t-2 border-t-[#0170B9] rounded-sm p-4 sm:col-span-2 lg:col-span-1">
          <p className="text-xs text-[#6b7280] uppercase tracking-wide mb-1">
            Avg Ticket / Client
          </p>
          <p className="text-lg font-semibold font-mono text-[#3a3a3a]">
            {formatMoney(avgTicketLast)}
          </p>
          <p className="text-xs text-[#6b7280] mt-0.5">{lastMonth.month_short} · {lastMonth.client_count} clients</p>
          {avgTicketDelta !== null && avgTicketDeltaPct !== null && (
            <div className={`mt-1.5 flex items-center gap-1 text-xs font-medium ${
              avgTicketDelta > 0.005 ? "text-green-700" : avgTicketDelta < -0.005 ? "text-red-700" : "text-[#6b7280]"
            }`}>
              {avgTicketDelta > 0.005 ? <TrendingUp size={12} /> : avgTicketDelta < -0.005 ? <TrendingDown size={12} /> : <Minus size={12} />}
              {avgTicketDelta >= 0 ? "+" : ""}{formatMoney(avgTicketDelta)} ({avgTicketDeltaPct >= 0 ? "+" : ""}{avgTicketDeltaPct.toFixed(1)}%) vs {priorMonth!.month_short}
            </div>
          )}
        </div>
      </div>

      {/* Chart */}
      <AnnualChart data={data} />

      {/* Monthly table */}
      <MonthlyTable data={data} />

    </div>
  );
}
