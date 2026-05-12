"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatMoney } from "@/lib/format";
import { EditPlanDialog } from "./EditPlanDialog";
import { ChangePlanDialog } from "./ChangePlanDialog";
import type { ClientRecord, ClientBillingPlan, BatchLabel, ProjectionType } from "@/lib/types";

// ── constants ──────────────────────────────────────────────────────────────

const BATCH_ORDER: Array<BatchLabel | "ALL"> = [
  "ALL", "1", "2", "3", "SUBSCRIPTION", "5", "Consulting", "Multiple",
];

const PROJECTION_BADGES: Record<ProjectionType, { label: string; className: string }> = {
  FIXED:       { label: "Fixed",        className: "bg-green-100 text-green-800 border-green-200" },
  ROLLING_3:   { label: "Rolling 3mo",  className: "bg-blue-100 text-blue-800 border-blue-200" },
  ROLLING_6:   { label: "Rolling 6mo",  className: "bg-blue-100 text-blue-800 border-blue-200" },
  LAST_PERIOD: { label: "Last period",  className: "bg-amber-100 text-amber-800 border-amber-200" },
  MANUAL:      { label: "Manual",       className: "bg-purple-100 text-purple-800 border-purple-200" },
};

// ── helpers ────────────────────────────────────────────────────────────────

function getActivePlan(client: ClientRecord): ClientBillingPlan | null {
  if (client.billing_plans.length === 0) return null;
  return (
    client.billing_plans.find((p) => p.effective_to === null) ??
    client.billing_plans[client.billing_plans.length - 1]
  );
}

// ── component ──────────────────────────────────────────────────────────────

interface Props {
  initialClients: ClientRecord[];
  updatePlan: (stripeId: string, plan: ClientBillingPlan) => Promise<void>;
  changePlan: (stripeId: string, effectiveTo: string, newPlan: ClientBillingPlan) => Promise<void>;
}

