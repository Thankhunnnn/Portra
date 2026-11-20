import { describe, it, expect } from "vitest";
import {
  computeNav,
  computeTwr,
  computeMwr,
  computeTwrSeries,
  computeBenchmarkTwrSeries,
  xirr,
  normalizeAction,
  periodReturns,
  summarize,
  dateRange,
  type Transaction,
  type PriceMap,
} from "./portfolioEngine";

const tx = (p: Partial<Transaction>): Transaction => ({
  date: "2024-01-01",
  ticker: "",
  action: "BUY",
  shares: 0,
  price: 0,
  commission: 0,
  currency: "USD",
  ...p,
});

function series(start: string, values: number[]): Record<string, number> {
  const days = dateRange(start, "2099-01-01").slice(0, values.length);
  return Object.fromEntries(days.map((d, i) => [d, values[i]]));
}

describe("normalizeAction", () => {
  it("maps common labels", () => {
    expect(normalizeAction("Buy")).toBe("BUY");
    expect(normalizeAction("SELL")).toBe("SELL");
    expect(normalizeAction("Deposit")).toBe("DEPOSIT");
    expect(normalizeAction("Cash out")).toBe("WITHDRAW");
    expect(normalizeAction("Dividend")).toBe("DIVIDEND");
    expect(normalizeAction("???")).toBe("OTHER");
  });
});

describe("xirr", () => {
  it("matches a simple one-year 10% case", () => {
    const r = xirr([
      { date: "2023-01-01", amount: -1000 },
      { date: "2024-01-01", amount: 1100 },
    ]);
    expect(r).toBeCloseTo(0.1, 3);
  });
  it("handles negative returns", () => {
    const r = xirr([
      { date: "2023-01-01", amount: -1000 },
      { date: "2024-01-01", amount: 800 },
    ]);
    expect(r).toBeCloseTo(-0.2, 3);
  });
  it("returns NaN without both signs", () => {
    expect(xirr([{ date: "2023-01-01", amount: -1 }, { date: "2023-02-01", amount: -1 }])).toBeNaN();
  });
});

describe("computeNav", () => {
  const prices: PriceMap = {
    AAA: series("2024-01-01", [10, 11, 12, 12]),
    "^GSPC": series("2024-01-01", [100, 100, 110, 110]),
  };

  it("tracks cash, positions and net deposits", () => {
    const nav = computeNav(
      [
        tx({ action: "DEPOSIT", shares: 1000, price: 1 }),
        tx({ date: "2024-01-01", ticker: "AAA", action: "BUY", shares: 10, price: 10, commission: 1 }),
      ],
      prices
    );
    expect(nav).toHaveLength(4);
    expect(nav[0].cash).toBeCloseTo(1000 - 101);
    expect(nav[0].positions).toBeCloseTo(100);
    expect(nav[2].positions).toBeCloseTo(120);
    expect(nav[2].netDeposits).toBe(1000);
    expect(nav[2].nav).toBeCloseTo(899 + 120);
  });

  it("auto-funds buys when no deposits exist", () => {
    const nav = computeNav([tx({ ticker: "AAA", shares: 10, price: 10 })], prices);
    expect(nav[0].netDeposits).toBeCloseTo(100);
    expect(nav[0].cash).toBeCloseTo(0);
  });

  it("uses broker cash at the end of the snapshot day and carries subsequent transactions", () => {
    const nav = computeNav([
      tx({ account: "Webull", date: "2024-01-01", ticker: "AAA", action: "BUY", shares: 10, price: 10 }),
      tx({ account: "Dime", date: "2024-01-01", action: "DEPOSIT", shares: 1, price: 200 }),
      tx({ account: "Webull", date: "2024-01-03", ticker: "AAA", action: "SELL", shares: 2, price: 12 }),
    ], prices, { cashSnapshots: [{ account: "Webull", date: "2024-01-02", currency: "USD", balance: 122.41 }] });
    expect(nav[1].flow).toBeCloseTo(122.41);
    expect(nav[1].cash).toBeCloseTo(322.41);
    expect(nav[2].cash).toBeCloseTo(346.41);
    expect(nav[2].flow).toBe(0);
    expect(nav[2].positions).toBeCloseTo(96);
  });

  it("distinguishes charges and income from cash and stock transfers", () => {
    const nav = computeNav([
      tx({ account: "A", action: "DEPOSIT", shares: 1, price: 100 }),
      tx({ account: "A", ticker: "CASH", action: "TRANSFER_OUT", shares: 1, price: 30 }),
      tx({ account: "B", ticker: "CASH", action: "TRANSFER_IN", shares: 1, price: 30 }),
      tx({ account: "B", ticker: "AAA", action: "TRANSFER_IN", shares: 10, price: 10 }),
      tx({ account: "B", ticker: "AAA", action: "STOCK_DIVIDEND", shares: 2, price: 0 }),
      tx({ account: "B", ticker: "CASH", action: "INTEREST_INCOME", shares: 1, price: 5 }),
      tx({ account: "B", ticker: "CASH", action: "INTEREST_EXPENSE", shares: 1, price: 2 }),
      tx({ account: "B", ticker: "CASH", action: "TAX", shares: 1, price: 1 }),
    ], prices);
    expect(nav[0]).toMatchObject({ cash: 102, positions: 120, netDeposits: 200 });
    expect(normalizeAction("Stock dividend")).toBe("STOCK_DIVIDEND");
    expect(normalizeAction("Interest expense")).toBe("INTEREST_EXPENSE");
    expect(normalizeAction("Taxes")).toBe("TAX");
  });

  it("converts gross THB dividends and fees once", () => {
    const nav = computeNav([
      tx({ date: "2024-01-02", ticker: "AAA", action: "DIVIDEND", shares: 2, price: 180, commission: 36, currency: "THB" }),
    ], {}, { usdThb: 36, end: "2024-01-02" });
    expect(nav.at(-1)?.cash).toBeCloseTo(9);
  });

  it("tracks THB cash without treating changes in FX as contributions", () => {
    const nav = computeNav([
      tx({ action: "DEPOSIT", shares: 1, price: 3600, currency: "THB" }),
      tx({ action: "DEPOSIT", shares: 1, price: 50 }),
    ], {}, { separateCash: true, fxAt: (date) => date === "2024-01-01" ? 36 : 30, end: "2024-01-02" });
    expect(nav[0].cash).toBe(150);
    expect(nav[1].cash).toBe(170);
    expect(nav[1].cashByCurrency).toEqual({ THB: 3600, USD: 50 });
    expect(nav[1].netDeposits).toBe(150);
    expect(nav[1].flow).toBe(0);
  });

  it("handles sells and THB conversion", () => {
    const nav = computeNav(
      [
        tx({ ticker: "AAA", shares: 10, price: 10 }),
        tx({ date: "2024-01-03", ticker: "AAA", action: "SELL", shares: 10, price: 360, currency: "THB" }),
      ],
      prices,
      { usdThb: 36 }
    );
    expect(nav[3].positions).toBeCloseTo(0);
    expect(nav[3].cash).toBeCloseTo(100);
  });

  it("builds the benchmark from the same cash flows", () => {
    const nav = computeNav([tx({ ticker: "AAA", shares: 10, price: 10 })], prices);
    // $100 into index at 100 -> 1 share; at 110 -> 110
    expect(nav[2].benchmark).toBeCloseTo(110);
  });
});

