import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCompanySnapshot, fetchTickerHeadlines, type CompanySnapshot } from "@/lib/marketData";

// Common English words that look like tickers (2–5 uppercase chars). We never
// want to fire an FMP/AV call for these when scanning the user message.
const TICKER_STOPWORDS = new Set<string>([
  "A","I","AI","IT","AM","PM","US","UK","EU","CEO","CFO","CTO","ETF","ETFS","IPO",
  "BUY","SELL","HOLD","ADD","NEW","TOP","MAX","MIN","ALL","OK","OKAY","NO","YES",
  "PNL","ROI","PE","PB","EPS","WHAT","WHY","HOW","WHO","DID","CAN","DO","IS","ARE",
  "ON","OFF","IN","UP","DOWN","DOES","HAS","HAD","BUT","AND","OR","FOR","THE","TO",
  "OF","BE","MY","ITS","SHOULD","COULD","WOULD","NICE","GOOD","BAD","HI","HELLO",
  "TY","THX","BTW","FYI","LOL","OMG","WTF","NEXT","LAST","WEEK","DAY","YEAR",
]);

// Extract up to N candidate tickers from a user message. We accept 2–5 char
// uppercase tokens or Yahoo-style suffixed tickers like ALV.DE or VWCE.MI.
function extractCandidateTickers(message: string, maxN = 3): string[] {
  if (!message) return [];
  const matches = message.match(/\b[A-Z]{2,5}(?:\.[A-Z]{1,3})?\b/g) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of matches) {
    const upper = m.toUpperCase();
    if (TICKER_STOPWORDS.has(upper.split(".")[0])) continue;
    if (seen.has(upper)) continue;
    seen.add(upper);
    out.push(upper);
    if (out.length >= maxN) break;
  }
  return out;
}

// Render one snapshot as compact lines for the LLM prompt.
function renderSnapshot(snap: CompanySnapshot, headlines: string[]): string {
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  const lines: string[] = [`${snap.ticker} — ${snap.name ?? "(name unavailable)"}`];
  if (snap.sector)             lines.push(`  Sector: ${snap.sector}${snap.industry ? ` · ${snap.industry}` : ""}`);
  if (snap.description)        lines.push(`  Business: ${snap.description}`);
  if (snap.revenueGrowthYoY !== null) lines.push(`  Revenue growth (latest reported): ${pct(snap.revenueGrowthYoY)}`);
  if (snap.grossMargin !== null)     lines.push(`  Gross margin: ${pct(snap.grossMargin)}`);
  if (snap.operatingMargin !== null) lines.push(`  Operating margin: ${pct(snap.operatingMargin)}`);
  if (snap.netMargin !== null)       lines.push(`  Net margin: ${pct(snap.netMargin)}`);
  if (snap.returnOnEquity !== null)  lines.push(`  Return on equity: ${pct(snap.returnOnEquity)}`);
  if (snap.pe !== null)              lines.push(`  Trailing P/E: ${snap.pe.toFixed(1)}x`);
  if (headlines.length > 0) {
    lines.push(`  Recent headlines:`);
    for (const h of headlines) lines.push(`    - ${h}`);
  }
  return lines.join("\n");
}

