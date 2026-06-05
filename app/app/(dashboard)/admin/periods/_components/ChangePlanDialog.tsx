"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import type { BillingMethod, ClientBillingPlan, ClientRecord, ProjectionType } from "@/lib/types";

interface Props {
  client: ClientRecord;
  saving?: boolean;
  onConfirm: (effectiveTo: string, newPlan: ClientBillingPlan) => void;
  onClose: () => void;
}

const TODAY = new Date().toISOString().split("T")[0];

const inputClass = "w-full text-sm border border-[#dddddd] rounded-sm px-3 py-1.5 outline-none focus:border-[#0170B9] transition-colors bg-white";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-[#3a3a3a] uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}

export function ChangePlanDialog({ client, saving, onConfirm, onClose }: Props) {
  const current =
    client.billing_plans.find((p) => p.effective_to === null) ??
    client.billing_plans[client.billing_plans.length - 1];

  const [effectiveDate, setEffectiveDate] = useState(TODAY);
  const [newPlan, setNewPlan] = useState<ClientBillingPlan>({
    billing_plan:      "",
    billing_details:   null,
    billing_method:    current.billing_method ?? "AD_SPEND",
    billing_pct:       0,
    billing_day:       current.billing_day,
    notes:             null,
    projection_type:   "FIXED",
    projection_amount: null,
    manual_overrides:  {},
    effective_from:    TODAY,
    effective_to:      null,
  });

  const update = (patch: Partial<ClientBillingPlan>) =>
    setNewPlan((f) => ({ ...f, ...patch }));

  function handleConfirm() {
    if (!newPlan.billing_plan.trim()) return;
    onConfirm(effectiveDate, { ...newPlan, effective_from: effectiveDate });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Change Billing Plan</DialogTitle>
          <p className="text-sm text-[#6b7280]">{client.display_name}</p>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Current plan */}
          <div className="bg-[#F5F5F5] border border-[#dddddd] rounded-sm px-4 py-3">
            <p className="text-xs font-semibold text-[#6b7280] uppercase tracking-wide mb-1">
              Closing plan
            </p>
            <p className="text-sm font-medium text-[#3a3a3a]">{current.billing_plan}</p>
            <p className="text-xs text-[#6b7280] mt-0.5">Active since {current.effective_from}</p>
          </div>

          {/* Transition date */}
          <Field label="Transition date — current plan closes, new plan starts">
            <input
              type="date"
              className={inputClass}
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
            />
          </Field>

          {/* New plan */}
          <div className="border-t border-[#dddddd] pt-5 space-y-4">
            <p className="text-xs font-semibold text-[#6b7280] uppercase tracking-wide">
              New Plan
            </p>

            <Field label="Plan name *">
              <input
                className={inputClass}
                placeholder="e.g. Google Growth Plan"
                value={newPlan.billing_plan}
                onChange={(e) => update({ billing_plan: e.target.value })}
              />
            </Field>

            <Field label="Billing method">
              <Select
                value={newPlan.billing_method}
                onValueChange={(v) => update({ billing_method: v as BillingMethod })}
              >
                <SelectTrigger className="h-8 text-sm rounded-sm border-[#dddddd]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AD_SPEND">Ad Spend — imported from billing sheet</SelectItem>
                  <SelectItem value="SUBSCRIPTION">Subscription — auto-generated each period</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field label="Billing details">
              <textarea
                className={`${inputClass} h-20 resize-none`}
                value={newPlan.billing_details ?? ""}
                onChange={(e) => update({ billing_details: e.target.value || null })}
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Projection type">
                <Select
                  value={newPlan.projection_type}
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

              <Field label="Base amount ($)">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className={inputClass}
                  value={newPlan.projection_amount ?? ""}
                  onChange={(e) =>
                    update({ projection_amount: e.target.value ? parseFloat(e.target.value) : null })
                  }
                />
              </Field>

              <Field label="Revenue %">
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  className={inputClass}
                  value={newPlan.billing_pct}
                  onChange={(e) => update({ billing_pct: parseFloat(e.target.value) || 0 })}
                />
              </Field>

              <Field label="Billing day">
                <input
                  type="number"
                  min="1"
                  max="31"
                  className={inputClass}
                  value={newPlan.billing_day ?? ""}
                  onChange={(e) =>
                    update({ billing_day: e.target.value ? parseInt(e.target.value) : null })
                  }
                />
              </Field>
            </div>

            <Field label="Notes">
              <textarea
                className={`${inputClass} h-16 resize-none`}
                value={newPlan.notes ?? ""}
                onChange={(e) => update({ notes: e.target.value || null })}
              />
            </Field>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!newPlan.billing_plan.trim() || saving}
            className="bg-[#0170B9] hover:bg-[#015fa0] text-white rounded-sm"
          >
            {saving ? "Applying…" : "Apply plan change"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
