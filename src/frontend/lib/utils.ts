export { cn } from "cn";

export function formatNumber(value: number, fractionDigits = 0): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

export function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(
    value
  );
}

export function formatPercent(value: number, fractionDigits = 1): string {
  return `${value.toFixed(fractionDigits)}%`;
}

export function formatUsd(value: number, fractionDigits = 0): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
}

export interface TrendResult {
  direction: "up" | "down";
  label: string;
  tone: "positive" | "negative" | "neutral";
}

/**
 * Computes a KPI trend vs. a prior-period baseline. `goodDirection` says which
 * direction of change is favorable ("neutral" means purely informational —
 * no good/bad judgement, e.g. "demand is up" isn't inherently good or bad).
 */
export function computeTrend(
  current: number,
  previous: number,
  options: { suffix?: string; goodDirection?: "up" | "down" | "neutral" } = {}
): TrendResult | undefined {
  if (previous === 0) return undefined;
  const pctChange = ((current - previous) / previous) * 100;
  if (Math.abs(pctChange) < 0.5) return undefined;

  const direction: "up" | "down" = pctChange >= 0 ? "up" : "down";
  const goodDirection = options.goodDirection ?? "neutral";
  const tone: TrendResult["tone"] =
    goodDirection === "neutral" ? "neutral" : direction === goodDirection ? "positive" : "negative";
  const sign = pctChange >= 0 ? "+" : "";
  const suffix = options.suffix ?? "vs. yesterday";

  return { direction, label: `${sign}${pctChange.toFixed(1)}% ${suffix}`, tone };
}

/** Builds a CSV file client-side and triggers a browser download — no library needed. */
export function exportToCsv(filename: string, rows: Record<string, string | number>[]): void {
  if (rows.length === 0) return;

  const headers = Object.keys(rows[0]);
  const escapeCell = (value: string | number): string => {
    const str = String(value);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };

  const csv = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => escapeCell(row[header])).join(",")),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function formatRelativeTime(iso: string, nowIso: string): string {
  const diffMs = new Date(nowIso).getTime() - new Date(iso).getTime();
  const diffMinutes = Math.round(diffMs / 60_000);
  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}
