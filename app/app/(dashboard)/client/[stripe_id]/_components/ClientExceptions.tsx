import { StatusBadge } from "@/components/shared/StatusBadge";
import { VarianceCell } from "@/components/shared/MoneyCell";
import type { Exception } from "@/lib/types";

interface Props {
  exceptions: Exception[];
}

export function ClientExceptions({ exceptions }: Props) {
  return (
    <div className="bg-white border border-[#dddddd] rounded-sm">
      <div className="px-5 py-3.5 border-b border-[#dddddd]">
        <h2 className="text-sm font-semibold text-[#3a3a3a] uppercase tracking-wide">
          Open Exceptions
        </h2>
      </div>
      <div className="divide-y divide-[#dddddd]">
        {exceptions.map((e) => (
          <div key={e.id} className="px-5 py-4 flex items-start gap-4">
            <div className="pt-0.5 shrink-0">
              <StatusBadge status={e.reconciliation_status} />
            </div>
            <div className="flex-1 min-w-0">
              {e.notes && (
                <p className="text-xs text-[#4B4F58] leading-relaxed">{e.notes}</p>
              )}
              <p className="text-xs text-[#6b7280] mt-1">{e.period_label}</p>
            </div>
            <div className="shrink-0 text-right">
              <VarianceCell variance={e.variance} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