export function PlanManagerTable({ initialClients, updatePlan, changePlan }: Props) {
  const router = useRouter();
  const [search, setSearch]             = useState("");
  const [batchFilter, setBatchFilter]   = useState<BatchLabel | "ALL">("ALL");
  const [editingClient, setEditingClient]   = useState<ClientRecord | null>(null);
  const [changingClient, setChangingClient] = useState<ClientRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  // ── filtering ──
  const filtered = useMemo(() => {
    return initialClients.filter((c) => {
      if (batchFilter !== "ALL" && c.batch !== batchFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !c.display_name.toLowerCase().includes(q) &&
          !c.primary_email.toLowerCase().includes(q) &&
          !(c.stripe_id ?? "").toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [initialClients, search, batchFilter]);

  // ── handlers ──
  async function handleSavePlan(stripeId: string | null, plan: ClientBillingPlan) {
    if (!stripeId) return;
    setSaving(true);
    setError(null);
    try {
      await updatePlan(stripeId, plan);
      setEditingClient(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save plan.");
    } finally {
      setSaving(false);
    }
  }

  async function handleChangePlan(
    stripeId: string | null,
    effectiveTo: string,
    newPlan: ClientBillingPlan
  ) {
    if (!stripeId) return;
    setSaving(true);
    setError(null);
    try {
      await changePlan(stripeId, effectiveTo, newPlan);
      setChangingClient(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to change plan.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-sm px-4 py-2.5 text-xs text-red-800">
          {error}
        </div>
      )}

      <div className="bg-white border border-[#dddddd] rounded-sm">
        {/* Toolbar */}
        <div className="px-4 py-3 border-b border-[#dddddd] space-y-2">
          <div className="flex items-center gap-3">
            <input
              type="search"
              placeholder="Search client, email, Stripe ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 max-w-xs text-sm border border-[#dddddd] rounded-sm px-3 py-1.5 outline-none focus:border-[#0170B9] transition-colors"
            />
            <span className="text-xs text-[#6b7280] ml-auto whitespace-nowrap">
              {filtered.length} of {initialClients.length} clients
            </span>
          </div>

          <div className="flex gap-1 flex-wrap items-center">
            <span className="text-xs text-[#6b7280] mr-1">Batch:</span>
            {BATCH_ORDER.map((b) => (
              <button
                key={b}
                onClick={() => setBatchFilter(b as BatchLabel | "ALL")}
                className={`text-xs px-2.5 py-1 rounded-sm border transition-colors ${
                  batchFilter === b
                    ? "bg-[#3a3a3a] text-white border-[#3a3a3a]"
                    : "bg-white text-[#4B4F58] border-[#dddddd] hover:border-[#3a3a3a]"
                }`}
              >
                {b === "ALL" ? "All" : b}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#dddddd] bg-[#F5F5F5]">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#6b7280] uppercase tracking-wide">Client</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#6b7280] uppercase tracking-wide">Plan</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#6b7280] uppercase tracking-wide">Type</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-[#6b7280] uppercase tracking-wide">Amount</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#6b7280] uppercase tracking-wide">Since</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-[#6b7280] text-sm">
                    No clients match your filter.
                  </td>
                </tr>
              )}
              {filtered.map((c, i) => {
                const plan = getActivePlan(c);
                const key  = c.stripe_id ?? c.primary_email;

                if (!plan) {
                  return (
                    <tr
                      key={key}
                      className={`border-b border-[#dddddd] last:border-0 ${i % 2 === 0 ? "" : "bg-[#fafafa]"}`}
                    >
                      <td className="px-4 py-3">
                        {c.stripe_id ? (
                          <Link href={`/client/${c.stripe_id}`} className="group">
                            <p className="font-medium text-[#3a3a3a] text-sm group-hover:text-[#0170B9] transition-colors">{c.display_name}</p>
                            <p className="text-xs text-[#6b7280]">{c.primary_email}</p>
                          </Link>
                        ) : (
                          <>
                            <p className="font-medium text-[#3a3a3a] text-sm">{c.display_name}</p>
                            <p className="text-xs text-[#6b7280]">{c.primary_email}</p>
                          </>
                        )}
                      </td>
                      <td colSpan={4} className="px-4 py-3 text-xs text-[#9ca3af] italic">
                        No billing plan configured
                      </td>
                      <td className="px-4 py-3" />
                    </tr>
                  );
                }

                const badge = PROJECTION_BADGES[plan.projection_type];

                return (
                  <tr
                    key={key}
                    className={`border-b border-[#dddddd] last:border-0 hover:bg-[#eef6ff] transition-colors ${
                      i % 2 === 0 ? "" : "bg-[#fafafa]"
                    }`}
                  >
                    {/* Client */}
                    <td className="px-4 py-3">
                      {c.stripe_id ? (
                        <Link href={`/client/${c.stripe_id}`} className="group">
                          <p className="font-medium text-[#3a3a3a] text-sm group-hover:text-[#0170B9] transition-colors">
                            {c.display_name}
                          </p>
                          <p className="text-xs text-[#6b7280]">{c.primary_email}</p>
                        </Link>
                      ) : (
                        <>
                          <p className="font-medium text-[#3a3a3a] text-sm">{c.display_name}</p>
                          <p className="text-xs text-[#6b7280]">{c.primary_email}</p>
                        </>
                      )}
                    </td>

                    {/* Plan name */}
                    <td className="px-4 py-3">
                      <p
                        className="text-sm text-[#3a3a3a] max-w-[220px] truncate"
                        title={plan.billing_plan}
                      >
                        {plan.billing_plan}
                      </p>
                      {plan.billing_pct > 0 && (
                        <p className="text-xs text-[#6b7280] mt-0.5">+{plan.billing_pct}% revenue</p>
                      )}
                    </td>

                    {/* Projection type */}
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 text-xs font-medium border rounded-sm ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    </td>

                    {/* Amount */}
                    <td className="px-4 py-3 text-right font-mono text-sm tabular-nums text-[#3a3a3a]">
                      {plan.projection_amount !== null
                        ? formatMoney(plan.projection_amount)
                        : <span className="text-[#6b7280]">—</span>}
                    </td>

                    {/* Effective from */}
                    <td className="px-4 py-3 text-xs text-[#6b7280]">
                      {plan.effective_from}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex gap-2 justify-end whitespace-nowrap">
                        <button
                          onClick={() => setEditingClient(c)}
                          disabled={saving}
                          className="text-xs px-3 py-1.5 border border-[#dddddd] rounded-sm text-[#4B4F58] hover:border-[#0170B9] hover:text-[#0170B9] transition-colors disabled:opacity-40"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setChangingClient(c)}
                          disabled={saving}
                          className="text-xs px-3 py-1.5 border border-[#dddddd] rounded-sm text-[#4B4F58] hover:border-[#3a3a3a] hover:text-[#3a3a3a] transition-colors disabled:opacity-40"
                        >
                          Change plan
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

      {/* Dialogs — only open when client has at least one plan */}
      {editingClient && editingClient.billing_plans.length > 0 && (
        <EditPlanDialog
          client={editingClient}
          saving={saving}
          onSave={(plan) => handleSavePlan(editingClient.stripe_id, plan)}
          onClose={() => setEditingClient(null)}
        />
      )}
      {changingClient && changingClient.billing_plans.length > 0 && (
        <ChangePlanDialog
          client={changingClient}
          saving={saving}
          onConfirm={(effectiveTo, newPlan) =>
            handleChangePlan(changingClient.stripe_id, effectiveTo, newPlan)
          }
          onClose={() => setChangingClient(null)}
        />
      )}
    </>
  );
}
