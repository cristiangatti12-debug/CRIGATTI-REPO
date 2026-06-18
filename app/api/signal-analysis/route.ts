import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchWeeklyQuote } from "@/lib/scoring";
import { getPERatio, getCompanySnapshot, fetchTickerHeadlines } from "@/lib/marketData";

export const maxDuration = 30;

const FREE_DAILY_LIMIT = 1;
const YF_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "application/json",
};

function midnightUTC(): string {
  const d = new Date();
  d.setUTCHours(24, 0, 0, 0);
  return d.toISOString();
}

// ── 5-year synthetic backtest + recent price returns ─────────────────────────
// Fetches 6 years of monthly closes, then for each month in years 1–5:
//   - reconstructs the technical score using historical 52W range + momentum
//   - P/E is held at neutral (15 pts) since historical P/E is unavailable
//   - measures actual 1Y forward return for each signal instance
// Also returns recent 1M/3M/6M/1Y price returns from the same dataset.
interface BacktestResult {
  ret1m: number | null; ret3m: number | null;
  ret6m: number | null; ret1y: number | null;
  backtest: {
    buy:  { count: number; avgReturn: number; winRate: number } | null;
    hold: { count: number; avgReturn: number; winRate: number } | null;
    sell: { count: number; avgReturn: number; winRate: number } | null;
    totalInstances: number;
    yearsOfData: number;
  } | null;
}

