/**
 * ingest-stripe — Pull charges from Stripe API for a period and upsert into stripe_charges.
 *
 * POST body: { period_label: string, account?: "main" | "launch" | "both" }
 *
 * Secrets required (set via `supabase secrets set`):
 *   STRIPE_SECRET_KEY_MAIN   — main Stripe account secret key
 *   STRIPE_SECRET_KEY_LAUNCH — Launch Stripe account secret key (optional)
 *
 * Timezone note:
 *   Main account charges are in EST (UTC-5). The query window is shifted by +5h
 *   so that "March 2026" captures 2026-03-01 05:00 UTC → 2026-04-01 04:59 UTC,
 *   which equals 2026-03-01 00:00 EST → 2026-03-31 23:59 EST.
 *   Launch account uses UTC as-is.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ChargeStatus = "PAID_NET" | "FAILED_RETRY" | "FAILED_HARD" | "REFUNDED";
type Account = "main" | "launch";

interface StripeCharge {
  id: string;
  customer: string | null;
  billing_details: { email: string | null } | null;
  description: string | null;
  amount: number;          // cents
  currency: string;
  created: number;         // unix seconds UTC
  status: string;          // "succeeded" | "failed" | "pending"
  amount_refunded: number; // cents
  refunds: {
    data: Array<{ id: string; created: number; amount: number }>;
  } | null;
  failure_code: string | null;
}

interface StripePage {
  object: string;
  data: StripeCharge[];
  has_more: boolean;
}

// ── Stripe API ────────────────────────────────────────────────────────────────

async function fetchAllCharges(
  apiKey: string,
  startUnix: number,
  endUnix: number,
): Promise<StripeCharge[]> {
  const charges: StripeCharge[] = [];
  let startingAfter: string | null = null;

  while (true) {
    const params = new URLSearchParams({
      "created[gte]": String(startUnix),
      "created[lte]": String(endUnix),
      limit: "100",
    });
    // Expand refund data so we can capture refunded_at
    params.append("expand[]", "data.refunds");
    if (startingAfter) params.set("starting_after", startingAfter);

    const res = await fetch(`https://api.stripe.com/v1/charges?${params}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(
        `Stripe API ${res.status}: ${(body as { error?: { message?: string } }).error?.message ?? res.statusText}`,
      );
    }

    const page = (await res.json()) as StripePage;
    charges.push(...page.data);
    if (!page.has_more || page.data.length === 0) break;
    startingAfter = page.data[page.data.length - 1].id;
  }

  return charges;
}

// ── Classification ────────────────────────────────────────────────────────────

function classifyCharges(charges: StripeCharge[]): Map<string, ChargeStatus> {
  // Customers who have at least one succeeded charge → failed charges become FAILED_RETRY
  const succeededCustomers = new Set<string>();
  for (const c of charges) {
    if (c.status === "succeeded" && c.customer) succeededCustomers.add(c.customer);
  }

  const result = new Map<string, ChargeStatus>();
  for (const c of charges) {
    let status: ChargeStatus;
    if (c.status === "succeeded") {
      const fullyRefunded = c.amount_refunded > 0 && c.amount_refunded >= c.amount;
      status = fullyRefunded ? "REFUNDED" : "PAID_NET";
    } else if (c.status === "failed") {
      status = c.customer && succeededCustomers.has(c.customer) ? "FAILED_RETRY" : "FAILED_HARD";
    } else {
      // pending or unknown — treat conservatively
      status = "FAILED_HARD";
    }
    result.set(c.id, status);
  }
  return result;
}

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json() as {
      period_label?: string;
      account?: string;
    };

    const { period_label, account = "both" } = body;

    if (!period_label) {
      return json({ error: "period_label is required" }, 400);
    }

    if (!["main", "launch", "both"].includes(account)) {
      return json({ error: 'account must be "main", "launch", or "both"' }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Fetch period dates
    // "auto" = always target the CURRENT calendar month (create if missing)
    let resolvedLabel = period_label;
    if (period_label === "auto") {
      const now = new Date();
      const year = now.getUTCFullYear();
      const month = now.getUTCMonth(); // 0-indexed
      const MONTH_NAMES = [
        "January","February","March","April","May","June",
        "July","August","September","October","November","December",
      ];
      const label = `${MONTH_NAMES[month]} ${year}`;

      const { data: existing } = await supabase
        .from("periods")
        .select("period_label, is_closed")
        .eq("period_label", label)
        .maybeSingle();

      if (existing) {
        if (existing.is_closed) {
          return json({ error: `Period "${label}" is closed. Open it manually to re-sync.` }, 409);
        }
        resolvedLabel = label;
      } else {
        // Period doesn't exist yet — create it
        const mm = String(month + 1).padStart(2, "0");
        const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
        const startDate = `${year}-${mm}-01`;
        const endDate   = `${year}-${mm}-${String(lastDay).padStart(2, "0")}`;

        const { error: createErr } = await supabase
          .from("periods")
          .insert({ period_label: label, start_date: startDate, end_date: endDate, is_closed: false });

        if (createErr) throw createErr;
        resolvedLabel = label;
      }
    }

    const { data: period, error: pErr } = await supabase
      .from("periods")
      .select("period_label, start_date, end_date, is_closed")
      .eq("period_label", resolvedLabel)
      .single();

    if (pErr || !period) {
      return json({ error: `Period "${resolvedLabel}" not found` }, 404);
    }

    if (period.is_closed) {
      return json({ error: `Period "${resolvedLabel}" is closed and cannot be re-synced` }, 409);
    }

    const accounts: Account[] = account === "both" ? ["main", "launch"] : [account as Account];

    const summary: Record<string, { inserted: number; skipped: boolean; reason?: string; new_clients?: number }> = {};
    let totalInserted = 0;

    for (const acct of accounts) {
      const keyName = acct === "main" ? "STRIPE_SECRET_KEY_MAIN" : "STRIPE_SECRET_KEY_LAUNCH";
      const apiKey = Deno.env.get(keyName);

      if (!apiKey) {
        summary[acct] = { inserted: 0, skipped: true, reason: `${keyName} not configured` };
        continue;
      }

      // Build UTC window for Stripe API query
      // Main account: charges are in EST (UTC-5) → shift window by +5 hours
      // Launch account: UTC is correct
      const estOffsetMs = acct === "main" ? 5 * 3600 * 1000 : 0;
      const startUnix = Math.floor(
        (new Date(`${period.start_date}T00:00:00Z`).getTime() + estOffsetMs) / 1000,
      );
      const endUnix = Math.floor(
        (new Date(`${period.end_date}T23:59:59Z`).getTime() + estOffsetMs) / 1000,
      );

      const charges = await fetchAllCharges(apiKey, startUnix, endUnix);

      if (charges.length === 0) {
        summary[acct] = { inserted: 0, skipped: false };
        continue;
      }

      // ── Auto-create placeholder clients for unknown stripe IDs ────────────
      const uniqueCustomerIds = [
        ...new Set(charges.map((c) => c.customer).filter(Boolean)),
      ] as string[];

      if (uniqueCustomerIds.length > 0) {
        const { data: existingClients } = await supabase
          .from("clients")
          .select("stripe_id")
          .in("stripe_id", uniqueCustomerIds);

        const knownIds = new Set((existingClients ?? []).map((c) => c.stripe_id));
        const unknownIds = uniqueCustomerIds.filter((id) => !knownIds.has(id));

        if (unknownIds.length > 0) {
          // Build email lookup from charge billing_details
          const emailByCustomer = new Map<string, string>();
          for (const c of charges) {
            if (c.customer && c.billing_details?.email) {
              emailByCustomer.set(c.customer, c.billing_details.email);
            }
          }

          const placeholders = unknownIds.map((id) => {
            const email = emailByCustomer.get(id) ?? `unknown+${id}@placeholder.stripe`;
            return {
              stripe_id:    id,
              display_name: emailByCustomer.get(id) ?? id,
              primary_email: email,
              // account_status, batch, accounts, is_active all use DB defaults
            };
          });

          // ignoreDuplicates: true = ON CONFLICT DO NOTHING (safe for concurrent runs)
          const { error: clientErr } = await supabase
            .from("clients")
            .upsert(placeholders, { onConflict: "stripe_id", ignoreDuplicates: true });

          if (clientErr) throw clientErr;

          summary[acct] = { ...(summary[acct] ?? {}), inserted: 0, skipped: false, new_clients: unknownIds.length };
        }
      }

      const statuses = classifyCharges(charges);

      const rows = charges.map((c) => {
        const firstRefund = c.refunds?.data?.[0] ?? null;
        return {
          charge_id:        c.id,
          period_label:     resolvedLabel,
          stripe_id:        c.customer ?? null,
          customer_email:   c.billing_details?.email ?? null,
          description:      c.description ?? null,
          amount:           (c.amount / 100).toFixed(2),
          currency:         c.currency ?? "usd",
          created_at_stripe: new Date(c.created * 1000).toISOString(),
          charge_status:    statuses.get(c.id)!,
          amount_refunded:  (c.amount_refunded / 100).toFixed(2),
          refunded_at:      firstRefund
            ? new Date(firstRefund.created * 1000).toISOString()
            : null,
          raw_stripe_status: c.status,
          source_account:   acct,
        };
      });

      // Upsert — idempotent; also retroactively sets source_account on CSV-loaded rows
      const { error: upsertErr } = await supabase
        .from("stripe_charges")
        .upsert(rows, { onConflict: "charge_id" });

      if (upsertErr) throw upsertErr;

      summary[acct] = { ...(summary[acct] ?? {}), inserted: rows.length, skipped: false };
      totalInserted += rows.length;
    }

    // ── Settlement catch-up: re-sync previous month if still open ──────────
    // ACH charges can settle 3–5 business days after creation, crossing a
    // month boundary. If last month's period is still open, re-run it so
    // any pending→succeeded transitions get picked up automatically.
    let settlementResult: Record<string, unknown> | null = null;
    if (period_label === "auto") {
      const now2 = new Date();
      const prevMonth = now2.getUTCMonth() === 0 ? 11 : now2.getUTCMonth() - 1;
      const prevYear  = now2.getUTCMonth() === 0 ? now2.getUTCFullYear() - 1 : now2.getUTCFullYear();
      const MONTH_NAMES2 = [
        "January","February","March","April","May","June",
        "July","August","September","October","November","December",
      ];
      const prevLabel = `${MONTH_NAMES2[prevMonth]} ${prevYear}`;

      const { data: prevPeriod } = await supabase
        .from("periods")
        .select("period_label, is_closed")
        .eq("period_label", prevLabel)
        .maybeSingle();

      if (prevPeriod && !prevPeriod.is_closed) {
        const { data: pendingRows } = await supabase
          .from("stripe_charges")
          .select("charge_id")
          .eq("period_label", prevLabel)
          .eq("raw_stripe_status", "pending")
          .limit(1);

        if (pendingRows && pendingRows.length > 0) {
          // There are pending charges in the previous month — re-sync it
          const prevPeriodFull = await supabase
            .from("periods")
            .select("period_label, start_date, end_date, is_closed")
            .eq("period_label", prevLabel)
            .single();

          if (prevPeriodFull.data) {
            const p = prevPeriodFull.data;
            let prevTotal = 0;
            const prevSummary: Record<string, unknown> = {};
            for (const acct of accounts) {
              const keyName = acct === "main" ? "STRIPE_SECRET_KEY_MAIN" : "STRIPE_SECRET_KEY_LAUNCH";
              const apiKey = Deno.env.get(keyName);
              if (!apiKey) { prevSummary[acct] = { skipped: true }; continue; }

              const estOffsetMs = acct === "main" ? 5 * 3600 * 1000 : 0;
              const startUnix = Math.floor((new Date(`${p.start_date}T00:00:00Z`).getTime() + estOffsetMs) / 1000);
              const endUnix   = Math.floor((new Date(`${p.end_date}T23:59:59Z`).getTime() + estOffsetMs) / 1000);
              const prevCharges = await fetchAllCharges(apiKey, startUnix, endUnix);
              if (prevCharges.length === 0) { prevSummary[acct] = { inserted: 0 }; continue; }

              const prevStatuses = classifyCharges(prevCharges);
              const prevRows = prevCharges.map((c) => {
                const firstRefund = c.refunds?.data?.[0] ?? null;
                return {
                  charge_id: c.id, period_label: prevLabel,
                  stripe_id: c.customer ?? null, customer_email: c.billing_details?.email ?? null,
                  description: c.description ?? null, amount: (c.amount / 100).toFixed(2),
                  currency: c.currency ?? "usd", created_at_stripe: new Date(c.created * 1000).toISOString(),
                  charge_status: prevStatuses.get(c.id)!, amount_refunded: (c.amount_refunded / 100).toFixed(2),
                  refunded_at: firstRefund ? new Date(firstRefund.created * 1000).toISOString() : null,
                  raw_stripe_status: c.status, source_account: acct,
                };
              });
              const { error: prevErr } = await supabase.from("stripe_charges").upsert(prevRows, { onConflict: "charge_id" });
              if (prevErr) throw prevErr;
              prevSummary[acct] = { inserted: prevRows.length };
              prevTotal += prevRows.length;
            }
            settlementResult = { period_label: prevLabel, total_inserted: prevTotal, accounts: prevSummary };
          }
        }
      }
    }

    // ── Auto-reconcile ─────────────────────────────────────────────────────────
    // After every successful sync, run reconciliation so the dashboard stays
    // current without requiring a manual trigger. If billing data hasn't been
    // uploaded yet the reconcile call returns 400 and we surface it as
    // "skipped" — the sync itself is still considered successful.
    const autoReconcileResult  = await callReconcile(resolvedLabel);
    const autoReconcileCatchup = settlementResult
      ? await callReconcile((settlementResult as { period_label: string }).period_label)
      : null;

    return json({
      ok: true,
      period_label:   resolvedLabel,
      total_inserted: totalInserted,
      accounts:       summary,
      settlement_catchup: settlementResult,
      auto_reconcile: {
        current:  autoReconcileResult,
        catchup:  autoReconcileCatchup,
      },
    }, 200);
  } catch (err) {
    let message: string;
    if (err instanceof Error) {
      message = err.message;
    } else if (err && typeof err === "object" && "message" in err) {
      message = String((err as { message: unknown }).message);
    } else {
      message = String(err);
    }
    return json({ error: message }, 500);
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Call reconcile-period for the given label.
 * Returns a summary object — never throws, so a reconcile failure doesn't
 * roll back a successful Stripe sync.
 */
async function callReconcile(
  periodLabel: string,
): Promise<{ ok: boolean; skipped?: boolean; reason?: string; run_id?: number; counts?: Record<string, number> }> {
  const supabaseUrl     = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return { ok: false, skipped: true, reason: "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not available" };
  }

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/reconcile-period`, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ period_label: periodLabel }),
    });

    const body = await res.json() as Record<string, unknown>;

    if (!res.ok) {
      // 400 = no billing data yet — expected, not an error worth surfacing as failure
      const skipped = res.status === 400;
      return {
        ok:      false,
        skipped,
        reason:  (body.error as string | undefined) ?? `HTTP ${res.status}`,
      };
    }

    return {
      ok:     true,
      run_id: body.run_id as number | undefined,
      counts: body.counts as Record<string, number> | undefined,
    };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
