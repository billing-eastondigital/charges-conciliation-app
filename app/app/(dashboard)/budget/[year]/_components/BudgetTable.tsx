"use client";

import { useState, useMemo, Fragment } from "react";
import { formatMoney } from "@/lib/format";
import type { ClientBudgetRow, BudgetMonthData, BatchLabel, ProjectionType } from "@/lib/types";

// ── constants ──────────────────────────────────────────────────────────────

const BATCH_ORDER: BatchLabel[] = ["1", "2", "3", "SUBSCRIPTION", "5", "Consulting", "Multiple", "—"];

const PROJ_LABELS: Record<ProjectionType, string> = {
  FIXED:       "Fixed",
  LAST_PERIOD: "Last",
  ROLLING_3:   "Avg3",
  ROLLING_6:   "Avg6",
  MANUAL:      "Manual",
};

// ── helpers ────────────────────────────────────────────────────────────────

function sumMonth(rows: ClientBudgetRow[], monthKey: string, field: "projected" | "actual"): number {
  return rows.reduce((s, r) => {
    const m = r.months.find((x) => x.month_key === monthKey);
    return s + (m?.[field] ?? 0);
  }, 0);
}

function fmtPct(delta: number, base: number | null): string | null {
  if (!base) return null;
  const p = (delta / base) * 100;
  return `${p >= 0 ? "+" : ""}${p.toFixed(1)}%`;
}

// ── sub-components ─────────────────────────────────────────────────────────

function MonthCell({ m, hasActual }: { m: BudgetMonthData; hasActual: boolean }) {
  // Churned month
  if (m.projected === null) {
    return (
      <td className="px-1 py-2 text-center text-[#cccccc] text-xs border-l border-[#f0f0f0]">
        —
      </td>
    );
  }

  // Month with actual data
  if (m.actual !== null) {
    const delta = m.delta ?? 0;
    const pos   = delta > 0.005;
    const neg   = delta < -0.005;
    const pct   = fmtPct(delta, m.projected);
    const colorClass = neg ? "text-red-600" : pos ? "text-green-700" : "text-[#9ca3af]";
    return (
      <td className="px-1.5 py-2 text-right border-l border-[#f0f0f0] bg-[#f0f7ff]">
        <div className="font-mono text-xs font-semibold text-[#0170B9] tabular-nums">
          {formatMoney(m.actual)}
        </div>
        <div className={`font-mono text-[10px] tabular-nums leading-tight ${colorClass}`}>
          {pos ? "+" : ""}{formatMoney(delta)}
        </div>
        {pct && (
          <div className={`font-mono text-[10px] tabular-nums leading-tight ${colorClass}`}>
            {pct}
          </div>
        )}
      </td>
    );
  }

  // Future / projected only
  return (
    <td className="px-1.5 py-2 text-right border-l border-[#f0f0f0]">
      <div className="font-mono text-xs text-[#9ca3af] tabular-nums">
        {formatMoney(m.projected)}
      </div>
    </td>
  );
}

function BatchHeader({ batch, count }: { batch: string; count: number }) {
  return (
    <tr className="bg-[#3a3a3a]">
      <td colSpan={99} className="px-4 py-1.5">
        <span className="text-xs font-semibold text-white uppercase tracking-wider">
          Batch {batch}
        </span>
        <span className="text-xs text-[#aaa] ml-2">· {count} client{count !== 1 ? "s" : ""}</span>
      </td>
    </tr>
  );
}

