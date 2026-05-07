import { notFound } from "next/navigation";
import { april2026Results, april2026Kpis } from "@/lib/mock/april-2026";
import { april2026Exceptions } from "@/lib/mock/exceptions";
import { PERIODS } from "@/lib/mock";
import { formatMoney } from "@/lib/format";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { MoneyCell, VarianceCell } from "@/components/shared/MoneyCell";
import { AuditMeta } from "./_components/AuditMeta";
import { PrintButton } from "./_components/PrintButton";

// ── Mock run metadata (Phase 1) ─────────────────────────────────────────────
// In Phase 2, this comes from reconciliation_runs table in Supabase.

const RUN_METADATA = {
  run_date:       "2026-05-01T09:14:33Z",
  engine_version: "v0.1.0-mock",
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

// ── Page ────────────────────────────────────────────────────────────────────

interface Props {
  params: Promise<{ period: string }>;
}

export default async function AuditPage({ params }: Props) {
  const { period } = await params;
  const periodLabel = decodeURIComponent(period);

  // Phase 1: only April 2026 has data
  if (periodLabel !== "April 2026") notFound();

  const periodMeta  = PERIODS.find((p) => p.period_label === periodLabel);
  const results     = april2026Results;
  const kpis        = april2026Kpis;
  const exceptions  = april2026Exceptions.filter((e) => e.status === "OPEN");

  const varNum      = parseFloat(kpis.total_variance);
  const expNum      = parseFloat(kpis.total_expected);
  const colNum      = parseFloat(kpis.total_collected);
  const varPct      = expNum > 0 ? ((varNum / expNum) * 100).toFixed(2) : "0.00";
  const colPct      = expNum > 0 ? ((colNum / expNum) * 100).toFixed(1) : "0.0";
  const matchPct    = kpis.client_count > 0
    ? Math.round((kpis.match_count / kpis.client_count) * 100)
    : 0;

  return (
    <div className="px-6 py-6 space-y-6 max-w-[1200px] print:px-0 print:py-0 print:space-y-4">

      {/* ── Page header ── */}
      <div className="flex items-start justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold text-[#3a3a3a]">Audit Packet</h1>
          <p className="text-sm text-[#6b7280] mt-0.5">{periodLabel}</p>
        </div>
        <div className="flex items-center gap-3">
          {periodMeta && (
            <span className={`text-xs px-2.5 py-1 rounded-sm border font-medium ${
              periodMeta.closed
                ? "bg-green-100 text-green-800 border-green-200"
                : "bg-amber-100 text-amber-800 border-amber-200"
            }`}>
              {periodMeta.closed ? "Closed" : "Open period"}
            </span>
          )}
          <PrintButton />
        </div>
      </div>

      {/* Print header (only shown when printing) */}
      <div className="hidden print:block mb-4">
        <h1 className="text-xl font-bold text-[#3a3a3a]">
          Reconciliation Audit Packet — {periodLabel}
        </h1>
        <p className="text-xs text-[#6b7280] mt-0.5">
          Easton Digital · Generated {new Date(RUN_METADATA.run_date).toLocaleDateString("en-US", { dateStyle: "long" })}
        </p>
      </div>

      {/* ── Run metadata + source files ── */}
      <AuditMeta
        periodLabel={periodLabel}
        periodMeta={periodMeta}
        runMetadata={RUN_METADATA}
      />

      {/* ── Summary KPIs ── */}
      <div>
        <h2 className="text-xs font-semibold text-[#6b7280] uppercase tracking-wide mb-3">
          Period Summary
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: "Expected",        value: formatMoney(expNum),       sub: null,                  color: "#3a3a3a" },
            { label: "Collected",       value: formatMoney(colNum),       sub: `${colPct}% of expected`, color: "#0170B9" },
            { label: "Net Variance",    value: `${varNum >= 0 ? "+" : ""}${formatMoney(varNum)}`, sub: `${varNum >= 0 ? "+" : ""}${varPct}% of expected`, color: varNum < -0.01 ? "#b91c1c" : "#15803d" },
            { label: "Clients",         value: kpis.client_count,         sub: null,                  color: "#3a3a3a" },
            { label: "Match",           value: `${kpis.match_count}`,     sub: `${matchPct}% of clients`, color: "#15803d" },
            { label: "Exceptions",      value: `${kpis.exception_count}`, sub: `${kpis.failed_hard_count} failed · ${kpis.missing_count} missing`, color: kpis.exception_count > 0 ? "#b91c1c" : "#15803d" },
          ].map(({ label, value, sub, color }) => (
            <div
              key={label}
              className="bg-white border border-[#dddddd] rounded-sm p-4"
              style={{ borderTop: `2px solid ${color}` }}
            >
              <p className="text-[11px] text-[#6b7280] uppercase tracking-wide mb-1">{label}</p>
              <p className="text-base font-semibold font-mono" style={{ color }}>{value}</p>
              {sub && <p className="text-[11px] text-[#6b7280] mt-0.5">{sub}</p>}
            </div>
          ))}
        </div>
      </div>

      {/* ── Full reconciliation detail ── */}
      <div>
        <h2 className="text-xs font-semibold text-[#6b7280] uppercase tracking-wide mb-3">
          Reconciliation Detail — {results.length} rows
        </h2>
        <div className="bg-white border border-[#dddddd] rounded-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#dddddd] bg-[#F5F5F5]">
                {["Client", "Batch", "Status", "Expected", "Collected", "Variance"].map((h) => (
                  <th
                    key={h}
                    className={`px-4 py-2.5 text-xs font-semibold text-[#6b7280] uppercase tracking-wide ${
                      ["Expected", "Collected", "Variance"].includes(h) ? "text-right" : "text-left"
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr
                  key={r.id}
                  className={`border-b border-[#dddddd] last:border-0 ${i % 2 === 0 ? "" : "bg-[#fafafa]"}`}
                >
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-[#3a3a3a] text-sm">{r.display_name}</p>
                    <p className="text-xs text-[#6b7280]">{r.primary_email}</p>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-[#6b7280]">{r.batch}</td>
                  <td className="px-4 py-2.5"><StatusBadge status={r.status} /></td>
                  <td className="px-4 py-2.5 text-right"><MoneyCell amount={r.expected_amount} /></td>
                  <td className="px-4 py-2.5 text-right"><MoneyCell amount={r.collected_amount} /></td>
                  <td className="px-4 py-2.5 text-right"><VarianceCell variance={r.variance} /></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[#dddddd] bg-[#F5F5F5] font-semibold">
                <td colSpan={3} className="px-4 py-2.5 text-xs text-[#6b7280] uppercase tracking-wide">
                  Total ({results.length} clients)
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-sm tabular-nums">
                  {formatMoney(expNum)}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-sm tabular-nums text-[#0170B9]">
                  {formatMoney(colNum)}
                </td>
                <td className={`px-4 py-2.5 text-right font-mono text-sm tabular-nums ${
                  varNum < -0.005 ? "text-red-700" : "text-green-700"
                }`}>
                  {varNum >= 0 ? "+" : ""}{formatMoney(varNum)}
                  <div className="text-[10px] font-normal">
                    {varNum >= 0 ? "+" : ""}{varPct}%
                  </div>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* ── Exceptions ── */}
      {exceptions.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-[#6b7280] uppercase tracking-wide mb-3">
            Open Exceptions — {exceptions.length}
          </h2>
          <div className="bg-white border border-[#dddddd] rounded-sm divide-y divide-[#dddddd]">
            {exceptions.map((e) => (
              <div key={e.id} className="px-5 py-3.5 flex items-start gap-4">
                <div className="pt-0.5 shrink-0">
                  <StatusBadge status={e.reconciliation_status} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-[#3a3a3a]">{e.display_name}</p>
                  {e.stripe_id && (
                    <p className="text-xs font-mono text-[#6b7280] mt-0.5">{e.stripe_id}</p>
                  )}
                  {e.notes && (
                    <p className="text-xs text-[#4B4F58] mt-1.5 leading-relaxed">{e.notes}</p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <VarianceCell variance={e.variance} />
                  <p className="text-xs text-[#6b7280] mt-0.5">{e.period_label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Methodology ── */}
      <div>
        <h2 className="text-xs font-semibold text-[#6b7280] uppercase tracking-wide mb-3">
          Methodology
        </h2>
        <div className="bg-white border border-[#dddddd] rounded-sm px-5 py-4">
          <ol className="space-y-2 list-decimal list-inside">
            {METHODOLOGY.map((line, i) => (
              <li key={i} className="text-sm text-[#4B4F58] leading-relaxed">
                {line}
              </li>
            ))}
          </ol>
        </div>
      </div>

    </div>
  );
}
