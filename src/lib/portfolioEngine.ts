/**
 * Portfolio engine: daily NAV, TWR, MWR (XIRR) and benchmark comparison.
 * Pure functions, no I/O. All money is computed in USD (THB rows are converted with `usdThb`).
 */

export type Action =
  | "BUY"
  | "SELL"
  | "DEPOSIT"
  | "WITHDRAW"
  | "DIVIDEND"
  | "FEE"
  | "OTHER";

export interface Transaction {
  date: string; // YYYY-MM-DD
  ticker: string;
  action: Action;
  shares: number;
  price: number;
  commission: number;
  currency: string; // USD | THB
  note?: string;
  account?: string;
}

/** ticker -> (YYYY-MM-DD -> close price in USD) */
export type PriceMap = Record<string, Record<string, number>>;

export interface NavPoint {
  date: string;
  nav: number; // positions + cash
  positions: number;
  cash: number;
  netDeposits: number; // cumulative external contributions
  flow: number; // external flow that day (+deposit / -withdrawal)
  benchmark: number; // value of same cash flows invested in benchmark
  benchmarkPrice: number;
  cashByCurrency?: Record<string, number>;
}

export interface EngineOptions {
  usdThb?: number;
  fxAt?: (date: string) => number;
  separateCash?: boolean;
  nativeThbPrices?: PriceMap;
  benchmarkTicker?: string; // key in PriceMap, default "^GSPC"
  /** If cash would go negative, assume an implicit deposit funds the gap (for sheets lacking deposit rows). */
  autoFund?: boolean;
  end?: string; // default: last date in prices or today
}

const DAY = 86_400_000;

export function toMs(d: string): number {
  return Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
}
export function fmtDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
export function dateRange(start: string, end: string): string[] {
  const out: string[] = [];
  for (let t = toMs(start); t <= toMs(end); t += DAY) out.push(fmtDate(t));
  return out;
}

export function normalizeAction(raw: string): Action {
  const a = raw.trim().toUpperCase();
  if (/^(BUY|B|BOUGHT|ซื้อ)/.test(a)) return "BUY";
  if (/^(SELL|S|SOLD|ขาย)/.test(a)) return "SELL";
  if (/DEPOSIT|TOP.?UP|TRANSFER IN|CASH IN|FUND/.test(a)) return "DEPOSIT";
  if (/WITHDRAW|TRANSFER OUT|CASH OUT/.test(a)) return "WITHDRAW";
  if (/DIV/.test(a)) return "DIVIDEND";
  if (/FEE|TAX/.test(a)) return "FEE";
  return "OTHER";
}

function fx(t: Transaction, usdThb: number): number {
  return t.currency.toUpperCase() === "THB" ? 1 / usdThb : 1;
}

