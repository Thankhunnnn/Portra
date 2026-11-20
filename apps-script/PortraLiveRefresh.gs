/** @OnlyCurrentDoc */

const PORTRA_LIVE_HEADER = ["Ticker", "Latest Price", "Regular Close", "Currency", "Last Updated", "Source", "Session", "Previous Close"];
const PORTRA_REFRESH_HEADER = ["Request ID", "Result", "Completed At"];

function portraEnableWebRefresh() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  const props = PropertiesService.getScriptProperties();
  if (!book || !props.getProperty("PORTRA_REFRESH_KEY")) throw new Error("Set PORTRA_REFRESH_KEY in the bound script properties first.");
  props.setProperty("PORTRA_SPREADSHEET_ID", book.getId());
  portraRefreshTab(book, "Price_Refresh", PORTRA_REFRESH_HEADER);
  if (!ScriptApp.getProjectTriggers().some((trigger) => trigger.getHandlerFunction() === "portraProcessRefresh")) {
    ScriptApp.newTrigger("portraProcessRefresh").timeBased().everyMinutes(1).create();
  }
}

function doPost(event) {
  // The web app can enqueue one job. It returns no spreadsheet data and
  // never takes a sheet ID, symbol list, or destination from the caller.
  const respond = (value) => ContentService.createTextOutput(value);
  const props = PropertiesService.getScriptProperties();
  const params = event?.parameter || {};
  const key = props.getProperty("PORTRA_REFRESH_KEY");
  if (!key || params.key !== key || !/^[0-9a-f-]{36}$/i.test(params.id || "")) return respond("Rejected");
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(2000)) return respond("Busy");
  try {
    const pending = JSON.parse(props.getProperty("PORTRA_PENDING_REFRESH") || "null");
    if (pending && Date.now() - pending.queuedAt < 420000) return respond("Busy");
    const previous = Number(props.getProperty("PORTRA_LAST_REFRESH") || 0);
    if (Date.now() - previous < 15000) return respond("Busy");
    props.setProperty("PORTRA_PENDING_REFRESH", JSON.stringify({ id: params.id, queuedAt: Date.now() }));
    return respond("Queued");
  } finally {
    lock.releaseLock();
  }
}

function portraProcessRefresh() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty("PORTRA_PENDING_REFRESH")) return;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  let job;
  try {
    job = JSON.parse(props.getProperty("PORTRA_PENDING_REFRESH") || "null");
    if (!job || job.startedAt) return;
    job.startedAt = Date.now();
    props.setProperty("PORTRA_PENDING_REFRESH", JSON.stringify(job));
  } finally {
    lock.releaseLock();
  }
  const book = SpreadsheetApp.getActiveSpreadsheet();
  if (!book || book.getId() !== props.getProperty("PORTRA_SPREADSHEET_ID")) {
    props.deleteProperty("PORTRA_PENDING_REFRESH");
    throw new Error("Portra refresh must run from the bound spreadsheet.");
  }
  let result;
  try {
    result = portraRefreshLiveQuotes();
  } catch (error) {
    console.warn(error.message);
    result = "Could not fetch market prices. Existing quotes were kept.";
  }
  try {
    const tab = portraRefreshTab(book, "Price_Refresh", PORTRA_REFRESH_HEADER);
    const previous = tab.getLastRow() >= 2 ? tab.getRange(2, 1, Math.min(tab.getLastRow() - 1, 19), 3).getValues() : [];
    tab.getRange(2, 1, previous.length + 1, 3).setValues([[job.id, result, new Date()], ...previous]);
    SpreadsheetApp.flush();
  } finally {
    props.setProperty("PORTRA_LAST_REFRESH", String(Date.now()));
    props.deleteProperty("PORTRA_PENDING_REFRESH");
  }
}

function portraRefreshTab(book, name, headers) {
  const tab = book.getSheetByName(name) || book.insertSheet(name);
  tab.getRange(1, 1, 1, headers.length).setValues([headers]);
  tab.setFrozenRows(1);
  return tab;
}

