"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import type { BillingMethod, ClientBillingPlan, ClientRecord, ProjectionType } from "@/lib/types";

const TODAY = new Date().toISOString().split("T")[0];

const DEFAULT_PLAN: ClientBillingPlan = {
  billing_plan:       "",
  billing_details:    null,
  billing_method:     "AD_SPEND",
  billing_pct:        0,
  billing_percentage: 0,
  billing_day:        1,
  notes:              null,
  projection_type:    "FIXED",
  projection_amount:  null,
  manual_overrides:   {},
  effective_from:     TODAY,
  effective_to:       null,
};

interface Props {
  client: ClientRecord;
  /** When true, creates a new plan instead of editing the current one. */
  isNew?: boolean;
  saving?: boolean;
  onSave: (plan: ClientBillingPlan) => void;
  onClose: () => void;
}

const inputClass = "w-full text-sm border border-[#dddddd] rounded-sm px-3 py-1.5 outline-none focus:border-[#0170B9] transition-colors bg-white";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-[#3a3a3a] uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}

export function EditPlanDialog({ client, isNew, saving, onSave, onClose }: Props) {
  const current = isNew ? null : (
    client.billing_plans.find((p) => p.effective_to === null) ??
    client.billing_plans[client.billing_plans.length - 1] ??
    null
  );

  const [form, setForm] = useState<ClientBillingPlan>(current ? { ...current } : { ...DEFAULT_PLAN });

  const update = (patch: Partial<ClientBillingPlan>) =>
    setForm((f) => ({ ...f, ...patch }));

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{isNew ? "Set Up Billing Plan" : "Edit Billing Plan"}</DialogTitle>
          <p className="text-sm text-[#6b7280]">{client.display_name}</p>
        </DialogHeader>

        <div className="space-y-4 py-2 overflow-y-auto flex-1 pr-1">
          <Field label="Plan name">
            <input
              className={inputClass}
              value={form.billing_plan}
              onChange={(e) => update({ billing_plan: e.target.value })}
            />
          </Field>

          <Field label="Billing method">
            <Select
              value={form.billing_method}
              onValueChange={(v) => update({ billing_method: v as BillingMethod })}
            >
              <SelectTrigger className="h-8 text-sm rounded-sm border-[#dddddd]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="AD_SPEND">Ad Spend — imported from billing sheet</SelectItem>
                <SelectItem value="SUBSCRIPTION">Subscription — auto-generated each period</SelectItem>
                <SelectItem value="ADS_REVENUE">Ads Revenue — base fee + % of Google revenue</SelectItem>
                <SelectItem value="ADS_COST">Ads Cost — base fee + % of Google spend</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field label="Billing details">
            <textarea
              className={`${inputClass} h-20 resize-none`}
              value={form.billing_details ?? ""}
              onChange={(e) => update({ billing_details: e.target.value || null })}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            {isNew && (
              <Field label="Effective from">
                <input
                  type="date"
                  className={inputClass}
                  value={form.effective_from}
                  onChange={(e) => update({ effective_from: e.target.value })}
                />
              </Field>
            )}

            <Field label="Projection type">
              <Select
                value={form.projection_type}
                onValueChange={(v) => update({ projection_type: v as ProjectionType })}
              >
                <SelectTrigger className="h-8 text-sm rounded-sm border-[#dddddd]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FIXED">Fixed</SelectItem>
                  <SelectItem value="ROLLING_3">Rolling 3-month avg</SelectItem>
                  <SelectItem value="ROLLING_6">Rolling 6-month avg</SelectItem>
                  <SelectItem value="LAST_PERIOD">Last period</SelectItem>
                  <SelectItem value="MANUAL">Manual overrides</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field label="Base amount / flat fee ($)">
              <input
                type="number"
                min="0"
                step="0.01"
                className={inputClass}
                value={form.projection_amount ?? ""}
                onChange={(e) =>
                  update({ projection_amount: e.target.value ? parseFloat(e.target.value) : null })
                }
              />
            </Field>

            {["ADS_REVENUE", "ADS_COST"].includes(form.billing_method) && (
              <Field label="Base fee ($) — added on top of % component">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className={inputClass}
                  value={(form as { base_fee?: number }).base_fee ?? ""}
                  onChange={(e) =>
                    update({ ...(e.target.value ? { base_fee: parseFloat(e.target.value) } : { base_fee: 0 }) } as Partial<ClientBillingPlan>)
                  }
                />
              </Field>
            )}

            <Field label={`Revenue % ${["ADS_REVENUE","ADS_COST"].includes(form.billing_method) ? "(e.g. 2 for 2%)" : ""}`}>
              <input
                type="number"
                min="0"
                step="0.01"
                className={inputClass}
                value={
                  ["ADS_REVENUE", "ADS_COST"].includes(form.billing_method)
                    ? ((form.billing_percentage ?? 0) * 100).toFixed(2)
                    : form.billing_pct
                }
                onChange={(e) => {
                  const raw = parseFloat(e.target.value) || 0;
                  if (["ADS_REVENUE", "ADS_COST"].includes(form.billing_method)) {
                    update({ billing_percentage: raw / 100, billing_pct: raw });
                  } else {
                    update({ billing_pct: raw });
                  }
                }}
              />
            </Field>

            <Field label="Billing day">
              <input
                type="number"
                min="1"
                max="31"
                className={inputClass}
                value={form.billing_day ?? ""}
                onChange={(e) =>
                  update({ billing_day: e.target.value ? parseInt(e.target.value) : null })
                }
              />
            </Field>
          </div>

          {["ADS_REVENUE", "ADS_COST"].includes(form.billing_method) && (
            <div className="border border-[#dddddd] rounded-sm p-3 space-y-3 bg-[#fafafa]">
              <p className="text-xs font-medium text-[#6b7280] uppercase tracking-wide">Subscription Add-on (billed separately)</p>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Amount ($)">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="e.g. 475"
                    className={inputClass}
                    value={(form as { addon_subscription_amount?: number | null }).addon_subscription_amount ?? ""}
                    onChange={(e) =>
                      update({ addon_subscription_amount: e.target.value ? parseFloat(e.target.value) : null } as Partial<ClientBillingPlan>)
                    }
                  />
                </Field>
                <Field label="Label">
                  <input
                    className={inputClass}
                    placeholder="e.g. Amazon Services"
                    value={(form as { addon_subscription_label?: string | null }).addon_subscription_label ?? ""}
                    onChange={(e) =>
                      update({ addon_subscription_label: e.target.value || null } as Partial<ClientBillingPlan>)
                    }
                  />
                </Field>
              </div>
            </div>
          )}

          <Field label="Notes">
            <textarea
              className={`${inputClass} h-16 resize-none`}
              value={form.notes ?? ""}
              onChange={(e) => update({ notes: e.target.value || null })}
            />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => onSave(form)}
            disabled={saving}
            className="bg-[#0170B9] hover:bg-[#015fa0] text-white rounded-sm"
          >
            {saving ? "Saving…" : isNew ? "Add plan" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
