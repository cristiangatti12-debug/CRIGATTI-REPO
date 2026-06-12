// Centralized Yahoo Finance data layer.
// All routes must import from here — no direct Yahoo fetch calls in routes.

import { baseTicker, EU_APPROX_PE, resolveFairPE, resolveSector } from "./peMaps";

const YF_HEADERS = {
  "User-Agent":      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept":          "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer":         "https://finance.yahoo.com/",
  "Origin":          "https://finance.yahoo.com",
};

const EU_SUFFIX = /\.[A-Z]{1,2}$/;
const ETF_TICKERS = new Set([
  "SPY","QQQ","IWM","VTI","VWCE","IWDA","CSPX","EEM","GLD","TLT","VOO","VUG",
  "VTV","VEA","VWO","BND","AGG","SCHD","JEPI","JEPQ","DIA","XLK","XLF","XLE",
]);

const PERIOD_MAP: Record<string, string> = {
  "1W": "5d",
  "1M": "1mo",
  "3M": "3mo",
  "1Y": "1y",
  "5Y": "5y",
};

const PRIMARY_SUFFIXES = new Set([
  ".MI", ".PA", ".DE", ".L", ".AS", ".SW", ".MC", ".CO", ".BR", ".ST",
  ".F",  ".MU", ".DU", ".HM", ".BE",
  ".LS", ".LN", ".VX",
]);
const BAD_EXCHANGES = new Set(["XC", "XD", "GREY", "PNK", "OOTC", "OTC"]);

// ── Types ──────────────────────────────────────────────────────────────────────

export interface Quote {
  ticker:          string;
  price:           number;
  prevClose:       number;
  changePct:       number;
  currency:        string;
  pe:              number | null;
  eps:             number | null;
  bookValue:       number | null;
  enterpriseValue: number | null;
  evToEbitda:      number | null;
  marketCap:       number | null;
  sector?:         string;
  ma200:           number | null;
  weekHigh52:      number | null;
  weekLow52:       number | null;
  weekChange52:    number | null;
}

export interface OHLCV {
  date:   string;
  close:  number;
  open:   number;
  high:   number;
  low:    number;
  volume: number;
}

export interface SearchResult {
  symbol:   string;
  name:     string;
  type:     string;
  exchange: string;
}

// ── Internal helpers ────────────────────────────────────────────────────────────

function parseYFQuote(q: any): Quote {
  const price     = (q.regularMarketPrice     as number) ?? 0;
  const prevClose = (q.regularMarketPreviousClose as number) ?? (q.chartPreviousClose as number) ?? price;
  const changePct = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;

  const trailingPE = typeof q.trailingPE === "number" ? q.trailingPE : null;
  const forwardPE  = typeof q.forwardPE  === "number" ? q.forwardPE  : null;
  const pe =
    trailingPE && trailingPE > 0 && trailingPE < 300 ? trailingPE :
    forwardPE  && forwardPE  > 0 && forwardPE  < 300 ? forwardPE  :
    null;

  return {
    ticker:          q.symbol ?? "",
    price,
    prevClose,
    changePct,
    currency:        (q.currency as string)     ?? "USD",
    pe,
    eps:             typeof q.trailingEps              === "number" ? q.trailingEps              : null,
    bookValue:       typeof q.bookValue                === "number" ? q.bookValue                : null,
    enterpriseValue: typeof q.enterpriseValue          === "number" ? q.enterpriseValue          : null,
    evToEbitda:      typeof q.enterpriseToEbitda       === "number" ? q.enterpriseToEbitda       : null,
    marketCap:       typeof q.marketCap                === "number" ? q.marketCap                : null,
    sector:          (q.sector as string | undefined) || undefined,
    ma200:           typeof q.twoHundredDayAverage     === "number" ? q.twoHundredDayAverage     : null,
    weekHigh52:      typeof q.fiftyTwoWeekHigh         === "number" ? q.fiftyTwoWeekHigh         : null,
    weekLow52:       typeof q.fiftyTwoWeekLow          === "number" ? q.fiftyTwoWeekLow          : null,
    weekChange52:    typeof q.fiftyTwoWeekChange       === "number" ? q.fiftyTwoWeekChange * 100 : null,
  };
}

// ── Exported API ───────────────────────────────────────────────────────────────

/**
 * Fetch a live quote for a single symbol via Yahoo Finance query2 v7/quote.
 * prevClose = regularMarketPreviousClose ?? chartPreviousClose (never previousClose).
 * changePct is recomputed from price and prevClose for accuracy.
 */
