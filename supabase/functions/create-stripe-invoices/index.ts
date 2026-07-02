/**
 * create-stripe-invoices — Create Stripe invoices for rows marked ready_for_billing.
 *
 * Replaces the Make.com "Integration Stripe" scenario.
 * See docs/decisions/0006-native-stripe-invoicing.md for full context.
 *
 * POST body:
 *   { period_label: string, stripe_id?: string }
 *
 *   period_label  — required. Process all ready rows for this period.
 *   stripe_id     — optional. Limit to a single customer (useful for retry / per-row UI action).
 *
 * Secrets required:
 *   STRIPE_SECRET_KEY_MAIN — Stripe secret key (sk_live_… or sk_test_…)
 *
 * What it does (mirrors the Make.com flow):
 *   1. Query expected_charges WHERE ready_for_billing = true AND invoice_url IS NULL
 *      for the given period (and optional stripe_id filter).
 *   2. Group rows by stripe_id (one invoice per customer, even if they have multiple rows).
 *   3. For each customer group:
 *      a. Create a Stripe invoice (draft, send_invoice, days_until_due = 1).
 *      b. Add one invoice item per line item:
 *         - ADS rows: use billing_detail->'line_items' array [{text, amount}]
 *         - SUBSCRIPTION rows (no line_items): single item — account_name + expected_amount
 *      c. Update all matching expected_charges rows:
 *         stripe_invoice_id, invoice_url, invoice_status = 'draft'
 *   4. Return a summary: total invoices created, per-customer results, any errors.
 *
 * Note: invoices are left as DRAFT (auto_advance = false). The owner reviews and
 * finalizes/sends from Stripe Dashboard or via a future "Send Invoice" app action.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface LineItem {
  text: string;
  amount: number; // dollars (we multiply × 100 for Stripe)
}

interface ExpectedChargeRow {
  id: number;
  period_label: string;
  stripe_id: string;
  account_name: string;
  expected_amount: number; // dollars (numeric 12,4 from DB)
  source: string;          // 'SUBSCRIPTION' | 'ADS_REVENUE' | 'ADS_COST' | 'IMPORT'
  billing_detail: {
    memo?: string;
    line_items?: LineItem[];
    [key: string]: unknown;
  } | null;
}

interface InvoiceResult {
  stripe_id: string;
  account_name: string;
  invoice_id: string;
  invoice_url: string | null;
  line_item_count: number;
  total_cents: number;
  error?: string;
}

// ── Stripe helpers ────────────────────────────────────────────────────────────

async function stripePost(
  apiKey: string,
  path: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(body)) {
    if (v !== undefined && v !== null && v !== "") {
      params.set(k, String(v));
    }
  }

  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const json = await res.json();
  if (!res.ok) {
    const err = (json as { error?: { message?: string } }).error;
    throw new Error(`Stripe ${path} failed: ${err?.message ?? res.status}`);
  }
  return json as Record<string, unknown>;
}

// ── Invoice creation for one customer group ───────────────────────────────────

async function createInvoiceForCustomer(
  apiKey: string,
  stripeId: string,
  rows: ExpectedChargeRow[],
): Promise<{ invoiceId: string; invoiceUrl: string | null; lineItemCount: number; totalCents: number }> {
  // Build description (memo) from the first row that has one, or fall back to account name + period
  const firstRow = rows[0];
  const memo =
    rows.find((r) => r.billing_detail?.memo)?.billing_detail?.memo ??
    `${firstRow.account_name} ${firstRow.period_label} Invoice`;

  // Step 1: Create the invoice (draft)
  const invoice = await stripePost(apiKey, "/invoices", {
    customer: stripeId,
    collection_method: "send_invoice",
    days_until_due: 1,
    auto_advance: false,              // leave as draft — owner reviews before sending
    description: memo,
    pending_invoice_items_behavior: "exclude",
  });

  const invoiceId = invoice.id as string;
  let lineItemCount = 0;
  let totalCents = 0;

  // Step 2: Add invoice items — one Stripe item per line item across all rows
  for (const row of rows) {
    const lineItems = resolveLineItems(row);

    for (const li of lineItems) {
      if (li.amount <= 0) continue; // skip zero / negative (matches Make filter)

      const amountCents = Math.round(li.amount * 100);
      await stripePost(apiKey, "/invoiceitems", {
        customer: stripeId,
        invoice: invoiceId,
        currency: "usd",
        amount: amountCents,
        description: li.text,
      });

      lineItemCount++;
      totalCents += amountCents;
    }
  }

  const invoiceUrl = (invoice.hosted_invoice_url as string | null) ?? null;
  return { invoiceId, invoiceUrl, lineItemCount, totalCents };
}

/**
 * Resolve line items for a row.
 * - ADS rows: use billing_detail.line_items if present
 * - Everything else (SUBSCRIPTION, IMPORT): single item — account_name + expected_amount
 */
