"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type EditableField =
  | "account_name" | "stripe_id" | "primary_email" | "batch"
  | "billing_plan" | "billing_pct"
  | "google_shopping_charge" | "google_search_charge"
  | "bing_charge" | "base_fee" | "other_charge" | "expected_amount";

const NUMERIC_FIELDS = new Set([
  "billing_pct", "google_shopping_charge", "google_search_charge",
  "bing_charge", "base_fee", "other_charge", "expected_amount",
]);

export async function updateExpectedCharge(
  id: number,
  field: EditableField,
  rawValue: string,
) {
  const supabase = await createClient();

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
