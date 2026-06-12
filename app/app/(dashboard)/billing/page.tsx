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

  let defaultPeriod = periods[0]?.period_label ?? "";
  if (!period) {
    const { data: billedRows } = await supabase
      .from("expected_charges")
      .select("period_label");
    const periodsWithBilling = new Set((billedRows ?? []).map((r) => r.period_label));
    defaultPeriod =
      periods.find((p) => !p.is_closed && periodsWithBilling.has(p.period_label))?.period_label ??
      periods.find((p) => !p.is_closed)?.period_label ??
      periods[0]?.period_label ??
      "";
  }
  const selectedPeriod = period ?? defaultPeriod;
  const isClosed = periods.find((p) => p.period_label === selectedPeriod)?.is_closed ?? false;

  const { data: rows } = await supabase
    .from("expected_charges")
    .select(
      "id, account_name, stripe_id, primary_email, batch, " +
      "expected_amount, source, billing_detail, " +
      // Legacy IMPORT columns
      "google_shopping_charge, google_search_charge, bing_charge, " +
      "base_fee, other_charge, billing_pct, source_row_index"
    )
    .eq("period_label", selectedPeriod)
    .order("source")
    .order("account_name");

  return (
    <BillingPageClient
      key={selectedPeriod}
      rows={(rows ?? []) as unknown as ExpectedChargeRow[]}
      periods={periods}
      selectedPeriod={selectedPeriod}
      isClosed={isClosed}
    />
  );
}
