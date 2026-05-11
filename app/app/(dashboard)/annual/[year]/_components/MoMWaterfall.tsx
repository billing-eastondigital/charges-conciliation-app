"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine,
} from "recharts";
import { formatMoney } from "@/lib/format";
import type { MoMBridge, BridgeMover } from "@/lib/mock/mom-bridge-2026";
import { cn } from "@/lib/utils";
import { UserPlus, TrendingUp, TrendingDown, ArrowRight } from "lucide-react";

// ── Colors ────────────────────────────────────────────────────
const C = {
  total:    "#0170B9",
  positive: "#16a34a",
  posLight: "#bbf7d0",
  negative: "#dc2626",
  negLight: "#fecaca",
  invisible:"transparent",
};

// ── Build waterfall chart data ────────────────────────────────
function buildChartData(bridge: MoMBridge) {
  let running = bridge.prior_collected;

  const rows: Array<{
    name: string;
    sublabel: string;
    base: number;
    value: number;
    delta: number | null;
    type: "total" | "positive" | "negative";
  }> = [];

  rows.push({
    name: bridge.prior_label.replace(" 2026", ""),
    sublabel: formatMoney(bridge.prior_collected),
    base: 0,
    value: bridge.prior_collected,
    delta: null,
    type: "total",
  });

  for (const seg of bridge.segments) {
    if (seg.type === "positive") {
      rows.push({
        name: seg.label,
        sublabel: seg.sublabel,
        base: running,
        value: seg.delta,
        delta: seg.delta,
        type: "positive",
      });
      running += seg.delta;
    } else {
      const after = running + seg.delta;
      rows.push({
        name: seg.label,
        sublabel: seg.sublabel,
        base: after,           // bottom of the red bar
        value: Math.abs(seg.delta), // height of the red bar
        delta: seg.delta,
        type: "negative",
      });
      running = after;
    }
  }

  rows.push({
    name: bridge.current_label.replace(" 2026", ""),
    sublabel: formatMoney(bridge.current_collected),
    base: 0,
    value: bridge.current_collected,
    delta: null,
    type: "total",
  });

  return rows;
}

// ── Custom tooltip ────────────────────────────────────────────
function WaterfallTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div className="bg-white border border-[#dddddd] rounded-sm shadow-md px-3 py-2.5 text-xs min-w-[160px]">
      <p className="font-semibold text-[#3a3a3a] mb-1">{d.name}</p>
      <p className="text-[#6b7280]">{d.sublabel}</p>
      {d.delta !== null && (
        <p className={cn("font-mono font-semibold mt-1", d.delta >= 0 ? "text-green-700" : "text-red-700")}>
          {d.delta >= 0 ? "+" : ""}{formatMoney(d.delta)}
        </p>
      )}
      {d.type === "total" && (
        <p className="font-mono font-semibold text-[#0170B9] mt-1">{formatMoney(d.value)}</p>
      )}
    </div>
  );
}

// ── Custom X-axis tick ────────────────────────────────────────
function CustomXTick({ x, y, payload }: any) {
  const d = payload?.value ?? "";
  return (
    <text x={x} y={y + 12} textAnchor="middle" fontSize={11} fill="#6b7280">
      {d}
    </text>
  );
}

