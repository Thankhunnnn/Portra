import { describe, expect, it } from "vitest";
import { benchmarkPath } from "./benchmarks";
import { computeNav } from "./portfolioEngine";
import { returnForWindow } from "./performance";
import { parseDashboard, parseDividendSchedule, parseExtendedPrices, parseFxRates, parseTransactions } from "./sheets";

describe("Portra sheet feeds", () => {
  it("reads serial dates and preserves quote provenance", () => {
    const quotes = parseExtendedPrices([
      ["Ticker", "Latest Price", "Regular Close", "Currency", "Last Updated", "Source", "Session"],
      ["VOO", 658, 671, "USD", 46345.5, "Google Finance", "REGULAR / DELAYED"],
    ]);
    expect(quotes[0]).toMatchObject({ ticker: "VOO", source: "Google Finance", updated: "2026-11-19 12:00 ICT", currency: "USD" });
    expect(parseDashboard([["Metric", "Value"], ["USD / THB Rate", 33.9165]]).usdThb).toBe(33.9165);
    expect(parseTransactions([["Date", "Ticker", "Action", "Shares", "Price"]], "Portfolio")).toEqual([]);
    expect(() => parseTransactions([["Date", "Ticker"]], "Portfolio")).toThrow("missing columns");
  });

  it("separates verified-source declarations from estimates and reads dated FX overrides", () => {
    expect(parseFxRates([["Date", "Pair", "Rate", "Source"], ["2026-11-20", "USD/THB", 33.91, "Sheet entry"]]))
      .toEqual([{ date: "2026-11-20", rate: 33.91, source: "Sheet entry" }]);
    const header = ["Ticker", "Ex Date", "Payment Date", "Amount Per Share", "Currency", "Status", "Source"];
    expect(parseDividendSchedule([header,
      ["VOO", "2026-12-01", "2026-12-15", 2, "USD", "Announced", "Issuer announcement"],
      ["QQQ", "2026-12-01", "2026-12-15", 1, "USD", "Announced", ""],
    ]).map((row) => row.announced)).toEqual([true, false]);
  });
});

describe("performance windows", () => {
  it("matches benchmark deposits and avoids counting the opening cash flow twice", () => {
    const prices = { VOO: { "2024-01-01": 100, "2024-01-02": 110, "2024-01-03": 121 } };
    const nav = computeNav([{ date: "2024-01-01", ticker: "VOO", action: "BUY", shares: 2, price: 100, currency: "USD", commission: 0 }], prices);
    const path = benchmarkPath(nav, prices, "VOO");
    expect(path.at(-1)?.value).toBe(242);
    for (const method of ["MWR", "TWR", "SR"] as const) {
      expect(returnForWindow(nav.slice(1), method, true)).toBeCloseTo(0.1, 4);
    }
  });
});
