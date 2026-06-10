import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const GROQ_KEY = () => process.env.GROQ_API_KEY?.replace(/^﻿/, "").trim() ?? "";

async function moderate(bull_case: string, risk: string): Promise<{ ok: boolean; reason?: string }> {
  const key = GROQ_KEY();
  if (!key) return { ok: true };

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          {
            role: "system",
            content:
              "You moderate stock analysis posts for a community platform. " +
              "Reject if: spam, gibberish (random characters), explicit imperative financial advice " +
              "(e.g. 'you MUST buy this', 'sell everything now'), or harmful content. " +
              "Short, genuine, opinion-based analyses are always OK even if bullish/bearish. " +
              "Respond ONLY with valid JSON: { \"ok\": true } or { \"ok\": false, \"reason\": \"brief reason\" }",
          },
          {
            role: "user",
            content: `Bull case: ${bull_case}\nRisk: ${risk}`,
          },
        ],
        max_tokens: 80,
        temperature: 0.1,
        response_format: { type: "json_object" },
      }),
    });
    const data    = await res.json();
    const content = data.choices?.[0]?.message?.content ?? '{"ok":true}';
    return JSON.parse(content);
  } catch {
    return { ok: true };
  }
}

const SELECT_FIELDS =
  "id, user_id, display_name, ticker, ticker_name, sentiment, horizon, conviction, bull_case, risk, created_at";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tickerFilter      = searchParams.get("ticker")?.toUpperCase().trim() ?? "";
  const displayNameFilter = searchParams.get("display_name")?.trim() ?? "";

  const supabase = await createClient();

  let query = supabase
    .from("community_analyses")
    .select(SELECT_FIELDS)
    .eq("moderation_passed", true)
    .order("created_at", { ascending: false })
    .limit(50);

  if (tickerFilter)      query = query.eq("ticker", tickerFilter);
  if (displayNameFilter) query = query.eq("display_name", displayNameFilter);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: Record<string, string>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { ticker, ticker_name, sentiment, horizon, conviction, bull_case, risk, display_name } = body;

  if (!ticker || !sentiment || !horizon || !conviction || !bull_case || !risk) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (bull_case.trim().length < 30) {
    return NextResponse.json({ error: "Bull case must be at least 30 characters" }, { status: 400 });
  }
  if (risk.trim().length < 20) {
    return NextResponse.json({ error: "Risk must be at least 20 characters" }, { status: 400 });
  }

  const result = await moderate(bull_case, risk);
  if (!result.ok) {
    return NextResponse.json(
      { error: "Analysis flagged by moderation", reason: result.reason ?? "Content policy violation" },
      { status: 422 }
    );
  }

  const { data, error } = await supabase
    .from("community_analyses")
    .insert({
      user_id:           user.id,
      display_name:      (display_name ?? "").trim() || "Anonymous",
      ticker:            ticker.toUpperCase().trim(),
      ticker_name:       (ticker_name ?? "").trim(),
      sentiment,
      horizon,
      conviction,
      bull_case:         bull_case.trim(),
      risk:              risk.trim(),
      moderation_passed: true,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { error } = await supabase
    .from("community_analyses")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
