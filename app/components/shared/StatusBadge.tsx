import { cn } from "@/lib/utils";
import type { ReconciliationStatus } from "@/lib/types";

const STATUS_CONFIG: Record<ReconciliationStatus, { label: string; className: string }> = {
  MATCH:           { label: "Match",          className: "bg-green-100 text-green-800 border-green-200" },
  UNDERPAID:       { label: "Underpaid",       className: "bg-amber-100 text-amber-800 border-amber-200" },
  OVERPAID:        { label: "Overpaid",        className: "bg-blue-100 text-blue-800 border-blue-200" },
  FAILED_HARD:     { label: "Failed",          className: "bg-red-100 text-red-800 border-red-200" },
  MISSING_PAYMENT: { label: "Missing",         className: "bg-red-100 text-red-800 border-red-200" },
  REFUNDED:        { label: "Refunded",        className: "bg-gray-100 text-gray-700 border-gray-200" },
  STRIPE_ONLY:     { label: "Unmatched",       className: "bg-purple-100 text-purple-800 border-purple-200" },
};

interface StatusBadgeProps {
  status: ReconciliationStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 text-xs font-medium border rounded-sm whitespace-nowrap",
        config.className,
        className
      )}
    >
      {config.label}
    </span>
  );
}