function SubtotalRow({
  rows,
  months,
  label,
}: {
  rows: ClientBudgetRow[];
  months: Array<{ key: string; short: string }>;
  label: string;
}) {
  const ytdProj  = rows.reduce((s, r) => s + r.ytd_projected, 0);
  const ytdAct   = rows.reduce((s, r) => s + r.ytd_actual, 0);
  const ytdDelta = ytdAct - ytdProj; // true delta: actual vs full YTD projection window
  const fyProj   = rows.reduce((s, r) => s + r.full_year_projected, 0);

  return (
    <tr className="border-t-2 border-[#dddddd] bg-[#F5F5F5] font-semibold text-xs">
      <td className="px-3 py-2 text-[#6b7280] uppercase tracking-wide sticky left-0 bg-[#F5F5F5]">
        {label}
      </td>
      {months.map(({ key }) => {
        const proj = sumMonth(rows, key, "projected");
        const act  = sumMonth(rows, key, "actual");
        const hasAct = rows.some((r) => r.months.find((m) => m.month_key === key)?.actual !== null);
        return (
          <td key={key} className={`px-1.5 py-2 text-right border-l border-[#dddddd] font-mono tabular-nums ${hasAct ? "bg-[#e8f4ff]" : ""}`}>
            {hasAct ? (
              (() => {
                const delta2 = act - proj;
                const colorClass = delta2 < -0.005 ? "text-red-600" : delta2 > 0.005 ? "text-green-700" : "text-[#9ca3af]";
                const pct = fmtPct(delta2, proj);
                return (
                  <>
                    <div className="text-[#0170B9]">{formatMoney(act)}</div>
                    <div className={`text-[10px] ${colorClass}`}>
                      {delta2 > 0.005 ? "+" : ""}{formatMoney(delta2)}
                    </div>
                    {pct && <div className={`text-[10px] ${colorClass}`}>{pct}</div>}
                  </>
                );
              })()
            ) : (
              <div className="text-[#9ca3af]">{formatMoney(proj)}</div>
            )}
          </td>
        );
      })}
      {/* YTD Projected */}
      <td className="px-2 py-2 text-right border-l border-[#dddddd] font-mono text-[#9ca3af] tabular-nums text-xs">
        {formatMoney(ytdProj)}
      </td>
      {/* YTD Actual + delta */}
      <td className="px-2 py-2 text-right border-l border-[#dddddd] font-mono text-[#0170B9] tabular-nums bg-[#e8f4ff]">
        {formatMoney(ytdAct)}
        {(() => {
          const colorClass = ytdDelta < -0.005 ? "text-red-600" : ytdDelta > 0.005 ? "text-green-700" : "text-[#9ca3af]";
          const pct = fmtPct(ytdDelta, ytdProj);
          return (
            <>
              <div className={`text-[10px] ${colorClass}`}>
                {ytdDelta > 0.005 ? "+" : ""}{formatMoney(ytdDelta)}
              </div>
              {pct && <div className={`text-[10px] ${colorClass}`}>{pct}</div>}
            </>
          );
        })()}
      </td>
      {/* Full Year Projected + remaining */}
      <td className="px-2 py-2 text-right border-l border-[#dddddd] font-mono tabular-nums">
        <div className="text-xs text-[#3a3a3a] font-semibold">{formatMoney(fyProj)}</div>
        {fyProj > 0 && (() => {
          const remaining = fyProj - ytdAct;
          const pctDone = Math.min(100, (ytdAct / fyProj) * 100);
          return (
            <>
              <div className="text-[10px] text-[#9ca3af]">{formatMoney(remaining)} left</div>
              <div className="text-[10px] text-[#9ca3af]">{pctDone.toFixed(0)}% done</div>
            </>
          );
        })()}
      </td>
    </tr>
  );
}

