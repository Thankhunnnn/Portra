import { PriceLookup, type NavPoint, type PriceMap } from "./portfolioEngine";

export const BENCHMARKS = [
  { ticker: "^GSPC", name: "S&P 500", color: "#a4a8b7" },
  { ticker: "^NYA", name: "NYSE Composite", color: "#ebbb72" },
  { ticker: "^IXIC", name: "Nasdaq Composite", color: "#6ab9fb" },
  { ticker: "VOO", name: "VOO", color: "#4dd0a5" },
  { ticker: "QQQ", name: "QQQ", color: "#c594fa" },
] as const;

export function benchmarkPath(nav: NavPoint[], prices: PriceMap, ticker: string) {
  const lookup = new PriceLookup({ [ticker]: prices[ticker] ?? {} });
  let shares = 0;
  let pending = 0;
  return nav.map((point) => {
    const price = lookup.get(ticker, point.date);
    pending += point.flow;
    if (!price) return { date: point.date, price, value: undefined, flow: 0 };
    const flow = pending;
    shares += flow / price;
    pending = 0;
    return { date: point.date, price, value: shares * price, flow };
  });
}
