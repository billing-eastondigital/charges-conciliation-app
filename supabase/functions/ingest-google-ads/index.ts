/**
 * ingest-google-ads — Pull campaign spend from the Google Ads reporting service
 * for clients whose billing_day_one = today, and store in google_ads_spend.
 *
 * POST body: { period_label?: "auto" | "June 2026" }
 *
 * Secrets required:
 *   GADS_API_URL  — base URL of the Google Ads reporting service
 *   GADS_API_KEY  — X-API-Key header value
 *
 * Billing window per client (America/Los_Angeles timezone):
 *   billing_day_one = 1  → full previous calendar month
 *   billing_day_one = N  → day N of previous month to day N-1 of current month
 *   billing_day_one = 31 → last day of month when month has fewer than 31 days
 *
 * Period attribution: expected_charges land in the CURRENT month (= month of execution),
 * regardless of the campaign window. A day-20 client running June 20 → "June 2026".
 *
 * Forensic rule: ALL campaigns are stored (including Brand, non-ED, zero-activity).
 * Filtering happens at billing calculation time (reconcile-period / generate_ads_billing).
 *
 * Per-client try/catch: one failing account does NOT abort the full run.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LA_TZ = "America/Los_Angeles";

// ── Types ─────────────────────────────────────────────────────────────────────

interface GAdsCampaign {
  id: number;
  name: string;
  channelType: number;
  status: number;
  clicks: number;
  impressions: number;
  cost: number;           // USD float
  conversions: number;
  conversionValue: number; // USD float
}

interface GAdsResponse {
  success: boolean;
  data: {
    dateRange: { start: string; end: string };
    campaigns: GAdsCampaign[];
  };
}

interface ActivePlan {
  stripe_id: string;
  google_ads_customer_id: string | null;
  billing_method: string;
  billing_day_one: number | null;
  base_fee: number;
  billing_percentage: number;
  other_ids: { google_ads_additional_customer_ids?: string[] } | null;
}

// ── Date helpers (America/Los_Angeles) ────────────────────────────────────────

function todayInLA(): { year: number; month: number; day: number } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: LA_TZ,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(now);
  const get = (t: string) => parseInt(parts.find((p) => p.type === t)!.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate(); // month is 1-based here; new Date(y, m, 0) = last day of month m-1
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function isoDate(year: number, month: number, day: number): string {
  const capped = Math.min(day, daysInMonth(year, month));
  return `${year}-${pad(month)}-${pad(capped)}`;
}

/**
 * Returns { startDate, endDate } for the campaign window of a given billing_day_one.
 * today = { year, month, day } in LA timezone.
 */
function campaignWindow(
  billingDay: number,
  today: { year: number; month: number; day: number },
): { startDate: string; endDate: string } {
  const { year, month } = today;

  // Previous month
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear  = month === 1 ? year - 1 : year;

  if (billingDay === 1) {
    // Full previous calendar month
    const lastDay = daysInMonth(prevYear, prevMonth);
    return {
      startDate: isoDate(prevYear, prevMonth, 1),
      endDate:   isoDate(prevYear, prevMonth, lastDay),
    };
  }

  // Day N: from day N of previous month to day N-1 of current month
  const endDay = billingDay - 1 === 0 ? daysInMonth(prevYear, prevMonth) : billingDay - 1;
  const endMonth = billingDay - 1 === 0 ? prevMonth : month;
  const endYear  = billingDay - 1 === 0 ? prevYear  : year;

  return {
    startDate: isoDate(prevYear, prevMonth, billingDay),
    endDate:   isoDate(endYear, endMonth, endDay),
  };
}

/**
 * Resolves the period_label string for the current execution month.
 * "auto" → "June 2026" style label for today's month in LA time.
 */
function resolvePeriodLabel(
  input: string | undefined,
  today: { year: number; month: number; day: number },
): string {
  if (input && input !== "auto") return input;
  const monthName = new Intl.DateTimeFormat("en-US", { month: "long" }).format(
    new Date(today.year, today.month - 1, 1),
  );
  return `${monthName} ${today.year}`;
}

// ── Google Ads API ─────────────────────────────────────────────────────────────

