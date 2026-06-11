import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface DraftRequest {
  ticker: string;
  ticker_name: string;
  sentiment: string;
  horizon: string;
  score: number;
}

async function tryGroq(prompt: string): Promise<{ bull_case: string; risk: string } | null> {
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
      max_tokens: 500,
      temperature: 0.7,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!groqRes.ok) throw new Error(`Groq ${groqRes.status}`);

  const data = await groqRes.json();
  const raw = data.choices?.[0]?.message?.content ?? "";
  const cleaned = raw.replace(/```json|```/g, "").trim();
  const result = JSON.parse(cleaned) as { bull_case: string; risk: string };

  if (!result.bull_case || !result.risk) throw new Error("Invalid response structure");
  return result;
}

async function tryGemini(prompt: string): Promise<{ bull_case: string; risk: string } | null> {
  const GEMINI_KEY = process.env.GOOGLE_AI_API_KEY?.replace(/^﻿/, "").trim();
  if (!GEMINI_KEY) return null;

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 500, temperature: 0.7 },
      }),
    }
  );

  if (!geminiRes.ok) throw new Error(`Gemini ${geminiRes.status}`);

  const data = await geminiRes.json();
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  const cleaned = raw.replace(/```json|```/g, "").trim();
  const result = JSON.parse(cleaned) as { bull_case: string; risk: string };

  if (!result.bull_case || !result.risk) throw new Error("Invalid response structure");
  return result;
}

export async function POST(req: NextRequest) {
  try {
    const body: DraftRequest = await req.json();
    const { ticker, ticker_name, sentiment, horizon, score } = body;

    const prompt =
      `You are a financial analyst helping a beginner investor. Generate a realistic analysis for ${ticker} (${ticker_name}).\n\n` +
      `Context:\n` +
      `- Sentiment: ${sentiment}\n` +
      `- Time Horizon: ${horizon}\n` +
      `- Vela Score: ${score}/100\n\n` +
      `Return ONLY valid JSON with two fields:\n` +
      `{\n` +
      `  "bull_case": "2-3 sentences explaining why this stock could outperform. Be specific and factual.",\n` +
      `  "risk": "1-2 sentences about the main risk. Be realistic."\n` +
      `}\n\n` +
      `No markdown, no code blocks, no explanation. JSON only.`;

    // Try Groq first, then Gemini
    let result = await tryGroq(prompt).catch(() => null);
    if (!result) result = await tryGemini(prompt).catch(() => null);

    if (!result) {
      return NextResponse.json({
        error: "Could not generate draft",
      }, { status: 500 });
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("[/api/draft-analysis]", err);
    return NextResponse.json({
      error: "Failed to generate draft",
    }, { status: 500 });
  }
}
