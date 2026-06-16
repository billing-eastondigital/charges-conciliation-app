"use client";

import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Search } from "lucide-react";
import { useState, useTransition } from "react";

// ── Types ──────────────────────────────────────────────────────────────────

export interface AdsSpendRow {
  id: number;
  period_label: string;
  google_ads_customer_id: string;
  client_name: string;
  campaign_id: string;
  campaign_name: string;
  channel_type: number;
  channel_label: string;
  campaign_status: number;
  impressions: number;
  clicks: number;
  cost_usd: number;
  conversions: number;
  conversion_value: number;
  fetched_at: string;
  billable: boolean;
  system_billable: boolean;
  manually_excluded: boolean;
  exclusion_reason: string | null;
}

export interface CustomerOption {
  id: string;
  name: string;
}

interface Props {
  rows: AdsSpendRow[];
  periods: { period_label: string; is_closed: boolean }[];
  selectedPeriod: string;
  selectedCustomer: string;
  customerOptions: CustomerOption[];
  onToggleOverride: (
    periodLabel: string,
    customerId: string,
    campaignId: string,
    excluded: boolean,
    reason: string | null
  ) => Promise<{ ok: boolean; error?: string }>;
}

// ── Channel badge ──────────────────────────────────────────────────────────

const CHANNEL_COLORS: Record<string, string> = {
  Search:   "bg-blue-50 text-[#0170B9] border-blue-200",
  Shopping: "bg-green-50 text-green-700 border-green-200",
  PMax:     "bg-purple-50 text-purple-700 border-purple-200",
  Display:  "bg-yellow-50 text-yellow-700 border-yellow-200",
  Video:    "bg-red-50 text-red-700 border-red-200",
};

function ChannelBadge({ label }: { label: string }) {
  const classes = CHANNEL_COLORS[label] ?? "bg-[#F5F5F5] text-[#6b7280] border-[#dddddd]";
  return (
    <span className={cn("inline-block px-1.5 py-0.5 rounded-[2px] text-[10px] font-medium border whitespace-nowrap", classes)}>
      {label}
    </span>
  );
}

// ── Component ──────────────────────────────────────────────────────────────

