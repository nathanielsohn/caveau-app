import { Decimal } from "@prisma/client/runtime/library";

type NumericValue = Decimal | number | string | null | undefined;

/** Convert any Prisma Decimal / string / number to a JS number */
export function toNumber(value: NumericValue): number {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") return parseFloat(value) || 0;
  // Prisma.Decimal
  return Number(value);
}

/** Format as USD currency — e.g. "$4,800.00" */
export function formatCurrency(value: NumericValue): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(toNumber(value));
}

/** Format as compact currency — e.g. "$4.8K" */
export function formatCurrencyCompact(value: NumericValue): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(toNumber(value));
}

/** Format a number with commas — e.g. "4,800" */
export function formatNumber(value: NumericValue, decimals = 0): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(toNumber(value));
}

/** Format temperature — e.g. "55.2°F" */
export function formatTemp(value: NumericValue): string {
  return `${toNumber(value).toFixed(1)}°F`;
}

/** Format humidity — e.g. "65.0%" */
export function formatHumidity(value: NumericValue): string {
  return `${toNumber(value).toFixed(1)}%`;
}

/** Format vibration — e.g. "0.12 mm/s" */
export function formatVibration(value: NumericValue): string {
  return `${toNumber(value).toFixed(2)} mm/s`;
}

/** Format light — e.g. "0.5 lux" */
export function formatLight(value: NumericValue): string {
  return `${toNumber(value).toFixed(1)} lux`;
}

/** Relative time — e.g. "2 hours ago" */
export function formatRelativeTime(date: Date | string): string {
  const now = new Date();
  const d = typeof date === "string" ? new Date(date) : date;
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Format date — e.g. "Mar 15, 2026" */
export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Calculate percent change between two values */
export function percentChange(
  from: NumericValue,
  to: NumericValue
): number {
  const f = toNumber(from);
  const t = toNumber(to);
  if (f === 0) return 0;
  return ((t - f) / f) * 100;
}
