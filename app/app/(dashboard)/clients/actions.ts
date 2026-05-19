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
