import type { CostMethod } from "./lots";
import { normalizeAction, type Transaction } from "./portfolioEngine";

export type AccountName = string;
export type AccountFilter = string;

export interface Position {
  ticker: string;
  account: AccountName;
  shares: number;
  avgCost: number; // USD
  sector: string;
  theme: string;
  sheetPrice?: number;
}

export interface Quote {
  ticker: string;
  latest: number; // USD
  regularClose: number;
  previousClose?: number;
  diffPct: number; // fraction
  session: string; // e.g. "Pre-market", "Regular", "After-hours"
  updated: string;
  currency?: string;
  source?: string;
}

export interface AllocationItem {
  name: string;
  value: number; // USD
}

export interface DashboardData {
  netWorth?: number; // USD
  cash?: number; // USD
  usdThb?: number;
  sectors: AllocationItem[];
  themes: AllocationItem[];
  positions: Position[];
}

export interface Settings {
  sheetId: string;
  scriptUrl: string;
  scriptKey: string;
  dashboardTab: string;
  pricesTab: string;
  fxTab: string;
  dividendsTab: string;
  costMethod: CostMethod;
  separateCash: boolean;
  motion: "System" | "On" | "Off";
  benchmarks: string[];
  txTabs: Record<AccountName, string>;
  cryptoAccounts: AccountName[];
}

export const DEFAULT_SHEET_ID = "";
export const LEGACY_TABS = { "Dime!": "Dime Transactions", Webull: "Webull Transactions", Binance: "Binance Transactions" };

export const DEFAULT_SETTINGS: Settings = {
  sheetId: DEFAULT_SHEET_ID,
  scriptUrl: "",
  scriptKey: "",
  dashboardTab: "Dashboard",
  pricesTab: "Portra_Prices",
  fxTab: "FX_Rates",
  dividendsTab: "Dividend_Schedule",
  costMethod: "FIFO",
  separateCash: false,
  motion: "System",
  benchmarks: ["^GSPC", "^NYA", "^IXIC"],
  cryptoAccounts: [],
  txTabs: { Portfolio: "Transactions" },
};

export type Row = (string | number | boolean | null | undefined)[];

export async function fetchTab(token: string, sheetId: string, tab: string): Promise<Row[]> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(
    `'${tab.replaceAll("'", "''")}'`
  )}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401 || res.status === 403) throw new AuthError(`Sheets access denied (${res.status})`);
  if (!res.ok) throw new Error(`Could not read tab "${tab}" (${res.status})`);
  const json = await res.json();
  return (json.values ?? []) as Row[];
}

export class AuthError extends Error {}

/** tab title -> gid, so we can deep-link to a specific tab. */
export async function fetchSheetGids(token: string, sheetId: string): Promise<Record<string, number>> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}?fields=sheets.properties(sheetId,title)`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return {};
  const j = await res.json();
  return Object.fromEntries((j.sheets ?? []).map((s: { properties: { title: string; sheetId: number } }) => [s.properties.title, s.properties.sheetId]));
}

export const sheetUrl = (id: string, gid?: number) =>
  `https://docs.google.com/spreadsheets/d/${id}/edit${gid != null ? `#gid=${gid}` : ""}`;

/* ---------- parsing helpers ---------- */

const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9%/]/g, "");

export function num(v: unknown): number {
  if (typeof v === "number") return v;
  if (v == null) return NaN;
  const s = String(v).replace(/[,$฿\s]/g, "").replace(/%$/, "");
  if (s === "") return NaN;
  const n = Number(s);
  return isNaN(n) ? NaN : String(v).trim().endsWith("%") ? n / 100 : n;
}

function findCol(header: Row, ...names: string[]): number {
  const h = header.map(norm);
  for (const n of names) {
    const i = h.findIndex((x) => x === norm(n));
    if (i >= 0) return i;
  }
  for (const n of names) {
    const i = h.findIndex((x) => x.includes(norm(n)));
    if (i >= 0) return i;
  }
  return -1;
}

function findHeaderRow(rows: Row[], must: string[]): number {
  return rows.findIndex((r) => {
    const h = r.map(norm);
    return must.every((m) => h.some((x) => x.includes(norm(m))));
  });
}

