"use client";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ExternalLink, Filter, Plus, Search } from "lucide-react";
import { usePortfolio } from "@/context/portfolio";
import { useUi } from "@/components/shell/ui-context";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { sheetUrl } from "@/lib/sheets";
import { cn, fmtNum } from "@/lib/utils";

const inputCls = "h-8 w-full rounded-lg border border-line bg-header px-2 text-[13px] outline-none focus:border-brand";

export default function Transactions() {
  const { txns, settings, mode } = usePortfolio();
  const { openManage, openTicker } = useUi();
  const [q, setQ] = useState("");
  const [showF, setShowF] = useState(false);
  const [f, setF] = useState({ from: "", to: "", action: "", ticker: "", ccy: "" });
  const [desc, setDesc] = useState(true);
  const [tab, setTab] = useState<"My Input" | "Adjusted">("My Input");
  const [size, setSize] = useState(50);
  const [page, setPage] = useState(0);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    const r = txns.filter((t) =>
      (!s || [t.ticker, t.action, t.note, t.account].join(" ").toLowerCase().includes(s)) &&
      (!f.from || t.date >= f.from) && (!f.to || t.date <= f.to) &&
      (!f.action || t.action === f.action) &&
      (!f.ticker || t.ticker.toLowerCase().includes(f.ticker.toLowerCase())) &&
      (!f.ccy || t.currency === f.ccy)
    );
    return r.sort((a, b) => (desc ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)));
  }, [txns, q, f, desc]);
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const cur = Math.min(page, pages - 1);
  const slice = rows.slice(cur * size, (cur + 1) * size);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => { setF({ ...f, [k]: e.target.value }); setPage(0); };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-xl font-normal leading-8">Transactions</h1>
        <Segmented value={tab} onChange={setTab} options={["My Input", "Adjusted"] as const} label="Presentation" />
        <Button onClick={openManage}><Plus size={16} />Add Transaction</Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative flex-1 sm:max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Search" aria-label="Search transactions" className={cn(inputCls, "h-9 pl-8")} />
        </label>
        <Button variant={showF ? "secondary" : "ghost"} size="icon" aria-label="Filters" aria-expanded={showF} onClick={() => setShowF(!showF)}><Filter size={17} /></Button>
        <div className="flex items-center gap-1 sm:ml-auto md:hidden">
          <span className="text-xs text-mute">Sort by</span><span className="text-sm">Date</span>
          <Button variant="ghost" size="iconSm" aria-label="Toggle direction" onClick={() => setDesc(!desc)}>{desc ? <ArrowDown size={15} /> : <ArrowUp size={15} />}</Button>
        </div>
      </div>

      {showF && (
        <div className="grid grid-cols-2 gap-3 rounded-xl bg-card p-3 md:grid-cols-5">
          <label className="text-[11px] text-mute">Date from<input type="date" placeholder="yyyy-mm-dd" value={f.from} onChange={set("from")} className={inputCls} /></label>
          <label className="text-[11px] text-mute">Date to<input type="date" placeholder="yyyy-mm-dd" value={f.to} onChange={set("to")} className={inputCls} /></label>
          <label className="text-[11px] text-mute">Action
            <select value={f.action} onChange={set("action")} className={inputCls}><option value="">All</option>{["BUY", "SELL", "DEPOSIT", "WITHDRAW", "DIVIDEND", "FEE"].map((a) => <option key={a}>{a}</option>)}</select>
          </label>
          <label className="text-[11px] text-mute">Ticker<input value={f.ticker} onChange={set("ticker")} className={inputCls} /></label>
          <label className="text-[11px] text-mute">Currency
            <select value={f.ccy} onChange={set("ccy")} className={inputCls}><option value="">All</option><option>USD</option><option>THB</option></select>
          </label>
        </div>
      )}

      {/* Desktop table */}
      <div className="hidden overflow-x-auto rounded-xl border border-line bg-card md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="h-10 border-b border-line text-[13px] text-mute">
              {["Portfolio", "Date", "Action", "Ticker", "Price", "Currency", "Shares", "Commission", "Note", ""].map((c, i) => (
                <th key={i} className={cn("whitespace-nowrap px-3 font-medium", i >= 4 && i <= 7 ? "text-right" : "text-left")}>
                  {c === "Date" ? (
                    <button className="inline-flex items-center gap-1 hover:text-fg" onClick={() => setDesc(!desc)} aria-label="Sort by date">
                      Date {desc ? <ArrowDown size={12} /> : <ArrowUp size={12} />}
                    </button>
                  ) : c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.map((t, i) => (
              <tr key={i} className="h-11 border-b border-line/60 last:border-0 hover:bg-seg/30">
                <td className="px-3">{t.account}</td>
                <td className="num px-3">{t.date}</td>
                <td className="px-3"><span className={t.action === "BUY" ? "text-gain" : t.action === "SELL" ? "text-loss" : "text-sub"}>{t.action}</span></td>
                <td className="px-3 font-semibold">{t.ticker ? <button className="hover:text-brand" onClick={() => openTicker(t.ticker)}>{t.ticker}</button> : "–"}</td>
                <td className="num px-3 text-right">{fmtNum(t.price)}</td>
                <td className="px-3">{t.currency}</td>
                <td className="num px-3 text-right">{fmtNum(t.shares, t.shares % 1 ? 4 : 0)}</td>
                <td className="num px-3 text-right">{fmtNum(t.commission)}</td>
                <td className="max-w-[220px] truncate px-3 text-mute">{t.note}</td>
                <td className="px-3">{mode === "live" && <a aria-label="Open source sheet" href={sheetUrl(settings.sheetId)} target="_blank" rel="noreferrer" className="text-mute hover:text-fg"><ExternalLink size={14} /></a>}</td>
              </tr>
            ))}
            {slice.length === 0 && <tr><td colSpan={10} className="py-10 text-center text-mute">No transactions</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <ul className="space-y-2 md:hidden">
        {slice.map((t, i) => (
          <li key={i} className="rounded-xl bg-card p-3 text-sm">
            <div className="flex items-center justify-between">
              <span><span className={t.action === "BUY" ? "text-gain" : t.action === "SELL" ? "text-loss" : "text-sub"}>{t.action}</span> {t.ticker && <button className="font-semibold" onClick={() => openTicker(t.ticker)}>{t.ticker}</button>}</span>
              <span className="num text-xs text-mute">{t.date}</span>
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-y-1 text-xs">
              {[["Price", fmtNum(t.price)], ["Currency", t.currency], ["Shares", fmtNum(t.shares, t.shares % 1 ? 4 : 0)], ["Commission", fmtNum(t.commission)], ["Portfolio", t.account ?? ""]].map(([k, v]) => (
                <div key={k} className="flex gap-2"><dt className="text-mute">{k}</dt><dd className="num">{v}</dd></div>
              ))}
            </dl>
            {t.note && <p className="mt-1 text-xs text-mute">{t.note}</p>}
          </li>
        ))}
        {slice.length === 0 && <li className="py-10 text-center text-mute">No transactions</li>}
      </ul>

      <div className="flex flex-wrap items-center justify-end gap-3 text-xs text-mute">
        <label className="flex items-center gap-2">Items per page
          <select value={size} onChange={(e) => { setSize(+e.target.value); setPage(0); }} className="h-7 rounded-md border border-line bg-header px-1 text-fg">{[25, 50, 100].map((n) => <option key={n}>{n}</option>)}</select>
        </label>
        <span className="num">{cur + 1} / {pages}</span>
        <button aria-label="Previous page" disabled={cur === 0} onClick={() => setPage(cur - 1)} className="grid h-7 w-7 place-items-center rounded-md hover:bg-seg disabled:opacity-30"><ChevronLeft size={15} /></button>
        <button aria-label="Next page" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)} className="grid h-7 w-7 place-items-center rounded-md hover:bg-seg disabled:opacity-30"><ChevronRight size={15} /></button>
      </div>
    </div>
  );
}
