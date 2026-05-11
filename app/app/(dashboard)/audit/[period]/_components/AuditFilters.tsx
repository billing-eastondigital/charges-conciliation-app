"use client";

import { useRouter } from "next/navigation";
import { useRef } from "react";
import { Search, X } from "lucide-react";

interface Props {
  periods: { period_label: string }[];
  currentPeriod: string;
  currentQ: string;
}

export function AuditFilters({ periods, currentPeriod, currentQ }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  function handlePeriodChange(e: React.ChangeEvent<HTMLSelectElement>) {
    router.push(`/audit/${encodeURIComponent(e.target.value)}`);
  }

  function handleSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = inputRef.current?.value.trim() ?? "";
    const base = `/audit/${encodeURIComponent(currentPeriod)}`;
    router.push(q ? `${base}?q=${encodeURIComponent(q)}` : base);
  }

  function handleClear() {
    if (inputRef.current) inputRef.current.value = "";
    router.push(`/audit/${encodeURIComponent(currentPeriod)}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-3 print:hidden">
      <div className="flex items-center gap-2">
        <label className="text-xs text-[#6b7280] font-medium shrink-0">Period</label>
        <select
          defaultValue={currentPeriod}
          onChange={handlePeriodChange}
          className="text-sm border border-[#dddddd] rounded-sm px-2.5 py-1.5 bg-white text-[#3a3a3a] focus:outline-none focus:border-[#0170B9] cursor-pointer"
        >
          {periods.map((p) => (
            <option key={p.period_label} value={p.period_label}>
              {p.period_label}
            </option>
          ))}
        </select>
      </div>

      <form onSubmit={handleSearch} className="flex items-center gap-2 flex-1 min-w-[280px]">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9ca3af]" />
          <input
            ref={inputRef}
            defaultValue={currentQ}
            placeholder="Filter by client, email, or Stripe ID…"
            className="w-full text-sm border border-[#dddddd] rounded-sm pl-7 pr-3 py-1.5 bg-white text-[#3a3a3a] placeholder:text-[#9ca3af] focus:outline-none focus:border-[#0170B9]"
          />
        </div>
        <button
          type="submit"
          className="text-xs px-3 py-1.5 bg-[#0170B9] text-white rounded-sm hover:bg-[#015fa0] transition-colors shrink-0"
        >
          Filter
        </button>
        {currentQ && (
          <button
            type="button"
            onClick={handleClear}
            className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 border border-[#dddddd] rounded-sm text-[#4B4F58] hover:border-[#0170B9] hover:text-[#0170B9] transition-colors shrink-0"
          >
            <X size={11} />
            Clear
          </button>
        )}
      </form>
    </div>
  );
}
