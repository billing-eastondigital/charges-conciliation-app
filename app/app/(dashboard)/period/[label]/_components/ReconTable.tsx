"use client";

import { useState, useMemo, Fragment } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { MoneyCell, VarianceCell } from "@/components/shared/MoneyCell";
import { formatMoney } from "@/lib/format";
import type { ReconciliationResult, ReconciliationStatus, BatchLabel } from "@/lib/types";

// ── constants ──────────────────────────────────────────────────────────────

const STATUS_ORDER: ReconciliationStatus[] = [
  "FAILED_HARD", "MISSING_PAYMENT", "OVERPAID", "UNDERPAID",
  "STRIPE_ONLY", "REFUNDED", "MATCH",
];

const BATCH_ORDER: BatchLabel[] = ["1", "2", "3", "SUBSCRIPTION", "5", "Consulting", "Multiple", "—"];

const STATUS_FILTERS: { value: ReconciliationStatus | "ALL"; label: string }[] = [
  { value: "ALL",             label: "All" },
  { value: "MATCH",           label: "Match" },
  { value: "FAILED_HARD",     label: "Failed" },
  { value: "MISSING_PAYMENT", label: "Missing" },
  { value: "OVERPAID",        label: "Overpaid" },
  { value: "UNDERPAID",       label: "Underpaid" },
  { value: "STRIPE_ONLY",     label: "Unmatched" },
  { value: "REFUNDED",        label: "Refunded" },
];

// ── helpers ────────────────────────────────────────────────────────────────

function sum(rows: ReconciliationResult[], key: "expected_amount" | "collected_amount" | "variance") {
  return rows.reduce((acc, r) => acc + parseFloat(r[key]), 0);
}

