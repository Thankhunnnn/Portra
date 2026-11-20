"use client";
import { useMemo, useState } from "react";
import { Eye, EyeOff, SlidersHorizontal, TrendingUp, Wallet } from "lucide-react";
import { usePortfolio } from "@/context/portfolio";
import { useUi } from "@/components/shell/ui-context";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { BENCHMARKS, benchmarkPath } from "@/lib/benchmarks";
import { fmtMoney, fmtNum, fmtPct, gainClass } from "@/lib/utils";

const TABS = ["Benchmark", "Key Stats", "P&L Breakdown", "Gains & Returns"] as const;

export function SummaryHeader({ home = false }: { home?: boolean } = {}) {
  const { netWorthUsd, cashUsd, holdings, cv, currency, summary, nav, settings, account, usdThb, dayChange } = usePortfolio();
  const [localHide, setLocalHide] = useState(false);
  const { hideHomeValues, toggleHomeValues } = useUi();
  const hide = home ? hideHomeValues : localHide;
  const m = (v: number) => (hide ? "••••••" : fmtMoney(cv(v), currency));
  const alternate = currency === "USD" ? fmtMoney(netWorthUsd * usdThb, "THB") : fmtMoney(netWorthUsd, "USD");
  const invested = holdings.reduce((sum, h) => sum + h.cost, 0);
  const marketValue = holdings.reduce((sum, h) => sum + h.value, 0);
  return (
    <section aria-label="Portfolio overview" className="portra-hero flex min-w-0 flex-col justify-between rounded-2xl border border-brand/20 p-5 sm:p-6">
      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="truncate text-xs font-semibold uppercase tracking-wider text-brand">{account === "All" ? "All portfolios" : account}</p>
          <button type="button" aria-label={hide ? "Show values" : "Hide values"} aria-pressed={hide} onClick={home ? toggleHomeValues : () => setLocalHide(!localHide)} className="rounded-full border border-line p-2 text-sub hover:text-fg">{hide ? <EyeOff size={15} /> : <Eye size={15} />}</button>
        </div>
        <p className="text-sm text-sub">Total Net Worth</p>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <div className="num break-all text-[clamp(1.65rem,3.6vw,3rem)] font-bold tracking-tight">{m(netWorthUsd)}</div>
          {!hide && <div className="num text-sm text-sub">{alternate}</div>}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Chg label="Today" abs={dayChange.change} pct={dayChange.dayReturn} hide={hide} />
          <Chg label="Total gain" abs={summary.totalGain} pct={summary.netDeposits ? summary.totalGain / summary.netDeposits : 0} hide={hide} />
        </div>
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-line/80 pt-4 min-[460px]:grid-cols-3">
        {[["Market value", marketValue], ["Invested cost", invested], ["Cash Reserves", cashUsd]].map(([label, value]) =>
          <div key={label} className="min-w-0">
            <dt className="text-xs text-mute">{label}</dt>
            <dd className="num mt-1 break-all text-sm font-semibold">{m(Number(value))}</dd>
            {label === "Cash Reserves" && settings.separateCash && !hide && <dd className="num text-xs text-sub">
              {Object.entries(nav.at(-1)?.cashByCurrency ?? {}).map(([unit, amount]) => fmtMoney(amount, unit === "THB" ? "THB" : "USD")).join(" · ")}
            </dd>}
          </div>)}
      </dl>
    </section>
  );
}

function Chg({ label, abs, pct, hide }: { label: string; abs: number; pct: number; hide: boolean }) {
  const { cv, currency } = usePortfolio();
  return (
    <div className={`flex flex-wrap items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs ${hide ? "border-line bg-header" : abs < 0 ? "border-loss/25 bg-loss/10" : "border-gain/25 bg-gain/10"}`}>
      <span className="text-sub">{label}</span>
      <span className={`num ${hide ? "text-sub" : gainClass(abs)}`}>{`${hide ? "••••" : fmtMoney(cv(abs), currency)} (${fmtPct(pct)})`}</span>
    </div>
  );
}

