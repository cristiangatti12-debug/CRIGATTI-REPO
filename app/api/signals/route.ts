import { NextRequest, NextResponse } from "next/server";
import { getPERatio } from "@/lib/marketData";
import { TICKER_FAIR_PE } from "@/lib/peMaps";
import { calcScore, fetchQuickQuote, SCORE_WEIGHTS } from "@/lib/scoring";

// Cap function runtime well under Vercel's per-request limit so a slow
// upstream (Groq or Yahoo) doesn't let the connection hang to the point where
// the browser shows "page can't be loaded" after the user adds their first
// holding (which triggers this fetch via the parent onSave).
export const maxDuration = 30;

// ── Per-ticker data fetch — fast range=2d, no weekly attempt ─────────────────
// This route is called immediately after a user adds a holding (time-sensitive).
// Weekly bars would risk hitting the 30s function limit on slow Yahoo responses.
async function fetchTickerData(ticker: string) {
  return fetchQuickQuote(ticker);
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

// ── ETF metadata (TER + AUM from Yahoo Finance fundProfile) ──────────────────
async function fetchETFMeta(ticker: string): Promise<{ ter: number | null; aum: number | null }> {
  try {
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=fundProfile,summaryDetail&formatted=false`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json",
      },
      next: { revalidate: 86400 },
    } as RequestInit);
    if (!res.ok) return { ter: null, aum: null };
    const json = await res.json();
    const fp  = json?.quoteSummary?.result?.[0]?.fundProfile ?? null;
    const sd  = json?.quoteSummary?.result?.[0]?.summaryDetail ?? null;
    const ter = fp?.feesExpensesInvestment?.annualReportExpenseRatio?.raw
             ?? fp?.feesExpensesInvestment?.netExpRatio?.raw
             ?? null;
    const aum = sd?.totalAssets?.raw ?? null;
    return { ter, aum };
  } catch { return { ter: null, aum: null }; }
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

    // Identify known ETFs upfront (synchronous map lookup) so ETF meta
    // fetches can run in parallel with the main data fetches below.
    const isKnownEtf = (t: string) => (TICKER_FAIR_PE[t.split(".")[0].toUpperCase()] ?? -1) === 0;

    // 1 — Fetch weekly price data (1M+3M momentum) + analyst consensus + P/E + ETF meta in parallel
    const [tickerData, analysts, peData, etfMeta] = await Promise.all([
      Promise.all(tickers.map(t => fetchTickerData(t))),
      Promise.all(tickers.map(t => fetchAnalyst(t))),
      Promise.all(tickers.map(t => getPERatio(t))),
      Promise.all(tickers.map(t => isKnownEtf(t) ? fetchETFMeta(t) : Promise.resolve({ ter: null, aum: null }))),
    ]);

    // 2 — Score using formula v2 (3M momentum + P/E + 52W trend + 1M momentum)
    const computed = tickers.map((ticker, i) => {
      const td     = tickerData[i];
      const peMeta = peData[i];
      const result = td
        ? calcScore(td.price, td.high52, td.low52, td.mom1m, td.mom3m, peMeta.pe, peMeta.fairPE, peMeta.peEstimated, peMeta.unprofitable)
        : null;
      return {
        ticker,
        result,
        pe:           peMeta.pe,
        fairPE:       peMeta.fairPE,
        sector:       peMeta.sector,
        peEstimated:  peMeta.peEstimated,
        unprofitable: peMeta.unprofitable,
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
          factors: c.result ? c.result.factors : null,
          meta: c.result ? {
            ma200Diff:    c.result.pctDiff,
            mom3m:        c.result.mom3m,
            pe:           c.pe,
            fairPE:       c.fairPE,
            sector:       c.sector,
            peEstimated:  c.peEstimated,
            unprofitable: c.unprofitable,
            ter:          etfMeta[i].ter,
            aum:          etfMeta[i].aum,
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
