import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface Headline {
  title: string;
  tickers?: string[];
}

interface SentimentRequest {
  headlines: Headline[];
  held_tickers: string[];
}

interface SentimentResult {
  index: number;
  sentiment: "positive" | "negative" | "neutral";
  affects_held: boolean;
  affected_ticker?: string;
}

async function tryGroq(prompt: string): Promise<SentimentResult[] | null> {
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
      max_tokens: 1000,
      temperature: 0.3,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!groqRes.ok) throw new Error(`Groq ${groqRes.status}`);

  const data = await groqRes.json();
  const raw = data.choices?.[0]?.message?.content ?? "";
  const cleaned = raw.replace(/```json|```/g, "").trim();
  const result = JSON.parse(cleaned) as SentimentResult[];

  if (!Array.isArray(result)) throw new Error("Invalid response structure");
  return result;
}

async function tryGemini(prompt: string): Promise<SentimentResult[] | null> {
  const GEMINI_KEY = process.env.GOOGLE_AI_API_KEY?.replace(/^﻿/, "").trim();
  if (!GEMINI_KEY) return null;

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 1000, temperature: 0.3 },
      }),
    }
  );

  if (!geminiRes.ok) throw new Error(`Gemini ${geminiRes.status}`);

  const data = await geminiRes.json();
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  const cleaned = raw.replace(/```json|```/g, "").trim();
  const result = JSON.parse(cleaned) as SentimentResult[];

  if (!Array.isArray(result)) throw new Error("Invalid response structure");
  return result;
}

export async function POST(req: NextRequest) {
  try {
    const body: SentimentRequest = await req.json();
    const { headlines, held_tickers } = body;

    if (!headlines || headlines.length === 0) {
      return NextResponse.json([]);
    }

    const heldSet = new Set(held_tickers.map(t => t.toUpperCase()));
    const headlineTexts = headlines
      .map((h, i) => `[${i}] ${h.title}`)
      .join("\n");

    const heldTickersStr = held_tickers.join(", ");

    const prompt =
      `Analyze the sentiment of these market news headlines. For each, return JSON with:\n` +
      `- index: 0-based position\n` +
      `- sentiment: 'positive', 'negative', or 'neutral'\n` +
      `- affects_held: true if mentions any of [${heldTickersStr}]\n` +
      `- affected_ticker: the ticker if affects_held is true\n\n` +
      `Headlines:\n${headlineTexts}\n\n` +
      `Return ONLY a JSON array. No markdown, no explanation.\n` +
      `Example:\n` +
      `[{index:0, sentiment:"positive", affects_held:false}, {index:1, sentiment:"negative", affects_held:true, affected_ticker:"AAPL"}]`;

    let results = await tryGroq(prompt).catch(() => null);
    if (!results) results = await tryGemini(prompt).catch(() => null);

    if (!results) {
      // Fallback: neutral sentiment, check for ticker mentions
      results = headlines.map((h, i) => {
        const affectedTicker = held_tickers.find(t => h.title.toUpperCase().includes(t.toUpperCase()));
        return {
          index: i,
          sentiment: "neutral" as const,
          affects_held: !!affectedTicker,
          affected_ticker: affectedTicker,
        };
      });
    }

    return NextResponse.json(results);
  } catch (err) {
    console.error("[/api/news-sentiment]", err);
    return NextResponse.json([], { status: 500 });
  }
}