/** Excel serial or text → YYYY-MM-DD. */
export function toIsoDate(v: unknown): string {
  if (typeof v === "number") {
    const date = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
    return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : "";
  }
  const s = String(v ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (m) {
    // dd/mm/yyyy (Thai sheets) unless the first part cannot be a day
    const a = +m[1], b = +m[2];
    const [d, mo] = b > 12 ? [b, a] : [a, b];
    return `${m[3]}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  const t = Date.parse(s);
  return isNaN(t) ? "" : new Date(t).toISOString().slice(0, 10);
}

export function parseTransactions(rows: Row[], account: AccountName): Transaction[] {
  const hi = findHeaderRow(rows, ["date", "ticker"]);
  if (!rows.length) return [];
  if (hi < 0) throw new Error(`${account}: missing Date or Ticker column`);
  const h = rows[hi];
  const c = {
    date: findCol(h, "Date"),
    ticker: findCol(h, "Ticker", "Symbol"),
    action: findCol(h, "Action", "Type"),
    shares: findCol(h, "Shares", "Quantity", "Qty"),
    price: findCol(h, "Price"),
    commission: findCol(h, "Commission", "Fee"),
    currency: findCol(h, "Currency", "Ccy"),
    note: findCol(h, "Note", "Notes"),
  };
  const required = { Action: c.action, Shares: c.shares, Price: c.price };
  const missing = Object.entries(required).filter(([, column]) => column < 0).map(([name]) => name);
  if (missing.length) throw new Error(`${account}: missing columns ${missing.join(", ")}`);
  const out: Transaction[] = [];
  for (const r of rows.slice(hi + 1)) {
    const date = toIsoDate(r[c.date]);
    if (!date) continue;
    const shares = num(r[c.shares]);
    out.push({
      date,
      ticker: String(r[c.ticker] ?? "").trim().toUpperCase(),
      action: normalizeAction(String(r[c.action] ?? "")),
      shares: isNaN(shares) ? 0 : shares,
      price: isNaN(num(r[c.price])) ? 0 : num(r[c.price]),
      commission: isNaN(num(r[c.commission])) ? 0 : Math.abs(num(r[c.commission])),
      currency: String(r[c.currency] ?? "USD").trim().toUpperCase() || "USD",
      note: c.note >= 0 ? String(r[c.note] ?? "") : "",
      account,
    });
  }
  return out;
}

export function parseExtendedPrices(rows: Row[]): Quote[] {
  const hi = findHeaderRow(rows, ["ticker"]);
  if (hi < 0) return [];
  const h = rows[hi];
  const c = {
    ticker: findCol(h, "Ticker"),
    latest: findCol(h, "Latest Price"),
    close: findCol(h, "Regular Close"),
    previous: findCol(h, "Previous Close"),
    diff: findCol(h, "Diff"),
    session: findCol(h, "Session", "Status"),
    updated: findCol(h, "Last Updated"),
    currency: findCol(h, "Currency"),
    source: findCol(h, "Source"),
  };
  return rows
    .slice(hi + 1)
    .filter((r) => r[c.ticker])
    .map((r) => {
      const latest = num(r[c.latest]);
      const close = num(r[c.close]);
      const previous = num(r[c.previous]);
      let diff = num(r[c.diff]);
      // Sheets may store 1.25 meaning 1.25 % (when not formatted as percent)
      if (!isNaN(diff) && Math.abs(diff) > 0.5 && !isNaN(latest) && !isNaN(close) && close) diff = latest / close - 1;
      const stamp = r[c.updated];
      const updated = typeof stamp === "number" && Number.isFinite(stamp)
        ? new Date(Date.UTC(1899, 11, 30) + stamp * 86400000).toISOString().slice(0, 16).replace("T", " ") + " ICT"
        : String(stamp ?? "");
      return {
        ticker: String(r[c.ticker]).trim().toUpperCase(),
        latest,
        regularClose: close,
        previousClose: previous > 0 ? previous : undefined,
        diffPct: isNaN(diff) ? (previous > 0 ? latest / previous - 1 : close ? latest / close - 1 : 0) : diff,
        session: String(r[c.session] ?? ""),
        updated,
        currency: String(r[c.currency] || "USD").toUpperCase(),
        source: String(r[c.source] || ""),
      };
    });
}

/**
 * Heuristic parser for the Dashboard/Holdings/Accounts tab.
 * - Label/value cells: "Total Net Worth", "Cash Reserves", "USD/THB"
 * - A table with Ticker + Shares header → positions (optional Account, Avg Cost, Sector, Theme, Price)
 * - A table with Sector (or Theme) + Value header → allocation
 */
export function parseDashboard(rows: Row[], txTabs: Settings["txTabs"] = LEGACY_TABS): DashboardData {
  const d: DashboardData = { sectors: [], themes: [], positions: [] };

  const labelValue = (re: RegExp): number | undefined => {
    for (const r of rows)
      for (let i = 0; i < r.length; i++)
        if (typeof r[i] === "string" && re.test(String(r[i]).toLowerCase())) {
          for (let j = i + 1; j < r.length; j++) {
            const n = num(r[j]);
            if (!isNaN(n)) return n;
          }
        }
    return undefined;
  };
  d.netWorth = labelValue(/net\s*worth/);
  d.cash = labelValue(/cash/);
  d.usdThb = labelValue(/usd\s*\/?\s*thb/);

  const table = (must: string[]) => {
    const hi = findHeaderRow(rows, must);
    if (hi < 0) return null;
    const body: Row[] = [];
    for (const r of rows.slice(hi + 1)) {
      if (r.every((x) => x === "" || x == null)) break;
      body.push(r);
    }
    return { header: rows[hi], body };
  };

  const pos = table(["ticker", "shares"]) ?? table(["ticker", "qty"]);
  if (pos) {
    const h = pos.header;
    const c = {
      ticker: findCol(h, "Ticker"),
      account: findCol(h, "Account", "Platform", "Broker", "Source"),
      shares: findCol(h, "Shares", "Qty"),
      avg: findCol(h, "Avg Cost", "Average Cost", "Cost"),
      sector: findCol(h, "Sector"),
      theme: findCol(h, "Theme"),
      price: findCol(h, "Price", "Last"),
    };
    const accounts = Object.entries(txTabs);
    const normalize = (name: string) => name.trim().toLowerCase().replace(/!$/, "");
    for (const r of pos.body) {
      const ticker = String(r[c.ticker] ?? "").trim().toUpperCase();
      const shares = num(r[c.shares]);
      if (!ticker || isNaN(shares) || shares === 0) continue;
      const label = normalize(String(r[c.account] ?? ""));
      const match = accounts.find(([name]) => normalize(name) === label)
        ?? accounts.find(([, tab]) => normalize(tab) === label || normalize(tab.replace(/\s+transactions$/i, "")) === label);
      const account = match?.[0] ?? (!label && accounts.length === 1 ? accounts[0][0] : undefined);
      if (!account) continue;
      d.positions.push({
        ticker,
        account,
        shares,
        avgCost: isNaN(num(r[c.avg])) ? 0 : num(r[c.avg]),
        sector: c.sector >= 0 ? String(r[c.sector] || "Other") : "Other",
        theme: c.theme >= 0 ? String(r[c.theme] || "Other") : "Other",
        sheetPrice: c.price >= 0 && !isNaN(num(r[c.price])) ? num(r[c.price]) : undefined,
      });
    }
  }

  const alloc = (key: string): AllocationItem[] => {
    const t = table([key, "value"]) ?? table([key, "usd"]) ?? table([key, "%"]);
    if (!t) return [];
    const ni = findCol(t.header, key);
    const vi = findCol(t.header, "Value", "USD", "Market Value", "%");
    return t.body
      .map((r) => ({ name: String(r[ni] ?? ""), value: num(r[vi]) }))
      .filter((x) => x.name && !isNaN(x.value) && x.value > 0);
  };
  d.sectors = alloc("Sector");
  d.themes = alloc("Theme");
  return d;
}

export interface FxRate { date: string; rate: number; source: string }
export interface AssetMetadata { sector: string; theme: string }

export function parseAssetMetadata(rows: Row[]): Record<string, AssetMetadata> {
  return Object.fromEntries(readFeed(rows, "Asset metadata", ["Ticker", "Sector", "Theme"], (ticker, sector, theme) => {
    const symbol = String(ticker ?? "").trim().toUpperCase();
    return symbol ? [symbol, { sector: String(sector ?? "").trim(), theme: String(theme ?? "").trim() }] as const : undefined;
  }));
}

export function parseCashSnapshots(rows: Row[]): import("./portfolioEngine").CashSnapshot[] {
  const entries = readFeed(rows, "Cash balances", ["Date", "Account", "Currency", "Balance"], (date, name, currency, balance) => {
    const day = toIsoDate(date);
    const account = String(name ?? "").trim();
    const unit = String(currency ?? "").trim().toUpperCase();
    const amount = num(balance);
    return /^\d{4}-\d{2}-\d{2}$/.test(day) && account && (unit === "USD" || unit === "THB") && Number.isFinite(amount)
      ? { date: day, account, currency: unit, balance: amount } as const : undefined;
  });
  return [...new Map(entries.map((entry) => [JSON.stringify([entry.date, entry.account.toLowerCase(), entry.currency]), entry])).values()];
}

export interface DividendSchedule {
  ticker: string;
  exDate: string;
  paymentDate: string;
  amount: number;
  currency: string;
  announced: boolean;
  source: string;
}

export function parseFxRates(rows: Row[]): FxRate[] {
  return readFeed(rows, "FX rates", ["Date", "Pair", "Rate", "Source"], (date, pair, rate, source) => {
    const value = num(rate);
    const iso = toIsoDate(date);
    return iso && String(pair).toUpperCase().replace(/[^A-Z]/g, "") === "USDTHB" && value > 0
      ? { date: iso, rate: value, source: String(source || "FX_Rates") } : undefined;
  });
}

export function parseDividendSchedule(rows: Row[]): DividendSchedule[] {
  return readFeed(rows, "Dividend schedule", ["Ticker", "Ex Date", "Payment Date", "Amount Per Share", "Currency", "Status", "Source"],
    (ticker, exDate, paymentDate, amount, currency, status, source) => {
      const payment = toIsoDate(paymentDate);
      const value = num(amount);
      const state = String(status ?? "").trim().toLowerCase();
      const ccy = String(currency ?? "").trim().toUpperCase();
      if (!ticker || !payment || !(value > 0) || !["USD", "THB"].includes(ccy) || !["announced", "estimated"].includes(state)) return;
      return {
        ticker: String(ticker).trim().toUpperCase(), exDate: toIsoDate(exDate), paymentDate: payment, amount: value,
        currency: ccy, announced: state === "announced" && Boolean(source), source: String(source ?? ""),
      };
    });
}

function readFeed<T>(rows: Row[], name: string, fields: string[], parse: (...values: Row) => T | undefined): T[] {
  if (!rows.length) return [];
  const header = rows[0].map(norm);
  const columns = fields.map((field) => header.indexOf(norm(field)));
  const missing = fields.filter((_, index) => columns[index] < 0);
  if (missing.length) throw new Error(`${name}: missing columns ${missing.join(", ")}`);
  return rows.slice(1).flatMap((row) => {
    const parsed = parse(...columns.map((column) => row[column]));
    return parsed ? [parsed] : [];
  });
}

export function parsePriceHistory(rows: Row[]) {
  const prices: Record<string, Record<string, number>> = Object.create(null);
  readFeed(rows, "Price history", ["Date", "Ticker", "Close", "Currency"], (date, symbol, close, currency) => {
    const ticker = String(symbol ?? "").trim().toUpperCase();
    const day = toIsoDate(date);
    const value = num(close);
    if (day && /^[A-Z0-9.^=-]{1,20}$/.test(ticker) && Number.isFinite(value) && value > 0 &&
        (ticker === "THB=X" ? currency === "THB" : currency === "USD")) {
      const history = prices[ticker] ?? (prices[ticker] = {});
      history[day] = value;
    }
    return undefined;
  });
  return prices;
}
