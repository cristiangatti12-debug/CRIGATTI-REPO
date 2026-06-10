"use client";
import { useState, useEffect, useRef } from "react";
import type { CommunityAnalysis, Sentiment } from "@/types";
import type { Lang } from "@/lib/i18n";

interface Props {
  ticker:     string;
  tickerName: string;
  onClose:    () => void;
  t:          (en: string, it: string) => string;
  appLang:    Lang;
}

function sentimentColor(s: Sentiment) {
  return s === "bullish" ? "#16A34A" : s === "bearish" ? "#DC2626" : "#CA8A04";
}

export default function TickerDetailDrawer({ ticker, tickerName, onClose, t, appLang }: Props) {
  const [price,     setPrice]     = useState<number | null>(null);
  const [changePct, setChangePct] = useState<number | null>(null);
  const [currency,  setCurrency]  = useState("USD");
  const [score,     setScore]     = useState<number | null>(null);
  const [signal,    setSignal]    = useState<"BUY" | "HOLD" | "SELL" | null>(null);
  const [reasoning, setReasoning] = useState<string | null>(null);
  const [analyses,  setAnalyses]  = useState<CommunityAnalysis[]>([]);
  const [loading,   setLoading]   = useState(true);

  const [dragY, setDragY] = useState(0);
  const dragStart = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    Promise.all([
      fetch(`/api/prices?symbols=${ticker}`).then(r => r.json()).catch(() => []),
      fetch(`/api/signals?tickers=${ticker}&costs=0&lang=${appLang}`).then(r => r.json()).catch(() => []),
      fetch(`/api/community-analyses?ticker=${ticker}`).then(r => r.json()).catch(() => []),
    ]).then(([prices, signals, community]) => {
      if (cancelled) return;
      const q = Array.isArray(prices)  ? prices[0]  : null;
      const s = Array.isArray(signals) ? signals[0] : null;
      if (q) { setPrice(q.price); setChangePct(q.changePct); setCurrency(q.currency ?? "USD"); }
      if (s) { setScore(s.score); setSignal(s.signal); setReasoning(s.reasoning); }
      if (Array.isArray(community)) setAnalyses(community);
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [ticker, appLang]);

  const currSymbol  = currency === "EUR" ? "€" : "$";
  const signalBg    = signal === "BUY" ? "#DCFCE7" : signal === "SELL" ? "#FEE2E2" : "#FEF9C3";
  const signalColor = signal === "BUY" ? "#16A34A" : signal === "SELL" ? "#DC2626" : "#CA8A04";
  const displayTicker = ticker.replace(/\.[A-Z]+$/, "");

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-lg rounded-t-3xl shadow-2xl overflow-y-auto"
        style={{
          backgroundColor: "#0F1F35",
          border:          "1px solid rgba(255,255,255,0.12)",
          maxHeight:       "85vh",
          transform:       `translateY(${dragY}px)`,
          transition:      dragStart.current !== null ? "none" : "transform 0.3s ease",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div
          className="pt-4 pb-2 touch-none"
          onTouchStart={e => { dragStart.current = e.touches[0].clientY; setDragY(0); }}
          onTouchMove={e => {
            if (dragStart.current === null) return;
            const delta = e.touches[0].clientY - dragStart.current;
            if (delta > 0) setDragY(delta);
          }}
          onTouchEnd={() => {
            if (dragY > 80) { onClose(); setDragY(0); } else setDragY(0);
            dragStart.current = null;
          }}
        >
          <div className="w-10 h-1 rounded-full mx-auto" style={{ backgroundColor: "rgba(255,255,255,0.2)" }} />
        </div>

        <div className="px-5 pb-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="font-mono font-bold text-xl text-white">{displayTicker}</p>
              {tickerName && <p className="text-xs mt-0.5" style={{ color: "#64748B" }}>{tickerName}</p>}
            </div>
            <button onClick={onClose} className="text-lg" style={{ color: "#64748B" }}>✕</button>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="rounded-2xl h-16 animate-pulse"
                  style={{ backgroundColor: "rgba(255,255,255,0.06)" }} />
              ))}
            </div>
          ) : (
            <>
              {/* Price + signal row */}
              <div className="rounded-2xl px-4 py-3 mb-5 flex items-center justify-between"
                style={{ backgroundColor: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.10)" }}>
                <div>
                  <p className="text-xs mb-0.5" style={{ color: "#64748B" }}>{t("Current Price", "Prezzo Attuale")}</p>
                  {price !== null ? (
                    <p className="text-xl font-bold text-white">
                      {currSymbol}{price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  ) : (
                    <p className="text-sm" style={{ color: "#475569" }}>—</p>
                  )}
                  {changePct !== null && (
                    <p className="text-xs font-semibold mt-0.5"
                      style={{ color: changePct >= 0 ? "#4ADE80" : "#F87171" }}>
                      {changePct >= 0 ? "+" : ""}{changePct.toFixed(2)}% {t("today", "oggi")}
                    </p>
                  )}
                </div>
                {signal && (
                  <div className="text-right">
                    <span className="text-sm font-bold px-3 py-1 rounded-full"
                      style={{ backgroundColor: signalBg, color: signalColor }}>
                      {signal} {score !== null ? `${score}/100` : ""}
                    </span>
                    {reasoning && (
                      <p className="text-xs italic mt-1.5 max-w-[180px] leading-relaxed"
                        style={{ color: "#64748B" }}>
                        &ldquo;{reasoning}&rdquo;
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Community analyses for this ticker */}
              <div>
                <p className="text-xs font-semibold mb-3" style={{ color: "#94A3B8" }}>
                  💬 {t("Community Analyses", "Analisi della Community")}
                  {analyses.length > 0 && (
                    <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-xs"
                      style={{ backgroundColor: "rgba(14,165,233,0.15)", color: "#38BDF8" }}>
                      {analyses.length}
                    </span>
                  )}
                </p>

                {analyses.length === 0 ? (
                  <p className="text-xs text-center py-4" style={{ color: "#475569" }}>
                    {t("No community analyses for this ticker yet.", "Nessuna analisi della community per questo ticker.")}
                  </p>
                ) : (
                  <div className="space-y-3">
                    {analyses.map(a => {
                      const sc = sentimentColor(a.sentiment as Sentiment);
                      const horizonLabel =
                        a.horizon === "short" ? t("⚡ Short", "⚡ Breve") :
                        a.horizon === "mid"   ? t("📅 Mid",   "📅 Medio") :
                                               t("🌱 Long",  "🌱 Lungo");
                      const convLabel =
                        a.conviction === "low"    ? t("Low",    "Bassa") :
                        a.conviction === "medium" ? t("Medium", "Media") :
                                                    t("High",   "Alta");
                      const dateStr = new Date(a.created_at).toLocaleDateString(
                        appLang === "it" ? "it-IT" : "en-GB",
                        { day: "2-digit", month: "short" }
                      );
                      return (
                        <div key={a.id} className="rounded-2xl px-4 py-3 space-y-2"
                          style={{
                            backgroundColor: "rgba(255,255,255,0.06)",
                            border: `1px solid ${a.sentiment === "bullish" ? "rgba(74,222,128,0.18)" : a.sentiment === "bearish" ? "rgba(248,113,113,0.18)" : "rgba(255,255,255,0.10)"}`,
                          }}>
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex gap-1.5 flex-wrap">
                              <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                                style={{ backgroundColor: `${sc}22`, color: sc }}>
                                {a.sentiment === "bullish" ? t("🐂 Bullish", "🐂 Rialzista") :
                                 a.sentiment === "bearish" ? t("🐻 Bearish", "🐻 Ribassista") :
                                                             t("⚖️ Neutral", "⚖️ Neutrale")}
                              </span>
                              <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                                style={{ backgroundColor: "rgba(14,165,233,0.12)", color: "#38BDF8" }}>
                                {horizonLabel}
                              </span>
                              <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                                style={{ backgroundColor: "rgba(99,102,241,0.12)", color: "#A5B4FC" }}>
                                {t("Conv:", "Conv:")} {convLabel}
                              </span>
                            </div>
                            <span className="text-xs flex-shrink-0" style={{ color: "#475569" }}>
                              {a.display_name} · {dateStr}
                            </span>
                          </div>
                          <p className="text-xs leading-relaxed" style={{ color: "#CBD5E1" }}>{a.bull_case}</p>
                          <p className="text-xs leading-relaxed" style={{ color: "#94A3B8" }}>
                            <span style={{ color: "#F87171" }}>{t("Risk: ", "Rischio: ")}</span>{a.risk}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
