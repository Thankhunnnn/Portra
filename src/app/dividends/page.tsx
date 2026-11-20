"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePortfolio } from "@/context/portfolio";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { AllocationDonut } from "@/components/charts/OtherCharts";
import { controlClass, DataTable, Metrics, panelClass, ReportChart } from "@/components/Reports";
import { addMonths, todayInBangkok } from "@/lib/reportDates";
import { positionUnits } from "@/lib/portfolioEngine";
import { fmtMoney, fmtPct } from "@/lib/utils";

const tabs = ["Upcoming", "Historical", "Positions"] as const;
const periods = ["Monthly", "Quarterly", "Annually"] as const;
const views = ["Chart", "Table"] as const;
const breakdowns = ["Dividend income", "Market value"] as const;
const detailViews = ["Ticker", "Transaction"] as const;
const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const usd = (currency: string, usdThb: number) => currency === "THB" ? 1 / usdThb : 1;
type Payment = { id: string; status?: string; source?: string; exDate?: string; date: string; ticker: string; account?: string; amount: number; upcoming: boolean };

export default function Dividends() {
  const { txns, holdings, netWorthUsd, fxAt, dividendSchedule, currency, cv } = usePortfolio();
  const today = todayInBangkok();
  const [month, setMonth] = useState(today.slice(0, 7) + "-01");
  const [tab, setTab] = useState<(typeof tabs)[number]>("Upcoming");
  const [period, setPeriod] = useState<(typeof periods)[number]>("Monthly");
  const [view, setView] = useState<(typeof views)[number]>("Chart");
  const [showLabels, setShowLabels] = useState(false);
  const [breakdown, setBreakdown] = useState<(typeof breakdowns)[number]>("Dividend income");
  const [detail, setDetail] = useState<(typeof detailViews)[number]>("Ticker");
  const [ticker, setTicker] = useState("");
  const yearAgo = addMonths(today, -12);
  const yearAhead = addMonths(today, 12);
  const shares = new Map<string, number>();
  const positionKey = (account: string | undefined, ticker: string) => JSON.stringify([account, ticker]);
  const history: Payment[] = [];
  for (const [id, t] of txns.entries()) {
    if (t.date > today) continue;
    const key = positionKey(t.account, t.ticker);
    const units = positionUnits(t);
    if (units) shares.set(key, (shares.get(key) ?? 0) + units);
    if (t.action === "DIVIDEND") history.push({
      id: `received-${id}`, date: t.date, ticker: t.ticker || "Unassigned", account: t.account,
      amount: ((t.shares * t.price || t.price) - t.commission) * usd(t.currency, fxAt(t.date)), upcoming: false,
    });
  }
  const recent = history.filter((p) => p.date > yearAgo);
  const scheduled = dividendSchedule.flatMap((entry, i): Payment[] => {
    if (entry.paymentDate < today || entry.paymentDate > yearAhead) return [];
    const cutoff = entry.exDate && entry.exDate <= today ? entry.exDate : today;
    const eligible = new Map<string, number>();
    for (const trade of txns) {
      if (trade.ticker !== entry.ticker || !trade.account || trade.date > cutoff ||
          (entry.exDate && trade.date === entry.exDate)) continue;
      const units = positionUnits(trade);
      if (units) eligible.set(trade.account, (eligible.get(trade.account) ?? 0) + units);
    }
    return [...eligible].flatMap(([account, quantity]) => quantity > 1e-9 && !history.some((payment) =>
      payment.ticker === entry.ticker && payment.account === account && payment.date === entry.paymentDate) ? [{
      id: `schedule-${i}-${account}`, date: entry.paymentDate, ticker: entry.ticker, account,
      amount: quantity * entry.amount * usd(entry.currency, fxAt(entry.paymentDate)),
      upcoming: true, status: entry.announced ? "Announced" : "Estimated", source: entry.source, exDate: entry.exDate,
    }] : []);
  });
  const projected = recent.flatMap((p) => {
    const date = addMonths(p.date, 12);
    const active = (shares.get(positionKey(p.account, p.ticker)) ?? 0) > 1e-9;
    const duplicate = scheduled.some((item) => item.ticker === p.ticker && item.account === p.account &&
      Math.abs(Date.parse(item.date) - Date.parse(date)) <= 15 * 86400000);
    return active && !duplicate && p.amount > 0 && date > today && date <= yearAhead
      ? [{ ...p, id: `estimate-${p.id}`, date, upcoming: true, status: "Estimated", source: "Past payments" }] : [];
  });
  const upcoming = [...scheduled, ...projected];
  const total = (rows: Payment[]) => rows.reduce((sum, p) => sum + p.amount, 0);
  const trailing = total(recent);
  const income = tab === "Upcoming" ? total(upcoming) : trailing;
  const cost = holdings.reduce((sum, h) => sum + h.cost, 0);
  const money = (value: number) => fmtMoney(cv(value), currency);
  const tickers = [...new Set([...history.map((p) => p.ticker), ...holdings.map((h) => h.ticker)])].sort();
  const selected = tickers.includes(ticker) ? ticker : "";
  const include = (p: Payment) => !selected || p.ticker === selected;
  const all = [...history, ...upcoming].filter(include).sort((a, b) => a.date.localeCompare(b.date));
  const displayed = (tab === "Upcoming" ? upcoming : history).filter(include).sort((a, b) => tab === "Upcoming" ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date));
  const groups = new Map<string, { date: string; received: number; estimated: number; announced: number }>();
  for (const p of all) {
    const year = p.date.slice(0, 4);
    const quarter = Math.ceil(Number(p.date.slice(5, 7)) / 3);
    const date = period === "Monthly" ? p.date.slice(0, 7) : period === "Quarterly" ? `${year} Q${quarter}` : year;
    const row = groups.get(date) ?? { date, received: 0, estimated: 0, announced: 0 };
    row[p.upcoming ? (p.status === "Announced" ? "announced" : "estimated") : "received"] += p.amount;
    groups.set(date, row);
  }
  const dates = [...new Set(displayed.map((p) => p.date.slice(0, 7)))].sort();
  const detailTickers = [...new Set(displayed.map((p) => p.ticker))].sort();
  const byTicker = new Map<string, number>();
  for (const p of (tab === "Upcoming" ? upcoming : recent).filter(include)) byTicker.set(p.ticker, (byTicker.get(p.ticker) ?? 0) + p.amount);
  const slices = (breakdown === "Market value"
    ? holdings.filter((h) => !selected || h.ticker === selected).map((h) => ({ name: h.ticker, value: cv(h.value) }))
    : [...byTicker].map(([name, value]) => ({ name, value: cv(value) }))).filter((slice) => slice.value > 0);
  const first = new Date(month + "T00:00:00Z");
  const daysInMonth = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const padding = first.getUTCDay();
  const visibleDays = Math.ceil((padding + daysInMonth) / 7) * 7;

  return <div className="space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-semibold">Dividends</h1>
      <Segmented label="Dividend tab" options={tabs} value={tab} onChange={setTab} /></header>
    <Metrics items={[
      { label: "Portfolio value", value: money(netWorthUsd), detail: `${holdings.length} holdings · ${new Set(recent.map((p) => p.ticker)).size} paid dividends in the last 12 months` },
      { label: tab === "Upcoming" ? "Projected next 12 months" : "Received in the last 12 months", value: money(income), detail: `${money(income / 12)} per month on average` },
      { label: "Portfolio yield · TTM", value: fmtPct(netWorthUsd > 0 ? trailing / netWorthUsd : NaN, 2, false) },
      { label: "Yield on current cost · TTM", value: fmtPct(cost > 0 ? trailing / cost : NaN, 2, false) },
    ]} />
    <div className="grid gap-4 xl:grid-cols-2">
      <section className={panelClass}>
        <h2 className="mb-3 font-semibold">Dividend allocation</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented label="Allocation measure" options={breakdowns} value={breakdown} onChange={setBreakdown} />
          <Button variant="outline" size="sm" aria-pressed={showLabels} onClick={() => setShowLabels((show) => !show)}>{showLabels ? "Hide labels and %" : "Show labels and %"}</Button>
        </div>
        {slices.length ? <AllocationDonut showLabels={showLabels} data={slices} label={breakdown} /> : <p className="py-20 text-center text-sm text-mute">No allocation data</p>}
      </section>
      <section className={panelClass}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <Button aria-label="Previous month" variant="ghost" size="icon" onClick={() => setMonth(addMonths(month, -1))}><ChevronLeft size={16} /></Button>
          <h2 className="font-semibold">{first.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}</h2>
          <Button aria-label="Next month" variant="ghost" size="icon" onClick={() => setMonth(addMonths(month, 1))}><ChevronRight size={16} /></Button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center">
          {weekday.map((day) => <span key={day} className="py-1 text-xs text-mute">{day}</span>)}
          {Array.from({ length: visibleDays }, (_, index) => {
            const day = index - padding + 1;
            if (day < 1 || day > daysInMonth) return <div key={index} aria-hidden="true" />;
            const date = month.slice(0, 8) + String(day).padStart(2, "0");
            const payments = all.filter((p) => p.date === date);
            return <div key={date} className={`min-h-11 min-w-0 rounded-md border py-1 text-xs ${date === today ? "border-brand" : "border-line"}`}>
              <div>{day}</div>
              {!!payments.length && <div className={`num truncate px-0.5 text-[10px] ${payments.some((p) => p.status === "Announced") ? "text-sky-400" : payments[0].upcoming ? "text-brand" : "text-gain"}`} title={payments.map((p) => `${p.ticker} ${money(p.amount)}${p.status ? ` · ${p.status}` : ""}`).join(", ")}>{money(total(payments))}</div>}
            </div>;
          })}
        </div>
        <p className="mt-3 text-xs text-mute">Green · received. Blue · announced. Purple · estimated.</p>
      </section>
    </div>
    <section className={panelClass}>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="mr-auto font-semibold">Dividend income history</h2>
        <Segmented label="Dividend view" options={views} value={view} onChange={setView} />
        <Segmented label="Dividend period" options={periods} value={period} onChange={setPeriod} />
      </div>
      {view === "Chart" ? <ReportChart key={period} data={[...groups.values()]} label="Dividend income chart" format={money} series={[
        { key: "received", name: "Received", color: "#40c9a2", kind: "bar" },
        { key: "announced", name: "Announced", color: "#5aa8e0", kind: "bar" },
        { key: "estimated", name: "Estimated", color: "#9b81f5", kind: "bar" },
      ]} /> : <DataTable headings={["Period", "Received", "Announced", "Estimated"]}>
        {[...groups.values()].map((row) => <tr key={row.date}><td>{row.date}</td><td>{money(row.received)}</td><td>{money(row.announced)}</td><td>{money(row.estimated)}</td></tr>)}
        {!groups.size && <tr><td colSpan={4} className="text-center text-mute">No dividend payments</td></tr>}
      </DataTable>}
      <p className="mt-3 text-xs text-mute">Announced dates and per-share amounts come from Dividend_Schedule. Estimates use recorded payments for positions still held.</p>
    </section>
    <section className={panelClass}>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="mr-auto font-semibold">{tab === "Positions" ? "Dividend-paying holdings" : `${tab} dividends`}</h2>
        <select className={controlClass} aria-label="Dividend ticker" value={selected} onChange={(event) => setTicker(event.target.value)}>
          <option value="">All tickers</option>{tickers.map((t) => <option key={t}>{t}</option>)}
        </select>
        {tab !== "Positions" && <Segmented label="Dividend details" options={detailViews} value={detail} onChange={setDetail} />}
      </div>
      {tab === "Positions" ? <DataTable headings={["Ticker", "Market value", "Received · TTM", "Est. next 12 months", "Yield · TTM"]}>
        {holdings.filter((h) => (!selected || h.ticker === selected) && history.some((p) => p.ticker === h.ticker)).map((h) => {
          const earned = total(recent.filter((p) => p.ticker === h.ticker));
          return <tr key={h.ticker}><td>{h.ticker}</td><td>{money(h.value)}</td><td>{money(earned)}</td>
            <td>{money(total(upcoming.filter((p) => p.ticker === h.ticker)))}</td><td>{fmtPct(h.value > 0 ? earned / h.value : NaN, 2, false)}</td></tr>;
        })}
        {!holdings.some((h) => (!selected || h.ticker === selected) && history.some((p) => p.ticker === h.ticker)) && <tr><td colSpan={5} className="text-center text-mute">No dividend-paying holdings</td></tr>}
      </DataTable> : detail === "Transaction" ? <DataTable headings={tab === "Upcoming" ? ["Pay date", "Ex date", "Ticker", "Portfolio", "Status", "Source", "Projected amount"] : ["Date", "Ticker", "Portfolio", "Net amount"]}>
        {displayed.map((p) => <tr key={p.id}><td>{p.date}</td>{tab === "Upcoming" && <td>{p.exDate || "–"}</td>}
          <td>{p.ticker}</td><td>{p.account ?? "–"}</td>{tab === "Upcoming" && <><td>{p.status}</td><td>{p.source || "–"}</td></>}<td>{money(p.amount)}</td></tr>)}
        {!displayed.length && <tr><td colSpan={tab === "Upcoming" ? 7 : 4} className="text-center text-mute">No payments for this selection</td></tr>}
      </DataTable> : <DataTable headings={["Ticker", ...dates, "Total"]}>
        {detailTickers.map((t) => {
          const rows = displayed.filter((p) => p.ticker === t);
          return <tr key={t}><td>{t}</td>{dates.map((date) => <td key={date}>{money(total(rows.filter((p) => p.date.startsWith(date))))}</td>)}<td>{money(total(rows))}</td></tr>;
        })}
        {displayed.length ? <tr className="font-semibold"><td>Total</td>{dates.map((date) => <td key={date}>{money(total(displayed.filter((p) => p.date.startsWith(date))))}</td>)}<td>{money(total(displayed))}</td></tr>
          : <tr><td colSpan={2} className="text-center text-mute">No payments for this selection</td></tr>}
      </DataTable>}
    </section>
  </div>;
}
