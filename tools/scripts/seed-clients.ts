#!/usr/bin/env tsx
// ============================================================
// Seed script — clients + client_billing_plans
//
// Run from repo root:
//   SUPABASE_URL=https://xxx.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
//   npx tsx tools/scripts/seed-clients.ts
//
// Or with .env.local values:
//   npx tsx --env-file=app/.env.local tools/scripts/seed-clients.ts
//
// Safe to re-run: uses upsert on stripe_id (clients) and
// deletes+reinserts billing plans for each client.
// ============================================================

import { createClient } from "@supabase/supabase-js";

// ── Load env ───────────────────────────────────────────────────────────────

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

// Service role client — bypasses RLS
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ── Import mock data ───────────────────────────────────────────────────────
// We import from the app's mock — same source of truth for Phase 1→2 transition.

import { clientDatabase } from "../../app/lib/mock/client-database.js";

// ── Seed ───────────────────────────────────────────────────────────────────

async function seed() {
  console.log(`Seeding ${clientDatabase.length} clients…\n`);

  let inserted = 0;
  let skipped  = 0;
  let errors   = 0;

  for (const c of clientDatabase) {
    // ── 1. Upsert client ────────────────────────────────────────────────────
    const { data: clientRow, error: clientErr } = await supabase
      .from("clients")
      .upsert(
        {
          stripe_id:         c.stripe_id,
          display_name:      c.display_name,
          primary_email:     c.primary_email,
          account_status:    c.account_status,
          batch:             c.batch,
          google_id:         c.google_id ?? null,
          accounts:          c.accounts,
          is_active:         c.is_active,
          deactivated_month: c.deactivated_month ?? null,
          start_date:        c.start_date ?? null,
          end_date:          c.end_date ?? null,
        },
        { onConflict: "stripe_id", ignoreDuplicates: false }
      )
      .select("id, display_name")
      .single();

    if (clientErr || !clientRow) {
      console.error(`  ✗ ${c.display_name}: ${clientErr?.message ?? "no row returned"}`);
      errors++;
      continue;
    }

    const clientId = clientRow.id as string;

    // ── 2. Replace billing plans ────────────────────────────────────────────
    // Delete existing plans first (idempotent re-seed)
    await supabase
      .from("client_billing_plans")
      .delete()
      .eq("client_id", clientId);

    if (c.billing_plans.length === 0) {
      console.log(`  ↷ ${c.display_name} — no billing plans, skipping`);
      skipped++;
      continue;
    }

    const plansToInsert = c.billing_plans.map((p) => ({
      client_id:         clientId,
      billing_plan:      p.billing_plan,
      billing_details:   p.billing_details ?? null,
      billing_pct:       p.billing_pct,
      billing_day:       p.billing_day ?? null,
      notes:             p.notes ?? null,
      projection_type:   p.projection_type,
      projection_amount: p.projection_amount ?? null,
      manual_overrides:  p.manual_overrides ?? {},
      effective_from:    p.effective_from,
      effective_to:      p.effective_to ?? null,
    }));

    const { error: planErr } = await supabase
      .from("client_billing_plans")
      .insert(plansToInsert);

    if (planErr) {
      console.error(`  ✗ ${c.display_name} plans: ${planErr.message}`);
      errors++;
      continue;
    }

    console.log(`  ✓ ${c.display_name} (${c.batch}) — ${plansToInsert.length} plan(s)`);
    inserted++;
  }

  console.log(`\n── Summary ──────────────────────────────`);
  console.log(`  Inserted: ${inserted}`);
  console.log(`  Skipped:  ${skipped}`);
  console.log(`  Errors:   ${errors}`);
  console.log(`─────────────────────────────────────────`);

  if (errors > 0) process.exit(1);
}

seed().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
