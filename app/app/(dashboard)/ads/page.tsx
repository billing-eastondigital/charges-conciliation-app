import { createClient } from "@/lib/supabase/server";
import { AdsPageClient, type AdsSpendRow, type CustomerOption } from "./_components/AdsPageClient";

interface Props {
  searchParams: Promise<{ period?: string; customer?: string }>;
}

// Campaign exclusion rules (mirror of generate_ads_billing SQL function)
const SHOPPING_EXCLUSIONS = new Set([
  "ED | Shopping | Brand",
  "ED | Shopping | All Products | Brand",
  "ED | Performance Max | Brand Batch 2",
]);

const SEARCH_EXCLUSIONS = new Set([
  "Branded",
  "ED | Search | Wholesale Sock Deals Brand ONLY",
  "ED | Search | Brand _Real Estate Posts",
  "ED | Search - Brand",
  "ED | Search Branded",
  "ED | Search | Brand - White River",
  "ED | Search | Branded | US & CA",
  "ED | Brand",
  "ED | Search | Brand - Mouldings",
  "ED | Search | Brand KTM Twins",
  "ED | Search | Brand",
  "ED | Search | Branded",
  "ED | Search | DFO Brand",
  "ED | Search | new_Brand",
  "ED | Brand Terms",
  "ED | Search | AllTimeTrading - Brand",
  "ED | Search | Branded US",
  "ED | Search | Branded CA",
  "ED | Search | Branded | CA",
  "ED | Search - Brand (Tambour Touch)",
]);

const SHOPPING_CHANNEL_TYPES = new Set([3, 4, 6, 10]); // Display, Shopping, Video, PMax

function getBillableStatus(campaign_name: string, channel_type: number): { billable: boolean; reason: string | null } {
  if (SHOPPING_CHANNEL_TYPES.has(channel_type)) {
    if (SHOPPING_EXCLUSIONS.has(campaign_name)) return { billable: false, reason: "Brand exclusion (Shopping)" };
    return { billable: true, reason: null };
  }
  if (channel_type === 2) {
    if (SEARCH_EXCLUSIONS.has(campaign_name)) return { billable: false, reason: "Brand exclusion (Search)" };
    return { billable: true, reason: null };
  }
  return { billable: false, reason: "Channel not billed" };
}

const CHANNEL_LABELS: Record<number, string> = {
  2: "Search", 3: "Display", 4: "Shopping", 6: "Video", 10: "PMax",
};

export default async function AdsPage({ searchParams }: Props) {
  const { period, customer } = await searchParams;
  const supabase = await createClient();

  // Periods list
  const { data: periodsRows } = await supabase
    .from("periods")
    .select("period_label, is_closed")
    .order("start_date", { ascending: false });

  const periods = periodsRows ?? [];

  // Default period: most recent with ads data
  let selectedPeriod = period ?? "";
  if (!selectedPeriod) {
    const { data: adsPeriods } = await supabase
      .from("google_ads_spend")
      .select("period_label")
      .order("period_label", { ascending: false })
      .limit(1)
      .single();
    selectedPeriod = adsPeriods?.period_label ?? periods[0]?.period_label ?? "";
  }

  // All customers with spend in this period (for the filter dropdown)
  const { data: customerRows } = await supabase
    .from("google_ads_spend")
    .select("google_ads_customer_id")
    .eq("period_label", selectedPeriod)
    .order("google_ads_customer_id");

  const uniqueCustomerIds = [...new Set((customerRows ?? []).map((r) => r.google_ads_customer_id))];

  // Resolve customer IDs → display names via client_platform_ids
  const { data: platformIds } = await supabase
    .from("client_platform_ids")
    .select("google_ads_customer_id, stripe_id")
    .in("google_ads_customer_id", uniqueCustomerIds);

  const { data: clients } = await supabase
    .from("clients")
    .select("stripe_id, display_name");

  const clientMap = new Map((clients ?? []).map((c) => [c.stripe_id, c.display_name]));
  const customerIdToName = new Map(
    (platformIds ?? []).map((p) => [
      p.google_ads_customer_id,
      clientMap.get(p.stripe_id) ?? p.google_ads_customer_id,
    ])
  );

  const customerOptions: CustomerOption[] = uniqueCustomerIds.map((id) => ({
    id,
    name: customerIdToName.get(id) ?? id,
  }));

  // Fetch spend rows
  const baseQuery = supabase
    .from("google_ads_spend")
    .select(
      "id, period_label, google_ads_customer_id, campaign_id, campaign_name, " +
      "channel_type, campaign_status, impressions, clicks, cost_usd, conversions, conversion_value, fetched_at"
    )
    .eq("period_label", selectedPeriod)
    .order("google_ads_customer_id")
    .order("channel_type")
    .order("conversion_value", { ascending: false });

  const { data: spendRows } = await (customer
    ? baseQuery.eq("google_ads_customer_id", customer)
    : baseQuery);

  type RawSpendRow = {
    id: number; period_label: string; google_ads_customer_id: string;
    campaign_id: string; campaign_name: string; channel_type: number;
    campaign_status: number; impressions: number; clicks: number;
    cost_usd: number; conversions: number; conversion_value: number; fetched_at: string;
  };

  // Enrich with billable status + display names
  const rows: AdsSpendRow[] = ((spendRows ?? []) as unknown as RawSpendRow[]).map((r) => {
    const { billable, reason } = getBillableStatus(r.campaign_name, r.channel_type);
    return {
      ...r,
      client_name: customerIdToName.get(r.google_ads_customer_id) ?? r.google_ads_customer_id,
      channel_label: CHANNEL_LABELS[r.channel_type] ?? `Type ${r.channel_type}`,
      billable,
      exclusion_reason: reason,
    };
  });

  return (
    <AdsPageClient
      rows={rows}
      periods={periods}
      selectedPeriod={selectedPeriod}
      selectedCustomer={customer ?? ""}
      customerOptions={customerOptions}
    />
  );
}