async function fetchCampaigns(
  apiUrl: string,
  apiKey: string,
  customerId: string,
  startDate: string,
  endDate: string,
): Promise<GAdsCampaign[]> {
  const url =
    `${apiUrl}/api/metrics/campaign-performance` +
    `?customerId=${customerId}&startDate=${startDate}&endDate=${endDate}`;

  const res = await fetch(url, {
    headers: { "X-API-Key": apiKey },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Google Ads API ${res.status} for customer ${customerId}: ${body.slice(0, 200)}`);
  }

  const json = (await res.json()) as GAdsResponse;

  if (!json.success) {
    throw new Error(`Google Ads API returned success=false for customer ${customerId}`);
  }

  return json.data.campaigns;
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const apiUrl = Deno.env.get("GADS_API_URL");
    const apiKey = Deno.env.get("GADS_API_KEY");

    if (!apiUrl || !apiKey) {
      throw new Error("Missing required secrets: GADS_API_URL and/or GADS_API_KEY");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = req.method === "POST"
      ? (await req.json().catch(() => ({}) as Record<string, string>))
      : {};

    const today = todayInLA();
    const periodLabel = resolvePeriodLabel(body.period_label, today);
    // billing_day_override: for testing only — simulates running on a different billing day
    const billingDay: number = body.billing_day_override ? parseInt(body.billing_day_override) : today.day;

    // Verify period exists in DB (or create it)
    const { data: period, error: periodErr } = await supabase
      .from("periods")
      .select("period_label, start_date, end_date, is_closed")
      .eq("period_label", periodLabel)
      .maybeSingle();

    if (periodErr) throw new Error(`Period lookup failed: ${periodErr.message}`);
    if (!period) throw new Error(`Period "${periodLabel}" not found in DB. Create it first.`);
    if (period.is_closed) throw new Error(`Period "${periodLabel}" is closed — cannot re-ingest.`);

    // Load all active ADS_REVENUE / ADS_COST clients that have a google_ads_customer_id
    // and whose billing_day_one = today's day (LA timezone), or the override day for testing
    const { data: plans, error: plansErr } = await supabase
      .from("client_active_plans")
      .select("stripe_id, google_ads_customer_id, billing_method, billing_day_one, base_fee, billing_percentage, other_ids")
      .in("billing_method", ["ADS_REVENUE", "ADS_COST"])
      .not("google_ads_customer_id", "is", null)
      .eq("billing_day_one", billingDay);

    if (plansErr) throw new Error(`Plans query failed: ${plansErr.message}`);

    const duePlans = (plans ?? []) as ActivePlan[];

    const results: Array<{
      stripe_id: string;
      google_ads_customer_id: string;
      ok: boolean;
      inserted?: number;
      error?: string;
    }> = [];

    let totalInserted = 0;

    for (const plan of duePlans) {
      // Build list: primary ID first, then any additional IDs from other_ids
      const additionalIds: string[] = plan.other_ids?.google_ads_additional_customer_ids ?? [];
      const allCustomerIds = [plan.google_ads_customer_id!, ...additionalIds];

      for (const customerId of allCustomerIds) {
        try {
          const { startDate, endDate } = campaignWindow(plan.billing_day_one!, today);

          const campaigns = await fetchCampaigns(apiUrl, apiKey, customerId, startDate, endDate);

          // Idempotent: delete existing rows for this (period, customer) then re-insert
          const { error: deleteErr } = await supabase
            .from("google_ads_spend")
            .delete()
            .eq("period_label", periodLabel)
            .eq("google_ads_customer_id", customerId);

          if (deleteErr) throw new Error(`Delete failed: ${deleteErr.message}`);

          if (campaigns.length === 0) {
            results.push({ stripe_id: plan.stripe_id, google_ads_customer_id: customerId, ok: true, inserted: 0 });
            continue;
          }

          const rows = campaigns.map((c) => ({
            period_label:           periodLabel,
            google_ads_customer_id: customerId,
            campaign_id:            String(c.id),
            campaign_name:          c.name,
            channel_type:           c.channelType,
            campaign_status:        c.status,
            impressions:            c.impressions,
            clicks:                 c.clicks,
            cost_usd:               c.cost,
            conversions:            c.conversions,
            conversion_value:       c.conversionValue,
            fetched_at:             new Date().toISOString(),
          }));

          const { error: insertErr } = await supabase
            .from("google_ads_spend")
            .insert(rows);

          if (insertErr) throw new Error(`Insert failed: ${insertErr.message}`);

          totalInserted += rows.length;
          results.push({
            stripe_id: plan.stripe_id,
            google_ads_customer_id: customerId,
            ok: true,
            inserted: rows.length,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[ingest-google-ads] Failed for ${plan.stripe_id} (${customerId}): ${msg}`);
          results.push({
            stripe_id: plan.stripe_id,
            google_ads_customer_id: customerId,
            ok: false,
            error: msg,
          });
        }
      }
    }

    const successCount = results.filter((r) => r.ok).length;
    const failCount    = results.filter((r) => !r.ok).length;

    return new Response(
      JSON.stringify({
        ok:                duePlans.length === 0 || failCount === 0,
        period_label:      periodLabel,
        billing_day:       today.day,
        clients_due:       duePlans.length,
        clients_processed: successCount,
        clients_failed:    failCount,
        campaigns_inserted: totalInserted,
        results,
      }),
      { headers: { ...CORS, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ingest-google-ads] Fatal:", msg);
    return new Response(
      JSON.stringify({ ok: false, error: msg }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }
});
