"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePortfolio } from "@/context/portfolio";
import { periodStart } from "@/components/charts/ValueChart";
import { SummaryHeader, SummaryTabs } from "@/components/Summary";
import { Segmented } from "@/components/ui/segmented";
import { controlClass, DataTable, panelClass, ReportChart } from "@/components/Reports";
import { BENCHMARKS, benchmarkPath } from "@/lib/benchmarks";
import { returnForWindow, RETURN_METHODS, type ReturnMethod } from "@/lib/performance";
import { addMonths } from "@/lib/reportDates";
import { fmtMoney, fmtPct, gainClass } from "@/lib/utils";

const windows = ["1 M", "3 M", "6 M", "YTD", "1 Yr", "2 Yr", "5 Yr", "All", "Annualized"];
const granularities = ["Monthly", "Quarterly", "Annually"] as const;
const historyViews = ["Return", "Balance"] as const;

function heat(value: number) {
  if (!Number.isFinite(value) || value === 0) return undefined;
  const alpha = Math.min(0.78, 0.16 + Math.abs(value) * 6);
  return `rgb(${value > 0 ? "38 167 135" : "221 83 111"} / ${alpha})`;
}

export default function Performance() {
  const { nav, prices, settings, currency, fxAt } = usePortfolio();
  const [method, setMethod] = useState<ReturnMethod>("MWR");
  const [historyMethod, setHistoryMethod] = useState<ReturnMethod>("MWR");
  const [gran, setGran] = useState<(typeof granularities)[number]>("Monthly");
  const [view, setView] = useState<(typeof historyViews)[number]>("Return");
  const [excess, setExcess] = useState(false);
  const [benchmark, setBenchmark] = useState<string>("^GSPC");
  const active = useMemo(() => BENCHMARKS.filter(({ ticker }) => settings.benchmarks.includes(ticker)), [settings.benchmarks]);
  const primary = active.find((index) => index.ticker === benchmark) ?? active[0];
  const viewExcess = view === "Return" && excess && Boolean(primary);
  const money = (value: number) => fmtMoney(value, currency);

  const report = useMemo(() => {
    if (!nav.length) return { comparison: [], history: [] };
    const first = nav[0];
    const end = nav.at(-1)!;
    const windowStarts = [addMonths(end.date, -1), addMonths(end.date, -3), addMonths(end.date, -6),
      periodStart("Ytd", end.date, first.date), addMonths(end.date, -12), addMonths(end.date, -24),
      addMonths(end.date, -60), first.date, first.date];
    const series = [
      { name: "My Portfolio", points: nav },
      ...active.map(({ name, ticker }) => {
        const path = benchmarkPath(nav, prices, ticker);
        return { name, points: nav.map((point, i) => ({ ...point, nav: path[i].value ?? NaN, flow: path[i].flow })) };
      }),
    ];
    const rangeReturn = (points: typeof nav, start: number, stop: number, mode: ReturnMethod, annualized = false) => {
      const segment = points.slice(Math.max(0, start - 1), stop + 1);
      if (segment.some((point) => !Number.isFinite(point.nav))) return NaN;
      return returnForWindow(segment, mode, start > 0, annualized);
    };
    const comparison = series.map(({ name, points }) => ({
      name,
      cells: windowStarts.map((date, index) => {
        if ((index === 5 || index === 6) && date < first.date) return NaN;
        if (index === 8 && end.date < addMonths(first.date, 12)) return NaN;
        return rangeReturn(points, points.findIndex((p) => p.date >= date), points.length - 1, method, index === 8);
      }),
    }));
    const periods = new Map<string, { start: number; stop: number }>();
    for (const [i, point] of nav.entries()) {
      const year = point.date.slice(0, 4);
      const key = gran === "Monthly" ? point.date.slice(0, 7) : gran === "Quarterly" ? `${year} Q${Math.ceil(+point.date.slice(5, 7) / 3)}` : year;
      periods.set(key, { start: periods.get(key)?.start ?? i, stop: i });
    }
    const bench = series.find(({ name }) => name === primary?.name)?.points;
    const history = [...periods].map(([date, { start, stop }]) => {
      const rate = currency === "THB" ? fxAt(nav[stop].date) : 1;
      const portfolio = view === "Balance" ? nav[stop].nav * rate : rangeReturn(nav, start, stop, historyMethod);
      const reference = !bench ? NaN : view === "Balance" ? bench[stop].nav * rate : rangeReturn(bench, start, stop, historyMethod);
      return { date, portfolio, benchmark: reference, difference: portfolio - reference };
    });
    return { comparison, history };
  }, [nav, prices, active, primary, method, gran, view, historyMethod, currency, fxAt]);

  const series = [
    ...(!viewExcess ? [{ key: "portfolio", name: "My Portfolio", color: "#a88aff", kind: "bar" as const }] : []),
    ...(primary && !viewExcess ? [{ key: "benchmark", name: primary.name, color: "#61c8d8", kind: "bar" as const }] : []),
    ...(viewExcess ? [{ key: "difference", name: `vs ${primary?.name}`, color: "#4bcfa9", kind: "bar" as const }] : []),
  ];
  const format = view === "Balance" ? money : fmtPct;

  return <div className="space-y-5">
    <h1 className="text-2xl font-semibold">Performance</h1>
    <SummaryHeader />
    <SummaryTabs />
    <section className={panelClass}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Total Return vs Benchmarks</h2>
          <Link className="text-xs text-brand hover:underline" href="/settings#benchmarks">Edit benchmarks</Link>
        </div>
        <Segmented label="Comparison return method" options={RETURN_METHODS} value={method} onChange={setMethod} />
      </div>
      <DataTable headings={["Benchmark", ...windows]}>
        {report.comparison.map(({ name, cells }) => <tr key={name}><td className="font-semibold">{name}</td>
          {cells.map((value, i) => <td className={gainClass(value)} key={windows[i]}>{fmtPct(value)}</td>)}
        </tr>)}
        {!report.comparison.length && <tr><td colSpan={10} className="text-center text-mute">No portfolio history yet</td></tr>}
      </DataTable>
      <p className="mt-3 text-xs text-mute">Benchmark history uses closing prices before dividends. Annualized values require at least one year of history.</p>
    </section>
    <section className={panelClass}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">Historical {view}</h2>
        <label className="flex items-center gap-2 text-sm text-sub"><input type="checkbox" checked={viewExcess} disabled={view === "Balance" || !primary} onChange={(event) => setExcess(event.target.checked)} />Excess return</label>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Segmented label="Granularity" options={granularities} value={gran} onChange={setGran} />
        <Segmented label="History view" options={historyViews} value={view} onChange={setView} />
        {view === "Return" && <Segmented label="Historical return method" options={RETURN_METHODS} value={historyMethod} onChange={setHistoryMethod} />}
        <select className={controlClass} aria-label="Historical benchmark" value={primary?.ticker ?? ""} onChange={(event) => setBenchmark(event.target.value)}>
          {!primary && <option value="">No benchmark selected</option>}
          {active.map((index) => <option key={index.ticker} value={index.ticker}>{index.name}</option>)}
        </select>
      </div>
      <ReportChart data={report.history} series={series} label={`Historical ${view.toLowerCase()} chart`} format={(value) => format(value)} />
      <DataTable headings={["Period", "My Portfolio", ...(primary ? [primary.name, `vs ${primary.name}`] : [])]}>
        {[...report.history].reverse().map((row) => <tr key={row.date}>
          <td className="font-semibold">{row.date}</td>
          {(primary ? [row.portfolio, row.benchmark, row.difference] : [row.portfolio]).map((value, i) =>
            <td key={i} className="text-center font-medium" style={{ backgroundColor: view === "Return" ? heat(value) : undefined }}>{format(value)}</td>)}
        </tr>)}
        {!report.history.length && <tr><td colSpan={primary ? 4 : 2} className="text-center text-mute">No historical data</td></tr>}
      </DataTable>
    </section>
  </div>;
}
