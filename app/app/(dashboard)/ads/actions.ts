"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function setCampaignOverride(
  periodLabel: string,
  googleAdsCustomerId: string,
  campaignId: string,
  excluded: boolean,
  reason: string | null
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();

  if (excluded) {
    const { error } = await supabase
      .from("google_ads_campaign_overrides")
      .upsert(
        {
          period_label: periodLabel,
          google_ads_customer_id: googleAdsCustomerId,
          campaign_id: campaignId,
          excluded: true,
          reason: reason ?? "Manual override",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "period_label,google_ads_customer_id,campaign_id" }
      );
    if (error) return { ok: false, error: error.message };
  } else {
    // Remove the override entirely to restore default behavior
    const { error } = await supabase
      .from("google_ads_campaign_overrides")
      .delete()
      .eq("period_label", periodLabel)
      .eq("google_ads_customer_id", googleAdsCustomerId)
      .eq("campaign_id", campaignId);
    if (error) return { ok: false, error: error.message };
  }

  // Re-run generate_ads_billing so the exclusion is immediately reflected in expected_charges
  const { error: rpcError } = await supabase.rpc("generate_ads_billing", {
    p_period_label: periodLabel,
  });
  if (rpcError) return { ok: false, error: `Override saved but billing recalc failed: ${rpcError.message}` };

  revalidatePath("/ads");
  revalidatePath("/billing");
  return { ok: true };
}
