import { ArrowRight, ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { MoMBridgeData } from "@/lib/mock/mom-bridge-2026";

interface Props {
  bridge: MoMBridgeData;
}

export function MoMDeltaSection({ bridge }: Props) {
  const isPositive = bridge.delta >= 0;
  const pct = ((bridge.delta / bridge.prior_collected) * 100).toFixed(1);

  const upMovers = bridge.top_movers
    .filter((m) => m.delta > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 3);
  const downMovers = bridge.top_movers
    .filter((m) => m.delta < 0)
    .sort((a, b) => a.delta - b.delta)
    .slice(0, 3);

  return (
    <div className="border border-[#dddddd] rounded-sm bg-white">
      {/* Title + summary */}
      <div className="flex items-center gap-4 px-4 py-3 border-b border-[#eeeeee] bg-[#fafafa] flex-wrap">
        <span className="text-xs font-semibold text-[#6b7280] uppercase tracking-wide">
          Month-over-month revenue
        </span>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-[#3a3a3a]">
            {formatMoney(bridge.prior_collected)}
          </span>
          <ArrowRight size={13} className="text-[#9ca3af] shrink-0" />
          <span className="text-sm font-semibold text-[#3a3a3a]">
            {formatMoney(bridge.current_collected)}
          </span>
          <span
            className={cn(
              "text-sm font-semibold",
              isPositive ? "text-green-600" : "text-red-600"
            )}
          >
            {isPositive ? "+" : ""}
            {formatMoney(bridge.delta)}
          </span>
          <span
            className={cn(
              "text-[10px] px-1.5 py-0.5 rounded-sm font-semibold",
              isPositive
                ? "bg-green-100 text-green-700"
                : "bg-red-100 text-red-700"
            )}
          >
            {isPositive ? "+" : ""}
            {pct}%
          </span>
        </div>
        <span className="text-xs text-[#9ca3af]">vs {bridge.prior_period}</span>
      </div>

      {/* Three driver cards */}
      <div className="grid grid-cols-3 divide-x divide-[#eeeeee] border-b border-[#eeeeee]">
        {/* New clients */}
        <div className="px-4 py-3">
          <p className="text-[10px] text-[#9ca3af] uppercase tracking-wide font-semibold mb-2">
            Gained clients
          </p>
          {bridge.new_client_count === 0 ? (
            <div className="flex items-center gap-1 text-xs text-[#9ca3af]">
              <Minus size={11} />
              none this period
            </div>
          ) : (
            <>
              <div className="flex items-baseline gap-1.5 mb-2">
                <span className="text-sm font-semibold text-green-600">
                  +{formatMoney(bridge.new_clients_revenue)}
                </span>
                <span className="text-[10px] text-[#9ca3af]">
                  {bridge.new_client_count} added
                </span>
              </div>
              <div className="space-y-0.5">
                {bridge.new_clients.map((c) => (
                  <div
                    key={c.name}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="text-[10px] text-[#6b7280] truncate">
                      {c.name}
                    </span>
                    <span className="text-[10px] font-semibold text-green-600 shrink-0">
                      +{formatMoney(c.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Churned clients */}
        <div className="px-4 py-3">
          <p className="text-[10px] text-[#9ca3af] uppercase tracking-wide font-semibold mb-2">
            Lost clients
          </p>
          {bridge.churned_client_count === 0 ? (
            <div className="flex items-center gap-1 text-xs text-[#9ca3af]">
              <Minus size={11} />
              none this period
            </div>
          ) : (
            <div className="flex items-baseline gap-1.5">
              <span className="text-sm font-semibold text-red-600">
                -{formatMoney(bridge.churned_revenue_lost)}
              </span>
              <span className="text-[10px] text-[#9ca3af]">
                {bridge.churned_client_count} lost
              </span>
            </div>
          )}
        </div>

        {/* Avg ticket shift */}
        <div className="px-4 py-3">
          <p className="text-[10px] text-[#9ca3af] uppercase tracking-wide font-semibold mb-2">
            Avg ticket — retained clients
          </p>
          <div className="flex items-baseline gap-1.5 mb-1">
            <span
              className={cn(
                "text-sm font-semibold",
                bridge.avg_ticket_delta >= 0 ? "text-green-600" : "text-red-600"
              )}
            >
              {bridge.avg_ticket_delta >= 0 ? "+" : ""}
              {formatMoney(bridge.avg_ticket_delta)}
            </span>
            <span className="text-[10px] text-[#9ca3af]">per client</span>
          </div>
          <p className="text-[10px] text-[#9ca3af]">
            {formatMoney(bridge.avg_ticket_prior)} → {formatMoney(bridge.avg_ticket_current)}
            {" · "}
            {bridge.retained_count} retained
          </p>
        </div>
      </div>

      {/* Top movers */}
      <div className="px-4 py-3">
        <p className="text-[10px] font-semibold text-[#9ca3af] uppercase tracking-wide mb-2.5">
          Main contributors to avg ticket shift
        </p>
        <div className="grid grid-cols-2 gap-x-8 gap-y-1.5">
          {/* Up movers */}
          <div className="space-y-1.5">
            {upMovers.length === 0 ? (
              <p className="text-xs text-[#9ca3af]">No increases</p>
            ) : (
              upMovers.map((m) => (
                <div
                  key={m.name}
                  className="flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-1 min-w-0">
                    <ArrowUpRight
                      size={11}
                      className="text-green-500 shrink-0"
                    />
                    <span className="text-xs text-[#4B4F58] truncate">
                      {m.name}
                    </span>
                  </div>
                  <span className="text-xs font-semibold text-green-600 shrink-0 whitespace-nowrap">
                    +{formatMoney(m.delta)}
                  </span>
                </div>
              ))
            )}
          </div>
          {/* Down movers */}
          <div className="space-y-1.5">
            {downMovers.length === 0 ? (
              <p className="text-xs text-[#9ca3af]">No decreases</p>
            ) : (
              downMovers.map((m) => (
                <div
                  key={m.name}
                  className="flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-1 min-w-0">
                    <ArrowDownRight
                      size={11}
                      className="text-red-500 shrink-0"
                    />
                    <span className="text-xs text-[#4B4F58] truncate">
                      {m.name}
                    </span>
                  </div>
                  <span className="text-xs font-semibold text-red-600 shrink-0 whitespace-nowrap">
                    {formatMoney(m.delta)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
