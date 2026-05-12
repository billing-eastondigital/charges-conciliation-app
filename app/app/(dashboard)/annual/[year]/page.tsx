import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AnnualChart } from "./_components/AnnualChart";
import { MonthlyTable } from "./_components/MonthlyTable";
import { formatMoney } from "@/lib/format";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { MonthlyAggregate } from "@/lib/mock/annual-2026";

const MONTH_SHORT: Record<string, string> = {
  January: "Jan", February: "Feb", March: "Mar", April: "Apr",
  May: "May", June: "Jun", July: "Jul", August: "Aug",
  September: "Sep", October: "Oct", November: "Nov", December: "Dec",
};

interface AnnualPageProps {
  params: Promise<{ year: string }>;
}

export default async function AnnualPage({ params }: AnnualPageProps) {
  const { year } = await params;
  const yearNum = parseInt(year, 10);
  if (yearNum !== 2026) notFound();

  const supabase = await createClient();

  // Fetch all data in parallel
  const [{ data: periodsRows }, { data: reconRows }, { data: chargeRows }] = await Promise.all([
    supabase
      .from("periods")
      .select("period_label, start_date, is_closed")
      .like("period_label", `% ${yearNum}`)
      .order("start_date"),
    supabase
      .from("reconciliation_results")
      .select("period_label, expected_amount, collected_amount, variance, recon_status")
      .like("period_label", `% ${yearNum}`),
    supabase
      .from("stripe_charges")
      .select("period_label, amount, stripe_id, raw_stripe_status")
      .like("period_label", `% ${yearNum}`)
      .eq("raw_stripe_status", "Paid"),
  ]);

  // Aggregate reconciliation_results by period
  type ReconAgg = {
    expected: number; collected: number; variance: number;
    match_count: number; exception_count: number; client_count: number;
  };
  const reconByPeriod = new Map<string, ReconAgg>();
  for (const r of reconRows ?? []) {
    if (!reconByPeriod.has(r.period_label)) {
      reconByPeriod.set(r.period_label, { expected: 0, collected: 0, variance: 0, match_count: 0, exception_count: 0, client_count: 0 });
    }
    const a = reconByPeriod.get(r.period_label)!;
    a.expected  += parseFloat(String(r.expected_amount  ?? 0));
    a.collected += parseFloat(String(r.collected_amount ?? 0));
    a.variance  += parseFloat(String(r.variance         ?? 0));
    a.client_count++;
    if (r.recon_status === "MATCH") a.match_count++;
    else a.exception_count++;
  }

  // Aggregate stripe_charges by period (fallback for non-reconciled months)
  type StripeAgg = { collected: number; clientIds: Set<string> };
  const stripeByPeriod = new Map<string, StripeAgg>();
  for (const c of chargeRows ?? []) {
    if (!stripeByPeriod.has(c.period_label)) {
      stripeByPeriod.set(c.period_label, { collected: 0, clientIds: new Set() });
    }
    const a = stripeByPeriod.get(c.period_label)!;
    a.collected += parseFloat(String(c.amount ?? 0));
    if (c.stripe_id) a.clientIds.add(c.stripe_id);
  }

  // Build MonthlyAggregate[] from periods ordered by start_date
  const data: MonthlyAggregate[] = (periodsRows ?? []).map((p) => {
    const monthName = p.period_label.split(" ")[0];
    const recon = reconByPeriod.get(p.period_label);
    const stripe = stripeByPeriod.get(p.period_label);

    if (recon) {
      return {
        period_label:    p.period_label,
        month_short:     MONTH_SHORT[monthName] ?? monthName.slice(0, 3),
        expected:        recon.expected,
        collected:       recon.collected,
        variance:        recon.variance,
        match_count:     recon.match_count,
        exception_count: recon.exception_count,
        client_count:    recon.client_count,
        closed:          p.is_closed,
      };
    }

    // Non-reconciled period: use Stripe totals, expected = 0
    return {
      period_label:    p.period_label,
      month_short:     MONTH_SHORT[monthName] ?? monthName.slice(0, 3),
      expected:        0,
      collected:       stripe?.collected ?? 0,
      variance:        0,
      match_count:     0,
      exception_count: 0,
      client_count:    stripe?.clientIds.size ?? 0,
      closed:          p.is_closed,
    };
  });

  if (data.length === 0) notFound();

  // Aggregate KPIs
  const totalCollected = data.reduce((s, m) => s + m.collected, 0);
  const totalExpected  = data.reduce((s, m) => s + m.expected,  0);
  const totalVariance  = data.reduce((s, m) => s + m.variance,  0);
  const closedMonths   = data.filter((m) => m.closed).length;
  const openMonths     = data.filter((m) => !m.closed).length;
  const bestMonth      = [...data].sort((a, b) => b.collected - a.collected)[0]?.period_label ?? "";
  const worstMonth     = [...data].filter(m => m.collected > 0).sort((a, b) => a.collected - b.collected)[0]?.period_label ?? "";

  const kpis = {
    total_expected:        totalExpected,
    total_collected:       totalCollected,
    total_variance:        totalVariance,
    avg_monthly_collected: data.length > 0 ? totalCollected / data.length : 0,
    best_month:            bestMonth,
    worst_month:           worstMonth,
    closed_months:         closedMonths,
    open_months:           openMonths,
  };

  const varNeg = kpis.total_variance < -0.005;
  const varPos = kpis.total_variance > 0.005;

  const collectionRatePct = kpis.total_expected > 0
    ? ((kpis.total_collected / kpis.total_expected) * 100).toFixed(1)
    : null;

  const variancePct = kpis.total_expected > 0
    ? `${kpis.total_variance >= 0 ? "+" : ""}${((kpis.total_variance / kpis.total_expected) * 100).toFixed(2)}% of expected`
    : null;

  const lastMonth = data[data.length - 1];
  const totalClientMonths = data.reduce((s, m) => s + m.client_count, 0);
  const avgTicketYtd  = totalClientMonths > 0 ? kpis.total_collected / totalClientMonths : 0;
  const avgTicketLast = lastMonth.client_count > 0 ? lastMonth.collected / lastMonth.client_count : 0;
  const avgTicketDelta = avgTicketLast - avgTicketYtd;
  const avgTicketDeltaPct = avgTicketYtd > 0 ? (avgTicketDelta / avgTicketYtd) * 100 : null;

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">

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
          {kpis.total_expected === 0 && (
            <p className="text-[10px] text-[#9ca3af] mt-0.5">Reconciled months only</p>
          )}
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
            {formatMoney(avgTicketYtd)}
          </p>
          <p className="text-xs text-[#6b7280] mt-0.5">YTD · {totalClientMonths} billing events</p>
          {avgTicketDeltaPct !== null && (
            <div className={`mt-1.5 flex items-center gap-1 text-xs font-medium ${
              avgTicketDelta > 0.005 ? "text-green-700" : avgTicketDelta < -0.005 ? "text-red-700" : "text-[#6b7280]"
            }`}>
              {avgTicketDelta > 0.005 ? <TrendingUp size={12} /> : avgTicketDelta < -0.005 ? <TrendingDown size={12} /> : <Minus size={12} />}
              {lastMonth.month_short} {avgTicketDelta >= 0 ? "+" : ""}{formatMoney(avgTicketDelta)} ({avgTicketDeltaPct >= 0 ? "+" : ""}{avgTicketDeltaPct.toFixed(1)}%) vs YTD
            </div>
          )}
        </div>
      </div>

      <AnnualChart data={data} />
      <MonthlyTable data={data} />
    </div>
  );
}