// ── Mover row ─────────────────────────────────────────────────
function MoverRow({ m, isNew }: { m: BridgeMover; isNew?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 border-b border-[#f4f4f4] last:border-0">
      <div className="flex items-center gap-1.5 min-w-0">
        {isNew && (
          <span className="shrink-0 text-[9px] font-semibold bg-green-100 text-green-700 px-1 py-0.5 rounded-[2px] uppercase tracking-wide">
            NEW
          </span>
        )}
        <span className="text-xs text-[#3a3a3a] truncate" title={m.display_name}>
          {m.display_name}
        </span>
        <span className="shrink-0 text-[10px] text-[#9ca3af]">
          {m.batch !== "—" ? `B${m.batch}` : ""}
        </span>
      </div>
      <span className={cn(
        "shrink-0 text-xs font-mono font-semibold",
        m.delta >= 0 ? "text-green-700" : "text-red-700"
      )}>
        {m.delta >= 0 ? "+" : ""}{formatMoney(m.delta)}
      </span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────
export function MoMWaterfall({ bridge }: { bridge: MoMBridge }) {
  const chartData = buildChartData(bridge);
  const totalDelta = bridge.current_collected - bridge.prior_collected;
  const deltaPct = (totalDelta / bridge.prior_collected) * 100;

  // Y-axis domain — zoom into relevant range
  const allTops = chartData.map((d) => d.base + d.value);
  const allBases = chartData.map((d) => d.base).filter((b) => b > 0);
  const yMax = Math.ceil(Math.max(...allTops) * 1.025 / 1000) * 1000;
  const yMin = Math.floor(Math.min(...allBases) * 0.975 / 1000) * 1000;

  // Avg ticket for existing clients
  const avgTicketPrior = bridge.prior_collected / bridge.existing_clients_prior;
  const avgTicketCurrent = bridge.existing_collected_current / bridge.existing_clients_current;
  const avgTicketDelta = avgTicketCurrent - avgTicketPrior;
  const avgTicketDeltaPct = (avgTicketDelta / avgTicketPrior) * 100;

  // Positive and negative movers
  const posMovers = bridge.segments
    .filter((s) => s.type === "positive")
    .flatMap((s) => s.movers);
  const negMovers = bridge.segments
    .filter((s) => s.type === "negative")
    .flatMap((s) => s.movers);

  return (
    <div className="bg-white border border-[#dddddd] rounded-sm overflow-hidden">

      {/* ── Header ── */}
      <div className="px-5 py-3.5 border-b border-[#dddddd] flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[#3a3a3a] uppercase tracking-wide">
            Revenue Bridge
          </h2>
          <div className="flex items-center gap-2 mt-0.5 text-sm text-[#6b7280]">
            <span className="font-mono">{formatMoney(bridge.prior_collected)}</span>
            <ArrowRight size={13} />
            <span className="font-mono">{formatMoney(bridge.current_collected)}</span>
            <span className="text-xs text-[#9ca3af]">
              {bridge.prior_label} → {bridge.current_label}
            </span>
          </div>
        </div>
        <div className={cn(
          "text-lg font-semibold font-mono px-3 py-1 rounded-sm",
          totalDelta >= 0
            ? "text-green-700 bg-green-50 border border-green-200"
            : "text-red-700 bg-red-50 border border-red-200"
        )}>
          {totalDelta >= 0 ? "+" : ""}{formatMoney(totalDelta)}
          <span className="text-xs font-sans ml-1.5 opacity-80">
            ({deltaPct >= 0 ? "+" : ""}{deltaPct.toFixed(1)}%)
          </span>
        </div>
      </div>

      {/* ── Waterfall chart ── */}
      <div className="px-4 pt-5 pb-2">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData} barCategoryGap="22%" margin={{ top: 20, right: 16, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis
              dataKey="name"
              tick={<CustomXTick />}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={[yMin, yMax]}
              tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
              tick={{ fontSize: 10, fill: "#9ca3af" }}
              axisLine={false}
              tickLine={false}
              width={46}
            />
            <Tooltip content={<WaterfallTooltip />} cursor={{ fill: "#f9fafb" }} />
            <ReferenceLine y={bridge.prior_collected} stroke="#dddddd" strokeDasharray="4 3" />
            <ReferenceLine y={bridge.current_collected} stroke="#0170B9" strokeDasharray="4 3" strokeOpacity={0.4} />

            {/* Invisible base bar (creates the floating effect) */}
            <Bar dataKey="base" stackId="wf" fill="transparent" isAnimationActive={false}>
              {chartData.map((_, i) => (
                <Cell key={i} fill="transparent" />
              ))}
            </Bar>

            {/* Visible value bar */}
            <Bar dataKey="value" stackId="wf" radius={[3, 3, 0, 0]} maxBarSize={60}
              label={{
                position: "top",
                formatter: (_: any, entry: any) => {
                  const d = entry?.value !== undefined ? entry : null;
                  return "";
                },
                fontSize: 10,
              }}
            >
              {chartData.map((d, i) => (
                <Cell key={i} fill={C[d.type]} fillOpacity={d.type === "total" ? 0.9 : 1} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        {/* Amount labels below X axis */}
        <div className="flex justify-around mt-0 mb-1 px-[46px]">
          {chartData.map((d, i) => (
            <div key={i} className="text-center flex-1">
              {d.delta !== null ? (
                <span className={cn(
                  "text-[10px] font-mono font-semibold",
                  d.delta >= 0 ? "text-green-700" : "text-red-700"
                )}>
                  {d.delta >= 0 ? "+" : ""}{formatMoney(d.delta)}
                </span>
              ) : (
                <span className="text-[10px] font-mono text-[#0170B9] font-medium">
                  {formatMoney(d.value)}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Avg ticket context ── */}
      <div className="mx-5 mb-4 px-4 py-3 bg-[#F5F5F5] rounded-sm border border-[#eeeeee]">
        <p className="text-xs font-semibold text-[#4B4F58] uppercase tracking-wide mb-2">
          Avg ticket — existing {bridge.existing_clients_current} clients (excl. new)
        </p>
        <div className="flex items-center gap-3 flex-wrap text-sm">
          <div>
            <span className="text-xs text-[#6b7280]">{bridge.prior_label.split(" ")[0]} </span>
            <span className="font-mono font-semibold text-[#3a3a3a]">{formatMoney(avgTicketPrior)}</span>
          </div>
          <ArrowRight size={12} className="text-[#9ca3af]" />
          <div>
            <span className="text-xs text-[#6b7280]">{bridge.current_label.split(" ")[0]} </span>
            <span className="font-mono font-semibold text-[#3a3a3a]">{formatMoney(avgTicketCurrent)}</span>
          </div>
          <span className={cn(
            "text-xs font-semibold font-mono px-2 py-0.5 rounded-[2px]",
            avgTicketDelta >= 0 ? "text-green-700 bg-green-50" : "text-red-700 bg-red-50"
          )}>
            {avgTicketDelta >= 0 ? "+" : ""}{formatMoney(avgTicketDelta)} ({avgTicketDeltaPct >= 0 ? "+" : ""}{avgTicketDeltaPct.toFixed(1)}%)
          </span>
          <span className="text-xs text-[#9ca3af]">
            Variable-fee clients drove most of this change (ad spend ↓)
          </span>
        </div>
      </div>

      {/* ── Movers panel ── */}
      <div className="grid grid-cols-2 gap-0 border-t border-[#dddddd]">

        {/* Contributors */}
        <div className="px-5 py-4 border-r border-[#dddddd]">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <p className="text-xs font-semibold text-[#3a3a3a] uppercase tracking-wide">
              Contributors
            </p>
            <span className="text-xs text-green-700 font-mono font-medium ml-auto">
              +{formatMoney(posMovers.reduce((s, m) => s + m.delta, 0))}
            </span>
          </div>
          <div>
            {posMovers.map((m) => (
              <MoverRow key={m.stripe_id ?? m.display_name} m={m} isNew={m.is_new} />
            ))}
          </div>
        </div>

        {/* Detractors */}
        <div className="px-5 py-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-red-500" />
            <p className="text-xs font-semibold text-[#3a3a3a] uppercase tracking-wide">
              Detractors
            </p>
            <span className="text-xs text-red-700 font-mono font-medium ml-auto">
              {formatMoney(negMovers.reduce((s, m) => s + m.delta, 0))}
            </span>
          </div>
          <div>
            {negMovers.map((m) => (
              <MoverRow key={m.stripe_id ?? m.display_name} m={m} />
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="px-5 py-2 border-t border-[#f0f0f0] flex items-center gap-4 text-[10px] text-[#9ca3af]">
        <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-[2px] bg-[#0170B9] opacity-90" /> Total (period)</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-[2px] bg-green-600" /> Positive contribution</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-[2px] bg-red-600" /> Negative contribution</span>
        <span className="ml-auto">Phase 1: Mar–Apr data only · Per-client history available in Phase 2</span>
      </div>
    </div>
  );
}
