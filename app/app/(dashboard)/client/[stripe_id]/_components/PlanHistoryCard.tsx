import { formatMoney } from "@/lib/format";
import type { ClientBillingPlan, ProjectionType } from "@/lib/types";

const PROJECTION_LABELS: Record<ProjectionType, string> = {
  FIXED:       "Fixed",
  ROLLING_3:   "Rolling 3-month avg",
  ROLLING_6:   "Rolling 6-month avg",
  LAST_PERIOD: "Last period",
  MANUAL:      "Manual overrides",
};

interface Props {
  plans: ClientBillingPlan[];
}

export function PlanHistoryCard({ plans }: Props) {
  const active     = plans.find((p) => p.effective_to === null) ?? plans[plans.length - 1];
  const historical = plans.filter((p) => p !== active);

  return (
    <div className="bg-white border border-[#dddddd] rounded-sm">
      <div className="px-5 py-3.5 border-b border-[#dddddd]">
        <h2 className="text-sm font-semibold text-[#3a3a3a] uppercase tracking-wide">
          Billing Plan
        </h2>
      </div>

      {/* Active plan */}
      <div className="px-5 py-4 space-y-3">
        <div>
          <p className="text-sm font-semibold text-[#3a3a3a]">{active.billing_plan}</p>
          {active.billing_details && (
            <p className="text-xs text-[#4B4F58] mt-1.5 leading-relaxed">{active.billing_details}</p>
          )}
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
          <div>
            <dt className="text-[#6b7280] font-medium uppercase tracking-wide text-[10px]">Projection</dt>
            <dd className="text-[#3a3a3a] mt-0.5">{PROJECTION_LABELS[active.projection_type]}</dd>
          </div>
          {active.projection_amount !== null && (
            <div>
              <dt className="text-[#6b7280] font-medium uppercase tracking-wide text-[10px]">Base amount</dt>
              <dd className="text-[#3a3a3a] mt-0.5 font-mono">{formatMoney(active.projection_amount)}</dd>
            </div>
          )}
          {active.billing_pct > 0 && (
            <div>
              <dt className="text-[#6b7280] font-medium uppercase tracking-wide text-[10px]">Revenue %</dt>
              <dd className="text-[#3a3a3a] mt-0.5">{active.billing_pct}%</dd>
            </div>
          )}
          {active.billing_day !== null && (
            <div>
              <dt className="text-[#6b7280] font-medium uppercase tracking-wide text-[10px]">Billing day</dt>
              <dd className="text-[#3a3a3a] mt-0.5">Day {active.billing_day}</dd>
            </div>
          )}
          <div>
            <dt className="text-[#6b7280] font-medium uppercase tracking-wide text-[10px]">Effective from</dt>
            <dd className="text-[#3a3a3a] mt-0.5">{active.effective_from}</dd>
          </div>
          {active.effective_to && (
            <div>
              <dt className="text-[#6b7280] font-medium uppercase tracking-wide text-[10px]">Effective to</dt>
              <dd className="text-[#3a3a3a] mt-0.5">{active.effective_to}</dd>
            </div>
          )}
        </dl>

        {active.notes && (
          <div className={`text-xs px-3 py-2 rounded-sm border leading-relaxed ${
            active.notes.includes("⚠")
              ? "bg-amber-50 text-amber-800 border-amber-200"
              : "bg-[#F5F5F5] text-[#4B4F58] border-[#dddddd]"
          }`}>
            {active.notes}
          </div>
        )}
      </div>

      {/* Historical plans */}
      {historical.length > 0 && (
        <div className="border-t border-[#dddddd] px-5 py-4">
          <p className="text-xs font-semibold text-[#6b7280] uppercase tracking-wide mb-3">
            Previous Plans
          </p>
          <div className="space-y-2">
            {historical.map((p, i) => (
              <div key={i} className="text-xs">
                <p className="font-medium text-[#4B4F58]">{p.billing_plan}</p>
                <p className="text-[#6b7280] mt-0.5">
                  {p.effective_from} → {p.effective_to ?? "present"}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