function portraRefreshLiveQuotes() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  if (!book) throw new Error("Open the bound Portra spreadsheet.");
  const symbols = new Set(PORTRA_INDEXES);
  for (const tab of book.getSheets()) {
    if (tab.getLastRow() < 2 || tab.getMaxColumns() < 3) continue;
    const header = tab.getRange(1, 1, 1, 3).getDisplayValues()[0].map((cell) => cell.trim().toLowerCase());
    if (header.join("|") !== "date|ticker|action") continue;
    for (const [ticker] of tab.getRange(2, 2, tab.getLastRow() - 1, 1).getDisplayValues()) {
      const symbol = ticker.trim().toUpperCase();
      if (PORTRA_STOCK.test(symbol) && symbol !== "CASH") {
        symbols.add(/^(BTC|ETH|SOL|BNB|XRP|ADA|DOGE|AVAX|USDT|USDC)$/.test(symbol) && /binance/i.test(tab.getName()) ? symbol + "-USD" : symbol);
      }
    }
  }
  const tickers = [...symbols].sort();
  const responses = UrlFetchApp.fetchAll(tickers.map((ticker) => ({
    url: `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1m&range=1d&includePrePost=true`,
    muteHttpExceptions: true,
    headers: { "User-Agent": "Mozilla/5.0" },
  })));
  const tab = portraRefreshTab(book, "Live_Quotes", PORTRA_LIVE_HEADER);
  const old = tab.getLastRow() > 1 ? tab.getRange(2, 1, tab.getLastRow() - 1, PORTRA_LIVE_HEADER.length).getValues() : [];
  const quotes = new Map(old.filter(([ticker]) => ticker).map((row) => [row[0], row]));
  const missed = [];
  const formatTime = (seconds) => Utilities.formatDate(new Date(seconds * 1000), "Asia/Bangkok", "yyyy-MM-dd HH:mm:ss") + " ICT";
  for (const [index, ticker] of tickers.entries()) {
    try {
      if (responses[index].getResponseCode() !== 200) throw new Error("HTTP " + responses[index].getResponseCode());
      const quote = portraParseLiveQuote(JSON.parse(responses[index].getContentText()), ticker, formatTime);
      if (quote[4] >= (quotes.get(ticker)?.[4] || "")) quotes.set(ticker, quote);
    } catch (error) {
      console.warn(ticker + ": " + error.message);
      missed.push(ticker);
    }
  }
  const rows = [...quotes.values()];
  if (rows.length) {
    if (tab.getMaxRows() < rows.length + 1) tab.insertRowsAfter(tab.getMaxRows(), rows.length + 1 - tab.getMaxRows());
    tab.getRange(2, 5, rows.length, 1).setNumberFormat("@");
    tab.getRange(2, 1, rows.length, PORTRA_LIVE_HEADER.length).setValues(rows);
  }
  SpreadsheetApp.flush();
  const checked = tickers.length - missed.length;
  console.log(`Checked ${checked}/${tickers.length} quotes.`);
  return missed.length ? `Checked ${checked}/${tickers.length}. No fresh quote for: ${missed.join(", ")}.` : "OK";
}

function portraParseLiveQuote(body, ticker, formatTime) {
  const data = body.chart?.result?.[0];
  const meta = data?.meta;
  if (!meta) throw new Error("No market data");
  let price = meta.regularMarketPrice;
  let time = meta.regularMarketTime;
  const closes = data.indicators?.quote?.[0]?.close || [];
  for (let index = closes.length - 1; index >= 0; index--) {
    const stamp = data.timestamp?.[index];
    if (closes[index] > 0 && Number.isFinite(stamp) && !(stamp < time)) {
      price = closes[index];
      time = stamp;
      break;
    }
  }
  if (!(price > 0) || !Number.isFinite(time) || !["USD", "THB"].includes(meta.currency)) throw new Error("Quote is incomplete");
  const market = meta.currentTradingPeriod;
  const within = (period) => period && time >= period.start && time < period.end;
  const session = within(market?.pre) && time !== meta.regularMarketTime ? "PRE-MARKET"
    : within(market?.post) && time !== meta.regularMarketTime ? "AFTER-HOURS" : "REGULAR";
  return [ticker, price, meta.regularMarketPrice || price, meta.currency, formatTime(time), "Yahoo Finance", session,
    meta.chartPreviousClose || meta.previousClose || ""];
}
