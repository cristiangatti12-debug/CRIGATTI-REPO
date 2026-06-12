import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  let portfolioContext = "The user has no holdings in their portfolio yet.";
  // Re-used for the second pass that builds sector/concentration insights, so we
  // don't pay for a second auth.getUser() + DB round-trip.
  let cachedHoldings: any[] | null = null;

  try {
    const query = supabase.from("holdings").select("*");
    // If user is authenticated and holdings have user_id, filter by it;
    // otherwise fall back to all rows (pre-migration / RLS disabled).
    const { data: holdings } = user?.id
      ? await query.eq("user_id", user.id)
      : await query;
    cachedHoldings = holdings ?? null;

    if (holdings && holdings.length > 0) {
      // Fetch all prices in parallel, directly from Yahoo Finance
      const prices = await Promise.all(holdings.map((h: any) => fetchPrice(h.ticker)));

      let totalValue = 0;
      let totalCost  = 0;

      const lines = holdings.map((h: any, i: number) => {
        const live         = prices[i];
        const currentPrice = live?.price    ?? Number(h.cost_per_share);
        const changePct    = live?.changePct ?? 0;
        const currentValue = currentPrice * Number(h.shares);
        const costBasis    = Number(h.cost_per_share) * Number(h.shares);
        const pnl          = currentValue - costBasis;
        const pnlPct       = costBasis > 0 ? (pnl / costBasis) * 100 : 0;
        totalValue += currentValue;
        totalCost  += costBasis;
        return (
          `  • ${h.name} (${h.ticker}): ${h.shares} shares` +
          ` | avg cost $${Number(h.cost_per_share).toFixed(2)}` +
          ` | now $${currentPrice.toFixed(2)} (${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}% today)` +
          ` | P&L ${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)} (${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}%)`
        );
      });

      const totalPnl    = totalValue - totalCost;
      const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;

      portfolioContext =
        `Portfolio overview:\n` +
        `  Total value:  $${totalValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n` +
        `  Cost basis:   $${totalCost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n` +
        `  Total P&L:    ${totalPnl >= 0 ? "+" : ""}$${Math.abs(totalPnl).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${totalPnlPct >= 0 ? "+" : ""}${totalPnlPct.toFixed(2)}%)\n\n` +
        `Holdings:\n${lines.join("\n")}`;
    }
  } catch { /* Supabase unavailable — proceed without portfolio context */ }

  // ── Build sector/concentration insights for system prompt ────────────────
  let portfolioInsights = "";
  try {
    const insHoldings = cachedHoldings;

    if (insHoldings && insHoldings.length > 0) {
      const insPrices = await Promise.all(insHoldings.map((h: any) => fetchPrice(h.ticker)));
      const insValues = insHoldings.map((h: any, i: number) => ({
        ticker: h.ticker,
        value: (insPrices[i]?.price ?? Number(h.cost_per_share)) * Number(h.shares),
      }));
      const insTotal = insValues.reduce((s: number, v: any) => s + v.value, 0);
      if (insTotal > 0) {
        const top = [...insValues].sort((a, b) => b.value - a.value)[0];
        const topPct = (top.value / insTotal * 100).toFixed(0);
        const euTickers = insHoldings.filter((h: any) => /\.(DE|PA|L|AS|SW|MI|CO)$/i.test(h.ticker)).length;
        const geoNote = euTickers > 0
          ? `${insHoldings.length - euTickers} US + ${euTickers} European holdings`
          : `${insHoldings.length} US holdings`;
        portfolioInsights =
          `\nPORTFOLIO INSIGHTS:\n` +
          `  Top holding: ${top.ticker} = ${topPct}% of portfolio${Number(topPct) > 30 ? " ⚠️ HIGH CONCENTRATION" : ""}\n` +
          `  Geographic: ${geoNote}\n`;
      }
    }
  } catch { /* non-critical */ }

  // ── System prompt ──────────────────────────────────────────────────────────
  const systemPrompt =
    `You are Vela, a sharp AI investment analyst inside Vela.ai. Think Goldman Sachs analyst meets friendly advisor — direct, precise, occasionally witty. Never vague.\n\n` +
    `CURRENT PORTFOLIO DATA (live):\n${portfolioContext}\n` +
    portfolioInsights + `\n` +
    `YOUR CAPABILITIES — answer all of these with confidence:\n` +
    `• Portfolio performance: P&L, best/worst positions, daily moves — use exact numbers\n` +
    `• Risk analysis: concentration risk, sector exposure, geographic diversification\n` +
    `• Rebalancing advice: "you're 80% in tech — consider adding defensive/dividend stocks"\n` +
    `• Stock opinions: give direct views on any stock, valuation, recent news\n` +
    `• Market context: rates, macro, sector trends — speak with conviction\n` +
    `• Diversification: identify gaps, over-exposure, correlation risks\n\n` +
    `HOW TO RESPOND:\n` +
    `- Concise: 2-4 sentences for simple questions; a tight bullet list for complex analysis\n` +
    `- Always use real numbers from the portfolio snapshot above\n` +
    `- When citing gains/losses: show both % and absolute (e.g. "+€340 / +12.4%")\n` +
    `- Flag concentration risks proactively if portfolio has >30% in one stock\n` +
    `- Never say "I don't have real-time data" — you have the live portfolio snapshot\n` +
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
