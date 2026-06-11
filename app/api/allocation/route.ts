import { NextRequest, NextResponse } from "next/server";
import { Anthropic } from "@anthropic-ai/sdk";
import type { AllocationResult, BehaviorFlags } from "@/types";

export const dynamic = "force-dynamic";

interface HoldingParam {
  ticker:         string;
  name:           string;
  shares:         number;
  cost_per_share: number;
  currency?:      string;
}

interface ExtendedAllocationResult extends AllocationResult {
  confidence_score: number;
  key_risks:        string[];
  learning_notes:   string;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const profile = searchParams.get("profile") ?? "Balanced";
  const score   = parseInt(searchParams.get("score") ?? "12", 10);
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY?.replace(/^﻿/, "").trim();

  let holdings: HoldingParam[] = [];
  let fullQuestionnaire: Record<string, any> = {};
  let behaviorFlags: BehaviorFlags = { panicSelling: false, overconfidence: false, emotionalAdjuster: false };

  try {
    const raw = searchParams.get("holdings");
    if (raw) holdings = JSON.parse(decodeURIComponent(raw));
  } catch {}

  try {
    const raw = searchParams.get("full_questionnaire");
    if (raw) fullQuestionnaire = JSON.parse(decodeURIComponent(raw));
  } catch {}

  try {
    const raw = searchParams.get("behavioral_flags");
    if (raw) behaviorFlags = JSON.parse(decodeURIComponent(raw));
  } catch {}

  const holdingsSummary = holdings.length > 0
    ? holdings.map(h => {
        const value = h.shares * h.cost_per_share;
        return `${h.ticker} (${h.name}): ${h.shares} shares @ ${h.cost_per_share} ${h.currency ?? "EUR"} ≈ ${value.toFixed(0)} ${h.currency ?? "EUR"}`;
      }).join("\n")
    : "No holdings yet — portfolio is empty";

  const totalValue = holdings.reduce((s, h) => s + h.shares * h.cost_per_share, 0);

  if (!ANTHROPIC_KEY) return NextResponse.json(getFallbackAllocation(profile));

  const client = new Anthropic({ apiKey: ANTHROPIC_KEY });

  const behaviorContext = buildBehaviorContext(behaviorFlags);
  const questionnaireSummary = buildQuestionnaireSummary(fullQuestionnaire);

  const prompt =
    `You are a specialized financial advisor and portfolio allocation expert. You have deep expertise in:\n` +
    `- Modern portfolio theory and asset allocation\n` +
    `- Behavioral finance and investor psychology\n` +
    `- Risk management and diversification\n` +
    `- European and global investment markets\n\n` +
    `## User Profile\n` +
    `Risk Category: ${profile} (score ${score}/25)\n` +
    `${questionnaireSummary ? `Detailed Risk Assessment:\n${questionnaireSummary}\n` : ""}` +
    `${behaviorContext ? `Behavioral Patterns:\n${behaviorContext}\n` : ""}` +
    `\n## Current Holdings\n${holdingsSummary}\n` +
    `Total Portfolio Value (approx): €${totalValue.toFixed(0)}\n\n` +
    `## Your Task\n` +
    `Based on the user's comprehensive risk profile, behavioral patterns, and current holdings, create a personalized portfolio allocation strategy.\n` +
    `Consider:\n` +
    `- Asset class diversification\n` +
    `- Geographic diversification (Europe, global, emerging markets)\n` +
    `- Behavioral coaching (e.g., if prone to panic selling, reduce volatility)\n` +
    `- Tax efficiency in EU context\n` +
    `- Real, investable instruments available in Europe\n\n` +
    `Return ONLY valid JSON. No markdown, no code blocks, no explanation.\n\n` +
    `{\n` +
    `  "profile": "${profile}",\n` +
    `  "summary": "One compelling sentence about this allocation strategy",\n` +
    `  "allocation": [\n` +
    `    {\n` +
    `      "asset_class": "Global ETFs",\n` +
    `      "target_pct": 50,\n` +
    `      "current_pct": 0,\n` +
    `      "why": "Reason for this allocation (1 sentence, max 20 words)",\n` +
    `      "example_instrument": "VWCE"\n` +
    `    }\n` +
    `  ],\n` +
    `  "gap": "2 sentences max. Explain gap between current and target allocation.",\n` +
    `  "actions": ["Action 1: Specific step (under 15 words)", "Action 2", "Action 3"],\n` +
    `  "confidence_score": 85,\n` +
    `  "key_risks": ["Risk 1: Specific downside", "Risk 2"],\n` +
    `  "learning_notes": "Observation for next time. E.g., user adjusted this asset class by +X% last time."\n` +
    `}\n\n` +
    `Rules:\n` +
    `- allocation: 3–5 items, target_pct must sum to exactly 100\n` +
    `- current_pct = estimated % of current holdings in that class (0 if none)\n` +
    `- confidence_score: 0–100, how confident you are in this recommendation\n` +
    `- key_risks: 1–3 specific risks (not generic market risk)\n` +
    `- example_instrument: real ticker/ETF available in Europe\n` +
    `- learning_notes: Actionable insight for refinement`;

  try {
    const response = await client.messages.create({
      model:       "claude-3-5-sonnet-20241022",
      max_tokens:  1500,
      temperature: 0.6,
      messages:    [{ role: "user", content: prompt }],
    });

    const raw = response.content[0]?.type === "text" ? response.content[0].text : "";
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const result = JSON.parse(cleaned) as ExtendedAllocationResult;

    // Sanity: allocation must sum to ~100
    const total = result.allocation?.reduce((s: number, sl: any) => s + (sl.target_pct ?? 0), 0) ?? 0;
    if (!result.allocation || total < 90 || total > 110) throw new Error("Invalid allocation sum");

    return NextResponse.json(result);
  } catch (error) {
    console.error("[/api/allocation] Claude error:", error);
    return NextResponse.json(getFallbackAllocation(profile));
  }
}

function buildBehaviorContext(flags: BehaviorFlags): string {
  const lines: string[] = [];
  if (flags.panicSelling) lines.push("- History of panic selling during downturns → Recommend lower volatility and automatic rebalancing");
  if (flags.overconfidence) lines.push("- Overestimation of personal stock-picking ability → Emphasize ETF core + limited individual stock allocation");
  if (flags.emotionalAdjuster) lines.push("- Tendency to emotionally adjust portfolio → Suggest preset rebalancing schedule instead of frequent changes");
  return lines.length > 0 ? lines.join("\n") : "";
}

function buildQuestionnaireSummary(q: Record<string, any>): string {
  const parts: string[] = [];
  if (q.investmentHorizon) parts.push(`Investment horizon: ${q.investmentHorizon}`);
  if (q.incomeStability) parts.push(`Income stability: ${q.incomeStability}`);
  if (q.emergencyFundMonths) parts.push(`Emergency fund: ${q.emergencyFundMonths} months`);
  if (q.debtLevel) parts.push(`Debt load: ${q.debtLevel}`);
  if (q.esgConcern) parts.push(`ESG priority: ${q.esgConcern}`);
  return parts.join(" | ");
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
