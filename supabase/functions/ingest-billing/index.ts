import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface ParsedRow {
  account_name: string;
  stripe_id: string | null;
  primary_email: string | null;
  batch: string | null;
  billing_plan: string | null;
  billing_pct: number | null;
  google_shopping_charge: number | null;
  google_search_charge: number | null;
  bing_charge: number | null;
  base_fee: number | null;
  expected_amount: number;
  source_row_index: number;
}

interface RequestBody {
  period_label: string;
  rows: ParsedRow[];
}

Deno.serve(async (req) => {
  // CORS headers
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body: RequestBody = await req.json();
    const { period_label, rows } = body;

    if (!period_label || !rows?.length) {
      return new Response(
        JSON.stringify({ error: "period_label and rows are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use service role to bypass RLS
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Verify period exists
    const { data: period } = await supabase
      .from("periods")
      .select("period_label, is_closed")
      .eq("period_label", period_label)
      .single();

    if (!period) {
      return new Response(
        JSON.stringify({ error: `Period "${period_label}" not found in database` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (period.is_closed) {
      return new Response(
        JSON.stringify({ error: `Period "${period_label}" is closed and cannot be modified` }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Auto-create placeholder clients for any stripe_id not yet in the clients table
    // (prevents FK violation on expected_charges.stripe_id → clients.stripe_id)
    const uniqueStripeIds = [...new Set(rows.map((r) => r.stripe_id).filter(Boolean))] as string[];
    let newClientCount = 0;
    if (uniqueStripeIds.length > 0) {
      const { data: existingClients } = await supabase
        .from("clients")
        .select("stripe_id")
        .in("stripe_id", uniqueStripeIds);

      const knownIds = new Set((existingClients ?? []).map((c) => c.stripe_id));
      const unknownIds = uniqueStripeIds.filter((id) => !knownIds.has(id));
      newClientCount = unknownIds.length;

      if (unknownIds.length > 0) {
        const emailByStripeId = new Map<string, string>();
        for (const r of rows) {
          if (r.stripe_id && r.primary_email) emailByStripeId.set(r.stripe_id, r.primary_email);
        }

        const placeholders = unknownIds.map((id) => ({
          stripe_id:     id,
          display_name:  emailByStripeId.get(id) ?? id,
          primary_email: emailByStripeId.get(id) ?? `unknown+${id}@placeholder.stripe`,
        }));

        const { error: clientErr } = await supabase
          .from("clients")
          .upsert(placeholders, { onConflict: "stripe_id", ignoreDuplicates: true });

        if (clientErr) throw clientErr;
      }
    }

    // Determine which batches are present in the upload
    const uploadedBatches = [...new Set(rows.map((r) => r.batch).filter((b) => b != null))] as string[];
    const hasNullBatch = rows.some((r) => r.batch == null);

    if (uploadedBatches.length > 0 && !hasNullBatch) {
      // Batch-scoped delete: only wipe rows belonging to the batches in this upload
      // Rows from other batches are preserved, so uploads can be done batch by batch
      const { error: deleteError } = await supabase
        .from("expected_charges")
        .delete()
        .eq("period_label", period_label)
        .in("batch", uploadedBatches);
      if (deleteError) throw deleteError;
    } else {
      // Full period wipe: upload contains null-batch rows or mixed content
      const { error: deleteError } = await supabase
        .from("expected_charges")
        .delete()
        .eq("period_label", period_label);
      if (deleteError) throw deleteError;
    }

    // Insert new rows
    const inserts = rows.map((r) => ({
      period_label,
      account_name:           r.account_name,
      stripe_id:              r.stripe_id   || null,
      primary_email:          r.primary_email || null,
      batch:                  r.batch       || null,
      billing_plan:           r.billing_plan || null,
      billing_pct:            r.billing_pct ?? null,
      google_shopping_charge: r.google_shopping_charge ?? null,
      google_search_charge:   r.google_search_charge   ?? null,
      bing_charge:            r.bing_charge             ?? null,
      base_fee:               r.base_fee                ?? null,
      expected_amount:        r.expected_amount,
      source_row_index:       r.source_row_index,
    }));

    const { error: insertError } = await supabase
      .from("expected_charges")
      .insert(inserts);

    if (insertError) throw insertError;

    return new Response(
      JSON.stringify({
        success: true,
        period_label,
        inserted: inserts.length,
        new_clients: newClientCount,
        batches: uploadedBatches.length > 0 ? uploadedBatches : null,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