function ClientRow({
  row,
  months,
}: {
  row: ClientBudgetRow;
  months: Array<{ key: string; short: string }>;
}) {
  // True YTD delta: actual vs projected over the full YTD window (not just months with actuals)
  const ytdDelta = row.ytd_actual - row.ytd_projected;
  const deltaPos = ytdDelta > 0.005;
  const deltaNeg = ytdDelta < -0.005;

  return (
    <tr className="border-b border-[#dddddd] last:border-0 hover:bg-[#eef6ff] transition-colors group">
      {/* Sticky client name */}
      <td className="px-3 py-2.5 sticky left-0 bg-white group-hover:bg-[#eef6ff] transition-colors min-w-[200px] max-w-[240px]">
        <p className={`font-medium text-xs leading-snug truncate ${row.is_active ? "text-[#3a3a3a]" : "text-[#9ca3af] line-through"}`}>
          {row.display_name}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          {row.active_projection_type && (
            <span className="text-[10px] text-[#9ca3af] uppercase tracking-wide">
              {PROJ_LABELS[row.active_projection_type]}
            </span>
          )}
          {row.plan_count > 1 && (
            <span className="text-[10px] text-[#0170B9]">· {row.plan_count} plans</span>
          )}
          {!row.is_active && (
            <span className="text-[10px] text-red-500 uppercase tracking-wide">· Churned</span>
          )}
        </div>
      </td>

      {/* Month cells */}
      {months.map(({ key }) => {
        const m = row.months.find((x) => x.month_key === key)!;
        return <MonthCell key={key} m={m} hasActual={m.actual !== null} />;
      })}

      {/* YTD Projected */}
      <td className="px-2 py-2.5 text-right border-l border-[#dddddd] font-mono text-xs tabular-nums text-[#9ca3af]">
        {formatMoney(row.ytd_projected)}
      </td>

      {/* YTD Actual + delta vs projected */}
      <td className="px-2 py-2.5 text-right border-l border-[#dddddd] font-mono text-xs tabular-nums bg-[#f0f7ff]">
        <div className="text-[#0170B9] font-semibold">{formatMoney(row.ytd_actual)}</div>
        <div className={`text-[10px] ${deltaNeg ? "text-red-600" : deltaPos ? "text-green-700" : "text-[#9ca3af]"}`}>
          {deltaPos ? "+" : ""}{formatMoney(ytdDelta)}
        </div>
        {fmtPct(ytdDelta, row.ytd_projected) && (
          <div className={`text-[10px] ${deltaNeg ? "text-red-600" : deltaPos ? "text-green-700" : "text-[#9ca3af]"}`}>
            {fmtPct(ytdDelta, row.ytd_projected)}
          </div>
        )}
      </td>

      {/* Full Year Projected + remaining to goal */}
      <td className="px-2 py-2.5 text-right border-l border-[#dddddd] font-mono text-xs tabular-nums">
        <div className="text-[#3a3a3a] font-semibold">{formatMoney(row.full_year_projected)}</div>
        {row.full_year_projected > 0 && (() => {
          const remaining = row.full_year_projected - row.ytd_actual;
          const pctDone = Math.min(100, (row.ytd_actual / row.full_year_projected) * 100);
          return (
            <>
              <div className="text-[10px] text-[#9ca3af]">{formatMoney(remaining)} left</div>
              <div className="text-[10px] text-[#9ca3af]">{pctDone.toFixed(0)}% done</div>
            </>
          );
        })()}
      </td>
    </tr>
  );
}

// ── main component ─────────────────────────────────────────────────────────

interface BudgetTableProps {
  rows: ClientBudgetRow[];
  months: Array<{ key: string; short: string }>;
  ytdCutoff: string;
}

