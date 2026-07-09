import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatInr(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

const RELATIVE_TIME_UNITS: { unit: Intl.RelativeTimeFormatUnit; ms: number }[] = [
  { unit: "year", ms: 1000 * 60 * 60 * 24 * 365 },
  { unit: "month", ms: 1000 * 60 * 60 * 24 * 30 },
  { unit: "day", ms: 1000 * 60 * 60 * 24 },
  { unit: "hour", ms: 1000 * 60 * 60 },
  { unit: "minute", ms: 1000 * 60 },
  { unit: "second", ms: 1000 },
];

export function formatRelativeTime(value: string | Date | number): string {
  const date = new Date(value);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const absDiff = Math.abs(diffMs);

  if (absDiff < 10000) {
    return "just now";
  }

  for (const { unit, ms } of RELATIVE_TIME_UNITS) {
    const count = Math.round(absDiff / ms);
    if (count > 0) {
      const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
      return rtf.format(diffMs < 0 ? -count : count, unit);
    }
  }

  return "just now";
}
