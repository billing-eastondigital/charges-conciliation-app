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
    // "auto" = find the most recent open period, or create one for the current month
    let resolvedLabel = period_label;
    if (period_label === "auto") {
      const { data: openPeriod } = await supabase
        .from("periods")
        .select("period_label")
        .eq("is_closed", false)
        .order("start_date", { ascending: false })
        .limit(1)
        .single();

      if (openPeriod) {
        resolvedLabel = openPeriod.period_label;
      } else {
        // No open period — create one for the current UTC month
        const now = new Date();
        const year = now.getUTCFullYear();
        const month = now.getUTCMonth(); // 0-indexed
        const MONTH_NAMES = [
          "January","February","March","April","May","June",
          "July","August","September","October","November","December",
        ];
        const label = `${MONTH_NAMES[month]} ${year}`;
        const mm = String(month + 1).padStart(2, "0");
        const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
        const startDate = `${year}-${mm}-01`;
        const endDate   = `${year}-${mm}-${String(lastDay).padStart(2, "0")}`;

        const { error: createErr } = await supabase
          .from("periods")
          .insert({ period_label: label, start_date: startDate, end_date: endDate, is_closed: false });

        if (createErr) {
          // 23505 = unique_violation: period exists but is closed — don't auto-reopen
          if (createErr.code === "23505") {
            return json({ error: `Period "${label}" already exists and is closed. Open it manually to re-sync.` }, 409);
          }
          throw createErr;
        }
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

    const summary: Record<string, { inserted: number; skipped: boolean; reason?: string }> = {};
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

      summary[acct] = { inserted: rows.length, skipped: false };
      totalInserted += rows.length;
    }

    return json({ ok: true, period_label: resolvedLabel, total_inserted: totalInserted, accounts: summary }, 200);
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

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
