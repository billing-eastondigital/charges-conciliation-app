import { MoneyCell } from "@/components/shared/MoneyCell";
import type { PeriodKpis } from "@/lib/types";

interface KpiStripProps {
  kpis: PeriodKpis;
}

interface KpiCardProps {
  label: string;
  value: React.ReactNode;
  sub?: string;
  accent?: "default" | "green" | "red" | "amber" | "blue";
}

function KpiCard({ label, value, sub, accent = "default" }: KpiCardProps) {
  const accentColor = {
    default: "border-t-[#dddddd]",
    green:   "border-t-green-500",
    red:     "border-t-red-500",
    amber:   "border-t-amber-500",
    blue:    "border-t-[#0170B9]",
  }[accent];

  return (
    <div className={`bg-white border border-[#dddddd] border-t-2 ${accentColor} rounded-sm p-4`}>
      <p className="text-xs text-[#6b7280] uppercase tracking-wide font-medium mb-1">{label}</p>
      <div className="text-xl font-semibold text-[#3a3a3a]">{value}</div>
      {sub && <p className="text-xs text-[#6b7280] mt-1">{sub}</p>}
    </div>
  );
}

export function KpiStrip({ kpis }: KpiStripProps) {
  const exceptionRate = kpis.client_count > 0
    ? Math.round((kpis.exception_count / kpis.client_count) * 100)
    : 0;

  const expected = parseFloat(kpis.total_expected);
  const variance = parseFloat(kpis.total_variance);
  const collected = parseFloat(kpis.total_collected);

  const collectionRatePct = expected > 0
    ? ((collected / expected) * 100).toFixed(1)
    : null;

  const variancePct = expected > 0
    ? `${variance >= 0 ? "+" : ""}${((variance / expected) * 100).toFixed(2)}% of expected`
    : "collected − expected";

  const matchRatePct = kpis.client_count > 0
    ? Math.round((kpis.match_count / kpis.client_count) * 100)
    : 0;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-3">
      <KpiCard
        label="Total Expected"
        value={<MoneyCell amount={kpis.total_expected} />}
        accent="default"
      />
      <KpiCard
        label="Total Collected"
        value={<MoneyCell amount={kpis.total_collected} />}
        sub={collectionRatePct ? `${collectionRatePct}% of expected` : undefined}
        accent="blue"
      />
      <KpiCard
        label="Net Variance"
        value={<MoneyCell amount={kpis.total_variance} />}
        sub={variancePct}
        accent={variance < -0.01 ? "red" : "green"}
      />
      <KpiCard
        label="Match"
        value={kpis.match_count}
        sub={`${matchRatePct}% of ${kpis.client_count} clients`}
        accent="green"
      />
      <KpiCard
        label="Exceptions"
        value={kpis.exception_count}
        sub={`${exceptionRate}% exception rate`}
        accent={kpis.exception_count > 0 ? "red" : "green"}
      />
      <KpiCard
        label="Failed / Missing"
        value={`${kpis.failed_hard_count + kpis.missing_count}`}
        sub={`${kpis.failed_hard_count} failed · ${kpis.missing_count} missing`}
        accent={kpis.failed_hard_count > 0 ? "amber" : "default"}
      />
    </div>
  );
}