/** Look up price on/before `date` (forward fill). */
export class PriceLookup {
  private sorted: Record<string, string[]> = {};
  constructor(private prices: PriceMap) {
    for (const k of Object.keys(prices)) this.sorted[k] = Object.keys(prices[k]).sort();
  }
  get(ticker: string, date: string): number | undefined {
    const ds = this.sorted[ticker];
    if (!ds || ds.length === 0) return undefined;
    const exact = this.prices[ticker][date];
    if (exact !== undefined) return exact;
    let lo = 0,
      hi = ds.length - 1,
      best = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (ds[mid] <= date) {
        best = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return best >= 0 ? this.prices[ticker][ds[best]] : undefined;
  }
}

/** Compute the daily NAV series from transactions + price history. */
export function computeNav(
  txns: Transaction[],
  prices: PriceMap,
  opts: EngineOptions = {}
): NavPoint[] {
  const usdThb = opts.usdThb ?? 35;
  const bench = opts.benchmarkTicker ?? "^GSPC";
  const autoFund = opts.autoFund ?? true;
  if (txns.length === 0) return [];

  const sorted = [...txns].sort((a, b) => a.date.localeCompare(b.date));
  const start = sorted[0].date;
  const lastPriceDate = Object.values(prices).reduce((m, p) => {
    const ks = Object.keys(p);
    return ks.length ? (ks.sort().at(-1)! > m ? ks.sort().at(-1)! : m) : m;
  }, start);
  const end = opts.end ?? (lastPriceDate > sorted.at(-1)!.date ? lastPriceDate : sorted.at(-1)!.date);

  const lookup = new PriceLookup(prices);
  const native = new PriceLookup(opts.nativeThbPrices ?? {});
  const byDate = new Map<string, Transaction[]>();
  for (const t of sorted) {
    if (!byDate.has(t.date)) byDate.set(t.date, []);
    byDate.get(t.date)!.push(t);
  }

  const shares: Record<string, number> = {};
  const lastTrade: Record<string, number> = {};
  const lastThbTrade: Record<string, number> = {};
  const balances: Record<string, number> = {};
  let netDeposits = 0;
  let benchShares = 0;
  const out: NavPoint[] = [];

  for (const date of dateRange(start, end)) {
    let flow = 0;
    const rate = opts.fxAt?.(date) ?? usdThb;
    const bp = lookup.get(bench, date) ?? 0;
    for (const t of byDate.get(date) ?? []) {
      const currency = opts.separateCash && t.currency.toUpperCase() === "THB" ? "THB" : "USD";
      const unit = currency === "THB" ? 1 / rate : 1;
      const k = fx(t, rate) / unit;
      let cash = balances[currency] ?? 0;
      const gross = t.shares * t.price * k;
      const fee = (t.commission || 0) * k;
      switch (t.action) {
        case "DEPOSIT": {
          const amt = (t.price && t.shares ? gross : (t.shares || t.price) * k);
          cash += amt;
          flow += amt * unit;
          break;
        }
        case "WITHDRAW": {
          const amt = (t.price && t.shares ? gross : (t.shares || t.price) * k);
          cash -= amt;
          flow -= amt * unit;
          break;
        }
        case "BUY": {
          const need = gross + fee;
          if (autoFund && cash < need) {
            const gap = need - cash;
            cash += gap;
            flow += gap * unit;
          }
          cash -= need;
          shares[t.ticker] = (shares[t.ticker] ?? 0) + t.shares;
          lastTrade[t.ticker] = t.price * k * unit;
          if (opts.nativeThbPrices?.[t.ticker] && t.currency === "THB") lastThbTrade[t.ticker] = t.price;
          break;
        }
        case "SELL": {
          cash += gross - fee;
          shares[t.ticker] = (shares[t.ticker] ?? 0) - t.shares;
          lastTrade[t.ticker] = t.price * k * unit;
          if (opts.nativeThbPrices?.[t.ticker] && t.currency === "THB") lastThbTrade[t.ticker] = t.price;
          break;
        }
        case "DIVIDEND":
          cash += (gross || t.price * k || 0) - fee;
          break;
        case "FEE":
          cash -= fee || gross || t.price * k || 0;
          break;
      }
      balances[currency] = cash;
    }
    netDeposits += flow;
    if (flow !== 0 && bp > 0) benchShares += flow / bp;

    let positions = 0;
    for (const [tk, n] of Object.entries(shares)) {
      if (Math.abs(n) < 1e-9) continue;
      const baht = native.get(tk, date) ?? lastThbTrade[tk];
      const p = baht !== undefined ? baht / rate : lookup.get(tk, date) ?? lastTrade[tk] ?? 0;
      positions += n * p;
    }
    const cash = (balances.USD ?? 0) + (balances.THB ?? 0) / rate;
    out.push({
      date,
      nav: positions + cash,
      positions,
      cash,
      netDeposits,
      flow,
      benchmark: benchShares * bp,
      benchmarkPrice: bp,
      ...(opts.separateCash ? { cashByCurrency: { ...balances } } : {}),
    });
  }
  return out;
}

/** Cumulative TWR series (fraction, 0.1 = +10%). Flows are treated as end-of-day. */
export function computeTwrSeries(nav: NavPoint[]): { date: string; twr: number }[] {
  const out: { date: string; twr: number }[] = [];
  let growth = 1;
  nav.forEach((p, i) => {
    // Trades execute at the day's close, so flows are end-of-day:
    // r = (NAV_t - flow_t) / NAV_{t-1} - 1. The first day has no prior capital.
    if (i > 0) {
      const base = nav[i - 1].nav;
      if (base > 1e-9) growth *= (p.nav - p.flow) / base;
    }
    out.push({ date: p.date, twr: growth - 1 });
  });
  return out;
}

export function computeTwr(nav: NavPoint[]): number {
  const s = computeTwrSeries(nav);
  return s.length ? s[s.length - 1].twr : 0;
}

/** Benchmark TWR (pure price return) over the same window. */
export function computeBenchmarkTwrSeries(nav: NavPoint[]): { date: string; twr: number }[] {
  const first = nav.find((p) => p.benchmarkPrice > 0);
  if (!first) return nav.map((p) => ({ date: p.date, twr: 0 }));
  return nav.map((p) => ({
    date: p.date,
    twr: p.benchmarkPrice > 0 ? p.benchmarkPrice / first.benchmarkPrice - 1 : 0,
  }));
}

export interface CashFlow {
  date: string;
  amount: number; // negative = money invested, positive = money received
}

/** IRR for dated flows. The default 365-day period returns an annualized rate. */
export function xirr(flows: CashFlow[], guess = 0.1, periodDays = 365): number {
  if (flows.length < 2 || !(periodDays > 0)) return NaN;
  if (!flows.some((f) => f.amount < 0) || !flows.some((f) => f.amount > 0)) return NaN;
  const t0 = toMs(flows[0].date);
  const periods = flows.map((f) => (toMs(f.date) - t0) / (periodDays * DAY));
  const npv = (r: number) => flows.reduce((s, f, i) => s + f.amount / Math.pow(1 + r, periods[i]), 0);
  const dnpv = (r: number) =>
    flows.reduce((s, f, i) => s - (periods[i] * f.amount) / Math.pow(1 + r, periods[i] + 1), 0);

  let r = guess;
  for (let i = 0; i < 100; i++) {
    const f = npv(r);
    const d = dnpv(r);
    if (!isFinite(f) || !isFinite(d) || d === 0) break;
    const next = r - f / d;
    if (next <= -0.999999) break;
    if (Math.abs(next - r) < 1e-10) return next;
    r = next;
  }
  let lo = -0.9999,
    hi = 100;
  let flo = npv(lo);
  if (flo * npv(hi) > 0) return NaN;
  for (let i = 0; i < 300; i++) {
    const mid = (lo + hi) / 2;
    const fm = npv(mid);
    if (Math.abs(fm) < 1e-9) return mid;
    if (flo * fm < 0) hi = mid;
    else {
      lo = mid;
      flo = fm;
    }
  }
  return (lo + hi) / 2;
}

/** Money-weighted return (annualized XIRR) of the portfolio, or of the benchmark when `useBenchmark`. */
export function computeMwr(nav: NavPoint[], useBenchmark = false): number {
  if (nav.length === 0) return NaN;
  const flows: CashFlow[] = nav.filter((p) => p.flow !== 0).map((p) => ({ date: p.date, amount: -p.flow }));
  const last = nav[nav.length - 1];
  flows.push({ date: last.date, amount: useBenchmark ? last.benchmark : last.nav });
  return xirr(flows);
}

export interface PerformanceSummary {
  twr: number;
  twrAnnualized: number;
  mwr: number;
  benchmarkTwr: number;
  benchmarkMwr: number;
  alpha: number; // twr - benchmarkTwr
  totalGain: number;
  currentNav: number;
  netDeposits: number;
}

export function summarize(nav: NavPoint[]): PerformanceSummary {
  if (nav.length === 0)
    return { twr: 0, twrAnnualized: 0, mwr: NaN, benchmarkTwr: 0, benchmarkMwr: NaN, alpha: 0, totalGain: 0, currentNav: 0, netDeposits: 0 };
  const twr = computeTwr(nav);
  const b = computeBenchmarkTwrSeries(nav);
  const benchmarkTwr = b.at(-1)!.twr;
  const days = Math.max(1, (toMs(nav.at(-1)!.date) - toMs(nav[0].date)) / DAY);
  const last = nav.at(-1)!;
  return {
    twr,
    twrAnnualized: days >= 365 ? Math.pow(1 + twr, 365 / days) - 1 : twr,
    mwr: computeMwr(nav),
    benchmarkTwr,
    benchmarkMwr: computeMwr(nav, true),
    alpha: twr - benchmarkTwr,
    totalGain: last.nav - last.netDeposits,
    currentNav: last.nav,
    netDeposits: last.netDeposits,
  };
}

/** Period-return table (monthly/quarterly/annual) from NAV, TWR-chained, with benchmark. */
export function periodReturns(
  nav: NavPoint[],
  period: "month" | "quarter" | "year"
): { period: string; portfolio: number; benchmark: number }[] {
  const key = (d: string) => {
    const y = d.slice(0, 4);
    const m = +d.slice(5, 7);
    return period === "year" ? y : period === "quarter" ? `${y} Q${Math.ceil(m / 3)}` : d.slice(0, 7);
  };
  const twr = computeTwrSeries(nav);
  const groups = new Map<string, { startIdx: number; endIdx: number }>();
  nav.forEach((p, i) => {
    const k = key(p.date);
    const g = groups.get(k);
    if (!g) groups.set(k, { startIdx: i, endIdx: i });
    else g.endIdx = i;
  });
  return [...groups.entries()].map(([k, g]) => {
    const g0 = g.startIdx > 0 ? 1 + twr[g.startIdx - 1].twr : 1;
    const portfolio = (1 + twr[g.endIdx].twr) / g0 - 1;
    const b0 = g.startIdx > 0 ? nav[g.startIdx - 1].benchmarkPrice : nav[g.startIdx].benchmarkPrice;
    const b1 = nav[g.endIdx].benchmarkPrice;
    return { period: k, portfolio, benchmark: b0 > 0 ? b1 / b0 - 1 : 0 };
  });
}
