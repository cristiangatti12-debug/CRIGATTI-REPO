import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { getPERatio } from "@/lib/marketData";
import { calcScore, fetchWeeklyQuote, SCORE_WEIGHTS } from "@/lib/scoring";
import type { MarketStockSignal, Region } from "@/types";

export const maxDuration = 30;

// ── Curated watchlist ─────────────────────────────────────────────────────────
interface WatchItem { ticker: string; name: string; region: Region }

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
  { ticker: "ASML.AS",  name: "ASML",            region: "EU" },
  { ticker: "NESN.SW",  name: "Nestlé",           region: "EU" },
  { ticker: "SAP.DE",   name: "SAP",              region: "EU" },
  { ticker: "MC.PA",    name: "LVMH",             region: "EU" },
  { ticker: "AZN.L",    name: "AstraZeneca",      region: "EU" },
  { ticker: "SIE.DE",   name: "Siemens",          region: "EU" },
  { ticker: "OR.PA",    name: "L'Oréal",          region: "EU" },
  { ticker: "AIR.PA",   name: "Airbus",           region: "EU" },
  { ticker: "ALV.DE",   name: "Allianz",          region: "EU" },
  { ticker: "SHELL.AS", name: "Shell",            region: "EU" },
  { ticker: "ISP.MI",   name: "Intesa Sanpaolo",  region: "EU" },
  { ticker: "UCG.MI",   name: "UniCredit",        region: "EU" },
  { ticker: "ENEL.MI",  name: "Enel",             region: "EU" },
  { ticker: "ENI.MI",   name: "Eni",              region: "EU" },
  { ticker: "MUV2.DE",  name: "Munich Re",        region: "EU" },
  { ticker: "SAN.PA",   name: "Sanofi",           region: "EU" },
  { ticker: "GSK.L",    name: "GSK",              region: "EU" },
  { ticker: "ADYEN.AS", name: "Adyen",            region: "EU" },
  { ticker: "ABBN.SW",  name: "ABB",              region: "EU" },
  { ticker: "TTE.PA",   name: "TotalEnergies",    region: "EU" },
];

