import { describe, it, expect } from "vitest";
import { buildLots, lotStats } from "./lots";
import type { Transaction } from "./portfolioEngine";

const tx = (p: Partial<Transaction>): Transaction => ({ date: "2024-01-01", ticker: "X", action: "BUY", shares: 10, price: 10, commission: 0, currency: "USD", ...p });
const bench = (d: string) => (d < "2024-06-01" ? 100 : 110);

describe("buildLots", () => {
  it("pairs a sale listed before its same-day fractional purchase", () => {
    const lots = buildLots([
      tx({ action: "SELL", shares: 2.5, price: 12 }),
      tx({ shares: 2.5, price: 10 }),
    ], 20, "2024-01-02", () => undefined);
    expect(lots).toHaveLength(1);
    expect(lots[0]).toMatchObject({ open: false, shares: 2.5, gain: 5 });
  });

  it("keeps transferred and stock-dividend shares in the position without fabricating a sale", () => {
    const lots = buildLots([
      tx({ action: "TRANSFER_IN", shares: 2, price: 10 }),
      tx({ action: "STOCK_DIVIDEND", shares: 0.5, price: 0 }),
      tx({ action: "TRANSFER_OUT", shares: 1, date: "2024-01-02" }),
    ], 20, "2024-01-03", () => undefined);
    expect(lots.every((lot) => lot.open)).toBe(true);
    expect(lots.reduce((sum, lot) => sum + lot.shares, 0)).toBe(1.5);
  });
  it("matches sells FIFO and keeps remainder open", () => {
    const lots = buildLots(
      [tx({}), tx({ date: "2024-02-01", price: 20 }), tx({ date: "2024-07-01", action: "SELL", shares: 15, price: 30 })],
      40, "2024-12-31", bench
    );
    const closed = lots.filter((l) => !l.open);
    const open = lots.filter((l) => l.open);
    expect(closed.map((l) => l.shares).sort()).toEqual([10, 5]);
    expect(closed.reduce((s, l) => s + l.gain, 0)).toBeCloseTo(10 * 20 + 5 * 10);
    expect(open).toHaveLength(1);
    expect(open[0].shares).toBe(5);
    expect(open[0].gain).toBeCloseTo(5 * 20);
  });
  it.each([["LIFO", 200, 100], ["Weighted Average", 150, 150]] as const)(
    "uses %s to assign cost basis",
    (method, closedCost, openCost) => {
      const lots = buildLots([
        tx({}), tx({ date: "2024-02-01", price: 20 }),
        tx({ date: "2024-07-01", action: "SELL", shares: 10, price: 30 }),
      ], 40, "2024-12-31", bench, 35, method);
      expect(lots.find((lot) => !lot.open)?.cost).toBeCloseTo(closedCost);
      expect(lots.find((lot) => lot.open)?.cost).toBeCloseTo(openCost);
    }
  );
  it("computes alpha vs benchmark and stats", () => {
    const lots = buildLots([tx({})], 11, "2024-12-31", bench);
    expect(lots[0].ret).toBeCloseTo(0.1);
    expect(lots[0].alpha).toBeCloseTo(0); // bench +10%
    const s = lotStats(lots);
    expect(s.winRate).toBe(1);
    expect(s.winRateVsBench).toBe(0);
  });
});
