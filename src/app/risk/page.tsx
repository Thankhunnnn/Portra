"use client";

import { useMemo, useState } from "react";
import { usePortfolio } from "@/context/portfolio";
import { DataTable, Metrics, panelClass, ReportChart } from "@/components/Reports";
import { Segmented } from "@/components/ui/segmented";
import { PERIODS, periodStart } from "@/components/charts/ValueChart";
import { fmtDate, toMs } from "@/lib/portfolioEngine";
import { riskMetrics } from "@/lib/risk";
import { fmtNum, fmtPct, gainClass } from "@/lib/utils";

const periods = ["1w", ...PERIODS] as const;
type RiskPeriod = (typeof periods)[number];
const measures = ["Drawdown", "Volatility", "Sharpe", "Sortino", "Beta", "Alpha"] as const;
const seriesKeys = { Drawdown: "maxDrawdown", Volatility: "volatility", Sharpe: "sharpe", Sortino: "sortino", Beta: "beta", Alpha: "alpha" } as const;
const isPct = (measure: (typeof measures)[number]) => measure === "Drawdown" || measure === "Volatility" || measure === "Alpha";
const reportRows = [
  ["Return", "total", true], ["Volatility", "volatility", true], ["Sharpe", "sharpe", false],
  ["Sortino", "sortino", false], ["Max drawdown", "maxDrawdown", true], ["Beta", "beta", false],
  ["Alpha", "alpha", true], ["Calmar", "calmar", false],
] as const;

export default function Risk() {
  const { nav } = usePortfolio();
  const [period, setPeriod] = useState<RiskPeriod>("All");
  const [measure, setMeasure] = useState<(typeof measures)[number]>("Drawdown");
  const start = (range: RiskPeriod) => {
    if (!nav.length) return "";
    const end = nav.at(-1)!.date;
    return range === "1w" ? fmtDate(toMs(end) - 7 * 86_400_000) : periodStart(range, end, nav[0].date);
  };
  const summaries = Object.fromEntries(periods.map((range) => [range, riskMetrics(nav.filter((point) => point.date >= start(range)))]));
  const selected = summaries[period];
  const rolling = useMemo(() => measure === "Drawdown" ? [] : nav.flatMap((point, index) => {
    // A 180-day trailing window; NAV has one row per calendar day.
    if (index < 180) return [];
    const result = riskMetrics(nav.slice(index - 180, index + 1));
    const value = result[seriesKeys[measure]];
    return Number.isFinite(value) ? [{ date: point.date, value }] : [];
  }), [measure, nav]);
  const chart = measure === "Drawdown"
    ? selected.series.map((p) => ({ date: p.date, value: p.drawdown }))
    : rolling.filter((p) => p.date >= start(period));
  const negative = (n: number) => <span className={gainClass(n)}>{fmtPct(n)}</span>;

  return <div className="space-y-5">
    <h1 className="text-2xl font-semibold">Risk</h1>
    <Segmented label="Risk period" options={periods} value={period} onChange={setPeriod} />
    <Metrics items={[
      { label: "Max drawdown", value: negative(selected.maxDrawdown), detail: selected.trough ? `Trough ${selected.trough}` : undefined },
      { label: "Current drawdown", value: negative(selected.current) },
      { label: "Longest drawdown", value: Number.isFinite(selected.current) ? `${selected.longest} days` : "–" },
      { label: "Annualized volatility", value: fmtPct(selected.volatility, 2, false) },
      { label: "Sharpe ratio", value: fmtNum(selected.sharpe) },
      { label: "Sortino ratio", value: fmtNum(selected.sortino) },
      { label: "Calmar ratio", value: fmtNum(selected.calmar) },
      { label: "Beta / annualized alpha", value: <>{fmtNum(selected.beta)} <span className="text-mute">/</span> {negative(selected.alpha)}</> },
    ]} />
    <section className={panelClass}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">Risk over time</h2>
        <Segmented className="max-w-full flex-wrap" label="Risk measure" options={measures} value={measure} onChange={setMeasure} />
      </div>
      <ReportChart key={`${period}-${measure}`} label="Risk history chart" data={chart}
        format={isPct(measure) ? (v) => fmtPct(v, 1, false) : fmtNum}
        series={[{ key: "value", name: measure === "Drawdown" ? "Drawdown from period peak" : `${measure} · trailing 180 days`,
          color: measure === "Drawdown" ? "#f07886" : "#a98aff", kind: "area" }]} />
    </section>
    <section className={panelClass}>
      <h2 className="font-semibold">Risk by period</h2>
      <DataTable headings={["Metric", ...periods]}>{reportRows.map(([label, key, pct]) => <tr key={key}>
        <td className="font-medium">{label}</td>
        {periods.map((range) => {
          const value = summaries[range][key];
          return <td key={range} className={value < 0 ? "text-loss" : ""}>{pct ? fmtPct(value, 2, false) : fmtNum(value)}</td>;
        })}
      </tr>)}</DataTable>
      <p className="mt-3 text-xs text-mute">Drawdown uses cash-flow-adjusted returns. Sharpe and Sortino use a 0% risk-free rate. Sharpe, Sortino, Calmar and alpha require at least 180 days of history.</p>
    </section>
  </div>;
}
