"use client";

import { useState } from "react";
import { RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";

type SyncState = "idle" | "syncing" | "done" | "error";
type Account = "both" | "main" | "launch";

interface AccountSummary {
  inserted: number;
  skipped: boolean;
  reason?: string;
  new_clients?: number;
}

interface SyncResult {
  total_inserted: number;
  accounts: Record<string, AccountSummary>;
}

interface Props {
  periods: { period_label: string; is_closed: boolean }[];
  supabaseFunctionsUrl: string;
  supabaseAnonKey: string;
}

export default function StripeImportClient({
  periods,
  supabaseFunctionsUrl,
  supabaseAnonKey,
}: Props) {
  const [selectedPeriod, setSelectedPeriod] = useState(
    periods.find((p) => !p.is_closed)?.period_label ?? periods[0]?.period_label ?? "",
  );
  const [account, setAccount] = useState<Account>("both");
  const [state, setState] = useState<SyncState>("idle");
  const [result, setResult] = useState<SyncResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSync = async () => {
    if (!selectedPeriod) return;
    setState("syncing");
    setErrorMsg(null);
    setResult(null);

    try {
      const res = await fetch(`${supabaseFunctionsUrl}/ingest-stripe`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseAnonKey}`,
          "apikey": supabaseAnonKey,
        },
        body: JSON.stringify({ period_label: selectedPeriod, account }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Sync failed");
      setResult(data as SyncResult);
      setState("done");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Sync failed");
      setState("error");
    }
  };

  return (
    <div className="space-y-4">
      {/* Selectors + button */}
      <div className="bg-white border border-[#dddddd] rounded-sm px-5 py-4 flex flex-wrap gap-5 items-end">
        <div>
          <label className="block text-xs font-semibold text-[#6b7280] uppercase tracking-wide mb-2">
            Target period
          </label>
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            disabled={state === "syncing"}
            className="text-sm border border-[#dddddd] rounded-sm px-3 py-2 bg-white text-[#3a3a3a] focus:outline-none focus:border-[#0170B9] disabled:opacity-50"
          >
            {periods.map((p) => (
              <option key={p.period_label} value={p.period_label} disabled={p.is_closed}>
                {p.period_label}
                {p.is_closed ? " (closed)" : ""}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#6b7280] uppercase tracking-wide mb-2">
            Stripe account
          </label>
          <select
            value={account}
            onChange={(e) => setAccount(e.target.value as Account)}
            disabled={state === "syncing"}
            className="text-sm border border-[#dddddd] rounded-sm px-3 py-2 bg-white text-[#3a3a3a] focus:outline-none focus:border-[#0170B9] disabled:opacity-50"
          >
            <option value="both">Both accounts</option>
            <option value="main">Main account only</option>
            <option value="launch">Launch account only</option>
          </select>
        </div>

        <button
          onClick={handleSync}
          disabled={state === "syncing" || !selectedPeriod}
          className="flex items-center gap-2 px-5 py-2 bg-[#0170B9] text-white text-sm font-medium rounded-sm hover:bg-[#015fa3] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {state === "syncing" ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <RefreshCw size={14} />
          )}
          {state === "syncing" ? "Syncing…" : "Sync from Stripe"}
        </button>
      </div>

      {/* Success */}
      {state === "done" && result && (
        <div className="bg-green-50 border border-green-200 rounded-sm px-4 py-3 space-y-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={15} className="text-green-600 shrink-0" />
            <p className="text-sm font-medium text-green-800">
              Sync complete — {result.total_inserted} charges loaded into {selectedPeriod}
            </p>
          </div>
          <div className="pl-5 space-y-0.5">
            {Object.entries(result.accounts).map(([acct, s]) => (
              <p key={acct} className="text-xs text-green-700 capitalize">
                {acct}:{" "}
                {s.skipped ? (
                  <span className="text-amber-600">{s.reason}</span>
                ) : (
                  <>
                    {s.inserted} charges
                    {s.new_clients ? ` · ${s.new_clients} new client${s.new_clients > 1 ? "s" : ""} created` : ""}
                  </>
                )}
              </p>
            ))}
          </div>
          <button
            onClick={() => { setState("idle"); setResult(null); }}
            className="pl-5 text-xs text-green-700 underline hover:text-green-900"
          >
            Sync again
          </button>
        </div>
      )}

      {/* Error */}
      {state === "error" && errorMsg && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-sm px-4 py-3 text-red-700 text-sm">
          <AlertCircle size={14} className="shrink-0" />
          {errorMsg}
        </div>
      )}
    </div>
  );
}
