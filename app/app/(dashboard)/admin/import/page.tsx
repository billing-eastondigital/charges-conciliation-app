import { createClient } from "@/lib/supabase/server";
import BillingImportClient from "./_components/BillingImportClient";
import StripeImportClient from "./_components/StripeImportClient";
import ReconcileClient from "./_components/ReconcileClient";

function fmtDatetime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  }) + " ET";
}

function hoursAgo(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 3_600_000;
}

export default async function ImportPage() {
  const supabase = await createClient();

  const [{ data: periodsRows }, { data: lastRunRows }, { data: stripeRows }] = await Promise.all([
    supabase.from("periods").select("period_label, is_closed").order("start_date", { ascending: false }),
    supabase.from("reconciliation_runs")
      .select("id, period_label, run_at, triggered_by, match_count, missing_count, overpaid_count, underpaid_count, stripe_only_count, failed_hard_count, refunded_count, run_status, error_message")
      .order("run_at", { ascending: false })
      .limit(5),
    supabase.from("stripe_charges")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  const periods = (periodsRows ?? []).map((p) => ({
    period_label: p.period_label,
    is_closed:    p.is_closed,
  }));

  const lastRun   = lastRunRows?.[0] ?? null;
  const lastSync  = stripeRows?.[0]?.created_at ?? null;
  const recentRuns = lastRunRows ?? [];

  // Cron is healthy if the most recent edge-function run was within the last 26 hours
  const lastCronRun = recentRuns.find((r) => r.triggered_by === "edge-function");
  const cronHealthy = lastCronRun ? hoursAgo(lastCronRun.run_at) < 26 : false;

  const functionsUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(".supabase.co", ".supabase.co/functions/v1") ??
    "https://unogorchezflktiweebg.supabase.co/functions/v1";

  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVub2dvcmNoZXpmbGt0aXdlZWJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MTgwNzYsImV4cCI6MjA5NDA5NDA3Nn0.4S3dM3Zl3nYdGLvSkKVESJRbWJwEy29byUXuc13PvcA";

  return (
    <div className="px-6 py-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-semibold text-[#3a3a3a]">Import Billing Sheet</h1>
        <p className="text-sm text-[#6b7280] mt-0.5">
          Upload the monthly AR billing xlsx to populate expected charges for a period.
          The file is parsed in your browser — only the extracted data is sent to the server.
        </p>
      </div>

      {/* How it works */}
      <div className="bg-[#F5F5F5] border border-[#dddddd] rounded-sm px-5 py-4">
        <p className="text-xs font-semibold text-[#6b7280] uppercase tracking-wide mb-3">How it works</p>
        <ol className="space-y-1.5 text-sm text-[#4B4F58] list-decimal list-inside">
          <li>Select the target period below</li>
          <li>Upload the billing xlsx — columns are auto-detected from the headers</li>
          <li>Review the preview and verify totals match your source file</li>
          <li>Click Import — existing AR lines for the period are replaced</li>
        </ol>
      </div>

      <BillingImportClient
        periods={periods}
        supabaseFunctionsUrl={functionsUrl}
        supabaseAnonKey={anonKey}
      />

      {/* ── Stripe Charges Sync ─────────────────────────────────────────── */}
      <div>
        <h2 className="text-base font-semibold text-[#3a3a3a]">Sync Stripe Charges</h2>
        <p className="text-sm text-[#6b7280] mt-0.5">
          Pull charges directly from the Stripe API for a period. Existing charges are updated
          in place — running this multiple times is safe.
        </p>
      </div>

      <div className="bg-[#F5F5F5] border border-[#dddddd] rounded-sm px-5 py-4">
        <p className="text-xs font-semibold text-[#6b7280] uppercase tracking-wide mb-3">How it works</p>
        <ol className="space-y-1.5 text-sm text-[#4B4F58] list-decimal list-inside">
          <li>Select the period and which Stripe account(s) to pull from</li>
          <li>The function fetches all charges within the period window from the Stripe API</li>
          <li>Each charge is classified (PAID_NET / FAILED_HARD / REFUNDED / FAILED_RETRY)</li>
          <li>Results are upserted into the database — existing rows are updated, not duplicated</li>
        </ol>
      </div>

      <StripeImportClient
        periods={periods}
        supabaseFunctionsUrl={functionsUrl}
        supabaseAnonKey={anonKey}
      />

      {/* ── Run Reconciliation ──────────────────────────────────────────── */}
      <div>
        <h2 className="text-base font-semibold text-[#3a3a3a]">Run Reconciliation</h2>
        <p className="text-sm text-[#6b7280] mt-0.5">
          Match expected charges against Stripe payments and compute variances.
          Run this after importing billing data and syncing Stripe charges.
          Re-running is safe — existing results for the period are replaced.
        </p>
      </div>

      <div className="bg-[#F5F5F5] border border-[#dddddd] rounded-sm px-5 py-4">
        <p className="text-xs font-semibold text-[#6b7280] uppercase tracking-wide mb-3">How it works</p>
        <ol className="space-y-1.5 text-sm text-[#4B4F58] list-decimal list-inside">
          <li>Reads all billing rows and Stripe charges for the selected period</li>
          <li>Groups by Stripe customer ID — only PAID_NET charges count toward collected amount</li>
          <li>Classifies each row: MATCH · OVERPAID · UNDERPAID · MISSING_PAYMENT · STRIPE_ONLY · FAILED_HARD · REFUNDED</li>
          <li>Writes results + opens exceptions for any non-MATCH rows</li>
        </ol>
      </div>

      <ReconcileClient
        periods={periods}
        supabaseFunctionsUrl={functionsUrl}
        supabaseAnonKey={anonKey}
      />

      {/* ── Pipeline Status ─────────────────────────────────────────────── */}
      <div>
        <h2 className="text-base font-semibold text-[#3a3a3a]">Pipeline Status</h2>
        <p className="text-sm text-[#6b7280] mt-0.5">
          Last automatic ingestion and reconciliation. The daily cron runs at 08:00 UTC.
        </p>
      </div>

      <div className="border border-[#dddddd] rounded-sm divide-y divide-[#eeeeee]">

        {/* Cron health banner */}
        <div className={`px-5 py-3 flex items-center gap-3 ${cronHealthy ? "bg-green-50" : "bg-amber-50"}`}>
          <span className={`inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${cronHealthy ? "bg-green-500" : "bg-amber-400"}`} />
          <div>
            <p className={`text-sm font-semibold ${cronHealthy ? "text-green-800" : "text-amber-800"}`}>
              {cronHealthy ? "Cron OK — ran within the last 24 hours" : "Cron may have missed — no edge-function run in the last 24 hours"}
            </p>
            {lastCronRun && (
              <p className={`text-xs mt-0.5 ${cronHealthy ? "text-green-700" : "text-amber-700"}`}>
                Last auto-run: {fmtDatetime(lastCronRun.run_at)} · {lastCronRun.period_label}
              </p>
            )}
          </div>
        </div>

        {/* Last Stripe sync */}
        <div className="px-5 py-3 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-[#6b7280] uppercase tracking-wide mb-0.5">Last Stripe Charge Inserted</p>
            <p className="text-sm text-[#3a3a3a]">
              {lastSync ? fmtDatetime(lastSync) : <span className="text-[#9ca3af]">No data</span>}
            </p>
          </div>
        </div>

        {/* Last reconciliation run */}
        {lastRun && (
          <div className="px-5 py-3">
            <p className="text-xs font-semibold text-[#6b7280] uppercase tracking-wide mb-2">Last Reconciliation Run</p>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <span className="text-[#3a3a3a]"><span className="text-[#6b7280]">Period:</span> {lastRun.period_label}</span>
              <span className="text-[#3a3a3a]"><span className="text-[#6b7280]">Run at:</span> {fmtDatetime(lastRun.run_at)}</span>
              <span className="text-[#3a3a3a]"><span className="text-[#6b7280]">Triggered by:</span> {lastRun.triggered_by}</span>
              <span className={`font-medium ${lastRun.run_status === "COMPLETED" ? "text-green-700" : "text-red-600"}`}>
                {lastRun.run_status}
              </span>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-0.5 mt-2 text-xs text-[#6b7280]">
              <span>✓ {lastRun.match_count} MATCH</span>
              {lastRun.overpaid_count  > 0 && <span className="text-amber-600">↑ {lastRun.overpaid_count} OVERPAID</span>}
              {lastRun.underpaid_count > 0 && <span className="text-amber-600">↓ {lastRun.underpaid_count} UNDERPAID</span>}
              {lastRun.missing_count   > 0 && <span className="text-red-500">✗ {lastRun.missing_count} MISSING</span>}
              {lastRun.stripe_only_count > 0 && <span>◌ {lastRun.stripe_only_count} STRIPE_ONLY</span>}
              {lastRun.failed_hard_count > 0 && <span className="text-red-500">✗ {lastRun.failed_hard_count} FAILED</span>}
              {lastRun.refunded_count  > 0 && <span>↩ {lastRun.refunded_count} REFUNDED</span>}
            </div>
            {lastRun.error_message && (
              <p className="mt-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-sm px-3 py-2">
                {lastRun.error_message}
              </p>
            )}
          </div>
        )}

        {/* Recent runs table */}
        {recentRuns.length > 1 && (
          <div className="px-5 py-3">
            <p className="text-xs font-semibold text-[#6b7280] uppercase tracking-wide mb-2">Recent Runs</p>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#eeeeee] text-[#6b7280]">
                  <th className="text-left pb-1.5 font-medium">Period</th>
                  <th className="text-left pb-1.5 font-medium">Run at (ET)</th>
                  <th className="text-left pb-1.5 font-medium">Triggered by</th>
                  <th className="text-right pb-1.5 font-medium">Match</th>
                  <th className="text-right pb-1.5 font-medium">Exceptions</th>
                  <th className="text-left pb-1.5 font-medium pl-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentRuns.map((r) => {
                  const exceptions = (r.overpaid_count ?? 0) + (r.underpaid_count ?? 0) + (r.missing_count ?? 0) + (r.stripe_only_count ?? 0) + (r.failed_hard_count ?? 0) + (r.refunded_count ?? 0);
                  return (
                    <tr key={r.id} className="border-b border-[#f5f5f5] last:border-0">
                      <td className="py-1.5 text-[#3a3a3a]">{r.period_label}</td>
                      <td className="py-1.5 text-[#6b7280]">{fmtDatetime(r.run_at)}</td>
                      <td className="py-1.5 text-[#6b7280]">{r.triggered_by}</td>
                      <td className="py-1.5 text-right text-green-700">{r.match_count}</td>
                      <td className={`py-1.5 text-right ${exceptions > 0 ? "text-amber-600" : "text-[#9ca3af]"}`}>{exceptions}</td>
                      <td className={`py-1.5 pl-3 font-medium ${r.run_status === "COMPLETED" ? "text-green-700" : "text-red-600"}`}>{r.run_status}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
