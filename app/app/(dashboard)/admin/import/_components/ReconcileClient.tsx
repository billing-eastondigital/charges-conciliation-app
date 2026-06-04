"use client";

import { useState } from "react";
import { Play, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

interface Props {
  periods: { period_label: string; is_closed: boolean }[];
  supabaseFunctionsUrl: string;
  supabaseAnonKey: string;
}

interface RunResult {
  ok: boolean;
  period_label: string;
  run_id: number;
  total_results: number;
  total_exceptions: number;
  counts: Record<string, number>;
  totals: { expected: string; collected: string; variance: string };
}

export default function ReconcileClient({ periods, supabaseFunctionsUrl, supabaseAnonKey }: Props) {
  const openPeriods = periods.filter((p) => !p.is_closed);
  const [selectedPeriod, setSelectedPeriod] = useState(openPeriods[0]?.period_label ?? periods[0]?.period_label ?? "");
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [result, setResult] = useState<RunResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function runReconciliation() {
    if (!selectedPeriod) return;
    setStatus("running");
    setResult(null);
    setErrorMsg(null);

    try {
      const res = await fetch(`${supabaseFunctionsUrl}/reconcile-period`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": supabaseAnonKey,
          "Authorization": `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({ period_label: selectedPeriod }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setErrorMsg(data.error ?? `HTTP ${res.status}`);
        setStatus("error");
        return;
      }

      setResult(data as RunResult);
      setStatus("done");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }

  const fmt = (n: string) => {
    const num = parseFloat(n);
    return isNaN(num) ? n : `$${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="border border-[#dddddd] rounded-sm">
      {/* Controls */}
      <div className="px-5 py-4 flex items-end gap-3 flex-wrap">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-[#6b7280]">Period</label>
          <select
            value={selectedPeriod}
            onChange={(e) => { setSelectedPeriod(e.target.value); setStatus("idle"); setResult(null); setErrorMsg(null); }}
            disabled={status === "running"}
            className="px-3 py-1.5 text-sm border border-[#dddddd] rounded-[2px] bg-white text-[#3a3a3a] focus:outline-none focus:border-[#0170B9] disabled:opacity-50"
          >
            {periods.map((p) => (
              <option key={p.period_label} value={p.period_label}>
                {p.period_label}{p.is_closed ? " (closed)" : ""}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={runReconciliation}
          disabled={status === "running" || !selectedPeriod || periods.find((p) => p.period_label === selectedPeriod)?.is_closed}
          className="flex items-center gap-2 px-4 py-1.5 text-sm font-medium bg-[#0170B9] text-white rounded-[2px] hover:bg-[#015fa0] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {status === "running" ? (
            <><Loader2 size={14} className="animate-spin" /> Running…</>
          ) : (
            <><Play size={14} /> Run Reconciliation</>
          )}
        </button>

        {periods.find((p) => p.period_label === selectedPeriod)?.is_closed && (
          <p className="text-xs text-[#9ca3af]">Closed periods cannot be re-reconciled.</p>
        )}
      </div>

      {/* Result */}
      {status === "done" && result && (
        <div className="border-t border-[#dddddd] px-5 py-4 bg-green-50">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 size={15} className="text-green-600 shrink-0" />
            <span className="text-sm font-semibold text-green-800">
              Reconciliation complete — Run #{result.run_id}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-4 mb-3 text-sm">
            <div>
              <p className="text-xs text-[#6b7280] uppercase tracking-wide">Expected</p>
              <p className="font-mono font-semibold text-[#3a3a3a]">{fmt(result.totals.expected)}</p>
            </div>
            <div>
              <p className="text-xs text-[#6b7280] uppercase tracking-wide">Collected</p>
              <p className="font-mono font-semibold text-[#3a3a3a]">{fmt(result.totals.collected)}</p>
            </div>
            <div>
              <p className="text-xs text-[#6b7280] uppercase tracking-wide">Variance</p>
              <p className={`font-mono font-semibold ${parseFloat(result.totals.variance) < 0 ? "text-red-600" : "text-[#3a3a3a]"}`}>
                {fmt(result.totals.variance)}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {Object.entries(result.counts).sort().map(([status, count]) => (
              <span key={status} className="px-2 py-0.5 bg-white border border-[#dddddd] rounded text-[#4B4F58]">
                {status}: {count}
              </span>
            ))}
          </div>
          <p className="text-xs text-[#9ca3af] mt-2">
            {result.total_results} results · {result.total_exceptions} exceptions opened
          </p>
        </div>
      )}

      {status === "error" && (
        <div className="border-t border-[#dddddd] px-5 py-4 bg-red-50 flex items-start gap-2">
          <AlertCircle size={15} className="text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{errorMsg}</p>
        </div>
      )}
    </div>
  );
}
