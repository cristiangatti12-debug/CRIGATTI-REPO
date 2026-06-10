import { NextRequest, NextResponse } from "next/server";
import type { AllocationResult } from "@/types";

export const dynamic = "force-dynamic";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

interface HoldingParam {
  ticker:         string;
  name:           string;
  shares:         number;
  cost_per_share: number;
  currency?:      string;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const profile = searchParams.get("profile") ?? "Balanced";
  const score   = parseInt(searchParams.get("score") ?? "12", 10);
  const GROQ_KEY = process.env.GROQ_API_KEY?.replace(/^﻿/, "").trim();

  let holdings: HoldingParam[] = [];
  try {
    const raw = searchParams.get("holdings");
    if (raw) holdings = JSON.parse(decodeURIComponent(raw));
  } catch {}

  const holdingsSummary = holdings.length > 0
    ? holdings.map(h => {
        const value = h.shares * h.cost_per_share;
        return `${h.ticker} (${h.name}): ${h.shares} shares @ ${h.cost_per_share} ${h.currency ?? "EUR"} ≈ ${value.toFixed(0)} ${h.currency ?? "EUR"}`;
      }).join("\n")
    : "No holdings yet — portfolio is empty";

  const totalValue = holdings.reduce((s, h) => s + h.shares * h.cost_per_share, 0);

  if (!GROQ_KEY) return NextResponse.json(getFallbackAllocation(profile));

  const prompt =
    `You are a personal finance advisor for beginners. Be simple, clear, and encouraging.\n\n` +
    `User risk profile: ${profile}\n` +
    `Risk score: ${score}/25\n` +
    `Current holdings:\n${holdingsSummary}\n` +
    `Total portfolio value (approx): ${totalValue.toFixed(0)}\n\n` +
    `Return ONLY a valid JSON object. No markdown. No explanation outside the JSON. No backticks.\n\n` +
    `{\n` +
    `  "profile": "${profile}",\n` +
    `  "summary": "One sentence in plain English, no jargon",\n` +
    `  "allocation": [\n` +
    `    {\n` +
    `      "asset_class": "Global ETFs",\n` +
    `      "target_pct": 50,\n` +
    `      "current_pct": 0,\n` +
    `      "why": "One sentence max",\n` +
    `      "example_instrument": "VWCE"\n` +
    `    }\n` +
    `  ],\n` +
    `  "gap": "2 sentences max. Plain English, no jargon.",\n` +
    `  "actions": ["Action 1", "Action 2", "Action 3"]\n` +
    `}\n\n` +
    `Rules:\n` +
    `- allocation: 3 to 5 items, target_pct must sum to 100\n` +
    `- current_pct = estimated % of current holdings in that asset class (0 if none)\n` +
    `- actions: max 3 items, each under 15 words\n` +
    `- example_instrument: real ticker or ETF available in Europe`;

