import Link from "next/link";
import { formatMoney } from "@/lib/format";
import type { MonthlyAggregate } from "@/lib/mock/annual-2026";

interface MonthlyTableProps {
  data: MonthlyAggregate[];
}

export function MonthlyTable({ data }: MonthlyTableProps) {
  const totalExp = data.reduce((s, m) => s + m.expected, 0);
  const totalCol = data.reduce((s, m) => s + m.collected, 0);
  const totalVar = data.reduce((s, m) => s + m.variance, 0);

  return (
    <div className="bg-white border border-[#dddddd] rounded-sm">
      <div className="px-4 py-3 border-b border-[#dddddd]">
        <h2 className="text-sm font-semibold text-[#3a3a3a] uppercase tracking-wide">
          Monthly Breakdown
        </h2>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#dddddd] bg-[#F5F5F5]">
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#6b7280] uppercase tracking-wide">Period</th>
            <th className="text-center px-4 py-2.5 text-xs font-semibold text-[#6b7280] uppercase tracking-wide">Status</th>
            <th className="text-right px-4 py-2.5 text-xs font-semibold text-[#6b7280] uppercase tracking-wide">Clients</th>
            <th className="text-right px-4 py-2.5 text-xs font-semibold text-[#6b7280] uppercase tracking-wide">Exceptions</th>
            <th className="text-right px-4 py-2.5 text-xs font-semibold text-[#6b7280] uppercase tracking-wide">Expected</th>
            <th className="text-right px-4 py-2.5 text-xs font-semibold text-[#6b7280] uppercase tracking-wide">Collected</th>
            <th className="text-right px-4 py-2.5 text-xs font-semibold text-[#6b7280] uppercase tracking-wide">Variance</th>
          </tr>
        </thead>
        <tbody>
          {data.map((m) => {
            const varNeg = m.variance < -0.005;
            const varPos = m.variance > 0.005;
            return (
              <tr key={m.period_label} className="border-b border-[#dddddd] last:border-0 hover:bg-[#eef6ff] transition-colors">
                <td className="px-4 py-3">
                  <Link
                    href={`/period/${encodeURIComponent(m.period_label)}`}
                    className="font-medium text-[#0170B9] hover:underline"
                  >
                    {m.period_label}
                  </Link>
                </td>
                <td className="px-4 py-3 text-center">
                  {m.closed ? (
                    <span className="text-xs px-2 py-0.5 bg-green-100 text-green-800 border border-green-200 rounded-sm">Closed</span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-800 border border-amber-200 rounded-sm">Open</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-[#3a3a3a]">{m.client_count}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  <span className={m.exception_count > 0 ? "text-red-700 font-medium" : "text-[#6b7280]"}>
                    {m.exception_count}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums text-[#3a3a3a]">
                  {formatMoney(m.expected)}
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums text-[#0170B9] font-medium">
                  {formatMoney(m.collected)}
                </td>
                <td className={`px-4 py-3 text-right font-mono tabular-nums font-semibold ${
                  varNeg ? "text-red-700" : varPos ? "text-green-700" : "text-[#6b7280]"
                }`}>
                  {m.variance > 0.005 ? "+" : ""}{formatMoney(m.variance)}
                  {m.expected > 0 && (
                    <div className="text-[10px] font-normal leading-tight">
                      {m.variance >= 0 ? "+" : ""}{((m.variance / m.expected) * 100).toFixed(2)}%
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-[#dddddd] bg-[#F5F5F5] font-semibold">
            <td className="px-4 py-2.5 text-xs text-[#6b7280] uppercase tracking-wide" colSpan={4}>
              YTD Total
            </td>
            <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[#3a3a3a]">
              {formatMoney(totalExp)}
            </td>
            <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[#0170B9]">
              {formatMoney(totalCol)}
            </td>
            <td className={`px-4 py-2.5 text-right font-mono tabular-nums font-semibold ${
              totalVar < -0.005 ? "text-red-700" : "text-green-700"
            }`}>
              {totalVar > 0.005 ? "+" : ""}{formatMoney(totalVar)}
              {totalExp > 0 && (
                <div className="text-[10px] font-normal leading-tight">
                  {totalVar >= 0 ? "+" : ""}{((totalVar / totalExp) * 100).toFixed(2)}%
                </div>
              )}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