export function BudgetTable({ rows, months, ytdCutoff }: BudgetTableProps) {
  const [groupByBatch, setGroupByBatch] = useState(false);
  const [search, setSearch]             = useState("");
  const [showInactive, setShowInactive] = useState(true);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (!showInactive && !r.is_active) return false;
      if (search) {
        const q = search.toLowerCase();
        return r.display_name.toLowerCase().includes(q) || r.primary_email.toLowerCase().includes(q);
      }
      return true;
    });
  }, [rows, showInactive, search]);

  const grouped = useMemo(() => {
    if (!groupByBatch) return null;
    return BATCH_ORDER
      .map((batch) => ({ batch, rows: filtered.filter((r) => r.batch === batch) }))
      .filter(({ rows }) => rows.length > 0);
  }, [filtered, groupByBatch]);

  // Grand totals
  const totalFY  = filtered.reduce((s, r) => s + r.full_year_projected, 0);
  const totalAct = filtered.reduce((s, r) => s + r.ytd_actual, 0);
  const totalDelta = filtered.reduce((s, r) => s + r.ytd_delta, 0);

  return (
    <div className="bg-white border border-[#dddddd] rounded-sm">

      {/* Toolbar */}
      <div className="px-4 py-3 border-b border-[#dddddd] flex flex-wrap items-center gap-3">
        <input
          type="search"
          placeholder="Search client…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="text-sm border border-[#dddddd] rounded-sm px-3 py-1.5 outline-none focus:border-[#0170B9] transition-colors w-48"
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
        <button
          onClick={() => setShowInactive((v) => !v)}
          className={`text-xs px-3 py-1.5 rounded-sm border transition-colors ${
            !showInactive
              ? "bg-[#3a3a3a] text-white border-[#3a3a3a]"
              : "bg-white text-[#4B4F58] border-[#dddddd] hover:border-[#3a3a3a]"
          }`}
        >
          {showInactive ? "Hide churned" : "Show churned"}
        </button>
        <span className="text-xs text-[#6b7280] ml-auto whitespace-nowrap">
          {filtered.length} clients
        </span>
      </div>

      {/* Legend */}
      <div className="px-4 py-2 border-b border-[#dddddd] bg-[#fafafa] flex items-center gap-5 text-[11px] text-[#6b7280]">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm bg-[#e8f4ff] border border-[#0170B9]/20" />
          Actual collected
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm bg-white border border-[#dddddd]" />
          Projected
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm bg-white border border-[#cccccc]" />
          Churned (no projection)
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="text-sm w-max min-w-full">
          <thead>
            <tr className="border-b border-[#dddddd] bg-[#F5F5F5]">
              <th className="text-left px-3 py-2.5 text-xs font-semibold text-[#6b7280] uppercase tracking-wide sticky left-0 bg-[#F5F5F5] min-w-[200px]">
                Client
              </th>
              {months.map(({ key, short }) => (
                <th
                  key={key}
                  className={`text-right px-1.5 py-2.5 text-xs font-semibold text-[#6b7280] uppercase tracking-wide border-l border-[#dddddd] w-20 ${
                    key <= ytdCutoff ? "bg-[#e8f4ff]" : ""
                  }`}
                >
                  {short}
                </th>
              ))}
              <th className="text-right px-2 py-2.5 text-xs font-semibold text-[#6b7280] uppercase tracking-wide border-l border-[#dddddd] w-24">
                YTD Proj.
              </th>
              <th className="text-right px-2 py-2.5 text-xs font-semibold text-[#0170B9] uppercase tracking-wide border-l border-[#dddddd] w-24 bg-[#e8f4ff]">
                YTD Actual
              </th>
              <th className="text-right px-2 py-2.5 text-xs font-semibold text-[#6b7280] uppercase tracking-wide border-l border-[#dddddd] w-28">
                Full Year
              </th>
            </tr>
          </thead>

          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={99} className="px-4 py-10 text-center text-[#6b7280] text-sm">
                  No clients match your filter.
                </td>
              </tr>
            )}

            {/* Grouped view */}
            {groupByBatch && grouped && grouped.map(({ batch, rows: batchRows }) => (
              <Fragment key={batch}>
                <BatchHeader batch={batch} count={batchRows.length} />
                {batchRows.map((row) => (
                  <ClientRow key={row.stripe_id || row.primary_email} row={row} months={months} />
                ))}
                <SubtotalRow rows={batchRows} months={months} label={`Batch ${batch} total`} />
              </Fragment>
            ))}

            {/* Flat view */}
            {!groupByBatch && filtered.map((row) => (
              <ClientRow key={row.stripe_id || row.primary_email} row={row} months={months} />
            ))}
          </tbody>

          {/* Grand total */}
          {filtered.length > 0 && (
            <tfoot>
              <SubtotalRow
                rows={filtered}
                months={months}
                label={groupByBatch ? "Grand total" : "Total"}
              />
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
