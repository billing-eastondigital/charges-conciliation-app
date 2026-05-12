"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import type { ClientBillingPlan, ClientRecord, ProjectionType } from "@/lib/types";

interface Props {
  client: ClientRecord;
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

export function EditPlanDialog({ client, saving, onSave, onClose }: Props) {
  const current =
    client.billing_plans.find((p) => p.effective_to === null) ??
    client.billing_plans[client.billing_plans.length - 1];

  const [form, setForm] = useState<ClientBillingPlan>({ ...current });

  const update = (patch: Partial<ClientBillingPlan>) =>
    setForm((f) => ({ ...f, ...patch }));

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Billing Plan</DialogTitle>
          <p className="text-sm text-[#6b7280]">{client.display_name}</p>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <Field label="Plan name">
            <input
              className={inputClass}
              value={form.billing_plan}
              onChange={(e) => update({ billing_plan: e.target.value })}
            />
          </Field>

          <Field label="Billing details">
            <textarea
              className={`${inputClass} h-20 resize-none`}
              value={form.billing_details ?? ""}
              onChange={(e) => update({ billing_details: e.target.value || null })}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
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

            <Field label="Base amount ($)">
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

            <Field label="Revenue %">
              <input
                type="number"
                min="0"
                step="0.5"
                className={inputClass}
                value={form.billing_pct}
                onChange={(e) => update({ billing_pct: parseFloat(e.target.value) || 0 })}
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
            disabled={!form.billing_plan.trim() || saving}
            className="bg-[#0170B9] hover:bg-[#015fa0] text-white rounded-sm"
          >
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
