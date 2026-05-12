"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ClientBillingPlan } from "@/lib/types";

async function getClientId(stripeId: string): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .select("id")
    .eq("stripe_id", stripeId)
    .single();
  if (error || !data) throw new Error(`Client not found: ${stripeId}`);
  return data.id as string;
}

export async function updatePlan(stripeId: string, plan: ClientBillingPlan) {
  const supabase = await createClient();
  const clientId = await getClientId(stripeId);

  const { error } = await supabase
    .from("client_billing_plans")
    .update({
      billing_plan:      plan.billing_plan,
      billing_details:   plan.billing_details,
      billing_pct:       plan.billing_pct,
      billing_day:       plan.billing_day,
      notes:             plan.notes,
      projection_type:   plan.projection_type,
      projection_amount: plan.projection_amount,
      manual_overrides:  plan.manual_overrides,
    })
    .eq("client_id", clientId)
    .is("effective_to", null);

  if (error) throw error;
  revalidatePath("/admin/periods");
}

export async function changePlan(
  stripeId: string,
  effectiveTo: string,
  newPlan: ClientBillingPlan
) {
  const supabase = await createClient();
  const clientId = await getClientId(stripeId);

  // 1. Close the current active plan
  const { error: closeError } = await supabase
    .from("client_billing_plans")
    .update({ effective_to: effectiveTo })
    .eq("client_id", clientId)
    .is("effective_to", null);

  if (closeError) throw closeError;

  // 2. Insert the new plan
  const { error: insertError } = await supabase
    .from("client_billing_plans")
    .insert({
      client_id:         clientId,
      billing_plan:      newPlan.billing_plan,
      billing_details:   newPlan.billing_details,
      billing_pct:       newPlan.billing_pct,
      billing_day:       newPlan.billing_day,
      notes:             newPlan.notes,
      projection_type:   newPlan.projection_type,
      projection_amount: newPlan.projection_amount,
      manual_overrides:  newPlan.manual_overrides ?? {},
      effective_from:    effectiveTo,
      effective_to:      null,
    });

  if (insertError) throw insertError;
  revalidatePath("/admin/periods");
}
