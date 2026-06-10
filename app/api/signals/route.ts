import { NextRequest, NextResponse } from "next/server";

// ── Sector fair P/E map ────────────────────────────────────────────────────────
const FAIR_PE: Record<string, number> = {
  "Technology":             28,
  "Healthcare":             22,
  "Consumer Cyclical":      20,
  "Consumer Defensive":     18,
  "Financial Services":     14,
  "Energy":                 12,
  "Utilities":              16,
  "Basic Materials":        15,
  "Industrials":            18,
  "Real Estate":            20,
  "Communication Services": 22,
};
const DEFAULT_FAIR_PE = 18;

// Hardcoded ticker → fair P/E for the most common holdings
const TICKER_FAIR_PE: Record<string, number> = {
  AAPL:28, MSFT:28, NVDA:35, GOOGL:25, GOOG:25, META:22, AMZN:35, TSLA:45,
  NFLX:25, AMD:30, INTC:15, ORCL:22, CRM:30, ADBE:28, QCOM:18, TXN:20,
  AVGO:22, ASML:30, SAP:22, INTU:35,
  JNJ:18, PFE:12, UNH:22, ABBV:16, MRK:18, LLY:35, BMY:12, AMGN:18, GILD:12,
  JPM:14, BAC:12, WFC:12, GS:14, MS:14, V:28, MA:28, AXP:20, BLK:20,
  WMT:26, COST:38, HD:22, NKE:28, MCD:24, SBUX:22, KO:24, PEP:24, PG:24,
  XOM:12, CVX:12, COP:12, SLB:16, BP:10, SHEL:10, TTE:10,
  BA:30, GE:20, CAT:18, MMM:15, HON:22, RTX:20, LMT:17,
  DIS:25, CMCSA:14, T:10, VZ:10,
  SPY:0, QQQ:0, IWM:0, VTI:0, VWCE:0, IWDA:0, CSPX:0, EEM:0, GLD:0, TLT:0,
  // European stocks (base ticker without exchange suffix)
  IP:18, RACE:50, ENEL:14, ENI:10, ISP:10, UCG:10, MONC:35, CPR:30,
  MB:12, STLA:6, AMP:30, FCA:6, BMED:14,
  MC:25, AIR:28, OR:30, SAN:16, BNP:8, ACA:8, DG:18, RNO:8,
  BAYN:12, DTE:14, ALV:12, BMW:6, MBG:6, SIE:22,
  NESN:22, ROG:18, NOVN:18, ABB:22,
  HSBA:12, GSK:14, AZN:28, RIO:10, ULVR:18,
  HEIA:22, INGA:8, AD:16,
};


// Ticker → sector label (for drawer display)
const TICKER_SECTOR: Record<string, string> = {
  AAPL:"Technology", MSFT:"Technology", NVDA:"Technology", GOOGL:"Technology",
  GOOG:"Technology", META:"Technology", AMZN:"Consumer Cyclical", TSLA:"Consumer Cyclical",
  NFLX:"Communication Services", AMD:"Technology", INTC:"Technology", ORCL:"Technology",
  CRM:"Technology", ADBE:"Technology", QCOM:"Technology", TXN:"Technology",
  AVGO:"Technology", ASML:"Technology", SAP:"Technology", INTU:"Technology",
  JNJ:"Healthcare", PFE:"Healthcare", UNH:"Healthcare", ABBV:"Healthcare",
  MRK:"Healthcare", LLY:"Healthcare", BMY:"Healthcare", AMGN:"Healthcare", GILD:"Healthcare",
  JPM:"Financial Services", BAC:"Financial Services", WFC:"Financial Services",
  GS:"Financial Services", MS:"Financial Services", V:"Financial Services",
  MA:"Financial Services", AXP:"Financial Services", BLK:"Financial Services",
  WMT:"Consumer Defensive", COST:"Consumer Defensive", HD:"Consumer Cyclical",
  NKE:"Consumer Cyclical", MCD:"Consumer Defensive", SBUX:"Consumer Cyclical",
  KO:"Consumer Defensive", PEP:"Consumer Defensive", PG:"Consumer Defensive",
  XOM:"Energy", CVX:"Energy", COP:"Energy", SLB:"Energy", BP:"Energy",
  SHEL:"Energy", TTE:"Energy",
  BA:"Industrials", GE:"Industrials", CAT:"Industrials", MMM:"Industrials",
  HON:"Industrials", RTX:"Industrials", LMT:"Industrials",
  DIS:"Communication Services", CMCSA:"Communication Services", T:"Communication Services",
  VZ:"Communication Services",
  // European stocks
  IP:"Industrials", RACE:"Consumer Cyclical", ENEL:"Utilities", ENI:"Energy",
  ISP:"Financial Services", UCG:"Financial Services", MONC:"Consumer Cyclical",
  CPR:"Consumer Defensive", MB:"Financial Services", STLA:"Consumer Cyclical",
  AMP:"Healthcare", BMED:"Financial Services",
  MC:"Consumer Cyclical", AIR:"Industrials", OR:"Consumer Defensive",
  SAN:"Healthcare", BNP:"Financial Services", ACA:"Financial Services",
  DG:"Industrials", RNO:"Consumer Cyclical",
  BAYN:"Healthcare", DTE:"Communication Services", ALV:"Financial Services",
  BMW:"Consumer Cyclical", MBG:"Consumer Cyclical", SIE:"Industrials",
  NESN:"Consumer Defensive", ROG:"Healthcare", NOVN:"Healthcare", ABB:"Industrials",
  HSBA:"Financial Services", GSK:"Healthcare", AZN:"Healthcare",
  RIO:"Basic Materials", ULVR:"Consumer Defensive",
  HEIA:"Consumer Defensive", INGA:"Financial Services", AD:"Consumer Defensive",
};

