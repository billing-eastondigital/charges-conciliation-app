import { april2026Exceptions } from "@/lib/mock";
import { ExceptionList } from "./_components/ExceptionList";

export default function ExceptionsPage() {
  const open = april2026Exceptions.filter((e) => e.status === "OPEN");

  return (
    <div className="px-6 py-6 space-y-5 max-w-[1480px]">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[#3a3a3a]">Exception Queue</h1>
          <p className="text-sm text-[#6b7280] mt-0.5">
            April 2026 · {open.length} open exception{open.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>
      <ExceptionList exceptions={open} />
    </div>
  );
}
