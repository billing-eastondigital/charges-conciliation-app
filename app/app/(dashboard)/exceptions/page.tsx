import { createClient } from "@/lib/supabase/server";
import { ExceptionList } from "./_components/ExceptionList";
import { PeriodTabs } from "./_components/PeriodTabs";
import type { Exception } from "@/lib/types";

interface Props {
  searchParams: Promise<{ period?: string }>;
}

export default async function ExceptionsPage({ searchParams }: Props) {
  const { period: activePeriod } = await searchParams;
  const supabase = await createClient();

  // Counts per period for the tabs
  const { data: countRows } = await supabase
    .from("exceptions")
    .select("period_label")
    .eq("resolution_status", "OPEN");

  const periodCounts: Record<string, number> = {};
  for (const row of countRows ?? []) {
    periodCounts[row.period_label] = (periodCounts[row.period_label] ?? 0) + 1;
  }
  const periods = Object.entries(periodCounts)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const total = Object.values(periodCounts).reduce((s, n) => s + n, 0);

  // Filtered exceptions
  let query = supabase
    .from("exceptions")
    .select("*")
    .eq("resolution_status", "OPEN")
    .order("created_at", { ascending: false });

  if (activePeriod) {
    query = query.eq("period_label", activePeriod);
  }

  const { data: rows } = await query;

  const open: Exception[] = (rows ?? []).map((r) => ({
    id: r.id,
    period_label: r.period_label,
    stripe_id: r.stripe_id ?? null,
    display_name: r.display_name ?? "",
    status: r.resolution_status as Exception["status"],
    reconciliation_status: r.exception_type as Exception["reconciliation_status"],
    variance: r.variance != null ? parseFloat(r.variance).toFixed(4) : "0.0000",
    notes: r.resolution_note ?? null,
    assigned_to: null,
    created_at: r.created_at,
    resolved_at: r.resolved_at ?? null,
  }));

  return (
    <div className="px-6 py-6 space-y-5 max-w-[1480px]">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[#3a3a3a]">Exception Queue</h1>
          <p className="text-sm text-[#6b7280] mt-0.5">
            {total} open exception{total !== 1 ? "s" : ""} across {periods.length} period{periods.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      <PeriodTabs periods={periods} activePeriod={activePeriod ?? null} total={total} />

      <ExceptionList exceptions={open} />
    </div>
  );
}
