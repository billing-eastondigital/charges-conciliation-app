import { createClient } from "@/lib/supabase/server";
import { AdsPageClient, type AdsSpendRow, type CustomerOption } from "./_components/AdsPageClient";
import { setCampaignOverride } from "./actions";

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

// Only campaigns managed by Easton Digital are billable — must contain "ED |" in the name.
// Catches: "ED | ...", "PMax: ED | ...", "ED  | ..." (double-space typos).
function isEdCampaign(name: string): boolean {
  return /ED\s+\|/i.test(name);
}

function getBillableStatus(campaign_name: string, channel_type: number): { billable: boolean; reason: string | null } {
  if (SHOPPING_CHANNEL_TYPES.has(channel_type)) {
    if (SHOPPING_EXCLUSIONS.has(campaign_name)) return { billable: false, reason: "Brand exclusion (Shopping)" };
    if (!isEdCampaign(campaign_name)) return { billable: false, reason: "Non-ED campaign" };
    return { billable: true, reason: null };
  }
  if (channel_type === 2) {
    if (SEARCH_EXCLUSIONS.has(campaign_name)) return { billable: false, reason: "Brand exclusion (Search)" };
    if (!isEdCampaign(campaign_name)) return { billable: false, reason: "Non-ED campaign" };
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

  // All customers with spend in this period — paginate to bypass PostgREST max_rows=1000
  const allCustomerIdRows: { google_ads_customer_id: string }[] = [];
  for (let page = 0; ; page++) {
    const { data } = await supabase
      .from("google_ads_spend")
      .select("google_ads_customer_id")
      .eq("period_label", selectedPeriod)
      .order("google_ads_customer_id")
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    allCustomerIdRows.push(...data);
    if (data.length < 1000) break;
  }
  const uniqueCustomerIds = [...new Set(allCustomerIdRows.map((r) => r.google_ads_customer_id))];

  // Resolve customer IDs → display names via client_platform_ids
  // Must also scan other_ids.google_ads_additional_customer_ids for multi-account clients
  const { data: allPlatformIds } = await supabase
    .from("client_platform_ids")
    .select("google_ads_customer_id, stripe_id, other_ids");

  const { data: clients } = await supabase
    .from("clients")
    .select("stripe_id, display_name");

  const clientMap = new Map((clients ?? []).map((c) => [c.stripe_id, c.display_name]));
  const customerIdToName = new Map<string, string>();
  for (const p of allPlatformIds ?? []) {
    const name = clientMap.get(p.stripe_id) ?? p.stripe_id;
    if (p.google_ads_customer_id) customerIdToName.set(p.google_ads_customer_id, name);
    const additional: string[] = (p.other_ids as { google_ads_additional_customer_ids?: string[] } | null)
      ?.google_ads_additional_customer_ids ?? [];
    for (const id of additional) customerIdToName.set(id, name);
  }

  const customerOptions: CustomerOption[] = uniqueCustomerIds
    .map((id) => ({ id, name: customerIdToName.get(id) ?? id }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Fetch manual overrides for the selected period
  const { data: overrideRows } = await supabase
    .from("google_ads_campaign_overrides")
    .select("google_ads_customer_id, campaign_id, excluded, reason")
    .eq("period_label", selectedPeriod);

  // Build a quick lookup: "customerId:campaignId" → { excluded, reason }
  const overrideMap = new Map<string, { excluded: boolean; reason: string | null }>();
  for (const o of overrideRows ?? []) {
    overrideMap.set(`${o.google_ads_customer_id}:${o.campaign_id}`, {
      excluded: o.excluded,
      reason: o.reason,
    });
  }

  // Fetch spend rows — paginate to bypass PostgREST max_rows=1000
  const SPEND_SELECT = "id, period_label, google_ads_customer_id, campaign_id, campaign_name, " +
    "channel_type, campaign_status, impressions, clicks, cost_usd, conversions, conversion_value, fetched_at";

  let spendRows: Record<string, unknown>[] = [];
  if (customer) {
    const { data } = await supabase
      .from("google_ads_spend")
      .select(SPEND_SELECT)
      .eq("period_label", selectedPeriod)
      .eq("google_ads_customer_id", customer)
      .order("channel_type")
      .order("conversion_value", { ascending: false });
    spendRows = data ?? [];
  } else {
    for (let page = 0; ; page++) {
      const { data } = await supabase
        .from("google_ads_spend")
        .select(SPEND_SELECT)
        .eq("period_label", selectedPeriod)
        .order("google_ads_customer_id")
        .order("channel_type")
        .order("conversion_value", { ascending: false })
        .range(page * 1000, (page + 1) * 1000 - 1);
      if (!data || data.length === 0) break;
      spendRows.push(...data);
      if (data.length < 1000) break;
    }
  }

  type RawSpendRow = {
    id: number; period_label: string; google_ads_customer_id: string;
    campaign_id: string; campaign_name: string; channel_type: number;
    campaign_status: number; impressions: number; clicks: number;
    cost_usd: number; conversions: number; conversion_value: number; fetched_at: string;
  };

  // Enrich with billable status + display names + manual overrides
  const rows: AdsSpendRow[] = ((spendRows ?? []) as unknown as RawSpendRow[]).map((r) => {
    const { billable: systemBillable, reason: systemReason } = getBillableStatus(r.campaign_name, r.channel_type);
    const override = overrideMap.get(`${r.google_ads_customer_id}:${r.campaign_id}`);
    const manuallyExcluded = systemBillable && (override?.excluded ?? false);
    return {
      ...r,
      client_name: customerIdToName.get(r.google_ads_customer_id) ?? r.google_ads_customer_id,
      channel_label: CHANNEL_LABELS[r.channel_type] ?? `Type ${r.channel_type}`,
      billable: systemBillable && !manuallyExcluded,
      system_billable: systemBillable,
      manually_excluded: manuallyExcluded,
      exclusion_reason: manuallyExcluded ? (override?.reason ?? "Manual override") : systemReason,
    };
  });

  return (
    <AdsPageClient
      rows={rows}
      periods={periods}
      selectedPeriod={selectedPeriod}
      selectedCustomer={customer ?? ""}
      customerOptions={customerOptions}
      onToggleOverride={setCampaignOverride}
    />
  );
}
