"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { firebaseConfigured, getStoredToken, signInWithGoogle, signOut as doSignOut, watchAuth } from "@/lib/firebase";
import {
  AuthError, DEFAULT_SETTINGS, LEGACY_TABS, parsePriceHistory, fetchTab, parseDashboard, parseExtendedPrices, parseTransactions, parseFxRates, parseDividendSchedule,
  type AccountFilter, type DashboardData, type Position, type Quote, type Settings, type FxRate, type DividendSchedule,
} from "@/lib/sheets";
import { computeNav, summarize, PriceLookup, type EngineOptions, type NavPoint, type PerformanceSummary, type PriceMap, type Transaction } from "@/lib/portfolioEngine";
import { addMonths, todayInBangkok } from "@/lib/reportDates";
import { demoDashboard, demoMeta, demoPrices, demoTransactions } from "@/lib/demo";
import { BENCHMARKS } from "@/lib/benchmarks";
import { buildLots, type CostMethod } from "@/lib/lots";
import type { CustomAsset } from "@/lib/customAssets";
import type { Currency } from "@/lib/utils";

export interface Holding {
  ticker: string;
  accounts: string[];
  shares: number;
  avgCost: number;
  last: number;
  prevClose: number;
  cost: number;
  value: number;
  dayGain: number;
  dayGainPct: number;
  unrGain: number;
  unrGainPct: number;
  allocation: number;
  sector: string;
  theme: string;
}

interface Ctx {
  mode: "none" | "demo" | "live";
  user: User | null;
  authError: string;
  signIn: () => Promise<void>;
  startDemo: () => void;
  signOut: () => Promise<void>;
  loading: boolean;
  error: string;
  lastUpdated: string;
  session: "EXTENDED" | "REGULAR";
  refresh: () => Promise<void>;
  settings: Settings;
  portfolios: string[];
  saveSettings: (s: Settings) => void;
  account: AccountFilter;
  setAccount: (a: AccountFilter) => void;
  currency: Currency;
  setCurrency: (c: Currency) => void;
  usdThb: number;
  fxAt: (date: string) => number;
  fxSource: string;
  engineOptions: EngineOptions;
  dividendSchedule: DividendSchedule[];
  customAssets: CustomAsset[];
  saveCustomAssets: (assets: CustomAsset[]) => void;
  /** Convert a USD amount into the display currency. */
  cv: (usd: number) => number;
  txns: Transaction[];
  allTxns: Transaction[];
  holdings: Holding[];
  nav: NavPoint[];
  summary: PerformanceSummary;
  dashboard: DashboardData;
  quotes: Record<string, Quote>;
  prices: PriceMap;
  cashUsd: number;
  netWorthUsd: number;
}

const PortfolioCtx = createContext<Ctx | null>(null);
export const usePortfolio = () => {
  const c = useContext(PortfolioCtx);
  if (!c) throw new Error("PortfolioProvider missing");
  return c;
};

const EXT_RE = /pre|post|after|extend|overnight|night/i;

function nowIct() {
  return new Date().toLocaleString("en-GB", { timeZone: "Asia/Bangkok", hour12: false }) + " ICT";
}

