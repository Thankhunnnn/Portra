"use client";

import { useMemo, useState } from "react";
import { usePortfolio } from "@/context/portfolio";
import { Segmented } from "@/components/ui/segmented";
import { controlClass, DataTable, Metrics, panelClass, ReportChart } from "@/components/Reports";
import { PERIODS, periodStart, type Period } from "@/components/charts/ValueChart";
import { buildLots, lotStats } from "@/lib/lots";
import { PriceLookup, type Transaction } from "@/lib/portfolioEngine";
import { todayInBangkok } from "@/lib/reportDates";
import { fmtMoney, fmtNum, fmtPct, gainClass } from "@/lib/utils";

const views = ["Price", "% Off High"] as const;
const statuses = ["All lots", "Open", "Closed"] as const;
const outcomes = ["All results", "Winners", "Losers"] as const;

export default function TradeAnalysis() {
  const { txns, holdings, prices, quotes, fxAt, settings, cv, currency } = usePortfolio();
  const [view, setView] = useState<(typeof views)[number]>("Price");
  const [status, setStatus] = useState<(typeof statuses)[number]>("All lots");
  const [outcome, setOutcome] = useState<(typeof outcomes)[number]>("All results");
  const [period, setPeriod] = useState<Period>("1y");
  const [ticker, setTicker] = useState("");
  const [flags, setFlags] = useState(true);
  const today = todayInBangkok();
  const trades = useMemo(() => txns.filter((t) => t.ticker && t.shares > 0 && (t.action === "BUY" || t.action === "SELL")), [txns]);
  const tickers = [...new Set(trades.map((t) => t.ticker))].sort();
  const symbol = tickers.includes(ticker) ? ticker : "";
  const index = "^GSPC";
  const chartTicker = symbol || index;
  const money = (value: number) => fmtMoney(cv(value), currency);
  const lookup = useMemo(() => new PriceLookup(prices), [prices]);

  const lots = useMemo(() => {
    const groups = new Map<string, Transaction[]>();
    for (const t of trades) {
      if (symbol && t.ticker !== symbol) continue;
      const key = JSON.stringify([t.account, t.ticker]);
      const group = groups.get(key) ?? [];
      group.push(t);
      groups.set(key, group);
    }
    return [...groups.values()].flatMap((group) => {
      const { ticker, account } = group[0];
      const recent = group.reduce((a, b) => a.date > b.date ? a : b);
      const last = quotes[ticker]?.latest || lookup.get(ticker, today) || holdings.find((h) => h.ticker === ticker)?.last ||
        recent.price / (recent.currency === "THB" ? fxAt(recent.date) : 1);
      return buildLots(group, last, today, (date) => lookup.get(index, date), fxAt, settings.costMethod)
        .map((lot, i) => ({ ...lot, ticker, account, id: JSON.stringify([account, ticker, i]) }));
    }).sort((a, b) => b.date.localeCompare(a.date));
  }, [trades, symbol, quotes, lookup, holdings, fxAt, settings.costMethod, today]);

  const visible = lots.filter((lot) => (status === "All lots" || lot.open === (status === "Open")) &&
    (outcome === "All results" || (outcome === "Winners" ? lot.gain > 0 : lot.gain < 0)));
  const stats = lotStats(visible);
  const dates = new Set(Object.keys(prices[chartTicker] ?? {}));
  const events = new Map<string, { buys: number; sells: number; trades: Transaction[] }>();
  for (const t of trades) {
    if (symbol && t.ticker !== symbol) continue;
    const event = events.get(t.date) ?? { buys: 0, sells: 0, trades: [] };
    if (t.action === "BUY") event.buys++; else event.sells++;
    event.trades.push(t);
    events.set(t.date, event);
    if (lookup.get(chartTicker, t.date)) dates.add(t.date);
  }
  const sorted = [...dates].sort();
  const chartStart = sorted.length ? periodStart(period, sorted.at(-1)!, sorted[0]) : "";
  let peak = 0;
  const chartData = sorted.flatMap((date) => {
    const price = lookup.get(chartTicker, date);
    if (!price) return [];
    peak = Math.max(peak, price);
    return date < chartStart ? [] : [{
      date, value: view === "Price" ? (symbol ? cv(price) : price) : price / peak - 1,
      buys: events.get(date)?.buys ?? 0, sells: events.get(date)?.sells ?? 0, trades: events.get(date)?.trades ?? [],
    }];
  });

  return <div className="space-y-5">
    <header><h1 className="text-2xl font-semibold">Trade Analysis</h1>
      <p className="mt-1 text-sm text-mute">Buy and sell activity with lot performance by portfolio.</p></header>
    <section className={panelClass}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">{symbol || "S&P 500"} history</h2>
        <label className="flex items-center gap-2 text-sm text-sub"><input type="checkbox" checked={flags} onChange={(e) => setFlags(e.target.checked)} />Trade markers</label>
      </div>
      <div className="mt-3 flex flex-wrap gap-3">
        <Segmented label="Chart measure" options={views} value={view} onChange={setView} />
        <Segmented label="Chart period" options={PERIODS} value={period} onChange={setPeriod} />
      </div>
      <ReportChart key={JSON.stringify([chartTicker, period])} label="Trade history chart" data={chartData}
        series={[{ key: "value", name: view === "Price" ? "Close" : "Distance from high", color: "#ab96ff" }]}
        format={view === "Price" ? (symbol ? (value) => fmtMoney(value, currency) : fmtNum) : fmtPct}
        details={flags ? (point) => point.trades.map((trade) => ({
          name: `${trade.action === "BUY" ? "Buy" : "Sell"} ${trade.ticker}${trade.account ? ` · ${trade.account}` : ""}`,
          color: trade.action === "BUY" ? "#167d86" : "#ab5547",
          value: `${fmtNum(trade.shares, 6)} @ ${fmtMoney(trade.price, trade.currency === "THB" ? "THB" : "USD")}`,
        })) : undefined}
        marker={flags ? ({ cx, cy, payload }) => {
          if (!payload.buys && !payload.sells) return <g />;
          const name = payload.buys && payload.sells ? "B/S" : payload.buys ? "B" : "S";
          return <g key={payload.date} transform={`translate(${cx},${cy})`}>
            <title>{[payload.date, ...payload.trades.map((trade) => `${trade.action} ${trade.ticker} @ ${fmtNum(trade.price)} ${trade.currency}`)].join("\n")}</title>
            <circle r={8} fill={payload.buys ? "#167d86" : "#ab5547"} />
            <text fill="white" fontSize={8} textAnchor="middle" dominantBaseline="central">{name}</text>
          </g>;
        } : undefined} />
    </section>
    <Metrics items={[
      { label: "Lots", value: stats.count, detail: `${visible.filter((lot) => !lot.open).length} closed` },
      { label: "Win rate", value: fmtPct(stats.winRate, 1, false) },
      { label: "Win rate vs S&P 500", value: fmtPct(stats.winRateVsBench, 1, false) },
      { label: "Trade gain before fees", value: <span className={gainClass(stats.totalGain)}>{money(stats.totalGain)}</span> },
    ]} />
    <section className={panelClass}>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="mr-auto font-semibold">{settings.costMethod} lots</h2>
        <select className={controlClass} aria-label="Ticker" value={symbol} onChange={(e) => setTicker(e.target.value)}>
          <option value="">All tickers</option>{tickers.map((t) => <option key={t}>{t}</option>)}
        </select>
        <Segmented label="Lot status" options={statuses} value={status} onChange={setStatus} />
        <Segmented label="Lot outcome" options={outcomes} value={outcome} onChange={setOutcome} />
      </div>
      <DataTable headings={["Ticker", "Portfolio", "Status", "Opened", "Closed", "Entry price", "Shares", "Cost basis", "Gain", "Return", "Alpha", "Days"]}>
        {visible.map((lot) => <tr key={lot.id}>
          <td className="font-semibold">{lot.ticker}</td><td>{lot.account}</td><td>{lot.open ? "Open long" : "Closed long"}</td>
          <td>{lot.date}</td><td>{lot.closeDate ?? "–"}</td><td>{money(lot.price)}</td><td>{fmtNum(lot.shares, 6)}</td>
          <td>{money(lot.cost)}</td><td className={gainClass(lot.gain)}>{money(lot.gain)}</td>
          <td className={gainClass(lot.ret)}>{fmtPct(lot.ret)}</td><td className={gainClass(lot.alpha)}>{fmtPct(lot.alpha)}</td><td>{lot.days}</td>
        </tr>)}
        {!visible.length && <tr><td colSpan={12} className="text-center text-mute">No lots match these filters</td></tr>}
      </DataTable>
    </section>
  </div>;
}
