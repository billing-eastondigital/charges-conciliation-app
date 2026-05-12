"use client";

import { useState, useCallback } from "react";
import { read, utils } from "xlsx";
import { formatMoney } from "@/lib/format";
import { Upload, AlertCircle, CheckCircle2, FileSpreadsheet, X } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Column auto-detection ─────────────────────────────────────────────────────
// Maps xlsx header variants → DB field names

const HEADER_MAP: Record<string, string> = {
  // account_name
  "account name": "account_name", "account": "account_name", "cuenta": "account_name",
  "client": "account_name", "nombre": "account_name",
  // stripe_id
  "stripe id": "stripe_id", "stripe": "stripe_id", "customer id": "stripe_id",
  "stripe customer": "stripe_id", "cus id": "stripe_id",
  // primary_email
  "email": "primary_email", "correo": "primary_email", "e-mail": "primary_email",
  "contact email": "primary_email",
  // batch
  "batch": "batch", "lote": "batch", "grupo": "batch",
  // billing_plan
  "billing plan": "billing_plan", "plan": "billing_plan",
  "monthly billing plan": "billing_plan", "plan mensual": "billing_plan",
  "monthly plan": "billing_plan",
  // billing_pct
  "billing %": "billing_pct", "billing pct": "billing_pct",
  "google revenue %": "billing_pct", "revenue %": "billing_pct",
  "pct": "billing_pct", "percentage": "billing_pct",
  // google_shopping_charge
  "google shopping charge": "google_shopping_charge",
  "shopping charge": "google_shopping_charge",
  "g. shopping": "google_shopping_charge",
  "amount to charge based on % shopping": "google_shopping_charge",
  // google_search_charge
  "google search charge": "google_search_charge",
  "search charge": "google_search_charge",
  "g. search": "google_search_charge",
  "amount to charge based on % search": "google_search_charge",
  // bing_charge
  "bing charge": "bing_charge", "bing": "bing_charge",
  "amount to charge based on % bing": "bing_charge",
  // base_fee
  "base fee": "base_fee", "base fee google": "base_fee",
  "base": "base_fee", "fee mensual": "base_fee",
  // expected_amount / total_to_bill
  "total to bill": "expected_amount", "total": "expected_amount",
  "amount": "expected_amount", "total a facturar": "expected_amount",
  "facturar": "expected_amount", "total facturar": "expected_amount",
  "to bill": "expected_amount",
};

function detectField(header: string): string | null {
  const normalized = header.toLowerCase().trim();
  return HEADER_MAP[normalized] ?? null;
}

interface ParsedRow {
  account_name: string;
  stripe_id: string | null;
  primary_email: string | null;
  batch: string | null;
  billing_plan: string | null;
  billing_pct: number | null;
  google_shopping_charge: number | null;
  google_search_charge: number | null;
  bing_charge: number | null;
  base_fee: number | null;
  expected_amount: number;
  source_row_index: number;
}

interface ParseResult {
  rows: ParsedRow[];
  detectedFields: string[];
  skipped: number;
}

function parseNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = parseFloat(String(v).replace(/[,$\s]/g, ""));
  return isNaN(n) ? null : n;
}

