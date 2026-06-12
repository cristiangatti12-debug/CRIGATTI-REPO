import { NextRequest, NextResponse } from "next/server";
import { getPERatio } from "@/lib/marketData";
import type { MarketStockSignal, Region } from "@/types";

// Exact same approach as /api/prices: individual per-symbol v8/chart calls, cached 1h by Next.js.
// v7/quote is 401-blocked from server IPs. v8/chart (range=2d) works reliably.
// Scoring uses 52-week range position (trend proxy) + 52-week recovery (momentum proxy).
async function fetchQuote(symbol: string) {
  for (const host of ["query2", "query1"]) {
    try {
      const url = `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2d`;
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept":     "application/json",
        },
        next: { revalidate: 3600 },
      } as RequestInit);
      if (!res.ok) continue;
      const json = await res.json();
      const meta = json?.chart?.result?.[0]?.meta;
      if (!meta) continue;
      return {
        ticker:    (meta.symbol          as string) ?? symbol,
        price:     (meta.regularMarketPrice  as number) ?? 0,
        high52:    (meta.fiftyTwoWeekHigh    as number | undefined) ?? null,
        low52:     (meta.fiftyTwoWeekLow     as number | undefined) ?? null,
        currency:  (meta.currency            as string) ?? "USD",
      };
    } catch { continue; }
  }
  return null;
}

// ── Curated watchlist ─────────────────────────────────────────────────────────
interface WatchItem { ticker: string; name: string; region: Region }

// 40 stocks exactly — fits in one single v7/quote batch call (no second request, avoids 429)
const WATCHLIST: WatchItem[] = [
  // ── S&P 500 — top 20 ─────────────────────────────────────────────────────────
  { ticker: "AAPL",  name: "Apple",               region: "US" },
  { ticker: "MSFT",  name: "Microsoft",            region: "US" },
  { ticker: "NVDA",  name: "NVIDIA",               region: "US" },
  { ticker: "AMZN",  name: "Amazon",               region: "US" },
  { ticker: "GOOGL", name: "Alphabet",             region: "US" },
  { ticker: "META",  name: "Meta Platforms",       region: "US" },
  { ticker: "TSLA",  name: "Tesla",                region: "US" },
  { ticker: "JPM",   name: "JPMorgan Chase",       region: "US" },
  { ticker: "V",     name: "Visa",                 region: "US" },
  { ticker: "XOM",   name: "ExxonMobil",           region: "US" },
  { ticker: "COST",  name: "Costco",               region: "US" },
  { ticker: "NFLX",  name: "Netflix",              region: "US" },
  { ticker: "AMD",   name: "AMD",                  region: "US" },
  { ticker: "GS",    name: "Goldman Sachs",        region: "US" },
  { ticker: "WMT",   name: "Walmart",              region: "US" },
  { ticker: "MCD",   name: "McDonald's",           region: "US" },
  { ticker: "KO",    name: "Coca-Cola",            region: "US" },
  { ticker: "JNJ",   name: "Johnson & Johnson",    region: "US" },
  { ticker: "ABBV",  name: "AbbVie",               region: "US" },
  { ticker: "BAC",   name: "Bank of America",      region: "US" },

  // ── STOXX 600 — top 20 ───────────────────────────────────────────────────────
  { ticker: "ASML.AS",   name: "ASML",            region: "EU" },
  { ticker: "NESN.SW",   name: "Nestlé",           region: "EU" },
  { ticker: "SAP.DE",    name: "SAP",              region: "EU" },
  { ticker: "MC.PA",     name: "LVMH",             region: "EU" },
  { ticker: "AZN.L",     name: "AstraZeneca",      region: "EU" },
  { ticker: "SIE.DE",    name: "Siemens",          region: "EU" },
  { ticker: "OR.PA",     name: "L'Oréal",          region: "EU" },
  { ticker: "AIR.PA",    name: "Airbus",           region: "EU" },
  { ticker: "ALV.DE",    name: "Allianz",          region: "EU" },
  { ticker: "SHELL.AS",  name: "Shell",            region: "EU" },
  { ticker: "ISP.MI",    name: "Intesa Sanpaolo",  region: "EU" },
  { ticker: "UCG.MI",    name: "UniCredit",        region: "EU" },
  { ticker: "ENEL.MI",   name: "Enel",             region: "EU" },
  { ticker: "ENI.MI",    name: "Eni",              region: "EU" },
  { ticker: "MUV2.DE",   name: "Munich Re",        region: "EU" },
  { ticker: "SAN.PA",    name: "Sanofi",           region: "EU" },
  { ticker: "GSK.L",     name: "GSK",              region: "EU" },
  { ticker: "ADYEN.AS",  name: "Adyen",            region: "EU" },
  { ticker: "ABBN.SW",   name: "ABB",              region: "EU" },
  { ticker: "TTE.PA",    name: "TotalEnergies",    region: "EU" },
];

