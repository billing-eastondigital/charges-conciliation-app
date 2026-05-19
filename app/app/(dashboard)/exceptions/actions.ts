"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ExceptionStatus } from "@/lib/types";

export async function resolveException(
  id: number,
  status: ExceptionStatus,
  note: string
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("exceptions")
    .update({
      resolution_status: status,
      resolution_note: note || null,
      resolved_at: new Date().toISOString(),
      resolved_by: "marco",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) throw error;
  revalidatePath("/exceptions");
}
