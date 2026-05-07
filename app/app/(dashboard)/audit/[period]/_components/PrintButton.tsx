"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 text-xs px-3 py-1.5 border border-[#dddddd] rounded-sm text-[#4B4F58] hover:border-[#0170B9] hover:text-[#0170B9] transition-colors"
    >
      <Printer size={13} strokeWidth={1.75} />
      Print / Export PDF
    </button>
  );
}
