import { createClient } from "@/lib/supabase/server";
import { BillingPageClient, type ExpectedChargeRow } from "./_components/BillingPageClient";

interface Props {
  searchParams: Promise<{ period?: string }>;
}

export default async function BillingPage({ searchParams }: Props) {
  const { period } = await searchParams;
  const supabase = await createClient();

  const { data: periodsRows } = await supabase
    .from("periods")
    .select("period_label, is_closed")
    .order("start_date", { ascending: false });

  const periods = periodsRows ?? [];

  // Default to first open period, then most recent
  const defaultPeriod =
    periods.find((p) => !p.is_closed)?.period_label ??
    periods[0]?.period_label ??
    "";
  const selectedPeriod = period ?? defaultPeriod;
  const isClosed = periods.find((p) => p.period_label === selectedPeriod)?.is_closed ?? false;

  const { data: rows } = await supabase
    .from("expected_charges")
    .select(
      "id, account_name, stripe_id, primary_email, batch, billing_plan, billing_pct, " +
      "google_shopping_charge, google_search_charge, bing_charge, base_fee, other_charge, " +
      "expected_amount, source_row_index"
    )
    .eq("period_label", selectedPeriod)
    .order("source_row_index");

  return (
    <BillingPageClient
      rows={(rows ?? []) as unknown as ExpectedChargeRow[]}
      periods={periods}
      selectedPeriod={selectedPeriod}
      isClosed={isClosed}
    />
  );
}