// ── Groq reasoning (only for top shown stocks) ────────────────────────────────
async function batchReason(
  inputs: Array<{ ticker: string; name: string; score: number; signal: string; pctDiff: number; mom3m: number; mom1m: number; pe: number | null; fairPE: number }>,
  lang: string,
  apiKey: string,
): Promise<Record<string, string>> {
  if (inputs.length === 0) return {};

  const lines = inputs.map(h =>
    `${h.ticker} (${h.name}): score ${h.score}/100 (${h.signal}), ` +
    `3m=${h.mom3m >= 0 ? "+" : ""}${h.mom3m.toFixed(1)}%, ` +
    `1m=${h.mom1m >= 0 ? "+" : ""}${h.mom1m.toFixed(1)}%, ` +
    `vsRange=${h.pctDiff >= 0 ? "+" : ""}${h.pctDiff.toFixed(1)}%, ` +
    `PE=${h.pe !== null ? h.pe.toFixed(1) : "N/A"} (fair=${h.fairPE})`
  ).join("\n");

  const system =
    `You are a senior equity analyst. For each stock write exactly ONE sentence of reasoning (max 22 words). ` +
    `Be direct. Reference specific data (PE vs fair value, momentum, trend). No filler.\n` +
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

// ── Signal history logging (fire-and-forget) ──────────────────────────────────
async function logSignalsToHistory(
  stocks: MarketStockSignal[],
  priceMap: Record<string, number>,
) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;

  const admin = createAdminClient(url, key);
  const today = new Date().toISOString().split("T")[0];

  // Skip tickers already logged today to avoid duplicates from cache misses
  const tickers = stocks.map(s => s.ticker);
  const { data: existing } = await admin
    .from("signal_history")
    .select("ticker")
    .in("ticker", tickers)
    .eq("signaled_at", today);

  const existingSet = new Set((existing ?? []).map((r: { ticker: string }) => r.ticker));

  const rows = stocks
    .filter(s => !existingSet.has(s.ticker))
    .map(s => ({
      ticker:          s.ticker,
      score:           s.score,
      signal:          s.signal,
      price_at_signal: priceMap[s.ticker] ?? 0,
      mom3m_pct:       s.meta?.mom3m ?? null,
      pe_ratio:        s.meta?.pe ?? null,
      factors:         s.factors,
      signaled_at:     today,
    }));

  if (rows.length > 0) {
    await admin.from("signal_history").insert(rows);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const lang     = new URL(req.url).searchParams.get("lang") ?? "en";
  const GROQ_KEY = process.env.GROQ_API_KEY?.replace(/^﻿/, "").trim();
  if (!GROQ_KEY) return NextResponse.json({ buys: [], sells: [] }, { status: 500 });

  const allTickers = WATCHLIST.map(w => w.ticker);

  // Fetch weekly price data (1M + 3M momentum) + P/E in parallel for all 40 tickers
  const [rawQuotes, peResults] = await Promise.all([
    Promise.all(allTickers.map(t => fetchWeeklyQuote(t))),
    Promise.all(allTickers.map(t => getPERatio(t))),
  ]);

  const quotesMap: Record<string, NonNullable<Awaited<ReturnType<typeof fetchWeeklyQuote>>>> = {};
  const peMap:     Record<string, Awaited<ReturnType<typeof getPERatio>>> = {};
  allTickers.forEach((t, i) => {
    if (rawQuotes[i]) quotesMap[t] = rawQuotes[i]!;
    peMap[t] = peResults[i];
  });

  // Score all stocks using formula v2
  const scored = WATCHLIST
    .map((w) => {
      const q  = quotesMap[w.ticker];
      const pm = peMap[w.ticker];
      if (!q || !pm) return null;
      const result = calcScore(
        q.price, q.high52, q.low52,
        q.mom1m, q.mom3m,
        pm.pe, pm.fairPE, pm.peEstimated, pm.unprofitable,
      );
      if (!result) return null;
      return { ...w, ...result, price: q.price, pe: pm.pe, fairPE: pm.fairPE, sector: pm.sector, peEstimated: pm.peEstimated, unprofitable: pm.unprofitable };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  // If upstream data failure (< 3 tickers scored), skip caching so next request retries
  if (scored.length < 3) {
    return NextResponse.json({ buys: [], sells: [] }, { headers: { "Cache-Control": "no-store" } });
  }

  // Exclude tickers the user already holds
  const heldParam = new URL(req.url).searchParams.get("held") ?? "";
  const heldSet   = new Set(heldParam.split(",").map(t => t.trim().toUpperCase()).filter(Boolean));

  // Rank-based selection — guarantees 4 results regardless of BUY/SELL label distribution
  const eligible = scored.filter(x => !heldSet.has(x.ticker.toUpperCase()));
  const buysRaw  = [...eligible].sort((a, b) => b.total - a.total).slice(0, 2);
  const sellsRaw = [...eligible]
    .sort((a, b) => a.total - b.total)
    .filter(x => !buysRaw.find(b => b.ticker === x.ticker))
    .slice(0, 2);

  // Groq reasoning for all shown stocks
  const top4 = [...buysRaw, ...sellsRaw];
  const reasonings = await batchReason(
    top4.map(x => ({
      ticker: x.ticker, name: x.name, score: x.total, signal: x.signal,
      pctDiff: x.pctDiff, mom3m: x.mom3m, mom1m: x.mom1m,
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
      signal:    x.signal,
      meta:      {
        ma200Diff:    x.pctDiff,
        mom3m:        x.mom3m,
        pe:           x.pe,
        fairPE:       x.fairPE,
        sector:       x.sector,
        peEstimated:  x.peEstimated,
        unprofitable: x.unprofitable,
      },
      factors:   x.factors,
      reasoning: reasonings[x.ticker] ?? null,
    };
  }

  const payload = {
    buys:         buysRaw.map(toSignal),
    sells:        sellsRaw.map(toSignal),
    scoreVersion: SCORE_WEIGHTS.version,
  };

  // Log to signal_history (fire-and-forget — doesn't block response)
  const priceMap: Record<string, number> = {};
  top4.forEach(x => { priceMap[x.ticker] = x.price; });
  logSignalsToHistory([...payload.buys, ...payload.sells], priceMap).catch(() => {});

  return NextResponse.json(payload);
}
