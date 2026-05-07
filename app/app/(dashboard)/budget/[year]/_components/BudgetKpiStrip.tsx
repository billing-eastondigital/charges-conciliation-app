import { formatMoney } from "@/lib/format";

interface BudgetKpis {
  full_year_projected: number;
  ytd_projected: number;
  ytd_actual: number;
  ytd_delta: number;
  next_month_projected: number;
  active_clients: number;
  churned_clients: number;
}

interface BudgetKpiStripProps {
  kpis: BudgetKpis;
  year: number;
}

export function BudgetKpiStrip({ kpis, year }: BudgetKpiStripProps) {
  const deltaPos = kpis.ytd_delta > 0.005;
  const deltaNeg = kpis.ytd_delta < -0.005;

  const cards = [
    {
      label: `${year} Full Year Projected`,
      value: formatMoney(kpis.full_year_projected),
      valueClass: "text-[#3a3a3a]",
      accent: "#0170B9",
    },
    {
      label: "YTD Projected",
      value: formatMoney(kpis.ytd_projected),
      valueClass: "text-[#3a3a3a]",
      accent: "#6b7280",
    },
    {
      label: "YTD Actual",
      value: formatMoney(kpis.ytd_actual),
      valueClass: "text-[#0170B9]",
      accent: "#0170B9",
    },
    {
      label: "YTD Delta",
      value: `${deltaPos ? "+" : ""}${formatMoney(kpis.ytd_delta)}`,
      valueClass: deltaNeg ? "text-red-700" : deltaPos ? "text-green-700" : "text-[#6b7280]",
      accent: deltaNeg ? "#b91c1c" : deltaPos ? "#15803d" : "#6b7280",
    },
    {
      label: "Next Month Projected",
      value: formatMoney(kpis.next_month_projected),
      valueClass: "text-[#3a3a3a]",
      accent: "#d97706",
    },
    {
      label: "Active Clients",
      value: kpis.active_clients.toString(),
      sub: kpis.churned_clients > 0 ? `${kpis.churned_clients} churned` : undefined,
      valueClass: "text-[#3a3a3a]",
      accent: "#3a3a3a",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {cards.map((c) => (
        <div
          key={c.label}
          className="bg-white border border-[#dddddd] rounded-sm p-4"
          style={{ borderTop: `3px solid ${c.accent}` }}
        >
          <p className="text-[11px] text-[#6b7280] uppercase tracking-wide mb-1 leading-tight">{c.label}</p>
          <p className={`text-base font-semibold font-mono ${c.valueClass}`}>{c.value}</p>
          {c.sub && <p className="text-[11px] text-red-600 mt-0.5">{c.sub}</p>}
        </div>
      ))}
    </div>
  );
}
