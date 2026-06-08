import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/format";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { MoneyCell, VarianceCell } from "@/components/shared/MoneyCell";
import { AuditMeta } from "./_components/AuditMeta";
import { PrintButton } from "./_components/PrintButton";
import { AuditFilters } from "./_components/AuditFilters";
import type { ReconciliationResult, ReconciliationStatus } from "@/lib/types";

// Run metadata — hardcoded until Phase 3 engine populates reconciliation_runs
const RUN_METADATA = {
  run_date:       "2026-05-01T09:14:33Z",
  engine_version: "v0.1.0-seed",
  source_files: [
    {
      type:     "AR Billing Sheet",
      filename: "billing_april_2026.xlsx",
      rows:     51,
      sha256:   "3f4a9c2e1b8d7f6a5c3e2b1d9f8a7c6e4b2d1f9a8c7e6b4d3f2a1c9e8b7d6f5a",
    },
    {
      type:     "Stripe Unified Payments Export",
      filename: "stripe_2026_ytd.csv",
      rows:     246,
      sha256:   "a7b3c9d2e5f1a8b4c6d3e9f2a5b7c1d4e8f3a6b2c5d9e7f4a1b8c3d6e2f9a4b7",
    },
  ],
};

const METHODOLOGY = [
  "Reconciliation grain: one row per (period, Stripe customer ID). Multiple AR billing lines sharing a Stripe ID are merged; constituent lines remain individually visible.",
  "Charge classification: only PAID_NET charges count toward collected amounts. FAILED_RETRY charges are informational. REFUNDED and FAILED charges surface as exceptions regardless of AR coverage.",
  "Period attribution: charges are attributed to a period when charge.created_at falls within [period.start_date, period.end_date] (inclusive).",
  "Match tolerance: ±$0.01. Any variance outside this range is classified as UNDERPAID or OVERPAID.",
  "Source integrity: inputs are SHA-256 hashed at ingest time. Reproducing this report from the same source files must yield identical results.",
];

const BATCH_ORDER = ["1", "2", "3", "5", "SUBSCRIPTION", "Consulting", "Multiple"];

interface Props {
  params:       Promise<{ period: string }>;
  searchParams: Promise<{ q?: string }>;
}

