import type { Transaction } from "./portfolioEngine";
import { positionUnits, toMs } from "./portfolioEngine";

export const COST_METHODS = ["FIFO", "LIFO", "Weighted Average"] as const;
export type CostMethod = (typeof COST_METHODS)[number];

export interface Lot {
  side: "BUY" | "SELL";
  date: string; // open date
  closeDate?: string;
  price: number; // entry price (USD)
  exit: number; // last price (open) or sell price (closed)
  ccy: string;
  shares: number;
  cost: number;
  gain: number;
  ret: number;
  alpha: number; // lot return minus benchmark return over same window
  days: number;
  open: boolean;
}

/**
 * FIFO lot matching. Open lots are marked to `last`; closed chunks use the sell price.
 * `bench(date)` returns benchmark price on/before a date (may be undefined).
 */
export function buildLots(
  txns: Transaction[],
  last: number,
  today: string,
  bench: (d: string) => number | undefined,
  usdThb: number | ((date: string) => number) = 35,
  method: CostMethod = "FIFO",
  includeFees = false
): Lot[] {
  const q: { date: string; price: number; shares: number; ccy: string }[] = [];
  const out: Lot[] = [];
  const days = (a: string, b: string) => Math.max(0, Math.round((toMs(b) - toMs(a)) / 86_400_000));
  const alphaOf = (ret: number, from: string, to: string) => {
    const b0 = bench(from), b1 = bench(to);
    return b0 && b1 ? ret - (b1 / b0 - 1) : NaN;
  };
  const byDay = new Map<string, Transaction[]>();
  for (const trade of txns.filter((t) => positionUnits(t) !== 0)) {
    const trades = byDay.get(trade.date) ?? [];
    trades.push(trade);
    byDay.set(trade.date, trades);
  }
  const ordered: Transaction[] = [];
  let balance = 0;
  for (const day of [...byDay.keys()].sort()) {
    const trades = byDay.get(day)!;
    let remaining = balance;
    let needsSameDayBuy = false;
    for (const trade of trades) {
      remaining += positionUnits(trade);
      if (remaining < -1e-9) needsSameDayBuy = true;
    }
    // Date-only exports can list the sale first even when a same-day purchase covers it.
    ordered.push(...(needsSameDayBuy ? [...trades].sort((a, b) => Math.sign(positionUnits(b)) - Math.sign(positionUnits(a))) : trades));
    balance = Math.max(0, remaining);
  }
  for (const t of ordered) {
    if (!(t.shares > 0)) continue;
    const k = t.currency === "THB" ? 1 / (typeof usdThb === "number" ? usdThb : usdThb(t.date)) : 1;
    const fee = includeFees ? t.commission / t.shares : 0;
    if (positionUnits(t) > 0) {
      q.push({ date: t.date, price: (t.price + fee) * k, shares: t.shares, ccy: t.currency });
      if (method === "Weighted Average") {
        const average = q.reduce((sum, lot) => sum + lot.price * lot.shares, 0) / q.reduce((sum, lot) => sum + lot.shares, 0);
        q.forEach((lot) => { lot.price = average; });
      }
    }
    else {
      let left = t.shares;
      while (left > 1e-9 && q.length) {
        const l = method === "LIFO" ? q.at(-1)! : q[0];
        const exit = (t.price - fee) * k;
        const n = Math.min(l.shares, left);
        const ret = l.price ? exit / l.price - 1 : 0;
        if (t.action === "SELL") out.push({
          side: "SELL", date: l.date, closeDate: t.date, price: l.price, exit, ccy: l.ccy, shares: n,
          cost: n * l.price, gain: n * (exit - l.price), ret, alpha: alphaOf(ret, l.date, t.date), days: days(l.date, t.date), open: false,
        });
        l.shares -= n; left -= n;
        if (l.shares <= 1e-9) {
          if (method === "LIFO") q.pop(); else q.shift();
        }
      }
    }
  }
  for (const l of q) {
    const ret = l.price ? last / l.price - 1 : 0;
    out.push({
      side: "BUY", date: l.date, price: l.price, exit: last, ccy: l.ccy, shares: l.shares, cost: l.shares * l.price,
      gain: l.shares * (last - l.price), ret, alpha: alphaOf(ret, l.date, today), days: days(l.date, today), open: true,
    });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

export function lotStats(lots: Lot[]) {
  const n = lots.length;
  const wins = lots.filter((l) => l.gain > 0).length;
  const alphas = lots.filter((l) => !isNaN(l.alpha));
  return {
    count: n,
    winRate: n ? wins / n : NaN,
    winRateVsBench: alphas.length ? alphas.filter((l) => l.alpha > 0).length / alphas.length : NaN,
    totalGain: lots.reduce((s, l) => s + l.gain, 0),
  };
}