  try {
    const groqRes = await fetch(GROQ_API_URL, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${GROQ_KEY}`,
      },
      body: JSON.stringify({
        model:       "llama-3.3-70b-versatile",
        max_tokens:  1000,
        temperature: 0.4,
        messages:    [{ role: "user", content: prompt }],
      }),
    });

    if (!groqRes.ok) throw new Error(`Groq ${groqRes.status}`);

    const groqData = await groqRes.json();
    const raw      = groqData.choices?.[0]?.message?.content ?? "";
    const cleaned  = raw.replace(/```json|```/g, "").trim();
    const result   = JSON.parse(cleaned) as AllocationResult;

    // Sanity: allocation must sum to ~100
    const total = result.allocation?.reduce((s: number, sl: any) => s + (sl.target_pct ?? 0), 0) ?? 0;
    if (!result.allocation || total < 90 || total > 110) throw new Error("Invalid allocation");

    return NextResponse.json(result);
  } catch {
    return NextResponse.json(getFallbackAllocation(profile));
  }
}

function getFallbackAllocation(profile: string): AllocationResult {
  const map: Record<string, AllocationResult> = {
    Conservative: {
      profile:  "Conservative",
      summary:  "Focus on protecting your capital with steady, low-risk investments.",
      allocation: [
        { asset_class: "Bonds / Fixed Income",  target_pct: 50, current_pct: 0, why: "Stable returns with low risk",      example_instrument: "AGGH"           },
        { asset_class: "Global ETFs",            target_pct: 25, current_pct: 0, why: "Broad diversification",            example_instrument: "VWCE"           },
        { asset_class: "Cash / Money Market",    target_pct: 15, current_pct: 0, why: "Safety net and liquidity",         example_instrument: "Savings account" },
        { asset_class: "Dividend Stocks",        target_pct: 10, current_pct: 0, why: "Income with lower volatility",     example_instrument: "VHYL"           },
      ],
      gap:     "Your portfolio needs more defensive assets. Prioritise bonds and broad ETFs.",
      actions: ["Add a global bond ETF like AGGH", "Reduce single-stock concentration", "Keep 3 months of expenses in cash"],
    },
    Balanced: {
      profile:  "Balanced",
      summary:  "A mix of growth and stability — diversified across asset classes.",
      allocation: [
        { asset_class: "Global ETFs",            target_pct: 50, current_pct: 0, why: "Core diversified exposure",        example_instrument: "VWCE"           },
        { asset_class: "Bonds / Fixed Income",   target_pct: 20, current_pct: 0, why: "Cushion against market drops",     example_instrument: "AGGH"           },
        { asset_class: "Individual Stocks",      target_pct: 20, current_pct: 0, why: "Higher return potential",          example_instrument: "2–3 quality companies" },
        { asset_class: "Cash / Reserve",         target_pct: 10, current_pct: 0, why: "Liquidity buffer",                 example_instrument: "Savings account" },
      ],
      gap:     "Ensure no single stock exceeds 10% of your portfolio. Add a global ETF as your core position.",
      actions: ["Buy VWCE as your core holding", "Add a bond ETF for stability", "Keep max 10% in any single stock"],
    },
    Growth: {
      profile:  "Growth",
      summary:  "Long-term capital growth — higher equity exposure with some diversification.",
      allocation: [
        { asset_class: "Global ETFs",            target_pct: 55, current_pct: 0, why: "Broad market compounding",         example_instrument: "VWCE"           },
        { asset_class: "Individual Stocks",      target_pct: 30, current_pct: 0, why: "Alpha on high-conviction names",   example_instrument: "Quality growth companies" },
        { asset_class: "Emerging Markets",       target_pct: 10, current_pct: 0, why: "Higher long-term growth",          example_instrument: "EIMI"           },
        { asset_class: "Cash / Reserve",         target_pct:  5, current_pct: 0, why: "Minimum liquidity buffer",        example_instrument: "Savings account" },
      ],
      gap:     "You have capacity for more equity risk. Consider adding emerging markets via ETFs.",
      actions: ["Build ETF position to 55%", "Add EIMI for emerging market exposure", "Keep only high-conviction individual stocks"],
    },
    Aggressive: {
      profile:  "Aggressive",
      summary:  "Maximum growth — concentrated equities, high risk tolerance, long horizon.",
      allocation: [
        { asset_class: "Individual Stocks",      target_pct: 50, current_pct: 0, why: "Maximum return potential",         example_instrument: "Quality growth names" },
        { asset_class: "Global ETFs",            target_pct: 30, current_pct: 0, why: "Diversification base",             example_instrument: "VWCE / CSPX"    },
        { asset_class: "Emerging Markets",       target_pct: 15, current_pct: 0, why: "High-growth exposure",             example_instrument: "EIMI"           },
        { asset_class: "Cash / Reserve",         target_pct:  5, current_pct: 0, why: "Stay invested, minimum buffer",   example_instrument: "Savings account" },
      ],
      gap:     "Even aggressive portfolios need a diversification base. Avoid over-concentration in one sector.",
      actions: ["Set max 15% per individual stock", "Add VWCE as your base position", "Review quarterly for rebalancing"],
    },
  };
  return map[profile] ?? map["Balanced"];
}
