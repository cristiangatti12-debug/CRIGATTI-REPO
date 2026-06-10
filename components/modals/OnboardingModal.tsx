"use client";

import { useState } from "react";

interface Props {
  lang:     "en" | "it";
  onAddHolding: () => void;
  onSkip:       () => void;
}

const SLIDES = {
  en: [
    {
      emoji: "👋",
      title: "Welcome to Vela",
      subtitle: "Your personal AI investment assistant",
      features: [
        { icon: "📊", label: "Portfolio",  desc: "Track all your stocks & ETFs in one place with live prices and P&L" },
        { icon: "📰", label: "News",       desc: "Personalised news for your holdings and the broader market, updated every 5 min" },
        { icon: "🤖", label: "AI Signals", desc: "Momentum scores, analyst consensus and AI reasoning for every holding" },
        { icon: "🌐", label: "Market",     desc: "Daily buy/sell opportunities screened from 80 blue-chip stocks worldwide" },
      ],
    },
    {
      emoji: "🚀",
      title: "Add your first holding",
      subtitle: "Start by logging a stock or ETF you already own",
    },
  ],
  it: [
    {
      emoji: "👋",
      title: "Benvenuto su Vela",
      subtitle: "Il tuo assistente AI per gli investimenti",
      features: [
        { icon: "📊", label: "Portafoglio", desc: "Monitora azioni ed ETF in un unico posto con prezzi in tempo reale e guadagni/perdite" },
        { icon: "📰", label: "Notizie",     desc: "News personalizzate sui tuoi titoli e sul mercato, aggiornate ogni 5 minuti" },
        { icon: "🤖", label: "Segnali AI", desc: "Score momentum, consensus analisti e ragionamento AI per ogni posizione" },
        { icon: "🌐", label: "Mercato",    desc: "Opportunità giornaliere selezionate da 80 blue-chip mondiali" },
      ],
    },
    {
      emoji: "🚀",
      title: "Aggiungi il primo titolo",
      subtitle: "Inizia inserendo un'azione o un ETF che possiedi già",
    },
  ],
};

export default function OnboardingModal({ lang, onAddHolding, onSkip }: Props) {
  const [slide, setSlide] = useState(0);
  const slides = SLIDES[lang];
  const current = slides[slide];
  const isLast  = slide === slides.length - 1;

  return (
    /* Backdrop */
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}>

      {/* Sheet */}
      <div className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl"
        style={{ backgroundColor: "white" }}>

        {/* Progress dots */}
        <div className="flex justify-center gap-2 pt-5 pb-1">
          {slides.map((_, i) => (
            <div key={i}
              className="rounded-full transition-all duration-300"
              style={{
                width:  i === slide ? 20 : 8,
                height: 8,
                backgroundColor: i === slide ? "#0EA5E9" : "#E0F2FE",
              }} />
          ))}
        </div>

        <div className="px-7 pt-4 pb-8">
          {/* Slide 1 — feature overview */}
          {slide === 0 && (
            <>
              <div className="text-center mb-6">
                <div className="text-5xl mb-3">{current.emoji}</div>
                <h2 className="text-xl font-bold mb-1" style={{ color: "#1E3A5F" }}>
                  {current.title}
                </h2>
                <p className="text-sm" style={{ color: "#64748B" }}>{current.subtitle}</p>
              </div>

              <div className="space-y-3 mb-8">
                {"features" in current && current.features?.map(f => (
                  <div key={f.label} className="flex items-start gap-3 rounded-2xl px-4 py-3"
                    style={{ backgroundColor: "#F0F9FF" }}>
                    <span className="text-xl flex-shrink-0">{f.icon}</span>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: "#1E3A5F" }}>{f.label}</p>
                      <p className="text-xs leading-relaxed" style={{ color: "#64748B" }}>{f.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={() => setSlide(1)}
                className="w-full py-3.5 rounded-2xl font-semibold text-sm text-white transition-opacity hover:opacity-90"
                style={{ background: "linear-gradient(135deg, #0EA5E9, #6366F1)" }}>
                {lang === "it" ? "Avanti →" : "Next →"}
              </button>
            </>
          )}

          {/* Slide 2 — add first holding CTA */}
          {isLast && (
            <div className="text-center">
              <div className="text-6xl mb-4 mt-2">{current.emoji}</div>
              <h2 className="text-xl font-bold mb-2" style={{ color: "#1E3A5F" }}>
                {current.title}
              </h2>
              <p className="text-sm mb-8" style={{ color: "#64748B" }}>
                {current.subtitle}
              </p>

              {/* Illustration strip */}
              <div className="flex justify-center gap-4 mb-8">
                {["AAPL", "NVDA", "MSFT"].map(t => (
                  <div key={t} className="w-14 h-14 rounded-2xl flex items-center justify-center text-xs font-bold text-white shadow-sm"
                    style={{ background: "linear-gradient(135deg, #0EA5E9, #6366F1)" }}>
                    {t.slice(0, 2)}
                  </div>
                ))}
              </div>

              {/* Primary CTA */}
              <button
                onClick={onAddHolding}
                className="w-full py-4 rounded-2xl font-bold text-base text-white mb-3 shadow-lg transition-opacity hover:opacity-90 active:scale-[0.98]"
                style={{ background: "linear-gradient(135deg, #0EA5E9, #6366F1)" }}>
                {lang === "it" ? "+ Aggiungi il primo titolo" : "+ Add your first holding"}
              </button>

              {/* Skip */}
              <button
                onClick={onSkip}
                className="w-full py-2 text-sm transition-colors"
                style={{ color: "#94A3B8" }}>
                {lang === "it" ? "Salta per ora" : "Skip for now"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
