import { notFound } from "next/navigation";
import { budget2026, budgetKpis2026, BUDGET_MONTHS_2026, BUDGET_YTD_CUTOFF_2026 } from "@/lib/mock/budget-2026";
import { BudgetKpiStrip } from "./_components/BudgetKpiStrip";
import { BudgetTable } from "./_components/BudgetTable";

interface BudgetPageProps {
  params: Promise<{ year: string }>;
}

export default async function BudgetPage({ params }: BudgetPageProps) {
  const { year } = await params;
  const yearNum = parseInt(year, 10);

  if (yearNum !== 2026) notFound();

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">

      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-[#3a3a3a]">{yearNum} Budget — Projected vs Actual</h1>
        <p className="text-sm text-[#6b7280] mt-0.5">
          Per-client monthly projection with real collected amounts. Highlighted columns = actual data loaded.
          Projections use per-client rules defined in the client database.
        </p>
      </div>

      {/* KPIs */}
      <BudgetKpiStrip kpis={budgetKpis2026} year={yearNum} />

      {/* Budget table */}
      <BudgetTable
        rows={budget2026}
        months={[...BUDGET_MONTHS_2026]}
        ytdCutoff={BUDGET_YTD_CUTOFF_2026}
      />
    </div>
  );
}
