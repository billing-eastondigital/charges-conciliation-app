"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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
