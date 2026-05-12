import { createClient } from "@/lib/supabase/server";
import { ExceptionList } from "./_components/ExceptionList";
import type { Exception } from "@/lib/types";

export default async function ExceptionsPage() {
  const supabase = await createClient();

  const { data: rows } = await supabase
    .from("exceptions")
    .select("*")
    .eq("resolution_status", "OPEN")
    .order("created_at", { ascending: false });

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

  // Group label: show the most recent period with open exceptions, or generic
  const periodLabel = open[0]?.period_label ?? "—";

  return (
    <div className="px-6 py-6 space-y-5 max-w-[1480px]">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[#3a3a3a]">Exception Queue</h1>
          <p className="text-sm text-[#6b7280] mt-0.5">
            {periodLabel} · {open.length} open exception{open.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>
      <ExceptionList exceptions={open} />
    </div>
  );
}
