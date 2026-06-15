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

export async function toggleReadyForBilling(id: number, value: boolean) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("expected_charges")
    .update({ ready_for_billing: value })
    .eq("id", id);
  if (error) throw error;
  revalidatePath("/billing");
}
