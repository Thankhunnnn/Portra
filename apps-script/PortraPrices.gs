/** @OnlyCurrentDoc */

const PORTRA_INDEXES = ["^GSPC", "^IXIC", "^NYA", "VOO", "QQQ", "THB=X"];
const PORTRA_HEADER = ["Date", "Ticker", "Close", "Currency", "Source"];
const PORTRA_DAY = 86400000;
const PORTRA_STOCK = /^[A-Z0-9][A-Z0-9.-]{0,14}$/;

function onOpen() {
  SpreadsheetApp.getUi().createMenu("Portra Prices")
    .addItem("Update closing prices", "portraUpdateDaily")
    .addItem("Backfill from market providers", "portraBackfillPrices")
    .addItem("Enable daily updates", "portraInstallDaily")
    .addToUi();
}

function portraInstallDaily() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  if (!book) throw new Error("Open the bound Portra spreadsheet first.");
  PropertiesService.getScriptProperties().setProperty("PORTRA_SPREADSHEET_ID", book.getId());
  if (!ScriptApp.getProjectTriggers().some((trigger) => trigger.getHandlerFunction() === "portraUpdateDaily")) {
    ScriptApp.newTrigger("portraUpdateDaily").timeBased().atHour(8).everyDays(1).inTimezone("Asia/Bangkok").create();
  }
  return portraUpdateDaily();
}

function portraUpdateDaily() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return "Another refresh is running";
  try {
    const savedId = PropertiesService.getScriptProperties().getProperty("PORTRA_SPREADSHEET_ID");
    const book = SpreadsheetApp.getActiveSpreadsheet() || (savedId && SpreadsheetApp.openById(savedId));
    if (!book) throw new Error("Open the bound Portra spreadsheet first.");
    const zone = book.getSpreadsheetTimeZone();
    const yesterday = Utilities.formatDate(new Date(Date.now() - PORTRA_DAY), "Asia/Bangkok", "yyyy-MM-dd");
    const history = book.getSheetByName("Price_History") || book.insertSheet("Price_History");
    history.getRange(1, 1, 1, PORTRA_HEADER.length).setValues([PORTRA_HEADER]);
    const count = history.getLastRow() - 1;
    const saved = count ? history.getRange(2, 1, count, 2).getValues() : [];
    const dayOf = (value) => value instanceof Date ? Utilities.formatDate(value, zone, "yyyy-MM-dd") : String(value);
    const keys = new Set(saved.map(([date, ticker]) => ticker + "|" + dayOf(date)));
    const stockDays = new Set(saved.filter(([, ticker]) => PORTRA_STOCK.test(ticker) && !ticker.endsWith("-USD"))
      .map(([date]) => dayOf(date)));
    const candidates = [];
    for (const name of ["Portra_Prices", "Benchmark_Quotes"]) {
      const tab = book.getSheetByName(name);
      if (!tab || tab.getLastRow() < 2) continue;
      for (const [ticker, latest, previous, currency, timestamp, provider, session] of tab.getRange(2, 1, tab.getLastRow() - 1, 7).getValues()) {
        if (!ticker || ticker === "CASH" || provider !== "Google Finance" || session !== "REGULAR / DELAYED" ||
          currency !== "USD" || !(timestamp instanceof Date)) continue;
        const date = dayOf(timestamp);
        if (date > yesterday || Date.parse(yesterday) - Date.parse(date) > 7 * PORTRA_DAY) continue;
        const hour = Utilities.formatDate(timestamp, zone, "HH:mm");
        // Cash indices may publish their final calculation after the closing bell.
        const close = hour === "16:00" || (name === "Benchmark_Quotes" && hour >= "16:00" && hour < "18:00");
        if (close && typeof latest === "number" && latest > 0) {
          candidates.push([date, ticker, latest, "USD", "Google Finance · regular session close"]);
          if (PORTRA_STOCK.test(ticker)) stockDays.add(date);
        }
        if (typeof previous === "number" && previous > 0) {
          let prior = Date.parse(date) - PORTRA_DAY;
          while ([0, 6].includes(new Date(prior).getUTCDay())) prior -= PORTRA_DAY;
          candidates.push([portraDay(prior), ticker, previous, "USD", "Google Finance · previous close"]);
        }
      }
    }
    const rows = [];
    let confirmed = 0;
    for (const row of candidates) {
      const [date, ticker, , , source] = row;
      if (source.endsWith("previous close") && !stockDays.has(date)) continue;
      const key = ticker + "|" + date;
      confirmed++;
      if (keys.has(key)) continue;
      keys.add(key);
      rows.push(row);
    }
    if (!confirmed) throw new Error("No recent regular-session closing quotes were available in Portra_Prices or Benchmark_Quotes.");
    if (rows.length) {
      const first = history.getLastRow() + 1;
      const required = first + rows.length - 1;
      if (history.getMaxRows() < required) history.insertRowsAfter(history.getMaxRows(), required - history.getMaxRows());
      history.getRange(first, 1, rows.length, 1).setNumberFormat("@");
      history.getRange(first, 1, rows.length, PORTRA_HEADER.length).setValues(rows);
      SpreadsheetApp.flush();
    }
    const result = `Checked ${confirmed} closing quotes and added ${rows.length} rows.`;
    console.log(result);
    return result;
  } finally {
    lock.releaseLock();
  }
}

