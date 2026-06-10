"use client";
import { useRef, useState } from "react";
import type { CommunityAnalysis, Sentiment } from "@/types";

interface Props {
  displayName:   string;
  analyses:      CommunityAnalysis[];
  onTickerClick: (ticker: string, name: string) => void;
  onClose:       () => void;
  t:             (en: string, it: string) => string;
}

function sentimentColor(s: Sentiment) {
  return s === "bullish" ? "#16A34A" : s === "bearish" ? "#DC2626" : "#CA8A04";
}
function sentimentLabel(s: Sentiment, t: (en: string, it: string) => string) {
  return s === "bullish" ? t("🐂 Bullish", "🐂 Rialzista") :
         s === "bearish" ? t("🐻 Bearish", "🐻 Ribassista") :
                           t("⚖️ Neutral", "⚖️ Neutrale");
}

export default function UserProfileDrawer({ displayName, analyses, onTickerClick, onClose, t }: Props) {
  const [dragY, setDragY] = useState(0);
  const dragStart = useRef<number | null>(null);

  // Stats
  const total = analyses.length;
  const sentimentCounts: Record<string, number> = {};
  const tickerCounts:    Record<string, number> = {};
  for (const a of analyses) {
    sentimentCounts[a.sentiment] = (sentimentCounts[a.sentiment] ?? 0) + 1;
    tickerCounts[a.ticker]       = (tickerCounts[a.ticker]       ?? 0) + 1;
  }
  const favSentiment = Object.entries(sentimentCounts).sort((a, b) => b[1] - a[1])[0]?.[0] as Sentiment | undefined;
  const topTicker    = Object.entries(tickerCounts).sort((a, b) => b[1] - a[1])[0]?.[0];

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
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white"
                style={{ background: "linear-gradient(135deg, #0EA5E9, #6366F1)" }}>
                {displayName[0]?.toUpperCase() ?? "?"}
              </div>
              <div>
                <p className="font-bold text-white">{displayName}</p>
                <p className="text-xs" style={{ color: "#64748B" }}>
                  {total} {t("analys", "analis")}{total === 1 ? t("is", "i") : t("es", "i")} {t("published", "pubblicate")}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="text-lg" style={{ color: "#64748B" }}>✕</button>
          </div>

          {/* Stats row */}
          {total > 0 && (
            <div className="flex gap-3 mb-5">
              {favSentiment && (
                <div className="flex-1 rounded-xl px-3 py-2.5"
                  style={{ backgroundColor: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}>
                  <p className="text-xs mb-0.5" style={{ color: "#64748B" }}>{t("Top stance", "Posizione top")}</p>
                  <p className="text-xs font-semibold" style={{ color: sentimentColor(favSentiment) }}>
                    {sentimentLabel(favSentiment, t)}
                  </p>
                </div>
              )}
              {topTicker && (
                <div className="flex-1 rounded-xl px-3 py-2.5"
                  style={{ backgroundColor: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}>
                  <p className="text-xs mb-0.5" style={{ color: "#64748B" }}>{t("Most analysed", "Più analizzato")}</p>
                  <p className="text-xs font-bold text-white font-mono">{topTicker}</p>
                </div>
              )}
            </div>
          )}

          {/* Analyses list */}
          {total === 0 ? (
            <p className="text-sm text-center py-8" style={{ color: "#475569" }}>
              {t("No analyses yet", "Nessuna analisi ancora")}
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-xs font-semibold mb-2" style={{ color: "#64748B" }}>
                {t("Analyses", "Analisi")}
              </p>
              {analyses.map(a => {
                const sc = sentimentColor(a.sentiment as Sentiment);
                const horizonLabel =
                  a.horizon === "short" ? t("⚡ Short", "⚡ Breve") :
                  a.horizon === "mid"   ? t("📅 Mid",   "📅 Medio") :
                                         t("🌱 Long",  "🌱 Lungo");
                return (
                  <div key={a.id} className="rounded-2xl px-4 py-3 space-y-2"
                    style={{
                      backgroundColor: "rgba(255,255,255,0.06)",
                      border: `1px solid ${a.sentiment === "bullish" ? "rgba(74,222,128,0.18)" : a.sentiment === "bearish" ? "rgba(248,113,113,0.18)" : "rgba(255,255,255,0.10)"}`,
                    }}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => { onClose(); onTickerClick(a.ticker, a.ticker_name); }}
                        className="font-mono font-bold text-sm transition-opacity hover:opacity-70"
                        style={{ color: "#38BDF8" }}>
                        {a.ticker}
                      </button>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: `${sc}22`, color: sc }}>
                        {sentimentLabel(a.sentiment as Sentiment, t)}
                      </span>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: "rgba(14,165,233,0.12)", color: "#38BDF8" }}>
                        {horizonLabel}
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
      </div>
    </div>
  );
}