export async function getQuote(symbol: string): Promise<Quote> {
  const url = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`;
  const res = await fetch(url, { headers: YF_HEADERS });
  const json = await res.json();
  const q = json?.quoteResponse?.result?.[0];
  if (!q) throw new Error(`No quote for ${symbol}`);
  if (process.env.NODE_ENV === "development") {
    const age = Date.now() - (q.regularMarketTime ?? 0) * 1000;
    if (age > 48 * 60 * 60 * 1000) {
      console.warn(`[vela] Stale quote for ${symbol} — ${Math.round(age / 3600000)}h old`);
    }
  }
  return parseYFQuote(q);
}

/**
 * Batch-fetch quotes for multiple symbols (chunks of 40) via query2.
 * Returns a map of Yahoo-normalised symbol → Quote.
 * Symbols not found in the response are absent from the map (no error).
 */
export async function getQuotes(symbols: string[]): Promise<Record<string, Quote>> {
  if (!symbols.length) return {};
  const result: Record<string, Quote> = {};
  const CHUNK = 40;

  for (let i = 0; i < symbols.length; i += CHUNK) {
    const batch = symbols.slice(i, i + CHUNK);
    const url   = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(batch.join(","))}`;
    try {
      const res  = await fetch(url, { headers: YF_HEADERS });
      const json = await res.json();
      const quotes: any[] = json?.quoteResponse?.result ?? [];
      for (const q of quotes) {
        if (q.symbol) result[q.symbol as string] = parseYFQuote(q);
      }
    } catch { /* keep partial results */ }
  }

  return result;
}

/**
 * Fetch daily OHLCV for a symbol.
 * Periods: 1W=5d · 1M=1mo · 3M=3mo · 1Y=1y · 5Y=5y (5Y used internally by signals routes)
 * Uses adjclose for close values when available.
 */
export async function getHistoricalPrices(
  symbol: string,
  period: "1W" | "1M" | "3M" | "1Y" | "5Y",
): Promise<OHLCV[]> {
  const range = PERIOD_MAP[period] ?? "1mo";
  const url   = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`;
  const res   = await fetch(url, { headers: YF_HEADERS });
  const json  = await res.json();
  const r     = json?.chart?.result?.[0];
  if (!r) return [];

  const timestamps: number[]          = r.timestamp ?? [];
  const q                              = r.indicators?.quote?.[0] ?? {};
  const closes:  (number | null)[]    = r.indicators?.adjclose?.[0]?.adjclose ?? q.close  ?? [];
  const opens:   (number | null)[]    = q.open   ?? [];
  const highs:   (number | null)[]    = q.high   ?? [];
  const lows:    (number | null)[]    = q.low    ?? [];
  const volumes: (number | null)[]    = q.volume ?? [];

  return timestamps
    .map((ts, i) => ({
      date:   new Date(ts * 1000).toISOString().slice(0, 10),
      close:  closes[i]  ?? 0,
      open:   opens[i]   ?? 0,
      high:   highs[i]   ?? 0,
      low:    lows[i]    ?? 0,
      volume: volumes[i] ?? 0,
    }))
    .filter(d => d.close > 0);
}

/**
 * Search tickers via Yahoo Finance query2 v1/search.
 * Filters out OTC, pink-sheet, shadow listings and digit-prefixed symbols.
 * Returns up to 5 results sorted by exchange quality (US primary > EU primary > rest).
 */
export async function searchTicker(query: string): Promise<SearchResult[]> {
  const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=12&newsCount=0&listsCount=0`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
  });
  const json = await res.json();

  return ((json?.quotes ?? []) as any[])
    .filter(q => q.symbol && q.quoteType !== "FUTURE" && q.quoteType !== "CURRENCY")
    .map(q => ({ ...q, _score: exchangeScore(q) }))
    .filter(q => q._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 5)
    .map(q => ({
      symbol:   q.symbol   as string,
      name:     (q.longname ?? q.shortname ?? q.symbol) as string,
      type:     (q.quoteType ?? "") as string,
      exchange: (q.exchDisp ?? q.exchange ?? "") as string,
    }));
}

function exchangeScore(q: any): number {
  const sym:      string = q.symbol   ?? "";
  const exch:     string = (q.exchange  ?? "").toUpperCase();
  const exchDisp: string = (q.exchDisp  ?? "").toUpperCase();
  if (/^\d/.test(sym)) return 0;
  if (BAD_EXCHANGES.has(exch)) return 0;
  if (exchDisp.includes("OTHER OTC") || exchDisp.includes("PINK")) return 0;
  if (["NMS", "NYQ", "NGM", "NCM", "ASE"].includes(exch)) return 3;
  if (PRIMARY_SUFFIXES.has("." + sym.split(".").slice(-1)[0]?.toUpperCase())) return 2;
  return 1;
}

// ── Unified P/E sourcing ──────────────────────────────────────────────────────
// Single helper consumed by /api/signals, /api/market-signals, and /api/valuation
// so live P/E reaches every surface that renders it. Walks a fallback chain
// and stops at the first sane value (>0 and <300). Always returns a meta block
// (fairPE + sector) so callers don't need to re-derive it.

