"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { auth, clearSheetsToken, firebaseConfigured, getStoredToken, signInWithGoogle, signOut as doSignOut, watchAuth } from "@/lib/firebase";
import {
  AuthError, DEFAULT_SETTINGS, LEGACY_TABS, parsePriceHistory, fetchTab, parseDashboard, parseExtendedPrices, parseTransactions, parseFxRates, parseDividendSchedule,
  parseAssetMetadata, parseCashSnapshots, type AssetMetadata,
  type AccountFilter, type DashboardData, type Position, type Quote, type Settings, type FxRate, type DividendSchedule,
} from "@/lib/sheets";
import { computeNav, summarize, PriceLookup, positionUnits, type CashSnapshot, type EngineOptions, type NavPoint, type PerformanceSummary, type PriceMap, type Transaction } from "@/lib/portfolioEngine";
import { addMonths, todayInBangkok } from "@/lib/reportDates";
import { demoDashboard, demoMeta, demoPrices, demoTransactions } from "@/lib/demo";
import { BENCHMARKS } from "@/lib/benchmarks";
import { readSettings, writeSettings } from "@/lib/settingsSync";
import { sheetsAccessToken, sheetsConnectionEnabled } from "@/lib/sheetsConnection";
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

interface PortfolioValue {
  value: number;
  change: number;
  dayReturn: number;
}

