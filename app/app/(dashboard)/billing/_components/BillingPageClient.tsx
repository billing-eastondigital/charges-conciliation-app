"use client";

import { useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Search, Info, CheckCircle2, AlertCircle } from "lucide-react";
import { updateExpectedCharge } from "../actions";

// ── Types ──────────────────────────────────────────────────────────────────

export interface ExpectedChargeRow {
  id: number;
  account_name: string;
  stripe_id: string | null;
  primary_email: string | null;
  batch: string | null;
  billing_plan: string | null;
  billing_pct: number | null;
  google_shopping_charge: number | null;
  google_search_charge: number | null;
  bing_charge: number | null;
  base_fee: number | null;
  other_charge: number | null;
  expected_amount: number;
  source_row_index: number | null;
}

type EditableField = Exclude<keyof ExpectedChargeRow, "id" | "source_row_index">;

// ── Column definitions ────────────────────────────────────────────────────

interface ColDef {
  key: EditableField;
  label: string;
  width: number;
  type: "text" | "money" | "pct";
  align?: "left" | "right" | "center";
  important?: boolean;
}

const COLUMNS: ColDef[] = [
  { key: "account_name",           label: "Account Name",    width: 190, type: "text" },
  { key: "batch",                  label: "Batch",           width: 70,  type: "text",  align: "center" },
  { key: "stripe_id",              label: "Stripe ID",       width: 185, type: "text",  important: true },
  { key: "primary_email",          label: "Email",           width: 185, type: "text" },
  { key: "billing_plan",           label: "Billing Plan",    width: 160, type: "text" },
  { key: "billing_pct",            label: "Rev %",           width: 65,  type: "pct",   align: "right" },
  { key: "google_shopping_charge", label: "Shopping",        width: 100, type: "money", align: "right" },
  { key: "google_search_charge",   label: "Search",          width: 100, type: "money", align: "right" },
  { key: "bing_charge",            label: "Bing",            width: 90,  type: "money", align: "right" },
  { key: "base_fee",               label: "Base Fee",        width: 90,  type: "money", align: "right" },
  { key: "other_charge",           label: "Other",           width: 90,  type: "money", align: "right" },
  { key: "expected_amount",        label: "Total to Bill",   width: 110, type: "money", align: "right", important: true },
];

// ── Props ─────────────────────────────────────────────────────────────────

