"use client";
import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Plus } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { usePortfolio } from "@/context/portfolio";
import { useUi } from "@/components/shell/ui-context";
import { PERIODS, periodStart, type Period } from "@/components/charts/ValueChart";
import { AXIS, CURSOR, ChartTooltip, GRID, fmtLongDate } from "@/components/charts/ChartTooltip";
import { PriceLookup } from "@/lib/portfolioEngine";
import { buildLots, lotStats } from "@/lib/lots";
import { demoMeta } from "@/lib/demo";
import { fmtMoney, fmtNum, fmtPct, gainClass } from "@/lib/utils";

export function TickerDialog({ ticker, onClose }: { ticker: string | null; onClose: () => void }) {
  const { prices, allTxns, holdings, currency, cv, quotes, fxAt, account, settings } = usePortfolio();
  const { openManage, hideHomeValues } = useUi();
  const [period, setPeriod] = useState<Period>("1y");

  const model = useMemo(() => {
    if (!ticker) return null;
    const series = prices[ticker] ?? {};
    const dates = Object.keys(series).sort();
    const h = holdings.find((x) => x.ticker === ticker);
    const last = quotes[ticker]?.latest || h?.last || (dates.length ? series[dates.at(-1)!] : 0);
    const today = dates.at(-1) ?? new Date().toISOString().slice(0, 10);
    const from = periodStart(period, today, dates[0] ?? today);
    const data = dates.filter((d) => d >= from).map((d) => ({ date: d, price: cv(series[d]) }));
    const high = dates.slice(-252).reduce((m, d) => Math.max(m, series[d]), 0);
    const lk = new PriceLookup(prices);
    const trades = allTxns.filter((t) => t.ticker === ticker && (account === "All" || t.account === account));
    const lots = [...new Set(trades.map((t) => t.account))].flatMap((name) =>
      buildLots(trades.filter((t) => t.account === name), last, today, (d) => lk.get("^GSPC", d), fxAt, settings.costMethod)
    ).sort((a, b) => b.date.localeCompare(a.date));
    return { data, last, offHigh: high ? last / high - 1 : NaN, lots, stats: lotStats(lots), day: h?.dayGainPct ?? quotes[ticker]?.diffPct ?? 0, meta: demoMeta(ticker), h };
  }, [ticker, prices, allTxns, holdings, quotes, period, cv, fxAt, account, settings.costMethod]);

  const mask = (value: string | number) => hideHomeValues ? "••••" : String(value);

  return (
    <Dialog open={!!ticker} onOpenChange={(o) => !o && onClose()}>
      <DialogContent wide aria-describedby={undefined}>
        {ticker && model && (
          <div className="overflow-y-auto p-5 md:p-6">
            <div className="flex flex-wrap items-center gap-3 pr-10">
              <div>
                <DialogTitle className="text-xl font-semibold">{ticker}</DialogTitle>
                <DialogDescription className="text-sm text-mute">
                  {[model.h?.sector ?? model.meta?.sector, model.h?.theme ?? model.meta?.theme].filter(Boolean).join(" · ") || "Holding detail"}
                  {quotes[ticker]?.source && quotes[ticker]?.latest > 0 && ` · ${quotes[ticker].source}${quotes[ticker].updated ? ` · ${quotes[ticker].updated}` : ""}`}
                </DialogDescription>
              </div>
              <Button size="md" className="ml-auto" onClick={openManage}><Plus size={16} />Add Transaction</Button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Price" value={mask(fmtMoney(cv(model.last), currency))} sub={<span className={hideHomeValues ? "text-sub" : gainClass(model.day)}>{fmtPct(model.day)}</span>} />
              <Stat label="%Off High" value={fmtPct(model.offHigh, 1)} sub="52-week" cls={hideHomeValues ? "text-sub" : gainClass(model.offHigh)} />
              <Stat label="Win Rate" value={fmtPct(model.stats.winRate, 0, false)} sub={`${mask(model.stats.count)} lots`} />
              <Stat label="Win Rate vs S&P500" value={fmtPct(model.stats.winRateVsBench, 0, false)} sub="alpha > 0" />
              <Stat label="Total Trade Gain" value={mask(fmtMoney(cv(model.stats.totalGain), currency))} cls={hideHomeValues ? "text-sub" : gainClass(model.stats.totalGain)} />
              <Stat label="Event Flag" value="None" sub="no events" />
            </div>

            <div className="mt-5 flex items-center justify-between gap-2">
              <span className="text-sm font-medium">Price</span>
              <Segmented value={period} onChange={setPeriod} options={PERIODS} label="Zoom" />
            </div>
            <div className="h-[220px]" aria-label={`${ticker} price chart`}>
              {model.data.length ? (
                <ResponsiveContainer>
                  <AreaChart data={model.data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke={GRID} vertical={false} />
                    <XAxis dataKey="date" {...AXIS} minTickGap={48} tickFormatter={(d) => new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" })} />
                    <YAxis {...AXIS} width={52} orientation="right" tick={hideHomeValues ? false : undefined} domain={["auto", "auto"]} tickFormatter={(v) => fmtMoney(v, currency, true)} />
                    <Tooltip cursor={CURSOR} content={(p) => (
                      <ChartTooltip {...p} build={(label, payload) => ({ title: fmtLongDate(label), rows: [{ name: "Price", color: "#eef0f5", value: mask(fmtMoney(payload[0].value as number, currency)) }] })} />
                    )} />
                    <Area dataKey="price" stroke="#eef0f5" strokeWidth={2} fill="#7c4dff" fillOpacity={0.15} dot={false} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : <div className="grid h-full place-items-center text-sm text-mute">No price history</div>}
            </div>

            <div className="mt-5 text-sm font-medium">Lots</div>
            <div className="mt-2 overflow-x-auto rounded-xl border border-line">
              <table className="w-full min-w-[760px] text-[13px]">
                <thead>
                  <tr className="h-9 border-b border-line text-mute">
                    {["Ticker", "Side", "Open Date", "Price", "Ccy", "Shares", "Cost Basis", "Total Gain", "Total Return", "Alpha", "Holding Days"].map((c, i) => (
                      <th key={c} className={`whitespace-nowrap px-3 font-medium ${i < 3 ? "text-left" : "text-right"}`}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {model.lots.map((l, i) => (
                    <tr key={i} className="h-10 border-b border-line/60 last:border-0">
                      <td className="px-3 font-semibold">{ticker}</td>
                      <td className="px-3"><span className={l.open ? "text-gain" : "text-loss"}>{l.side}</span></td>
                      <td className="num px-3">{l.date}</td>
                      <td className="num px-3 text-right">{mask(fmtMoney(cv(l.price), currency))}</td>
                      <td className="px-3 text-right">{currency}</td>
                      <td className="num px-3 text-right">{mask(fmtNum(l.shares, l.shares % 1 ? 4 : 0))}</td>
                      <td className="num px-3 text-right">{mask(fmtMoney(cv(l.cost), currency))}</td>
                      <td className={`num px-3 text-right ${hideHomeValues ? "text-sub" : gainClass(l.gain)}`}>{mask(fmtMoney(cv(l.gain), currency))}</td>
                      <td className={`num px-3 text-right ${hideHomeValues ? "text-sub" : gainClass(l.ret)}`}>{fmtPct(l.ret)}</td>
                      <td className={`num px-3 text-right ${hideHomeValues ? "text-sub" : gainClass(l.alpha)}`}>{fmtPct(l.alpha)}</td>
                      <td className="num px-3 text-right">{mask(l.days)}</td>
                    </tr>
                  ))}
                  {model.lots.length === 0 && <tr><td colSpan={11} className="py-8 text-center text-mute">No lots found in your transaction tabs</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, sub, cls }: { label: string; value: string; sub?: React.ReactNode; cls?: string }) {
  return (
    <div className="rounded-xl bg-header px-3 py-2.5">
      <div className="text-[11px] text-mute">{label}</div>
      <div className={`num mt-0.5 text-lg ${cls ?? ""}`}>{value}</div>
      {sub && <div className="num text-xs text-mute">{sub}</div>}
    </div>
  );
}