describe("TWR", () => {
  const prices: PriceMap = {
    AAA: series("2024-01-01", [10, 11, 12.1, 12.1]),
    "^GSPC": series("2024-01-01", [100, 100, 110, 110]),
  };
  it("is unaffected by deposit timing", () => {
    const nav = computeNav(
      [
        tx({ ticker: "AAA", shares: 10, price: 10 }),
        tx({ date: "2024-01-03", ticker: "AAA", shares: 100, price: 12.1 }),
      ],
      prices
    );
    // 10% then 10% => 21%, big flow on day 3 must not distort
    expect(computeTwr(nav)).toBeCloseTo(0.21, 4);
  });
  it("series is monotonic length and starts at 0 for flat first day", () => {
    const nav = computeNav([tx({ ticker: "AAA", shares: 10, price: 10 })], prices);
    const s = computeTwrSeries(nav);
    expect(s).toHaveLength(nav.length);
    expect(s[0].twr).toBeCloseTo(0);
  });
  it("benchmark TWR is price return", () => {
    const nav = computeNav([tx({ ticker: "AAA", shares: 10, price: 10 })], prices);
    expect(computeBenchmarkTwrSeries(nav).at(-1)!.twr).toBeCloseTo(0.1);
  });
});

describe("MWR & summary", () => {
  it("MWR is positive for a gain and summary is consistent", () => {
    const prices: PriceMap = {
      AAA: series("2024-01-01", [10, 12, 14, 15]),
      "^GSPC": series("2024-01-01", [100, 101, 102, 103]),
    };
    const nav = computeNav([tx({ ticker: "AAA", shares: 10, price: 10 })], prices);
    expect(computeMwr(nav)).toBeGreaterThan(0);
    const s = summarize(nav);
    expect(s.totalGain).toBeCloseTo(50);
    expect(s.twr).toBeCloseTo(0.5, 4);
    expect(s.alpha).toBeCloseTo(0.5 - 0.03, 4);
  });
  it("empty input is safe", () => {
    expect(summarize([]).currentNav).toBe(0);
  });
});

describe("periodReturns", () => {
  it("chains months to total", () => {
    const prices: PriceMap = {
      AAA: { "2024-01-01": 10, "2024-01-31": 11, "2024-02-01": 11, "2024-02-29": 12.1 },
      "^GSPC": { "2024-01-01": 100, "2024-02-29": 110 },
    };
    const nav = computeNav([tx({ ticker: "AAA", shares: 10, price: 10 })], prices);
    const m = periodReturns(nav, "month");
    expect(m.map((x) => x.period)).toEqual(["2024-01", "2024-02"]);
    const total = m.reduce((g, x) => g * (1 + x.portfolio), 1) - 1;
    expect(total).toBeCloseTo(computeTwr(nav), 6);
  });
});
