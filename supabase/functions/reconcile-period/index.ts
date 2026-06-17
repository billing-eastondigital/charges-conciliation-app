/**
 * reconcile-period — TypeScript port of the Python reconciliation engine.
 *
 * POST body: { period_label: string }
 *
 * Reads expected_charges + stripe_charges from DB, runs reconciliation,
 * writes reconciliation_results + exceptions + run record.
 *
 * Logic mirrors engine/reconciliation_engine/reconciler.py exactly:
 *   - Grain = (period, stripe_id)
 *   - Only PAID_NET charges contribute to collected_amount
 *   - Match tolerance = ±$0.01
 *   - AR rows with no stripe_id → MISSING_PAYMENT individually
 *   - Stripe-only stripe_ids → STRIPE_ONLY / FAILED_HARD / REFUNDED
 *   - FAILED_RETRY is informational only — never affects status or counts
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MATCH_TOLERANCE = 0.01;
const ENGINE_VERSION  = "edge-1.0.0";

const EXCEPTION_STATUSES = new Set([
  "OVERPAID", "UNDERPAID", "MISSING_PAYMENT", "STRIPE_ONLY", "FAILED_HARD", "REFUNDED",
]);

// ── Types ──────────────────────────────────────────────────────────────────────

interface ARLine {
  id: number;
  period_label: string;
  stripe_id: string | null;
  account_name: string;
  primary_email: string | null;
  batch: string | null;
  expected_amount: string; // numeric stored as string
}

interface StripeCharge {
  charge_id: string;
  period_label: string;
  stripe_id: string | null;
  customer_email: string | null;
  amount: string;
  charge_status: string;
}

interface ClientMeta {
  stripe_id: string;
  display_name: string;
  primary_email: string | null;
  batch: string | null;
  account_status: string | null;
}

interface ReconResult {
  period_label: string;
  stripe_id: string | null;
  expected_amount: number;
  collected_amount: number;
  variance: number;
  recon_status: string;
  display_name: string | null;
  primary_email: string | null;
  batch: string | null;
  account_status: string | null;
  paid_net_count: number;
  failed_count: number;
  refunded_count: number;
}

// ── Classification ─────────────────────────────────────────────────────────────

function classifyArStripe(expected: number, collected: number): string {
  if (collected === 0) return "MISSING_PAYMENT";
  const variance = collected - expected;
  if (Math.abs(variance) <= MATCH_TOLERANCE) return "MATCH";
  return variance > MATCH_TOLERANCE ? "OVERPAID" : "UNDERPAID";
}

// ── Reconciliation (pure — no I/O) ─────────────────────────────────────────────

function reconcile(
  arLines: ARLine[],
  charges: StripeCharge[],
  clientMeta: Map<string, ClientMeta>,
  periodLabel: string,
): ReconResult[] {
  // ── Group AR lines by stripe_id ──────────────────────────────────────────────
  const arByStripe = new Map<string, { expected: number; lines: ARLine[] }>();
  const arNoStripe: ARLine[] = [];

  for (const line of arLines) {
    if (!line.stripe_id) {
      arNoStripe.push(line);
    } else {
      const cur = arByStripe.get(line.stripe_id) ?? { expected: 0, lines: [] };
      arByStripe.set(line.stripe_id, {
        expected: cur.expected + parseFloat(line.expected_amount),
        lines: [...cur.lines, line],
      });
    }
  }

  // ── Group stripe charges by stripe_id ────────────────────────────────────────
  type StripeGroup = {
    paid_net: number; paid_net_count: number;
    failed_count: number; refunded_count: number;
    first_email: string | null;
  };
  const stripeById = new Map<string, StripeGroup>();

  for (const charge of charges) {
    if (!charge.stripe_id) continue;
    const grp = stripeById.get(charge.stripe_id) ?? {
      paid_net: 0, paid_net_count: 0, failed_count: 0, refunded_count: 0,
      first_email: charge.customer_email,
    };
    if (charge.charge_status === "PAID_NET") {
      grp.paid_net += parseFloat(charge.amount);
      grp.paid_net_count++;
    } else if (charge.charge_status === "FAILED_HARD") {
      grp.failed_count++;
    } else if (charge.charge_status === "REFUNDED") {
      grp.refunded_count++;
    }
    // FAILED_RETRY: informational only — no counts
    stripeById.set(charge.stripe_id, grp);
  }

  const results: ReconResult[] = [];

  // ── AR-side rows ─────────────────────────────────────────────────────────────
  for (const [stripeId, { expected, lines }] of arByStripe) {
    const meta = clientMeta.get(stripeId);
    const grp  = stripeById.get(stripeId);

    results.push({
      period_label:     periodLabel,
      stripe_id:        stripeId,
      expected_amount:  expected,
      collected_amount: grp?.paid_net       ?? 0,
      variance:         (grp?.paid_net ?? 0) - expected,
      recon_status:     classifyArStripe(expected, grp?.paid_net ?? 0),
      display_name:     meta?.display_name  ?? null,
      primary_email:    meta?.primary_email ?? lines[0].primary_email ?? null,
      batch:            meta?.batch         ?? lines[0].batch         ?? null,
      account_status:   meta?.account_status ?? null,
      paid_net_count:   grp?.paid_net_count  ?? 0,
      failed_count:     grp?.failed_count    ?? 0,
      refunded_count:   grp?.refunded_count  ?? 0,
    });
  }

  // ── AR rows with no stripe_id → MISSING_PAYMENT individually ─────────────────
  for (const line of arNoStripe) {
    const expected = parseFloat(line.expected_amount);
    results.push({
      period_label:     periodLabel,
      stripe_id:        null,
      expected_amount:  expected,
      collected_amount: 0,
      variance:         -expected,
      recon_status:     "MISSING_PAYMENT",
      display_name:     line.account_name,
      primary_email:    line.primary_email,
      batch:            line.batch,
      account_status:   null,
      paid_net_count:   0,
      failed_count:     0,
      refunded_count:   0,
    });
  }

  // ── Stripe-only stripe_ids (no AR row) ───────────────────────────────────────
  const arStripeIds = new Set(arByStripe.keys());
  for (const [stripeId, grp] of stripeById) {
    if (arStripeIds.has(stripeId)) continue;

    let status: string;
    if      (grp.paid_net_count > 0) status = "STRIPE_ONLY";
    else if (grp.failed_count   > 0) status = "FAILED_HARD";
    else if (grp.refunded_count > 0) status = "REFUNDED";
    else continue; // only FAILED_RETRY — skip

    const meta = clientMeta.get(stripeId);
    results.push({
      period_label:     periodLabel,
      stripe_id:        stripeId,
      expected_amount:  0,
      collected_amount: grp.paid_net,
      variance:         grp.paid_net,
      recon_status:     status,
      display_name:     meta?.display_name  ?? null,
      primary_email:    meta?.primary_email ?? grp.first_email ?? null,
      batch:            meta?.batch         ?? null,
      account_status:   meta?.account_status ?? null,
      paid_net_count:   grp.paid_net_count,
      failed_count:     grp.failed_count,
      refunded_count:   grp.refunded_count,
    });
  }

  return results;
}

// ── SHA-256 hash ───────────────────────────────────────────────────────────────

async function hashRows(rows: unknown[]): Promise<string> {
  const json = JSON.stringify(rows, null, 0);
  const buf  = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(json));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ── Main handler ───────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST")    return json({ error: "Method not allowed" }, 405);

  try {
    const { period_label } = (await req.json()) as { period_label?: string };
    if (!period_label) return json({ error: "period_label is required" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Validate period
    const { data: period } = await supabase
      .from("periods")
      .select("period_label, is_closed, start_date, end_date")
      .eq("period_label", period_label)
      .single();

    if (!period)          return json({ error: `Period "${period_label}" not found` }, 404);
    if (period.is_closed) return json({ error: `Period "${period_label}" is closed` }, 409);

    // ── Auto-generate expected_charges for SUBSCRIPTION clients ──────────────
    // Idempotent: deletes existing SUBSCRIPTION rows + any IMPORT rows for
    // SUBSCRIPTION clients, then re-inserts from projection_amount.
    // Mirrors the ADS pattern so the cron always reflects the current plan.
    {
      const { data: subClients } = await supabase
        .from("client_active_plans")
        .select("stripe_id, display_name, primary_email, batch, projection_amount, billing_plan, billing_pct, deactivated_month")
        .eq("billing_method", "SUBSCRIPTION")
        .eq("is_active", true)
        .not("stripe_id", "is", null);

      // Exclude clients LOST before this period (deactivated_month < period month).
      // A client churning in the current period is still billed their final month.
      const periodMonth = period.start_date.slice(0, 7); // "YYYY-MM"
      const activeSubClients = (subClients ?? []).filter(
        (c) => !c.deactivated_month || c.deactivated_month >= periodMonth,
      );

      if (activeSubClients && activeSubClients.length > 0) {
        const subStripeIds = activeSubClients.map((c) => c.stripe_id as string);

        // Delete existing SUBSCRIPTION rows (idempotent re-run)
        const { error: delSubErr } = await supabase
          .from("expected_charges")
          .delete()
          .eq("period_label", period_label)
          .eq("source", "SUBSCRIPTION");
        if (delSubErr) throw delSubErr;

        // Delete IMPORT rows for SUBSCRIPTION clients — auto-gen supersedes xlsx upload
        const { error: delImportErr } = await supabase
          .from("expected_charges")
          .delete()
          .eq("period_label", period_label)
          .eq("source", "IMPORT")
          .in("stripe_id", subStripeIds);
        if (delImportErr) throw delImportErr;

        const toInsert = activeSubClients.map((c) => ({
          period_label,
          stripe_id:       c.stripe_id,
          account_name:    c.display_name,
          primary_email:   c.primary_email,
          batch:           c.batch,
          source:          "SUBSCRIPTION",
          expected_amount: c.projection_amount != null
            ? Number(c.projection_amount).toFixed(4)
            : "0.0000",
          billing_plan: c.billing_plan,
          billing_pct:  c.billing_pct,
        }));

        const { error: autoInsertErr } = await supabase
          .from("expected_charges")
          .insert(toInsert);
        if (autoInsertErr) throw autoInsertErr;
      }
    }

    // ── Auto-generate expected_charges for ADS_REVENUE / ADS_COST clients ──────
    // Calls generate_ads_billing() which reads google_ads_spend for this period,
    // applies campaign filters (ED | prefix, brand exclusions, channel buckets),
    // and writes expected_charges rows with source = 'ADS_REVENUE' | 'ADS_COST'.
    // Idempotent: deletes and re-inserts ADS rows. Never touches IMPORT/SUBSCRIPTION.
    // Runs after SUBSCRIPTION auto-gen so the AR table is complete before reconciliation.
    {
      const { data: adsResult, error: adsErr } = await supabase
        .rpc("generate_ads_billing", { p_period_label: period_label });

      if (adsErr) {
        // Non-fatal: log and continue. If google_ads_spend has no data yet for this
        // period, the ADS clients will reconcile as MISSING_PAYMENT — which is correct
        // (ingest-google-ads hasn't run yet on their billing_day_one).
        console.warn(
          `[reconcile-period] generate_ads_billing warning for "${period_label}": ${adsErr.message}`,
        );
      } else if (adsResult && !adsResult.ok) {
        console.warn(
          `[reconcile-period] generate_ads_billing partial errors for "${period_label}":`,
          JSON.stringify(adsResult.errors),
        );
      } else {
        console.log(
          `[reconcile-period] generate_ads_billing: ${adsResult?.rows_inserted ?? 0} rows inserted, ` +
          `${adsResult?.rows_deleted ?? 0} deleted for "${period_label}"`,
        );
      }
    }

    // Load all data in parallel
    const [{ data: arRows }, { data: chargeRows }, { data: clientRows }] = await Promise.all([
      supabase.from("expected_charges")
        .select("id, period_label, stripe_id, account_name, primary_email, batch, expected_amount")
        .eq("period_label", period_label),
      supabase.from("stripe_charges")
        .select("charge_id, period_label, stripe_id, customer_email, amount, charge_status")
        .eq("period_label", period_label),
      supabase.from("clients")
        .select("stripe_id, display_name, primary_email, batch, account_status")
        .not("stripe_id", "is", null),
    ]);

    if (!arRows?.length) {
      return json({
        error: `No billing rows for "${period_label}". Upload billing sheet first via Admin → Import.`
      }, 400);
    }

    const clientMeta = new Map<string, ClientMeta>(
      (clientRows ?? [])
        .filter((c) => c.stripe_id)
        .map((c) => [c.stripe_id!, c as ClientMeta])
    );

    // Run reconciliation
    const results = reconcile(
      arRows as ARLine[],
      (chargeRows ?? []) as StripeCharge[],
      clientMeta,
      period_label,
    );

    // Compute hashes for provenance
    const [billingHash, stripeHash] = await Promise.all([
      hashRows(arRows),
      hashRows(chargeRows ?? []),
    ]);

    // 1. Create run record (PARTIAL)
    const { data: runData, error: runErr } = await supabase
      .from("reconciliation_runs")
      .insert({
        period_label,
        engine_version:    ENGINE_VERSION,
        triggered_by:      "edge-function",
        billing_file_name: `expected_charges:${period_label}`,
        billing_file_hash: billingHash,
        stripe_file_name:  `stripe_charges:${period_label}`,
        stripe_file_hash:  stripeHash,
        run_status:        "PARTIAL",
      })
      .select("id")
      .single();

    if (runErr || !runData) throw runErr ?? new Error("Failed to create run record");
    const runId: number = runData.id;

    // 2. Snapshot resolved/won't-fix exceptions before clearing so they survive the reinsert
    const { data: priorExceptions } = await supabase
      .from("exceptions")
      .select("stripe_id, resolution_status, resolution_note, resolved_at")
      .eq("period_label", period_label)
      .neq("resolution_status", "OPEN");

    const resolvedMap = new Map<string | null, { resolution_status: string; resolution_note: string | null; resolved_at: string | null }>(
      (priorExceptions ?? []).map((e) => [
        e.stripe_id as string | null,
        { resolution_status: e.resolution_status, resolution_note: e.resolution_note, resolved_at: e.resolved_at },
      ])
    );

    // Clear existing data for this period
    await supabase.from("exceptions").delete().eq("period_label", period_label);
    await supabase.from("reconciliation_results").delete().eq("period_label", period_label);

    // 3. Insert reconciliation_results
    const resultRows = results.map((r) => ({
      period_label:     r.period_label,
      stripe_id:        r.stripe_id,
      expected_amount:  r.expected_amount.toFixed(4),
      collected_amount: r.collected_amount.toFixed(2),
      variance:         r.variance.toFixed(4),
      recon_status:     r.recon_status,
      display_name:     r.display_name,
      primary_email:    r.primary_email,
      batch:            r.batch,
      account_status:   r.account_status,
      paid_net_count:   r.paid_net_count,
      failed_count:     r.failed_count,
      refunded_count:   r.refunded_count,
      run_id:           runId,
    }));

    for (let i = 0; i < resultRows.length; i += 200) {
      const { error } = await supabase
        .from("reconciliation_results")
        .insert(resultRows.slice(i, i + 200));
      if (error) throw error;
    }

    // 4. Fetch inserted result IDs for exception FK
    const { data: insertedIds } = await supabase
      .from("reconciliation_results")
      .select("id, stripe_id")
      .eq("period_label", period_label)
      .eq("run_id", runId);

    const resultIdMap = new Map<string | null, number>(
      (insertedIds ?? []).map((r) => [r.stripe_id as string | null, r.id as number])
    );

    // 5. Insert exceptions
    const exceptionRows = results
      .filter((r) => EXCEPTION_STATUSES.has(r.recon_status))
      .map((r) => ({
        period_label:      r.period_label,
        stripe_id:         r.stripe_id,
        result_id:         resultIdMap.get(r.stripe_id) ?? null,
        exception_type:    r.recon_status,
        expected_amount:   r.expected_amount.toFixed(4),
        collected_amount:  r.collected_amount.toFixed(2),
        variance:          r.variance.toFixed(4),
        display_name:      r.display_name,
        primary_email:     r.primary_email,
        batch:             r.batch,
        resolution_status: "OPEN",
      }));

    if (exceptionRows.length > 0) {
      for (let i = 0; i < exceptionRows.length; i += 200) {
        const { error } = await supabase.from("exceptions").insert(exceptionRows.slice(i, i + 200));
        if (error) throw error;
      }

      // Restore resolution status for exceptions that were already resolved before this run
      for (const [stripeId, prior] of resolvedMap) {
        if (!stripeId) continue;
        await supabase
          .from("exceptions")
          .update({
            resolution_status: prior.resolution_status,
            resolution_note:   prior.resolution_note,
            resolved_at:       prior.resolved_at,
          })
          .eq("period_label", period_label)
          .eq("stripe_id", stripeId);
      }
    }

    // 6. Update run with summary stats (COMPLETED)
    const counts: Record<string, number> = {};
    for (const r of results) counts[r.recon_status] = (counts[r.recon_status] ?? 0) + 1;

    const totalExpected  = results.reduce((s, r) => s + r.expected_amount,  0);
    const totalCollected = results.reduce((s, r) => s + r.collected_amount, 0);
    const totalVariance  = results.reduce((s, r) => s + r.variance,         0);

    await supabase.from("reconciliation_runs").update({
      run_status:        "COMPLETED",
      total_expected:    totalExpected.toFixed(4),
      total_collected:   totalCollected.toFixed(2),
      total_variance:    totalVariance.toFixed(4),
      match_count:       counts["MATCH"]           ?? 0,
      overpaid_count:    counts["OVERPAID"]         ?? 0,
      underpaid_count:   counts["UNDERPAID"]        ?? 0,
      missing_count:     counts["MISSING_PAYMENT"]  ?? 0,
      stripe_only_count: counts["STRIPE_ONLY"]      ?? 0,
      failed_hard_count: counts["FAILED_HARD"]      ?? 0,
      refunded_count:    counts["REFUNDED"]         ?? 0,
    }).eq("id", runId);

    return json({
      ok: true,
      period_label,
      run_id:           runId,
      total_results:    results.length,
      total_exceptions: exceptionRows.length,
      counts,
      totals: {
        expected:  totalExpected.toFixed(4),
        collected: totalCollected.toFixed(2),
        variance:  totalVariance.toFixed(4),
      },
    }, 200);

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: message }, 500);
  }
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