interface Props {
  rows: ExpectedChargeRow[];
  periods: { period_label: string; is_closed: boolean }[];
  selectedPeriod: string;
  isClosed: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────

export function BillingPageClient({ rows: initialRows, periods, selectedPeriod, isClosed }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [rows, setRows] = useState(initialRows);
  const [editingCell, setEditingCell] = useState<{ id: number; field: EditableField } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [savingIds, setSavingIds] = useState<Set<number>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
  const [errorIds, setErrorIds] = useState<Map<number, string>>(new Map());
  const [search, setSearch] = useState("");
  const [batchFilter, setBatchFilter] = useState("all");

  const batches = [...new Set(initialRows.map((r) => r.batch).filter(Boolean))].sort() as string[];

  const filtered = rows.filter((r) => {
    if (batchFilter !== "all" && r.batch !== batchFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        r.account_name.toLowerCase().includes(q) ||
        (r.stripe_id ?? "").toLowerCase().includes(q) ||
        (r.primary_email ?? "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  function startEdit(id: number, field: EditableField) {
    if (isClosed) return;
    const row = rows.find((r) => r.id === id)!;
    const val = row[field];
    setEditingCell({ id, field });
    setEditValue(val === null || val === undefined ? "" : String(val));
  }

  const commitEdit = useCallback(() => {
    if (!editingCell) return;
    const { id, field } = editingCell;
    const raw = editValue;

    // Optimistic update
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        let parsed: string | number | null = raw.trim() || null;
        if (parsed !== null) {
          const n = parseFloat(raw.replace(/[,$\s]/g, ""));
          const numericFields = ["billing_pct","google_shopping_charge","google_search_charge","bing_charge","base_fee","other_charge","expected_amount"];
          if (numericFields.includes(field) && !isNaN(n)) parsed = n;
        }
        return { ...r, [field]: parsed };
      })
    );

    setEditingCell(null);
    setSavingIds((s) => new Set([...s, id]));
    setErrorIds((m) => { const n = new Map(m); n.delete(id); return n; });

    startTransition(async () => {
      try {
        await updateExpectedCharge(id, field as Parameters<typeof updateExpectedCharge>[1], raw);
        setSavingIds((s) => { const n = new Set(s); n.delete(id); return n; });
        setSavedIds((s) => new Set([...s, id]));
        setTimeout(() => setSavedIds((s) => { const n = new Set(s); n.delete(id); return n; }), 2000);
      } catch (err) {
        setSavingIds((s) => { const n = new Set(s); n.delete(id); return n; });
        setErrorIds((m) => new Map([...m, [id, err instanceof Error ? err.message : "Save failed"]]));
        // Revert
        setRows(initialRows);
      }
    });
  }, [editingCell, editValue, initialRows]);

  function cancelEdit() {
    setEditingCell(null);
  }

  function renderCell(row: ExpectedChargeRow, col: ColDef) {
    const isEditing = editingCell?.id === row.id && editingCell?.field === col.key;
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
          "truncate block rounded-[2px] px-0.5",
          isClosed
            ? "cursor-default text-[#9ca3af]"
            : isEmpty
            ? "cursor-pointer text-[#c8c8c8] hover:bg-blue-50"
            : "cursor-pointer hover:bg-blue-50",
          col.important && !isEmpty && "font-semibold"
        )}
      >
        {display}
      </span>
    );
  }

  const grandTotal = filtered.reduce((s, r) => s + Number(r.expected_amount ?? 0), 0);

  return (
    <div>
      {/* Header */}
      <div className="px-6 py-5 border-b border-[#dddddd] flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-[#3a3a3a]">Billing</h1>
          <p className="text-sm text-[#6b7280] mt-0.5">
            {filtered.length} of {rows.length} rows · {formatMoney(grandTotal)} total
            {isPending && <span className="text-[#0170B9] ml-2">Saving…</span>}
          </p>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Period selector */}
          <select
            value={selectedPeriod}
            onChange={(e) => router.push(`/billing?period=${encodeURIComponent(e.target.value)}`)}
            className="px-3 py-1.5 text-sm border border-[#dddddd] rounded-[2px] bg-white text-[#3a3a3a] focus:outline-none focus:border-[#0170B9]"
          >
            {periods.map((p) => (
              <option key={p.period_label} value={p.period_label}>
                {p.period_label}{p.is_closed ? " (closed)" : ""}
              </option>
            ))}
          </select>

          {/* Search */}
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9ca3af]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search account or Stripe ID…"
              className="pl-8 pr-3 py-1.5 text-sm border border-[#dddddd] rounded-[2px] w-56 focus:outline-none focus:border-[#0170B9]"
            />
          </div>

          {/* Batch filter */}
          <select
            value={batchFilter}
            onChange={(e) => setBatchFilter(e.target.value)}
            className="px-3 py-1.5 text-sm border border-[#dddddd] rounded-[2px] bg-white focus:outline-none focus:border-[#0170B9]"
          >
            <option value="all">All batches</option>
            {batches.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Info banner */}
      <div className={cn(
        "px-6 py-2 border-b flex items-center gap-2 text-xs",
        isClosed
          ? "bg-[#F5F5F5] border-[#dddddd] text-[#9ca3af]"
          : "bg-blue-50 border-blue-100 text-[#0170B9]"
      )}>
        <Info size={12} className="shrink-0" />
        {isClosed
          ? "This period is closed — rows are read-only."
          : "Click any cell to edit. Changes save immediately to Supabase. Re-run the reconciliation engine to update period results."}
      </div>

      {rows.length === 0 ? (
        <div className="py-20 text-center text-sm text-[#9ca3af]">
          No billing rows for {selectedPeriod}. Upload a billing sheet via{" "}
          <a href="/admin/import" className="text-[#0170B9] underline">Admin → Import</a>.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table style={{ tableLayout: "fixed", borderCollapse: "collapse", width: "max-content" }}>
            <colgroup>
              {COLUMNS.map((col) => (
                <col key={col.key} style={{ width: col.width, minWidth: col.width }} />
              ))}
            </colgroup>

            <thead>
              <tr className="border-b border-[#dddddd] bg-[#F5F5F5] sticky top-0 z-20">
                {COLUMNS.map((col, i) => (
                  <th
                    key={col.key}
                    style={i === 0 ? { position: "sticky", left: 0, zIndex: 30 } : { position: "sticky", zIndex: 20 }}
                    className={cn(
                      "px-2 py-2 text-[11px] font-medium text-[#6b7280] border border-[#dddddd] whitespace-nowrap bg-[#F5F5F5]",
                      col.align === "right" && "text-right",
                      col.align === "center" && "text-center",
                      col.important && "font-semibold text-[#3a3a3a]",
                      i === 0 && "border-r-2"
                    )}
                  >
                    {col.label}
                  </th>
                ))}
                {/* Status column */}
                <th className="px-2 py-2 text-[11px] font-medium text-[#6b7280] border border-[#dddddd] w-8 sticky top-0 z-20 bg-[#F5F5F5]" />
              </tr>
            </thead>

            <tbody>
              {filtered.map((row) => {
                const saving = savingIds.has(row.id);
                const saved  = savedIds.has(row.id);
                const err    = errorIds.get(row.id);
                return (
                  <tr
                    key={row.id}
                    className={cn(
                      "group border-b border-[#eeeeee]",
                      err ? "bg-red-50" : saved ? "bg-green-50" : saving ? "bg-blue-50/40" : "bg-white hover:bg-[#fafafa]"
                    )}
                  >
                    {COLUMNS.map((col, i) => (
                      <td
                        key={col.key}
                        className={cn(
                          "px-2 py-1 border-x border-[#eeeeee] overflow-hidden text-xs",
                          col.align === "right" && "text-right",
                          col.align === "center" && "text-center",
                          i === 0 && "border-r-2 border-r-[#dddddd] font-medium",
                          col.important && "font-mono"
                        )}
                        style={i === 0 ? {
                          position: "sticky", left: 0, zIndex: 10,
                          backgroundColor: err ? "#fef2f2" : saved ? "#f0fdf4" : saving ? "#eff6ff" : "white",
                        } : undefined}
                      >
                        {renderCell(row, col)}
                      </td>
                    ))}
                    {/* Save status indicator */}
                    <td className="px-1 py-1 border-x border-[#eeeeee] text-center w-8">
                      {saving && <div className="w-3 h-3 border-2 border-[#0170B9] border-t-transparent rounded-full animate-spin mx-auto" />}
                      {saved  && <CheckCircle2 size={12} className="text-green-600 mx-auto" />}
                      {err    && <AlertCircle  size={12} className="text-red-500 mx-auto" title={err} />}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={COLUMNS.length + 1} className="px-4 py-10 text-center text-sm text-[#9ca3af]">
                    No rows match the current filters.
                  </td>
                </tr>
              )}
            </tbody>

            {/* Grand total footer */}
            {filtered.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-[#dddddd] bg-[#F5F5F5] font-semibold text-xs">
                  <td
                    className="px-2 py-2 text-[#6b7280] uppercase tracking-wide border-r-2 border-[#dddddd] sticky left-0 bg-[#F5F5F5]"
                    style={{ position: "sticky", left: 0 }}
                  >
                    Total ({filtered.length})
                  </td>
                  {COLUMNS.slice(1).map((col) => (
                    <td key={col.key} className={cn("px-2 py-2 border-x border-[#dddddd] font-mono", col.align === "right" && "text-right")}>
                      {col.key === "expected_amount"
                        ? formatMoney(grandTotal)
                        : ""}
                    </td>
                  ))}
                  <td className="border-x border-[#dddddd]" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}
