"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { ClientRecord } from "@/lib/types";
import { formatMoney } from "@/lib/format";
import { TrendingUp, TrendingDown, X } from "lucide-react";

interface Props {
  newClients: ClientRecord[];
  churnedClients: ClientRecord[];
  prevCollectedMap?: Map<string, number>;
}

type ActivePanel = "new" | "churned" | null;

// ── KPI card that acts as a toggle button ──────────────────────

function LifecycleCard({
  label,
  count,
  accent,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  count: number;
  accent: "green" | "red";
  icon: React.ElementType;
  active: boolean;
  onClick: () => void;
}) {
  const accentBorder = accent === "green" ? "border-t-green-500" : "border-t-red-500";
  const activeBg = accent === "green" ? "bg-green-50" : "bg-red-50";

  return (
    <button
      onClick={onClick}
      className={cn(
        "text-left border border-[#dddddd] border-t-2 rounded-sm p-4 transition-colors w-full",
        accentBorder,
        active ? activeBg : "bg-white hover:bg-[#fafafa]",
        count === 0 && "opacity-50 cursor-default"
      )}
      disabled={count === 0}
    >
      <p className="text-xs text-[#6b7280] uppercase tracking-wide font-medium mb-1 flex items-center gap-1.5">
        <Icon size={11} />
        {label}
      </p>
      <div className="text-xl font-semibold text-[#3a3a3a]">{count}</div>
      <p className="text-xs text-[#6b7280] mt-1">
        {count === 0 ? "none this period" : "this period — click to expand"}
      </p>
    </button>
  );
}

// ── Detail panel ───────────────────────────────────────────────

function ClientTable({
  clients,
  type,
  onClose,
  prevCollectedMap,
}: {
  clients: ClientRecord[];
  type: "new" | "churned";
  onClose: () => void;
  prevCollectedMap?: Map<string, number>;
}) {
  const isNew = type === "new";
  const headerBg = isNew ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200";
  const headerText = isNew ? "text-green-800" : "text-red-800";

  return (
    <div className={cn("border rounded-sm overflow-hidden", isNew ? "border-green-200" : "border-red-200")}>
      {/* Panel header */}
      <div className={cn("flex items-center justify-between px-4 py-2.5 border-b", headerBg)}>
        <span className={cn("text-sm font-semibold", headerText)}>
          {isNew ? "New Clients This Period" : "Churned Clients This Period"}
        </span>
        <button
          onClick={onClose}
          className={cn("rounded p-0.5 hover:bg-black/10 transition-colors", headerText)}
        >
          <X size={14} />
        </button>
      </div>

      {/* Table */}
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-[#F5F5F5] border-b border-[#dddddd]">
            <th className="px-3 py-2 text-left font-medium text-[#6b7280]">Account</th>
            <th className="px-3 py-2 text-center font-medium text-[#6b7280]">Batch</th>
            <th className="px-3 py-2 text-left font-medium text-[#6b7280]">Email</th>
            <th className="px-3 py-2 text-left font-medium text-[#6b7280]">Plan</th>
            <th className="px-3 py-2 text-left font-medium text-[#6b7280] whitespace-nowrap">
              {isNew ? "Start Date" : "Deactivated"}
            </th>
            {!isNew && (
              <th className="px-3 py-2 text-right font-medium text-[#6b7280] whitespace-nowrap">Last Collected</th>
            )}
          </tr>
        </thead>
        <tbody>
          {clients.map((c) => {
            const lastCollected = !isNew && prevCollectedMap && c.stripe_id
              ? (prevCollectedMap.get(c.stripe_id) ?? null)
              : null;
            return (
            <tr key={c.stripe_id ?? c.primary_email} className="border-b border-[#eeeeee] hover:bg-[#fafafa]">
              <td className="px-3 py-2 font-medium text-[#3a3a3a]">
                {c.display_name}
              </td>
              <td className="px-3 py-2 text-center text-[#6b7280]">{c.batch}</td>
              <td className="px-3 py-2 text-[#6b7280]">{c.primary_email}</td>
              <td className="px-3 py-2 text-[#6b7280] max-w-[240px]">
                <span className="truncate block" title={c.billing_plans[0]?.billing_plan ?? "—"}>
                  {c.billing_plans[0]?.billing_plan ?? "—"}
                </span>
              </td>
              <td className="px-3 py-2 text-[#6b7280] whitespace-nowrap">
                {isNew ? (c.start_date ?? "—") : (c.deactivated_month ?? "—")}
              </td>
              {!isNew && (
                <td className="px-3 py-2 text-right font-mono text-[#3a3a3a] whitespace-nowrap">
                  {lastCollected != null ? formatMoney(lastCollected) : <span className="text-[#9ca3af]">—</span>}
                </td>
              )}
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Main export ────────────────────────────────────────────────

export function ClientLifecycleSection({ newClients, churnedClients, prevCollectedMap }: Props) {
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);

  function toggle(panel: "new" | "churned") {
    setActivePanel((prev) => (prev === panel ? null : panel));
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <LifecycleCard
          label="New Clients"
          count={newClients.length}
          accent="green"
          icon={TrendingUp}
          active={activePanel === "new"}
          onClick={() => toggle("new")}
        />
        <LifecycleCard
          label="Churned Clients"
          count={churnedClients.length}
          accent="red"
          icon={TrendingDown}
          active={activePanel === "churned"}
          onClick={() => toggle("churned")}
        />
      </div>

      {activePanel === "new" && (
        <ClientTable clients={newClients} type="new" onClose={() => setActivePanel(null)} />
      )}
      {activePanel === "churned" && (
        <ClientTable clients={churnedClients} type="churned" onClose={() => setActivePanel(null)} prevCollectedMap={prevCollectedMap} />
      )}
    </div>
  );
}
