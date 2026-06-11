import { NextRequest, NextResponse } from "next/server";
import { getPERatio } from "@/lib/marketData";

// Cap function runtime well under Vercel's per-request limit so a slow
// upstream (Groq or Yahoo) doesn't let the connection hang to the point where
// the browser shows "page can't be loaded" after the user adds their first
// holding (which triggers this fetch via the parent onSave).
export const maxDuration = 30;

// ── Score helpers — 3 factors, beginner-friendly labels, 100 pts total ────────
// Trend (40 pts): Is it trending up? — 200-day moving average position proxy
// Value (35 pts): Is it fairly priced? — P/E vs sector fair P/E
// Momentum (25 pts): Has it been moving the right way? — 3-month return proxy

// Value sub-score from live P/E vs sector fair P/E. When the P/E is estimated
// (no live data) or unavailable, return a neutral 17 so approximations don't
// penalize the score.
function calcValueScore(pe: number | null, fairPE: number, peEstimated: boolean): number {
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
): {
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
  const valueScore = calcValueScore(pe, fairPE, peEstimated);
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

  // 12 s ceiling — Groq is usually < 2 s but has occasional long tails that
  // would otherwise stall the whole signals response.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
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
      signal: controller.signal,
    });
    const data    = await res.json();
    const content = data.choices?.[0]?.message?.content ?? "{}";
    return JSON.parse(content);
  } catch { return {}; }
  finally { clearTimeout(timeout); }
}

// ── Main ──────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  // Top-level try/catch ensures the route always returns 200 with usable JSON
  // (degraded if necessary). A 5xx here cascades into the browser showing
  // "page can't be loaded" because the client component triggers this fetch
  // immediately after the user adds their first holding.
  try {
    const { searchParams } = new URL(req.url);
    const tickersParam = searchParams.get("tickers") ?? "";
    const costsParam   = searchParams.get("costs")   ?? "";
    const lang         = searchParams.get("lang")    ?? "en";

    const tickers = tickersParam.split(",").filter(Boolean);
    const costs   = costsParam.split(",").map(Number);
    if (tickers.length === 0) return NextResponse.json([]);

    // Missing Groq key is non-fatal — return scored signals without reasoning.
    const GROQ_KEY = process.env.GROQ_API_KEY?.replace(/^﻿/, "").trim() ?? "";

    // 1 — Fetch price + 52-week range + analyst consensus + P/E in parallel.
    //    Price/range uses v8/chart 2d (same cache as /api/prices). P/E uses
    //    the unified getPERatio fallback chain (v7/quote for EU, v10
    //    quoteSummary for US, Alpha Vantage backup, hardcoded estimate last).
    const [tickerData, analysts, peData] = await Promise.all([
      Promise.all(tickers.map(t => fetchTickerData(t))),
      Promise.all(tickers.map(t => fetchAnalyst(t))),
      Promise.all(tickers.map(t => getPERatio(t))),
    ]);

    // 2 — Score using 52-week range + live P/E for Value sub-score
    const computed = tickers.map((ticker, i) => {
      const td     = tickerData[i];
      const peMeta = peData[i];
      const result = td
        ? calcScore(td.price, td.high52, td.low52, peMeta.pe, peMeta.fairPE, peMeta.peEstimated)
        : null;
      return {
        ticker,
        result,
        pe:          peMeta.pe,
        fairPE:      peMeta.fairPE,
        sector:      peMeta.sector,
        peEstimated: peMeta.peEstimated,
      };
    });

    // 3 — Groq reasoning (skipped when key missing or call fails)
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

    const reasonings = GROQ_KEY
      ? await batchReason(groqInputs, lang, GROQ_KEY)
      : {};

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
  } catch (err) {
    console.error("[vela] /api/signals fatal error:", err);
    return NextResponse.json([]);
  }
}
