import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface HoldingInfo {
  ticker: string;
  name: string;
  shares: number;
  cost_per_share: number;
  currency?: string;
  change_pct?: number;
}

interface Signal {
  signal: "BUY" | "HOLD" | "SELL";
  score: number;
}

interface DigestRequest {
  holdings: HoldingInfo[];
  signals: Record<string, Signal>;
}

async function tryGroq(prompt: string): Promise<{ digest: string } | null> {
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
      max_tokens: 300,
      temperature: 0.7,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!groqRes.ok) throw new Error(`Groq ${groqRes.status}`);

  const data = await groqRes.json();
  const raw = data.choices?.[0]?.message?.content ?? "";
  return { digest: raw.trim() };
}

async function tryGemini(prompt: string): Promise<{ digest: string } | null> {
  const GEMINI_KEY = process.env.GOOGLE_AI_API_KEY?.replace(/^﻿/, "").trim();
  if (!GEMINI_KEY) return null;

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 300, temperature: 0.7 },
      }),
    }
  );

  if (!geminiRes.ok) throw new Error(`Gemini ${geminiRes.status}`);

  const data = await geminiRes.json();
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return { digest: raw.trim() };
}

export async function POST(req: NextRequest) {
  try {
    const body: DigestRequest = await req.json();
    const { holdings, signals } = body;

    if (!holdings || holdings.length === 0) {
      return NextResponse.json({
        digest: "Your portfolio is empty. Add your first investment to get started.",
      });
    }

    // Find biggest mover
    let biggestMover = "";
    let biggestChange = 0;
    holdings.forEach(h => {
      const absChange = Math.abs(h.change_pct ?? 0);
      if (absChange > biggestChange) {
        biggestChange = absChange;
        biggestMover = h.ticker;
      }
    });

    // Check for signal changes
    const newBuys = holdings.filter(h => signals[h.ticker]?.signal === "BUY").map(h => h.ticker);
    const newSells = holdings.filter(h => signals[h.ticker]?.signal === "SELL").map(h => h.ticker);

    const changePct = (pct: number | undefined) => pct ?? 0;

    const prompt =
      `Generate a brief, actionable 3-sentence daily portfolio insight for a beginner investor.\n\n` +
      `Portfolio:\n` +
      `${holdings.map(h => `- ${h.ticker}: ${h.shares} shares @ €${h.cost_per_share} (${changePct(h.change_pct) >= 0 ? "+" : ""}${changePct(h.change_pct).toFixed(1)}% today)`).join("\n")}\n\n` +
      `Market signals:\n` +
      `- Biggest mover today: ${biggestMover}\n` +
      `- New BUY signals: ${newBuys.length > 0 ? newBuys.join(", ") : "None"}\n` +
      `- New SELL signals: ${newSells.length > 0 ? newSells.join(", ") : "None"}\n\n` +
      `Write exactly 3 sentences:\n` +
      `1. Comment on today's biggest mover\n` +
      `2. Note any signal changes or portfolio status\n` +
      `3. One specific action (buy more, wait, rebalance) or observation\n\n` +
      `Be conversational, factual, and actionable. Max 60 words total.`;

    let result = await tryGroq(prompt).catch(() => null);
    if (!result) result = await tryGemini(prompt).catch(() => null);

    if (!result) {
      result = {
        digest: `Your portfolio has ${holdings.length} holdings. ${biggestMover} is today's biggest mover. Review any signal changes in the Market Opportunities tab.`,
      };
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("[/api/digest]", err);
    return NextResponse.json({
      digest: "Could not generate digest.",
    }, { status: 500 });
  }
}