export function PortfolioProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<Ctx["mode"]>("none");
  const [user, setUser] = useState<User | null>(null);
  const [authError, setAuthError] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const demoDefaults = mode === "demo" &&
    Object.keys(settings.txTabs).length === 1 && settings.txTabs.Portfolio === "Transactions";
  const portfolios = useMemo(() => Object.keys(demoDefaults ? LEGACY_TABS : settings.txTabs), [demoDefaults, settings.txTabs]);
  const [selectedAccount, setAccount] = useState<AccountFilter>("All");
  const account = portfolios.includes(selectedAccount) ? selectedAccount : "All";
  const [currency, setCurrency] = useState<Currency>("USD");
  const [sheetTransactions, setAllTxns] = useState<Transaction[]>([]);
  const [quotesArr, setQuotesArr] = useState<Quote[]>([]);
  const [dashboard, setDashboard] = useState<DashboardData>({ sectors: [], themes: [], positions: [] });
  const [marketPrices, setPrices] = useState<PriceMap>({});
  const [fxRows, setFxRows] = useState<FxRate[]>([]);
  const [dividendSchedule, setDividendSchedule] = useState<DividendSchedule[]>([]);
  const assetKey = JSON.stringify(["portra.custom-assets", mode, mode === "live" ? user?.uid : "demo", settings.sheetId]);
  const [assetStore, setAssetStore] = useState<{ key: string; assets: CustomAsset[] }>();
  const customAssets = useMemo(() => assetStore?.key === assetKey ? assetStore.assets : [], [assetStore, assetKey]);
  useEffect(() => {
    try {
      const stored = localStorage.getItem(assetKey);
      setAssetStore({ key: assetKey, assets: stored ? JSON.parse(stored) : [] });
    } catch { setAssetStore({ key: assetKey, assets: [] }); }
  }, [assetKey]);
  const saveCustomAssets = useCallback((assets: CustomAsset[]) => {
    localStorage.setItem(assetKey, JSON.stringify(assets));
    setAssetStore({ key: assetKey, assets });
  }, [assetKey]);
  const loadId = useRef(0);
  const tokenRef = useRef<string | null>(null);

  // hydrate preferences
  useEffect(() => {
    try {
      const s = localStorage.getItem("portra.settings");
      if (s) {
        const stored: Partial<Settings> = JSON.parse(s);
        const legacyBenchmarks = localStorage.getItem("portra.benchmarks");
        setSettings({
          ...DEFAULT_SETTINGS,
          ...stored,
          ...(stored.benchmarks === undefined && legacyBenchmarks ? { benchmarks: JSON.parse(legacyBenchmarks) } : {}),
        });
      }
      const c = localStorage.getItem("portra.currency");
      if (c === "USD" || c === "THB") setCurrency(c);
      const a = localStorage.getItem("portra.account");
      if (a) setAccount(a as AccountFilter);
      if (localStorage.getItem("portra.demo") === "1") setMode("demo");
    } catch {}
  }, []);
  useEffect(() => { try { localStorage.setItem("portra.currency", currency); } catch {} }, [currency]);
  useEffect(() => { try { localStorage.setItem("portra.account", selectedAccount); } catch {} }, [selectedAccount]);

  useEffect(() => {
    return watchAuth((u) => {
      setUser(u);
      if (u) {
        tokenRef.current = getStoredToken();
        setMode((m) => (m === "demo" ? m : "live"));
      }
    });
  }, []);

  const saveSettings = useCallback((s: Settings) => {
    setSettings(s);
    try { localStorage.setItem("portra.settings", JSON.stringify(s)); } catch {}
  }, []);

  const load = useCallback(async () => {
    const id = ++loadId.current;
    setLoading(true);
    setError("");
    try {
      if (mode === "demo") {
        const p = demoPrices();
        const { dash, quotes } = demoDashboard(p);
        const txns = demoTransactions.filter((t) => t.account && portfolios.includes(t.account));
        const fullDemo = txns.length === demoTransactions.length;
        setPrices(p);
        setFxRows([]);
        setDividendSchedule([]);
        setDashboard({
          ...dash,
          cash: fullDemo ? dash.cash : undefined,
          netWorth: fullDemo ? dash.netWorth : undefined,
          positions: dash.positions.filter((pos) => portfolios.includes(pos.account)),
          sectors: fullDemo ? dash.sectors : [],
          themes: fullDemo ? dash.themes : [],
        });
        setQuotesArr(quotes);
        setAllTxns(txns);
        setLastUpdated(nowIct());
        return;
      }
      if (mode !== "live") return;
      if (!settings.sheetId) throw new Error("Set your Google Sheet ID in Settings, then refresh.");
      let token = tokenRef.current ?? getStoredToken();
      if (!token) token = await signInWithGoogle();
      tokenRef.current = token;
      const tabs = Object.entries(settings.txTabs);
      const symbolFor = (t: Transaction) =>
        t.account && settings.cryptoAccounts.includes(t.account) && !t.ticker.includes("-")
          ? `${t.ticker}-USD`
          : t.ticker;
      const optionalTab = (tab: string) => tab ? fetchTab(token, settings.sheetId, tab).catch((error) => {
        if (error instanceof AuthError) throw error;
        return [];
      }) : Promise.resolve([]);
      const [dashRows, priceRows, fxData, dividendData, historyRows, ...txRows] = await Promise.all([
        fetchTab(token, settings.sheetId, settings.dashboardTab),
        optionalTab(settings.pricesTab).then((rows) => rows.length || settings.pricesTab !== "Portra_Prices" ? rows : optionalTab("Extended_Prices")),
        optionalTab(settings.fxTab),
        optionalTab(settings.dividendsTab),
        optionalTab("Price_History"),
        ...tabs.map(([, tab]) => fetchTab(token, settings.sheetId, tab)),
      ]);
      const tx = tabs.flatMap(([name], i) => parseTransactions(txRows[i], name));
      const parsedDashboard = parseDashboard(dashRows, settings.txTabs);
      // Combined balances are calculated from the configured portfolios.
      parsedDashboard.cash = undefined;
      parsedDashboard.netWorth = undefined;
      parsedDashboard.sectors = [];
      parsedDashboard.themes = [];
      const q = parseExtendedPrices(priceRows).map((quote) => ({ ...quote, source: quote.source || settings.pricesTab }));
      const nextFx = parseFxRates(fxData);
      const nextDividends = parseDividendSchedule(dividendData);
      const from = tx.reduce((first, t) => t.date < first ? t.date : first, addMonths(todayInBangkok(), -12));
      const symbols = [...new Set([...BENCHMARKS.map((entry) => entry.ticker), "THB=X", ...tx.filter((t) => t.ticker).map(symbolFor), ...parsedDashboard.positions.map((p) => p.ticker)])];
      const history = parsePriceHistory(historyRows);
      if (process.env.NEXT_PUBLIC_STATIC_PAGES !== "1") {
        const missing = symbols.filter((symbol) => !Object.keys(history[symbol] ?? {}).length);
        const chunks = Array.from({ length: Math.ceil(missing.length / 40) }, (_, i) => missing.slice(i * 40, (i + 1) * 40));
        const results = await Promise.all(chunks.map(async (chunk) => {
          const res = await fetch(`/api/history?symbols=${encodeURIComponent(chunk.join(","))}&from=${from}`);
          return res.ok ? await res.json() as PriceMap : {};
        }));
        Object.assign(history, ...results);
      }
      const nextPrices = { ...history };
      for (const t of tx) if (t.ticker) nextPrices[t.ticker] = history[symbolFor(t)] ?? nextPrices[t.ticker] ?? {};

      if (id !== loadId.current) return;
      setFxRows(nextFx);
      setDividendSchedule(nextDividends);
      setDashboard(parsedDashboard);
      setQuotesArr(q);
      setAllTxns(tx);
      setPrices(nextPrices);
      if (tx.length && process.env.NEXT_PUBLIC_STATIC_PAGES === "1" && !Object.keys(history).length) {
        setError("Price history is empty. Run the Portra price import from your Google Sheet.");
      }
      setLastUpdated(q.map((x) => x.updated).filter(Boolean).at(-1) || nowIct());
    } catch (e) {
      if (id !== loadId.current) return;
      if (e instanceof AuthError) {
        tokenRef.current = null;
        setError("Google session expired or sheet not shared with you. Sign in again.");
      } else setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (id === loadId.current) setLoading(false);
    }
  }, [mode, settings, portfolios]);

  useEffect(() => {
    if (mode === "live") {
      setFxRows([]);
      setDividendSchedule([]);
      setDashboard({ sectors: [], themes: [], positions: [] });
      setAllTxns([]);
      setQuotesArr([]);
      setPrices({});
      setLastUpdated("");
    }
    if (mode !== "none") void load();
    return () => { loadId.current++; };
  }, [mode, load]);

  const refresh = useCallback(async () => {
    if (mode !== "live" || !settings.scriptUrl) { await load(); return; }
    const token = getStoredToken();
    if (!token || !settings.scriptKey) {
      setError(token ? "Set the Apps Script refresh key in Settings." : "Sign in again to refresh prices.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const endpoint = new URL(settings.scriptUrl);
      if (endpoint.origin !== "https://script.google.com" || !/^\/macros\/s\/[^/]+\/exec$/.test(endpoint.pathname)) {
        throw new Error("Enter the deployed Google Apps Script web app URL.");
      }
      const id = crypto.randomUUID();
      await fetch(endpoint, { method: "POST", mode: "no-cors", body: new URLSearchParams({ id, key: settings.scriptKey }) });
      for (let i = 0; i < 20; i++) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        const rows = await fetchTab(token, settings.sheetId, "Price_Refresh");
        if (rows[1]?.[0] === id) {
          const result = rows[1][1];
          await load();
          if (result !== "OK") setError(String(result || "Price refresh failed."));
          return;
        }
      }
      throw new Error("No refresh confirmation yet. The import may still be running.");
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
      setLoading(false);
    }
  }, [mode, settings, load]);

  const signIn = useCallback(async () => {
    setAuthError("");
    if (!firebaseConfigured) {
      setAuthError("Firebase is not configured. Copy .env.example to .env.local and fill in your project keys.");
      return;
    }
    try {
      tokenRef.current = await signInWithGoogle();
      localStorage.removeItem("portra.demo");
      setMode("live");
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  const startDemo = useCallback(() => { localStorage.setItem("portra.demo", "1"); setMode("demo"); }, []);
  const signOut = useCallback(async () => {
    await doSignOut();
    localStorage.removeItem("portra.demo");
    tokenRef.current = null;
    setMode("none"); setAllTxns([]); setQuotesArr([]); setPrices({});
  }, []);

  const today = todayInBangkok();
  const rateRecords = useMemo(() => {
    const rates = new Map(Object.entries(marketPrices["THB=X"] ?? {}).filter(([, rate]) => rate > 0)
      .map(([date, rate]) => [date, { date, rate, source: "Yahoo Finance" }]));
    for (const row of fxRows) rates.set(row.date, row);
    return [...rates.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [marketPrices, fxRows]);
  const currentRate = rateRecords.filter((row) => row.date <= today).at(-1);
  const sheetRate = dashboard.usdThb && dashboard.usdThb > 1 ? dashboard.usdThb : undefined;
  const fromSheet = currentRate?.date !== today && sheetRate !== undefined;
  const usdThb = fromSheet ? sheetRate : currentRate?.rate ?? sheetRate ?? 35;
  const fxSource = currentRate && !fromSheet ? `${currentRate.source} · ${currentRate.date}` : sheetRate ? (mode === "demo" ? "Demo rate" : "Dashboard · date unavailable") : "Fallback rate";
  const fxLookup = useMemo(() => new PriceLookup({ rate: Object.fromEntries(rateRecords.map((row) => [row.date, row.rate])) }), [rateRecords]);
  const fxAt = useCallback((date: string) => date >= today ? usdThb : fxLookup.get("rate", date) ?? sheetRate ?? 35, [fxLookup, sheetRate, today, usdThb]);
  const cv = useCallback((usd: number) => (currency === "THB" ? usd * usdThb : usd), [currency, usdThb]);
  const nativeThbPrices = useMemo(() => Object.fromEntries(customAssets.filter((asset) => asset.currency === "THB")
    .map((asset) => [asset.ticker, asset.prices])), [customAssets]);
  const engineOptions = useMemo(() => ({ usdThb, fxAt, nativeThbPrices, separateCash: settings.separateCash }),
    [usdThb, fxAt, nativeThbPrices, settings.separateCash]);
  const prices = useMemo(() => ({
    ...marketPrices,
    ...Object.fromEntries(customAssets.map((asset) => [asset.ticker, Object.fromEntries(Object.entries(asset.prices).map(([date, price]) =>
      [date, asset.currency === "THB" ? price / fxAt(date) : price]))])),
  }), [marketPrices, customAssets, fxAt]);
  const allTxns = useMemo(() => [...sheetTransactions, ...customAssets.flatMap((asset) =>
    asset.transactions.filter((txn) => txn.account && portfolios.includes(txn.account)))], [sheetTransactions, customAssets, portfolios]);
  const quotes = useMemo(() => Object.fromEntries(quotesArr.filter((q) => ["USD", "THB"].includes(q.currency ?? "USD")).map((q) => {
    const rate = q.currency === "THB" ? (q.updated ? fxAt(q.updated.slice(0, 10)) : usdThb) : 1;
    return [q.ticker, { ...q, latest: q.latest / rate, regularClose: q.regularClose / rate }];
  })), [quotesArr, fxAt, usdThb]);
  const txns = useMemo(() => (account === "All" ? allTxns : allTxns.filter((t) => t.account === account)), [allTxns, account]);
  const nav = useMemo(() => computeNav(txns, prices, engineOptions), [txns, prices, engineOptions]);
  const summary = useMemo(() => summarize(nav), [nav]);

  const holdings = useMemo(() => {
    const positions = portfolios.filter((name) => account === "All" || name === account).flatMap((name) => {
      const fromSheet = dashboard.positions.filter((p) => p.account === name);
      const crypto = settings.cryptoAccounts.includes(name) || (demoDefaults && name === "Binance");
      const ownTrades = allTxns.filter((t) => t.account === name);
      const derived = derivePositions(ownTrades, name, crypto, fxAt, settings.costMethod);
      if (!fromSheet.length || crypto) return derived;
      return [...derived.map((position) => {
        const sheet = fromSheet.find((row) => row.ticker === position.ticker);
        return sheet ? { ...sheet, shares: position.shares, avgCost: position.avgCost } : position;
      }), ...fromSheet.filter((row) => !ownTrades.some((trade) => trade.ticker === row.ticker && (trade.action === "BUY" || trade.action === "SELL")))];
    });

    const lastOf = (t: string) => {
      const m = prices[t];
      if (!m) return { p: undefined, prev: undefined };
      const ds = Object.keys(m).sort();
      return { p: m[ds.at(-1)!], prev: ds.length > 1 ? m[ds.at(-2)!] : undefined };
    };
    const grouped = new Map<string, Position[]>();
    positions.forEach((p) => grouped.set(p.ticker, [...(grouped.get(p.ticker) ?? []), p]));
    const rows = [...grouped.entries()].map(([ticker, ps]) => {
      const shares = ps.reduce((s, p) => s + p.shares, 0);
      const cost = ps.reduce((s, p) => s + p.shares * p.avgCost, 0);
      const q = quotes[ticker];
      const h = lastOf(ticker);
      const native = nativeThbPrices[ticker];
      const recentNative = native?.[Object.keys(native).sort().at(-1)!];
      const last = q?.latest || ps[0].sheetPrice || (recentNative ? recentNative / usdThb : h.p) || (shares ? cost / shares : 0);
      const ext = q && EXT_RE.test(q.session);
      const prev = (ext ? q?.regularClose : undefined) || h.prev || q?.regularClose || last;
      const value = shares * last;
      const meta = demoMeta(ticker);
      return {
        ticker, accounts: [...new Set(ps.map((p) => p.account))], shares,
        avgCost: shares ? cost / shares : 0, last, prevClose: prev, cost, value,
        dayGain: shares * (last - prev), dayGainPct: prev ? last / prev - 1 : 0,
        unrGain: value - cost, unrGainPct: cost ? value / cost - 1 : 0, allocation: 0,
        sector: ps[0].sector !== "Other" ? ps[0].sector : meta?.sector ?? "Other",
        theme: ps[0].theme !== "Other" ? ps[0].theme : meta?.theme ?? "Other",
      } as Holding;
    });
    const total = rows.reduce((s, r) => s + r.value, 0);
    rows.forEach((r) => (r.allocation = total ? r.value / total : 0));
    return rows;
  }, [dashboard.positions, allTxns, account, quotes, prices, portfolios, settings.cryptoAccounts, fxAt, settings.costMethod, demoDefaults, nativeThbPrices, usdThb]);

  const cashUsd = useMemo(() => {
    if (account === "All" && !settings.separateCash && !customAssets.length && dashboard.cash != null) return dashboard.cash;
    return nav.at(-1)?.cash ?? 0;
  }, [account, dashboard.cash, nav, settings.separateCash, customAssets]);
  const netWorthUsd = useMemo(() => {
    if (account === "All" && !settings.separateCash && !customAssets.length && dashboard.netWorth != null) return dashboard.netWorth;
    return holdings.reduce((s, h) => s + h.value, 0) + cashUsd;
  }, [account, dashboard.netWorth, holdings, cashUsd, settings.separateCash, customAssets]);

  const session: Ctx["session"] = quotesArr.some((q) => EXT_RE.test(q.session)) ? "EXTENDED" : "REGULAR";

  const value: Ctx = {
    mode, user, authError, signIn, startDemo, signOut, loading, error, lastUpdated, session, refresh,
    settings, saveSettings, portfolios, account, setAccount, currency, setCurrency, usdThb, cv, fxAt, fxSource, engineOptions, dividendSchedule, customAssets, saveCustomAssets,
    txns, allTxns, holdings, nav, summary, dashboard, quotes, prices, cashUsd, netWorthUsd,
  };
  return <PortfolioCtx.Provider value={value}>{children}</PortfolioCtx.Provider>;
}

/** Open trade lots grouped into one position per ticker. */
export function derivePositions(txns: Transaction[], account: Position["account"], crypto: boolean, fxAt: (date: string) => number, method: CostMethod): Position[] {
  const groups = new Map<string, Transaction[]>();
  for (const t of txns) {
    if (!t.ticker || (t.action !== "BUY" && t.action !== "SELL")) continue;
    const group = groups.get(t.ticker) ?? [];
    group.push(t);
    groups.set(t.ticker, group);
  }
  return [...groups].flatMap(([ticker, trades]) => {
    const open = buildLots(trades, 0, trades.at(-1)!.date, () => undefined, fxAt, method, true).filter((lot) => lot.open);
    const shares = open.reduce((sum, lot) => sum + lot.shares, 0);
    const cost = open.reduce((sum, lot) => sum + lot.cost, 0);
    return shares > 1e-9 ? [{ ticker, account, shares, avgCost: cost / shares, sector: crypto ? "Crypto" : "Other", theme: crypto ? "Crypto" : "Other" }] : [];
  });
}
