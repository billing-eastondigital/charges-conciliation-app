"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import type { BillingRow } from "@/lib/types";
import { billingRows2026 } from "@/lib/mock/billing-rows";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Search, RotateCcw, AlertCircle } from "lucide-react";

// ── Column & group definitions ──────────────────────────────

interface ColDef {
  key: keyof BillingRow;
  label: string;
  width: number;
  type: "text" | "money" | "pct" | "number" | "date" | "url";
  align?: "left" | "right" | "center";
}

interface GroupDef {
  label: string;
  count: number;
  color: string;
}

const GROUPS: GroupDef[] = [
  { label: "Identity",       count: 5,  color: "bg-[#F5F5F5]" },
  { label: "Billing Config", count: 9,  color: "bg-slate-50" },
  { label: "Google Revenue", count: 11, color: "bg-blue-50" },
  { label: "Bing & Other",   count: 3,  color: "bg-orange-50" },
  { label: "Total",          count: 1,  color: "bg-green-50" },
  { label: "Items",          count: 10, color: "bg-purple-50" },
  { label: "Notes",          count: 2,  color: "bg-gray-50" },
];

const COLUMNS: ColDef[] = [
  // Identity (5)
  { key: "account_name",              label: "Account Name",    width: 185, type: "text" },
  { key: "batch",                     label: "Batch",           width: 70,  type: "text",   align: "center" },
  { key: "stripe_id",                 label: "Stripe Id",       width: 160, type: "text" },
  { key: "google_id",                 label: "Google Id",       width: 115, type: "text" },
  { key: "account_status",            label: "Status",          width: 80,  type: "text",   align: "center" },
  // Billing Config (9)
  { key: "billing_year",              label: "Year",            width: 60,  type: "number", align: "center" },
  { key: "billing_day",               label: "Day",             width: 50,  type: "number", align: "center" },
  { key: "billing_month",             label: "Month",           width: 80,  type: "text" },
  { key: "dates_from",                label: "From",            width: 95,  type: "date" },
  { key: "date_to",                   label: "To",              width: 95,  type: "date" },
  { key: "plan",                      label: "Plan",            width: 155, type: "text" },
  { key: "monthly_billing_plan",      label: "Monthly Plan",    width: 160, type: "text" },
  { key: "billing_formula",           label: "Formula",         width: 115, type: "text" },
  { key: "notes",                     label: "Notes",           width: 150, type: "text" },
  // Google Revenue (11)
  { key: "google_revenue_pct",        label: "Rev %",           width: 65,  type: "pct",    align: "right" },
  { key: "coaching_flat_fee",         label: "Coaching Fee",    width: 105, type: "money",  align: "right" },
  { key: "base_fee_amazon",           label: "Base Amazon",     width: 105, type: "money",  align: "right" },
  { key: "base_fee_google",           label: "Base Google",     width: 105, type: "money",  align: "right" },
  { key: "google_growth_plan",        label: "Growth Plan",     width: 105, type: "money",  align: "right" },
  { key: "projected_conversion_value",label: "Proj. Conv.",     width: 105, type: "money",  align: "right" },
  { key: "google_shopping_revenue",   label: "Shopping Rev",    width: 115, type: "money",  align: "right" },
  { key: "google_shopping_total",     label: "Shopping Total",  width: 115, type: "money",  align: "right" },
  { key: "google_shopping_charge",    label: "Shopping Chg",    width: 115, type: "money",  align: "right" },
  { key: "google_search_display",     label: "Search/Display",  width: 115, type: "money",  align: "right" },
  { key: "google_search_charge",      label: "Search Chg",      width: 105, type: "money",  align: "right" },
  // Bing & Other (3)
  { key: "bing_revenue",              label: "Bing Rev",        width: 95,  type: "money",  align: "right" },
  { key: "bing_charge",               label: "Bing Chg",        width: 95,  type: "money",  align: "right" },
  { key: "others_dfw",                label: "Others DFW",      width: 100, type: "money",  align: "right" },
  // Total (1)
  { key: "total_to_bill",             label: "Total to Bill",   width: 105, type: "money",  align: "right" },
  // Items (10)
  { key: "item_1",                    label: "Item 1",          width: 140, type: "text" },
  { key: "item_1_amount",             label: "Amt 1",           width: 90,  type: "money",  align: "right" },
  { key: "item_2",                    label: "Item 2",          width: 140, type: "text" },
  { key: "item_2_amount",             label: "Amt 2",           width: 90,  type: "money",  align: "right" },
  { key: "item_3",                    label: "Item 3",          width: 140, type: "text" },
  { key: "item_3_amount",             label: "Amt 3",           width: 90,  type: "money",  align: "right" },
  { key: "item_4",                    label: "Item 4",          width: 140, type: "text" },
  { key: "item_4_amount",             label: "Amt 4",           width: 90,  type: "money",  align: "right" },
  { key: "item_5",                    label: "Item 5",          width: 140, type: "text" },
  { key: "item_5_amount",             label: "Amt 5",           width: 90,  type: "money",  align: "right" },
  // Notes (2)
  { key: "memo",                      label: "Memo",            width: 160, type: "text" },
  { key: "invoice_link",              label: "Invoice Link",    width: 150, type: "url" },
];

