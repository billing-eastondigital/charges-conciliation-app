"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  TrendingUp, TrendingDown, ArrowRight, Search, Plus, ExternalLink, Pencil,
  AlertTriangle,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PERIODS } from "@/lib/mock";
import { monthly2026 } from "@/lib/mock/annual-2026";
import { cn } from "@/lib/utils";
import type { ClientRecord, BatchLabel, AccountStatus, Period } from "@/lib/types";

// ── Types ────────────────────────────────────────────────────────
type Tab = "directory" | "history";

// ── Shared helpers ───────────────────────────────────────────────
const STATUS_STYLE: Record<AccountStatus, string> = {
  ACTIVE:   "bg-green-100 text-green-800 border-green-200",
  LOST:     "bg-gray-100  text-gray-600  border-gray-200",
  INACTIVE: "bg-amber-100 text-amber-800 border-amber-200",
};

const BATCH_ORDER: BatchLabel[] = ["1","2","3","SUBSCRIPTION","5","Consulting","Multiple","—"];

const inputClass =
  "w-full text-sm border border-[#dddddd] rounded-sm px-3 py-2 outline-none focus:border-[#0170B9] transition-colors bg-white";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold text-[#3a3a3a] uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}

// ── Edit lifecycle dialog ─────────────────────────────────────────

interface EditForm { start_date: string; end_date: string }

function EditLifecycleDialog({
  client,
  onSave,
  onClose,
}: {
  client: ClientRecord;
  onSave: (updates: Partial<ClientRecord>) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<EditForm>({
    start_date: client.start_date ?? "",
    end_date:   client.end_date   ?? "",
  });

  const willBeLost   = form.end_date.trim() !== "";
  const wasLost      = client.end_date !== null;
  const willReactivate = wasLost && !willBeLost;

  function handleSave() {
    const hasEnd = form.end_date.trim() !== "";
    const updates: Partial<ClientRecord> = {
      start_date: form.start_date.trim() || null,
      end_date:   hasEnd ? form.end_date.trim() : null,
    };
    if (hasEnd) {
      updates.account_status  = "LOST";
      updates.is_active       = false;
      updates.deactivated_month = form.end_date.trim().slice(0, 7); // "YYYY-MM"
    } else {
      updates.account_status  = "ACTIVE";
      updates.is_active       = true;
      updates.deactivated_month = null;
    }
    onSave(updates);
    onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Edit client lifecycle</DialogTitle>
          <p className="text-xs text-[#6b7280] mt-0.5">{client.display_name}</p>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <Field label="Start date">
            <input
              type="date"
              value={form.start_date}
              onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
              className={inputClass}
              placeholder="YYYY-MM-DD"
            />
            <p className="text-[10px] text-[#9ca3af]">When the client was onboarded.</p>
          </Field>

          <Field label="End date (churn)">
            <input
              type="date"
              value={form.end_date}
              onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
              className={inputClass}
              placeholder="YYYY-MM-DD — leave blank if active"
            />
            <p className="text-[10px] text-[#9ca3af]">Last day of service. Leave blank if the client is still active.</p>
          </Field>

          {/* Warning / info banner */}
          {willBeLost && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-sm px-3 py-2.5">
              <AlertTriangle size={13} className="text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800">
                Setting an end date will mark this client as <strong>Lost</strong> and set the
                deactivated month to <strong>{form.end_date.slice(0, 7)}</strong>.
              </p>
            </div>
          )}
          {willReactivate && (
            <div className="flex items-start gap-2 bg-green-50 border border-green-200 rounded-sm px-3 py-2.5">
              <AlertTriangle size={13} className="text-green-600 shrink-0 mt-0.5" />
              <p className="text-xs text-green-800">
                Clearing the end date will reactivate this client (status → <strong>Active</strong>).
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleSave}
            className="bg-[#0170B9] hover:bg-[#015fa3] text-white rounded-sm">
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Directory tab ────────────────────────────────────────────────

function DirectoryTab({ initialClients }: { initialClients: ClientRecord[] }) {
  const [clients, setClients] = useState<ClientRecord[]>(initialClients);
  const [editingClient, setEditingClient] = useState<ClientRecord | null>(null);

  const [search,       setSearch]       = useState("");
  const [batchFilter,  setBatchFilter]  = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const allBatches = BATCH_ORDER.filter((b) => clients.some((c) => c.batch === b));

  const filtered = useMemo(() => {
    return clients.filter((c) => {
      if (batchFilter !== "all" && c.batch !== batchFilter) return false;
      if (statusFilter === "active"  && !c.is_active)  return false;
      if (statusFilter === "churned" &&  c.is_active)  return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          c.display_name.toLowerCase().includes(q)  ||
          c.primary_email.toLowerCase().includes(q) ||
          (c.stripe_id ?? "").toLowerCase().includes(q) ||
          (c.google_id  ?? "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [clients, search, batchFilter, statusFilter]);

  function applyEdit(updates: Partial<ClientRecord>) {
    if (!editingClient) return;
    const key = editingClient.stripe_id ?? editingClient.primary_email;
    setClients((prev) =>
      prev.map((c) => (c.stripe_id ?? c.primary_email) === key ? { ...c, ...updates } : c)
    );
  }

  return (
    <>
      {/* Edit dialog */}
      {editingClient && (
        <EditLifecycleDialog
          client={editingClient}
          onSave={applyEdit}
          onClose={() => setEditingClient(null)}
        />
      )}

      <div className="bg-white border border-[#dddddd] rounded-sm overflow-hidden">
        {/* Toolbar */}
        <div className="px-4 py-3 border-b border-[#dddddd] flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9ca3af]" />
            <input
              type="search"
              placeholder="Name, email, Stripe ID, Google ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs border border-[#dddddd] rounded-sm outline-none focus:border-[#0170B9] transition-colors w-64"
            />
          </div>
          <select
            value={batchFilter}
            onChange={(e) => setBatchFilter(e.target.value)}
            className="text-xs border border-[#dddddd] rounded-sm px-2 py-1.5 outline-none focus:border-[#0170B9] text-[#4B4F58]"
          >
            <option value="all">All batches</option>
            {allBatches.map((b) => <option key={b} value={b}>Batch {b}</option>)}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs border border-[#dddddd] rounded-sm px-2 py-1.5 outline-none focus:border-[#0170B9] text-[#4B4F58]"
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="churned">Churned / Lost</option>
          </select>
          <span className="text-xs text-[#9ca3af] ml-1">{filtered.length} clients</span>
          <div className="ml-auto">
            <button
              disabled
              title="Available in Phase 3 — client writes will be wired to Supabase"
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-sm border border-[#dddddd] text-[#9ca3af] cursor-not-allowed"
            >
              <Plus size={12} />
              Add client
              <span className="text-[10px] bg-[#F5F5F5] px-1 rounded">Phase 3</span>
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#dddddd] bg-[#F5F5F5]">
                {[
                  ["Name",         "text-left px-4 py-2.5"],
                  ["Email",        "text-left px-4 py-2.5"],
                  ["Stripe ID",    "text-left px-4 py-2.5"],
                  ["Google ID",    "text-left px-4 py-2.5"],
                  ["Batch",        "text-center px-3 py-2.5"],
                  ["Status",       "text-center px-3 py-2.5"],
                  ["Current plan", "text-left px-4 py-2.5"],
                  ["Bill. day",    "text-center px-3 py-2.5"],
                  ["Start date",   "text-center px-3 py-2.5"],
                  ["End date",     "text-center px-3 py-2.5"],
                ].map(([h, cls]) => (
                  <th key={h} className={`${cls} font-semibold text-[#6b7280] uppercase tracking-wide whitespace-nowrap`}>{h}</th>
                ))}
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-4 py-10 text-center text-[#9ca3af]">No clients match your search.</td>
                </tr>
              )}
              {filtered.map((c) => {
                const plan      = c.billing_plans[c.billing_plans.length - 1] ?? c.billing_plans[0];
                const statusKey = c.account_status ?? "ACTIVE";
                const href      = c.stripe_id ? `/client/${c.stripe_id}` : null;

                return (
                  <tr
                    key={c.stripe_id ?? c.primary_email}
                    className="border-b border-[#eeeeee] last:border-0 hover:bg-[#fafafa] transition-colors"
                  >
                    {/* Name */}
                    <td className="px-4 py-2.5 min-w-[160px]">
                      {href
                        ? <Link href={href} className="font-medium text-[#3a3a3a] hover:text-[#0170B9] transition-colors">{c.display_name}</Link>
                        : <span className="font-medium text-[#3a3a3a]">{c.display_name}</span>}
                      {c.accounts.length > 1 && (
                        <p className="text-[10px] text-[#9ca3af] mt-0.5">{c.accounts.length} accounts</p>
                      )}
                    </td>
                    {/* Email */}
                    <td className="px-4 py-2.5 text-[#6b7280] whitespace-nowrap">{c.primary_email}</td>
                    {/* Stripe ID */}
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {c.stripe_id
                        ? <code className="font-mono text-[11px] text-[#4B4F58] bg-[#F5F5F5] px-1.5 py-0.5 rounded-sm border border-[#eeeeee]">{c.stripe_id}</code>
                        : <span className="text-[#cccccc]">—</span>}
                    </td>
                    {/* Google ID */}
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {c.google_id
                        ? <code className="font-mono text-[11px] text-[#4B4F58] bg-[#F5F5F5] px-1.5 py-0.5 rounded-sm border border-[#eeeeee]">{c.google_id}</code>
                        : <span className="text-[#cccccc]">—</span>}
                    </td>
                    {/* Batch */}
                    <td className="px-3 py-2.5 text-center">
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-sm bg-[#F5F5F5] border border-[#dddddd] text-[#4B4F58]">{c.batch}</span>
                    </td>
                    {/* Status */}
                    <td className="px-3 py-2.5 text-center">
                      <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-sm border", STATUS_STYLE[statusKey])}>
                        {statusKey.charAt(0) + statusKey.slice(1).toLowerCase()}
                      </span>
                    </td>
                    {/* Plan */}
                    <td className="px-4 py-2.5 max-w-[200px]">
                      {plan ? (
                        <>
                          <p className="text-[#3a3a3a] truncate" title={plan.billing_plan}>{plan.billing_plan}</p>
                          <p className="text-[10px] text-[#9ca3af] mt-0.5">
                            {plan.billing_pct > 0 ? `${plan.billing_pct}%` : plan.projection_amount != null ? `$${plan.projection_amount.toLocaleString()}` : "—"}
                          </p>
                        </>
                      ) : <span className="text-[#cccccc]">—</span>}
                    </td>
                    {/* Billing day */}
                    <td className="px-3 py-2.5 text-center text-[#6b7280] font-mono">
                      {plan?.billing_day ?? <span className="text-[#cccccc]">—</span>}
                    </td>
                    {/* Start date */}
                    <td className="px-3 py-2.5 text-center whitespace-nowrap">
                      {c.start_date
                        ? <span className="text-[#4B4F58]">{c.start_date}</span>
                        : <span className="text-[#cccccc]">—</span>}
                    </td>
                    {/* End date */}
                    <td className="px-3 py-2.5 text-center whitespace-nowrap">
                      {c.end_date
                        ? <span className="font-medium text-red-600">{c.end_date}</span>
                        : <span className="text-[#cccccc]">—</span>}
                    </td>
                    {/* Actions */}
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2 justify-end">
                        {href && (
                          <Link href={href} className="inline-flex items-center gap-1 text-[10px] text-[#0170B9] hover:underline whitespace-nowrap">
                            View <ExternalLink size={10} />
                          </Link>
                        )}
                        <button
                          onClick={() => setEditingClient(c)}
                          title="Edit start / end date"
                          className="p-1 rounded-sm text-[#9ca3af] hover:text-[#0170B9] hover:bg-[#e8f4ff] transition-colors"
                        >
                          <Pencil size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ── History tab ──────────────────────────────────────────────────

function ClientHistoryCard({ client: c, period, type }: { client: ClientRecord; period: string; type: "won" | "churned" }) {
  const isWon = type === "won";
  const plan  = c.billing_plans[c.billing_plans.length - 1] ?? c.billing_plans[0];
  const href  = c.stripe_id ? `/client/${c.stripe_id}` : null;
  return (
    <div className={cn("border rounded-sm p-3", isWon ? "border-green-200 bg-green-50/40" : "border-red-200 bg-red-50/40")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {href
            ? <Link href={href} className="text-xs font-semibold text-[#3a3a3a] hover:text-[#0170B9] transition-colors">{c.display_name}</Link>
            : <span className="text-xs font-semibold text-[#3a3a3a]">{c.display_name}</span>}
          <p className="text-[10px] text-[#6b7280] mt-0.5 truncate">{c.primary_email}</p>
        </div>
        <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-[#F5F5F5] text-[#6b7280] border border-[#dddddd] shrink-0 font-medium">
          Batch {c.batch}
        </span>
      </div>
      <div className="mt-2 pt-2 border-t border-black/5 flex flex-wrap gap-x-4 gap-y-0.5">
        <span className="text-[10px] text-[#9ca3af]">
          {isWon ? "Started" : "Churned"}:{" "}
          <span className={cn("font-medium", isWon ? "text-green-700" : "text-red-700")}>
            {isWon ? c.start_date : c.deactivated_month}
          </span>
        </span>
        {plan && <span className="text-[10px] text-[#9ca3af]">Plan: <span className="text-[#4B4F58]">{plan.billing_plan}</span></span>}
        <span className="text-[10px] text-[#9ca3af]">Period: <span className="text-[#4B4F58]">{period}</span></span>
      </div>
    </div>
  );
}

function HistoryTab({ clients }: { clients: ClientRecord[] }) {
  const periodRows = PERIODS.map((p: Period) => {
    const monthKey = p.start_date.slice(0, 7);
    const won     = clients.filter((c) => c.start_date && c.start_date >= p.start_date && c.start_date <= p.end_date);
    const churned = clients.filter((c) => c.deactivated_month === monthKey);
    const agg     = monthly2026.find((m) => m.period_label === p.period_label);
    return { period: p, monthKey, won, churned, activeCount: agg?.client_count ?? null };
  });

  const allWon     = periodRows.flatMap((r) => r.won.map((c)     => ({ client: c, period: r.period.period_label })));
  const allChurned = periodRows.flatMap((r) => r.churned.map((c) => ({ client: c, period: r.period.period_label })));
  const netYtd     = allWon.length - allChurned.length;
  const activeNow  = clients.filter((c) => c.is_active).length;

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Active now",  value: activeNow,         accent: "#0170B9" },
          { label: "Won YTD",     value: allWon.length,     accent: "#16a34a" },
          { label: "Churned YTD", value: allChurned.length, accent: "#dc2626" },
          { label: "Net YTD",     value: `${netYtd >= 0 ? "+" : ""}${netYtd}`,
            accent: netYtd > 0 ? "#16a34a" : netYtd < 0 ? "#dc2626" : "#6b7280" },
        ].map((k) => (
          <div key={k.label} className="bg-white border border-[#dddddd] rounded-sm p-4" style={{ borderTop: `3px solid ${k.accent}` }}>
            <p className="text-[11px] text-[#6b7280] uppercase tracking-wide mb-1">{k.label}</p>
            <p className="text-xl font-semibold text-[#3a3a3a] font-mono">{k.value}</p>
          </div>
        ))}
      </div>

      {/* Timeline */}
      <div className="bg-white border border-[#dddddd] rounded-sm overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[#eeeeee] bg-[#fafafa]">
          <span className="text-xs font-semibold text-[#6b7280] uppercase tracking-wide">Period timeline</span>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#eeeeee] bg-[#F5F5F5]">
              {["Period","Active clients","Won","Churned","Net","Status"].map((h) => (
                <th key={h} className="px-4 py-2.5 text-left font-semibold text-[#6b7280] uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {periodRows.map((r) => {
              const net = r.won.length - r.churned.length;
              return (
                <tr key={r.period.period_label} className="border-b border-[#eeeeee] last:border-0 hover:bg-[#fafafa]">
                  <td className="px-4 py-3 font-medium text-[#3a3a3a]">
                    <Link href={`/period/${encodeURIComponent(r.period.period_label)}`}
                      className="hover:text-[#0170B9] transition-colors flex items-center gap-1 group w-fit">
                      {r.period.period_label}
                      <ArrowRight size={11} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-center font-mono text-[#3a3a3a]">{r.activeCount ?? "—"}</td>
                  <td className="px-4 py-3 text-center">
                    {r.won.length > 0 ? <span className="font-semibold text-green-600">+{r.won.length}</span> : <span className="text-[#cccccc]">—</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {r.churned.length > 0 ? <span className="font-semibold text-red-600">−{r.churned.length}</span> : <span className="text-[#cccccc]">—</span>}
                  </td>
                  <td className="px-4 py-3 text-center font-semibold font-mono">
                    <span className={cn(net > 0 ? "text-green-600" : net < 0 ? "text-red-600" : "text-[#9ca3af]")}>
                      {net > 0 ? `+${net}` : net < 0 ? `${net}` : "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {r.period.closed
                      ? <span className="text-[10px] bg-green-100 text-green-700 border border-green-200 px-1.5 py-0.5 rounded-sm font-medium">Closed</span>
                      : <span className="text-[10px] bg-amber-100 text-amber-800 border border-amber-200 px-1.5 py-0.5 rounded-sm font-medium">Open</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Won / Churned panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={14} className="text-green-600" />
            <h2 className="text-sm font-semibold text-[#3a3a3a]">Won clients</h2>
            <span className="text-xs text-[#9ca3af]">· {allWon.length} YTD</span>
          </div>
          {allWon.length === 0
            ? <p className="text-xs text-[#9ca3af] border border-[#eeeeee] rounded-sm px-4 py-8 text-center">No new clients recorded.</p>
            : <div className="space-y-2">{allWon.map(({ client: c, period }) => <ClientHistoryCard key={c.stripe_id ?? c.primary_email} client={c} period={period} type="won" />)}</div>}
        </div>
        <div>
          <div className="flex items-center gap-2 mb-3">
            <TrendingDown size={14} className="text-red-600" />
            <h2 className="text-sm font-semibold text-[#3a3a3a]">Churned clients</h2>
            <span className="text-xs text-[#9ca3af]">· {allChurned.length} YTD</span>
          </div>
          {allChurned.length === 0
            ? <p className="text-xs text-[#9ca3af] border border-[#eeeeee] rounded-sm px-4 py-8 text-center">No churned clients recorded.</p>
            : <div className="space-y-2">{allChurned.map(({ client: c, period }) => <ClientHistoryCard key={c.stripe_id ?? c.primary_email} client={c} period={period} type="churned" />)}</div>}
        </div>
      </div>
    </div>
  );
}

// ── Tab bar ──────────────────────────────────────────────────────

function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  return (
    <div className="flex border-b border-[#dddddd]">
      {([["directory","Directory"],["history","Won & Churned"]] as [Tab,string][]).map(([id, label]) => (
        <button key={id} onClick={() => onChange(id)}
          className={cn("px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
            active === id ? "border-[#0170B9] text-[#0170B9]" : "border-transparent text-[#6b7280] hover:text-[#3a3a3a]")}>
          {label}
        </button>
      ))}
    </div>
  );
}

// ── Page client shell ─────────────────────────────────────────────

export default function ClientsPageClient({ initialClients }: { initialClients: ClientRecord[] }) {
  const [tab, setTab] = useState<Tab>("directory");
  return (
    <div className="px-6 py-6 space-y-5 max-w-[1600px]">
      <div>
        <h1 className="text-2xl font-semibold text-[#3a3a3a]">Clients</h1>
        <p className="text-sm text-[#6b7280] mt-0.5">
          {initialClients.length} clients · Stripe IDs, billing plans, and lifecycle history
        </p>
      </div>
      <TabBar active={tab} onChange={setTab} />
      {tab === "directory" ? <DirectoryTab initialClients={initialClients} /> : <HistoryTab clients={initialClients} />}
    </div>
  );
}
