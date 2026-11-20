import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type Currency = "USD" | "THB";

export function fmtMoney(v: number, ccy: Currency, compact = false): string {
  if (!isFinite(v)) return "–";
  const sym = ccy === "USD" ? "$" : "฿";
  const abs = Math.abs(v);
  const s = compact && abs >= 1000
    ? new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(abs)
    : abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${v < 0 ? "-" : ""}${sym}${s}`;
}

export function fmtNum(v: number, digits = 2): string {
  if (!isFinite(v)) return "–";
  return v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtPct(v: number, digits = 2, sign = true): string {
  if (!isFinite(v)) return "–";
  const s = (v * 100).toFixed(digits) + "%";
  return sign && v > 0 ? "+" + s : s;
}

export function gainClass(v: number): string {
  return v > 0 ? "text-gain" : v < 0 ? "text-loss" : "text-sub";
}
