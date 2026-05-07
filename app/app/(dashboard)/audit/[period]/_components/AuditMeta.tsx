import type { Period } from "@/lib/types";

interface SourceFile {
  type: string;
  filename: string;
  rows: number;
  sha256: string;
}

interface RunMetadata {
  run_date: string;
  engine_version: string;
  source_files: SourceFile[];
}

interface Props {
  periodLabel: string;
  periodMeta: Period | undefined;
  runMetadata: RunMetadata;
}

export function AuditMeta({ periodLabel, periodMeta, runMetadata }: Props) {
  const runDate = new Date(runMetadata.run_date).toLocaleString("en-US", {
    dateStyle: "long",
    timeStyle: "short",
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

      {/* Run info */}
      <div className="bg-white border border-[#dddddd] rounded-sm px-5 py-4">
        <p className="text-xs font-semibold text-[#6b7280] uppercase tracking-wide mb-3">
          Run Information
        </p>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-[#6b7280]">Period</dt>
            <dd className="font-medium text-[#3a3a3a]">{periodLabel}</dd>
          </div>
          {periodMeta && (
            <>
              <div className="flex justify-between gap-4">
                <dt className="text-[#6b7280]">Date range</dt>
                <dd className="font-mono text-[#3a3a3a] text-xs">
                  {periodMeta.start_date} → {periodMeta.end_date}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[#6b7280]">Status</dt>
                <dd className={`text-xs font-medium px-2 py-0.5 rounded-sm border ${
                  periodMeta.closed
                    ? "bg-green-100 text-green-800 border-green-200"
                    : "bg-amber-100 text-amber-800 border-amber-200"
                }`}>
                  {periodMeta.closed ? "Closed" : "Open"}
                </dd>
              </div>
            </>
          )}
          <div className="flex justify-between gap-4">
            <dt className="text-[#6b7280]">Run date</dt>
            <dd className="text-[#3a3a3a] text-xs">{runDate}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-[#6b7280]">Engine version</dt>
            <dd className="font-mono text-[#3a3a3a] text-xs">{runMetadata.engine_version}</dd>
          </div>
        </dl>
      </div>

      {/* Source files */}
      <div className="bg-white border border-[#dddddd] rounded-sm px-5 py-4">
        <p className="text-xs font-semibold text-[#6b7280] uppercase tracking-wide mb-3">
          Source Files
        </p>
        <div className="space-y-3">
          {runMetadata.source_files.map((f) => (
            <div key={f.filename} className="text-sm">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-[#3a3a3a] text-xs">{f.filename}</p>
                <span className="text-[11px] text-[#6b7280] shrink-0">{f.rows} rows</span>
              </div>
              <p className="text-[11px] text-[#6b7280] mt-0.5">{f.type}</p>
              <p className="font-mono text-[10px] text-[#9ca3af] mt-1 break-all leading-relaxed">
                SHA-256: {f.sha256}
              </p>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
