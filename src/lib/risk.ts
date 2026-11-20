import { toMs, type NavPoint } from "./portfolioEngine";

const daysPerYear = 365;
const dayMs = 86_400_000;

export function riskMetrics(nav: NavPoint[], minimumDays = 180) {
  const elapsed = nav.length > 1 ? (toMs(nav.at(-1)!.date) - toMs(nav[0].date)) / dayMs : 0;
  let wealth = 1;
  let peak = 1;
  let peakDate = nav[0]?.date;
  let longest = 0;
  let maxDrawdown = 0;
  let underwater = false;
  let trough = "";
  const returns: number[] = [];
  const paired: [number, number][] = [];
  const series = nav.map((point, i) => {
    const prev = nav[i - 1];
    if (prev && prev.nav > 1e-9) {
      const change = (point.nav - point.flow) / prev.nav - 1;
      returns.push(change);
      wealth *= 1 + change;
      if (prev.benchmarkPrice > 0 && point.benchmarkPrice > 0) paired.push([change, point.benchmarkPrice / prev.benchmarkPrice - 1]);
    }
    if (wealth >= peak) {
      if (underwater && peakDate) longest = Math.max(longest, (toMs(point.date) - toMs(peakDate)) / dayMs);
      peak = wealth;
      peakDate = point.date;
    }
    const drawdown = wealth / peak - 1;
    if (drawdown < maxDrawdown) { maxDrawdown = drawdown; trough = point.date; }
    underwater = drawdown < 0;
    if (underwater && peakDate) longest = Math.max(longest, (toMs(point.date) - toMs(peakDate)) / dayMs);
    return { date: point.date, drawdown };
  });
  const mean = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : NaN;
  const avg = mean(returns);
  const volatility = returns.length > 1
    ? Math.sqrt(returns.reduce((total, value) => total + (value - avg) ** 2, 0) / (returns.length - 1) * daysPerYear)
    : NaN;
  const downside = Math.sqrt(mean(returns.map((value) => Math.min(0, value) ** 2)) * daysPerYear);
  const benchmarkMean = mean(paired.map((pair) => pair[1]));
  const pairedMean = mean(paired.map((pair) => pair[0]));
  const benchmarkVariance = paired.reduce((sum, [, b]) => sum + (b - benchmarkMean) ** 2, 0);
  const beta = paired.length > 1 && benchmarkVariance > 0
    ? paired.reduce((sum, [p, b]) => sum + (p - pairedMean) * (b - benchmarkMean), 0) / benchmarkVariance : NaN;
  const annual = elapsed >= minimumDays;
  const cagr = annual && wealth >= 0 ? wealth ** (daysPerYear / elapsed) - 1 : NaN;
  return {
    series, trough, longest,
    current: returns.length ? series.at(-1)!.drawdown : NaN,
    maxDrawdown: returns.length ? maxDrawdown : NaN,
    total: returns.length ? wealth - 1 : NaN,
    volatility, beta,
    alpha: annual ? (pairedMean - beta * benchmarkMean) * daysPerYear : NaN,
    sharpe: annual && volatility > 0 ? avg * daysPerYear / volatility : NaN,
    sortino: annual && downside > 0 ? avg * daysPerYear / downside : NaN,
    calmar: maxDrawdown < 0 ? cagr / -maxDrawdown : NaN,
  };
}