interface Ctx {
  mode: "none" | "demo" | "live";
  user: User | null;
  authError: string;
  signIn: () => Promise<void>;
  startDemo: () => void;
  signOut: () => Promise<void>;
  loading: boolean;
  refreshStatus: string;
  settingsSync: "loading" | "synced" | "local";
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
  dayChange: PortfolioValue;
  accountValues: Record<string, PortfolioValue & { summary: PerformanceSummary; available: boolean }>;
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
  const [refreshStatus, setRefreshStatus] = useState("");
  const refreshActive = useRef(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [syncState, setSyncState] = useState<{ uid: string; status: Ctx["settingsSync"] }>();
  const settingsVersion = useRef(0);
  const liveUid = mode === "live" ? user?.uid : undefined;
  const settingsSync = liveUid ? syncState?.uid === liveUid ? syncState.status : "loading" : "local";
  const syncLoading = settingsSync === "loading";
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
  const [assetMetadata, setAssetMetadata] = useState<Record<string, AssetMetadata>>({});
  const [cashSnapshots, setCashSnapshots] = useState<CashSnapshot[]>([]);
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
        setMode((m) => (m === "demo" ? m : "live"));
      }
    });
  }, []);

  const saveSettings = useCallback((s: Settings) => {
    const version = ++settingsVersion.current;
    setSettings(s);
    try { localStorage.setItem(liveUid ? `portra.settings.${liveUid}` : "portra.settings", JSON.stringify(s)); } catch {}
    if (!liveUid) return;
    void writeSettings(liveUid, s).then(() => {
      if (version === settingsVersion.current) setSyncState({ uid: liveUid, status: "synced" });
    }).catch(() => {
      if (version === settingsVersion.current) setSyncState({ uid: liveUid, status: "local" });
    });
  }, [liveUid]);

  useEffect(() => {
    if (!liveUid) return;
    const uid = liveUid;
    let active = true;
    const version = ++settingsVersion.current;
    let local = DEFAULT_SETTINGS;
    try {
      const profile = localStorage.getItem(`portra.settings.${uid}`);
      const legacyOwner = localStorage.getItem("portra.settings.owner");
      const data = profile ?? (!legacyOwner || legacyOwner === uid ? localStorage.getItem("portra.settings") : null);
      if (data) local = { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
      if (!legacyOwner && data && !profile) localStorage.setItem("portra.settings.owner", uid);
    } catch {}
    setSettings(local);
    setSyncState({ uid, status: "loading" });
    const isCurrent = () => active && version === settingsVersion.current;
    const timer = setTimeout(() => {
      if (isCurrent()) setSyncState({ uid, status: "local" });
    }, 6500);
    void readSettings(uid).then(async (remote) => {
      if (!isCurrent()) return;
      if (remote) {
        // Refresh credentials belong to the local browser and its connected sheet.
        const sameSheet = remote.sheetId === local.sheetId;
        const merged = { ...local, ...remote, scriptUrl: sameSheet ? local.scriptUrl : "", scriptKey: sameSheet ? local.scriptKey : "" };
        setSettings(merged);
        try { localStorage.setItem(`portra.settings.${uid}`, JSON.stringify(merged)); } catch {}
      } else if (local.sheetId) {
        await writeSettings(uid, local);
      }
      if (isCurrent()) setSyncState({ uid, status: "synced" });
    }).catch(() => {
      if (isCurrent()) setSyncState({ uid, status: "local" });
    }).finally(() => clearTimeout(timer));
    return () => { active = false; clearTimeout(timer); };
  }, [liveUid]);

  const load = useCallback(async () => {
    const id = ++loadId.current;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
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
        setAssetMetadata({});
        setCashSnapshots([]);
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
      const token = await sheetsAccessToken(controller.signal);
      if (!token) throw new AuthError("Google Sheets access needs to be renewed on this device.");
      const tabs = Object.entries(settings.txTabs);
      const symbolFor = (t: Transaction) =>
        t.account && settings.cryptoAccounts.includes(t.account) && !t.ticker.includes("-")
          ? `${t.ticker}-USD`
          : t.ticker;
      const readTab = (tab: string) => fetchTab(token, settings.sheetId, tab, controller.signal);
      const optionalTab = (tab: string) => tab ? readTab(tab).catch((error) => {
        if (error instanceof AuthError || controller.signal.aborted) throw error;
        return [];
      }) : Promise.resolve([]);
      const [dashRows, priceRows, liveQuoteRows, fxData, dividendData, historyRows, metadataRows, balanceRows, ...txRows] = await Promise.all([
        readTab(settings.dashboardTab),
        optionalTab(settings.pricesTab).then((rows) => rows.length || settings.pricesTab !== "Portra_Prices" ? rows : optionalTab("Extended_Prices")),
        optionalTab("Live_Quotes"),
        optionalTab(settings.fxTab),
        optionalTab(settings.dividendsTab),
        optionalTab("Price_History"),
        optionalTab("Asset_Metadata"),
        optionalTab("Cash_Balances"),
        ...tabs.map(([, tab]) => readTab(tab)),
      ]);
      const tx = tabs.flatMap(([name], i) => parseTransactions(txRows[i], name));
      const parsedDashboard = parseDashboard(dashRows, settings.txTabs);
      // Combined balances are calculated from the configured portfolios.
      parsedDashboard.cash = undefined;
      parsedDashboard.netWorth = undefined;
      parsedDashboard.sectors = [];
      parsedDashboard.themes = [];
      const baseQuotes = parseExtendedPrices(priceRows).map((quote) => ({ ...quote, source: quote.source || settings.pricesTab }));
      const refreshedQuotes = parseExtendedPrices(liveQuoteRows).filter((quote) => quote.latest > 0);
      const quoteMap = new Map(baseQuotes.map((quote) => [quote.ticker, quote]));
      for (const quote of refreshedQuotes) {
        const baseDate = quoteMap.get(quote.ticker)?.updated.slice(0, 10) ?? "";
        if (/^\d{4}-\d{2}-\d{2}$/.test(baseDate) && quote.updated.slice(0, 10) < baseDate) continue;
        quoteMap.set(quote.ticker, { ...quote, source: quote.source || "Live_Quotes" });
      }
      const q = [...quoteMap.values()];
      const nextFx = parseFxRates(fxData);
      const nextDividends = parseDividendSchedule(dividendData);
      const nextMetadata = parseAssetMetadata(metadataRows);
      const nextBalances = parseCashSnapshots(balanceRows).flatMap((snapshot) => {
        const name = portfolios.find((portfolio) => portfolio.toLowerCase() === snapshot.account.toLowerCase());
        return name ? [{ ...snapshot, account: name }] : [];
      });
      const from = tx.reduce((first, t) => t.date < first ? t.date : first, addMonths(todayInBangkok(), -12));
      const symbols = [...new Set([...BENCHMARKS.map((entry) => entry.ticker), "THB=X", ...tx.filter((t) => t.ticker).map(symbolFor), ...parsedDashboard.positions.map((p) => p.ticker)])];
      const history = parsePriceHistory(historyRows);
      if (process.env.NEXT_PUBLIC_STATIC_PAGES !== "1") {
        const missing = symbols.filter((symbol) => !Object.keys(history[symbol] ?? {}).length);
        const chunks = Array.from({ length: Math.ceil(missing.length / 40) }, (_, i) => missing.slice(i * 40, (i + 1) * 40));
        const results = await Promise.all(chunks.map(async (chunk) => {
          const res = await fetch(`/api/history?symbols=${encodeURIComponent(chunk.join(","))}&from=${from}`, { signal: controller.signal });
          return res.ok ? await res.json() as PriceMap : {};
        }));
        Object.assign(history, ...results);
      }
      const nextPrices = { ...history };
      for (const t of tx) if (t.ticker) nextPrices[t.ticker] = history[symbolFor(t)] ?? nextPrices[t.ticker] ?? {};

      if (id !== loadId.current) return;
      setFxRows(nextFx);
      setDividendSchedule(nextDividends);
      setAssetMetadata(nextMetadata);
      setCashSnapshots(nextBalances);
      setDashboard(parsedDashboard);
      setQuotesArr(q);
      setAllTxns(tx);
      setPrices(nextPrices);
      if (tx.length && process.env.NEXT_PUBLIC_STATIC_PAGES === "1" && !Object.keys(history).length) {
        setError("Price history is empty. Run the Portra price import from your Google Sheet.");
      }
      setLastUpdated(q.map((x) => x.updated).filter(Boolean).sort().at(-1) || nowIct());
    } catch (e) {
      if (id !== loadId.current) return;
      if (e instanceof AuthError) {
        clearSheetsToken();
        setError(sheetsConnectionEnabled
          ? "Tap Refresh to reconnect Google Sheets for this session, or open Settings to enable automatic access."
          : "Google Sheets access expired or this account cannot open the sheet. Tap Refresh to reconnect.");
      } else setError(controller.signal.aborted ? "Loading your sheet timed out. Please try Refresh again." : e instanceof Error ? e.message : String(e));
    } finally {
      clearTimeout(timeout);
      if (id === loadId.current) setLoading(false);
    }
  }, [mode, settings, portfolios]);

  useEffect(() => {
    if (mode === "live" && (!liveUid || syncLoading)) return;
    if (mode === "live") {
      setFxRows([]);
      setDividendSchedule([]);
      setAssetMetadata({});
      setCashSnapshots([]);
      setDashboard({ sectors: [], themes: [], positions: [] });
      setAllTxns([]);
      setQuotesArr([]);
      setPrices({});
      setLastUpdated("");
    }
    if (mode !== "none") void load();
    return () => { loadId.current++; };
  }, [mode, load, liveUid, syncLoading]);

  const refresh = useCallback(async () => {
    if (refreshActive.current) return;
    if (mode !== "live") { await load(); return; }
    let token = getStoredToken();
    if (!token) {
      refreshActive.current = true;
      try {
        token = await signInWithGoogle();
      } catch (error) {
        setError(error instanceof Error ? error.message : "Could not reconnect Google Sheets.");
        return;
      } finally {
        refreshActive.current = false;
      }
      if (auth().currentUser?.uid !== liveUid) return;
    }
    if (!settings.scriptUrl || !settings.scriptKey) { await load(); return; }
    refreshActive.current = true;
    const request = new AbortController();
    const sendTimeout = setTimeout(() => request.abort(), 12000);
    setRefreshStatus("Sending price refresh…");
    setError("");
    try {
      const endpoint = new URL(settings.scriptUrl);
      if (endpoint.origin !== "https://script.google.com" || !/^\/macros\/s\/[^/]+\/exec$/.test(endpoint.pathname)) {
        throw new Error("Enter the deployed Google Apps Script web app URL.");
      }
      const id = crypto.randomUUID();
      await fetch(endpoint, { method: "POST", mode: "no-cors", body: new URLSearchParams({ id, key: settings.scriptKey }), signal: request.signal });
      clearTimeout(sendTimeout);
      setRefreshStatus("Waiting for prices from Google Sheets…");
      const status = new AbortController();
      const deadline = Date.now() + 105000;
      const timer = setTimeout(() => status.abort(), 105000);
      try {
        while (Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 3000));
          if (Date.now() >= deadline) break;
          const rows = await fetchTab(token, settings.sheetId, "Price_Refresh", status.signal);
          const receipt = rows.slice(1).find(([requestId]) => requestId === id);
          if (!receipt) continue;
          const result = receipt[1];
          setRefreshStatus("Loading updated prices…");
          await load();
          if (result !== "OK") setError(String(result || "Price refresh failed."));
          return;
        }
      } catch (error) {
        if (!status.signal.aborted) throw error;
      } finally {
        clearTimeout(timer);
      }
      await load();
      throw new Error("Google Sheets did not confirm this refresh in time. Showing the prices currently saved in your sheet.");
    } catch (error) {
      if (error instanceof AuthError) {
        clearSheetsToken();
        setError("Google Sheets access expired. Tap Refresh to reconnect.");
      } else {
        setError(request.signal.aborted ? "Could not reach the price refresh service in time. Try again." : error instanceof Error ? error.message : String(error));
      }
    } finally {
      clearTimeout(sendTimeout);
      refreshActive.current = false;
      setRefreshStatus("");
    }
  }, [mode, settings, load, liveUid]);

  const signIn = useCallback(async () => {
    setAuthError("");
    if (!firebaseConfigured) {
      setAuthError("Firebase is not configured. Copy .env.example to .env.local and fill in your project keys.");
      return;
    }
    try {
      await signInWithGoogle();
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
  const liveRate = quotesArr.find((quote) => quote.ticker === "THB=X" && quote.currency === "THB" && quote.latest > 1 && quote.updated.startsWith(today));
  const fromSheet = currentRate?.date !== today && sheetRate !== undefined;
  const usdThb = liveRate?.latest ?? (fromSheet ? sheetRate : currentRate?.rate ?? sheetRate ?? 35);
  const fxSource = liveRate ? `${liveRate.source} · ${liveRate.updated}` : currentRate && !fromSheet ? `${currentRate.source} · ${currentRate.date}` : sheetRate ? (mode === "demo" ? "Demo rate" : "Dashboard · date unavailable") : "Fallback rate";
  const fxLookup = useMemo(() => new PriceLookup({ rate: Object.fromEntries(rateRecords.map((row) => [row.date, row.rate])) }), [rateRecords]);
  const fxAt = useCallback((date: string) => date >= today ? usdThb : fxLookup.get("rate", date) ?? sheetRate ?? 35, [fxLookup, sheetRate, today, usdThb]);
  const cv = useCallback((usd: number) => (currency === "THB" ? usd * usdThb : usd), [currency, usdThb]);
  const nativeThbPrices = useMemo(() => Object.fromEntries(customAssets.filter((asset) => asset.currency === "THB")
    .map((asset) => [asset.ticker, asset.prices])), [customAssets]);
  const activeSnapshots = useMemo(() => cashSnapshots.filter((s) => s.date <= today), [cashSnapshots, today]);
  const selectedSnapshots = useMemo(() => account === "All" ? activeSnapshots : activeSnapshots.filter((s) => s.account === account), [activeSnapshots, account]);
  const engineOptions = useMemo(() => ({ usdThb, fxAt, nativeThbPrices, separateCash: settings.separateCash, cashSnapshots: selectedSnapshots }),
    [usdThb, fxAt, nativeThbPrices, settings.separateCash, selectedSnapshots]);
  const prices = useMemo(() => ({
    ...marketPrices,
    ...Object.fromEntries(customAssets.map((asset) => [asset.ticker, Object.fromEntries(Object.entries(asset.prices).map(([date, price]) =>
      [date, asset.currency === "THB" ? price / fxAt(date) : price]))])),
  }), [marketPrices, customAssets, fxAt]);
  const allTxns = useMemo(() => [...sheetTransactions, ...customAssets.flatMap((asset) =>
    asset.transactions.filter((txn) => txn.account && portfolios.includes(txn.account)))], [sheetTransactions, customAssets, portfolios]);
  const quotes = useMemo(() => Object.fromEntries(quotesArr.filter((q) => ["USD", "THB"].includes(q.currency ?? "USD")).map((q) => {
    const rate = q.currency === "THB" ? (q.updated ? fxAt(q.updated.slice(0, 10)) : usdThb) : 1;
    return [q.ticker, { ...q, latest: q.latest / rate, regularClose: q.regularClose / rate, previousClose: q.previousClose ? q.previousClose / rate : undefined }];
  })), [quotesArr, fxAt, usdThb]);
  const txns = useMemo(() => (account === "All" ? allTxns : allTxns.filter((t) => t.account === account)), [allTxns, account]);
  const nav = useMemo(() => computeNav(txns, prices, engineOptions), [txns, prices, engineOptions]);
  const summary = useMemo(() => summarize(nav), [nav]);

  const portfolioHoldings = useMemo(() => {
    const positionsByAccount = new Map(portfolios.map((name) => {
      const fromSheet = dashboard.positions.filter((p) => p.account === name);
      const crypto = settings.cryptoAccounts.includes(name) || (demoDefaults && name === "Binance");
      const ownTrades = allTxns.filter((t) => t.account === name);
      const derived = derivePositions(ownTrades, name, crypto, fxAt, settings.costMethod);
      if (!fromSheet.length || crypto) return [name, derived] as const;
      const positions = [...derived.map((position) => {
        const sheet = fromSheet.find((row) => row.ticker === position.ticker);
        return sheet ? { ...sheet, shares: position.shares, avgCost: position.avgCost } : position;
      }), ...fromSheet.filter((row) => !ownTrades.some((trade) => trade.ticker === row.ticker && positionUnits(trade) !== 0))];
      return [name, positions] as const;
    }));

    const lastOf = (t: string) => {
      const m = prices[t];
      if (!m) return { p: undefined, prev: undefined };
      const ds = Object.keys(m).sort();
      return { p: m[ds.at(-1)!], prev: ds.length > 1 ? m[ds.at(-2)!] : undefined };
    };
    const valuePositions = (positions: Position[]) => {
    const grouped = new Map<string, Position[]>();
    positions.forEach((p) => grouped.set(p.ticker, [...(grouped.get(p.ticker) ?? []), p]));
    const rows = [...grouped.entries()].map(([ticker, ps]) => {
      const shares = ps.reduce((s, p) => s + p.shares, 0);
      const cost = ps.reduce((s, p) => s + p.shares * p.avgCost, 0);
      const q = quotes[ticker] ?? quotes[`${ticker}-USD`];
      const h = lastOf(ticker);
      const native = nativeThbPrices[ticker];
      const recentNative = native?.[Object.keys(native).sort().at(-1)!];
      const last = q?.latest || ps[0].sheetPrice || (recentNative ? recentNative / usdThb : h.p) || (shares ? cost / shares : 0);
      const ext = q && EXT_RE.test(q.session);
      const prev = (ext ? q?.regularClose : q?.previousClose) || h.prev || q?.regularClose || last;
      const value = shares * last;
      const metadata = assetMetadata[ticker];
      const meta = mode === "demo" ? demoMeta(ticker) : undefined;
      const sector = ps.find((position) => position.sector !== "Other")?.sector;
      const theme = ps.find((position) => position.theme !== "Other")?.theme;
      return {
        ticker, accounts: [...new Set(ps.map((p) => p.account))], shares,
        avgCost: shares ? cost / shares : 0, last, prevClose: prev, cost, value,
        dayGain: shares * (last - prev), dayGainPct: prev ? last / prev - 1 : 0,
        unrGain: value - cost, unrGainPct: cost ? value / cost - 1 : 0, allocation: 0,
        sector: metadata?.sector || sector || meta?.sector || "Unclassified",
        theme: metadata?.theme || theme || meta?.theme || "Unclassified",
      } as Holding;
    });
    const total = rows.reduce((s, r) => s + r.value, 0);
    rows.forEach((r) => (r.allocation = total ? r.value / total : 0));
    return rows;
    };
    return {
      all: valuePositions([...positionsByAccount.values()].flat()),
      byAccount: Object.fromEntries([...positionsByAccount].map(([name, positions]) => [name, valuePositions(positions)])),
    };
  }, [dashboard.positions, allTxns, quotes, prices, portfolios, settings.cryptoAccounts, fxAt, settings.costMethod, demoDefaults, nativeThbPrices, usdThb, assetMetadata, mode]);
  const holdings = account === "All" ? portfolioHoldings.all : portfolioHoldings.byAccount[account];

  const cashUsd = useMemo(() => {
    if (account === "All" && !settings.separateCash && !customAssets.length && dashboard.cash != null) return dashboard.cash;
    return nav.at(-1)?.cash ?? 0;
  }, [account, dashboard.cash, nav, settings.separateCash, customAssets]);
  const netWorthUsd = useMemo(() => {
    if (account === "All" && !settings.separateCash && !customAssets.length && dashboard.netWorth != null) return dashboard.netWorth;
    return holdings.reduce((s, h) => s + h.value, 0) + cashUsd;
  }, [account, dashboard.netWorth, holdings, cashUsd, settings.separateCash, customAssets]);
  const dayChange = getPortfolioValue(holdings, cashUsd, netWorthUsd);
  const accountValues = useMemo(() => Object.fromEntries(portfolios.map((name) => {
    const accountNav = computeNav(allTxns.filter((t) => t.account === name), prices, {
      ...engineOptions,
      cashSnapshots: activeSnapshots.filter((s) => s.account === name),
    });
    const positions = portfolioHoldings.byAccount[name];
    return [name, {
      ...getPortfolioValue(positions, accountNav.at(-1)?.cash ?? 0),
      summary: summarize(accountNav),
      available: Boolean(positions.length || accountNav.length),
    }];
  })), [allTxns, activeSnapshots, engineOptions, portfolioHoldings, portfolios, prices]);

  const session: Ctx["session"] = quotesArr.some((q) => EXT_RE.test(q.session)) ? "EXTENDED" : "REGULAR";

  const value: Ctx = {
    mode, user, authError, signIn, startDemo, signOut, loading: loading || Boolean(refreshStatus) || settingsSync === "loading", refreshStatus, settingsSync, error, lastUpdated, session, refresh,
    settings, saveSettings, portfolios, account, setAccount, currency, setCurrency, usdThb, cv, fxAt, fxSource, engineOptions, dividendSchedule, customAssets, saveCustomAssets,
    txns, allTxns, holdings, nav, summary, dashboard, quotes, prices, cashUsd, netWorthUsd, dayChange, accountValues,
  };
  return <PortfolioCtx.Provider value={value}>{children}</PortfolioCtx.Provider>;
}

/** Open trade lots grouped into one position per ticker. */
function getPortfolioValue(holdings: Holding[], cash: number, value = holdings.reduce((total, holding) => total + holding.value, cash)): PortfolioValue {
  const change = holdings.reduce((total, holding) => total + holding.dayGain, 0);
  return { value, change, dayReturn: value - change ? change / (value - change) : 0 };
}

export function derivePositions(txns: Transaction[], account: Position["account"], crypto: boolean, fxAt: (date: string) => number, method: CostMethod): Position[] {
  const groups = new Map<string, Transaction[]>();
  for (const t of txns) {
    if (!t.ticker || !positionUnits(t)) continue;
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