export function SummaryTabs({ compact = false }: { compact?: boolean } = {}) {
  const { hideHomeValues } = useUi();
  const { summary, nav, prices, currency, cv, holdings, cashUsd, netWorthUsd } = usePortfolio();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Benchmark");
  const winners = holdings.filter((h) => h.unrGain > 0).length;
  const cards: Record<(typeof TABS)[number], { l: string; v: string; c?: string; percent?: boolean }[]> = {
    Benchmark: [
      { l: "If invested in S&P 500", v: fmtMoney(cv(benchmarkPath(nav, prices, "^GSPC").at(-1)?.value ?? NaN), currency) },
      { l: "If held as cash", v: nav.length ? fmtMoney(cv(summary.netDeposits), currency) : "–" },
      { l: "Portfolio TWR", percent: true, v: fmtPct(summary.twr), c: gainClass(summary.twr) },
      { l: "S&P 500 TWR", percent: true, v: nav.at(-1)?.benchmarkPrice ? fmtPct(summary.benchmarkTwr) : "–", c: gainClass(summary.benchmarkTwr) },
    ],
    "Key Stats": [
      { l: "Holdings", v: String(holdings.length) },
      { l: "Winners", v: `${winners}/${holdings.length}` },
      { l: "Cash (% of portfolio)", percent: true, v: fmtPct(netWorthUsd ? cashUsd / netWorthUsd : 0, 1, false) },
      { l: "Net deposits", v: fmtMoney(cv(summary.netDeposits), currency) },
    ],
    "P&L Breakdown": [
      { l: "Unrealized", v: fmtMoney(cv(holdings.reduce((s, h) => s + h.unrGain, 0)), currency), c: gainClass(holdings.reduce((s, h) => s + h.unrGain, 0)) },
      { l: "Total gain", v: fmtMoney(cv(summary.totalGain), currency), c: gainClass(summary.totalGain) },
      { l: "Realized (est.)", v: fmtMoney(cv(summary.totalGain - holdings.reduce((s, h) => s + h.unrGain, 0)), currency) },
    ],
    "Gains & Returns": [
      { l: "TWR", percent: true, v: fmtPct(summary.twr), c: gainClass(summary.twr) },
      { l: "TWR (annualized)", percent: true, v: fmtPct(summary.twrAnnualized), c: gainClass(summary.twrAnnualized) },
      { l: "MWR (XIRR)", percent: true, v: fmtPct(summary.mwr), c: gainClass(summary.mwr) },
      { l: "S&P500 MWR", percent: true, v: fmtPct(summary.benchmarkMwr), c: gainClass(summary.benchmarkMwr) },
    ],
  };
  return (
    <section aria-label="Portfolio analysis" className="min-w-0 rounded-2xl bg-card p-3 sm:p-4">
      <Segmented value={tab} onChange={setTab} options={TABS} className="max-w-full flex-wrap" label="Summary tabs" />
      <div className={`mt-3 grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 ${compact ? "" : "lg:grid-cols-4"}`}>
        {cards[tab].map((c) => (
          <div key={c.l} className="min-w-0 rounded-xl border border-line/80 bg-cardwarm px-3 py-3">
            <div className="flex items-start justify-between gap-2 text-xs text-sub">{c.l}
              {c.l === "If invested in S&P 500" && <TrendingUp size={15} className="shrink-0 text-brand" />}
              {c.l === "If held as cash" && <Wallet size={15} className="shrink-0 text-brand" />}
            </div>
            <div className={`num mt-1 break-all text-lg xl:text-xl ${hideHomeValues && !c.percent ? "" : c.c ?? ""}`}>{hideHomeValues && !c.percent ? "••••" : c.v}</div>
            {c.l === "If invested in S&P 500" && <BenchmarkChanges />}
            {c.l === "If held as cash" && nav.length > 0 && <div className="mt-2 space-y-1 text-xs text-mute">
              {["Today", "Yesterday", "All time"].map((label) => <p key={label}>{label} · {hideHomeValues ? "••••" : fmtMoney(0, currency)} (0.00%)</p>)}
            </div>}
          </div>
        ))}
      </div>
    </section>
  );
}

