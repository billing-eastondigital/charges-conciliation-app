import { StatusBadge } from "@/components/shared/StatusBadge";
import { MoneyCell, VarianceCell } from "@/components/shared/MoneyCell";
import type { ReconciliationResult } from "@/lib/types";

interface Props {
  results: ReconciliationResult[];
}

export function ReconHistoryTable({ results }: Props) {
  return (
    <div className="bg-white border border-[#dddddd] rounded-sm">
      <div className="px-5 py-3.5 border-b border-[#dddddd]">
        <h2 className="text-sm font-semibold text-[#3a3a3a] uppercase tracking-wide">
          Reconciliation History
        </h2>
      </div>

      {results.length === 0 ? (
        <p className="px-5 py-6 text-sm text-[#6b7280]">
          No reconciliation data for this client.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#dddddd] bg-[#F5F5F5]">
              <th className="text-left px-5 py-2.5 text-xs font-semibold text-[#6b7280] uppercase tracking-wide">Period</th>
              <th className="text-left px-5 py-2.5 text-xs font-semibold text-[#6b7280] uppercase tracking-wide">Status</th>
              <th className="text-right px-5 py-2.5 text-xs font-semibold text-[#6b7280] uppercase tracking-wide">Expected</th>
              <th className="text-right px-5 py-2.5 text-xs font-semibold text-[#6b7280] uppercase tracking-wide">Collected</th>
              <th className="text-right px-5 py-2.5 text-xs font-semibold text-[#6b7280] uppercase tracking-wide">Variance</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => (
              <tr key={r.id} className="border-b border-[#dddddd] last:border-0 hover:bg-[#fafafa]">
                <td className="px-5 py-3">
                  <p className="text-[#3a3a3a]">{r.period_label}</p>
                  {r.constituent_accounts.length > 1 && (
                    <p className="text-xs text-[#6b7280] mt-0.5">
                      {r.constituent_accounts.join(" · ")}
                    </p>
                  )}
                </td>
                <td className="px-5 py-3">
                  <StatusBadge status={r.status} />
                </td>
                <td className="px-5 py-3 text-right">
                  <MoneyCell amount={r.expected_amount} />
                </td>
                <td className="px-5 py-3 text-right">
                  <MoneyCell amount={r.collected_amount} />
                </td>
                <td className="px-5 py-3 text-right">
                  <VarianceCell variance={r.variance} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
