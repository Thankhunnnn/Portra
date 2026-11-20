import { computeTwr, toMs, xirr, type NavPoint } from "./portfolioEngine";

export const RETURN_METHODS = ["MWR", "TWR", "SR"] as const;
export type ReturnMethod = (typeof RETURN_METHODS)[number];

export function returnForWindow(points: NavPoint[], method: ReturnMethod, hasOpening: boolean, annualized = false) {
  const end = points.at(-1);
  if (!end || points.length < 2) return NaN;
  const first = points[0];
  const years = (toMs(end.date) - toMs(first.date)) / (365 * 86400000);
  if (!(years > 0)) return NaN;
  const flows = hasOpening ? points.slice(1) : points;
  const opening = hasOpening ? first.nav : 0;
  if (method === "MWR") {
    const cashFlows = flows.filter((point) => point.flow !== 0).map((point) => ({ date: point.date, amount: -point.flow }));
    if (opening !== 0) cashFlows.unshift({ date: first.date, amount: -opening });
    cashFlows.push({ date: end.date, amount: end.nav });
    const rate = xirr(cashFlows, 0.1, years * 365);
    return annualized ? (1 + rate) ** (1 / years) - 1 : rate;
  }
  const invested = opening + flows.reduce((sum, point) => sum + point.flow, 0);
  const result = method === "TWR" ? computeTwr(points) : invested > 0 ? (end.nav - invested) / invested : NaN;
  return annualized ? (1 + result) ** (1 / years) - 1 : result;
}