// ── Score helpers — 3 factors, beginner-friendly labels, 100 pts total ────────
// Trend (40 pts): Is it trending up? — 200-day moving average position
// Value (35 pts): Is it fairly priced? — P/E vs sector fair P/E
// Momentum (25 pts): Has it been moving the right way? — 3-month return

// ── Scoring via 52-week range (v8/chart range=2d — same approach as /api/prices) ─
// v7/quote and large-range v8/chart are rate-limited from Vercel IPs.
// range=2d meta includes fiftyTwoWeekHigh/Low — sufficient for trend + momentum proxy.

function calcScore(price: number, high52: number | null, low52: number | null): {
  total: number; signal: "BUY" | "HOLD" | "SELL";
  trend: number; value: number; momentum: number;
  pctDiff: number; mom3m: number;
} | null {
  if (!price || price <= 0 || !high52 || !low52 || high52 <= low52) return null;
  const range    = high52 - low52;
  const pos      = (price - low52) / range;
  const midpoint = (high52 + low52) / 2;
  const pctDiff  = parseFloat(((price - midpoint) / midpoint * 100).toFixed(2));
  const trendScore = pos > 0.75 ? 40 : pos > 0.60 ? 32 : pos > 0.45 ? 24 : pos > 0.30 ? 10 : 0;
  const valueScore = 17; // neutral — PE unavailable without v7/quote
  const recovery   = (price - low52) / low52 * 100;
  const momScore   = recovery > 40 ? 25 : recovery > 20 ? 20 : recovery > 8 ? 15 : recovery > 2 ? 8 : 3;
  const mom3m      = parseFloat((recovery / 4).toFixed(2));
  const total      = trendScore + valueScore + momScore;
  const signal: "BUY" | "HOLD" | "SELL" = total >= 65 ? "BUY" : total >= 35 ? "HOLD" : "SELL";
  return { total, signal, trend: trendScore, value: valueScore, momentum: momScore, pctDiff, mom3m };
}

// ── Per-ticker data fetch (v8/chart range=2d, proven reliable from Vercel IPs) ──
async function fetchTickerData(ticker: string) {
  for (const host of ["query2", "query1"]) {
    try {
      const url = `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=2d`;
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "application/json",
        },
        next: { revalidate: 60 },
      } as RequestInit);
      if (!res.ok) continue;
      const json = await res.json();
      const meta = json?.chart?.result?.[0]?.meta;
      if (!meta) continue;
      return {
        price:    (meta.regularMarketPrice as number) ?? 0,
        high52:   (meta.fiftyTwoWeekHigh   as number | undefined) ?? null,
        low52:    (meta.fiftyTwoWeekLow    as number | undefined) ?? null,
        currency: (meta.currency           as string) ?? "USD",
      };
    } catch { continue; }
  }
  return null;
}

// ── Sector / fair-PE lookup (kept for meta display, PE always null now) ───────
function getPEMeta(ticker: string): { pe: null; fairPE: number; sector: string; peEstimated: false } {
  const key    = ticker.toUpperCase().replace(/\.[A-Z]+$/, "");
  const sector = TICKER_SECTOR[key] ?? "";
  return {
    pe:          null,
    fairPE:      FAIR_PE[sector] ?? TICKER_FAIR_PE[key] ?? DEFAULT_FAIR_PE,
    sector,
    peEstimated: false as const,
  };
}

