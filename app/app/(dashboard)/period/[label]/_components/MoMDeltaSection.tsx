import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { MoMBridgeData } from "@/lib/mock/mom-bridge-2026";

interface Props {
  bridge: MoMBridgeData;
}

// ── Waterfall bar column ────────────────────────────────────────
function WFBar({
  heightPx,
  spacerPx,
  totalPx,
  color,
  isBase,
  negative,
}: {
  heightPx: number;
  spacerPx: number;
  totalPx: number;
  color: string;
  isBase: boolean;
  negative?: boolean;
}) {
  if (isBase) {
    return (
      <div className="w-full flex flex-col justify-end" style={{ height: totalPx }}>
        <div className={cn("w-full rounded-t-sm", color)} style={{ height: heightPx }} />
      </div>
    );
  }
  // Negative bars hang downward from the current running total
  if (negative) {
    return (
      <div className="w-full flex flex-col" style={{ height: totalPx }}>
        <div style={{ height: spacerPx }} />
        <div className={cn("w-full", color)} style={{ height: heightPx }} />
        <div style={{ flex: 1 }} />
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

  // Peak = prior + new clients (highest possible point), with 15% headroom
  const PEAK = (bridge.prior_collected + bridge.new_clients_revenue) * 1.15;
  const px = (v: number) => Math.max(2, Math.round((Math.abs(v) / PEAK) * H));

  const priorH   = px(bridge.prior_collected);
  const newH     = bridge.new_clients_revenue > 0.005 ? px(bridge.new_clients_revenue) : 0;
  const churnH   = bridge.churned_revenue_lost > 0.005 ? px(bridge.churned_revenue_lost) : 0;
  const endH     = px(bridge.current_collected);

  // Running total after new clients, before churn — used as spacer for churn bar
  const afterNew = bridge.prior_collected + bridge.new_clients_revenue;
  const afterNewH = Math.round((afterNew / PEAK) * H);

  // Spacer for new bar: sits on top of prior bar
  const newSpacer = H - priorH - newH;

  // Spacer for churn bar: hangs down from afterNew level
  const churnSpacer = H - afterNewH;

  // Retained delta bar
  const retainedH = bridge.retained_delta !== 0 ? px(bridge.retained_delta) : 0;
  const afterChurn = afterNew - bridge.churned_revenue_lost;
  const afterChurnH = Math.round((afterChurn / PEAK) * H);
  const retainedIsDown = bridge.retained_delta < -0.005;
  // Spacer: if down, bar hangs from afterChurn; if up, bar rises from afterChurn
  const retainedSpacer = retainedIsDown
    ? H - afterChurnH
    : H - afterChurnH - retainedH;

  const isDown = bridge.delta < 0;
  const pct = Math.abs((bridge.delta / bridge.prior_collected) * 100).toFixed(1);

  type ColDef = {
    key: string;
    label: string;
    amount: string;
    sub: string | null;
    barH: number;
    spacer: number;
    color: string;
    isBase: boolean;
    negative?: boolean;
    show: boolean;
  };

  const cols: ColDef[] = [
    {
      key:    "start",
      label:  bridge.prior_period,
      amount: formatMoney(bridge.prior_collected),
      sub:    null,
      barH:   priorH,
      spacer: 0,
      color:  "bg-[#9ca3af]",
      isBase: true,
      show:   true,
    },
    {
      key:    "new",
      label:  "Won clients",
      amount: `+${formatMoney(bridge.new_clients_revenue)}`,
      sub:    `${bridge.new_client_count} added`,
      barH:   newH,
      spacer: newSpacer,
      color:  "bg-green-400",
      isBase: false,
      show:   bridge.new_clients_revenue > 0.005,
    },
    {
      key:      "churned",
      label:    "Lost clients",
      amount:   `-${formatMoney(bridge.churned_revenue_lost)}`,
      sub:      `${bridge.churned_client_count} lost`,
      barH:     churnH,
      spacer:   churnSpacer,
      color:    "bg-orange-400",
      isBase:   false,
      negative: true,
      show:     bridge.churned_revenue_lost > 0.005,
    },
    {
      key:    "ticket",
      label:  "Avg ticket",
      amount: `${bridge.retained_delta > 0 ? "+" : ""}${formatMoney(bridge.retained_delta)}`,
      sub:    `${bridge.retained_count} retained`,
      barH:   retainedH,
      spacer: retainedSpacer,
      color:  retainedIsDown ? "bg-red-400" : "bg-green-300",
      isBase: false,
      show:   true,
    },
    {
      key:    "end",
      label:  bridge.current_period,
      amount: formatMoney(bridge.current_collected),
      sub:    `${isDown ? "−" : "+"}${pct}% vs prior`,
      barH:   endH,
      spacer: 0,
      color:  "bg-[#0170B9]",
      isBase: true,
      show:   true,
    },
  ].filter((c) => c.show);

  const hasNewClients     = bridge.new_clients.length > 0;
  const hasChurnedClients = bridge.churned_clients && bridge.churned_clients.length > 0;
  const hasTopMovers      = bridge.top_movers.length > 0;

  return (
    <div className="border border-[#dddddd] rounded-sm bg-white overflow-hidden">
      {/* Title bar */}
      <div className="px-4 py-2.5 border-b border-[#eeeeee] bg-[#fafafa] flex items-center gap-2">
        <span className="text-xs font-semibold text-[#6b7280] uppercase tracking-wide">
          Month-over-month
        </span>
        <span className="text-xs text-[#9ca3af]">vs. {bridge.prior_period}</span>
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
          {cols.map((col) => (
            <div key={col.key} className="flex-1 flex flex-col items-center gap-0">
              {/* Amount label above bar */}
              <span
                className={cn(
                  "text-xs font-semibold mb-1 whitespace-nowrap",
                  col.key === "start"   && "text-[#6b7280]",
                  col.key === "new"     && "text-green-600",
                  col.key === "churned" && "text-orange-600",
                  col.key === "ticket"  && (retainedIsDown ? "text-red-600" : "text-green-600"),
                  col.key === "end"     && "text-[#0170B9]"
                )}
              >
                {col.amount}
              </span>

              {/* Bar */}
              <div className="w-full">
                <WFBar
                  heightPx={col.barH}
                  spacerPx={col.spacer}
                  totalPx={H}
                  color={col.color}
                  isBase={col.isBase}
                  negative={col.negative}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Labels below bars */}
        <div className={`flex gap-1.5 mt-2`} style={{ display: "flex" }}>
          {cols.map((col) => (
            <div key={col.key} className="flex-1 text-center">
              <p className="text-[10px] font-medium text-[#6b7280]">{col.label}</p>
              {col.sub && (
                <p className="text-[10px] text-[#9ca3af]">{col.sub}</p>
              )}
            </div>
          ))}
        </div>

        {/* Movers detail */}
        {(hasNewClients || hasChurnedClients || hasTopMovers) && (
          <div className="mt-4 pt-3 border-t border-[#eeeeee] space-y-3">

            {/* Won clients */}
            {hasNewClients && (
              <div>
                <p className="text-[10px] text-[#9ca3af] uppercase tracking-wide font-semibold mb-1.5">
                  Won clients
                </p>
                <div className="flex flex-wrap gap-x-5 gap-y-1">
                  {bridge.new_clients.map((c) => (
                    <span key={c.name} className="text-xs text-[#4B4F58]">
                      <span className="font-semibold text-green-600">
                        +{formatMoney(c.amount)}
                      </span>{" "}
                      {c.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Lost clients */}
            {hasChurnedClients && (
              <div>
                <p className="text-[10px] text-[#9ca3af] uppercase tracking-wide font-semibold mb-1.5">
                  Lost clients
                </p>
                <div className="flex flex-wrap gap-x-5 gap-y-1">
                  {bridge.churned_clients!.map((c) => (
                    <span key={c.name} className="text-xs text-[#4B4F58]">
                      <span className="font-semibold text-orange-600">
                        -{formatMoney(c.last_amount)}
                      </span>{" "}
                      {c.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Avg ticket movers */}
            {hasTopMovers && (
              <div>
                <p className="text-[10px] text-[#9ca3af] uppercase tracking-wide font-semibold mb-1.5">
                  Main drivers of avg ticket shift
                </p>
                <div className="flex flex-wrap gap-x-5 gap-y-1">
                  {bridge.top_movers
                    .sort((a, b) => a.delta - b.delta)
                    .slice(0, 5)
                    .map((m) => {
                      const isUp = m.delta > 0;
                      return (
                        <span key={m.name} className="text-xs text-[#4B4F58]">
                          <span className={cn("font-semibold", isUp ? "text-green-600" : "text-red-600")}>
                            {isUp ? "+" : ""}{formatMoney(m.delta)}
                          </span>{" "}
                          {m.name}
                        </span>
                      );
                    })}
                </div>
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  );
}
