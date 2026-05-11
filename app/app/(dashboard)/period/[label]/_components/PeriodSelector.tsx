"use client";

import { useRouter } from "next/navigation";

interface Period {
  period_label: string;
  closed: boolean;
}

interface Props {
  periods: Period[];
  current: string;
}

export function PeriodSelector({ periods, current }: Props) {
  const router = useRouter();

  return (
    <select
      value={current}
      onChange={(e) => router.push(`/period/${encodeURIComponent(e.target.value)}`)}
      className="px-3 py-1.5 text-sm border border-[#dddddd] rounded-[2px] focus:outline-none focus:border-[#0170B9] bg-white text-[#3a3a3a]"
    >
      {periods.map((p) => (
        <option key={p.period_label} value={p.period_label}>
          {p.period_label}{p.closed ? " ✓" : ""}
        </option>
      ))}
    </select>
  );
}
