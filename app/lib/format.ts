// ============================================================
// Formatting helpers — the ONLY place money/dates are formatted
// Never use .toFixed() inline. Always use these functions.
// ============================================================

/**
 * Format a numeric string as USD currency.
 * Input is always a string (from DB or mock) to avoid float precision issues.
 */
export function formatMoney(amount: string | number, currency = "USD"): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

/**
 * Format variance with explicit + or - sign.
 * Positive = overpaid (client paid more than expected).
 * Negative = underpaid.
 */
export function formatVariance(variance: string | number): string {
  const num = typeof variance === "string" ? parseFloat(variance) : variance;
  const formatted = formatMoney(Math.abs(num));
  if (num > 0.005) return `+${formatted}`;
  if (num < -0.005) return `-${formatted}`;
  return formatted;
}

/**
 * Format an ISO 8601 date string for display.
 */
export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}

/**
 * Format a period label for display (passthrough — already human-readable).
 */
export function formatPeriod(label: string): string {
  return label; // e.g. "April 2026"
}