// Group header rows are ~25px tall
const COL_HEADER_TOP = 25;

export default function BillingPage() {
  const [rows, setRows] = useState<BillingRow[]>(billingRows2026);
  const [editingCell, setEditingCell] = useState<{ rowId: number; field: keyof BillingRow } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [changedIds, setChangedIds] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");
  const [batchFilter, setBatchFilter] = useState("all");

  const batches = [...new Set(billingRows2026.map((r) => r.batch))].sort();

  const filtered = rows.filter((r) => {
    if (
      search &&
      !r.account_name.toLowerCase().includes(search.toLowerCase()) &&
      !(r.stripe_id ?? "").toLowerCase().includes(search.toLowerCase())
    )
      return false;
    if (batchFilter !== "all" && r.batch !== batchFilter) return false;
    return true;
  });

  function startEdit(rowId: number, field: keyof BillingRow) {
    const row = rows.find((r) => r.id === rowId)!;
    const val = row[field];
    setEditingCell({ rowId, field });
    setEditValue(val === null || val === undefined ? "" : String(val));
  }

  function commitEdit() {
    if (!editingCell) return;
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== editingCell.rowId) return r;
        const newVal = editValue.trim() === "" ? null : editValue.trim();
        return { ...r, [editingCell.field]: newVal };
      })
    );
    setChangedIds((prev) => new Set([...prev, editingCell.rowId]));
    setEditingCell(null);
  }

  function cancelEdit() {
    setEditingCell(null);
  }

  function resetAll() {
    setRows(billingRows2026);
    setChangedIds(new Set());
    setEditingCell(null);
  }

  function renderCell(row: BillingRow, col: ColDef): ReactNode {
    const isEditing = editingCell?.rowId === row.id && editingCell?.field === col.key;
    const rawVal = row[col.key];

    if (isEditing) {
      return (
        <input
          autoFocus
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitEdit();
            if (e.key === "Escape") cancelEdit();
          }}
          className="w-full bg-white border border-[#0170B9] rounded-[2px] px-1.5 py-0.5 text-xs outline-none"
        />
      );
    }

    if (col.type === "url" && rawVal) {
      return (
        <a
          href={String(rawVal)}
          className="text-[#0170B9] underline text-xs truncate block"
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          title={String(rawVal)}
        >
          {String(rawVal).replace(/^https?:\/\//, "").slice(0, 22) + "…"}
        </a>
      );
    }

    let display: string;
    if (rawVal === null || rawVal === undefined || rawVal === "") {
      display = "—";
    } else if (col.type === "money") {
      display = formatMoney(String(rawVal));
    } else if (col.type === "pct") {
      display = `${rawVal}%`;
    } else {
      display = String(rawVal);
    }

    const isEmpty = display === "—";

    return (
      <span
        onClick={() => startEdit(row.id, col.key)}
        title={!isEmpty ? display : undefined}
        className={cn(
          "cursor-pointer rounded-[2px] px-0.5 truncate block",
          isEmpty ? "text-[#c8c8c8]" : "hover:bg-blue-50"
        )}
      >
        {display}
      </span>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="px-6 py-5 border-b border-[#dddddd] flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-[#3a3a3a]">Billing</h1>
          <p className="text-sm text-[#6b7280] mt-0.5">
            April 2026 · {filtered.length} of {billingRows2026.length} rows
            {changedIds.size > 0 && (
              <span className="text-amber-600 ml-1">
                · {changedIds.size} unsaved change{changedIds.size !== 1 ? "s" : ""}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9ca3af]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search account or Stripe ID…"
              className="pl-8 pr-3 py-1.5 text-sm border border-[#dddddd] rounded-[2px] w-64 focus:outline-none focus:border-[#0170B9]"
            />
          </div>
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
          {changedIds.size > 0 && (
            <button
              onClick={resetAll}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-[#dddddd] rounded-[2px] hover:bg-[#F5F5F5] text-[#4B4F58]"
            >
              <RotateCcw size={13} />
              Reset changes
            </button>
          )}
        </div>
      </div>

      {/* In-memory notice */}
      <div className="px-6 py-2 bg-amber-50 border-b border-amber-200 flex items-center gap-2 text-xs text-amber-700">
        <AlertCircle size={12} />
        Click any cell to edit. Changes are in-memory only — they reset on page reload. Persistence is available in Phase 2 (Supabase).
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table
          style={{
            tableLayout: "fixed",
            borderCollapse: "collapse",
            width: "max-content",
          }}
        >
          <colgroup>
            {COLUMNS.map((col) => (
              <col key={col.key} style={{ width: col.width, minWidth: col.width }} />
            ))}
          </colgroup>

          <thead>
            {/* Group headers */}
            <tr>
              {GROUPS.map((g, gi) => (
                <th
                  key={g.label}
                  colSpan={g.count}
                  className={cn(
                    "px-2 py-1 text-[11px] font-semibold text-[#4B4F58] border border-[#dddddd] text-center sticky top-0 z-20",
                    g.color,
                    gi === 0 && "left-0 z-30"
                  )}
                  style={gi === 0 ? { position: "sticky", top: 0, left: 0, zIndex: 30 } : { position: "sticky", top: 0, zIndex: 20 }}
                >
                  {g.label}
                </th>
              ))}
            </tr>
            {/* Column headers */}
            <tr>
              {COLUMNS.map((col, i) => (
                <th
                  key={col.key}
                  style={{ top: COL_HEADER_TOP, ...(i === 0 ? { left: 0, position: "sticky", zIndex: 30 } : { position: "sticky", zIndex: 20 }) }}
                  className={cn(
                    "px-2 py-1.5 text-[11px] font-medium text-[#6b7280] border border-[#dddddd] whitespace-nowrap bg-white",
                    col.align === "right" && "text-right",
                    col.align === "center" && "text-center",
                    i === 0 && "font-semibold text-[#3a3a3a] border-r-2 border-r-[#dddddd]"
                  )}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {filtered.map((row) => {
              const changed = changedIds.has(row.id);
              return (
                <tr
                  key={row.id}
                  className={cn("group", changed ? "bg-amber-50" : "bg-white hover:bg-[#fafafa]")}
                >
                  {COLUMNS.map((col, i) => (
                    <td
                      key={col.key}
                      className={cn(
                        "px-2 py-1 border border-[#eeeeee] overflow-hidden text-xs",
                        col.align === "right" && "text-right",
                        col.align === "center" && "text-center",
                        i === 0 && "font-medium border-r-2 border-r-[#dddddd]",
                      )}
                      style={
                        i === 0
                          ? {
                              position: "sticky",
                              left: 0,
                              zIndex: 10,
                              backgroundColor: changed ? "#fffbeb" : "white",
                            }
                          : undefined
                      }
                    >
                      {renderCell(row, col)}
                    </td>
                  ))}
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={COLUMNS.length}
                  className="px-4 py-10 text-center text-sm text-[#9ca3af]"
                >
                  No rows match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