// ── Fetch price directly from Yahoo Finance (avoids internal route call) ──────
async function fetchPrice(ticker: string) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`;
    const res  = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    const json = await res.json();
    const meta = json?.chart?.result?.[0]?.meta;
    if (!meta) return null;
    const price = meta.regularMarketPrice ?? 0;
    const prev  = meta.previousClose      ?? price;
    return {
      price,
      changePct: prev !== 0 ? ((price - prev) / prev) * 100 : 0,
    };
  } catch { return null; }
}

export async function POST(req: NextRequest) {
  // Strip BOM (﻿) that PowerShell can inject when piping to Vercel CLI
  const GROQ_API_KEY = process.env.GROQ_API_KEY?.replace(/^﻿/, "").trim();
  if (!GROQ_API_KEY) {
    return NextResponse.json({ reply: "AI not configured yet. Please add your Groq API key." });
  }

  let message = "";
  let history: any[] = [];
  let lang    = "en";
  try {
    const body = await req.json();
    message = body.message ?? "";
    history = Array.isArray(body.history) ? body.history : [];
    lang    = body.lang === "it" ? "it" : "en";
  } catch {
    return NextResponse.json({ reply: "Invalid request." });
  }

  // ── Fetch holdings from Supabase (scoped to the authenticated user) ─────────
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let portfolioContext  = "The user has no holdings in their portfolio yet.";
  let portfolioInsights = "";
  let portfolioTickers: string[] = []; // ordered by current value, descending

  try {
    const query = supabase.from("holdings").select("*");
    const { data: holdings } = user?.id
      ? await query.eq("user_id", user.id)
      : await query;

    if (holdings && holdings.length > 0) {
      // Fetch all prices in parallel, directly from Yahoo Finance
      const prices = await Promise.all(holdings.map((h: any) => fetchPrice(h.ticker)));

      let totalValue = 0;
      let totalCost  = 0;
      const enriched = holdings.map((h: any, i: number) => {
        const live         = prices[i];
        const currentPrice = live?.price    ?? Number(h.cost_per_share);
        const changePct    = live?.changePct ?? 0;
        const currentValue = currentPrice * Number(h.shares);
        const costBasis    = Number(h.cost_per_share) * Number(h.shares);
        const pnl          = currentValue - costBasis;
        const pnlPct       = costBasis > 0 ? (pnl / costBasis) * 100 : 0;
        totalValue += currentValue;
        totalCost  += costBasis;
        return { h, currentPrice, changePct, currentValue, costBasis, pnl, pnlPct };
      });

      const lines = enriched.map(({ h, currentPrice, changePct, pnl, pnlPct }) =>
        `  • ${h.name} (${h.ticker}): ${h.shares} shares` +
        ` | avg cost $${Number(h.cost_per_share).toFixed(2)}` +
        ` | now $${currentPrice.toFixed(2)} (${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}% today)` +
        ` | P&L ${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)} (${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}%)`
      );

      const totalPnl    = totalValue - totalCost;
      const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;

      portfolioContext =
        `Portfolio overview:\n` +
        `  Total value:  $${totalValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n` +
        `  Cost basis:   $${totalCost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n` +
        `  Total P&L:    ${totalPnl >= 0 ? "+" : ""}$${Math.abs(totalPnl).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${totalPnlPct >= 0 ? "+" : ""}${totalPnlPct.toFixed(2)}%)\n\n` +
        `Holdings:\n${lines.join("\n")}`;

      // Concentration + geography
      const sorted   = [...enriched].sort((a, b) => b.currentValue - a.currentValue);
      const top      = sorted[0];
      const topPct   = totalValue > 0 ? (top.currentValue / totalValue * 100).toFixed(0) : "0";
      const euTickers = holdings.filter((h: any) => /\.(DE|PA|L|AS|SW|MI|CO)$/i.test(h.ticker)).length;
      const geoNote   = euTickers > 0
        ? `${holdings.length - euTickers} US + ${euTickers} European holdings`
        : `${holdings.length} US holdings`;
      portfolioInsights =
        `\nPORTFOLIO INSIGHTS:\n` +
        `  Top holding: ${top.h.ticker} = ${topPct}% of portfolio${Number(topPct) > 30 ? " ⚠️ HIGH CONCENTRATION" : ""}\n` +
        `  Geographic: ${geoNote}\n`;

      portfolioTickers = sorted.map(({ h }) => String(h.ticker).toUpperCase());
    }
  } catch { /* Supabase unavailable — proceed without portfolio context */ }

  // ── Fetch real fundamentals + recent news for the relevant tickers ────────
  // Top 5 holdings by value + up to 2 tickers the user mentions in this message
  // that they don't already own. Snapshots are FMP-primary, AV-fallback, 24h
  // cached, so repeat questions for the same names cost zero quota.
  let fundamentalsBlock = "";
  try {
    const mentioned     = extractCandidateTickers(message, 5);
    const portfolioSet  = new Set(portfolioTickers);
    const extraMentions = mentioned.filter(t => !portfolioSet.has(t)).slice(0, 2);
    const tickersForAI  = [...portfolioTickers.slice(0, 5), ...extraMentions];

    if (tickersForAI.length > 0) {
      const enriched = await Promise.all(
        tickersForAI.map(async (tk) => {
          const [snap, news] = await Promise.all([
            getCompanySnapshot(tk),
            fetchTickerHeadlines(tk, 3),
          ]);
          return { snap, news };
        })
      );
      const blocks = enriched
        .filter(({ snap }) => snap.name || snap.description || snap.operatingMargin !== null || snap.grossMargin !== null)
        .map(({ snap, news }) => renderSnapshot(snap, news));
      if (blocks.length > 0) {
        fundamentalsBlock = `\nLIVE FUNDAMENTALS & HEADLINES (per ticker — source: FMP / AV / Yahoo News):\n${blocks.join("\n\n")}\n`;
      }
    }
  } catch { /* non-critical — proceed without fundamentals */ }

  // ── System prompt ──────────────────────────────────────────────────────────
  const systemPrompt =
    `You are Vela, a sharp AI investment analyst inside Vela.ai. Think Goldman Sachs analyst meets friendly advisor — direct, precise, occasionally witty. Never vague.\n\n` +
    `CURRENT PORTFOLIO DATA (live):\n${portfolioContext}\n` +
    portfolioInsights +
    fundamentalsBlock + `\n` +
    `YOUR CAPABILITIES — answer all of these with confidence:\n` +
    `• Portfolio performance: P&L, best/worst positions, daily moves — use exact numbers\n` +
    `• Risk analysis: concentration risk, sector exposure, geographic diversification\n` +
    `• Rebalancing advice: "you're 80% in tech — consider adding defensive/dividend stocks"\n` +
    `• Stock opinions: give direct views on any stock, valuation, recent news\n` +
    `• Fundamentals: when a ticker is in LIVE FUNDAMENTALS above, quote the actual TTM revenue growth, margins, ROE, and P/E — never guess and never say you don't have the data if it appears in that block\n` +
    `• Market context: rates, macro, sector trends — speak with conviction\n` +
    `• Diversification: identify gaps, over-exposure, correlation risks\n\n` +
    `HOW TO RESPOND:\n` +
    `- Concise: 2-4 sentences for simple questions; a tight bullet list for complex analysis\n` +
    `- Always use real numbers from the portfolio snapshot AND fundamentals block above\n` +
    `- When citing gains/losses: show both % and absolute (e.g. "+€340 / +12.4%")\n` +
    `- When citing fundamentals: cite source (FMP/AV) if asked; otherwise just state the number\n` +
    `- Reference recent headlines when they materially support/contradict the view\n` +
    `- Flag concentration risks proactively if portfolio has >30% in one stock\n` +
    `- Never say "I don't have real-time data" — you have the live portfolio + per-ticker fundamentals + recent news\n` +
    `- Don't start every reply the same way. Vary openings.\n` +
    `- No disclaimers about "not being financial advice" unless asked\n\n` +
    (lang === "it"
      ? `LINGUA: Rispondi SEMPRE in italiano. Usa termini finanziari italiani standard.\n\n`
      : ``) +
    `PORTFOLIO ADDITIONS — STRICT RULE:\n` +
    `ONLY trigger add-flow if the user is explicitly recording a PAST purchase they made:\n` +
    `✅ Trigger: "I bought 10 Apple shares", "add NVDA to my portfolio", "record my Tesla purchase", "ho comprato 5 azioni LVMH"\n` +
    `❌ Do NOT trigger: "should I buy Apple?", "I like Tesla", "what do you think of NVDA?", "is Apple a good buy?"\n` +
    `When triggered, respond with ONLY this single token: ADD_HOLDING_FLOW`;

  // ── Call Groq ──────────────────────────────────────────────────────────────
  const groqMessages = [
    { role: "system", content: systemPrompt },
    ...history.slice(-10),
    { role: "user",   content: message },
  ];

  try {
    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        model:       "llama-3.3-70b-versatile",  // Smarter model, still fast on Groq
        messages:    groqMessages,
        max_tokens:  700,
        temperature: 0.65,
      }),
    });

    if (!groqRes.ok) {
      const errText = await groqRes.text();
      console.error("Groq error:", groqRes.status, errText);
      return NextResponse.json({
        reply: `AI error (${groqRes.status}). Check that your Groq API key is valid.`,
      });
    }

    const data  = await groqRes.json();
    const reply = data.choices?.[0]?.message?.content?.trim()
      ?? "Sorry, I couldn't generate a response. Please try again.";

    return NextResponse.json({ reply });

  } catch (e: any) {
    console.error("Groq fetch failed:", e?.message);
    return NextResponse.json({
      reply: "I couldn't reach the AI right now. Please check your connection and try again.",
    });
  }
}
