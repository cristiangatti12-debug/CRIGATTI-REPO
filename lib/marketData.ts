// Centralized Yahoo Finance data layer.
// All routes must import from here — no direct Yahoo fetch calls in routes.

const YF_HEADERS = {
  "User-Agent":      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept":          "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer":         "https://finance.yahoo.com/",
};

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
