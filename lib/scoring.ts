// ── Shared scoring logic — single source of truth for /api/signals and /api/market-signals ──
//
// Formula v2 (100 pts total):
//   3M Momentum  30 pts  — actual 3-month price return (replaces correlated "recovery from low")
//   P/E Valuation 30 pts  — pe vs sector fair PE
//   52W Trend    20 pts  — position in 52-week range (long-term direction)
//   1M Momentum  20 pts  — actual 1-month price return (short-term confirmation)
//
// Bump SCORE_WEIGHTS.version when changing tiers/weights — this busts localStorage caches.

export const SCORE_WEIGHTS = {
  momentum3m: 30,
  valuation:  30,
  trend52w:   20,
  momentum1m: 20,
  version:    2,
} as const;

export interface ScoreResult {
  total:    number;
  signal:   "BUY" | "HOLD" | "SELL";
  pctDiff:  number;   // % above/below 52W midpoint (used in Groq reasoning)
  mom3m:    number;   // actual 3-month return %
  mom1m:    number;   // actual 1-month return %
  factors: {
    trend:    number;   // 0–20
    value:    number;   // 0–30
    momentum: number;   // 0–30  (3M)
    mom1m:    number;   // 0–20
  };
}

export function calcScore(
  price:        number,
  high52:       number | null,
  low52:        number | null,
  mom1m:        number | null,  // 1-month price return % (null if unavailable)
  mom3m:        number | null,  // 3-month price return % (null if unavailable)
  pe:           number | null,
  fairPE:       number,
  peEstimated:  boolean,
  unprofitable: boolean,
): ScoreResult | null {
  if (!price || price <= 0 || !high52 || !low52 || high52 <= low52) return null;

  const range = high52 - low52;
  const pos   = (price - low52) / range;  // 0 = at 52wk low, 1 = at 52wk high

  // ── 3M Momentum (30 pts) ──────────────────────────────────────────────────
  const m3 = mom3m ?? 0;
  const mom3mScore =
    m3 > 20  ? 30 :
    m3 > 10  ? 24 :
    m3 > 3   ? 18 :
    m3 > -3  ? 10 :
    m3 > -10 ? 5  : 0;

  // ── P/E Valuation (30 pts) ────────────────────────────────────────────────
  let valueScore: number;
  if (unprofitable) {
    valueScore = 4;
  } else if (pe === null || peEstimated || fairPE <= 0) {
    valueScore = 15;  // neutral when no live P/E
  } else {
    const ratio = pe / fairPE;
    valueScore =
      ratio < 0.7 ? 30 :
      ratio < 0.9 ? 24 :
      ratio < 1.1 ? 18 :
      ratio < 1.4 ? 12 :
      ratio < 1.8 ? 6  : 0;
  }

  // ── 52W Trend (20 pts) ────────────────────────────────────────────────────
  const trendScore =
    pos > 0.75 ? 20 :
    pos > 0.60 ? 16 :
    pos > 0.45 ? 12 :
    pos > 0.30 ? 5  : 0;

  // ── 1M Momentum (20 pts) ─────────────────────────────────────────────────
  const m1 = mom1m ?? 0;
  const mom1mScore =
    m1 > 8  ? 20 :
    m1 > 3  ? 16 :
    m1 > 0  ? 12 :
    m1 > -3 ? 6  : 0;

  const total  = mom3mScore + valueScore + trendScore + mom1mScore;
  const signal: "BUY" | "HOLD" | "SELL" = total >= 65 ? "BUY" : total >= 35 ? "HOLD" : "SELL";

  const midpoint = (high52 + low52) / 2;
  const pctDiff  = parseFloat(((price - midpoint) / midpoint * 100).toFixed(2));

  return {
    total, signal, pctDiff,
    mom3m: parseFloat(m3.toFixed(2)),
    mom1m: parseFloat(m1.toFixed(2)),
    factors: { trend: trendScore, value: valueScore, momentum: mom3mScore, mom1m: mom1mScore },
  };
}

const YF_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "application/json",
};