// ── Analyst consensus ─────────────────────────────────────────────────────────
async function fetchAnalyst(ticker: string) {
  try {
    const url = `https://query2.finance.yahoo.com/v11/finance/quoteSummary/${ticker}?modules=recommendationTrend`;
    const res  = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 3600 },
    });
    const json = await res.json();
    const t    = json?.quoteSummary?.result?.[0]?.recommendationTrend?.trend?.[0];
    if (!t) return null;

    const { strongBuy = 0, buy = 0, hold = 0, sell = 0, strongSell = 0 } = t;
    const total = strongBuy + buy + hold + sell + strongSell;
    if (total === 0) return null;

    const bullPct = (strongBuy + buy) / total;
    const bearPct = (sell + strongSell) / total;
    const label =
      strongBuy / total > 0.3 && bullPct > 0.6 ? "STRONG BUY" :
      bullPct > 0.5                             ? "BUY"        :
      bearPct  > 0.4                            ? "SELL"       : "HOLD";

    return { label, strongBuy, buy, hold, sell, strongSell, total };
  } catch { return null; }
}

// ── Groq batch reasoning ──────────────────────────────────────────────────────
async function batchReason(
  inputs: Array<{
    ticker: string; score: number; signal: string;
    analystLabel: string; mom3m: number; pctDiff: number;
    pe: number | null; fairPE: number;
  }>,
  lang: string,
  apiKey: string,
): Promise<Record<string, string>> {
  if (inputs.length === 0) return {};

  const lines = inputs.map(h =>
    `${h.ticker}: score ${h.score}/100 (${h.signal}), analyst=${h.analystLabel}, ` +
    `vs200MA=${h.pctDiff >= 0 ? "+" : ""}${h.pctDiff.toFixed(1)}%, ` +
    `3m-momentum=${h.mom3m >= 0 ? "+" : ""}${h.mom3m.toFixed(1)}%, ` +
    `PE=${h.pe !== null ? h.pe.toFixed(1) : "N/A"} (fair=${h.fairPE})`
  ).join("\n");

  const system =
    `You are a senior investment analyst with Warren Buffett's long-term philosophy.\n` +
    `For each holding write exactly ONE sentence of reasoning (max 24 words). ` +
    `Be direct, reference specific data (PE vs fair value, MA, momentum). No filler words.\n` +
    (lang === "it" ? "Respond in Italian.\n" : "") +
    `Respond ONLY with valid JSON: { "TICKER": "sentence", ... }`;

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method:  "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model:           "llama-3.1-8b-instant",
        messages:        [{ role: "system", content: system }, { role: "user", content: lines }],
        max_tokens:      700,
        temperature:     0.3,
        response_format: { type: "json_object" },
      }),
    });
    const data    = await res.json();
    const content = data.choices?.[0]?.message?.content ?? "{}";
    return JSON.parse(content);
  } catch { return {}; }
}

// ── Main ──────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tickersParam = searchParams.get("tickers") ?? "";
  const costsParam   = searchParams.get("costs")   ?? "";
  const lang         = searchParams.get("lang")    ?? "en";

  const GROQ_KEY = process.env.GROQ_API_KEY?.replace(/^﻿/, "").trim();
  if (!GROQ_KEY) return NextResponse.json({ error: "No key" }, { status: 500 });

  const tickers = tickersParam.split(",").filter(Boolean);
  const costs   = costsParam.split(",").map(Number);
  if (tickers.length === 0) return NextResponse.json([]);

  // 1 — Fetch price + 52-week range in parallel (v8/chart range=2d — same as /api/prices)
  const [tickerData, analysts] = await Promise.all([
    Promise.all(tickers.map(t => fetchTickerData(t))),
    Promise.all(tickers.map(t => fetchAnalyst(t))),
  ]);

  // 2 — Score using 52-week range proxy
  const computed = tickers.map((ticker, i) => {
    const td     = tickerData[i];
    const peMeta = getPEMeta(ticker);
    const result = td ? calcScore(td.price, td.high52, td.low52) : null;
    return { ticker, result, ...peMeta };
  });

  // 3 — Groq reasoning
  const groqInputs = computed
    .map((c, i) => c.result ? {
      ticker:       c.ticker,
      score:        c.result.total,
      signal:       c.result.signal,
      analystLabel: analysts[i]?.label ?? "N/A",
      mom3m:        c.result.mom3m,
      pctDiff:      c.result.pctDiff,
      pe:           c.pe,
      fairPE:       c.fairPE,
    } : null)
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const reasonings = await batchReason(groqInputs, lang, GROQ_KEY);

  // 4 — Response
  return NextResponse.json(
    tickers.map((ticker, i) => {
      const c = computed[i];
      return {
        ticker,
        score:   c.result?.total  ?? null,
        signal:  c.result?.signal ?? "HOLD",
        factors: c.result ? {
          trend:    c.result.trend,
          value:    c.result.value,
          momentum: c.result.momentum,
        } : null,
        meta: c.result ? {
          ma200Diff:   c.result.pctDiff,
          mom3m:       c.result.mom3m,
          pe:          c.pe,
          fairPE:      c.fairPE,
          sector:      c.sector,
          peEstimated: c.peEstimated,
        } : null,
        analyst:   analysts[i] ?? null,
        reasoning: reasonings[ticker] ?? null,
        backtest:  null,
      };
    })
  );
}