function parseXlsx(buffer: ArrayBuffer): ParseResult {
  const wb = read(buffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw: Record<string, unknown>[] = utils.sheet_to_json(ws, { defval: null });

  if (!raw.length) return { rows: [], detectedFields: [], skipped: 0 };

  // Detect column mapping from first row's keys
  const headers = Object.keys(raw[0]);
  const fieldMap: Record<string, string> = {}; // xlsxHeader → dbField
  for (const h of headers) {
    const dbField = detectField(h);
    if (dbField) fieldMap[h] = dbField;
  }
  const detectedFields = [...new Set(Object.values(fieldMap))];

  // Parse rows
  const rows: ParsedRow[] = [];
  let skipped = 0;

  raw.forEach((rawRow, idx) => {
    // Build a map of dbField → value
    const row: Record<string, unknown> = {};
    for (const [xlsxHeader, dbField] of Object.entries(fieldMap)) {
      row[dbField] = rawRow[xlsxHeader];
    }

    const accountName = String(row["account_name"] ?? "").trim();
    if (!accountName) { skipped++; return; }

    // Filter out $0 rows that are just placeholders
    const totalRaw = parseNum(row["expected_amount"]);
    if (totalRaw === null) { skipped++; return; }

    // Stripe ID: only keep cus_... values
    const rawStripeId = String(row["stripe_id"] ?? "").trim();
    const stripeId = rawStripeId.startsWith("cus_") ? rawStripeId : null;

    rows.push({
      account_name:           accountName,
      stripe_id:              stripeId,
      primary_email:          String(row["primary_email"] ?? "").trim() || null,
      batch:                  String(row["batch"] ?? "").trim() || null,
      billing_plan:           String(row["billing_plan"] ?? "").trim() || null,
      billing_pct:            parseNum(row["billing_pct"]),
      google_shopping_charge: parseNum(row["google_shopping_charge"]),
      google_search_charge:   parseNum(row["google_search_charge"]),
      bing_charge:            parseNum(row["bing_charge"]),
      base_fee:               parseNum(row["base_fee"]),
      expected_amount:        totalRaw,
      source_row_index:       idx + 2, // 1-based, accounting for header row
    });
  });

  return { rows, detectedFields, skipped };
}

// ── Component ─────────────────────────────────────────────────────────────────

type ImportState = "idle" | "parsed" | "importing" | "done" | "error";

interface Props {
  periods: { period_label: string; is_closed: boolean }[];
  supabaseFunctionsUrl: string;
  supabaseAnonKey: string;
}

export default function BillingImportClient({ periods, supabaseFunctionsUrl, supabaseAnonKey }: Props) {
  const [selectedPeriod, setSelectedPeriod] = useState(
    periods.find((p) => !p.is_closed)?.period_label ?? periods[0]?.period_label ?? ""
  );
  const [state, setState]             = useState<ImportState>("idle");
  const [fileName, setFileName]       = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [importResult, setImportResult] = useState<{ inserted: number } | null>(null);
  const [errorMsg, setErrorMsg]       = useState<string | null>(null);
  const [isDragging, setIsDragging]   = useState(false);

  const handleFile = useCallback((file: File) => {
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      setErrorMsg("Please upload an .xlsx or .xls file.");
      setState("error");
      return;
    }
    setFileName(file.name);
    setErrorMsg(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const buffer = e.target?.result as ArrayBuffer;
        const result = parseXlsx(buffer);
        if (result.rows.length === 0) {
          setErrorMsg("No valid rows found. Make sure the file has an 'Account Name' and 'Total to Bill' column.");
          setState("error");
          return;
        }
        setParseResult(result);
        setState("parsed");
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "Failed to parse file");
        setState("error");
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleImport = async () => {
    if (!parseResult || !selectedPeriod) return;
    setState("importing");
    setErrorMsg(null);
    try {
      const res = await fetch(`${supabaseFunctionsUrl}/ingest-billing`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseAnonKey}`,
          "apikey": supabaseAnonKey,
        },
        body: JSON.stringify({ period_label: selectedPeriod, rows: parseResult.rows }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      setImportResult({ inserted: data.inserted });
      setState("done");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Import failed");
      setState("error");
    }
  };

  const handleReset = () => {
    setState("idle");
    setFileName(null);
    setParseResult(null);
    setImportResult(null);
    setErrorMsg(null);
  };

  return (
    <div className="space-y-6 max-w-4xl">

      {/* Period selector */}
      <div className="bg-white border border-[#dddddd] rounded-sm px-5 py-4">
        <label className="block text-xs font-semibold text-[#6b7280] uppercase tracking-wide mb-2">
          Target period
        </label>
        <select
          value={selectedPeriod}
          onChange={(e) => setSelectedPeriod(e.target.value)}
          disabled={state === "importing" || state === "done"}
          className="text-sm border border-[#dddddd] rounded-sm px-3 py-2 bg-white text-[#3a3a3a] focus:outline-none focus:border-[#0170B9] disabled:opacity-50"
        >
          {periods.map((p) => (
            <option key={p.period_label} value={p.period_label} disabled={p.is_closed}>
              {p.period_label}{p.is_closed ? " (closed)" : ""}
            </option>
          ))}
        </select>
        <p className="text-xs text-[#9ca3af] mt-1.5">
          Importing will replace all existing AR lines for this period.
        </p>
      </div>

      {/* Upload area */}
      {state === "idle" || state === "error" ? (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          className={cn(
            "border-2 border-dashed rounded-sm px-8 py-12 text-center transition-colors",
            isDragging ? "border-[#0170B9] bg-blue-50" : "border-[#dddddd] bg-white hover:border-[#0170B9]/50"
          )}
        >
          <FileSpreadsheet size={36} className="mx-auto mb-3 text-[#9ca3af]" />
          <p className="text-sm font-medium text-[#3a3a3a] mb-1">
            Drop your billing xlsx here
          </p>
          <p className="text-xs text-[#9ca3af] mb-4">
            or click to browse — .xlsx or .xls
          </p>
          <label className="inline-flex items-center gap-2 px-4 py-2 bg-[#0170B9] text-white text-sm rounded-sm cursor-pointer hover:bg-[#015fa3] transition-colors">
            <Upload size={14} />
            Choose file
            <input type="file" accept=".xlsx,.xls" onChange={handleInputChange} className="hidden" />
          </label>

          {state === "error" && errorMsg && (
            <div className="mt-4 flex items-center gap-2 justify-center text-red-600 text-sm">
              <AlertCircle size={14} />
              {errorMsg}
            </div>
          )}
        </div>
      ) : null}

      {/* Parsed preview */}
      {(state === "parsed" || state === "importing" || state === "done") && parseResult && (
        <div className="space-y-4">

          {/* File info bar */}
          <div className="bg-white border border-[#dddddd] rounded-sm px-4 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <FileSpreadsheet size={18} className="text-[#0170B9] shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-[#3a3a3a] truncate">{fileName}</p>
                <p className="text-xs text-[#6b7280]">
                  {parseResult.rows.length} rows ready · {parseResult.skipped} skipped ·{" "}
                  {parseResult.detectedFields.length} fields detected
                </p>
              </div>
            </div>
            {state !== "importing" && state !== "done" && (
              <button onClick={handleReset} className="text-[#9ca3af] hover:text-[#6b7280] shrink-0">
                <X size={16} />
              </button>
            )}
          </div>

          {/* Detected fields */}
          <div className="flex flex-wrap gap-1.5">
            {["account_name","stripe_id","batch","billing_plan","billing_pct","google_shopping_charge","google_search_charge","bing_charge","base_fee","expected_amount"].map((f) => (
              <span key={f} className={cn(
                "text-[10px] px-2 py-0.5 rounded-sm border font-mono",
                parseResult.detectedFields.includes(f)
                  ? "bg-green-50 text-green-700 border-green-200"
                  : "bg-[#F5F5F5] text-[#9ca3af] border-[#eeeeee]"
              )}>
                {parseResult.detectedFields.includes(f) ? "✓" : "—"} {f}
              </span>
            ))}
          </div>

          {/* Preview table */}
          <div className="bg-white border border-[#dddddd] rounded-sm overflow-x-auto">
            <div className="px-4 py-2.5 border-b border-[#eeeeee] bg-[#fafafa]">
              <span className="text-xs font-semibold text-[#6b7280] uppercase tracking-wide">
                Preview — first {Math.min(10, parseResult.rows.length)} of {parseResult.rows.length} rows
              </span>
            </div>
            <table className="w-max min-w-full text-xs">
              <thead>
                <tr className="bg-[#F5F5F5] border-b border-[#dddddd]">
                  {["#","Account","Stripe ID","Batch","G. Shopping","G. Search","Bing","Total to Bill"].map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-medium text-[#6b7280] whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parseResult.rows.slice(0, 10).map((row) => (
                  <tr key={row.source_row_index} className="border-b border-[#eeeeee] last:border-0 hover:bg-[#fafafa]">
                    <td className="px-3 py-2 text-[#9ca3af]">{row.source_row_index}</td>
                    <td className="px-3 py-2 font-medium text-[#3a3a3a] max-w-[200px]">
                      <span className="truncate block" title={row.account_name}>{row.account_name}</span>
                      {row.stripe_id && <span className="font-mono text-[10px] text-[#9ca3af]">{row.stripe_id}</span>}
                    </td>
                    <td className="px-3 py-2 font-mono text-[10px] text-[#6b7280]">
                      {row.stripe_id ?? <span className="text-amber-500">no ID</span>}
                    </td>
                    <td className="px-3 py-2 text-[#6b7280]">{row.batch ?? "—"}</td>
                    <td className="px-3 py-2 text-right text-[#6b7280]">
                      {row.google_shopping_charge != null ? formatMoney(row.google_shopping_charge) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-[#6b7280]">
                      {row.google_search_charge != null ? formatMoney(row.google_search_charge) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-[#6b7280]">
                      {row.bing_charge != null ? formatMoney(row.bing_charge) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-[#3a3a3a]">
                      {formatMoney(row.expected_amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[#dddddd] bg-[#F5F5F5] font-semibold">
                  <td colSpan={7} className="px-3 py-2 text-xs text-[#6b7280] uppercase tracking-wide">
                    Total ({parseResult.rows.length} rows)
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-sm">
                    {formatMoney(parseResult.rows.reduce((s, r) => s + r.expected_amount, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Action bar */}
          {state === "parsed" && (
            <div className="flex items-center gap-3">
              <button
                onClick={handleImport}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#0170B9] text-white text-sm font-medium rounded-sm hover:bg-[#015fa3] transition-colors"
              >
                <Upload size={14} />
                Import {parseResult.rows.length} rows into {selectedPeriod}
              </button>
              <button onClick={handleReset} className="text-sm text-[#6b7280] hover:text-[#3a3a3a] transition-colors">
                Cancel
              </button>
            </div>
          )}

          {state === "importing" && (
            <div className="flex items-center gap-2 text-sm text-[#6b7280]">
              <div className="w-4 h-4 border-2 border-[#0170B9] border-t-transparent rounded-full animate-spin" />
              Importing {parseResult.rows.length} rows into {selectedPeriod}…
            </div>
          )}

          {state === "done" && importResult && (
            <div className="flex items-start gap-3 bg-green-50 border border-green-200 rounded-sm px-4 py-3">
              <CheckCircle2 size={16} className="text-green-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-green-800">
                  Import complete — {importResult.inserted} rows loaded into {selectedPeriod}
                </p>
                <p className="text-xs text-green-700 mt-0.5">
                  The AR lines are now available in the Audit and Period views.
                </p>
                <button onClick={handleReset} className="mt-2 text-xs text-green-700 underline hover:text-green-900">
                  Import another file
                </button>
              </div>
            </div>
          )}

        </div>
      )}

      {/* Import error (shown outside the parsed block) */}
      {state === "error" && errorMsg && fileName && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-sm px-4 py-3 text-red-700 text-sm">
          <AlertCircle size={14} className="shrink-0" />
          {errorMsg}
        </div>
      )}
    </div>
  );
}
