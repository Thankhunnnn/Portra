"use client";
import Link from "next/link";
import { Calculator, ChevronRight, Database, SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import { usePortfolio } from "@/context/portfolio";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { NAV_MAIN, NAV_TOOLS, NAV_MANAGE } from "@/components/shell/ui-context";
import { BENCHMARKS } from "@/lib/benchmarks";
import { COST_METHODS } from "@/lib/lots";
import { DEFAULT_SETTINGS, type Settings } from "@/lib/sheets";

const inputCls = "num mt-1 h-9 w-full rounded-lg border border-line bg-header px-3 text-sm outline-none focus:border-brand";

function portfolioRows(settings: Settings) {
  return Object.entries(settings.txTabs).map(([name, tab]) => ({
    name, tab, crypto: settings.cryptoAccounts.includes(name),
  }));
}

export default function SettingsPage() {
  const { settings, saveSettings, settingsSync, currency, setCurrency, fxSource, mode } = usePortfolio();
  const [s, setS] = useState<Settings>(settings);
  const [saved, setSaved] = useState(false);
  const [rows, setRows] = useState(() => portfolioRows(settings));
  const [error, setError] = useState("");
  const [calculation, setCalculation] = useState<{ costMethod: Settings["costMethod"]; separateCash: boolean }>();
  const reports = [...NAV_MAIN, ...NAV_TOOLS, ...NAV_MANAGE].filter((item) => !["/settings", "/rebalance"].includes(item.href));
  useEffect(() => {
    setS(settings);
    setRows(portfolioRows(settings));
  }, [settings]);

  function updateRow(index: number, update: Partial<(typeof rows)[number]>) {
    setRows(rows.map((row, i) => i === index ? { ...row, ...update } : row));
    setSaved(false);
    setError("");
  }

  function save() {
    const clean = rows.map((row) => ({ ...row, name: row.name.trim(), tab: row.tab.trim() }));
    const names = clean.map((row) => row.name.toLowerCase().replace(/!$/, ""));
    const tabs = clean.map((row) => row.tab.toLowerCase());
    if (names.some((name) => !name || name === "all") || tabs.some((tab) => !tab)) {
      setError('Enter a portfolio name and transaction tab for each row. "All" is reserved.');
      return;
    }
    if (new Set(names).size !== names.length || new Set(tabs).size !== tabs.length) {
      setError("Use a different portfolio name and transaction tab for each row.");
      return;
    }
    saveSettings({
      ...s,
      txTabs: Object.fromEntries(clean.map(({ name, tab }) => [name, tab])),
      cryptoAccounts: clean.filter((row) => row.crypto).map((row) => row.name),
    });
    setError("");
    setSaved(true);
  }

  const field = (label: string, value: string, on: (v: string) => void, hint?: string, type = "text") => (
    <label className="block text-sm text-sub">
      {label}
      <input type={type} value={value} onChange={(e) => { on(e.target.value); setSaved(false); }} className={inputCls} />
      {hint && <span className="mt-1 block text-xs text-mute">{hint}</span>}
    </label>
  );
  return (
    <div className="max-w-5xl space-y-5">
      <h1 className="text-xl font-normal">Settings</h1>
      {mode === "live" && <p role="status" className="text-xs text-sub">{settingsSync === "synced" ? "Sheet settings sync with your Google account. Refresh credentials stay in this browser." : settingsSync === "loading" ? "Checking for saved sheet settings…" : "Sheet settings are saved on this device. Account sync is unavailable right now."}</p>}
      <section className="rounded-2xl border border-line bg-card p-4">
        <h2 className="font-semibold">Account settings</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <button type="button" onClick={() => setCalculation({ costMethod: s.costMethod, separateCash: s.separateCash })}
            className="rounded-xl border border-line bg-header p-3 text-left hover:border-brand">
            <span className="flex items-center gap-2 font-medium"><Calculator size={16} className="text-brand" />Calculation Methods</span>
            <span className="mt-1 block text-xs text-sub">{s.costMethod} · {s.separateCash ? "Separate cash balances" : "Consolidated cash"}</span>
          </button>
          <label className="rounded-xl border border-line bg-header p-3 text-sm"><span className="flex items-center gap-2 font-medium"><SlidersHorizontal size={16} className="text-brand" />Display currency</span>
            <select className={inputCls} value={currency} onChange={(e) => setCurrency(e.target.value === "THB" ? "THB" : "USD")}><option>USD</option><option>THB</option></select>
          </label>
          <label className="rounded-xl border border-line bg-header p-3 text-sm">
            <span className="font-medium">Animations</span>
            <select className={inputCls} value={s.motion} onChange={(e) => {
              setS({ ...s, motion: e.target.value as Settings["motion"] });
              setSaved(false);
            }}><option>System</option><option>On</option><option>Off</option></select>
          </label>
          <a href="#google-sheet" className="rounded-xl border border-line bg-header p-3 hover:border-brand">
            <span className="flex items-center gap-2 font-medium"><Database size={16} className="text-brand" />Data connection</span>
            <span className="mt-1 block text-xs text-sub">{mode === "demo" ? "Demo Mode" : "Google Sheets"} · FX {fxSource}</span>
          </a>
        </div>
      </section>
      <section id="google-sheet" className="scroll-mt-20 space-y-4 rounded-2xl bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium">Google Sheet</h2>
          <Button size="sm" variant="outline" onClick={() => {
            setS({ ...DEFAULT_SETTINGS, sheetId: s.sheetId, scriptUrl: s.scriptUrl, scriptKey: s.scriptKey, benchmarks: s.benchmarks, costMethod: s.costMethod, separateCash: s.separateCash, motion: s.motion });
            setRows(portfolioRows(DEFAULT_SETTINGS));
            setSaved(false);
          }}>Reset sheet tab names</Button>
        </div>
        {field("Sheet ID", s.sheetId, (v) => setS({ ...s, sheetId: v.trim() }), "The long id in docs.google.com/spreadsheets/d/<ID>/edit. You must have access with the signed-in Google account.")}
        {field("Dashboard / Holdings / Accounts tab", s.dashboardTab, (v) => setS({ ...s, dashboardTab: v }))}
        {field("Prices tab", s.pricesTab, (v) => setS({ ...s, pricesTab: v.trim() }), "Portra_Prices reads the existing Extended_Prices feed. Historical market closes come from Yahoo Finance.")}
        {field("FX rates tab", s.fxTab, (v) => setS({ ...s, fxTab: v.trim() }), "Date, Pair, Rate, Source. Sheet rates override Yahoo Finance for matching dates.")}
        {field("Dividend schedule tab", s.dividendsTab, (v) => setS({ ...s, dividendsTab: v.trim() }), "Enter announced or estimated events with a source. Received payments come from transaction tabs.")}
      </section>
      <section id="portfolios" className="scroll-mt-20 space-y-4 rounded-2xl bg-card p-4">
        <h2 className="font-medium">Portfolio settings</h2>
        <p className="text-sm text-sub">Link each portfolio to its own transaction tab in the connected Google Sheet.</p>
        {rows.map((row, index) => (
          <fieldset key={index} className="space-y-2 rounded-xl border border-line p-3">
            <legend className="px-1 text-sm text-sub">{row.name || "New portfolio"}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {field("Portfolio name", row.name, (name) => updateRow(index, { name }))}
              {field("Transaction tab", row.tab, (tab) => updateRow(index, { tab }))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-sm text-sub">
                <input type="checkbox" checked={row.crypto} onChange={(e) => updateRow(index, { crypto: e.target.checked })} />
                Look up crypto prices as USD pairs
              </label>
              <Button variant="ghost" size="sm" onClick={() => {
                setRows(rows.filter((_, i) => i !== index));
                setSaved(false);
                setError("");
              }}>Remove</Button>
            </div>
          </fieldset>
        ))}
        <Button id="create-portfolio" className="scroll-mt-20" variant="secondary" onClick={() => {
          setRows([...rows, { name: "", tab: "", crypto: false }]);
          setSaved(false);
          setError("");
        }}>Create Portfolio</Button>
      </section>
      <section className="space-y-4 rounded-2xl bg-card p-4">
        <h2 className="font-medium">Refresh</h2>
        {field("Apps Script refresh key", s.scriptKey, (v) => setS({ ...s, scriptKey: v.trim() }), "Saved in this browser.", "password")}
        {field("Apps Script Web App URL (optional)", s.scriptUrl, (v) => setS({ ...s, scriptUrl: v.trim() }), "Portra waits for confirmation in Price_Refresh before re-reading prices.")}
      </section>
      <section id="benchmarks" className="scroll-mt-20 rounded-2xl bg-card p-4">
        <h2 className="font-medium">Benchmarks</h2>
        <p className="my-2 text-xs text-sub">Select the comparisons used on Home and Performance. Returns are based on closing prices.</p>
        <div className="flex flex-wrap gap-4 text-sm">{BENCHMARKS.map(({ name, ticker }) =>
          <label key={ticker} className="flex items-center gap-2">
            <input type="checkbox" checked={s.benchmarks.includes(ticker)} onChange={(e) => {
              setS({ ...s, benchmarks: e.target.checked ? [...s.benchmarks, ticker] : s.benchmarks.filter((item) => item !== ticker) });
              setSaved(false);
            }} />{name}
          </label>)}</div>
      </section>
      <section className="rounded-2xl bg-card p-4">
        <h2 className="mb-3 font-medium">Reports</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{reports.map(({ href, label }) =>
          <Link key={href} href={href} className="flex items-center justify-between rounded-lg border border-line bg-header px-3 py-2 text-sm hover:border-brand">
            {label}<ChevronRight size={14} />
          </Link>)}</div>
      </section>
      <Dialog open={Boolean(calculation)} onOpenChange={(open) => { if (!open) setCalculation(undefined); }}>
        {calculation && <DialogContent wide>
          <div className="overflow-y-auto p-5">
            <DialogTitle className="pr-8 text-xl font-semibold">Calculation Methods</DialogTitle>
            <DialogDescription className="mt-1 text-sm text-sub">Choose how Portra matches sales to purchase costs and tracks cash.</DialogDescription>
            <fieldset className="mt-4 grid gap-3 sm:grid-cols-3">
              <legend className="mb-2 text-sm text-sub">Cost basis</legend>
              {COST_METHODS.map((method, i) => <label key={method} className={`rounded-xl border p-3 ${calculation.costMethod === method ? "border-brand" : "border-line"}`}>
                <input type="radio" name="cost-method" value={method} checked={calculation.costMethod === method} onChange={() => setCalculation({ ...calculation, costMethod: method })} />
                <span className="ml-2 font-medium">{method}</span>
                <span className="mt-2 block text-xs text-sub">{["Sells the earliest purchased shares first.", "Sells the most recently purchased shares first.", "Uses the weighted cost of shares held before each sale."][i]}</span>
              </label>)}
            </fieldset>
            <label className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={calculation.separateCash} onChange={(e) => setCalculation({ ...calculation, separateCash: e.target.checked })} />Track USD and THB cash separately</label>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCalculation(undefined)}>Cancel</Button>
              <Button onClick={() => { setS({ ...s, ...calculation }); setSaved(false); setCalculation(undefined); }}>Apply</Button>
            </div>
          </div>
        </DialogContent>}
      </Dialog>
      {error && <p role="alert" className="text-sm text-loss">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button onClick={save}>Save</Button>
        <Button variant="ghost" onClick={() => { setS(DEFAULT_SETTINGS); setRows(portfolioRows(DEFAULT_SETTINGS)); setSaved(false); setError(""); }}>Reset to defaults</Button>
        {saved && <span role="status" className="self-center text-sm text-gain">Saved</span>}
      </div>
    </div>
  );
}