// ── Scoring using 52-week range + live P/E ───────────────────────────────────
// Trend  (40 pts): position in 52-week range (top quartile = strong uptrend)
// Value  (35 pts): P/E vs sector fair P/E (neutral 17 when only an estimate is available)
// Momentum (25 pts): recovery from 52-week low (proxy for recent strength)

function calcValueScore(pe: number | null, fairPE: number, peEstimated: boolean, unprofitable: boolean): number {
  if (unprofitable) return 5;
  if (pe === null || peEstimated || fairPE <= 0) return 17;
  const ratio = pe / fairPE;
  if (ratio < 0.7) return 35;
  if (ratio < 0.9) return 28;
  if (ratio < 1.1) return 21;
  if (ratio < 1.4) return 14;
  if (ratio < 1.8) return 7;
  return 0;
}

function calcScore(
  price: number,
  high52: number | null,
  low52: number | null,
  pe: number | null,
  fairPE: number,
  peEstimated: boolean,
  unprofitable: boolean,
) {
  if (!price || price <= 0 || !high52 || !low52 || high52 <= low52) {
    return null;
  }

  const range = high52 - low52;
  const pos   = (price - low52) / range;           // 0 = at 52wk low, 1 = at 52wk high

  const trendScore = pos > 0.75 ? 40 : pos > 0.60 ? 32 : pos > 0.45 ? 24 : pos > 0.30 ? 10 : 0;
  const midpoint   = (high52 + low52) / 2;
  const pctDiff    = parseFloat(((price - midpoint) / midpoint * 100).toFixed(2));

  const valueScore = calcValueScore(pe, fairPE, peEstimated, unprofitable);

  const recovery  = (price - low52) / low52 * 100;
  const momScore  = recovery > 40 ? 25 : recovery > 20 ? 20 : recovery > 8 ? 15 : recovery > 2 ? 8 : 3;
  const mom3m     = parseFloat((recovery / 4).toFixed(2));

  const total    = trendScore + valueScore + momScore;
  const signal: "BUY" | "HOLD" | "SELL" = total >= 65 ? "BUY" : total >= 35 ? "HOLD" : "SELL";

  return {
    total, signal, pctDiff, mom3m,
    factors: { trend: trendScore, value: valueScore, momentum: momScore },
  };
}


