"use client";

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { formatMoney } from "@/lib/format";
import type { MonthlyAggregate } from "@/lib/mock/annual-2026";

interface AnnualChartProps {
  data: MonthlyAggregate[];
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const exp = payload.find((p: any) => p.dataKey === "expected")?.value ?? 0;
  const col = payload.find((p: any) => p.dataKey === "collected")?.value ?? 0;
  const variance = col - exp;

  return (
    <div className="bg-white border border-[#dddddd] rounded-sm shadow-md px-4 py-3 text-sm min-w-[200px]">
      <p className="font-semibold text-[#3a3a3a] mb-2">{label}</p>
      <div className="space-y-1">
        <div className="flex justify-between gap-6">
          <span className="text-[#6b7280]">Expected</span>
          <span className="font-mono font-medium">{formatMoney(exp)}</span>
        </div>
        <div className="flex justify-between gap-6">
          <span className="text-[#6b7280]">Collected</span>
          <span className="font-mono font-medium text-[#0170B9]">{formatMoney(col)}</span>
        </div>
        <div className="border-t border-[#dddddd] pt-1 mt-1 flex justify-between gap-6">
          <span className="text-[#6b7280]">Variance</span>
          <div className="text-right">
            <span className={`font-mono font-semibold ${variance >= 0 ? "text-green-700" : "text-red-700"}`}>
              {variance >= 0 ? "+" : ""}{formatMoney(variance)}
            </span>
            {exp > 0 && (
              <div className={`text-[11px] font-mono ${variance >= 0 ? "text-green-700" : "text-red-700"}`}>
                {variance >= 0 ? "+" : ""}{((variance / exp) * 100).toFixed(2)}%
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AnnualChart({ data }: AnnualChartProps) {
  const chartData = data.map((m) => ({
    name:      m.month_short,
    expected:  m.expected,
    collected: m.collected,
    variance:  m.variance,
    closed:    m.closed,
  }));

  return (
    <div className="bg-white border border-[#dddddd] rounded-sm p-5">
      <h2 className="text-sm font-semibold text-[#3a3a3a] uppercase tracking-wide mb-4">
        Expected vs Collected — Monthly
      </h2>
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 24, left: 16, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eeeeee" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 12, fill: "#6b7280" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
            tick={{ fontSize: 11, fill: "#6b7280" }}
            axisLine={false}
            tickLine={false}
            width={52}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: 12, color: "#6b7280", paddingTop: 12 }}
            formatter={(value) => value === "expected" ? "Expected" : value === "collected" ? "Collected" : "Variance"}
          />
          <ReferenceLine y={0} stroke="#dddddd" />

          <Bar dataKey="expected"  name="expected"  fill="#e5e7eb" radius={[2, 2, 0, 0]} maxBarSize={40} />
          <Bar dataKey="collected" name="collected" fill="#0170B9" radius={[2, 2, 0, 0]} maxBarSize={40} />
          <Line
            dataKey="variance"
            name="variance"
            type="monotone"
            stroke="#d97706"
            strokeWidth={2}
            dot={{ fill: "#d97706", r: 4, strokeWidth: 0 }}
            activeDot={{ r: 6 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