export default async function AuditPage({ params, searchParams }: Props) {
  const { period }    = await params;
  const { q: rawQ = "" } = await searchParams;
  const periodLabel   = decodeURIComponent(period);
  const q             = rawQ.toLowerCase().trim();

  const supabase = await createClient();

  // Fetch all data in parallel
  const [{ data: periodsRows }, { data: reconRows }, { data: exceptionRows }, { data: arRows }] =
    await Promise.all([
      supabase.from("periods").select("period_label, start_date, end_date, is_closed").order("start_date"),
      supabase.from("reconciliation_results").select("*").eq("period_label", periodLabel),
      supabase.from("exceptions").select("*").eq("period_label", periodLabel).eq("resolution_status", "OPEN"),
      supabase.from("expected_charges").select("*").eq("period_label", periodLabel),
    ]);

  const allPeriods = (periodsRows ?? []).map((p) => ({
    period_label: p.period_label,
    start_date:   p.start_date,
    end_date:     p.end_date,
    closed:       p.is_closed,
  }));

  const periodMeta = allPeriods.find((p) => p.period_label === periodLabel);

  // 404 if period doesn't exist in DB
  if (!periodMeta) notFound();

  // Map reconciliation results
  const results: ReconciliationResult[] = (reconRows ?? []).map((r) => ({
    id:               r.id,
    period_label:     r.period_label,
    stripe_id:        r.stripe_id ?? "",
    display_name:     r.display_name ?? "",
    primary_email:    r.primary_email ?? "",
    expected_amount:  parseFloat(r.expected_amount).toFixed(4),
    collected_amount: parseFloat(r.collected_amount).toFixed(2),
    variance:         parseFloat(r.variance).toFixed(4),
    status:           r.recon_status as ReconciliationStatus,
    batch:            (r.batch ?? "—") as ReconciliationResult["batch"],
    constituent_accounts: [],
    account_status:   (r.account_status ?? null) as ReconciliationResult["account_status"],
  }));

  const kpis = {
    client_count:     results.length,
    match_count:      results.filter((r) => r.status === "MATCH").length,
    exception_count:  results.filter((r) => r.status !== "MATCH").length,
    failed_hard_count: results.filter((r) => r.status === "FAILED_HARD").length,
    missing_count:    results.filter((r) => r.status === "MISSING_PAYMENT").length,
    total_expected:   results.reduce((s, r) => s + parseFloat(r.expected_amount),  0).toFixed(4),
    total_collected:  results.reduce((s, r) => s + parseFloat(r.collected_amount), 0).toFixed(2),
    total_variance:   results.reduce((s, r) => s + parseFloat(r.variance),         0).toFixed(4),
  };

  const varNum  = parseFloat(kpis.total_variance);
  const expNum  = parseFloat(kpis.total_expected);
  const colNum  = parseFloat(kpis.total_collected);
  const varPct  = expNum > 0 ? ((varNum / expNum) * 100).toFixed(2) : "0.00";
  const colPct  = expNum > 0 ? ((colNum / expNum) * 100).toFixed(1)  : "0.0";
  const matchPct = kpis.client_count > 0
    ? Math.round((kpis.match_count / kpis.client_count) * 100)
    : 0;

  // Filter
  const filteredResults = q
    ? results.filter((r) =>
        r.display_name.toLowerCase().includes(q) ||
        r.primary_email.toLowerCase().includes(q) ||
        r.stripe_id.toLowerCase().includes(q))
    : results;

  const filteredArRows = q
    ? (arRows ?? []).filter((r) =>
        (r.account_name ?? "").toLowerCase().includes(q) ||
        (r.stripe_id ?? "").toLowerCase().includes(q))
    : (arRows ?? []);

  const filteredExceptions = q
    ? (exceptionRows ?? []).filter((e) =>
        (e.display_name ?? "").toLowerCase().includes(q) ||
        (e.stripe_id ?? "").toLowerCase().includes(q))
    : (exceptionRows ?? []);

  // Batch breakdown (full results, not filtered)
  type BatchRow = { batch: string; count: number; expected: number; collected: number; variance: number; exceptions: number };
  const batchMap = new Map<string, BatchRow>();
  for (const r of results) {
    if (!batchMap.has(r.batch)) {
      batchMap.set(r.batch, { batch: r.batch, count: 0, expected: 0, collected: 0, variance: 0, exceptions: 0 });
    }
    const b = batchMap.get(r.batch)!;
    b.count++;
    b.expected   += parseFloat(r.expected_amount);
    b.collected  += parseFloat(r.collected_amount);
    b.variance   += parseFloat(r.variance);
    if (r.status !== "MATCH") b.exceptions++;
  }
  const batchRows = BATCH_ORDER.filter((b) => batchMap.has(b)).map((b) => batchMap.get(b)!);

  const resultByStripeId = new Map(results.map((r) => [r.stripe_id, r]));

  const filtExpNum = filteredResults.reduce((s, r) => s + parseFloat(r.expected_amount),  0);
  const filtColNum = filteredResults.reduce((s, r) => s + parseFloat(r.collected_amount), 0);
  const filtVarNum = filteredResults.reduce((s, r) => s + parseFloat(r.variance),         0);

  return (
    <div className="px-6 py-6 space-y-6 max-w-[1200px] print:px-0 print:py-0 print:space-y-4">

      {/* Page header */}
      <div className="flex items-start justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold text-[#3a3a3a]">Audit Packet</h1>
          <p className="text-sm text-[#6b7280] mt-0.5">{periodLabel}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs px-2.5 py-1 rounded-sm border font-medium ${
            periodMeta.closed
              ? "bg-green-100 text-green-800 border-green-200"
              : "bg-amber-100 text-amber-800 border-amber-200"
          }`}>
            {periodMeta.closed ? "Closed" : "Open period"}
          </span>
          <PrintButton />
        </div>
      </div>

      {/* Print header */}
      <div className="hidden print:block mb-4">
        <h1 className="text-xl font-bold text-[#3a3a3a]">
          Reconciliation Audit Packet — {periodLabel}
        </h1>
        <p className="text-xs text-[#6b7280] mt-0.5">
          Easton Digital · Generated {new Date(RUN_METADATA.run_date).toLocaleDateString("en-US", { dateStyle: "long" })}
        </p>
      </div>

      {/* Filters */}
      <AuditFilters periods={allPeriods} currentPeriod={periodLabel} currentQ={rawQ} />

      {/* Run metadata */}
      <AuditMeta periodLabel={periodLabel} periodMeta={periodMeta} runMetadata={RUN_METADATA} />

      {results.length === 0 ? (
        <div className="py-16 text-center text-sm text-[#9ca3af] border border-[#eeeeee] rounded-[2px]">
          No reconciliation data available for {periodLabel} yet.
        </div>
      ) : (
        <>
          {/* Summary KPIs */}
          <div>
            <h2 className="text-xs font-semibold text-[#6b7280] uppercase tracking-wide mb-3">Period Summary</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { label: "Expected",     value: formatMoney(expNum),  sub: null,                        color: "#3a3a3a" },
                { label: "Collected",    value: formatMoney(colNum),  sub: `${colPct}% of expected`,    color: "#0170B9" },
                { label: "Net Variance", value: `${varNum >= 0 ? "+" : ""}${formatMoney(varNum)}`, sub: `${varNum >= 0 ? "+" : ""}${varPct}% of expected`, color: varNum < -0.01 ? "#b91c1c" : "#15803d" },
                { label: "Clients",      value: kpis.client_count,    sub: null,                        color: "#3a3a3a" },
                { label: "Match",        value: `${kpis.match_count}`, sub: `${matchPct}% of clients`,  color: "#15803d" },
                { label: "Exceptions",   value: `${kpis.exception_count}`, sub: `${kpis.failed_hard_count} failed · ${kpis.missing_count} missing`, color: kpis.exception_count > 0 ? "#b91c1c" : "#15803d" },
              ].map(({ label, value, sub, color }) => (
                <div key={label} className="bg-white border border-[#dddddd] rounded-sm p-4" style={{ borderTop: `2px solid ${color}` }}>
                  <p className="text-[11px] text-[#6b7280] uppercase tracking-wide mb-1">{label}</p>
                  <p className="text-base font-semibold font-mono" style={{ color }}>{value}</p>
                  {sub && <p className="text-[11px] text-[#6b7280] mt-0.5">{sub}</p>}
                </div>
              ))}
            </div>
          </div>

          {/* Batch breakdown */}
          <div>
            <h2 className="text-xs font-semibold text-[#6b7280] uppercase tracking-wide mb-3">Breakdown by Batch</h2>
            <div className="bg-white border border-[#dddddd] rounded-sm overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#dddddd] bg-[#F5F5F5]">
                    {["Batch", "Clients", "Expected", "Collected", "Variance", "Exceptions"].map((h) => (
                      <th key={h} className={`px-4 py-2.5 text-xs font-semibold text-[#6b7280] uppercase tracking-wide ${["Expected","Collected","Variance"].includes(h) ? "text-right" : h === "Exceptions" ? "text-center" : "text-left"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {batchRows.map((b, i) => {
                    const varColor = b.variance < -0.005 ? "text-red-700" : b.variance > 0.005 ? "text-green-700" : "text-[#3a3a3a]";
                    return (
                      <tr key={b.batch} className={`border-b border-[#dddddd] last:border-0 ${i % 2 === 0 ? "" : "bg-[#fafafa]"}`}>
                        <td className="px-4 py-2.5 font-medium text-[#3a3a3a]">Batch {b.batch}</td>
                        <td className="px-4 py-2.5 text-[#6b7280] tabular-nums">{b.count}</td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[#3a3a3a]">{formatMoney(b.expected)}</td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[#0170B9]">{formatMoney(b.collected)}</td>
                        <td className={`px-4 py-2.5 text-right font-mono tabular-nums ${varColor}`}>{b.variance >= 0 ? "+" : ""}{formatMoney(b.variance)}</td>
                        <td className="px-4 py-2.5 text-center">
                          {b.exceptions > 0
                            ? <span className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-sm">{b.exceptions}</span>
                            : <span className="text-xs text-[#9ca3af]">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[#dddddd] bg-[#F5F5F5] font-semibold">
                    <td className="px-4 py-2.5 text-xs text-[#6b7280] uppercase tracking-wide">Total</td>
                    <td className="px-4 py-2.5 tabular-nums text-[#3a3a3a]">{kpis.client_count}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-sm tabular-nums">{formatMoney(expNum)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-sm tabular-nums text-[#0170B9]">{formatMoney(colNum)}</td>
                    <td className={`px-4 py-2.5 text-right font-mono text-sm tabular-nums ${varNum < -0.005 ? "text-red-700" : "text-green-700"}`}>{varNum >= 0 ? "+" : ""}{formatMoney(varNum)}</td>
                    <td className="px-4 py-2.5 text-center text-xs font-medium text-red-700">{kpis.exception_count}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Reconciliation detail */}
          <div>
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-xs font-semibold text-[#6b7280] uppercase tracking-wide">Reconciliation Detail</h2>
              <span className="text-xs text-[#6b7280]">
                {q ? `${filteredResults.length} of ${results.length} clients` : `${filteredResults.length} clients`}
              </span>
            </div>
            {filteredResults.length === 0 ? (
              <div className="bg-white border border-[#dddddd] rounded-sm px-5 py-8 text-center text-sm text-[#6b7280]">No clients match &ldquo;{rawQ}&rdquo;</div>
            ) : (
              <div className="bg-white border border-[#dddddd] rounded-sm overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#dddddd] bg-[#F5F5F5]">
                      {["Client","Batch","Status","Expected","Collected","Variance"].map((h) => (
                        <th key={h} className={`px-4 py-2.5 text-xs font-semibold text-[#6b7280] uppercase tracking-wide ${["Expected","Collected","Variance"].includes(h) ? "text-right" : "text-left"}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredResults.map((r, i) => (
                      <tr key={r.id} className={`border-b border-[#dddddd] last:border-0 ${i % 2 === 0 ? "" : "bg-[#fafafa]"}`}>
                        <td className="px-4 py-2.5">
                          <p className="font-medium text-[#3a3a3a] text-sm">{r.display_name}</p>
                          <p className="text-xs text-[#6b7280]">{r.primary_email}</p>
                          {r.stripe_id && <p className="text-[10px] font-mono text-[#9ca3af] mt-0.5">{r.stripe_id}</p>}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-[#6b7280]">{r.batch}</td>
                        <td className="px-4 py-2.5"><StatusBadge status={r.status} /></td>
                        <td className="px-4 py-2.5 text-right"><MoneyCell amount={r.expected_amount} /></td>
                        <td className="px-4 py-2.5 text-right"><MoneyCell amount={r.collected_amount} /></td>
                        <td className="px-4 py-2.5 text-right"><VarianceCell variance={r.variance} /></td>
                      </tr>
                    ))}
                  </tbody>
                  {filteredResults.length > 1 && (
                    <tfoot>
                      <tr className="border-t-2 border-[#dddddd] bg-[#F5F5F5] font-semibold">
                        <td colSpan={3} className="px-4 py-2.5 text-xs text-[#6b7280] uppercase tracking-wide">
                          {q ? `Subtotal (${filteredResults.length} clients)` : `Total (${filteredResults.length} clients)`}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-sm tabular-nums">{formatMoney(filtExpNum)}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-sm tabular-nums text-[#0170B9]">{formatMoney(filtColNum)}</td>
                        <td className={`px-4 py-2.5 text-right font-mono text-sm tabular-nums ${filtVarNum < -0.005 ? "text-red-700" : "text-green-700"}`}>
                          {filtVarNum >= 0 ? "+" : ""}{formatMoney(filtVarNum)}
                          <div className="text-[10px] font-normal">{filtVarNum >= 0 ? "+" : ""}{filtExpNum > 0 ? ((filtVarNum / filtExpNum) * 100).toFixed(2) : "0.00"}%</div>
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </div>

          {/* AR Billing Lines */}
          <div>
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-xs font-semibold text-[#6b7280] uppercase tracking-wide">AR Billing Lines</h2>
              <span className="text-xs text-[#6b7280]">
                {q ? `${filteredArRows.length} of ${(arRows ?? []).length} rows` : `${filteredArRows.length} rows`}
              </span>
            </div>
            <p className="text-xs text-[#6b7280] mb-3">
              Individual AR sheet rows before Stripe ID merge. Clients sharing a Stripe ID appear as separate lines here.
            </p>
            {filteredArRows.length === 0 ? (
              <div className="bg-white border border-[#dddddd] rounded-sm px-5 py-8 text-center text-sm text-[#6b7280]">
                {q ? `No billing rows match "${rawQ}"` : "No AR data for this period."}
              </div>
            ) : (
              <div className="bg-white border border-[#dddddd] rounded-sm overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#dddddd] bg-[#F5F5F5]">
                      {[
                        { label: "Account",    align: "left"  },
                        { label: "Plan",       align: "left"  },
                        { label: "Status",     align: "left"  },
                        { label: "G. Shopping", align: "right" },
                        { label: "G. Search",  align: "right" },
                        { label: "Bing",       align: "right" },
                        { label: "Total to Bill", align: "right" },
                      ].map(({ label, align }) => (
                        <th key={label} className={`px-4 py-2.5 text-xs font-semibold text-[#6b7280] uppercase tracking-wide text-${align}`}>{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredArRows.map((row, i) => {
                      const result = resultByStripeId.get(row.stripe_id ?? "");
                      return (
                        <tr key={row.id} className={`border-b border-[#dddddd] last:border-0 ${i % 2 === 0 ? "" : "bg-[#fafafa]"}`}>
                          <td className="px-4 py-2.5">
                            <p className="font-medium text-[#3a3a3a] text-sm">{row.account_name}</p>
                            {row.stripe_id && <p className="text-[10px] font-mono text-[#9ca3af] mt-0.5">{row.stripe_id}</p>}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-[#3a3a3a]">{row.billing_plan ?? "—"}</td>
                          <td className="px-4 py-2.5">
                            {result ? <StatusBadge status={result.status} /> : <span className="text-[11px] text-[#9ca3af]">—</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            {row.google_shopping_charge ? <MoneyCell amount={String(row.google_shopping_charge)} /> : <span className="text-xs text-[#9ca3af]">—</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            {row.google_search_charge ? <MoneyCell amount={String(row.google_search_charge)} /> : <span className="text-xs text-[#9ca3af]">—</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            {row.bing_charge ? <MoneyCell amount={String(row.bing_charge)} /> : <span className="text-xs text-[#9ca3af]">—</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <MoneyCell amount={String(row.expected_amount ?? 0)} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {filteredArRows.length > 1 && (
                    <tfoot>
                      <tr className="border-t-2 border-[#dddddd] bg-[#F5F5F5] font-semibold">
                        <td colSpan={6} className="px-4 py-2.5 text-xs text-[#6b7280] uppercase tracking-wide">
                          {q ? `Subtotal (${filteredArRows.length} rows)` : `Total (${filteredArRows.length} rows)`}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-sm tabular-nums">
                          {formatMoney(filteredArRows.reduce((s, r) => s + parseFloat(String(r.expected_amount ?? 0)), 0))}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </div>

          {/* Exceptions */}
          {filteredExceptions.length > 0 && (
            <div>
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="text-xs font-semibold text-[#6b7280] uppercase tracking-wide">Open Exceptions</h2>
                <span className="text-xs text-[#6b7280]">{filteredExceptions.length}</span>
              </div>
              <div className="bg-white border border-[#dddddd] rounded-sm divide-y divide-[#dddddd]">
                {filteredExceptions.map((e) => (
                  <div key={e.id} className="px-5 py-3.5 flex items-start gap-4">
                    <div className="pt-0.5 shrink-0">
                      <StatusBadge status={e.exception_type as ReconciliationStatus} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-[#3a3a3a]">{e.display_name}</p>
                      {e.stripe_id && <p className="text-xs font-mono text-[#6b7280] mt-0.5">{e.stripe_id}</p>}
                      {e.resolution_note && <p className="text-xs text-[#4B4F58] mt-1.5 leading-relaxed">{e.resolution_note}</p>}
                    </div>
                    <div className="shrink-0 text-right">
                      <VarianceCell variance={String(e.variance ?? 0)} />
                      <p className="text-xs text-[#6b7280] mt-0.5">{e.period_label}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Methodology */}
      <div>
        <h2 className="text-xs font-semibold text-[#6b7280] uppercase tracking-wide mb-3">Methodology</h2>
        <div className="bg-white border border-[#dddddd] rounded-sm px-5 py-4">
          <ol className="space-y-2 list-decimal list-inside">
            {METHODOLOGY.map((line, i) => (
              <li key={i} className="text-sm text-[#4B4F58] leading-relaxed">{line}</li>
            ))}
          </ol>
        </div>
      </div>

    </div>
  );
}
