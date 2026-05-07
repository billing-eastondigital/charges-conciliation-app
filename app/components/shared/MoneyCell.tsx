import { cn } from "@/lib/utils";
import { formatMoney, formatVariance } from "@/lib/format";

interface MoneyCellProps {
  amount: string | number;
  currency?: string;
  className?: string;
}

interface VarianceCellProps {
  variance: string | number;
  className?: string;
}

export function MoneyCell({ amount, currency = "USD", className }: MoneyCellProps) {
  return (
    <span className={cn("font-mono text-sm tabular-nums", className)}>
      {formatMoney(amount, currency)}
    </span>
  );
}

export function VarianceCell({ variance, className }: VarianceCellProps) {
  const num = typeof variance === "string" ? parseFloat(variance) : variance;
  const isPositive = num > 0.005;
  const isNegative = num < -0.005;

  return (
    <span
      className={cn(
        "font-mono text-sm tabular-nums font-medium",
        isPositive && "text-blue-700",
        isNegative && "text-red-700",
        !isPositive && !isNegative && "text-gray-500",
        className
      )}
    >
      {formatVariance(variance)}
    </span>
  );
}
