"use client";

import { useState } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { VarianceCell } from "@/components/shared/MoneyCell";
import { ResolveDialog } from "./ResolveDialog";
import type { Exception } from "@/lib/types";

const PRIORITY_ORDER = ["FAILED_HARD", "MISSING_PAYMENT", "STRIPE_ONLY", "OVERPAID", "UNDERPAID", "REFUNDED"];

interface ExceptionListProps {
  exceptions: Exception[];
}

export function ExceptionList({ exceptions }: ExceptionListProps) {
  const [selected, setSelected] = useState<Exception | null>(null);
  const [mode, setMode] = useState<"RESOLVED" | "WONT_FIX" | null>(null);

  const sorted = [...exceptions].sort(
    (a, b) =>
      PRIORITY_ORDER.indexOf(a.reconciliation_status) -
      PRIORITY_ORDER.indexOf(b.reconciliation_status)
  );

  function openDialog(ex: Exception, m: "RESOLVED" | "WONT_FIX") {
    setSelected(ex);
    setMode(m);
  }

  function closeDialog() {
    setSelected(null);
    setMode(null);
  }

  if (sorted.length === 0) {
    return (
      <div className="bg-white border border-[#dddddd] rounded-sm px-6 py-12 text-center">
        <p className="text-[#6b7280]">No open exceptions for this period.</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {sorted.map((ex) => (
          <div
            key={ex.id}
            className="bg-white border border-[#dddddd] rounded-sm px-5 py-4 flex items-start gap-4 hover:border-[#0170B9] transition-colors"
          >
            {/* Status */}
            <div className="pt-0.5">
              <StatusBadge status={ex.reconciliation_status} />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              {ex.stripe_id ? (
                <Link
                  href={`/client/${ex.stripe_id}`}
                  className="font-medium text-[#3a3a3a] text-sm hover:text-[#0170B9] transition-colors"
                >
                  {ex.display_name}
                </Link>
              ) : (
                <p className="font-medium text-[#3a3a3a] text-sm">{ex.display_name}</p>
              )}
              {ex.stripe_id && (
                <p className="text-xs text-[#6b7280] font-mono mt-0.5">{ex.stripe_id}</p>
              )}
              {ex.notes && (
                <p className="text-xs text-[#4B4F58] mt-2 leading-relaxed">{ex.notes}</p>
              )}
            </div>

            {/* Variance */}
            <div className="text-right shrink-0">
              <VarianceCell variance={ex.variance} />
              <p className="text-xs text-[#6b7280] mt-1">{ex.period_label}</p>
            </div>

            {/* Actions */}
            <div className="shrink-0 flex gap-2">
              <button
                onClick={() => openDialog(ex, "RESOLVED")}
                className="text-xs px-3 py-1.5 border border-[#dddddd] rounded-sm text-[#4B4F58] hover:border-[#0170B9] hover:text-[#0170B9] transition-colors"
              >
                Resolve
              </button>
              <button
                onClick={() => openDialog(ex, "WONT_FIX")}
                className="text-xs px-3 py-1.5 border border-[#dddddd] rounded-sm text-[#4B4F58] hover:border-[#6b7280] transition-colors"
              >
                Won&apos;t fix
              </button>
            </div>
          </div>
        ))}
      </div>

      <ResolveDialog exception={selected} mode={mode} onClose={closeDialog} />
    </>
  );
}