export interface PERatioResult {
  pe:           number | null;
  fairPE:       number;
  sector:       string;
  source:       "live-fmp" | "live-yf-quote" | "live-yf-summary" | "live-av" | "estimated" | "unavailable";
  peEstimated:  boolean;
}

function saneTrailingPE(v: unknown): number | null {
  const n = typeof v === "string" ? parseFloat(v) : v;
  return typeof n === "number" && isFinite(n) && n > 0 && n < 300 ? n : null;
}

// One-shot diagnostic to surface what FMP actually returns for failing
// tickers. Logs response status + a compact view of the body so prod logs
// reveal whether the plan is rate-limited, returns null pe, or uses a
// different field name. Remove once the right field is confirmed.
function logFMPMiss(endpoint: string, ticker: string, status: number, body: unknown): void {
  let preview: string;
  if (Array.isArray(body)) {
    const first = body[0];
    preview = first
      ? `array[${body.length}] keys=${Object.keys(first).slice(0, 12).join(",")} pe=${JSON.stringify(first.pe)} peRatioTTM=${JSON.stringify(first.peRatioTTM)} priceEarningsRatioTTM=${JSON.stringify(first.priceEarningsRatioTTM)}`
      : `array[0]`;
  } else if (body && typeof body === "object") {
    preview = `object keys=${Object.keys(body as object).slice(0, 12).join(",")} sample=${JSON.stringify(body).slice(0, 200)}`;
  } else {
    preview = `non-object ${typeof body} sample=${JSON.stringify(body).slice(0, 200)}`;
  }
  console.warn(`[vela] FMP ${endpoint} ${ticker} status=${status} → ${preview}`);
}

// P/E is a fundamentals-driven number derived from trailing earnings + the
// most recent close — it does not change intraday in any meaningful way.
// One day of cache is the right granularity: it keeps the FMP free-tier well
// under quota and gives every user the same number through the trading day.
const PE_CACHE_SECONDS = 86400;

async function fetchFMPQuotePE(ticker: string): Promise<number | null> {
  const FMP_KEY = (process.env.FMP_API_KEY ?? "").trim();
  if (!FMP_KEY) return null;

  // Primary: /stable/ratios-ttm — priceToEarningsRatioTTM (note the "To").
  // This is the only FMP endpoint that returns trailing P/E on the post-Aug-2025
  // free plan; the older /api/v3/quote returns 403 Legacy for new keys.
  try {
    const url = `https://financialmodelingprep.com/stable/ratios-ttm?symbol=${encodeURIComponent(ticker)}&apikey=${FMP_KEY}`;
    const res = await fetch(url, { next: { revalidate: PE_CACHE_SECONDS } } as RequestInit);
    const json = res.ok ? await res.json() : null;
    const r = Array.isArray(json) && json.length > 0 ? json[0] : null;
    const pe = saneTrailingPE(r?.priceToEarningsRatioTTM ?? r?.priceEarningsRatioTTM ?? r?.peRatioTTM);
    if (pe) return pe;
    // 402 on /stable/* means the symbol is on a paid tier (typical for EU
    // tickers on the free plan) — don't bother logging that path.
    if (res.status !== 402) logFMPMiss("/stable/ratios-ttm", ticker, res.status, json);
  } catch (e) { console.warn(`[vela] FMP /stable/ratios-ttm ${ticker} threw: ${(e as Error).message}`); }

  // Backup: invert earningsYieldTTM from /stable/key-metrics-ttm.
  // Some tickers expose earnings yield but not the direct P/E field.
  try {
    const url = `https://financialmodelingprep.com/stable/key-metrics-ttm?symbol=${encodeURIComponent(ticker)}&apikey=${FMP_KEY}`;
    const res = await fetch(url, { next: { revalidate: PE_CACHE_SECONDS } } as RequestInit);
    const json = res.ok ? await res.json() : null;
    const m = Array.isArray(json) && json.length > 0 ? json[0] : null;
    const direct = saneTrailingPE(m?.peRatioTTM ?? m?.priceToEarningsRatioTTM);
    if (direct) return direct;
    const yieldTTM = typeof m?.earningsYieldTTM === "number" ? m.earningsYieldTTM : null;
    const inverted = yieldTTM && yieldTTM > 0 ? saneTrailingPE(1 / yieldTTM) : null;
    if (inverted) return inverted;
    if (res.status !== 402) logFMPMiss("/stable/key-metrics-ttm", ticker, res.status, json);
  } catch (e) { console.warn(`[vela] FMP /stable/key-metrics-ttm ${ticker} threw: ${(e as Error).message}`); }

  return null;
}

