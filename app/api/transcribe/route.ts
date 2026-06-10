import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  // Strip BOM (﻿) that PowerShell can inject when piping to Vercel CLI
  const GROQ_API_KEY = process.env.GROQ_API_KEY?.replace(/^﻿/, "").trim();
  if (!GROQ_API_KEY) {
    return NextResponse.json({ error: "GROQ_API_KEY not set", text: "" }, { status: 500 });
  }

  try {
    const formData = await req.formData();
    const audio    = formData.get("audio") as Blob | null;

    if (!audio || audio.size === 0) {
      return NextResponse.json({ error: "Empty audio", text: "" }, { status: 400 });
    }

    // Detect MIME type and choose extension accordingly
    const mime = audio.type || "audio/webm";
    const ext  = mime.includes("mp4") || mime.includes("m4a") ? "audio.mp4"
               : mime.includes("ogg") ? "audio.ogg"
               : mime.includes("wav") ? "audio.wav"
               : "audio.webm";

    // Language hint from client ("en" or "it") — improves Whisper accuracy
    const lang = (formData.get("language") as string | null) ?? "en";

    // Financial vocabulary hint — significantly improves ticker/term recognition
    const whisperPrompt = lang === "it"
      ? "Assistente portafoglio finanziario. Ticker: AAPL, MSFT, NVDA, GOOGL, AMZN, META, TSLA, JPM, V, JNJ, SPY, QQQ, VOO, VWCE, IWDA, EIMI, CSPX, SWDA. Europei: ASML, SAP, LVMH, Ferrari, Nestlé, Siemens, TotalEnergies, HSBC. Azioni: comprato, venduto, aggiunto, azioni, costo medio, dividendo, portafoglio, ribilanciare, utili, rendimento, perdita, guadagno."
      : "Financial portfolio assistant. Tickers: AAPL, MSFT, NVDA, GOOGL, AMZN, META, TSLA, JPM, V, JNJ, SPY, QQQ, VOO, VWCE, IWDA, EIMI, CSPX, SWDA. European: ASML, SAP, LVMH, Ferrari, Nestlé, Siemens, TotalEnergies, HSBC. Actions: bought, sold, added, shares, cost basis, dividend, portfolio, rebalance, earnings, return, loss, gain.";

    const groqForm = new FormData();
    groqForm.append("file",            audio, ext);
    groqForm.append("model",           "whisper-large-v3-turbo");
    groqForm.append("response_format", "json");
    groqForm.append("language",        lang);
    groqForm.append("prompt",          whisperPrompt);

    const groqRes = await fetch(
      "https://api.groq.com/openai/v1/audio/transcriptions",
      {
        method:  "POST",
        headers: { "Authorization": `Bearer ${GROQ_API_KEY}` },
        body:    groqForm,
      }
    );

    if (!groqRes.ok) {
      const errText = await groqRes.text();
      console.error("Groq Whisper error:", groqRes.status, errText);
      return NextResponse.json(
        { error: `Groq Whisper error ${groqRes.status}`, text: "" },
        { status: 500 }
      );
    }

    const data = await groqRes.json();
    return NextResponse.json({ text: data.text ?? "" });

  } catch (e: any) {
    console.error("Transcribe route error:", e?.message);
    return NextResponse.json({ error: e?.message ?? "Unknown error", text: "" }, { status: 500 });
  }
}
