"use client";

import { useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Search, Info, CheckCircle2, AlertCircle, ExternalLink } from "lucide-react";
import { updateExpectedCharge } from "../actions";

// ── Types ──────────────────────────────────────────────────────────────────

type SourceType = "IMPORT" | "SUBSCRIPTION" | "ADS_REVENUE" | "ADS_COST";

interface BillingDetail {
  base_fee?: number;
  billing_pct?: number;
  billing_method?: string;
  google_customer_id?: string;
  shopping_revenue?: number;
  shopping_cost?: number;
  search_revenue?: number;
  search_cost?: number;
  ads_base?: number;
  gross_revenue?: number;
  gross_cost?: number;
  campaign_count?: number;
}

export interface ExpectedChargeRow {
  id: number;
  account_name: string;
  stripe_id: string | null;
  primary_email: string | null;
  batch: string | null;
  expected_amount: number;
  source: SourceType;
  billing_detail: BillingDetail | null;
  // Legacy IMPORT columns
  google_shopping_charge: number | null;
  google_search_charge: number | null;
  bing_charge: number | null;
  base_fee: number | null;
  other_charge: number | null;
  billing_pct: number | null;
  source_row_index: number | null;
}

type ImportEditableField =
  | "account_name" | "stripe_id" | "primary_email" | "batch"
  | "google_shopping_charge" | "google_search_charge"
  | "bing_charge" | "base_fee" | "other_charge"
  | "billing_pct" | "expected_amount";

// ── Source badge ───────────────────────────────────────────────────────────

const SOURCE_CONFIG: Record<SourceType, { label: string; classes: string }> = {
  IMPORT:       { label: "Import",    classes: "bg-[#F5F5F5] text-[#6b7280] border border-[#dddddd]" },
  SUBSCRIPTION: { label: "Sub",       classes: "bg-purple-50 text-purple-700 border border-purple-200" },
  ADS_REVENUE:  { label: "Ads Rev",   classes: "bg-blue-50 text-[#0170B9] border border-blue-200" },
  ADS_COST:     { label: "Ads Cost",  classes: "bg-orange-50 text-orange-700 border border-orange-200" },
};

function SourceBadge({ source }: { source: SourceType }) {
  const { label, classes } = SOURCE_CONFIG[source] ?? SOURCE_CONFIG.IMPORT;
  return (
    <span className={cn("inline-block px-1.5 py-0.5 rounded-[2px] text-[10px] font-medium whitespace-nowrap", classes)}>
      {label}
    </span>
  );
}

// ── Derived display values per row ─────────────────────────────────────────

