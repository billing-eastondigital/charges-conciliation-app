"use client";

import Link from "next/link";

interface PeriodTabsProps {
  periods: { label: string; count: number }[];
  activePeriod: string | null;
  total: number;
}

export function PeriodTabs({ periods, activePeriod, total }: PeriodTabsProps) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      <Link
        href="/exceptions"
        className={`text-xs px-3 py-1.5 rounded-sm border transition-colors ${
          !activePeriod
            ? "bg-[#0170B9] text-white border-[#0170B9]"
            : "border-[#dddddd] text-[#4B4F58] hover:border-[#0170B9] hover:text-[#0170B9]"
        }`}
      >
        All ({total})
      </Link>
      {periods.map((p) => (
        <Link
          key={p.label}
          href={`/exceptions?period=${encodeURIComponent(p.label)}`}
          className={`text-xs px-3 py-1.5 rounded-sm border transition-colors ${
            activePeriod === p.label
              ? "bg-[#0170B9] text-white border-[#0170B9]"
              : "border-[#dddddd] text-[#4B4F58] hover:border-[#0170B9] hover:text-[#0170B9]"
          }`}
        >
          {p.label} ({p.count})
        </Link>
      ))}
    </div>
  );
}
