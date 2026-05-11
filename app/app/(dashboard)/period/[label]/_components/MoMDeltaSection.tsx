import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { MoMBridgeData } from "@/lib/mock/mom-bridge-2026";

interface Props {
  bridge: MoMBridgeData;
}

// ── Waterfall bar column ────────────────────────────────────────
// isBase=true  → bar sits at bottom (start / end columns)
// isBase=false → bar floats at the peak level (intermediate columns)
function WFBar({
  heightPx,
  spacerPx,
  totalPx,
  color,
  isBase,
}: {
  heightPx: number;
  spacerPx: number;
  totalPx: number;
  color: string;
  isBase: boolean;
}) {
  if (isBase) {
    return (
      <div className="w-full flex flex-col justify-end" style={{ height: totalPx }}>
        <div className={cn("w-full rounded-t-sm", color)} style={{ height: heightPx }} />
      </div>
    );
  }
  return (
    <div className="w-full flex flex-col" style={{ height: totalPx }}>
      <div style={{ height: spacerPx }} />
      <div className={cn("w-full", color)} style={{ height: heightPx }} />
      <div style={{ flex: 1 }} />
    </div>
  );
}

// ── Main section ───────────────────────────────────────────────
export function MoMDeltaSection({ bridge }: Props) {
  const H = 96; // chart height px
  // Add 15% headroom above the peak so bars don't crowd the top
  const PEAK = (bridge.prior_collected + bridge.new_clients_revenue) * 1.15;
  const px = (v: number) => Math.round((v / PEAK) * H);

  const marchH  = px(bridge.prior_collected);
  const newH    = px(bridge.new_clients_revenue);
  const aprilH  = px(bridge.current_collected);
  const ticketH = marchH + newH - aprilH; // floating bar hangs from peak to April level
  const spacer  = H - marchH - newH;      // gap above floating bars

  const isDown = bridge.delta < 0;
  const pct = Math.abs((bridge.delta / bridge.prior_collected) * 100).toFixed(1);

  const topMovers = bridge.top_movers
    .sort((a, b) => a.delta - b.delta) // most negative first
    .slice(0, 5);

  const cols = [
    {
      key:    "start",
      label:  bridge.prior_period,
      amount: formatMoney(bridge.prior_collected),
      sub:    null,
      barH:   marchH,
      color:  "bg-[#9ca3af]",
      isBase: true,
    },
    {
      key:    "new",
      label:  "Clientes ganados",
      amount: `+${formatMoney(bridge.new_clients_revenue)}`,
      sub:    `${bridge.new_client_count} nuevos`,
      barH:   newH,
      color:  "bg-green-400",
      isBase: false,
    },
    {
      key:    "ticket",
      label:  "Ticket promedio",
      amount: formatMoney(bridge.avg_ticket_delta),
      sub:    `${bridge.retained_count} retenidos`,
      barH:   ticketH,
      color:  "bg-red-400",
      isBase: false,
    },
    {
      key:    "end",
      label:  bridge.current_period,
      amount: formatMoney(bridge.current_collected),
      sub:    `${isDown ? "−" : "+"}${pct}% vs anterior`,
      barH:   aprilH,
      color:  "bg-[#0170B9]",
      isBase: true,
    },
  ];

  return (
    <div className="border border-[#dddddd] rounded-sm bg-white overflow-hidden">
      {/* Title bar */}
      <div className="px-4 py-2.5 border-b border-[#eeeeee] bg-[#fafafa] flex items-center gap-2">
        <span className="text-xs font-semibold text-[#6b7280] uppercase tracking-wide">
          Cambio mes a mes
        </span>
        <span className="text-xs text-[#9ca3af]">vs {bridge.prior_period}</span>
        <span
          className={cn(
            "ml-auto text-xs font-semibold px-1.5 py-0.5 rounded-sm",
            isDown ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
          )}
        >
          {isDown ? "−" : "+"}
          {pct}%
        </span>
      </div>

      <div className="px-6 pt-5 pb-5">
        {/* Waterfall bars */}
        <div className="flex items-end gap-1.5">
          {cols.map((col, i) => (
            <div key={col.key} className="flex-1 flex flex-col items-center gap-0">
              {/* Amount label above bar */}
              <span
                className={cn(
                  "text-xs font-semibold mb-1 whitespace-nowrap",
                  col.key === "start"  && "text-[#6b7280]",
                  col.key === "new"    && "text-green-600",
                  col.key === "ticket" && "text-red-600",
                  col.key === "end"    && "text-[#0170B9]"
                )}
              >
                {col.amount}
              </span>

              {/* Bar */}
              <div className="w-full">
                <WFBar
                  heightPx={col.barH}
                  spacerPx={spacer}
                  totalPx={H}
                  color={col.color}
                  isBase={col.isBase}
                />
              </div>

              {/* Arrow connector between columns (except last) */}
              {i < cols.length - 1 && (
                <div
                  className="hidden"
                  aria-hidden
                />
              )}
            </div>
          ))}
        </div>

        {/* Labels below bars */}
        <div className="flex gap-1.5 mt-2">
          {cols.map((col) => (
            <div key={col.key} className="flex-1 text-center">
              <p className="text-[10px] font-medium text-[#6b7280]">{col.label}</p>
              {col.sub && (
                <p className="text-[10px] text-[#9ca3af]">{col.sub}</p>
              )}
            </div>
          ))}
        </div>

        {/* Top movers */}
        <div className="mt-4 pt-3 border-t border-[#eeeeee]">
          <p className="text-[10px] text-[#9ca3af] uppercase tracking-wide font-semibold mb-2">
            Principales responsables del cambio en ticket
          </p>
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            {topMovers.map((m) => {
              const isUp = m.delta > 0;
              return (
                <span key={m.name} className="text-xs text-[#4B4F58]">
                  <span
                    className={cn(
                      "font-semibold",
                      isUp ? "text-green-600" : "text-red-600"
                    )}
                  >
                    {isUp ? "+" : ""}
                    {formatMoney(m.delta)}
                  </span>{" "}
                  {m.name}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