async function fetchHistoricalBacktest(ticker: string): Promise<BacktestResult> {
  const empty: BacktestResult = { ret1m: null, ret3m: null, ret6m: null, ret1y: null, backtest: null };
  try {
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1mo&range=6y`;
    const res = await fetch(url, { headers: YF_HEADERS, next: { revalidate: 3600 } } as RequestInit);
    if (!res.ok) return empty;
    const json   = await res.json();
    const result = json?.chart?.result?.[0];
    const meta   = result?.meta;
    if (!meta) return empty;

    const raw    = (result?.indicators?.quote?.[0]?.close ?? []) as (number | null)[];
    const closes = raw.filter((c): c is number => c !== null && c > 0);
    const cur    = (meta.regularMarketPrice as number) ?? closes[closes.length - 1] ?? 0;
    if (!cur || closes.length < 25) return empty; // need at least 2 years to backtest

    const pct = (a: number, b: number) => (b - a) / a * 100;

    // ── Recent actual returns ─────────────────────────────────────────────
    const p = (n: number) => closes.length >= n ? parseFloat(pct(closes[closes.length - n], cur).toFixed(1)) : null;
    const ret1m = p(2), ret3m = p(4), ret6m = p(7), ret1y = p(13);

    // ── Inline technical score (mirrors lib/scoring.ts, P/E neutral = 15) ─
    function techScore(price: number, h52: number, l52: number, m1: number, m3: number): number {
      if (h52 <= l52) return 35; // degenerate range → neutral
      const pos  = (price - l52) / (h52 - l52);
      const tr   = pos > 0.75 ? 20 : pos > 0.60 ? 16 : pos > 0.45 ? 12 : pos > 0.30 ? 5 : 0;
      const m3s  = m3 > 20 ? 30 : m3 > 10 ? 24 : m3 > 3 ? 18 : m3 > -3 ? 10 : m3 > -10 ? 5 : 0;
      const m1s  = m1 > 8 ? 20 : m1 > 3 ? 16 : m1 > 0 ? 12 : m1 > -3 ? 6 : 0;
      return tr + m3s + m1s + 15; // 15 = neutral P/E
    }

    // ── Simulate signals over history ─────────────────────────────────────
    // Need 12 months lookback for 52W range + 3 months for momentum,
    // and 12 months ahead for 1Y return. Start at index 12, stop at N-13.
    const buyRets: number[] = [], holdRets: number[] = [], sellRets: number[] = [];

    for (let i = 12; i <= closes.length - 13; i++) {
      const price  = closes[i];
      const h52    = Math.max(...closes.slice(i - 11, i + 1));
      const l52    = Math.min(...closes.slice(i - 11, i + 1));
      const m1     = pct(closes[i - 1], price);
      const m3     = closes[i - 3] ? pct(closes[i - 3], price) : 0;
      const total  = techScore(price, h52, l52, m1, m3);
      const fwd1y  = parseFloat(pct(price, closes[i + 12]).toFixed(1));

      if      (total >= 65) buyRets.push(fwd1y);
      else if (total >= 35) holdRets.push(fwd1y);
      else                  sellRets.push(fwd1y);
    }

    function agg(rets: number[]) {
      if (rets.length === 0) return null;
      const avg     = rets.reduce((a, b) => a + b, 0) / rets.length;
      const winRate = Math.round(rets.filter(r => r > 5).length / rets.length * 100);
      return { count: rets.length, avgReturn: parseFloat(avg.toFixed(1)), winRate };
    }

    const yearsOfData = parseFloat(((closes.length) / 12).toFixed(1));

    return {
      ret1m, ret3m, ret6m, ret1y,
      backtest: {
        buy:            agg(buyRets),
        hold:           agg(holdRets),
        sell:           agg(sellRets),
        totalInstances: buyRets.length + holdRets.length + sellRets.length,
        yearsOfData,
      },
    };
  } catch { return empty; }
}

// ── Main ──────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ticker = (searchParams.get("ticker") ?? "").toUpperCase().trim();
  const score  = parseInt(searchParams.get("score") ?? "0", 10);
  const signal = searchParams.get("signal") ?? "HOLD";
  const lang   = searchParams.get("lang") ?? "en";

  if (!ticker) return NextResponse.json({ error: "ticker required" }, { status: 400 });

  // ── Auth ──────────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  // ── Rate limit ────────────────────────────────────────────────────────────
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const { count } = await supabase
    .from("signal_analysis_log")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("asked_at", todayStart.toISOString());

  if ((count ?? 0) >= FREE_DAILY_LIMIT) {
    return NextResponse.json({ limited: true, resetsAt: midnightUTC() }, { status: 429 });
  }

  // ── Fetch all data in parallel ────────────────────────────────────────────
  const [quote, peMeta, snapshot, newsHeadlines, historicalBacktest, historyRes] = await Promise.all([
    fetchWeeklyQuote(ticker),
    getPERatio(ticker),
    getCompanySnapshot(ticker),
    fetchTickerHeadlines(ticker, 4),
    fetchHistoricalBacktest(ticker),
    supabase
      .from("signal_history")
      .select("score, signal, return_1y, signaled_at")
      .eq("ticker", ticker)
      .not("return_1y", "is", null)
      .order("signaled_at", { ascending: false })
      .limit(10),
  ]);

  // ── Aggregate Vela signal history ─────────────────────────────────────────
  type HistRow = { score: number; signal: string; return_1y: number | null };
  const rows = (historyRes.data ?? []) as HistRow[];

  function stats(filtered: HistRow[]) {
    const rets = filtered.map(r => r.return_1y!).filter(r => r !== null);
    if (rets.length === 0) return null;
    const avg  = rets.reduce((a, b) => a + b, 0) / rets.length;
    const wins = rets.filter(r => r > 5).length;
    return { count: rets.length, avg: avg.toFixed(1), winRate: Math.round(wins / rets.length * 100) };
  }

  const buyHistory  = stats(rows.filter(r => r.signal === "BUY"));
  const holdHistory = stats(rows.filter(r => r.signal === "HOLD"));
  const sellHistory = stats(rows.filter(r => r.signal === "SELL"));

  // ── Build enriched prompt ─────────────────────────────────────────────────
  const GROQ_KEY = process.env.GROQ_API_KEY?.replace(/^﻿/, "").trim();
  if (!GROQ_KEY) return NextResponse.json({ error: "AI unavailable" }, { status: 503 });

  const fmt = (n: number | null, suffix = "", decimals = 1) =>
    n !== null ? `${n > 0 ? "+" : ""}${n.toFixed(decimals)}${suffix}` : "N/A";

  // ── Section 1: Signal context ─────────────────────────────────────────────
  const signalBlock =
    `Ticker: ${ticker} | Signal: ${signal} (score ${score}/100)\n` +
    `3M momentum: ${fmt(quote?.mom3m ?? null, "%")} | 1M momentum: ${fmt(quote?.mom1m ?? null, "%")}\n` +
    `P/E: ${peMeta.pe !== null ? `${peMeta.pe.toFixed(1)}x` : "N/A"} (sector fair: ${peMeta.fairPE}x) | Sector: ${peMeta.sector || "Unknown"}`;

  // ── Section 2: Company snapshot + live financials (FMP / AV) ─────────────
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  const businessLines: string[] = [];
  if (snapshot.name)        businessLines.push(`Company: ${snapshot.name}`);
  if (snapshot.sector)      businessLines.push(`Sector: ${snapshot.sector}${snapshot.industry ? ` · ${snapshot.industry}` : ""}`);
  if (snapshot.description) businessLines.push(`Business: ${snapshot.description}`);

  const financialLines = [
    snapshot.revenueGrowthYoY !== null && `Revenue growth (latest reported): ${pct(snapshot.revenueGrowthYoY)}`,
    snapshot.grossMargin      !== null && `Gross margin: ${pct(snapshot.grossMargin)}`,
    snapshot.operatingMargin  !== null && `Operating margin: ${pct(snapshot.operatingMargin)}`,
    snapshot.netMargin        !== null && `Net margin: ${pct(snapshot.netMargin)}`,
    snapshot.returnOnEquity   !== null && `Return on equity: ${pct(snapshot.returnOnEquity)}`,
  ].filter(Boolean) as string[];

  const blocks: string[] = [];
  if (businessLines.length)  blocks.push(`Company snapshot:\n${businessLines.join("\n")}`);
  if (financialLines.length) blocks.push(`Financials (TTM, source: ${snapshot.source ?? "n/a"}):\n${financialLines.join("\n")}`);
  const financialsBlock = blocks.length > 0
    ? blocks.join("\n\n")
    : "Company snapshot: not available (FMP/AV quota exhausted or ticker unknown to providers)";

  // ── Section 3: Historical price returns + 5Y backtest ───────────────────
  const { ret1m, ret3m, ret6m, ret1y, backtest } = historicalBacktest;
  const priceHistoryBlock =
    `Actual price returns (Yahoo Finance):\n` +
    `1M: ${fmt(ret1m, "%")} | 3M: ${fmt(ret3m, "%")} | 6M: ${fmt(ret6m, "%")} | 1Y: ${fmt(ret1y, "%")}`;

  // ── Section 4: Recent news ────────────────────────────────────────────────
  const newsBlock = newsHeadlines.length > 0
    ? `Recent news:\n${newsHeadlines.join("\n")}`
    : "Recent news: none available";

  // ── Section 5: Signal track record (synthetic backtest + live history) ───
  const trackRecordParts: string[] = [];

  // Synthetic 5Y backtest from price data
  if (backtest && backtest.totalInstances >= 5) {
    const btLines: string[] = [`5-year synthetic backtest for ${ticker} (${backtest.yearsOfData}y of data, ${backtest.totalInstances} signal instances, P/E held neutral):`];
    if (backtest.buy)  btLines.push(`  BUY  signals (${backtest.buy.count}):  avg 1Y return ${backtest.buy.avgReturn  >= 0 ? "+" : ""}${backtest.buy.avgReturn}%,  win rate ${backtest.buy.winRate}%`);
    if (backtest.hold) btLines.push(`  HOLD signals (${backtest.hold.count}): avg 1Y return ${backtest.hold.avgReturn >= 0 ? "+" : ""}${backtest.hold.avgReturn}%, win rate ${backtest.hold.winRate}%`);
    if (backtest.sell) btLines.push(`  SELL signals (${backtest.sell.count}): avg 1Y return ${backtest.sell.avgReturn >= 0 ? "+" : ""}${backtest.sell.avgReturn}%, win rate ${backtest.sell.winRate}%`);
    trackRecordParts.push(btLines.join("\n"));
  } else {
    trackRecordParts.push("5-year backtest: insufficient price history available.");
  }

  // Live Vela signal outcomes (grows over time as 1Y windows close)
  if (rows.length > 0) {
    const liveLines: string[] = ["Live Vela signal outcomes (1-year confirmed returns):"];
    if (buyHistory)  liveLines.push(`  BUY  (${buyHistory.count}): avg ${buyHistory.avg}%, win rate ${buyHistory.winRate}%`);
    if (holdHistory) liveLines.push(`  HOLD (${holdHistory.count}): avg ${holdHistory.avg}%, win rate ${holdHistory.winRate}%`);
    if (sellHistory) liveLines.push(`  SELL (${sellHistory.count}): avg ${sellHistory.avg}%, win rate ${sellHistory.winRate}%`);
    trackRecordParts.push(liveLines.join("\n"));
  } else {
    trackRecordParts.push("Live Vela outcomes: none yet (started collecting today — will improve over time).");
  }

  const velaHistoryBlock = trackRecordParts.join("\n\n");

  const systemPrompt =
    `You are a senior portfolio analyst combining quantitative signals with real-world fundamentals and news.\n` +
    (lang === "it" ? "Respond entirely in Italian.\n" : "") +
    `Write 200–250 words. Structure your response as:\n` +
    `1) What the business does — one sentence using the company snapshot.\n` +
    `2) Signal assessment — does the score reflect current momentum and valuation?\n` +
    `3) Fundamentals check — quote the actual TTM margins, revenue growth, and ROE from the financials block.\n` +
    `4) News context — is there anything in recent headlines that supports or contradicts the signal?\n` +
    `5) Track record — cite the 5-year backtest results: did BUY signals historically deliver? Compare to current signal.\n` +
    `Be direct. Quote specific numbers from the data given. Do not claim a number is unavailable if it appears in the user message. No disclaimers or padding.`;

  const userPrompt = [signalBlock, financialsBlock, priceHistoryBlock, newsBlock, velaHistoryBlock].join("\n\n");

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method:  "POST",
      headers: { "Authorization": `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model:       "llama-3.3-70b-versatile",
        messages:    [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
        max_tokens:  600,
        temperature: 0.35,
      }),
    });
    const data     = await res.json();
    const analysis = data.choices?.[0]?.message?.content?.trim() ?? "";
    if (!analysis) return NextResponse.json({ error: "AI returned empty response" }, { status: 503 });

    await supabase.from("signal_analysis_log").insert({ user_id: user.id, ticker });

    return NextResponse.json({
      analysis,
      historyUsed: rows.length,
      limited:     false,
      remaining:   Math.max(0, FREE_DAILY_LIMIT - (count ?? 0) - 1),
    });
  } catch {
    return NextResponse.json({ error: "AI request failed" }, { status: 503 });
  }
}