// Fetch weekly bars (6mo) for real 1M + 3M momentum, falling back to the
// proven range=2d endpoint when weekly data is unavailable. The fallback
// always returns price + 52wk H/L; momentum will be null (neutral in scoring).
export async function fetchWeeklyQuote(symbol: string): Promise<{
  ticker:   string;
  price:    number;
  high52:   number | null;
  low52:    number | null;
  currency: string;
  mom1m:    number | null;
  mom3m:    number | null;
} | null> {
  // ── Primary: weekly bars for real momentum (4s timeout to prevent hangs) ─
  for (const host of ["query2", "query1"]) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
      const url = `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1wk&range=6mo`;
      const res = await fetch(url, { headers: YF_HEADERS, signal: controller.signal, next: { revalidate: 3600 } } as RequestInit);
      clearTimeout(timer);
      if (!res.ok) continue;
      const json   = await res.json();
      const result = json?.chart?.result?.[0];
      const meta   = result?.meta;
      if (!meta) continue;

      const price = (meta.regularMarketPrice as number) ?? 0;
      if (!price || price <= 0) continue;

      const high52 = (meta.fiftyTwoWeekHigh as number | undefined) ?? null;
      const low52  = (meta.fiftyTwoWeekLow  as number | undefined) ?? null;

      const raw    = (result?.indicators?.quote?.[0]?.close ?? []) as (number | null)[];
      const closes = raw.filter((c): c is number => c !== null && c > 0);

      let mom1m: number | null = null;
      let mom3m: number | null = null;
      if (closes.length >= 5)  { const p = closes[closes.length - 5];  mom1m = parseFloat(((price - p) / p * 100).toFixed(2)); }
      if (closes.length >= 14) { const p = closes[closes.length - 14]; mom3m = parseFloat(((price - p) / p * 100).toFixed(2)); }

      return { ticker: (meta.symbol as string) ?? symbol, price, high52, low52, currency: (meta.currency as string) ?? "USD", mom1m, mom3m };
    } catch { clearTimeout(timer); continue; }
  }

  // ── Fallback: proven range=2d endpoint (no momentum, neutral score) ──────
  for (const host of ["query2", "query1"]) {
    try {
      const url = `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2d`;
      const res = await fetch(url, { headers: YF_HEADERS, next: { revalidate: 3600 } } as RequestInit);
      if (!res.ok) continue;
      const meta = (await res.json())?.chart?.result?.[0]?.meta;
      if (!meta) continue;
      const price = (meta.regularMarketPrice as number) ?? 0;
      if (!price || price <= 0) continue;
      return {
        ticker:   (meta.symbol   as string) ?? symbol,
        price,
        high52:   (meta.fiftyTwoWeekHigh as number | undefined) ?? null,
        low52:    (meta.fiftyTwoWeekLow  as number | undefined) ?? null,
        currency: (meta.currency as string) ?? "USD",
        mom1m:    null,
        mom3m:    null,
      };
    } catch { continue; }
  }
  return null;
}

// Fast quote fetch for /api/signals (user holdings, called immediately after
// adding a holding — must complete well within the 30s function limit).
// Uses only the proven range=2d endpoint; momentum fields are null (neutral score).
export async function fetchQuickQuote(symbol: string): Promise<{
  ticker: string; price: number;
  high52: number | null; low52: number | null;
  currency: string; mom1m: null; mom3m: null;
} | null> {
  for (const host of ["query2", "query1"]) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const url = `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2d`;
      const res = await fetch(url, { headers: YF_HEADERS, signal: controller.signal, next: { revalidate: 60 } } as RequestInit);
      clearTimeout(timer);
      if (!res.ok) continue;
      const meta = (await res.json())?.chart?.result?.[0]?.meta;
      if (!meta) continue;
      const price = (meta.regularMarketPrice as number) ?? 0;
      if (!price || price <= 0) continue;
      return {
        ticker:   (meta.symbol   as string) ?? symbol,
        price,
        high52:   (meta.fiftyTwoWeekHigh as number | undefined) ?? null,
        low52:    (meta.fiftyTwoWeekLow  as number | undefined) ?? null,
        currency: (meta.currency as string) ?? "USD",
        mom1m:    null,
        mom3m:    null,
      };
    } catch { clearTimeout(timer); continue; }
  }
  return null;
}