function resolveLineItems(row: ExpectedChargeRow): LineItem[] {
  const detail = row.billing_detail;

  if (
    detail?.line_items &&
    Array.isArray(detail.line_items) &&
    detail.line_items.length > 0
  ) {
    return detail.line_items;
  }

  // Fallback: single line item for SUBSCRIPTION / IMPORT rows
  return [
    {
      text: row.account_name,
      amount: Number(row.expected_amount),
    },
  ];
}

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { period_label, stripe_id: filterStripeId } = await req.json() as {
      period_label: string;
      stripe_id?: string;
    };

    if (!period_label) {
      return new Response(
        JSON.stringify({ ok: false, error: "period_label is required" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY_MAIN");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY_MAIN secret not set");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── 1. Fetch rows ready for billing with no invoice yet ──────────────────
    let query = supabase
      .from("expected_charges")
      .select("id, period_label, stripe_id, account_name, expected_amount, source, billing_detail")
      .eq("period_label", period_label)
      .eq("ready_for_billing", true)
      .is("invoice_url", null);

    if (filterStripeId) {
      query = query.eq("stripe_id", filterStripeId);
    }

    const { data: rows, error: fetchErr } = await query.returns<ExpectedChargeRow[]>();
    if (fetchErr) throw new Error(`DB query failed: ${fetchErr.message}`);
    if (!rows || rows.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, period_label, invoices_created: 0, skipped: true,
          message: "No rows found with ready_for_billing=true and invoice_url=null" }),
        { headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    // ── 2. Group by stripe_id ────────────────────────────────────────────────
    const groups = new Map<string, ExpectedChargeRow[]>();
    for (const row of rows) {
      if (!groups.has(row.stripe_id)) groups.set(row.stripe_id, []);
      groups.get(row.stripe_id)!.push(row);
    }

    // ── 3. Create one invoice per customer ───────────────────────────────────
    const results: InvoiceResult[] = [];

    for (const [stripeId, customerRows] of groups) {
      const accountName = customerRows[0].account_name;
      try {
        const { invoiceId, invoiceUrl, lineItemCount, totalCents } =
          await createInvoiceForCustomer(stripeKey, stripeId, customerRows);

        // Write back to all rows for this customer
        const { error: updateErr } = await supabase
          .from("expected_charges")
          .update({
            stripe_invoice_id: invoiceId,
            invoice_url: invoiceUrl,
            invoice_status: "draft",
          })
          .eq("period_label", period_label)
          .eq("stripe_id", stripeId)
          .eq("ready_for_billing", true)
          .is("invoice_url", null);   // only update the rows we just processed

        if (updateErr) {
          console.error(`Write-back failed for ${stripeId}: ${updateErr.message}`);
        }

        results.push({ stripe_id: stripeId, account_name: accountName,
          invoice_id: invoiceId, invoice_url: invoiceUrl, line_item_count: lineItemCount,
          total_cents: totalCents });

      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`Invoice creation failed for ${stripeId}: ${message}`);
        results.push({ stripe_id: stripeId, account_name: accountName,
          invoice_id: "", invoice_url: null, line_item_count: 0, total_cents: 0,
          error: message });
      }
    }

    const succeeded = results.filter((r) => !r.error);
    const failed = results.filter((r) => r.error);

    return new Response(
      JSON.stringify({
        ok: failed.length === 0,
        period_label,
        invoices_created: succeeded.length,
        invoices_failed: failed.length,
        results,
      }),
      { headers: { ...CORS, "Content-Type": "application/json" } },
    );

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("create-stripe-invoices fatal:", message);
    return new Response(
      JSON.stringify({ ok: false, error: message }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }
});