function fmtPct(pct: number | null) {
  if (pct === null) return null;
  const sign = pct > 0.05 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

// ── sub-components ─────────────────────────────────────────────────────────

function PctLine({ pct, colorPositive = "blue" }: { pct: number | null; colorPositive?: "blue" | "green" }) {
  const str = fmtPct(pct);
  if (str === null) return <span className="text-[#9ca3af] text-xs">—</span>;
  const isNeg = (pct ?? 0) < -0.05;
  const isPos = (pct ?? 0) > 0.05;
  const color = isNeg ? "text-red-600" : isPos ? (colorPositive === "green" ? "text-green-700" : "text-blue-600") : "text-gray-400";
  return <span className={`text-xs font-mono tabular-nums ${color}`}>{str}</span>;
}

function TotalsRow({ rows, label, prevCollectedMap }: {
  rows: ReconciliationResult[];
  label: string;
  prevCollectedMap?: Map<string, number>;
}) {
  const totalExp = sum(rows, "expected_amount");
  const totalCol = sum(rows, "collected_amount");
  const totalVar = sum(rows, "variance");
  const isNeg = totalVar < -0.005;
  const isPos = totalVar > 0.005;
  const varPct = totalExp > 0.005 ? (totalVar / totalExp) * 100 : null;

  const totalPrev = prevCollectedMap
    ? rows.reduce((s, r) => s + (prevCollectedMap.get(r.stripe_id) ?? 0), 0)
    : null;
  const m1Delta = totalPrev !== null ? totalExp - totalPrev : null;
  const m1Pct   = totalPrev !== null && totalPrev > 0.005 ? (m1Delta! / totalPrev) * 100 : null;

  return (
    <tr className="border-t-2 border-[#dddddd] bg-[#F5F5F5] font-semibold text-[#3a3a3a]">
      <td className="px-4 py-2.5 text-xs uppercase tracking-wide text-[#6b7280]">
        {label} <span className="font-normal">({rows.length})</span>
      </td>
      <td className="px-4 py-2.5" />
      <td className="px-4 py-2.5 text-right font-mono text-sm tabular-nums">
        {formatMoney(totalExp)}
      </td>
      <td className="px-4 py-2.5 text-right font-mono text-sm tabular-nums">
        {formatMoney(totalCol)}
      </td>
      <td className="px-4 py-2.5 text-right">
        <div className="flex flex-col items-end gap-0.5">
          <span className={`font-mono text-sm tabular-nums font-semibold ${isNeg ? "text-red-700" : isPos ? "text-blue-700" : "text-gray-500"}`}>
            {totalVar > 0.005 ? "+" : ""}{formatMoney(totalVar)}
          </span>
          <PctLine pct={varPct} />
        </div>
      </td>
      {prevCollectedMap && (
        <>
          <td className="px-4 py-2.5 text-right font-mono text-sm tabular-nums">
            {totalPrev !== null ? formatMoney(totalPrev) : "—"}
          </td>
          <td className="px-4 py-2.5 text-right">
            <div className="flex flex-col items-end gap-0.5">
              {m1Delta !== null ? (
                <span className={`font-mono text-sm tabular-nums font-semibold ${m1Delta < -0.005 ? "text-red-700" : m1Delta > 0.005 ? "text-green-700" : "text-gray-500"}`}>
                  {m1Delta > 0.005 ? "+" : ""}{formatMoney(m1Delta)}
                </span>
              ) : <span className="text-gray-400 text-sm">—</span>}
              <PctLine pct={m1Pct} colorPositive="green" />
            </div>
          </td>
        </>
      )}
    </tr>
  );
}

function DataRows({ rows, prevCollectedMap }: {
  rows: ReconciliationResult[];
  prevCollectedMap?: Map<string, number>;
}) {
  const sorted = [...rows].sort(
    (a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)
  );
  return (
    <>
      {sorted.map((row, i) => {
        const collected = parseFloat(row.collected_amount);
        const expected  = parseFloat(row.expected_amount);
        const variance  = parseFloat(row.variance);
        const varPct    = expected > 0.005 ? (variance / expected) * 100 : null;

        const prevCollected = prevCollectedMap ? (prevCollectedMap.get(row.stripe_id) ?? null) : undefined;
        const m1Delta = prevCollected != null ? expected - prevCollected : null;
        const m1Pct   = prevCollected != null && prevCollected > 0.005 ? (m1Delta! / prevCollected) * 100 : null;

        return (
          <tr
            key={row.id}
            className={`border-b border-[#dddddd] last:border-0 hover:bg-[#eef6ff] transition-colors ${
              i % 2 === 0 ? "" : "bg-[#fafafa]"
            }`}
          >
            <td className="px-4 py-3">
              {row.stripe_id ? (
                <Link href={`/client/${row.stripe_id}`} className="group">
                  <p className="font-medium text-[#3a3a3a] text-sm leading-snug group-hover:text-[#0170B9] transition-colors">{row.display_name}</p>
                  <p className="text-xs text-[#6b7280]">{row.primary_email}</p>
                  {row.constituent_accounts.length > 1 && (
                    <p className="text-xs text-[#0170B9] mt-0.5">
                      {row.constituent_accounts.length} accounts merged
                    </p>
                  )}
                </Link>
              ) : (
                <>
                  <p className="font-medium text-[#3a3a3a] text-sm leading-snug">{row.display_name}</p>
                  <p className="text-xs text-[#6b7280]">{row.primary_email}</p>
                </>
              )}
            </td>
            <td className="px-4 py-3">
              <StatusBadge status={row.status} />
            </td>
            <td className="px-4 py-3 text-right">
              <MoneyCell amount={row.expected_amount} />
            </td>
            <td className="px-4 py-3 text-right">
              <MoneyCell amount={row.collected_amount} />
            </td>
            <td className="px-4 py-3 text-right">
              <div className="flex flex-col items-end gap-0.5">
                <VarianceCell variance={row.variance} />
                <PctLine pct={varPct} />
              </div>
            </td>
            {prevCollectedMap && (
              <>
                <td className="px-4 py-3 text-right">
                  {prevCollected != null ? (
                    <MoneyCell amount={prevCollected.toFixed(2)} />
                  ) : (
                    <span className="text-xs text-[#9ca3af]">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex flex-col items-end gap-0.5">
                    {m1Delta !== null ? (
                      <span className={`font-mono text-sm tabular-nums ${m1Delta < -0.005 ? "text-red-700" : m1Delta > 0.005 ? "text-green-700" : "text-gray-500"}`}>
                        {m1Delta > 0.005 ? "+" : ""}{formatMoney(m1Delta)}
                      </span>
                    ) : <span className="text-xs text-[#9ca3af]">—</span>}
                    <PctLine pct={m1Pct} colorPositive="green" />
                  </div>
                </td>
              </>
            )}
          </tr>
        );
      })}
    </>
  );
}

function BatchGroupHeader({ batch, count, colCount }: { batch: string; count: number; colCount: number }) {
  return (
    <tr className="bg-[#3a3a3a]">
      <td colSpan={colCount} className="px-4 py-1.5">
        <span className="text-xs font-semibold text-white uppercase tracking-wider">
          Batch {batch}
        </span>
        <span className="text-xs text-[#aaa] ml-2">· {count} client{count !== 1 ? "s" : ""}</span>
      </td>
    </tr>
  );
}

// ── main component ─────────────────────────────────────────────────────────

interface ReconTableProps {
  results: ReconciliationResult[];
  prevCollectedMap?: Map<string, number>;
}

export function ReconTable({ results, prevCollectedMap }: ReconTableProps) {
  const [statusFilter, setStatusFilter] = useState<ReconciliationStatus | "ALL">("ALL");
  const [batchFilter, setBatchFilter] = useState<BatchLabel | "ALL">("ALL");
  const [search, setSearch]           = useState("");
  const [groupByBatch, setGroupByBatch] = useState(false);

  // unique batches present in data, in order
  const availableBatches = useMemo(
    () => BATCH_ORDER.filter((b) => results.some((r) => r.batch === b)),
    [results]
  );

  // filtered rows
  const filtered = useMemo(() => {
    return results.filter((r) => {
      if (statusFilter !== "ALL" && r.status !== statusFilter) return false;
      if (batchFilter !== "ALL" && r.batch !== batchFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !r.display_name.toLowerCase().includes(q) &&
          !r.primary_email.toLowerCase().includes(q) &&
          !r.stripe_id.toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [results, statusFilter, batchFilter, search]);

  // grouped by batch (only when groupByBatch is on)
  const groupedBatches = useMemo(() => {
    if (!groupByBatch) return null;
    return BATCH_ORDER
      .map((batch) => ({ batch, rows: filtered.filter((r) => r.batch === batch) }))
      .filter(({ rows }) => rows.length > 0);
  }, [filtered, groupByBatch]);

  return (
    <div className="bg-white border border-[#dddddd] rounded-sm">

      {/* ── Toolbar ── */}
      <div className="px-4 py-3 border-b border-[#dddddd] space-y-2">

        {/* Row 1: search + group toggle */}
        <div className="flex items-center gap-3">
          <input
            type="search"
            placeholder="Search client, email, Stripe ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 max-w-xs text-sm border border-[#dddddd] rounded-sm px-3 py-1.5 outline-none focus:border-[#0170B9] transition-colors"
          />
          <button
            onClick={() => setGroupByBatch((v) => !v)}
            className={`text-xs px-3 py-1.5 rounded-sm border transition-colors ${
              groupByBatch
                ? "bg-[#3a3a3a] text-white border-[#3a3a3a]"
                : "bg-white text-[#4B4F58] border-[#dddddd] hover:border-[#3a3a3a]"
            }`}
          >
            Group by Batch
          </button>
          <span className="text-xs text-[#6b7280] ml-auto whitespace-nowrap">
            {filtered.length} of {results.length} clients
          </span>
        </div>

        {/* Row 2: status filters */}
        <div className="flex gap-1 flex-wrap items-center">
          <span className="text-xs text-[#6b7280] mr-1">Status:</span>
          {STATUS_FILTERS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setStatusFilter(value)}
              className={`text-xs px-2.5 py-1 rounded-sm border transition-colors ${
                statusFilter === value
                  ? "bg-[#0170B9] text-white border-[#0170B9]"
                  : "bg-white text-[#4B4F58] border-[#dddddd] hover:border-[#0170B9] hover:text-[#0170B9]"
              }`}
            >
              {label}
            </button>
          ))}

          {/* batch quick-filters */}
          <span className="text-xs text-[#6b7280] ml-4 mr-1">Batch:</span>
          <button
            onClick={() => setBatchFilter("ALL")}
            className={`text-xs px-2.5 py-1 rounded-sm border transition-colors ${
              batchFilter === "ALL"
                ? "bg-[#3a3a3a] text-white border-[#3a3a3a]"
                : "bg-white text-[#4B4F58] border-[#dddddd] hover:border-[#3a3a3a]"
            }`}
          >
            All
          </button>
          {availableBatches.map((b) => (
            <button
              key={b}
              onClick={() => setBatchFilter(b)}
              className={`text-xs px-2.5 py-1 rounded-sm border transition-colors ${
                batchFilter === b
                  ? "bg-[#3a3a3a] text-white border-[#3a3a3a]"
                  : "bg-white text-[#4B4F58] border-[#dddddd] hover:border-[#3a3a3a]"
              }`}
            >
              {b}
            </button>
          ))}
        </div>
      </div>

      {/* ── Table ── */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#dddddd] bg-[#F5F5F5]">
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#6b7280] uppercase tracking-wide">Client</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#6b7280] uppercase tracking-wide">Status</th>
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-[#6b7280] uppercase tracking-wide">Expected</th>
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-[#6b7280] uppercase tracking-wide">Collected</th>
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-[#6b7280] uppercase tracking-wide">Variance</th>
              {prevCollectedMap && (
                <>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-[#6b7280] uppercase tracking-wide whitespace-nowrap">M-1 Collected</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-[#6b7280] uppercase tracking-wide whitespace-nowrap">Expected vs M-1</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={prevCollectedMap ? 7 : 5} className="px-4 py-10 text-center text-[#6b7280] text-sm">
                  No results match your filter.
                </td>
              </tr>
            )}

            {/* ── Grouped view ── */}
            {groupByBatch && groupedBatches && groupedBatches.map(({ batch, rows }) => (
              <Fragment key={batch}>
                <BatchGroupHeader batch={batch} count={rows.length} colCount={prevCollectedMap ? 7 : 5} />
                <DataRows rows={rows} prevCollectedMap={prevCollectedMap} />
                <TotalsRow rows={rows} label={`Batch ${batch} total`} prevCollectedMap={prevCollectedMap} />
              </Fragment>
            ))}

            {/* ── Flat view ── */}
            {!groupByBatch && (
              <DataRows rows={filtered} prevCollectedMap={prevCollectedMap} />
            )}
          </tbody>

          {/* ── Grand total (always shown) ── */}
          {filtered.length > 0 && (
            <tfoot>
              <TotalsRow rows={filtered} label={groupByBatch ? "Grand total" : "Total"} prevCollectedMap={prevCollectedMap} />
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