function BenchmarkChanges() {
  const { hideHomeValues } = useUi();
  const { nav, prices, cv, currency } = usePortfolio();
  const path = benchmarkPath(nav, prices, "^GSPC");
  const sessions = path.filter((point) => prices["^GSPC"]?.[point.date] > 0);
  const latest = path.at(-1);
  const prior = sessions.at(-2);
  const change = (end?: (typeof path)[number], start?: (typeof path)[number]) => {
    if (!end?.price || !start?.price || start.value === undefined) return [NaN, NaN];
    const change = end.price / start.price - 1;
    return [start.value * change, change];
  };
  const deposits = nav.at(-1)?.netDeposits ?? 0;
  const gain = latest?.value === undefined ? NaN : latest.value - deposits;
  const rows = [
    ["Today", ...change(sessions.at(-1), prior)],
    ["Yesterday", ...change(prior, sessions.at(-3))],
    ["All time", gain, deposits > 0 ? gain / deposits : NaN],
  ] as const;
  return <div className="mt-2 space-y-1 text-xs">
    {rows.map(([label, amount, fraction]) => <p key={label} className={gainClass(amount)}>
      <span className="mr-2 text-mute">{label}</span>
      <span className="num">{amount > 0 ? "+" : ""}{hideHomeValues ? "••••" : fmtMoney(cv(amount), currency)} ({fmtPct(fraction)})</span>
    </p>)}
  </div>;
}

export function AccountCards() {
  const { hideHomeValues } = useUi();
  const { accountValues, prices, quotes, cv, currency, portfolios, account, setAccount, settings, saveSettings } = usePortfolio();
  const enabled = settings.benchmarks;
  const [editing, setEditing] = useState(false);
  function toggle(ticker: string) {
    saveSettings({ ...settings, benchmarks: enabled.includes(ticker) ? enabled.filter((symbol) => symbol !== ticker) : [...enabled, ticker] });
  }

  const money = (value: number) => fmtMoney(cv(value), currency);

  return <section className="space-y-5">
    <div>
      <h2 className="mb-3 font-semibold">Portfolios</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {portfolios.map((name) => {
          const row = accountValues[name];
          const { totalGain, netDeposits } = row.summary;
          return <button key={name} type="button" aria-pressed={account === name} onClick={() => setAccount(account === name ? "All" : name)}
          className={`rounded-xl border bg-card p-4 text-left transition-colors hover:bg-cardwarm ${account === name ? "border-brand" : "border-line"}`}>
          <span className="text-sm text-sub">{name}</span>
          <strong className="num mt-1 block text-xl">{hideHomeValues ? "••••" : money(row.available ? row.value : NaN)}</strong>
          {row.available ? <span className="mt-2 grid gap-1 text-xs">
            <span className={gainClass(row.change)}><span className="text-mute">Today </span>{hideHomeValues ? "••••" : money(row.change)} ({fmtPct(row.dayReturn)})</span>
            <span className={gainClass(totalGain)}><span className="text-mute">All time </span>{hideHomeValues ? "••••" : money(totalGain)} ({fmtPct(netDeposits ? totalGain / netDeposits : 0)})</span>
          </span> : <span className="mt-2 block text-xs text-mute">No transactions</span>}
        </button>;
        })}
        {!portfolios.length && <p className="text-sm text-mute">No portfolios configured</p>}
      </div>
    </div>
    <div>
      <div className="mb-3 flex items-center gap-3">
        <h2 className="font-semibold">Benchmarks</h2>
        <Button variant="ghost" size="sm" aria-expanded={editing} onClick={() => setEditing(!editing)}><SlidersHorizontal size={14} />Edit</Button>
      </div>
      {editing && <div className="mb-3 flex flex-wrap gap-4 text-sm text-sub">
        {BENCHMARKS.map(({ ticker, name }) => <label key={ticker} className="flex items-center gap-2"><input type="checkbox" checked={enabled.includes(ticker)} onChange={() => toggle(ticker)} />{name}</label>)}
      </div>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {BENCHMARKS.filter(({ ticker }) => enabled.includes(ticker)).map(({ ticker, name }) => {
          const data = prices[ticker] ?? {};
          const dates = Object.keys(data).sort();
          const quote = quotes[ticker];
          const current = quote?.latest || data[dates.at(-1)!];
          const prev = quote?.previousClose || data[dates.at(-2)!];
          const change = current - prev;
          return <div key={ticker} className="rounded-xl border border-line bg-cardwarm p-4">
            <div className="text-sm text-sub">{name}</div>
            <div className="num mt-1 break-all text-lg xl:text-xl font-semibold">{hideHomeValues ? "••••" : fmtNum(current)}</div>
            <div className={`mt-2 text-xs ${gainClass(change)}`}>{prev > 0 ? `${hideHomeValues ? "••••" : fmtNum(change)} pts (${fmtPct(change / prev)})` : "Daily change unavailable"}</div>
          </div>;
        })}
        {!enabled.length && <p className="text-sm text-mute">Select a benchmark to show its card</p>}
      </div>
    </div>
  </section>;
}