function portraBackfillPrices() {
  const docLock = LockService.getScriptLock();
  if (!docLock.tryLock(1000)) return "Another refresh is running";
  try {
    const savedId = PropertiesService.getScriptProperties().getProperty("PORTRA_SPREADSHEET_ID");
    const book = SpreadsheetApp.getActiveSpreadsheet() || (savedId && SpreadsheetApp.openById(savedId));
    if (!book) throw new Error("Run portraInstallDaily from the bound spreadsheet.");
    const symbols = new Set(PORTRA_INDEXES);
    const first = {};
    book.getSheets().forEach((tab) => {
      if (tab.getLastRow() < 2 || tab.getMaxColumns() < 3) return;
      const headers = tab.getRange(1, 1, 1, 3).getDisplayValues()[0].map((cell) => cell.trim().toLowerCase());
      if (headers.join("|") !== "date|ticker|action") return;
      for (const [date, ticker] of tab.getRange(2, 1, tab.getLastRow() - 1, 2).getValues()) {
        const symbol = String(ticker).trim().toUpperCase();
        const day = date instanceof Date ? Utilities.formatDate(date, book.getSpreadsheetTimeZone(), "yyyy-MM-dd") : String(date).slice(0, 10);
        if (!PORTRA_STOCK.test(symbol) || symbol === "CASH" || !/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
        symbols.add(symbol);
        if (!first[symbol] || day < first[symbol]) first[symbol] = day;
      }
    });
    const lastDay = portraDay(Date.now() - PORTRA_DAY);
    const portfolioFirst = Object.values(first).sort()[0] || portraDay(Date.now() - 365 * PORTRA_DAY);
    const history = book.getSheetByName("Price_History") || book.insertSheet("Price_History");
    history.getRange(1, 1, 1, PORTRA_HEADER.length).setValues([PORTRA_HEADER]);
    const oldCount = history.getLastRow() - 1;
    const data = oldCount ? history.getRange(2, 1, oldCount, PORTRA_HEADER.length).getValues() : [];
    const byKey = new Map();
    const latest = {};
    const earliest = {};
    for (const row of data) {
      const day = row[0] instanceof Date ? Utilities.formatDate(row[0], book.getSpreadsheetTimeZone(), "yyyy-MM-dd") : String(row[0]);
      const ticker = row[1];
      if (!day || !ticker) continue;
      byKey.set(ticker + "|" + day, [day, ...row.slice(1)]);
      if (!latest[ticker] || day > latest[ticker]) latest[ticker] = day;
      if (!earliest[ticker] || day < earliest[ticker]) earliest[ticker] = day;
    }
    const jobs = [...symbols].map((ticker) => {
      const wanted = portraDay(Date.parse(first[ticker] || portfolioFirst) - 7 * PORTRA_DAY);
      const from = latest[ticker] && earliest[ticker] <= (first[ticker] || portfolioFirst)
        ? portraDay(Date.parse(latest[ticker]) - 7 * PORTRA_DAY) : wanted;
      return { ticker, from, to: lastDay, requests: portraUrls(ticker, from, lastDay) };
    });
    const urls = [...new Set(jobs.flatMap((job) => job.requests))];
    const marketResponses = new Map();
    for (let offset = 0; offset < urls.length; offset += 20) {
      const batch = urls.slice(offset, offset + 20);
      const responses = UrlFetchApp.fetchAll(batch.map((url) => ({
        url, muteHttpExceptions: true, headers: { Accept: "application/json, text/csv, */*" },
      })));
      batch.forEach((url, index) => marketResponses.set(url, responses[index]));
    }
    const readResponse = (url) => {
      const response = marketResponses.get(url);
      if (!response || response.getResponseCode() !== 200) throw new Error("HTTP " + (response?.getResponseCode() || "unavailable"));
      return response.getContentText();
    };
    const missed = [];
    let imported = 0;
    for (const { ticker, from, to } of jobs) {
      try {
        const rows = portraHistory(ticker, from, to, readResponse);
        if (!rows.length && !latest[ticker]) missed.push(ticker);
        for (const row of rows) byKey.set(ticker + "|" + row[0], row);
        imported += rows.length;
      } catch (error) {
        missed.push(ticker);
        console.warn(ticker + ": " + error.message);
      }
    }
    const rows = Array.from(byKey.values()).sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
    if (rows.length) {
      if (history.getMaxRows() < rows.length + 1) history.insertRowsAfter(history.getMaxRows(), rows.length + 1 - history.getMaxRows());
      history.getRange(2, 1, rows.length, 1).setNumberFormat("@");
      history.getRange(2, 1, rows.length, PORTRA_HEADER.length).setValues(rows);
    }
    SpreadsheetApp.flush();
    const result = `Upserted ${imported} price rows through ${lastDay}`;
    console.log(result);
    if (missed.length) throw new Error(result + ". Sources unavailable for: " + missed.join(", "));
    return result;
  } finally {
    docLock.releaseLock();
  }
}

function portraDay(time) {
  return new Date(time).toISOString().slice(0, 10);
}

function portraUrls(ticker, from, to) {
  const yahoo = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=2y&interval=1d`;
  if (ticker === "THB=X") return [`https://api.frankfurter.dev/v1/${from}..${to}?base=USD&symbols=THB`];
  if (ticker === "^GSPC") return [yahoo];
  if (ticker === "^NYA") return [yahoo];
  if (ticker.endsWith("-USD")) {
    const urls = [];
    const last = Date.parse(to) + PORTRA_DAY;
    for (let start = Date.parse(from); start < last; start += 280 * PORTRA_DAY) {
      const end = Math.min(start + 280 * PORTRA_DAY, last);
      urls.push(`https://api.exchange.coinbase.com/products/${encodeURIComponent(ticker)}/candles?granularity=86400&start=${portraDay(start)}&end=${portraDay(end)}`);
    }
    return urls;
  }
  const asset = ticker === "^IXIC" ? "index" : ["VOO", "QQQ"].includes(ticker) ? "etf" : "stocks";
  const symbol = ticker === "^IXIC" ? "COMP" : ticker;
  return [
    `https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol)}/historical?assetclass=${asset}&fromdate=${from}&todate=${to}&limit=5000`,
    yahoo,
  ];
}

function portraHistory(ticker, from, to, read) {
  const urls = portraUrls(ticker, from, to);
  let points = [];
  let source = "Nasdaq";
  if (ticker === "THB=X") {
    source = "Frankfurter";
    const json = JSON.parse(read(urls[0]));
    points = Object.entries(json.rates || {}).map(([date, rates]) => [date, rates.THB]);
  } else if (ticker === "^GSPC" || ticker === "^NYA") {
    source = "Yahoo Finance";
    points = portraYahooPoints(read(urls[0]));
  } else if (ticker.endsWith("-USD")) {
    source = "Coinbase Exchange";
    for (const url of urls) {
      const candles = JSON.parse(read(url));
      points.push(...candles.map((item) => [portraDay(item[0] * 1000), item[4]]));
    }
  } else {
    try {
      const json = JSON.parse(read(urls[0]));
      const rows = json.data?.tradesTable?.rows;
      if (!rows || json.data.totalRecords > rows.length) throw new Error("Nasdaq response was incomplete");
      points = rows.map((row) => {
        const [month, day, year] = row.date.split("/");
        return [`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`, Number(String(row.close).replace(/[$,]/g, ""))];
      });
    } catch {
      source = "Yahoo Finance";
      points = portraYahooPoints(read(urls[1]));
    }
  }
  return Array.from(new Map(points.filter(([day, close]) => /^\d{4}-\d{2}-\d{2}$/.test(day) && day >= from && day <= to &&
    typeof close === "number" && Number.isFinite(close) && close > 0)).entries())
    .map(([day, close]) => [day, ticker, close, ticker === "THB=X" ? "THB" : "USD", source]);
}

function portraYahooPoints(body) {
  const item = JSON.parse(body).chart?.result?.[0];
  if (!item) throw new Error("Yahoo chart response was empty");
  const closes = item?.indicators?.quote?.[0]?.close || [];
  return (item?.timestamp || []).map((time, i) => [portraDay(time * 1000), closes[i]]);
}
