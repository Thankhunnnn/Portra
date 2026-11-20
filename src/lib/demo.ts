import type { PriceMap, Transaction } from "./portfolioEngine";
import { dateRange } from "./portfolioEngine";
import { addMonths, todayInBangkok } from "./reportDates";
import type { DashboardData, Quote } from "./sheets";

/** Offline demo data so the UI is explorable without Google sign-in. */

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const START = "2024-03-01";
const SPEC: Record<string, { p0: number; drift: number; vol: number; sector: string; theme: string; sym?: string }> = {
  AAPL: { p0: 170, drift: 0.0006, vol: 0.014, sector: "Technology", theme: "Big Tech" },
  NVDA: { p0: 85, drift: 0.0017, vol: 0.028, sector: "Technology", theme: "AI" },
  MSFT: { p0: 400, drift: 0.0005, vol: 0.012, sector: "Technology", theme: "AI" },
  TSLA: { p0: 200, drift: 0.0003, vol: 0.03, sector: "Consumer Cyclical", theme: "EV" },
  VOO: { p0: 440, drift: 0.0004, vol: 0.008, sector: "ETF", theme: "Index" },
  JNJ: { p0: 155, drift: 0.0001, vol: 0.009, sector: "Healthcare", theme: "Dividend" },
  BTC: { p0: 62000, drift: 0.0012, vol: 0.03, sector: "Crypto", theme: "Crypto", sym: "BTC-USD" },
  ETH: { p0: 3400, drift: 0.0008, vol: 0.035, sector: "Crypto", theme: "Crypto", sym: "ETH-USD" },
};

export function demoPrices(end = new Date().toISOString().slice(0, 10)): PriceMap {
  const out: PriceMap = {};
  const indexes: Record<string, { p0: number; drift: number; vol: number }> = {
    "^GSPC": { p0: 5100, drift: 0.0004, vol: 0.008 },
    "^NYA": { p0: 17500, drift: 0.0003, vol: 0.009 },
    QQQ: { p0: 435, drift: 0.0006, vol: 0.012 },
    "^IXIC": { p0: 16000, drift: 0.0006, vol: 0.012 },
  };
  const keys = [...Object.keys(SPEC), ...Object.keys(indexes)];
  keys.forEach((k, ki) => {
    const r = rng(1000 + ki * 77);
    const s = indexes[k] ?? SPEC[k];
    let p = s.p0;
    const m: Record<string, number> = {};
    for (const d of dateRange(START, end)) {
      const dow = new Date(d).getUTCDay();
      if (dow === 0 || dow === 6) continue;
      p *= 1 + s.drift + (r() - 0.5) * 2 * s.vol;
      m[d] = Math.round(p * 100) / 100;
    }
    out[k] = m;
  });
  return out;
}

const T = (account: Transaction["account"], date: string, ticker: string, action: Transaction["action"], shares: number, price: number, commission = 0): Transaction => ({
  account, date, ticker, action, shares, price, commission, currency: "USD", note: "demo",
});

export const demoTransactions: Transaction[] = [
  T("Dime!", "2024-03-04", "", "DEPOSIT", 1, 5000),
  T("Dime!", "2024-03-05", "AAPL", "BUY", 12, 170, 0.5),
  T("Dime!", "2024-03-05", "VOO", "BUY", 5, 440, 0.5),
  T("Dime!", "2024-06-10", "", "DEPOSIT", 1, 3000),
  T("Dime!", "2024-06-11", "NVDA", "BUY", 20, 125, 0.5),
  T("Dime!", "2025-01-15", "NVDA", "SELL", 5, 140, 0.5),
  T("Webull", "2024-04-02", "", "DEPOSIT", 1, 6000),
  T("Webull", "2024-04-03", "MSFT", "BUY", 6, 415, 0),
  T("Webull", "2024-04-03", "TSLA", "BUY", 10, 170, 0),
  T("Webull", "2024-09-12", "JNJ", "BUY", 15, 160, 0),
  T("Webull", "2025-03-03", "TSLA", "SELL", 4, 280, 0),
  T("Binance", "2024-05-06", "", "DEPOSIT", 1, 4000),
  T("Binance", "2024-05-07", "BTC", "BUY", 0.04, 63000, 2),
  T("Binance", "2024-08-20", "ETH", "BUY", 0.5, 2600, 2),
  ...[1, 4, 7, 10].flatMap((months) => {
    const date = addMonths(todayInBangkok(), -months);
    return [
      T("Dime!", date, "AAPL", "DIVIDEND", 12, 0.26),
      T("Dime!", addMonths(date, -1), "VOO", "DIVIDEND", 5, 1.72),
      T("Webull", date, "JNJ", "DIVIDEND", 15, 1.30),
      T("Webull", addMonths(date, -1), "MSFT", "DIVIDEND", 6, 0.91),
    ];
  }),
];

export function demoDashboard(prices: PriceMap): { dash: DashboardData; quotes: Quote[] } {
  const last = (t: string) => {
    const ds = Object.keys(prices[t]).sort();
    return { p: prices[t][ds.at(-1)!], prev: prices[t][ds.at(-2)!] };
  };
  const positions: DashboardData["positions"] = [
    ["AAPL", "Dime!", 12, 170], ["VOO", "Dime!", 5, 440], ["NVDA", "Dime!", 15, 125],
    ["MSFT", "Webull", 6, 415], ["TSLA", "Webull", 6, 170], ["JNJ", "Webull", 15, 160],
  ].map(([ticker, account, shares, avgCost]) => ({
    ticker: ticker as string, account: account as "Dime!", shares: shares as number, avgCost: avgCost as number,
    sector: SPEC[ticker as string].sector, theme: SPEC[ticker as string].theme,
  }));
  const quotes: Quote[] = Object.keys(SPEC).map((t) => {
    const { p, prev } = last(t);
    return { ticker: t, latest: p, regularClose: prev, diffPct: p / prev - 1, session: "Regular", updated: "" };
  });
  return { dash: { usdThb: 35.4, sectors: [], themes: [], positions }, quotes };
}

export const demoPriceSymbol = (ticker: string) => SPEC[ticker]?.sym ?? ticker;
export const demoMeta = (ticker: string) => SPEC[ticker];
