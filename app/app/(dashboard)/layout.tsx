import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/shared/Sidebar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();

  // Always link to the most recent open period; fall back to April 2026 if all are closed
  const { data: period } = await supabase
    .from("periods")
    .select("period_label")
    .eq("is_closed", false)
    .order("start_date", { ascending: false })
    .limit(1)
    .single();

  const currentPeriod = period?.period_label ?? "April 2026";

  return (
    <div className="flex h-full min-h-screen">
      <Sidebar currentPeriod={currentPeriod} />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
