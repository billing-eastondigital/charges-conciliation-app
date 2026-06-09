"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ClientBillingPlan } from "@/lib/types";

interface ClientLifecycleUpdate {
  start_date: string | null;
  end_date: string | null;
  account_status: "ACTIVE" | "LOST" | "INACTIVE";
  is_active: boolean;
  deactivated_month: string | null;
}

export async function updateClientLifecycle(
  stripeId: string,
  updates: ClientLifecycleUpdate
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("clients")
    .update({
      start_date:        updates.start_date,
      end_date:          updates.end_date,
      account_status:    updates.account_status,
      is_active:         updates.is_active,
      deactivated_month: updates.deactivated_month,
      updated_at:        new Date().toISOString(),
    })
    .eq("stripe_id", stripeId);

  if (error) throw error;
  revalidatePath("/clients");
}

interface ClientInfoUpdate {
  display_name: string;
  primary_email: string;
  batch: string;
  google_id: string | null;
  account_status: "ACTIVE" | "LOST" | "INACTIVE";
  is_active: boolean;
  start_date: string | null;
  end_date: string | null;
  deactivated_month: string | null;
}

export async function updateClientInfo(
  stripeId: string,
  updates: ClientInfoUpdate
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("clients")
    .update({
      display_name:      updates.display_name,
      primary_email:     updates.primary_email,
      batch:             updates.batch,
      google_id:         updates.google_id || null,
      account_status:    updates.account_status,
      is_active:         updates.is_active,
      start_date:        updates.start_date,
      end_date:          updates.end_date,
      deactivated_month: updates.deactivated_month,
      updated_at:        new Date().toISOString(),
    })
    .eq("stripe_id", stripeId);

  if (error) throw error;
  revalidatePath("/clients");
  revalidatePath(`/client/${stripeId}`);
}

export async function deleteClient(stripeId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("clients")
    .delete()
    .eq("stripe_id", stripeId);
  if (error) throw error;
  revalidatePath("/clients");
}

// ── Billing plan actions ──────────────────────────────────────────

const PLAN_FIELDS = (plan: ClientBillingPlan) => ({
  billing_plan:      plan.billing_plan,
  billing_details:   plan.billing_details,
  billing_method:    plan.billing_method,
  billing_pct:       plan.billing_pct,
  billing_day:       plan.billing_day,
  notes:             plan.notes,
  projection_type:   plan.projection_type,
  projection_amount: plan.projection_amount,
  manual_overrides:  plan.manual_overrides ?? {},
});

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

export async function addClientPlan(stripeId: string, plan: ClientBillingPlan) {
  const supabase = await createClient();
  const clientId = await getClientId(stripeId);
  const { error } = await supabase
    .from("client_billing_plans")
    .insert({ client_id: clientId, ...PLAN_FIELDS(plan), effective_from: plan.effective_from, effective_to: null });
  if (error) throw error;
  revalidatePath("/clients");
  revalidatePath("/admin/periods");
}

export async function updateClientPlan(stripeId: string, plan: ClientBillingPlan) {
  const supabase = await createClient();
  const clientId = await getClientId(stripeId);
  const { error } = await supabase
    .from("client_billing_plans")
    .update(PLAN_FIELDS(plan))
    .eq("client_id", clientId)
    .is("effective_to", null);
  if (error) throw error;
  revalidatePath("/clients");
  revalidatePath("/admin/periods");
}

export async function changeClientPlan(stripeId: string, effectiveTo: string, newPlan: ClientBillingPlan) {
  const supabase = await createClient();
  const clientId = await getClientId(stripeId);

  const { error: closeError } = await supabase
    .from("client_billing_plans")
    .update({ effective_to: effectiveTo })
    .eq("client_id", clientId)
    .is("effective_to", null);
  if (closeError) throw closeError;

  const { error: insertError } = await supabase
    .from("client_billing_plans")
    .insert({ client_id: clientId, ...PLAN_FIELDS(newPlan), effective_from: effectiveTo, effective_to: null });
  if (insertError) throw insertError;

  revalidatePath("/clients");
  revalidatePath("/admin/periods");
}