async function fetchYFQuoteSummaryPE(ticker: string): Promise<number | null> {
  for (const host of ["query2", "query1"]) {
    try {
      const url = `https://${host}.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=summaryDetail&formatted=false`;
      const res = await fetch(url, { headers: YF_HEADERS, next: { revalidate: PE_CACHE_SECONDS } } as RequestInit);
      if (!res.ok) continue;
      const json = await res.json();
      const sd   = json?.quoteSummary?.result?.[0]?.summaryDetail;
      if (!sd) continue;
      const trailing = saneTrailingPE(sd.trailingPE?.raw ?? sd.trailingPE);
      if (trailing) return trailing;
      const forward = saneTrailingPE(sd.forwardPE?.raw ?? sd.forwardPE);
      if (forward) return forward;
    } catch { continue; }
  }
  return null;
}

async function fetchYFV7QuotePE(ticker: string): Promise<number | null> {
  try {
    const url = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(ticker)}`;
    const res = await fetch(url, { headers: YF_HEADERS, next: { revalidate: PE_CACHE_SECONDS } } as RequestInit);
    if (!res.ok) return null;
    const json = await res.json();
    const q = json?.quoteResponse?.result?.[0];
    if (!q) return null;
    const trailing = saneTrailingPE(q.trailingPE);
    if (trailing) return trailing;
    const forward = saneTrailingPE(q.forwardPE);
    return forward;
  } catch { return null; }
}

async function fetchAlphaVantagePE(ticker: string): Promise<number | null> {
  const AV_KEY = (process.env.AV_API_KEY ?? "").trim();
  if (!AV_KEY) return null;
  try {
    const url = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${encodeURIComponent(ticker)}&apikey=${AV_KEY}`;
    const res = await fetch(url, { next: { revalidate: PE_CACHE_SECONDS } } as RequestInit);
    if (!res.ok) return null;
    const json = await res.json();
    if (json?.Note || json?.Information) return null;     // rate-limited
    const trailing = parseFloat(json?.TrailingPE ?? "");
    return saneTrailingPE(trailing);
  } catch { return null; }
}

/**
 * Resolve a trailing P/E for the given ticker, walking a fallback chain:
 *   1. FMP /api/v3/quote (US + EU, 250/day free tier) — primary live source
 *   2. Yahoo v10 quoteSummary (US) or v7 quote (EU) — usually 401 from Vercel
 *   3. Alpha Vantage OVERVIEW (US, 25/day free tier) — last live attempt
 *   4. Hardcoded estimate (EU approx map / sector default) — peEstimated = true
 *
 * Logs a single console.warn per ticker when all live sources fail, so Vercel
 * runtime logs surface upstream provider outages without dumping payloads.
 * Always returns sector + fairPE. ETFs return { pe: null, source: "unavailable" }.
 */
export async function getPERatio(ticker: string): Promise<PERatioResult> {
  const key      = baseTicker(ticker);
  const sector   = resolveSector(ticker);
  const fairPE   = resolveFairPE(ticker, sector);

  // ETFs / passive vehicles don't have a meaningful P/E.
  if (ETF_TICKERS.has(key)) {
    return { pe: null, fairPE, sector, source: "unavailable", peEstimated: false };
  }

  const isInternational = EU_SUFFIX.test(ticker);

  // 1. FMP — works for both US and EU, 10× the AV free-tier rate limit.
  const fmpPE = await fetchFMPQuotePE(ticker);
  if (fmpPE) return { pe: fmpPE, fairPE, sector, source: "live-fmp", peEstimated: false };

  // 2. Yahoo Finance — usually 401 from Vercel IPs since late 2025 but cheap to try.
  if (isInternational) {
    const v7 = await fetchYFV7QuotePE(ticker);
    if (v7) return { pe: v7, fairPE, sector, source: "live-yf-quote", peEstimated: false };
  } else {
    const yfPE = await fetchYFQuoteSummaryPE(ticker);
    if (yfPE) return { pe: yfPE, fairPE, sector, source: "live-yf-summary", peEstimated: false };
    // 3. Alpha Vantage — US-only, free tier is 25 calls/day.
    const avPE = await fetchAlphaVantagePE(ticker);
    if (avPE) return { pe: avPE, fairPE, sector, source: "live-av", peEstimated: false };
  }

  // 4. Final fallback — hardcoded estimate (EU approx map first, then sector default).
  // Single warn line so Vercel logs reveal which tickers couldn't get a live P/E.
  console.warn(`[vela] getPERatio: no live P/E for ${ticker} — using estimate`);
  const euApprox = EU_APPROX_PE[key];
  const estimate = euApprox && euApprox > 0 ? euApprox : fairPE;
  if (estimate > 0) {
    return { pe: estimate, fairPE, sector, source: "estimated", peEstimated: true };
  }

  // 4. No estimate available (e.g. ETF without entry in ETF_TICKERS, sector unknown).
  return { pe: null, fairPE, sector, source: "unavailable", peEstimated: false };
}