function getDisplayValues(row: ExpectedChargeRow) {
  const d = row.billing_detail ?? {};
  const isAds = row.source === "ADS_REVENUE" || row.source === "ADS_COST";

  return {
    baseFee:  isAds ? d.base_fee    : row.base_fee,
    shopping: row.source === "ADS_REVENUE" ? d.shopping_revenue
            : row.source === "ADS_COST"    ? d.shopping_cost
            : row.google_shopping_charge,
    search:   row.source === "ADS_REVENUE" ? d.search_revenue
            : row.source === "ADS_COST"    ? d.search_cost
            : row.google_search_charge,
    bing:     isAds ? null : row.bing_charge,
    pct:      isAds ? (d.billing_pct != null ? d.billing_pct * 100 : null)
                    : row.billing_pct,
    other:    isAds ? null : row.other_charge,
    adsBase:  isAds ? d.ads_base : null,
    campaignCount: isAds ? d.campaign_count : null,
  };
}

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
  const [editingCell, setEditingCell] = useState<{ id: number; field: ImportEditableField } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [savingIds, setSavingIds] = useState<Set<number>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
  const [errorIds, setErrorIds] = useState<Map<number, string>>(new Map());
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");

  const filtered = rows.filter((r) => {
    if (sourceFilter !== "all" && r.source !== sourceFilter) return false;
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

  function startEdit(id: number, field: ImportEditableField, currentVal: unknown) {
    if (isClosed) return;
    const row = rows.find((r) => r.id === id)!;
    if (row.source !== "IMPORT") return; // ADS + SUBSCRIPTION are read-only
    setEditingCell({ id, field });
    setEditValue(currentVal === null || currentVal === undefined ? "" : String(currentVal));
  }

  const commitEdit = useCallback(() => {
    if (!editingCell) return;
    const { id, field } = editingCell;
    const raw = editValue;

    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const numericFields = new Set([
          "billing_pct", "google_shopping_charge", "google_search_charge",
          "bing_charge", "base_fee", "other_charge", "expected_amount",
        ]);
        let parsed: string | number | null = raw.trim() || null;
        if (parsed !== null && numericFields.has(field)) {
          const n = parseFloat(raw.replace(/[,$\s]/g, ""));
          if (!isNaN(n)) parsed = n;
        }
        return { ...r, [field]: parsed };
      })
    );

    setEditingCell(null);
    setSavingIds((s) => new Set([...s, id]));
    setErrorIds((m) => { const n = new Map(m); n.delete(id); return n; });

    startTransition(async () => {
      try {
        await updateExpectedCharge(id, field, raw);
        setSavingIds((s) => { const n = new Set(s); n.delete(id); return n; });
        setSavedIds((s) => new Set([...s, id]));
        setTimeout(() => setSavedIds((s) => { const n = new Set(s); n.delete(id); return n; }), 2000);
      } catch (err) {
        setSavingIds((s) => { const n = new Set(s); n.delete(id); return n; });
        setErrorIds((m) => new Map([...m, [id, err instanceof Error ? err.message : "Save failed"]]));
        setRows(initialRows);
      }
    });
  }, [editingCell, editValue, initialRows]);

  function cancelEdit() { setEditingCell(null); }

  function renderMoney(val: number | null | undefined, editable: boolean, id: number, field: ImportEditableField) {
    const isEditing = editingCell?.id === id && editingCell?.field === field;

    if (isEditing) {
      return (
        <input
          autoFocus
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") cancelEdit(); }}
          className="w-full bg-white border border-[#0170B9] rounded-[2px] px-1.5 py-0.5 text-xs outline-none text-right"
        />
      );
    }

    const display = val != null ? formatMoney(String(val)) : "—";
    const isEmpty = display === "—";

    return (
      <span
        onClick={() => editable && startEdit(id, field, val)}
        className={cn(
          "truncate block rounded-[2px] px-0.5 text-right font-mono",
          editable && !isClosed
            ? isEmpty ? "cursor-pointer text-[#c8c8c8] hover:bg-blue-50" : "cursor-pointer hover:bg-blue-50"
            : "cursor-default",
          isEmpty && "text-[#c8c8c8]"
        )}
      >
        {display}
      </span>
    );
  }

  const grandTotal = filtered.reduce((s, r) => s + Number(r.expected_amount ?? 0), 0);

  const COL_W = { name: 190, batch: 60, source: 80, base: 90, shop: 110, search: 110, bing: 80, pct: 60, other: 80, total: 110, actions: 48 };

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

          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9ca3af]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search account or Stripe ID…"
              className="pl-8 pr-3 py-1.5 text-sm border border-[#dddddd] rounded-[2px] w-56 focus:outline-none focus:border-[#0170B9]"
            />
          </div>

          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="px-3 py-1.5 text-sm border border-[#dddddd] rounded-[2px] bg-white focus:outline-none focus:border-[#0170B9]"
          >
            <option value="all">All sources</option>
            <option value="IMPORT">Import</option>
            <option value="SUBSCRIPTION">Subscription</option>
            <option value="ADS_REVENUE">Ads Revenue</option>
            <option value="ADS_COST">Ads Cost</option>
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
          : "Import rows are editable. Ads and Subscription rows are auto-generated — re-run reconciliation to refresh."}
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
              <col style={{ width: COL_W.name, minWidth: COL_W.name }} />
              <col style={{ width: COL_W.batch, minWidth: COL_W.batch }} />
              <col style={{ width: COL_W.source, minWidth: COL_W.source }} />
              <col style={{ width: COL_W.base, minWidth: COL_W.base }} />
              <col style={{ width: COL_W.shop, minWidth: COL_W.shop }} />
              <col style={{ width: COL_W.search, minWidth: COL_W.search }} />
              <col style={{ width: COL_W.bing, minWidth: COL_W.bing }} />
              <col style={{ width: COL_W.pct, minWidth: COL_W.pct }} />
              <col style={{ width: COL_W.other, minWidth: COL_W.other }} />
              <col style={{ width: COL_W.total, minWidth: COL_W.total }} />
              <col style={{ width: COL_W.actions, minWidth: COL_W.actions }} />
            </colgroup>

            <thead>
              <tr className="border-b border-[#dddddd] bg-[#F5F5F5] sticky top-0 z-20">
                {[
                  { label: "Account", align: "left",   sticky: true },
                  { label: "Batch",   align: "center", sticky: false },
                  { label: "Source",  align: "center", sticky: false },
                  { label: "Base Fee",align: "right",  sticky: false },
                  { label: "Shopping",align: "right",  sticky: false },
                  { label: "Search",  align: "right",  sticky: false },
                  { label: "Bing",    align: "right",  sticky: false },
                  { label: "Rev %",   align: "right",  sticky: false },
                  { label: "Other",   align: "right",  sticky: false },
                  { label: "Total",   align: "right",  sticky: false, important: true },
                  { label: "",        align: "center", sticky: false },
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
              {filtered.map((row) => {
                const saving = savingIds.has(row.id);
                const saved  = savedIds.has(row.id);
                const err    = errorIds.get(row.id);
                const isImport = row.source === "IMPORT";
                const isAds = row.source === "ADS_REVENUE" || row.source === "ADS_COST";
                const dv = getDisplayValues(row);
                const bgBase = err ? "#fef2f2" : saved ? "#f0fdf4" : saving ? "#eff6ff" : "white";

                return (
                  <tr
                    key={row.id}
                    className={cn(
                      "group border-b border-[#eeeeee]",
                      err ? "bg-red-50" : saved ? "bg-green-50" : saving ? "bg-blue-50/40" : "bg-white hover:bg-[#fafafa]"
                    )}
                  >
                    {/* Account name */}
                    <td
                      className="px-2 py-1.5 border-x border-[#eeeeee] overflow-hidden text-xs font-medium border-r-2 border-r-[#dddddd]"
                      style={{ position: "sticky", left: 0, zIndex: 10, backgroundColor: bgBase }}
                    >
                      <span
                        onClick={() => isImport && startEdit(row.id, "account_name", row.account_name)}
                        className={cn(
                          "truncate block rounded-[2px] px-0.5",
                          isImport && !isClosed ? "cursor-pointer hover:bg-blue-50" : "cursor-default"
                        )}
                        title={row.account_name}
                      >
                        {row.account_name}
                      </span>
                    </td>

                    {/* Batch */}
                    <td className="px-2 py-1.5 border-x border-[#eeeeee] text-xs text-center">
                      <span
                        onClick={() => isImport && startEdit(row.id, "batch", row.batch)}
                        className={cn(
                          "truncate block rounded-[2px] px-0.5 text-[#6b7280]",
                          isImport && !isClosed ? "cursor-pointer hover:bg-blue-50" : "cursor-default"
                        )}
                      >
                        {row.batch ?? "—"}
                      </span>
                    </td>

                    {/* Source badge */}
                    <td className="px-2 py-1.5 border-x border-[#eeeeee] text-center">
                      <SourceBadge source={row.source} />
                    </td>

                    {/* Base fee */}
                    <td className="px-2 py-1.5 border-x border-[#eeeeee] text-xs">
                      {renderMoney(dv.baseFee ?? null, isImport, row.id, "base_fee")}
                    </td>

                    {/* Shopping */}
                    <td className="px-2 py-1.5 border-x border-[#eeeeee] text-xs">
                      {row.source === "SUBSCRIPTION"
                        ? <span className="text-[#c8c8c8] block text-right">—</span>
                        : renderMoney(dv.shopping ?? null, isImport, row.id, "google_shopping_charge")}
                    </td>

                    {/* Search */}
                    <td className="px-2 py-1.5 border-x border-[#eeeeee] text-xs">
                      {row.source === "SUBSCRIPTION"
                        ? <span className="text-[#c8c8c8] block text-right">—</span>
                        : renderMoney(dv.search ?? null, isImport, row.id, "google_search_charge")}
                    </td>

                    {/* Bing */}
                    <td className="px-2 py-1.5 border-x border-[#eeeeee] text-xs">
                      {isAds || row.source === "SUBSCRIPTION"
                        ? <span className="text-[#c8c8c8] block text-right">—</span>
                        : renderMoney(dv.bing ?? null, isImport, row.id, "bing_charge")}
                    </td>

                    {/* Rev % */}
                    <td className="px-2 py-1.5 border-x border-[#eeeeee] text-xs text-right">
                      {dv.pct != null
                        ? <span className={cn("font-mono", isImport && !isClosed && "cursor-pointer hover:bg-blue-50 rounded-[2px]")}
                            onClick={() => isImport && startEdit(row.id, "billing_pct", row.billing_pct)}>
                            {dv.pct}%
                          </span>
                        : <span className="text-[#c8c8c8]">—</span>}
                    </td>

                    {/* Other */}
                    <td className="px-2 py-1.5 border-x border-[#eeeeee] text-xs">
                      {isAds || row.source === "SUBSCRIPTION"
                        ? <span className="text-[#c8c8c8] block text-right">—</span>
                        : renderMoney(dv.other ?? null, isImport, row.id, "other_charge")}
                    </td>

                    {/* Total to bill */}
                    <td className="px-2 py-1.5 border-x border-[#eeeeee] text-xs">
                      {renderMoney(Number(row.expected_amount), isImport, row.id, "expected_amount")}
                    </td>

                    {/* Actions */}
                    <td className="px-2 py-1.5 border-x border-[#eeeeee] text-center">
                      {saving && <div className="w-3 h-3 border-2 border-[#0170B9] border-t-transparent rounded-full animate-spin mx-auto" />}
                      {saved  && <CheckCircle2 size={12} className="text-green-600 mx-auto" />}
                      {err    && <span title={err}><AlertCircle size={12} className="text-red-500 mx-auto" /></span>}
                      {!saving && !saved && !err && isAds && row.billing_detail?.google_customer_id && (
                        <Link
                          href={`/ads?period=${encodeURIComponent(selectedPeriod)}&customer=${row.billing_detail.google_customer_id}`}
                          className="text-[#0170B9] hover:text-blue-800 flex items-center justify-center"
                          title="View campaigns"
                        >
                          <ExternalLink size={12} />
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-4 py-10 text-center text-sm text-[#9ca3af]">
                    No rows match the current filters.
                  </td>
                </tr>
              )}
            </tbody>

            {filtered.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-[#dddddd] bg-[#F5F5F5] font-semibold text-xs">
                  <td className="px-2 py-2 text-[#6b7280] uppercase tracking-wide border-r-2 border-[#dddddd] sticky left-0 bg-[#F5F5F5]" style={{ position: "sticky", left: 0 }}>
                    Total ({filtered.length})
                  </td>
                  {/* 9 empty cols */}
                  {Array.from({ length: 8 }).map((_, i) => (
                    <td key={i} className="px-2 py-2 border-x border-[#dddddd]" />
                  ))}
                  <td className="px-2 py-2 border-x border-[#dddddd] text-right font-mono">
                    {formatMoney(grandTotal)}
                  </td>
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
