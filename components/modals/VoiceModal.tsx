"use client";
import { useState, useEffect, useRef, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────
export interface ParsedHolding {
  ticker: string;
  name:   string;
  shares: string;
  cost:   string;
  date:   string;
}

interface Props {
  onClose:   () => void;
  onConfirm: (data: ParsedHolding) => void;
}

// ── Number-word map ───────────────────────────────────────────────────────────
const WORD_TO_NUM: Record<string, number> = {
  one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,
  eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,
  seventeen:17,eighteen:18,nineteen:19,twenty:20,thirty:30,forty:40,
  fifty:50,sixty:60,seventy:70,eighty:80,ninety:90,hundred:100,thousand:1000,
};

function wordsToNumber(str: string): string {
  // Replace number words with digits
  let s = str.toLowerCase();
  Object.entries(WORD_TO_NUM).forEach(([word, num]) => {
    s = s.replace(new RegExp(`\\b${word}\\b`, "g"), String(num));
  });
  // Find first number (integer or decimal)
  const m = s.match(/[\d]+(?:[.,][\d]+)?/);
  return m ? m[0].replace(",", ".") : "";
}

// ── Month map ─────────────────────────────────────────────────────────────────
const MONTHS: Record<string, string> = {
  january:"01",february:"02",march:"03",april:"04",may:"05",june:"06",
  july:"07",august:"08",september:"09",october:"10",november:"11",december:"12",
  jan:"01",feb:"02",mar:"03",apr:"04",jun:"06",jul:"07",aug:"08",
  sep:"09",oct:"10",nov:"11",dec:"12",
};

function parseDate(text: string): string {
  const t = text.toLowerCase();
  // Try "15 March 2023" or "March 15 2023" or "March 2023"
  for (const [month, num] of Object.entries(MONTHS)) {
    const dayMonthYear = new RegExp(`(\\d{1,2})\\s+${month}\\s+(\\d{4})`,"i");
    const monthDayYear = new RegExp(`${month}\\s+(\\d{1,2})\\s+(\\d{4})`,"i");
    const monthYear    = new RegExp(`${month}\\s+(\\d{4})`,"i");
    let m;
    if ((m = t.match(dayMonthYear)))   return `${m[2]}-${num}-${m[1].padStart(2,"0")}`;
    if ((m = t.match(monthDayYear)))   return `${m[2]}-${num}-${m[1].padStart(2,"0")}`;
    if ((m = t.match(monthYear)))      return `${m[1]}-${num}-01`;
  }
  // ISO or dd/mm/yyyy
  const iso = t.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  const dmy = t.match(/(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2,"0")}-${dmy[1].padStart(2,"0")}`;
  return new Date().toISOString().split("T")[0];
}

// ── Parse transcript → holding fields ─────────────────────────────────────────
async function parseTranscript(text: string): Promise<ParsedHolding> {
  const t = text.toLowerCase();

  // --- Shares ---
  // "10 shares", "bought 10", "purchase 5", "five shares"
  let shares = "";
  const sharesMatch = t.match(/(\b[\w\s]+\b)\s*(?:shares?|titoli|azioni)/i);
  if (sharesMatch) shares = wordsToNumber(sharesMatch[1]);
  if (!shares) {
    const nums = t.match(/\b(\d+(?:[.,]\d+)?)\b/g);
    if (nums) shares = nums[0];
  }

  // --- Price ---
  // "at 160", "price 620", "160 dollars", "€98"
  let cost = "";
  const pricePatterns = [
    /(?:at|price|cost|bought at|paid|average|avg)[^\d]*(\d+(?:[.,]\d+)?)/i,
    /[€$£](\d+(?:[.,]\d+)?)/,
    /(\d+(?:[.,]\d+)?)\s*(?:dollar|euro|€|\$|pound)/i,
  ];
  for (const pat of pricePatterns) {
    const m = t.match(pat);
    if (m) { cost = m[1].replace(",","."); break; }
  }
  // If two numbers found and no price yet, second one is likely price
  if (!cost) {
    const nums = t.match(/\b(\d+(?:[.,]\d+)?)\b/g);
    if (nums && nums.length >= 2) cost = nums[1].replace(",",".");
  }

  // --- Date ---
  const date = parseDate(text);

  // --- Ticker / Company ---
  // Remove common filler words then search Yahoo Finance
  const cleaned = text
    .replace(/\b(add|buy|bought|purchase|shares?|of|at|for|on|dollars?|euros?|price|average|avg|cost|i|my|portfolio|into)\b/gi, " ")
    .replace(/\d+(?:[.,]\d+)?/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  let ticker = "";
  let name   = "";

  if (cleaned.length > 1) {
    try {
      const res  = await fetch(`/api/search?q=${encodeURIComponent(cleaned)}`);
      const data = await res.json();
      if (data.length > 0) {
        ticker = data[0].symbol;
        name   = data[0].name;
      }
    } catch {}
  }

  return { ticker, name, shares, cost, date };
}

// ── STATE MACHINE ─────────────────────────────────────────────────────────────
type Stage = "idle" | "listening" | "processing" | "confirm" | "error";

// ── COMPONENT ─────────────────────────────────────────────────────────────────
export default function VoiceModal({ onClose, onConfirm }: Props) {
  const [stage,      setStage]      = useState<Stage>("idle");
  const [transcript, setTranscript] = useState("");
  const [parsed,     setParsed]     = useState<ParsedHolding | null>(null);
  const [errMsg,     setErrMsg]     = useState("");
  const recogRef = useRef<any>(null);

  const startListening = useCallback(() => {
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) { setErrMsg("Voice not supported in this browser. Please use Chrome or Safari."); setStage("error"); return; }

    const recog = new SR();
    recog.lang = "en-US";          // TODO: add Italian toggle
    recog.continuous = false;
    recog.interimResults = true;
    recog.maxAlternatives = 1;
    recogRef.current = recog;

    recog.onstart  = () => setStage("listening");
    recog.onresult = (e: any) => {
      const text = Array.from(e.results as any[])
        .map((r: any) => r[0].transcript)
        .join(" ");
      setTranscript(text);
    };
    recog.onend = async () => {
      if (!transcript && stage === "listening") { setStage("idle"); return; }
      setStage("processing");
      const result = await parseTranscript(transcript);
      setParsed(result);
      setStage("confirm");
    };
    recog.onerror = (e: any) => {
      setErrMsg(`Microphone error: ${e.error}`);
      setStage("error");
    };

    setTranscript("");
    recog.start();
  }, [transcript, stage]);

  // Auto-start on mount
  useEffect(() => { startListening(); }, []);   // eslint-disable-line

  function handleConfirm() {
    if (parsed) { onConfirm(parsed); onClose(); }
  }

  const EXAMPLES = [
    "Add 10 shares of Apple at 160 dollars March 2023",
    "Bought 5 NVIDIA shares at 620 on January 2024",
    "15 Vanguard ETF shares price 98 euros June 2022",
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg rounded-t-3xl p-6 pb-10 shadow-2xl"
        style={{ backgroundColor: "white" }}>

        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-lg font-bold" style={{ color: "#1E3A5F" }}>Voice Input</h2>
            <p className="text-xs" style={{ color: "#94A3B8" }}>Speak naturally — Vela understands</p>
          </div>
          <button onClick={onClose} className="text-2xl" style={{ color: "#94A3B8" }}>×</button>
        </div>

        {/* Mic animation */}
        {(stage === "idle" || stage === "listening") && (
          <div className="flex flex-col items-center py-6">
            <div className="relative mb-4">
              {stage === "listening" && (
                <>
                  <div className="absolute inset-0 rounded-full animate-ping opacity-30"
                    style={{ backgroundColor: "#0EA5E9", transform: "scale(1.6)" }} />
                  <div className="absolute inset-0 rounded-full animate-pulse opacity-20"
                    style={{ backgroundColor: "#0EA5E9", transform: "scale(2.2)" }} />
                </>
              )}
              <button
                onClick={stage === "idle" ? startListening : undefined}
                className="relative w-20 h-20 rounded-full flex items-center justify-center text-3xl shadow-lg transition-transform"
                style={{
                  backgroundColor: stage === "listening" ? "#0EA5E9" : "#F0F9FF",
                  border: "2px solid #0EA5E9",
                  cursor: stage === "listening" ? "default" : "pointer",
                }}>
                🎙️
              </button>
            </div>
            <p className="text-sm font-medium" style={{ color: "#1E3A5F" }}>
              {stage === "listening" ? "Listening… speak now" : "Tap to start"}
            </p>
            {stage === "listening" && transcript && (
              <p className="mt-3 text-xs text-center px-4 italic" style={{ color: "#64748B" }}>
                &ldquo;{transcript}&rdquo;
              </p>
            )}
            {stage === "idle" && (
              <div className="mt-5 w-full space-y-2">
                <p className="text-xs font-medium mb-2 text-center" style={{ color: "#94A3B8" }}>Try saying:</p>
                {EXAMPLES.map((ex, i) => (
                  <div key={i} className="rounded-xl px-3 py-2 text-xs text-center"
                    style={{ backgroundColor: "#F0F9FF", color: "#64748B" }}>
                    &ldquo;{ex}&rdquo;
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Processing */}
        {stage === "processing" && (
          <div className="flex flex-col items-center py-10">
            <div className="w-12 h-12 rounded-full border-4 border-t-transparent animate-spin mb-4"
              style={{ borderColor: "#BAE6FD", borderTopColor: "#0EA5E9" }} />
            <p className="text-sm" style={{ color: "#1E3A5F" }}>Analysing…</p>
            <p className="text-xs mt-1 italic" style={{ color: "#94A3B8" }}>&ldquo;{transcript}&rdquo;</p>
          </div>
        )}

        {/* Confirm */}
        {stage === "confirm" && parsed && (
          <div className="space-y-3">
            <p className="text-xs italic mb-3 px-1" style={{ color: "#94A3B8" }}>
              Heard: &ldquo;{transcript}&rdquo;
            </p>

            {/* Preview fields */}
            {[
              { label: "Ticker",         value: parsed.ticker || "—" },
              { label: "Company / ETF",  value: parsed.name   || "—" },
              { label: "Shares",         value: parsed.shares || "—" },
              { label: "Price / share",  value: parsed.cost   ? `${parsed.cost}` : "—" },
              { label: "Purchase date",  value: parsed.date   || "—" },
            ].map(f => (
              <div key={f.label} className="flex justify-between items-center px-4 py-2.5 rounded-xl"
                style={{ backgroundColor: "#F0F9FF" }}>
                <span className="text-xs" style={{ color: "#94A3B8" }}>{f.label}</span>
                <span className="text-sm font-semibold" style={{
                  color: f.value === "—" ? "#EF4444" : "#1E3A5F",
                }}>{f.value}</span>
              </div>
            ))}

            <div className="flex gap-3 pt-2">
              <button onClick={() => { setStage("idle"); setTranscript(""); setParsed(null); }}
                className="flex-1 py-3 rounded-xl text-sm font-medium"
                style={{ backgroundColor: "#F0F9FF", color: "#64748B" }}>
                Try again
              </button>
              <button onClick={handleConfirm}
                className="flex-1 py-3 rounded-xl text-sm font-semibold text-white"
                style={{ backgroundColor: "#0EA5E9" }}>
                Confirm & Add ✓
              </button>
            </div>
          </div>
        )}

        {/* Error */}
        {stage === "error" && (
          <div className="text-center py-8">
            <p className="text-3xl mb-3">🎤</p>
            <p className="text-sm font-medium mb-2" style={{ color: "#1E3A5F" }}>{errMsg}</p>
            <button onClick={() => setStage("idle")}
              className="mt-4 px-5 py-2 rounded-full text-sm font-medium text-white"
              style={{ backgroundColor: "#0EA5E9" }}>Try again</button>
          </div>
        )}

      </div>
    </div>
  );
}
