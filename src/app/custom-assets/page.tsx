"use client";

import { useState } from "react";
import { usePortfolio } from "@/context/portfolio";
import { Button } from "@/components/ui/button";
import { controlClass, DataTable, panelClass } from "@/components/Reports";
import type { Transaction } from "@/lib/portfolioEngine";
import { BENCHMARKS } from "@/lib/benchmarks";
import { todayInBangkok } from "@/lib/reportDates";
import { fmtMoney, fmtNum } from "@/lib/utils";

export default function CustomAssetsPage() {
  const { customAssets, saveCustomAssets, portfolios, prices, quotes, allTxns, account } = usePortfolio();
  const today = todayInBangkok();
  const [form, setForm] = useState<"asset" | "trade" | "price">();
  const [ticker, setTicker] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const active = customAssets.find((asset) => asset.ticker === ticker) ?? customAssets[0];

  function open(next: typeof form, symbol?: string) {
    if (symbol) setTicker(symbol);
    setMessage("");
    setError("");
    setForm(next);
  }

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const fields = new FormData(event.currentTarget);
    const get = (field: string) => String(fields.get(field) ?? "").trim();
    let next = customAssets;
    if (form === "asset") {
      const name = get("name");
      const symbol = get("ticker").toUpperCase();
      const currency = get("currency") === "THB" ? "THB" : "USD";
      if (!name || !/^[A-Z0-9][A-Z0-9._-]{0,19}$/.test(symbol)) {
        setError("Enter a name and a ticker of up to 20 letters, digits, dots, underscores or hyphens.");
        return;
      }
      if (customAssets.some((asset) => asset.ticker === symbol) || Object.hasOwn(prices, symbol) ||
          Object.hasOwn(quotes, symbol) || allTxns.some((trade) => trade.ticker === symbol) ||
          BENCHMARKS.some((index) => index.ticker === symbol)) {
        setError("That ticker is already in use.");
        return;
      }
      next = [...customAssets, { name, ticker: symbol, currency, prices: {}, transactions: [] }];
      setTicker(symbol);
    } else {
      if (!active) return;
      const date = get("date");
      const price = Number(get("price"));
      if (!date || date > today || !(price > 0) || !Number.isFinite(price)) {
        setError("Enter a date up to today and a positive price.");
        return;
      }
      if (form === "price") {
        next = customAssets.map((asset) => asset === active ? { ...asset, prices: { ...asset.prices, [date]: price } } : asset);
      } else {
        const portfolio = get("account");
        const action = get("action") === "SELL" ? "SELL" : "BUY";
        const shares = Number(get("shares"));
        const commission = Number(get("fee"));
        if (!(shares > 0) || !Number.isFinite(shares) || !Number.isFinite(commission) || commission < 0 || !portfolios.includes(portfolio)) {
          setError("Choose a portfolio, enter a positive quantity and a nonnegative fee.");
          return;
        }
        const trade: Transaction = { ticker: active.ticker, date, account: portfolio, action, shares, currency: active.currency, price, commission, note: "Custom asset" };
        const transactions = [...active.transactions, trade].sort((a, b) => a.date.localeCompare(b.date));
        let balance = 0;
        for (const row of transactions.filter((row) => row.account === portfolio)) {
          balance += row.action === "BUY" ? row.shares : -row.shares;
          if (balance < -1e-9) {
            setError("This trade would make the holding negative on " + row.date + ".");
            return;
          }
        }
        next = customAssets.map((asset) => asset === active ? { ...asset, transactions } : asset);
      }
    }
    try { saveCustomAssets(next); }
    catch { setError("This browser could not save the change."); return; }
    setForm(undefined);
    setMessage("Saved");
  }

  const input = (label: string, name: string, options: React.InputHTMLAttributes<HTMLInputElement> = {}) =>
    <label className="grid gap-1 text-sm text-sub">{label}<input name={name} className={controlClass} required {...options} /></label>;

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-semibold">Custom Assets</h1>
        <p className="mt-1 text-sm text-mute">Track manually priced investments. Records are saved in this browser.</p></div>
      <Button onClick={() => open("asset")}>Add Custom Asset</Button>
    </div>
    {message && <p role="status" className="text-sm text-gain">{message}</p>}
    {form && <form key={form} className={panelClass} onSubmit={save}>
      <h2 className="mb-4 font-semibold">{form === "asset" ? "New asset" : form === "trade" ? "Record a transaction" : "Record a price"}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {form === "asset" ? <>
          {input("Name", "name", { maxLength: 100 })}
          {input("Ticker", "ticker", { maxLength: 20 })}
          <label className="grid gap-1 text-sm text-sub">Currency<select name="currency" className={controlClass}><option>USD</option><option>THB</option></select></label>
        </> : <>
          <label className="grid gap-1 text-sm text-sub">Asset<select className={controlClass} value={active?.ticker} onChange={(e) => setTicker(e.target.value)}>
            {customAssets.map((asset) => <option key={asset.ticker} value={asset.ticker}>{asset.name} ({asset.ticker})</option>)}
          </select></label>
          {input("Date", "date", { type: "date", defaultValue: today, max: today })}
          {input(`Price per unit (${active?.currency ?? "USD"})`, "price", { type: "number", step: "any", min: 0 })}
          {form === "trade" && <>
            <label className="grid gap-1 text-sm text-sub">Portfolio<select name="account" defaultValue={account === "All" ? portfolios[0] : account} className={controlClass} required>
              {portfolios.map((name) => <option key={name}>{name}</option>)}
            </select></label>
            <label className="grid gap-1 text-sm text-sub">Action<select name="action" className={controlClass}><option>BUY</option><option>SELL</option></select></label>
            {input("Quantity", "shares", { type: "number", step: "any", min: 0 })}
            {input("Fee", "fee", { type: "number", defaultValue: 0, step: "any", min: 0 })}
          </>}
        </>}
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-loss">{error}</p>}
      <div className="mt-4 flex gap-2">
        <Button type="submit">Save</Button><Button type="button" variant="outline" onClick={() => open(undefined)}>Cancel</Button>
      </div>
    </form>}
    {customAssets.length ? <section className={panelClass}>
      <h2 className="font-semibold">Tracked assets</h2>
      <DataTable headings={["Asset", "Ticker", "Currency", "Latest price", "Price date", "Transactions", "Actions"]}>
        {customAssets.map((asset) => {
          const date = Object.keys(asset.prices).sort().at(-1);
          return <tr key={asset.ticker}><td>{asset.name}</td><td>{asset.ticker}</td><td>{asset.currency}</td>
            <td>{date ? fmtMoney(asset.prices[date], asset.currency) : "–"}</td><td>{date ?? "–"}</td><td>{asset.transactions.length}</td>
            <td><div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={!portfolios.length} onClick={() => open("trade", asset.ticker)}>Add Transaction</Button>
              <Button variant="outline" size="sm" onClick={() => open("price", asset.ticker)}>Add Price</Button>
            </div></td></tr>;
        })}
      </DataTable>
    </section> : <p className={panelClass}>Add an asset, record its transactions, then enter dated prices to value it in your portfolio.</p>}
    {active && <section className={panelClass}>
      <h2 className="font-semibold">{active.name} history</h2>
      <DataTable headings={["Date", "Event", "Portfolio", "Quantity", "Price"]}>
        {[...active.transactions.map((trade, index) => ({ ...trade, key: `trade-${index}` })),
          ...Object.entries(active.prices).map(([date, price]) => ({ key: `price-${date}`, date, action: "PRICE", account: "", shares: 0, price }))]
          .sort((a, b) => b.date.localeCompare(a.date)).map((row) => <tr key={row.key}>
          <td>{row.date}</td><td>{row.action}</td><td>{row.account || "–"}</td>
          <td>{row.shares ? fmtNum(row.shares, 6) : "–"}</td><td>{fmtMoney(row.price, active.currency)}</td>
        </tr>)}
      </DataTable>
    </section>}
  </div>;
}
