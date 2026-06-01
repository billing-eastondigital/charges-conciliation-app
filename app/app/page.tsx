import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("periods")
    .select("period_label")
    .eq("is_closed", false)
    .order("start_date", { ascending: false })
    .limit(1)
    .single();

  const current = data?.period_label ?? "April 2026";
  redirect(`/period/${encodeURIComponent(current)}`);
}
