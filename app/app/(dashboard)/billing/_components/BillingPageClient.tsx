"use client";

import { useState, useTransition, useCallback, Fragment } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Search, Info, CheckCircle2, AlertCircle, ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { updateExpectedCharge, updateAdsBillingDetail, toggleReadyForBilling } from "../actions";

// ── Types ──────────────────────────────────────────────────────────────────

type SourceType = "IMPORT" | "SUBSCRIPTION" | "ADS_REVENUE" | "ADS_COST";

interface LineItem {
  text: string;
  amount: number;
}

interface BillingDetail {
  base_fee?: number;
  billing_pct?: number;
  billing_method?: string;
  google_customer_id?: string;
  shopping_revenue?: number;
  shopping_cost?: number;
  search_revenue?: number;
  search_cost?: number;
  bing_revenue?: number;
  bing_percent?: number;
  dfw?: number;
  ads_base?: number;
  gross_revenue?: number;
  gross_cost?: number;
  campaign_count?: number;
  date_from?: string;
  date_to?: string;
  memo?: string;
  line_items?: LineItem[];
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
  ready_for_billing: boolean;
  invoice_url: string | null;
  invoice_status: string | null;
  // IMPORT columns
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

type AdsEditableField = "bing_revenue" | "dfw";
type AnyEditableField = ImportEditableField | AdsEditableField;

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

// ── Invoice status badge ───────────────────────────────────────────────────

const INVOICE_STATUS_CONFIG: Record<string, { label: string; classes: string }> = {
  draft: { label: "Draft",  classes: "bg-gray-100 text-gray-600 border border-gray-300" },
  open:  { label: "Open",   classes: "bg-blue-50 text-[#0170B9] border border-blue-200" },
  paid:  { label: "Paid",   classes: "bg-green-50 text-green-700 border border-green-200" },
  void:  { label: "Void",   classes: "bg-red-50 text-red-600 border border-red-200" },
};

function InvoiceStatusBadge({ status }: { status: string }) {
  const cfg = INVOICE_STATUS_CONFIG[status] ?? INVOICE_STATUS_CONFIG.draft;
  return (
    <span className={cn("inline-block px-1.5 py-0.5 rounded-[2px] text-[10px] font-medium", cfg.classes)}>
      {cfg.label}
    </span>
  );
}

// ── Derived display values per row ─────────────────────────────────────────

function getDisplayValues(row: ExpectedChargeRow) {
  const d = row.billing_detail ?? {};
  const isAds = row.source === "ADS_REVENUE" || row.source === "ADS_COST";

  const shoppingRev = isAds
    ? (row.source === "ADS_REVENUE" ? d.shopping_revenue : d.shopping_cost)
    : row.google_shopping_charge;

  const searchRev = isAds
    ? (row.source === "ADS_REVENUE" ? d.search_revenue : d.search_cost)
    : row.google_search_charge;

  const bingRev  = isAds ? (d.bing_revenue ?? 0) : (row.bing_charge ?? 0);
  const bingPct  = isAds ? (d.bing_percent != null ? d.bing_percent * 100 : null) : null;
  const dfw      = isAds ? (d.dfw ?? 0) : (row.other_charge ?? 0);
  const baseFee  = isAds ? d.base_fee : row.base_fee;
  const pct      = isAds
    ? (d.billing_pct != null ? d.billing_pct * 100 : null)
    : row.billing_pct;

  const memo = isAds
    ? (d.memo ?? null)
    : `${row.account_name} ${null}`;  // IMPORT has no memo — shown as derived

  return { baseFee, shoppingRev, searchRev, bingRev, bingPct, dfw, pct, memo, lineItems: d.line_items };
}

// ── Props ─────────────────────────────────────────────────────────────────

interface Props {
  rows: ExpectedChargeRow[];
  periods: { period_label: string; is_closed: boolean }[];
  selectedPeriod: string;
  isClosed: boolean;
}

// ── Money display helper ───────────────────────────────────────────────────

function MoneyDisplay({
  val, editable, id, field, isClosed, editingCell, editValue,
  onStartEdit, onCommit, onCancel, onEditChange,
}: {
  val: number | null | undefined;
  editable: boolean;
  id: number;
  field: AnyEditableField;
  isClosed: boolean;
  editingCell: { id: number; field: AnyEditableField } | null;
  editValue: string;
  onStartEdit: (id: number, field: AnyEditableField, v: unknown) => void;
  onCommit: () => void;
  onCancel: () => void;
  onEditChange: (v: string) => void;
}) {
  const isEditing = editingCell?.id === id && editingCell?.field === field;
  if (isEditing) {
    return (
      <input
        autoFocus
        value={editValue}
        onChange={(e) => onEditChange(e.target.value)}
        onBlur={onCommit}
        onKeyDown={(e) => { if (e.key === "Enter") onCommit(); if (e.key === "Escape") onCancel(); }}
        className="w-full bg-white border border-[#0170B9] rounded-[2px] px-1.5 py-0.5 text-xs outline-none text-right font-mono"
      />
    );
  }
  const display = val != null ? formatMoney(String(val)) : "—";
  const isEmpty = display === "—";
  return (
    <span
      onClick={() => editable && onStartEdit(id, field, val)}
      className={cn(
        "truncate block rounded-[2px] px-0.5 text-right font-mono",
        editable && !isClosed ? "cursor-pointer hover:bg-blue-50" : "cursor-default",
        isEmpty && "text-[#c8c8c8]"
      )}
    >
      {display}
    </span>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function BillingPageClient({ rows: initialRows, periods, selectedPeriod, isClosed }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [rows, setRows] = useState(initialRows);
  const [editingCell, setEditingCell] = useState<{ id: number; field: AnyEditableField } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [savingIds, setSavingIds] = useState<Set<number>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
  const [errorIds, setErrorIds] = useState<Map<number, string>>(new Map());
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [groupByBatch, setGroupByBatch] = useState(true);
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

  const ADS_EDITABLE = new Set<AnyEditableField>(["bing_revenue", "dfw"]);

  function startEdit(id: number, field: AnyEditableField, currentVal: unknown) {
    if (isClosed) return;
    const row = rows.find((r) => r.id === id)!;
    const isAds = row.source === "ADS_REVENUE" || row.source === "ADS_COST";
    if (row.source !== "IMPORT" && !(isAds && ADS_EDITABLE.has(field))) return;
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
        const isAdsF = ADS_EDITABLE.has(field);
        const n = parseFloat(raw.replace(/[,$\s]/g, ""));
        const num = isNaN(n) ? 0 : n;
        if (isAdsF) {
          // ADS fields live in billing_detail — patch there for instant UI update
          const d = { ...(r.billing_detail ?? {}), [field]: num };
          const base_fee    = d.base_fee    ?? 0;
          const ads_base    = d.ads_base    ?? 0;
          const bing_rev    = d.bing_revenue ?? 0;
          const dfw_val     = d.dfw         ?? 0;
          const billing_pct = d.billing_pct ?? 0;
          const new_total   = Math.round((base_fee + (ads_base + bing_rev) * billing_pct + dfw_val) * 10000) / 10000;
          return { ...r, billing_detail: d, expected_amount: new_total };
        }
        const numericFields = new Set([
          "billing_pct","google_shopping_charge","google_search_charge",
          "bing_charge","base_fee","other_charge","expected_amount",
        ]);
        let parsed: string | number | null = raw.trim() || null;
        if (parsed !== null && numericFields.has(field)) {
          if (!isNaN(n)) parsed = n;
        }
        return { ...r, [field]: parsed };
      })
    );
    setEditingCell(null);
    setSavingIds((s) => new Set([...s, id]));
    setErrorIds((m) => { const n = new Map(m); n.delete(id); return n; });
    const isAdsField = ADS_EDITABLE.has(field);
    startTransition(async () => {
      try {
        if (isAdsField) {
          await updateAdsBillingDetail(id, field as AdsEditableField, raw);
        } else {
          await updateExpectedCharge(id, field as ImportEditableField, raw);
        }
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

  function toggleExpand(id: number) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function handleReadyToggle(id: number, current: boolean) {
    if (isClosed) return;
    const next = !current;
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, ready_for_billing: next } : r));
    startTransition(async () => {
      try {
        await toggleReadyForBilling(id, next);
      } catch {
        setRows(initialRows);
      }
    });
  }

  const grandTotal = filtered.reduce((s, r) => s + Number(r.expected_amount ?? 0), 0);

  const BATCH_ORDER = ["1","2","3","SUBSCRIPTION","5","Consulting","Multiple","—"];
  const availableBatches = BATCH_ORDER.filter((b) => filtered.some((r) => (r.batch ?? "—") === b));
  const grouped = groupByBatch
    ? availableBatches
        .map((b) => ({ batch: b, rows: filtered.filter((r) => (r.batch ?? "—") === b) }))
        .filter(({ rows }) => rows.length > 0)
    : null;

  // Column widths
  const W = {
    exp: 24, account: 190, source: 72, base: 85,
    shopRev: 105, pct: 52, searchRev: 105,
    bingRev: 90, dfw: 75, total: 105,
    memo: 160, ready: 54, invoice: 110, ads: 42,
  };

  const TOTAL_COLS = 15; // for colspan

  const renderRow = (row: ExpectedChargeRow) => {
    const saving   = savingIds.has(row.id);
    const saved    = savedIds.has(row.id);
    const err      = errorIds.get(row.id);
    const isImport = row.source === "IMPORT";
    const isAds    = row.source === "ADS_REVENUE" || row.source === "ADS_COST";
    const isSub    = row.source === "SUBSCRIPTION";
    const expanded = expandedIds.has(row.id);
    const hasItems = !!row.billing_detail?.line_items?.length;
    const dv = getDisplayValues(row);
    const bgBase = err ? "#fef2f2" : saved ? "#f0fdf4" : saving ? "#eff6ff" : "white";
    const editProps = { isClosed, editingCell, editValue, onStartEdit: startEdit, onCommit: commitEdit, onCancel: cancelEdit, onEditChange: setEditValue };

    return (
      <Fragment key={row.id}>
        <tr
          className={cn(
            "group border-b border-[#eeeeee]",
            err ? "bg-red-50" : saved ? "bg-green-50" : saving ? "bg-blue-50/40" : "bg-white hover:bg-[#fafafa]"
          )}
        >
          {/* Expand toggle */}
          <td
            className="border-x border-[#eeeeee] text-center"
            style={{ position: "sticky", left: 0, zIndex: 10, backgroundColor: bgBase }}
          >
            {hasItems ? (
              <button
                onClick={() => toggleExpand(row.id)}
                className="w-full h-full flex items-center justify-center text-[#9ca3af] hover:text-[#3a3a3a] py-1.5"
              >
                {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </button>
            ) : null}
          </td>

          {/* Account */}
          <td
            className="px-2 py-1.5 border-x border-[#eeeeee] overflow-hidden text-xs font-medium border-r-2 border-r-[#dddddd]"
            style={{ position: "sticky", left: W.exp, zIndex: 10, backgroundColor: bgBase }}
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

          {/* Source */}
          <td className="px-2 py-1.5 border-x border-[#eeeeee] text-center">
            <SourceBadge source={row.source} />
          </td>

          {/* Base Fee */}
          <td className="px-2 py-1.5 border-x border-[#eeeeee] text-xs">
            {isSub
              ? <span className="text-[#c8c8c8] block text-right">—</span>
              : <MoneyDisplay val={dv.baseFee ?? null} editable={isImport} id={row.id} field="base_fee" {...editProps} />}
          </td>

          {/* Shopping Rev */}
          <td className="px-2 py-1.5 border-x border-[#eeeeee] text-xs">
            {isSub
              ? <span className="text-[#c8c8c8] block text-right">—</span>
              : <MoneyDisplay val={dv.shoppingRev ?? null} editable={isImport} id={row.id} field="google_shopping_charge" {...editProps} />}
          </td>

          {/* % */}
          <td className="px-2 py-1.5 border-x border-[#eeeeee] text-xs text-right">
            {dv.pct != null
              ? <span
                  className={cn("font-mono tabular-nums", isImport && !isClosed && "cursor-pointer hover:bg-blue-50 rounded-[2px] px-0.5")}
                  onClick={() => isImport && startEdit(row.id, "billing_pct", row.billing_pct)}
                >
                  {dv.pct}%
                </span>
              : <span className="text-[#c8c8c8]">—</span>}
          </td>

          {/* Search Rev */}
          <td className="px-2 py-1.5 border-x border-[#eeeeee] text-xs">
            {isSub
              ? <span className="text-[#c8c8c8] block text-right">—</span>
              : <MoneyDisplay val={dv.searchRev ?? null} editable={isImport} id={row.id} field="google_search_charge" {...editProps} />}
          </td>

          {/* Search % — same rate as Shopping */}
          <td className="px-2 py-1.5 border-x border-[#eeeeee] text-xs text-right">
            {isSub
              ? <span className="text-[#c8c8c8]">—</span>
              : dv.pct != null
                ? <span className={cn("font-mono tabular-nums", isImport && !isClosed && "cursor-pointer hover:bg-blue-50 rounded-[2px] px-0.5")}
                    onClick={() => isImport && startEdit(row.id, "billing_pct", row.billing_pct)}>
                    {dv.pct}%
                  </span>
                : <span className="text-[#c8c8c8]">—</span>}
          </td>

          {/* Bing Rev */}
          <td className="px-2 py-1.5 border-x border-[#eeeeee] text-xs">
            {isSub
              ? <span className="text-[#c8c8c8] block text-right">—</span>
              : isAds
                ? <MoneyDisplay val={dv.bingRev > 0 ? dv.bingRev : null} editable id={row.id} field="bing_revenue" {...editProps} />
                : <MoneyDisplay val={dv.bingRev > 0 ? dv.bingRev : null} editable={isImport} id={row.id} field="bing_charge" {...editProps} />}
          </td>

          {/* Bing % — auto-calculated from billing_percentage for ADS rows */}
          <td className="px-2 py-1.5 border-x border-[#eeeeee] text-xs text-right">
            {isAds && dv.bingRev > 0
              ? <span className="font-mono tabular-nums text-[#6b7280]">{((row.billing_detail?.billing_pct ?? 0) * 100).toFixed(2)}%</span>
              : dv.bingPct != null && dv.bingPct > 0
                ? <span className="font-mono tabular-nums">{dv.bingPct}%</span>
                : <span className="text-[#c8c8c8]">—</span>}
          </td>

          {/* DFW */}
          <td className="px-2 py-1.5 border-x border-[#eeeeee] text-xs">
            {isSub
              ? <span className="text-[#c8c8c8] block text-right">—</span>
              : isAds
                ? <MoneyDisplay val={dv.dfw > 0 ? dv.dfw : null} editable id={row.id} field="dfw" {...editProps} />
                : <MoneyDisplay val={dv.dfw > 0 ? dv.dfw : null} editable={isImport} id={row.id} field="other_charge" {...editProps} />}
          </td>

          {/* Total */}
          <td className="px-2 py-1.5 border-x border-[#eeeeee] text-xs">
            <MoneyDisplay val={Number(row.expected_amount)} editable={isImport} id={row.id} field="expected_amount" {...editProps} />
          </td>

          {/* Memo */}
          <td className="px-2 py-1.5 border-x border-[#eeeeee] text-xs text-[#6b7280] truncate max-w-0">
            <span className="truncate block" title={dv.memo ?? undefined}>
              {dv.memo ?? <span className="text-[#c8c8c8]">—</span>}
            </span>
          </td>

          {/* ✓ Ready */}
          <td className="px-2 py-1.5 border-x border-[#eeeeee] text-center">
            <input
              type="checkbox"
              checked={row.ready_for_billing}
              disabled={isClosed}
              onChange={() => handleReadyToggle(row.id, row.ready_for_billing)}
              className="w-3.5 h-3.5 accent-[#0170B9] cursor-pointer disabled:cursor-default"
              title={row.ready_for_billing ? "Ready for billing" : "Mark as ready"}
            />
          </td>

          {/* Invoice */}
          <td className="px-2 py-1.5 border-x border-[#eeeeee] text-center">
            {saving && <div className="w-3 h-3 border-2 border-[#0170B9] border-t-transparent rounded-full animate-spin mx-auto" />}
            {saved  && <CheckCircle2 size={12} className="text-green-600 mx-auto" />}
            {err    && <span title={err}><AlertCircle size={12} className="text-red-500 mx-auto" /></span>}
            {!saving && !saved && !err && (
              <div className="flex flex-col items-center gap-0.5">
                {row.invoice_url ? (
                  <>
                    {row.invoice_status && <InvoiceStatusBadge status={row.invoice_status} />}
                    <a
                      href={row.invoice_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#0170B9] hover:text-blue-800"
                      title="Open Stripe invoice"
                    >
                      <ExternalLink size={11} />
                    </a>
                  </>
                ) : row.ready_for_billing ? (
                  <span className="text-[10px] text-amber-600 font-medium">Pending</span>
                ) : null}
              </div>
            )}
          </td>

          {/* Ads campaigns link */}
          <td className="px-2 py-1.5 border-x border-[#eeeeee] text-center">
            {isAds && row.billing_detail?.google_customer_id && (
              <Link
                href={`/ads?period=${encodeURIComponent(selectedPeriod)}&customer=${row.billing_detail.google_customer_id}`}
                className="text-[#0170B9] hover:text-blue-800 flex items-center justify-center"
                title="View campaigns"
              >
                <ExternalLink size={11} />
              </Link>
            )}
          </td>
        </tr>

        {/* Expanded line items sub-row */}
        {expanded && hasItems && (
          <tr className="bg-[#f8faff] border-b border-[#dddddd]">
            <td />
            <td colSpan={TOTAL_COLS} className="px-4 py-2">
              <p className="text-[10px] font-semibold text-[#9ca3af] uppercase tracking-wide mb-1.5">
                Invoice line items
              </p>
              <div className="flex flex-col gap-1">
                {row.billing_detail!.line_items!.map((item, i) => (
                  <div key={i} className="flex items-baseline justify-between gap-4 text-xs">
                    <span className="text-[#4B4F58] flex-1">{item.text}</span>
                    <span className="font-mono text-[#3a3a3a] font-medium shrink-0">
                      {formatMoney(String(item.amount))}
                    </span>
                  </div>
                ))}
              </div>
            </td>
          </tr>
        )}
      </Fragment>
    );
  };

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
          <button
            onClick={() => setGroupByBatch((v) => !v)}
            className={`text-xs px-3 py-1.5 rounded-[2px] border transition-colors ${
              groupByBatch
                ? "bg-[#3a3a3a] text-white border-[#3a3a3a]"
                : "bg-white text-[#4B4F58] border-[#dddddd] hover:border-[#3a3a3a]"
            }`}
          >
            By Batch
          </button>
        </div>
      </div>

      {/* Info banner */}
      <div className={cn(
        "px-6 py-2 border-b flex items-center gap-2 text-xs",
        isClosed ? "bg-[#F5F5F5] border-[#dddddd] text-[#9ca3af]"
                 : "bg-blue-50 border-blue-100 text-[#0170B9]"
      )}>
        <Info size={12} className="shrink-0" />
        {isClosed
          ? "This period is closed — rows are read-only."
          : "Import rows are editable. Ads and Subscription rows are auto-generated. Mark ✓ Ready when approved for invoicing."}
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
              <col style={{ width: W.exp,       minWidth: W.exp }} />
              <col style={{ width: W.account,   minWidth: W.account }} />
              <col style={{ width: W.source,    minWidth: W.source }} />
              <col style={{ width: W.base,      minWidth: W.base }} />
              <col style={{ width: W.shopRev,   minWidth: W.shopRev }} />
              <col style={{ width: W.pct,       minWidth: W.pct }} />
              <col style={{ width: W.searchRev, minWidth: W.searchRev }} />
              <col style={{ width: W.pct,       minWidth: W.pct }} />
              <col style={{ width: W.bingRev,   minWidth: W.bingRev }} />
              <col style={{ width: W.pct,       minWidth: W.pct }} />
              <col style={{ width: W.dfw,       minWidth: W.dfw }} />
              <col style={{ width: W.total,     minWidth: W.total }} />
              <col style={{ width: W.memo,      minWidth: W.memo }} />
              <col style={{ width: W.ready,     minWidth: W.ready }} />
              <col style={{ width: W.invoice,   minWidth: W.invoice }} />
              <col style={{ width: W.ads,       minWidth: W.ads }} />
            </colgroup>

            <thead>
              <tr className="border-b border-[#dddddd] bg-[#F5F5F5] sticky top-0 z-20">
                {/* expand toggle */}
                <th className="border border-[#dddddd] bg-[#F5F5F5]" style={{ position: "sticky", zIndex: 20 }} />
                {[
                  { label: "Account",     align: "left",   sticky: true },
                  { label: "Source",      align: "center" },
                  { label: "Base Fee",    align: "right" },
                  { label: "Shop. Rev",   align: "right" },
                  { label: "%",           align: "right" },
                  { label: "Search Rev",  align: "right" },
                  { label: "%",           align: "right" },
                  { label: "Bing Rev",    align: "right" },
                  { label: "Bing %",      align: "right" },
                  { label: "DFW",         align: "right" },
                  { label: "Total",       align: "right",  important: true },
                  { label: "Memo",        align: "left" },
                  { label: "✓ Ready",     align: "center" },
                  { label: "Invoice",     align: "center" },
                  { label: "Ads",         align: "center" },
                ].map((h, i) => (
                  <th
                    key={i}
                    style={h.sticky ? { position: "sticky", left: W.exp, zIndex: 30 } : { position: "sticky", zIndex: 20 }}
                    className={cn(
                      "px-2 py-2 text-[11px] font-medium text-[#6b7280] border border-[#dddddd] whitespace-nowrap bg-[#F5F5F5]",
                      h.align === "right" && "text-right",
                      h.align === "center" && "text-center",
                      h.align === "left" && "text-left",
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
              {groupByBatch && grouped && grouped.map(({ batch, rows: batchRows }) => (
                <Fragment key={`group-${batch}`}>
                  <tr className="bg-[#3a3a3a]">
                    <td colSpan={TOTAL_COLS + 1} className="px-4 py-1.5">
                      <span className="text-xs font-semibold text-white uppercase tracking-wider">Batch {batch}</span>
                      <span className="text-xs text-[#aaa] ml-2">· {batchRows.length} client{batchRows.length !== 1 ? "s" : ""}</span>
                    </td>
                  </tr>
                  {batchRows.map((row) => renderRow(row))}
                </Fragment>
              ))}
              {(!groupByBatch || !grouped) && filtered.map((row) => renderRow(row))}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan={TOTAL_COLS + 1} className="px-4 py-10 text-center text-sm text-[#9ca3af]">
                    No rows match the current filters.
                  </td>
                </tr>
              )}
            </tbody>

            {filtered.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-[#dddddd] bg-[#F5F5F5] font-semibold text-xs">
                  <td className="border-x border-[#dddddd]" />
                  <td className="px-2 py-2 text-[#6b7280] uppercase tracking-wide border-r-2 border-[#dddddd] sticky font-normal"
                      style={{ position: "sticky", left: W.exp }}>
                    Total ({filtered.length})
                  </td>
                  {/* source, base, shopRev, %, searchRev, bingRev, bing%, dfw */}
                  {Array.from({ length: 8 }).map((_, i) => (
                    <td key={i} className="px-2 py-2 border-x border-[#dddddd]" />
                  ))}
                  <td className="px-2 py-2 border-x border-[#dddddd] text-right font-mono">
                    {formatMoney(grandTotal)}
                  </td>
                  {/* memo, ready, invoice, ads */}
                  {Array.from({ length: 4 }).map((_, i) => (
                    <td key={i} className="border-x border-[#dddddd]" />
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}
