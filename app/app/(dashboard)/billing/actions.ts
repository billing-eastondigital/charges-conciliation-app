"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type ImportEditableField =
  | "account_name" | "stripe_id" | "primary_email" | "batch"
  | "google_shopping_charge" | "google_search_charge"
  | "bing_charge" | "base_fee" | "other_charge"
  | "billing_pct" | "expected_amount";

const NUMERIC_FIELDS = new Set([
  "billing_pct", "google_shopping_charge", "google_search_charge",
  "bing_charge", "base_fee", "other_charge", "expected_amount",
]);

export async function updateExpectedCharge(
  id: number,
  field: ImportEditableField,
  rawValue: string,
) {
  const supabase = await createClient();

  const { data: row } = await supabase
    .from("expected_charges")
    .select("source")
    .eq("id", id)
    .single();

  if (row?.source !== "IMPORT") {
    throw new Error("Only IMPORT rows can be edited manually.");
  }

  let value: string | number | null;
  if (rawValue.trim() === "") {
    value = null;
  } else if (NUMERIC_FIELDS.has(field)) {
    const n = parseFloat(rawValue.replace(/[,$\s]/g, ""));
    if (isNaN(n)) throw new Error(`Invalid number: ${rawValue}`);
    value = n;
  } else {
    value = rawValue.trim();
  }

  const { error } = await supabase
    .from("expected_charges")
    .update({ [field]: value })
    .eq("id", id);

  if (error) throw error;
  revalidatePath("/billing");
}

// Patch bing_revenue or dfw inside billing_detail jsonb for ADS rows,
// then recalculate expected_amount = base_fee + (ads_base + bing_revenue) * billing_pct + dfw
export async function updateAdsBillingDetail(
  id: number,
  field: "bing_revenue" | "dfw",
  rawValue: string,
) {
  const supabase = await createClient();

  const { data: row, error: fetchErr } = await supabase
    .from("expected_charges")
    .select("source, billing_detail, expected_amount")
    .eq("id", id)
    .single();

  if (fetchErr || !row) throw new Error("Row not found");
  if (row.source !== "ADS_REVENUE" && row.source !== "ADS_COST") {
    throw new Error("Only ADS rows can use this action.");
  }

  const value = rawValue.trim() === "" ? 0 : parseFloat(rawValue.replace(/[,$\s]/g, ""));
  if (isNaN(value)) throw new Error(`Invalid number: ${rawValue}`);

  const d = (row.billing_detail ?? {}) as Record<string, number>;
  const updated = { ...d, [field]: value };

  const base_fee    = updated.base_fee    ?? 0;
  const ads_base    = updated.ads_base    ?? 0;
  const bing_rev    = updated.bing_revenue ?? 0;
  const dfw_val     = updated.dfw         ?? 0;
  const billing_pct = updated.billing_pct ?? 0;

  const expected_amount = Math.round(
    (base_fee + (ads_base + bing_rev) * billing_pct + dfw_val) * 10000
  ) / 10000;

  const { error } = await supabase
    .from("expected_charges")
    .update({ billing_detail: updated, expected_amount })
    .eq("id", id);

  if (error) throw error;
  revalidatePath("/billing");
}

export async function toggleReadyForBilling(id: number, value: boolean) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("expected_charges")
    .update({ ready_for_billing: value })
    .eq("id", id);
  if (error) throw error;
  revalidatePath("/billing");
}

export async function createStripeInvoices(
  periodLabel: string,
  stripeId?: string,
): Promise<{ invoices_created: number; invoices_failed: number; errors: string[] }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) throw new Error("Supabase env vars not set");

  const res = await fetch(`${supabaseUrl}/functions/v1/create-stripe-invoices`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify({ period_label: periodLabel, ...(stripeId ? { stripe_id: stripeId } : {}) }),
  });

  const json = await res.json() as {
    ok: boolean;
    invoices_created?: number;
    invoices_failed?: number;
    results?: { error?: string }[];
    error?: string;
  };

  if (!res.ok || json.error) throw new Error(json.error ?? "Edge function error");

  revalidatePath("/billing");
  return {
    invoices_created: json.invoices_created ?? 0,
    invoices_failed: json.invoices_failed ?? 0,
    errors: (json.results ?? []).filter((r) => r.error).map((r) => r.error!),
  };
}