// ── Groq reasoning (only for top 4 stocks) ───────────────────────────────────
async function batchReason(
  inputs: Array<{ ticker: string; name: string; score: number; signal: string; pctDiff: number; mom3m: number; pe: number | null; fairPE: number }>,
  lang: string,
  apiKey: string,
): Promise<Record<string, string>> {
  if (inputs.length === 0) return {};

  const lines = inputs.map(h =>
    `${h.ticker} (${h.name}): score ${h.score}/100 (${h.signal}), ` +
    `vs200MA=${h.pctDiff >= 0 ? "+" : ""}${h.pctDiff.toFixed(1)}%, ` +
    `3m-momentum=${h.mom3m >= 0 ? "+" : ""}${h.mom3m.toFixed(1)}%, ` +
    `PE=${h.pe !== null ? h.pe.toFixed(1) : "N/A"} (fair=${h.fairPE})`
  ).join("\n");

  const system =
    `You are a senior equity analyst. For each stock write exactly ONE sentence of reasoning (max 22 words). ` +
    `Be direct. Reference specific data (PE vs fair value, MA, momentum). No filler.\n` +
    (lang === "it" ? "Respond in Italian.\n" : "") +
    `Respond ONLY with valid JSON: { "TICKER": "sentence", ... }`;

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method:  "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model:           "llama-3.1-8b-instant",
        messages:        [{ role: "system", content: system }, { role: "user", content: lines }],
        max_tokens:      400,
        temperature:     0.25,
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
  const lang     = new URL(req.url).searchParams.get("lang") ?? "en";
  const GROQ_KEY = process.env.GROQ_API_KEY?.replace(/^﻿/, "").trim();
  if (!GROQ_KEY) return NextResponse.json({ buys: [], sells: [] }, { status: 500 });

  const allTickers = WATCHLIST.map(w => w.ticker);

  // Fetch price/52-week range AND P/E in parallel for all 40 tickers.
  //   - Price/range:  per-symbol v8/chart 2d (cached 1h, shared with /api/prices)
  //   - P/E:          getPERatio fallback chain (v7/quote for EU, v10 quoteSummary
  //                   for US, AV backup, hardcoded estimate last). Cached 1h.
  const [rawQuotes, peResults] = await Promise.all([
    Promise.all(allTickers.map(fetchQuote)),
    Promise.all(allTickers.map(getPERatio)),
  ]);
  const quotesMap: Record<string, NonNullable<Awaited<ReturnType<typeof fetchQuote>>>> = {};
  const peMap: Record<string, Awaited<ReturnType<typeof getPERatio>>> = {};
  allTickers.forEach((t, i) => {
    if (rawQuotes[i]) quotesMap[t] = rawQuotes[i]!;
    peMap[t] = peResults[i];
  });

  // Score all stocks
  const scored = WATCHLIST
    .map((w) => {
      const q  = quotesMap[w.ticker];
      const pm = peMap[w.ticker];
      if (!q || !pm) return null;
      const result = calcScore(q.price, q.high52, q.low52, pm.pe, pm.fairPE, pm.peEstimated, pm.unprofitable);
      if (!result) return null;
      return {
        ...w, ...result,
        pe:           pm.pe,
        fairPE:       pm.fairPE,
        sector:       pm.sector,
        peEstimated:  pm.peEstimated,
        unprofitable: pm.unprofitable,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  // Exclude tickers the user already holds (passed as ?held=AAPL,MSFT,...)
  const heldParam = new URL(req.url).searchParams.get("held") ?? "";
  const heldSet   = new Set(heldParam.split(",").map(t => t.trim().toUpperCase()).filter(Boolean));

  // Top 2 strongest BUY signals (by score)
  const buysRaw = scored
    .filter(x => x.signal === "BUY" && !heldSet.has(x.ticker.toUpperCase()))
    .sort((a, b) => b.total - a.total)
    .slice(0, 2);

  // Top 2 strongest SELL signals (by score, descending)
  const sellsRaw = scored
    .filter(x => x.signal === "SELL")
    .sort((a, b) => b.total - a.total)
    .slice(0, 2);

  // Groq reasoning for all shown stocks (up to 6)
  const top6 = [...buysRaw, ...sellsRaw];
  const reasonings = await batchReason(
    top6.map(x => ({
      ticker: x.ticker, name: x.name, score: x.total, signal: x.signal,
      pctDiff: x.pctDiff, mom3m: x.mom3m,
      pe: x.pe, fairPE: x.fairPE,
    })),
    lang,
    GROQ_KEY,
  );

  function toSignal(x: typeof buysRaw[number]): MarketStockSignal {
    return {
      ticker:    x.ticker,
      name:      x.name,
      region:    x.region,
      score:     x.total,
      signal:    x.signal as MarketStockSignal["signal"],
      meta:      { ma200Diff: x.pctDiff, mom3m: x.mom3m, pe: x.pe, fairPE: x.fairPE, sector: x.sector, peEstimated: x.peEstimated, unprofitable: x.unprofitable },
      factors:   x.factors,
      reasoning: reasonings[x.ticker] ?? null,
    };
  }

  const payload = {
    buys:  buysRaw.map(toSignal),
    sells: sellsRaw.map(toSignal),
  };

  // If Yahoo Finance returned no usable data, skip edge caching so the
  // next request retries rather than serving a stale empty response.
  if (payload.buys.length === 0 && payload.sells.length === 0) {
    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
  }

  return NextResponse.json(payload);
}
