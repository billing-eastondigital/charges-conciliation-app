import Link from "next/link";
import { TrendingUp, TrendingDown, Users, ArrowRight } from "lucide-react";
import { clientDatabase, PERIODS } from "@/lib/mock";
import { monthly2026 } from "@/lib/mock/annual-2026";
import { cn } from "@/lib/utils";
import type { ClientRecord } from "@/lib/types";

// ── Derive won / churned per period ─────────────────────────────
const periodRows = PERIODS.map((p) => {
  const monthKey = p.start_date.slice(0, 7);
  const won = clientDatabase.filter(
    (c) => c.start_date && c.start_date >= p.start_date && c.start_date <= p.end_date
  );
  const churned = clientDatabase.filter((c) => c.deactivated_month === monthKey);
  const agg = monthly2026.find((m) => m.period_label === p.period_label);
  return { period: p, monthKey, won, churned, activeCount: agg?.client_count ?? null };
});

const allWon     = periodRows.flatMap((r) => r.won.map((c) => ({ client: c, period: r.period.period_label })));
const allChurned = periodRows.flatMap((r) => r.churned.map((c) => ({ client: c, period: r.period.period_label })));
const activeNow  = clientDatabase.filter((c) => c.is_active).length;
const netYtd     = allWon.length - allChurned.length;

// ── Sub-components ───────────────────────────────────────────────

function KpiCard({
  label, value, sub, accent,
}: { label: string; value: string | number; sub?: string; accent: string }) {
  return (
    <div className="bg-white border border-[#dddddd] rounded-sm p-4" style={{ borderTop: `3px solid ${accent}` }}>
      <p className="text-[11px] text-[#6b7280] uppercase tracking-wide mb-1">{label}</p>
      <p className="text-xl font-semibold text-[#3a3a3a] font-mono">{value}</p>
      {sub && <p className="text-[11px] text-[#9ca3af] mt-0.5">{sub}</p>}
    </div>
  );
}

