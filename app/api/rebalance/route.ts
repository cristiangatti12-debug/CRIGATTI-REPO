import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface HoldingInfo {
  ticker: string;
  name: string;
  shares: number;
  cost_per_share: number;
  currency?: string;
}

interface AllocationItem {
  asset_class: string;
  target_pct: number;
}

interface RebalanceRequest {
  holdings: HoldingInfo[];
  allocation_result: { allocation: AllocationItem[] };
  available_cash_eur: number;
}

interface Trade {
  action: "BUY" | "SELL";
  instrument: string;
  amount_eur: number;
  reason_short: string;
}

async function tryGroq(prompt: string): Promise<{ trades: Trade[] } | null> {
  const GROQ_KEY = process.env.GROQ_API_KEY?.replace(/^﻿/, "").trim();
  if (!GROQ_KEY) return null;

  const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${GROQ_KEY}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      max_tokens: 800,
      temperature: 0.5,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!groqRes.ok) throw new Error(`Groq ${groqRes.status}`);

  const data = await groqRes.json();
  const raw = data.choices?.[0]?.message?.content ?? "";
  const cleaned = raw.replace(/```json|```/g, "").trim();
  const result = JSON.parse(cleaned) as { trades: Trade[] };

  if (!Array.isArray(result.trades)) throw new Error("Invalid response structure");
  return result;
}

async function tryGemini(prompt: string): Promise<{ trades: Trade[] } | null> {
  const GEMINI_KEY = process.env.GOOGLE_AI_API_KEY?.replace(/^﻿/, "").trim();
  if (!GEMINI_KEY) return null;

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 800, temperature: 0.5 },
      }),
    }
  );

  if (!geminiRes.ok) throw new Error(`Gemini ${geminiRes.status}`);

  const data = await geminiRes.json();
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  const cleaned = raw.replace(/```json|```/g, "").trim();
  const result = JSON.parse(cleaned) as { trades: Trade[] };

  if (!Array.isArray(result.trades)) throw new Error("Invalid response structure");
  return result;
}

function getFallbackTrades(available_cash_eur: number): { trades: Trade[] } {
  return {
    trades: [
      {
        action: "BUY",
        instrument: "VWCE",
        amount_eur: Math.round(available_cash_eur * 0.6),
        reason_short: "Diversified global ETF for core portfolio",
      },
      {
        action: "BUY",
        instrument: "AGGH",
        amount_eur: Math.round(available_cash_eur * 0.4),
        reason_short: "Bond ETF for stability",
      },
    ],
  };
}

export async function POST(req: NextRequest) {
  try {
    const body: RebalanceRequest = await req.json();
    const { holdings, allocation_result, available_cash_eur } = body;

    const portfolioSummary = holdings
      .map(h => {
        const value = h.shares * h.cost_per_share;
        return `${h.ticker}: €${value.toFixed(0)}`;
      })
      .join(", ") || "Empty";

    const totalValue = holdings.reduce((s, h) => s + h.shares * h.cost_per_share, 0);
    const allocationSummary = allocation_result.allocation
      .map(a => `${a.asset_class}: ${a.target_pct}%`)
      .join(", ");

    const prompt =
      `You are a financial advisor helping with portfolio rebalancing. Given the current portfolio and target allocation, generate precise trades.\n\n` +
      `Current Portfolio: ${portfolioSummary}\n` +
      `Total Value: €${totalValue.toFixed(0)}\n` +
      `Available Cash: €${available_cash_eur.toFixed(0)}\n` +
      `Target Allocation: ${allocationSummary}\n\n` +
      `Generate 2-4 trades to rebalance. Return ONLY valid JSON:\n` +
      `{\n` +
      `  "trades": [\n` +
      `    { "action": "BUY" or "SELL", "instrument": "ticker", "amount_eur": number, "reason_short": "1 sentence max" }\n` +
      `  ]\n` +
      `}\n\n` +
      `Rules:\n` +
      `- Use real European-listed instruments (VWCE, AGGH, EIMI, etc)\n` +
      `- amount_eur must be positive\n` +
      `- Trades must fit within available cash\n` +
      `- reason_short must be under 50 chars\n` +
      `- No markdown, no code blocks, JSON only`;

    let result = await tryGroq(prompt).catch(() => null);
    if (!result) result = await tryGemini(prompt).catch(() => null);

    if (!result) {
      result = getFallbackTrades(available_cash_eur);
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("[/api/rebalance]", err);
    return NextResponse.json(
      { error: "Failed to generate trades" },
      { status: 500 }
    );
  }
}