export function AdsPageClient({ rows, periods, selectedPeriod, selectedCustomer, customerOptions, onToggleOverride }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [billableFilter, setBillableFilter] = useState<"all" | "billable" | "excluded">("all");
  const [pending, startTransition] = useTransition();
  // Track which row IDs are currently being toggled for optimistic loading state
  const [togglingIds, setTogglingIds] = useState<Set<number>>(new Set());

  function handleToggle(row: AdsSpendRow) {
    if (!row.system_billable) return; // can't override system-excluded campaigns
    setTogglingIds((prev) => new Set(prev).add(row.id));
    startTransition(async () => {
      await onToggleOverride(
        row.period_label,
        row.google_ads_customer_id,
        row.campaign_id,
        !row.manually_excluded,
        !row.manually_excluded ? "Manual override" : null
      );
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(row.id);
        return next;
      });
    });
  }

  function navigate(period: string, customer: string) {
    const params = new URLSearchParams();
    if (period) params.set("period", period);
    if (customer) params.set("customer", customer);
    router.push(`/ads?${params.toString()}`);
  }

  const filtered = rows.filter((r) => {
    if (billableFilter === "billable" && !r.billable) return false;
    if (billableFilter === "excluded" && r.billable) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.campaign_name.toLowerCase().includes(q) || r.client_name.toLowerCase().includes(q);
    }
    return true;
  });

  // Summary stats (billable = system-billable AND not manually excluded)
  const billableRows = rows.filter((r) => r.billable);
  const manuallyExcludedCount = rows.filter((r) => r.manually_excluded).length;
  const totalCost = rows.reduce((s, r) => s + Number(r.cost_usd), 0);
  const totalRevenue = rows.reduce((s, r) => s + Number(r.conversion_value), 0);
  const billableCost = billableRows.reduce((s, r) => s + Number(r.cost_usd), 0);
  const billableRevenue = billableRows.reduce((s, r) => s + Number(r.conversion_value), 0);

  return (
    <div>
      {/* Header */}
      <div className="px-6 py-5 border-b border-[#dddddd]">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold text-[#3a3a3a]">Google Ads Spend</h1>
            <p className="text-sm text-[#6b7280] mt-0.5">
              {rows.length} campaigns · {billableRows.length} billable · {rows.length - billableRows.length} excluded
              {manuallyExcludedCount > 0 && (
                <span className="ml-1 text-amber-600">({manuallyExcludedCount} manual)</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Period */}
            <select
              value={selectedPeriod}
              onChange={(e) => navigate(e.target.value, selectedCustomer)}
              className="px-3 py-1.5 text-sm border border-[#dddddd] rounded-[2px] bg-white focus:outline-none focus:border-[#0170B9]"
            >
              {periods.map((p) => (
                <option key={p.period_label} value={p.period_label}>
                  {p.period_label}{p.is_closed ? " (closed)" : ""}
                </option>
              ))}
            </select>

            {/* Customer */}
            <select
              value={selectedCustomer}
              onChange={(e) => navigate(selectedPeriod, e.target.value)}
              className="px-3 py-1.5 text-sm border border-[#dddddd] rounded-[2px] bg-white focus:outline-none focus:border-[#0170B9]"
            >
              <option value="">All clients</option>
              {customerOptions.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>

            {/* Search */}
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9ca3af]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search campaign…"
                className="pl-8 pr-3 py-1.5 text-sm border border-[#dddddd] rounded-[2px] w-48 focus:outline-none focus:border-[#0170B9]"
              />
            </div>

            {/* Billable filter */}
            <div className="flex rounded-[2px] border border-[#dddddd] overflow-hidden text-xs">
              {(["all", "billable", "excluded"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setBillableFilter(v)}
                  className={cn(
                    "px-3 py-1.5 capitalize",
                    billableFilter === v
                      ? "bg-[#0170B9] text-white"
                      : "bg-white text-[#6b7280] hover:bg-[#F5F5F5]"
                  )}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Summary KPIs */}
        {rows.length > 0 && (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Gross Revenue", value: formatMoney(totalRevenue), sub: "all campaigns" },
              { label: "Billable Revenue", value: formatMoney(billableRevenue), sub: "excl. brand", highlight: true },
              { label: "Gross Cost", value: formatMoney(totalCost), sub: "all campaigns" },
              { label: "Billable Cost", value: formatMoney(billableCost), sub: "excl. brand", highlight: true },
            ].map((kpi) => (
              <div key={kpi.label} className={cn(
                "rounded-[2px] border px-4 py-3",
                kpi.highlight ? "border-[#0170B9]/20 bg-blue-50/50" : "border-[#dddddd] bg-[#fafafa]"
              )}>
                <p className="text-[11px] text-[#6b7280] uppercase tracking-wide">{kpi.label}</p>
                <p className={cn("text-lg font-semibold mt-0.5 font-mono", kpi.highlight ? "text-[#0170B9]" : "text-[#3a3a3a]")}>
                  {kpi.value}
                </p>
                <p className="text-[11px] text-[#9ca3af] mt-0.5">{kpi.sub}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Table */}
      {rows.length === 0 ? (
        <div className="py-20 text-center text-sm text-[#9ca3af]">
          No Google Ads data for {selectedPeriod}.{" "}
          {selectedCustomer ? "Try selecting a different client or " : ""}
          Run the pipeline on the billing day to ingest spend data.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table style={{ tableLayout: "fixed", borderCollapse: "collapse", width: "max-content" }}>
            <colgroup>
              <col style={{ width: 180, minWidth: 180 }} /> {/* Client */}
              <col style={{ width: 120, minWidth: 120 }} /> {/* Google ID */}
              <col style={{ width: 300, minWidth: 300 }} /> {/* Campaign */}
              <col style={{ width: 80,  minWidth: 80  }} /> {/* Channel */}
              <col style={{ width: 72,  minWidth: 72  }} /> {/* Billable */}
              <col style={{ width: 90,  minWidth: 90  }} /> {/* Impressions */}
              <col style={{ width: 70,  minWidth: 70  }} /> {/* Clicks */}
              <col style={{ width: 60,  minWidth: 60  }} /> {/* Conv */}
              <col style={{ width: 120, minWidth: 120 }} /> {/* Conv Value */}
              <col style={{ width: 100, minWidth: 100 }} /> {/* Cost */}
              <col style={{ width: 180, minWidth: 180 }} /> {/* Exclusion */}
            </colgroup>

            <thead>
              <tr className="border-b border-[#dddddd] bg-[#F5F5F5] sticky top-0 z-20">
                {[
                  { label: "Client",      align: "left",   sticky: true },
                  { label: "Google ID",   align: "left",   sticky: false },
                  { label: "Campaign",    align: "left",   sticky: false },
                  { label: "Channel",     align: "center", sticky: false },
                  { label: "Billable",    align: "center", sticky: false },
                  { label: "Impressions", align: "right",  sticky: false },
                  { label: "Clicks",      align: "right",  sticky: false },
                  { label: "Conv",        align: "right",  sticky: false },
                  { label: "Conv Value",  align: "right",  sticky: false, important: true },
                  { label: "Cost",        align: "right",  sticky: false },
                  { label: "Excl. Reason",align: "left",   sticky: false },
                ].map((h, i) => (
                  <th
                    key={i}
                    style={h.sticky ? { position: "sticky", left: 0, zIndex: 30 } : { position: "sticky", zIndex: 20 }}
                    className={cn(
                      "px-2 py-2 text-[11px] font-medium text-[#6b7280] border border-[#dddddd] whitespace-nowrap bg-[#F5F5F5]",
                      h.align === "right" && "text-right",
                      h.align === "center" && "text-center",
                      h.important && "font-semibold text-[#3a3a3a]",
                      i === 0 && "border-r-2"
                    )}
                  >
                    {h.label}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {filtered.map((row) => (
                <tr
                  key={row.id}
                  className={cn(
                    "border-b border-[#eeeeee] hover:bg-[#fafafa]",
                    !row.billable && !row.manually_excluded && "opacity-60",
                    row.manually_excluded && "opacity-70 bg-amber-50/30"
                  )}
                >
                  {/* Client */}
                  <td
                    className="px-2 py-1.5 border-x border-[#eeeeee] text-xs font-medium border-r-2 border-r-[#dddddd] truncate"
                    style={{ position: "sticky", left: 0, zIndex: 10, backgroundColor: "white" }}
                    title={row.client_name}
                  >
                    {row.client_name}
                  </td>

                  {/* Google ID */}
                  <td className="px-2 py-1.5 border-x border-[#eeeeee] text-xs font-mono text-[#6b7280]">
                    {row.google_ads_customer_id}
                  </td>

                  {/* Campaign */}
                  <td className="px-2 py-1.5 border-x border-[#eeeeee] text-xs truncate" title={row.campaign_name}>
                    {row.campaign_name}
                  </td>

                  {/* Channel */}
                  <td className="px-2 py-1.5 border-x border-[#eeeeee] text-center">
                    <ChannelBadge label={row.channel_label} />
                  </td>

                  {/* Billable — clickable for system-billable campaigns to toggle manual exclusion */}
                  <td className="px-2 py-1.5 border-x border-[#eeeeee] text-center">
                    {row.system_billable ? (
                      <button
                        onClick={() => handleToggle(row)}
                        disabled={togglingIds.has(row.id) || pending}
                        title={row.manually_excluded ? "Click to re-enable billing" : "Click to exclude from billing"}
                        className="inline-flex items-center justify-center w-5 h-5 rounded hover:bg-[#F5F5F5] disabled:opacity-50 transition-colors"
                      >
                        {togglingIds.has(row.id) ? (
                          <span className="inline-block w-2 h-2 rounded-full bg-[#cccccc] animate-pulse" />
                        ) : row.manually_excluded ? (
                          <span className="inline-block w-2 h-2 rounded-full bg-amber-400" title="Manually excluded" />
                        ) : (
                          <span className="inline-block w-2 h-2 rounded-full bg-green-500" title="Billable" />
                        )}
                      </button>
                    ) : (
                      <span className="inline-block w-2 h-2 rounded-full bg-[#dddddd]" title="Excluded (system rule)" />
                    )}
                  </td>

                  {/* Impressions */}
                  <td className="px-2 py-1.5 border-x border-[#eeeeee] text-xs text-right font-mono text-[#6b7280]">
                    {row.impressions.toLocaleString()}
                  </td>

                  {/* Clicks */}
                  <td className="px-2 py-1.5 border-x border-[#eeeeee] text-xs text-right font-mono text-[#6b7280]">
                    {row.clicks.toLocaleString()}
                  </td>

                  {/* Conversions */}
                  <td className="px-2 py-1.5 border-x border-[#eeeeee] text-xs text-right font-mono text-[#6b7280]">
                    {Number(row.conversions).toFixed(1)}
                  </td>

                  {/* Conv Value */}
                  <td className={cn(
                    "px-2 py-1.5 border-x border-[#eeeeee] text-xs text-right font-mono font-semibold",
                    row.billable ? "text-[#3a3a3a]" : "text-[#9ca3af]"
                  )}>
                    {formatMoney(String(row.conversion_value))}
                  </td>

                  {/* Cost */}
                  <td className="px-2 py-1.5 border-x border-[#eeeeee] text-xs text-right font-mono text-[#6b7280]">
                    {formatMoney(String(row.cost_usd))}
                  </td>

                  {/* Exclusion reason */}
                  <td className="px-2 py-1.5 border-x border-[#eeeeee] text-xs text-[#9ca3af] truncate" title={row.exclusion_reason ?? ""}>
                    {row.exclusion_reason ?? ""}
                  </td>
                </tr>
              ))}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-4 py-10 text-center text-sm text-[#9ca3af]">
                    No campaigns match the current filters.
                  </td>
                </tr>
              )}
            </tbody>

            {/* Totals footer */}
            {filtered.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-[#dddddd] bg-[#F5F5F5] text-xs font-semibold">
                  <td
                    className="px-2 py-2 text-[#6b7280] uppercase tracking-wide border-r-2 border-[#dddddd] sticky left-0 bg-[#F5F5F5]"
                    style={{ position: "sticky", left: 0 }}
                  >
                    {filtered.length} rows
                  </td>
                  <td className="px-2 py-2 border-x border-[#dddddd]" />
                  <td className="px-2 py-2 border-x border-[#dddddd]" />
                  <td className="px-2 py-2 border-x border-[#dddddd]" />
                  <td className="px-2 py-2 border-x border-[#dddddd]" />
                  <td className="px-2 py-2 border-x border-[#dddddd] text-right font-mono">
                    {filtered.reduce((s, r) => s + r.impressions, 0).toLocaleString()}
                  </td>
                  <td className="px-2 py-2 border-x border-[#dddddd] text-right font-mono">
                    {filtered.reduce((s, r) => s + r.clicks, 0).toLocaleString()}
                  </td>
                  <td className="px-2 py-2 border-x border-[#dddddd] text-right font-mono">
                    {filtered.reduce((s, r) => s + Number(r.conversions), 0).toFixed(1)}
                  </td>
                  <td className="px-2 py-2 border-x border-[#dddddd] text-right font-mono text-[#3a3a3a]">
                    {formatMoney(String(filtered.reduce((s, r) => s + Number(r.conversion_value), 0)))}
                  </td>
                  <td className="px-2 py-2 border-x border-[#dddddd] text-right font-mono">
                    {formatMoney(String(filtered.reduce((s, r) => s + Number(r.cost_usd), 0)))}
                  </td>
                  <td className="px-2 py-2 border-x border-[#dddddd]" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}