function ClientCard({ client, period, type }: { client: ClientRecord; period: string; type: "won" | "churned" }) {
  const isWon = type === "won";
  const plan  = client.billing_plans[0];
  const href  = client.stripe_id ? `/client/${client.stripe_id}` : null;

  const nameEl = (
    <span className={cn("text-xs font-semibold text-[#3a3a3a]", href && "group-hover:text-[#0170B9] transition-colors")}>
      {client.display_name}
    </span>
  );

  return (
    <div className={cn(
      "border rounded-sm p-3 group",
      isWon ? "border-green-200 bg-green-50/40" : "border-red-200 bg-red-50/40"
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {href ? <Link href={href}>{nameEl}</Link> : nameEl}
          <p className="text-[10px] text-[#6b7280] mt-0.5 truncate">{client.primary_email}</p>
        </div>
        <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-[#F5F5F5] text-[#6b7280] border border-[#dddddd] shrink-0 font-medium">
          Batch {client.batch}
        </span>
      </div>

      <div className="mt-2 pt-2 border-t border-black/5 flex flex-wrap gap-x-4 gap-y-0.5">
        <span className="text-[10px] text-[#9ca3af]">
          {isWon ? "Started" : "Churned"}:{" "}
          <span className={cn("font-medium", isWon ? "text-green-700" : "text-red-700")}>
            {isWon ? client.start_date : client.deactivated_month}
          </span>
        </span>
        {plan && (
          <span className="text-[10px] text-[#9ca3af] truncate">
            Plan: <span className="text-[#4B4F58]">{plan.billing_plan}</span>
          </span>
        )}
        <span className="text-[10px] text-[#9ca3af]">
          Period: <span className="text-[#4B4F58]">{period}</span>
        </span>
      </div>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────

export default function ClientsHistoryPage() {
  return (
    <div className="px-6 py-6 space-y-6 max-w-[1200px]">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-[#3a3a3a]">Client History</h1>
        <p className="text-sm text-[#6b7280] mt-0.5">Won and churned clients by period — 2026 YTD</p>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Active Now"   value={activeNow}       accent="#0170B9" />
        <KpiCard label="Won YTD"      value={allWon.length}     accent="#16a34a"
          sub={allWon.length === 0 ? "none recorded" : `${allWon.length} client${allWon.length !== 1 ? "s" : ""}`} />
        <KpiCard label="Churned YTD"  value={allChurned.length} accent="#dc2626"
          sub={allChurned.length === 0 ? "none" : `${allChurned.length} client${allChurned.length !== 1 ? "s" : ""}`} />
        <KpiCard
          label="Net YTD"
          value={`${netYtd >= 0 ? "+" : ""}${netYtd}`}
          accent={netYtd > 0 ? "#16a34a" : netYtd < 0 ? "#dc2626" : "#6b7280"}
          sub="won minus churned"
        />
      </div>

      {/* Period timeline */}
      <div className="bg-white border border-[#dddddd] rounded-sm overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[#eeeeee] bg-[#fafafa]">
          <span className="text-xs font-semibold text-[#6b7280] uppercase tracking-wide">Period timeline</span>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#eeeeee] bg-[#F5F5F5]">
              <th className="text-left px-4 py-2.5 font-semibold text-[#6b7280] uppercase tracking-wide">Period</th>
              <th className="text-center px-4 py-2.5 font-semibold text-[#6b7280] uppercase tracking-wide">Active clients</th>
              <th className="text-center px-4 py-2.5 font-semibold text-green-700 uppercase tracking-wide">Won</th>
              <th className="text-center px-4 py-2.5 font-semibold text-red-700 uppercase tracking-wide">Churned</th>
              <th className="text-center px-4 py-2.5 font-semibold text-[#6b7280] uppercase tracking-wide">Net</th>
              <th className="text-left px-4 py-2.5 font-semibold text-[#6b7280] uppercase tracking-wide">Status</th>
            </tr>
          </thead>
          <tbody>
            {periodRows.map((r) => {
              const net = r.won.length - r.churned.length;
              return (
                <tr key={r.period.period_label} className="border-b border-[#eeeeee] last:border-0 hover:bg-[#fafafa]">
                  <td className="px-4 py-3 font-medium text-[#3a3a3a]">
                    <Link href={`/period/${encodeURIComponent(r.period.period_label)}`}
                      className="hover:text-[#0170B9] transition-colors flex items-center gap-1 group">
                      {r.period.period_label}
                      <ArrowRight size={11} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-center font-mono text-[#3a3a3a]">
                    {r.activeCount ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {r.won.length > 0 ? (
                      <span className="font-semibold text-green-600">+{r.won.length}</span>
                    ) : (
                      <span className="text-[#cccccc]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {r.churned.length > 0 ? (
                      <span className="font-semibold text-red-600">−{r.churned.length}</span>
                    ) : (
                      <span className="text-[#cccccc]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center font-semibold font-mono">
                    <span className={cn(
                      net > 0 ? "text-green-600" : net < 0 ? "text-red-600" : "text-[#9ca3af]"
                    )}>
                      {net > 0 ? `+${net}` : net < 0 ? `${net}` : "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {r.period.closed ? (
                      <span className="text-[10px] bg-green-100 text-green-700 border border-green-200 px-1.5 py-0.5 rounded-sm font-medium">Closed</span>
                    ) : (
                      <span className="text-[10px] bg-amber-100 text-amber-800 border border-amber-200 px-1.5 py-0.5 rounded-sm font-medium">Open</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Won & Churned panels side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Won */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={15} className="text-green-600" />
            <h2 className="text-sm font-semibold text-[#3a3a3a]">Won clients</h2>
            <span className="text-xs text-[#9ca3af]">· {allWon.length} YTD</span>
          </div>
          {allWon.length === 0 ? (
            <p className="text-xs text-[#9ca3af] border border-[#eeeeee] rounded-sm px-4 py-8 text-center">
              No new clients recorded in the selected periods.
            </p>
          ) : (
            <div className="space-y-2">
              {allWon.map(({ client, period }) => (
                <ClientCard
                  key={client.stripe_id ?? client.primary_email}
                  client={client}
                  period={period}
                  type="won"
                />
              ))}
            </div>
          )}
        </div>

        {/* Churned */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <TrendingDown size={15} className="text-red-600" />
            <h2 className="text-sm font-semibold text-[#3a3a3a]">Churned clients</h2>
            <span className="text-xs text-[#9ca3af]">· {allChurned.length} YTD</span>
          </div>
          {allChurned.length === 0 ? (
            <p className="text-xs text-[#9ca3af] border border-[#eeeeee] rounded-sm px-4 py-8 text-center">
              No churned clients recorded in the selected periods.
            </p>
          ) : (
            <div className="space-y-2">
              {allChurned.map(({ client, period }) => (
                <ClientCard
                  key={client.stripe_id ?? client.primary_email}
                  client={client}
                  period={period}
                  type="churned"
                />
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
