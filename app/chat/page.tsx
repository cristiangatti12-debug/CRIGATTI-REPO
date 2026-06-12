"use client";
export const dynamic = "force-dynamic";
import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { rememberUid, userKey } from "@/lib/userCache";
import {
  getLang, type Lang,
  T, ADD_INTENT_REGEX, CONFIRM_YES_REGEX, CONFIRM_NO_REGEX,
  VOICE_LOCALE, SPEECH_LOCALE,
} from "@/lib/i18n";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Message {
  id:   number;
  role: "vela" | "user";
  text: string;
  time: string;
}
interface PendingHolding {
  ticker?: string;
  name?:   string;
  shares?: number;
  cost?:   number;
  date?:   string;
}
type ConvStep = "idle" | "ask_ticker" | "ask_shares" | "ask_cost" | "ask_date" | "confirm" | "saving";

const CHAT_CACHE_KEY = "vela_chat_v1";
const MAX_SAVED_MSGS = 20;

// ── Helpers ───────────────────────────────────────────────────────────────────
function nowTime() {
  return new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}
function parseNumber(text: string): number | null {
  const cleaned = text.replace(/[,$€£\s]/g, "").replace(",", ".");
  const match   = cleaned.match(/[\d.]+/);
  if (!match) return null;
  const n = parseFloat(match[0]);
  return isNaN(n) ? null : n;
}
const MONTH_MAP: Record<string, string> = {
  january:"01", february:"02", march:"03",    april:"04",   may:"05",    june:"06",
  july:"07",    august:"08",   september:"09", october:"10", november:"11",december:"12",
  jan:"01", feb:"02", mar:"03", apr:"04", jun:"06", jul:"07",
  aug:"08", sep:"09", oct:"10", nov:"11", dec:"12",
  gennaio:"01", febbraio:"02", marzo:"03", aprile:"04", maggio:"05", giugno:"06",
  luglio:"07",  agosto:"08",   settembre:"09", ottobre:"10", novembre:"11", dicembre:"12",
};
function parseDate(text: string): string {
  const t = text.toLowerCase();
  for (const [m, num] of Object.entries(MONTH_MAP)) {
    let match;
    if ((match = t.match(new RegExp(`(\\d{1,2})\\s+${m}\\s+(\\d{4})`, "i"))))
      return `${match[2]}-${num}-${match[1].padStart(2, "0")}`;
    if ((match = t.match(new RegExp(`${m}\\s+(\\d{1,2})\\s+(\\d{4})`, "i"))))
      return `${match[2]}-${num}-${match[1].padStart(2, "0")}`;
    if ((match = t.match(new RegExp(`${m}\\s+(\\d{4})`, "i"))))
      return `${match[1]}-${num}-01`;
  }
  const iso = t.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  return new Date().toISOString().split("T")[0];
}
function formatDateDisplay(iso: string, lang: Lang) {
  return new Date(iso + "T12:00:00").toLocaleDateString(
    lang === "it" ? "it-IT" : "en-GB",
    { day: "2-digit", month: "long", year: "numeric" }
  );
}
function extractPartialHolding(text: string): Partial<PendingHolding> {
  const result: Partial<PendingHolding> = {};
  const sharesMatch =
    text.match(/(\d+(?:[.,]\d+)?)\s+(?:shares?|azioni|az\.?)/i) ||
    text.match(/(?:bought|purchased|got|comprato|acquistato)\s+(\d+(?:[.,]\d+)?)/i);
  if (sharesMatch) result.shares = parseFloat(sharesMatch[1].replace(",", "."));
  const costMatch =
    text.match(/(?:at|@|a|per)\s*[$€£]?\s*(\d+(?:[.,]\d+)?)/i) ||
    text.match(/[$€£]\s*(\d+(?:[.,]\d+)?)/);
  if (costMatch) result.cost = parseFloat(costMatch[1].replace(",", "."));
  const today  = new Date().toISOString().split("T")[0];
  const parsed = parseDate(text);
  if (parsed !== today) result.date = parsed;
  return result;
}
function fmt(n: number, decimals = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

// ── Quick suggestion chips ─────────────────────────────────────────────────────
const CHIPS: Record<Lang, { label: string; msg: string }[]> = {
  en: [
    { label: "📊 Portfolio summary",       msg: "How is my portfolio performing today? Give me the full breakdown." },
    { label: "⚠️ Risks in my portfolio",   msg: "What are the main risks in my portfolio right now?" },
    { label: "⚖️ Should I rebalance?",     msg: "Should I rebalance my portfolio? Analyse my current allocation." },
    { label: "➕ Add a holding",            msg: "I want to add a new holding to my portfolio." },
  ],
  it: [
    { label: "📊 Riepilogo portafoglio",   msg: "Come sta andando il mio portafoglio oggi? Dammi un'analisi completa." },
    { label: "⚠️ Rischi nel portafoglio", msg: "Quali sono i rischi principali nel mio portafoglio?" },
    { label: "⚖️ Devo ribilanciare?",      msg: "Devo ribilanciare il portafoglio? Analizza la mia allocazione attuale." },
    { label: "➕ Aggiungi un titolo",       msg: "Voglio aggiungere un nuovo titolo al portafoglio." },
  ],
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function ChatPage() {
  const router = useRouter();

  const langRef = useRef<Lang>("en");
  const [lang, setLangState] = useState<Lang>("en");

  // Portfolio summary (fetched once on mount)
  const [portfolioSummary, setPortfolioSummary] = useState<{
    totalValue: number; totalPnl: number; totalPnlPct: number; currency: string;
  } | null>(null);

  useEffect(() => {
    const l = getLang();
    langRef.current = l;
    setLangState(l);
    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id ?? null;
      userIdRef.current = uid;
      rememberUid(uid);
    });
    fetchPortfolioSummary();
  }, []);

  async function fetchPortfolioSummary() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const query = supabase.from("holdings").select("*");
      const { data: holdings } = user?.id ? await query.eq("user_id", user.id) : await query;
      if (!holdings || holdings.length === 0) return;
      // /api/prices reads ?symbols= and returns an ARRAY of quote objects:
      // [{ symbol, price, currency, … }]. The earlier version used ?tickers=
      // and treated the response as a record, which silently fell back to
      // cost-per-share so the chat header always showed PnL = 0.
      const symbols = holdings.map((h: any) => h.ticker).join(",");
      const res = await fetch(`/api/prices?symbols=${encodeURIComponent(symbols)}`);
      const quoteArr = (await res.json()) as Array<{ symbol: string; price: number; currency?: string }>;
      const quotes: Record<string, { price: number; currency?: string }> = {};
      for (const q of quoteArr ?? []) quotes[q.symbol] = q;
      let totalValue = 0, totalCost = 0;
      let currencyCode = "USD";
      holdings.forEach((h: any) => {
        const q = quotes[h.ticker];
        const price = q?.price && q.price > 0 ? q.price : Number(h.cost_per_share);
        if (q?.currency) currencyCode = q.currency;
        totalValue += price * Number(h.shares);
        totalCost  += Number(h.cost_per_share) * Number(h.shares);
      });
      const totalPnl    = totalValue - totalCost;
      const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
      const currencySymbol = currencyCode === "EUR" ? "€" : currencyCode === "GBP" ? "£" : "$";
      setPortfolioSummary({ totalValue, totalPnl, totalPnlPct, currency: currencySymbol });
    } catch { /* non-critical */ }
  }

  const tx = T[lang];

  // ── Refs ──────────────────────────────────────────────────────────────────
  const greetedRef       = useRef(false);
  const msgIdRef         = useRef(0);
  const stepRef          = useRef<ConvStep>("idle");
  const pendingRef       = useRef<PendingHolding>({});
  const aiHistoryRef     = useRef<Array<{ role: string; content: string }>>([]);
  const recogRef         = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef   = useRef<Blob[]>([]);
  const userIdRef        = useRef<string | null>(null);
  const savedMute        = typeof window !== "undefined" && localStorage.getItem("vela_muted") === "true";
  const mutedRef         = useRef(savedMute);

  // ── UI state ──────────────────────────────────────────────────────────────
  const [messages,      setMessages]     = useState<Message[]>([]);
  const [input,         setInput]        = useState("");
  const [listening,     setListening]    = useState(false);
  const [transcribing,  setTranscribing] = useState(false);
  const [thinking,      setThinking]     = useState(false);
  const [muted,         setMuted]        = useState(savedMute);
  const [stepUI,        setStepUI]       = useState<ConvStep>("idle");
  const [showChips,     setShowChips]    = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  function setStep(s: ConvStep)          { stepRef.current = s; setStepUI(s); }
  function setPending(p: PendingHolding) { pendingRef.current = p; }

  // ── Load persisted chat history ───────────────────────────────────────────
  // Cache key is user-scoped (lib/userCache) so two accounts on the same device
  // don't read each other's conversation. Wait for auth.getUser to resolve
  // before reading — otherwise userKey() returns null on first paint.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await supabase.auth.getUser();
      } catch {}
      if (cancelled) return;
      const key = userKey(CHAT_CACHE_KEY);
      try {
        const saved = key ? localStorage.getItem(key) : null;
        if (saved) {
          const parsed: Message[] = JSON.parse(saved);
          if (parsed.length > 0) {
            setMessages(parsed);
            msgIdRef.current = Math.max(...parsed.map(m => m.id));
            greetedRef.current = true;
            setShowChips(false);
            return;
          }
        }
      } catch {}
      // No history — show greeting
      if (!greetedRef.current) {
        greetedRef.current = true;
        setTimeout(() => addMsg("vela", T[getLang()].greeting), 400);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Persist messages to localStorage on each change ──────────────────────
  useEffect(() => {
    if (messages.length === 0) return;
    const key = userKey(CHAT_CACHE_KEY);
    if (!key) return;
    try {
      const toSave = messages.slice(-MAX_SAVED_MSGS);
      localStorage.setItem(key, JSON.stringify(toSave));
    } catch {}
  }, [messages]);

  // ── Skip steps already answered ──────────────────────────────────────────
  function advanceToNextStep(p: PendingHolding) {
    const L  = langRef.current;
    const tx = T[L];
    if (!p.ticker) {
      setStep("ask_ticker");
      addMsg("vela", tx.askTicker);
    } else if (p.shares === undefined) {
      setStep("ask_shares");
      addMsg("vela", tx.foundTicker(p.name ?? p.ticker, p.ticker));
    } else if (p.cost === undefined) {
      setStep("ask_cost");
      addMsg("vela", tx.gotShares(p.shares));
    } else if (!p.date) {
      setStep("ask_date");
      addMsg("vela", tx.gotCost(p.cost));
    } else {
      setStep("confirm");
      addMsg("vela", tx.confirmSummary(p.name!, p.ticker, p.shares!, p.cost!, formatDateDisplay(p.date, L)));
    }
  }

  // ── TTS ───────────────────────────────────────────────────────────────────
  function speakText(text: string) {
    if (typeof window === "undefined" || mutedRef.current) return;
    window.speechSynthesis.cancel();
    const utt  = new SpeechSynthesisUtterance(text);
    utt.lang   = SPEECH_LOCALE[langRef.current];
    utt.rate   = 0.95;
    utt.pitch  = 1.05;
    window.speechSynthesis.speak(utt);
  }

  // ── Add message ───────────────────────────────────────────────────────────
  const addMsg = useCallback((role: "vela" | "user", text: string) => {
    msgIdRef.current += 1;
    const id = msgIdRef.current;
    setMessages(prev => [...prev, { id, role, text, time: nowTime() }]);
    if (role === "vela") speakText(text);
  }, []);

  // ── Auto-scroll ───────────────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking, transcribing]);

  // ── Ticker search ─────────────────────────────────────────────────────────
  async function searchTicker(query: string) {
    try {
      const res  = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      return data.length > 0 ? { symbol: data[0].symbol, name: data[0].name } : null;
    } catch { return null; }
  }

  // ── Ask Groq AI ───────────────────────────────────────────────────────────
  async function askAI(message: string): Promise<string> {
    try {
      const res  = await fetch("/api/chat", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          message,
          history: aiHistoryRef.current.slice(-10),
          lang:    langRef.current,
        }),
      });
      const data = await res.json();
      if (!res.ok) return `Error ${res.status}: ${data.reply ?? data.error ?? "Unknown"}`;
      return data.reply ?? T[langRef.current].transcriptEmpty;
    } catch {
      return T[langRef.current].aiError;
    }
  }

  // ── Core conversation handler ─────────────────────────────────────────────
  async function handleUserMessage(text: string) {
    if (!text.trim()) return;
    setShowChips(false);
    addMsg("user", text);
    const t    = text.trim().toLowerCase();
    const step = stepRef.current;
    const L    = langRef.current;
    const tx   = T[L];

    // CONFIRM
    if (step === "confirm") {
      const p = pendingRef.current;
      if (CONFIRM_YES_REGEX[L].test(t)) {
        setStep("saving");
        addMsg("vela", tx.saving);
        const { error } = await supabase.from("holdings").insert({
          ticker:         p.ticker!,
          name:           p.name!,
          shares:         p.shares!,
          cost_per_share: p.cost!,
          purchased_at:   p.date ?? null,
          signal:         "HOLD",
          ...(userIdRef.current ? { user_id: userIdRef.current } : {}),
        });
        if (error) {
          addMsg("vela", tx.saveError);
        } else {
          addMsg("vela", tx.saved(p.shares!, p.name!, p.ticker!));
          fetchPortfolioSummary(); // refresh summary after adding
        }
        setStep("idle");
        setPending({});
        return;
      }
      if (CONFIRM_NO_REGEX[L].test(t)) {
        addMsg("vela", tx.startOver);
        setStep("idle");
        setPending({});
        return;
      }
      addMsg("vela", tx.confirmRepeat(p.shares!, p.name!, p.cost!));
      return;
    }

    // ASK_TICKER
    if (step === "ask_ticker") {
      addMsg("vela", tx.lookingUp);
      const result = await searchTicker(text);
      if (result) {
        const p = { ...pendingRef.current, ticker: result.symbol, name: result.name };
        setPending(p);
        advanceToNextStep(p);
      } else {
        addMsg("vela", tx.tickerNotFound(text));
      }
      return;
    }

    // ASK_SHARES
    if (step === "ask_shares") {
      const n = parseNumber(text);
      if (n && n > 0) {
        const p = { ...pendingRef.current, shares: n };
        setPending(p);
        advanceToNextStep(p);
      } else {
        addMsg("vela", tx.askShares);
      }
      return;
    }

    // ASK_COST
    if (step === "ask_cost") {
      const n = parseNumber(text);
      if (n && n > 0) {
        const p = { ...pendingRef.current, cost: n };
        setPending(p);
        advanceToNextStep(p);
      } else {
        addMsg("vela", tx.askCost);
      }
      return;
    }

    // ASK_DATE
    if (step === "ask_date") {
      const date    = parseDate(text);
      const updated = { ...pendingRef.current, date };
      setPending(updated);
      setStep("confirm");
      addMsg("vela", tx.confirmSummary(
        updated.name!, updated.ticker!, updated.shares!, updated.cost!,
        formatDateDisplay(date, L),
      ));
      return;
    }

    // IDLE — check add intent (only explicit purchase recording, NOT advice questions)
    if (ADD_INTENT_REGEX[L].test(t)) {
      const pre = extractPartialHolding(text);
      setPending(pre);
      advanceToNextStep(pre);
      return;
    }

    // Everything else → Groq AI
    setThinking(true);
    const reply = await askAI(text);
    setThinking(false);

    if (reply.trim() === "ADD_HOLDING_FLOW" || reply.includes("ADD_HOLDING_FLOW")) {
      const pre = extractPartialHolding(text);
      setPending(pre);
      advanceToNextStep(pre);
      return;
    }

    addMsg("vela", reply);
    aiHistoryRef.current = [
      ...aiHistoryRef.current,
      { role: "user",      content: text  },
      { role: "assistant", content: reply },
    ];
  }

  function handleSend() {
    const text = input.trim();
    if (!text) return;
    setInput("");
    handleUserMessage(text);
  }

  function clearHistory() {
    const key = userKey(CHAT_CACHE_KEY);
    try { if (key) localStorage.removeItem(key); } catch {}
    setMessages([]);
    aiHistoryRef.current = [];
    setStep("idle");
    setPending({});
    msgIdRef.current = 0;
    greetedRef.current = false;
    setShowChips(true);
    setTimeout(() => { addMsg("vela", T[getLang()].greeting); greetedRef.current = true; }, 300);
  }

  // ── Voice: Web Speech ─────────────────────────────────────────────────────
  const transcriptRef = useRef("");
  function startWebSpeech() {
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) { addMsg("vela", tx.micError("not-supported")); return; }
    transcriptRef.current = "";
    const recog = new SR();
    recog.lang = VOICE_LOCALE[langRef.current];
    recog.continuous = false;
    recog.interimResults = true;
    recogRef.current = recog;
    recog.onstart  = () => setListening(true);
    recog.onresult = (e: any) => {
      const text = Array.from(e.results as any[]).map((r: any) => r[0].transcript).join(" ");
      transcriptRef.current = text;
      setInput(text);
    };
    recog.onend = () => {
      setListening(false);
      const final = transcriptRef.current.trim();
      if (final) { setInput(""); handleUserMessage(final); }
      transcriptRef.current = "";
    };
    recog.onerror = (e: any) => {
      setListening(false);
      transcriptRef.current = "";
      if (e.error === "not-allowed")                              addMsg("vela", tx.micDenied);
      else if (e.error === "network")                             addMsg("vela", tx.micNetwork);
      else if (e.error !== "no-speech" && e.error !== "aborted") addMsg("vela", tx.micError(e.error));
    };
    recog.start();
  }

  // ── Voice: MediaRecorder → Groq Whisper ──────────────────────────────────
  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"]
        .find(t => MediaRecorder.isTypeSupported(t)) ?? "";
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current   = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        setListening(false);
        const chunks = audioChunksRef.current;
        if (chunks.length === 0) { addMsg("vela", T[langRef.current].noAudio); return; }
        setTranscribing(true);
        const blob     = new Blob(chunks, { type: mimeType || "audio/webm" });
        const formData = new FormData();
        formData.append("audio",    blob, "audio.webm");
        formData.append("language", langRef.current);
        try {
          const res  = await fetch("/api/transcribe", { method: "POST", body: formData });
          const data = await res.json();
          setTranscribing(false);
          if (data.text?.trim()) handleUserMessage(data.text.trim());
          else addMsg("vela", T[langRef.current].transcriptEmpty);
        } catch (e: any) {
          setTranscribing(false);
          addMsg("vela", T[langRef.current].transcriptError(e?.message ?? "unknown"));
        }
      };
      recorder.start(250);
      setListening(true);
    } catch (e: any) {
      if (e?.name === "NotAllowedError") addMsg("vela", T[langRef.current].micDenied);
      else startWebSpeech();
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    } else {
      recogRef.current?.stop();
    }
  }
  function toggleMic() {
    if (listening) { stopRecording(); return; }
    if (typeof MediaRecorder !== "undefined") startRecording();
    else startWebSpeech();
  }
  function toggleMute() {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    localStorage.setItem("vela_muted", String(next));
    if (next) window.speechSynthesis.cancel();
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const chips = CHIPS[lang];

  return (
    <div className="flex flex-col h-screen" style={{ backgroundColor: "#0A1628" }}>

      {/* ── Header ── */}
      <div
        className="px-4 pt-10 pb-0"
        style={{
          background: "linear-gradient(180deg, #0A1628 0%, #0F2340 100%)",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        {/* Nav row */}
        <div className="flex items-center gap-3 pb-3">
          <button
            onClick={() => { window.speechSynthesis.cancel(); router.back(); }}
            className="w-8 h-8 flex items-center justify-center rounded-full flex-shrink-0 text-white text-sm font-bold"
            style={{ backgroundColor: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)" }}>
            ←
          </button>

          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-lg flex-shrink-0"
            style={{ background: "linear-gradient(135deg, #0EA5E9, #0284C7)" }}>
            ⛵
          </div>

          <div className="flex-1 min-w-0">
            <h1 className="text-white font-bold text-base leading-tight">Ask Vela</h1>
            <p className="text-xs" style={{ color: "#7DD3FC" }}>{tx.headerSubtitle}</p>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={clearHistory}
              className="px-2.5 py-1.5 rounded-full text-xs font-medium"
              style={{ backgroundColor: "rgba(255,255,255,0.08)", color: "#94A3B8", border: "1px solid rgba(255,255,255,0.1)" }}>
              🗑
            </button>
            <button
              onClick={toggleMute}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium"
              style={{
                backgroundColor: muted ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.08)",
                color:           muted ? "#FCA5A5"              : "#7DD3FC",
                border:          `1px solid ${muted ? "rgba(239,68,68,0.3)" : "rgba(255,255,255,0.1)"}`,
              }}>
              {muted ? tx.muted : tx.voiceOn}
            </button>
          </div>
        </div>

        {/* Portfolio summary strip */}
        {portfolioSummary && (
          <div
            className="mx-0 mb-3 px-4 py-2.5 rounded-2xl flex items-center justify-between"
            style={{ background: "rgba(14,165,233,0.12)", border: "1px solid rgba(14,165,233,0.25)" }}>
            <div>
              <p className="text-xs font-medium" style={{ color: "#7DD3FC" }}>Portfolio</p>
              <p className="text-base font-bold text-white">
                {portfolioSummary.currency}{fmt(portfolioSummary.totalValue)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs" style={{ color: "#7DD3FC" }}>Total P&L</p>
              <p
                className="text-sm font-bold"
                style={{ color: portfolioSummary.totalPnl >= 0 ? "#4ADE80" : "#F87171" }}>
                {portfolioSummary.totalPnl >= 0 ? "+" : ""}
                {portfolioSummary.currency}{fmt(Math.abs(portfolioSummary.totalPnl))}
                {" "}
                <span className="text-xs font-medium opacity-80">
                  ({portfolioSummary.totalPnlPct >= 0 ? "+" : ""}{portfolioSummary.totalPnlPct.toFixed(1)}%)
                </span>
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Messages ── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.map(msg => (
          <div key={msg.id} className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
            {msg.role === "vela" && (
              <div
                className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-sm mt-1"
                style={{ background: "linear-gradient(135deg, #0EA5E9, #0284C7)" }}>
                ⛵
              </div>
            )}
            <div
              className="max-w-[80%] rounded-2xl px-4 py-3"
              style={msg.role === "user" ? {
                background: "linear-gradient(135deg, #0EA5E9, #0284C7)",
                color: "white",
                borderBottomRightRadius: 4,
              } : {
                background: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(255,255,255,0.12)",
                color: "#E2E8F0",
                borderBottomLeftRadius: 4,
              }}>
              <p className="text-sm leading-relaxed whitespace-pre-line">{msg.text}</p>
              <p className="text-xs mt-1 opacity-40 text-right">{msg.time}</p>
            </div>
          </div>
        ))}

        {/* Thinking indicator */}
        {(thinking || transcribing) && (
          <div className="flex gap-2 flex-row">
            <div
              className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-sm mt-1"
              style={{ background: "linear-gradient(135deg, #0EA5E9, #0284C7)" }}>
              ⛵
            </div>
            <div
              className="rounded-2xl px-4 py-3"
              style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", borderBottomLeftRadius: 4 }}>
              <p className="text-xs mb-1.5" style={{ color: "#7DD3FC" }}>
                {transcribing ? tx.processingAudioLabel : tx.thinkingLabel}
              </p>
              <div className="flex gap-1">
                {[0, 1, 2].map(i => (
                  <div
                    key={i}
                    className="w-2 h-2 rounded-full animate-bounce"
                    style={{ backgroundColor: "#0EA5E9", animationDelay: `${i * 0.15}s`, animationDuration: "0.8s" }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Quick chips (shown before first user message) ── */}
      {showChips && messages.length <= 1 && (
        <div className="px-4 pb-3 flex flex-wrap gap-2">
          {chips.map(chip => (
            <button
              key={chip.label}
              onClick={() => handleUserMessage(chip.msg)}
              className="px-3.5 py-2 rounded-full text-xs font-medium transition-all active:scale-95"
              style={{
                background: "rgba(14,165,233,0.15)",
                color: "#7DD3FC",
                border: "1px solid rgba(14,165,233,0.3)",
              }}>
              {chip.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Confirm quick-reply buttons ── */}
      {stepUI === "confirm" && (
        <div className="px-4 pb-2 flex gap-2">
          <button
            onClick={() => handleUserMessage(lang === "it" ? "Sì, aggiungi" : "Yes, add it")}
            className="flex-1 py-2.5 rounded-full text-sm font-semibold text-white"
            style={{ background: "linear-gradient(135deg, #0EA5E9, #0284C7)" }}>
            {tx.confirmYes}
          </button>
          <button
            onClick={() => handleUserMessage(lang === "it" ? "No, annulla" : "No, cancel")}
            className="flex-1 py-2.5 rounded-full text-sm font-medium"
            style={{ background: "rgba(255,255,255,0.08)", color: "#94A3B8", border: "1px solid rgba(255,255,255,0.12)" }}>
            {tx.confirmNo}
          </button>
        </div>
      )}

      {/* ── Input bar ── */}
      <div
        className="px-4 pb-8 pt-3"
        style={{ background: "rgba(10,22,40,0.95)", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleMic}
            disabled={transcribing || thinking}
            className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 transition-all active:scale-95"
            style={{
              background:  listening ? "#EF4444" : "rgba(255,255,255,0.08)",
              border:      `1.5px solid ${listening ? "#EF4444" : "rgba(255,255,255,0.15)"}`,
              opacity: (transcribing || thinking) ? 0.4 : 1,
            }}>
            {listening
              ? <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: "white" }} />
              : <span className="text-base">🎙️</span>}
          </button>

          <input
            className="flex-1 rounded-full px-4 py-2.5 text-sm outline-none"
            style={{
              background: "rgba(255,255,255,0.07)",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "#E2E8F0",
            }}
            placeholder={
              listening     ? tx.listeningPlaceholder  :
              transcribing  ? tx.processingPlaceholder :
                              tx.inputPlaceholder
            }
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleSend(); }}
            disabled={listening || transcribing || thinking}
          />

          <button
            onClick={handleSend}
            disabled={!input.trim() || listening || transcribing || thinking}
            className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 text-white font-bold transition-all active:scale-95"
            style={{
              background: "linear-gradient(135deg, #0EA5E9, #0284C7)",
              opacity: (input.trim() && !listening && !transcribing && !thinking) ? 1 : 0.3,
            }}>
            ↑
          </button>
        </div>

        {listening && (
          <p className="text-center text-xs mt-2 animate-pulse" style={{ color: "#EF4444" }}>
            {tx.listeningHint}
          </p>
        )}
        {transcribing && (
          <p className="text-center text-xs mt-2 animate-pulse" style={{ color: "#0EA5E9" }}>
            {tx.processingHint}
          </p>
        )}
      </div>
    </div>
  );
}
