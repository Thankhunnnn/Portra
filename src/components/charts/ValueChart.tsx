"use client";
import { useChartMotion } from "@/components/charts/useChartMotion";
import { useMemo, useState } from "react";
import { Area, Brush, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useUi } from "@/components/shell/ui-context";
import { usePortfolio } from "@/context/portfolio";
import { Segmented } from "@/components/ui/segmented";
import { computeTwrSeries, toMs, fmtDate } from "@/lib/portfolioEngine";
import { BENCHMARKS, benchmarkPath } from "@/lib/benchmarks";
import { fmtMoney, fmtNum, fmtPct } from "@/lib/utils";
import { AXIS, CURSOR, ChartTooltip, GRID, fmtLongDate } from "./ChartTooltip";

const MODES = ["Value", "Return", "Gain", "Cash"] as const;
type Mode = (typeof MODES)[number];
const SERIES = [
  { key: "portfolio", label: "Portfolio", color: "#bab4ff" },

  { key: "deposits", label: "Cash Deposits", color: "#64718f" },
] as const;
export const PERIODS = ["1m", "3m", "6m", "Ytd", "1y", "All"] as const;
export type Period = (typeof PERIODS)[number];

export function periodStart(p: Period, end: string, first: string): string {
  const e = new Date(end + "T00:00:00Z");
  let s: Date;
  switch (p) {
    case "1m": s = new Date(Date.UTC(e.getUTCFullYear(), e.getUTCMonth() - 1, e.getUTCDate())); break;
    case "3m": s = new Date(Date.UTC(e.getUTCFullYear(), e.getUTCMonth() - 3, e.getUTCDate())); break;
    case "6m": s = new Date(Date.UTC(e.getUTCFullYear(), e.getUTCMonth() - 6, e.getUTCDate())); break;
    case "1y": s = new Date(Date.UTC(e.getUTCFullYear() - 1, e.getUTCMonth(), e.getUTCDate())); break;
    case "Ytd": s = new Date(Date.UTC(e.getUTCFullYear(), 0, 1)); break;
    default: return first;
  }
  const iso = fmtDate(s.getTime());
  return iso < first ? first : iso;
}

export function ValueChart() {
  const { hideHomeValues } = useUi();
  const animate = useChartMotion();
  const { nav, prices, settings, currency, fxAt, loading } = usePortfolio();
  const [mode, setMode] = useState<Mode>("Value");
  const [period, setPeriod] = useState<Period>("All");
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const active = useMemo(() => BENCHMARKS.filter(({ ticker }) => settings.benchmarks.includes(ticker)), [settings.benchmarks]);
  const series = [
    ...SERIES.filter(({ key }) => key === "portfolio" || mode === "Value"),
    ...(mode === "Cash" ? [] : active.map(({ ticker, name, color }) => ({ key: ticker, label: name, color }))),
  ];

  const data = useMemo(() => {
    if (!nav.length) return [];
    const tw = computeTwrSeries(nav);
    const paths = active.map(({ ticker }) => ({ ticker, path: benchmarkPath(nav, prices, ticker) }));
    const from = periodStart(period, nav.at(-1)!.date, nav[0].date);
    const i0 = Math.max(0, nav.findIndex((p) => p.date >= from));
    const base = 1 + tw[i0].twr;
    return nav.slice(i0).map((p, k) => {
      const i = i0 + k;
      const convert = (value: number) => currency === "THB" ? value * fxAt(p.date) : value;
      const comparisons = Object.fromEntries(paths.map(({ ticker, path }) => {
        const { value, price } = path[i];
        const initialPrice = path[i0].price ?? path.slice(i0).find((entry) => entry.price)?.price;
        return [ticker, mode === "Return" ? (initialPrice && price ? price / initialPrice - 1 : null)
          : value === undefined ? null : convert(mode === "Gain" ? value - p.netDeposits : value)];
      }));
      return {
        ...comparisons,
        date: p.date,
        portfolio: mode === "Value" ? convert(p.nav) : mode === "Gain" ? convert(p.nav - p.netDeposits) : mode === "Cash" ? convert(p.cash) : (1 + tw[i].twr) / base - 1,
        deposits: convert(p.netDeposits),
      };
    });
  }, [nav, prices, active, mode, period, currency, fxAt]);

  const money = (v: number) => hideHomeValues ? "••••" : fmtMoney(v, currency);
  const isPct = mode === "Return";
  const f = (v: number) => (isPct ? fmtPct(v) : money(v));

  return (
    <section className="rounded-2xl bg-card p-4 sm:p-6">
      <h2 className="mb-4 text-lg font-semibold tracking-tight">Portfolio history</h2>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented value={mode} onChange={setMode} options={MODES} label="Chart mode" />
        <Segmented value={period} onChange={setPeriod} options={PERIODS} className="max-w-full flex-wrap" label="Chart period" />
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-sub">
        {series.map(({ key, color, label }) => (
          <button
            key={key}
            type="button"
            aria-pressed={!hidden[key]}
            onClick={() => setHidden((current) => ({ ...current, [key]: !current[key] }))}
            className={`flex items-center gap-1.5 rounded px-1 py-1 hover:text-fg focus-visible:outline focus-visible:outline-brand ${hidden[key] ? "text-mute line-through" : ""}`}
          >
            <span aria-hidden="true" className="h-0.5 w-4 rounded" style={{ background: color }} />
            {label}
          </button>
        ))}
      </div>
      {mode !== "Cash" && active.length > 0 && <p className="mt-1 text-xs text-mute">Benchmark prices exclude dividend reinvestment.</p>}
      <div className="h-[280px] md:h-[340px]" aria-label="Portfolio value chart">
        {data.length === 0 ? (
          <div className="grid h-full place-items-center text-sm text-mute">{loading ? "Loading…" : "No transactions yet"}</div>
        ) : (
          <ResponsiveContainer>
            <ComposedChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="date" {...AXIS} minTickGap={48} tickFormatter={(d) => new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" })} />
              <YAxis {...AXIS} width={52} orientation="right" tick={hideHomeValues && !isPct ? false : undefined} domain={["auto", "auto"]} tickFormatter={(v) => (isPct ? fmtPct(v, 0, false) : fmtMoney(v, currency, true))} />
              <Tooltip
                cursor={CURSOR}
                content={(p) => (
                  <ChartTooltip {...p} build={(label, payload) => {
                    const rows = series.flatMap(({ key, label, color }) => {
                      const value = payload.find((item) => item.dataKey === key)?.value;
                      return !hidden[key] && typeof value === "number" ? [{ name: label, color, value: f(value) }] : [];
                    });
                    return { title: fmtLongDate(label), rows };
                  }} />
                )}
              />
              {mode === "Value" && <Area dataKey="deposits" hide={hidden.deposits} stroke="#64718f" fill="#64718f" fillOpacity={0.35} dot={false} isAnimationActive={animate} animationDuration={420} animationEasing="ease-out" />}
              {mode !== "Cash" && active.map(({ ticker, color }) => <Line key={ticker} dataKey={ticker} hide={hidden[ticker]} stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={animate} animationDuration={420} animationEasing="ease-out" />)}
              <Line dataKey="portfolio" hide={hidden.portfolio} stroke="#bab4ff" strokeWidth={2.5} dot={false} isAnimationActive={animate} animationDuration={420} animationEasing="ease-out" />
              <Brush dataKey="date" height={26} stroke="#4a5670" fill="#1b2230" travellerWidth={8} tickFormatter={() => ""} className="hidden md:block" />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}

export { fmtNum, toMs };
