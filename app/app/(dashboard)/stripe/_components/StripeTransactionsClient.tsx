"use client";

import { useState, useMemo } from "react";
import { formatMoney, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Search } from "lucide-react";

export type EnrichedCharge = {
  charge_id: string;
  period_label: string;
  stripe_id: string | null;
  customer_email: string;
  amount: string;
  amount_refunded: string;
  status: "Paid" | "Failed" | "Refunded";
  created_at: string;
  display_name: string;
  batch: string;
};

function StatusBadge({ status }: { status: EnrichedCharge["status"] }) {
  const styles: Record<EnrichedCharge["status"], string> = {
    Paid: "bg-green-100 text-green-700",
    Failed: "bg-red-100 text-red-700",
    Refunded: "bg-orange-100 text-orange-700",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center px-1.5 py-0.5 rounded-[2px] text-[11px] font-medium",
        styles[status]
      )}
    >
      {status}
    </span>
  );
}

export default function StripeTransactionsClient({
  charges,
  periods,
}: {
  charges: EnrichedCharge[];
  periods: string[];
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [batchFilter, setBatchFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState("all");

  const batches = useMemo(
    () => [...new Set(charges.map((c) => c.batch).filter((b) => b !== "—"))].sort(),
    [charges]
  );

  const filtered = useMemo(
    () =>
      charges.filter((c) => {
        if (periodFilter !== "all" && c.period_label !== periodFilter) return false;
        if (statusFilter !== "all" && c.status !== statusFilter) return false;
        if (batchFilter !== "all" && c.batch !== batchFilter) return false;
        if (search) {
          const q = search.toLowerCase();
          if (
            !c.customer_email.toLowerCase().includes(q) &&
            !(c.stripe_id ?? "").toLowerCase().includes(q) &&
            !c.charge_id.toLowerCase().includes(q) &&
            !c.display_name.toLowerCase().includes(q)
          )
            return false;
        }
        return true;
      }),
    [charges, periodFilter, statusFilter, batchFilter, search]
  );

  const paidTotal = filtered
    .filter((c) => c.status === "Paid")
    .reduce((s, c) => s + parseFloat(c.amount), 0);
  const failedCount = filtered.filter((c) => c.status === "Failed").length;
  const refundedTotal = filtered
    .filter((c) => c.status === "Refunded")
    .reduce((s, c) => s + parseFloat(c.amount_refunded), 0);

  const periodLabel = periodFilter === "all" ? "All periods" : periodFilter;

  return (
    <div className="px-6 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-baseline justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#3a3a3a]">Stripe Transactions</h1>
          <p className="text-sm text-[#6b7280] mt-0.5">
            {periodLabel} · {filtered.length} of {charges.length} charges
          </p>
        </div>
        {/* KPI chips */}
        <div className="flex items-center gap-3 text-sm flex-wrap">
          <span className="bg-green-50 text-green-700 px-3 py-1 rounded-[2px] border border-green-200">
            Paid {formatMoney(paidTotal)}
          </span>
          <span className="bg-red-50 text-red-700 px-3 py-1 rounded-[2px] border border-red-200">
            {failedCount} Failed
          </span>
          {refundedTotal > 0 && (
            <span className="bg-orange-50 text-orange-700 px-3 py-1 rounded-[2px] border border-orange-200">
              Refunded {formatMoney(refundedTotal)}
            </span>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2.5 flex-wrap">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9ca3af]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search email, Customer ID, Charge ID…"
            className="pl-8 pr-3 py-1.5 text-sm border border-[#dddddd] rounded-[2px] w-72 focus:outline-none focus:border-[#0170B9]"
          />
        </div>
        <select
          value={periodFilter}
          onChange={(e) => setPeriodFilter(e.target.value)}
          className="px-3 py-1.5 text-sm border border-[#dddddd] rounded-[2px] focus:outline-none focus:border-[#0170B9] bg-white"
        >
          <option value="all">All periods</option>
          {periods.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-1.5 text-sm border border-[#dddddd] rounded-[2px] focus:outline-none focus:border-[#0170B9] bg-white"
        >
          <option value="all">All statuses</option>
          <option value="Paid">Paid</option>
          <option value="Failed">Failed</option>
          <option value="Refunded">Refunded</option>
        </select>
        <select
          value={batchFilter}
          onChange={(e) => setBatchFilter(e.target.value)}
          className="px-3 py-1.5 text-sm border border-[#dddddd] rounded-[2px] focus:outline-none focus:border-[#0170B9] bg-white"
        >
          <option value="all">All batches</option>
          {batches.map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="border border-[#dddddd] rounded-[2px] overflow-x-auto">
        <table className="w-max min-w-full text-xs border-collapse">
          <thead>
            <tr className="bg-[#F5F5F5] border-b border-[#dddddd]">
              <th className="px-3 py-2 text-left font-medium text-[#6b7280] whitespace-nowrap">Date</th>
              <th className="px-3 py-2 text-left font-medium text-[#6b7280] whitespace-nowrap">Period</th>
              <th className="px-3 py-2 text-left font-medium text-[#6b7280] whitespace-nowrap">Charge ID</th>
              <th className="px-3 py-2 text-left font-medium text-[#6b7280] whitespace-nowrap">Customer ID</th>
              <th className="px-3 py-2 text-left font-medium text-[#6b7280]">Account</th>
              <th className="px-3 py-2 text-center font-medium text-[#6b7280]">Batch</th>
              <th className="px-3 py-2 text-left font-medium text-[#6b7280]">Email</th>
              <th className="px-3 py-2 text-right font-medium text-[#6b7280] whitespace-nowrap">Amount</th>
              <th className="px-3 py-2 text-right font-medium text-[#6b7280] whitespace-nowrap">Refunded</th>
              <th className="px-3 py-2 text-center font-medium text-[#6b7280]">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr
                key={c.charge_id}
                className={cn(
                  "border-b border-[#eeeeee] hover:bg-[#fafafa]",
                  c.status === "Failed" && "bg-red-50/40",
                  c.status === "Refunded" && "bg-orange-50/40"
                )}
              >
                <td className="px-3 py-2 text-[#4B4F58] whitespace-nowrap">
                  {formatDate(c.created_at)}
                </td>
                <td className="px-3 py-2 text-[#6b7280] whitespace-nowrap">
                  {c.period_label}
                </td>
                <td className="px-3 py-2 font-mono text-[10px] text-[#6b7280] whitespace-nowrap">
                  {c.charge_id.slice(0, 22)}…
                </td>
                <td className="px-3 py-2 font-mono text-[10px] text-[#6b7280] whitespace-nowrap">
                  {c.stripe_id || <span className="text-red-500 font-sans">no ID</span>}
                </td>
                <td className="px-3 py-2 text-[#3a3a3a] max-w-[180px]">
                  <span className="truncate block" title={c.display_name}>
                    {c.display_name}
                  </span>
                </td>
                <td className="px-3 py-2 text-center text-[#6b7280]">{c.batch}</td>
                <td className="px-3 py-2 text-[#6b7280] max-w-[180px]">
                  <span className="truncate block" title={c.customer_email}>
                    {c.customer_email}
                  </span>
                </td>
                <td className="px-3 py-2 text-right font-medium text-[#3a3a3a] whitespace-nowrap">
                  {formatMoney(c.amount)}
                </td>
                <td className="px-3 py-2 text-right text-[#6b7280] whitespace-nowrap">
                  {parseFloat(c.amount_refunded) > 0 ? formatMoney(c.amount_refunded) : "—"}
                </td>
                <td className="px-3 py-2 text-center">
                  <StatusBadge status={c.status} />
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-sm text-[#9ca3af]">
                  No transactions match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
