import { createClient } from "@/lib/supabase/server";
import StripeTransactionsClient, {
  type EnrichedCharge,
} from "./_components/StripeTransactionsClient";

export default async function StripeTransactionsPage() {
  const supabase = await createClient();

  // Fetch charges, clients, and periods in parallel
  const [{ data: charges }, { data: clients }, { data: periodsRows }] = await Promise.all([
    supabase
      .from("stripe_charges")
      .select(
        "charge_id, period_label, stripe_id, customer_email, amount, amount_refunded, charge_status, raw_stripe_status, created_at_stripe"
      )
      .order("created_at_stripe", { ascending: false }),
    supabase.from("clients").select("stripe_id, display_name, batch"),
    supabase.from("periods").select("period_label").order("start_date", { ascending: false }),
  ]);

  // Build lookup map
  const clientMap = new Map(
    (clients ?? []).map((c) => [c.stripe_id, { display_name: c.display_name, batch: c.batch }])
  );

  // Map charge_status → display label (consistent regardless of CSV vs API source)
  function toDisplayStatus(chargeStatus: string): EnrichedCharge["status"] {
    if (chargeStatus === "REFUNDED")    return "Refunded";
    if (chargeStatus === "PAID_NET")    return "Paid";
    return "Failed"; // FAILED_HARD, FAILED_RETRY
  }

  // Map DB rows → EnrichedCharge
  const enriched: EnrichedCharge[] = (charges ?? []).map((row) => {
    const client = row.stripe_id ? clientMap.get(row.stripe_id) : undefined;
    return {
      charge_id:       row.charge_id,
      period_label:    row.period_label,
      stripe_id:       row.stripe_id ?? null,
      customer_email:  row.customer_email,
      amount:          String(row.amount ?? "0"),
      amount_refunded: String(row.amount_refunded ?? "0"),
      status:          toDisplayStatus(row.charge_status),
      created_at:      row.created_at_stripe,
      display_name:    client?.display_name ?? row.customer_email,
      batch:           client?.batch ?? "—",
    };
  });

  // Periods ordered most recent first — derived from DB, filtered to those with charges
  const periods = (periodsRows ?? [])
    .map((p) => p.period_label)
    .filter((p) => enriched.some((c) => c.period_label === p));

  return <StripeTransactionsClient charges={enriched} periods={periods} />;
}
