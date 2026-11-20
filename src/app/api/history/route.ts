import { NextRequest, NextResponse } from "next/server";

/**
 * Cached daily close history (Yahoo Finance chart endpoint).
 * GET /api/history?symbols=AAPL,BTC-USD,^GSPC&from=2023-01-01
 * Responses are cached by Next's data cache for 6 hours per upstream URL.
 */
export const runtime = "nodejs";

const SYMBOL_RE = /^[A-Za-z0-9.^=\-]{1,20}$/;

async function history(symbol: string, from: number, to: number) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol
  )}?period1=${from}&period2=${to}&interval=1d&events=history`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    next: { revalidate: 6 * 3600 },
  });
  if (!res.ok) return {};
  const json = await res.json();
  const r = json?.chart?.result?.[0];
  if (!r?.timestamp) return {};
  const closes: (number | null)[] = r.indicators?.quote?.[0]?.close ?? [];
  const out: Record<string, number> = {};
  r.timestamp.forEach((t: number, i: number) => {
    const c = closes[i];
    if (c != null) out[new Date(t * 1000).toISOString().slice(0, 10)] = Math.round(c * 1e6) / 1e6;
  });
  return out;
}

export async function GET(req: NextRequest) {
  const symbols = (req.nextUrl.searchParams.get("symbols") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => SYMBOL_RE.test(s))
    .slice(0, 40);
  const fromStr = req.nextUrl.searchParams.get("from") ?? "";
  if (symbols.length === 0 || !/^\d{4}-\d{2}-\d{2}$/.test(fromStr))
    return NextResponse.json({ error: "symbols and from=YYYY-MM-DD required" }, { status: 400 });

  // Round "to" to the hour so the upstream URL (and cache key) is stable.
  const to = Math.floor(Date.now() / 3_600_000) * 3_600 + 86_400;
  const from = Math.floor(Date.parse(fromStr) / 1000) - 7 * 86_400;

  const entries = await Promise.all(
    symbols.map(async (s) => [s, await history(s, from, to).catch(() => ({}))] as const)
  );
  return NextResponse.json(Object.fromEntries(entries), {
    headers: { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400" },
  });
}
