"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import AllocationScreen from "../portfolio/AllocationScreen";

// ── Types ─────────────────────────────────────────────────────────────────────
export interface RiskResult {
  score:   number;
  profile: "Conservative" | "Balanced" | "Growth" | "Aggressive";
  stocks:  number;  // % suggested
  bonds:   number;
  cash:    number;
}

const RISK_CACHE_KEY = "vela_risk_v1";

export function loadRiskResult(): RiskResult | null {
  try {
    const raw = localStorage.getItem(RISK_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as RiskResult;
  } catch { return null; }
}

// ── Questions ─────────────────────────────────────────────────────────────────
interface Question {
  id:      number;
  en:      string;
  it:      string;
  options: { en: string; it: string; score: number }[];
}

const QUESTIONS: Question[] = [
  {
    id: 1,
    en: "How old are you?",
    it: "Quanti anni hai?",
    options: [
      { en: "Under 30",  it: "Meno di 30", score: 5 },
      { en: "30 – 45",   it: "30 – 45",    score: 4 },
      { en: "45 – 60",   it: "45 – 60",    score: 2 },
      { en: "Over 60",   it: "Più di 60",  score: 1 },
    ],
  },
  {
    id: 2,
    en: "When will you need this money?",
    it: "Quando avrai bisogno di questi soldi?",
    options: [
      { en: "10+ years",     it: "Più di 10 anni",    score: 5 },
      { en: "5 – 10 years",  it: "5 – 10 anni",       score: 4 },
      { en: "2 – 5 years",   it: "2 – 5 anni",        score: 2 },
      { en: "Under 2 years", it: "Meno di 2 anni",    score: 1 },
    ],
  },
  {
    id: 3,
    en: "If your portfolio dropped 20%, you would…",
    it: "Se il tuo portafoglio scendesse del 20%, tu…",
    options: [
      { en: "Buy more",     it: "Comprerei di più",          score: 5 },
      { en: "Hold",         it: "Manterrei le posizioni",     score: 4 },
      { en: "Sell some",    it: "Venderei una parte",         score: 2 },
      { en: "Sell all",     it: "Venderei tutto",             score: 1 },
    ],
  },
  {
    id: 4,
    en: "Your income is…",
    it: "Il tuo reddito è…",
    options: [
      { en: "Very stable",  it: "Molto stabile",   score: 4 },
      { en: "Stable",       it: "Stabile",          score: 3 },
      { en: "Variable",     it: "Variabile",        score: 2 },
      { en: "Uncertain",    it: "Incerto",          score: 1 },
    ],
  },
  {
    id: 5,
    en: "Your main investment goal is…",
    it: "Il tuo obiettivo principale è…",
    options: [
      { en: "Maximum growth",    it: "Crescita massima",   score: 5 },
      { en: "Strong growth",     it: "Crescita forte",     score: 4 },
      { en: "Steady growth",     it: "Crescita graduale",  score: 2 },
      { en: "Preserve wealth",   it: "Preservare il capitale", score: 1 },
    ],
  },
];

// ── Profile definitions ────────────────────────────────────────────────────────
function scoreToProfile(score: number): RiskResult {
  if (score <= 9)  return { score, profile: "Conservative", stocks: 30,  bonds: 50, cash: 20 };
  if (score <= 14) return { score, profile: "Balanced",     stocks: 50,  bonds: 35, cash: 15 };
  if (score <= 19) return { score, profile: "Growth",       stocks: 70,  bonds: 20, cash: 10 };
  return              { score, profile: "Aggressive",    stocks: 90,  bonds:  5, cash:  5 };
}

const PROFILE_META: Record<RiskResult["profile"], { emoji: string; color: string; bg: string; border: string }> = {
  Conservative: { emoji: "🛡️", color: "#0369A1", bg: "#E0F2FE", border: "#BAE6FD" },
  Balanced:     { emoji: "⚖️", color: "#CA8A04", bg: "#FEF9C3", border: "#FDE68A" },
  Growth:       { emoji: "📈", color: "#16A34A", bg: "#DCFCE7", border: "#BBF7D0" },
  Aggressive:   { emoji: "🚀", color: "#DC2626", bg: "#FEE2E2", border: "#FECACA" },
};

const PROFILE_LABEL: Record<RiskResult["profile"], { en: string; it: string }> = {
  Conservative: { en: "Conservative",  it: "Conservativo"  },
  Balanced:     { en: "Balanced",      it: "Bilanciato"    },
  Growth:       { en: "Growth",        it: "Crescita"      },
  Aggressive:   { en: "Aggressive",    it: "Aggressivo"    },
};

// ── Allocation bar ────────────────────────────────────────────────────────────
function AllocationBar({ stocks, bonds, cash }: { stocks: number; bonds: number; cash: number }) {
  return (
    <div className="mt-3">
      {/* Bar */}
      <div className="flex rounded-full overflow-hidden h-3 mb-2">
        <div style={{ width: `${stocks}%`, backgroundColor: "#0EA5E9" }} />
        <div style={{ width: `${bonds}%`,  backgroundColor: "#6366F1" }} />
        <div style={{ width: `${cash}%`,   backgroundColor: "#94A3B8" }} />
      </div>
      {/* Legend */}
      <div className="flex gap-4 justify-center flex-wrap">
        {[
          { label: "Stocks", pct: stocks, color: "#0EA5E9" },
          { label: "Bonds",  pct: bonds,  color: "#6366F1" },
          { label: "Cash",   pct: cash,   color: "#94A3B8" },
        ].map(item => (
          <div key={item.label} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
            <span className="text-xs" style={{ color: "#64748B" }}>
              {item.label} <strong style={{ color: "#1E3A5F" }}>{item.pct}%</strong>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface HoldingSlim {
  ticker: string; name: string; shares: number; cost_per_share: number; currency?: string;
}

// ── Main component ─────────────────────────────────────────────────────────────
interface Props {
  lang:     "en" | "it";
  onClose:  () => void;
  onSave:   (result: RiskResult) => void;
  holdings?: HoldingSlim[];
}

export default function RiskModal({ lang, onClose, onSave, holdings = [] }: Props) {
  const t = (en: string, it: string) => lang === "it" ? it : en;

  const [step,           setStep]           = useState<"intro" | "quiz" | "result">("intro");
  const [current,        setCurrent]        = useState(0);
  const [answers,        setAnswers]        = useState<number[]>([]);
  const [result,         setResult]         = useState<RiskResult | null>(null);
  const [saving,         setSaving]         = useState(false);
  const [showAllocation, setShowAllocation] = useState(false);

  // Progress
  const total    = QUESTIONS.length;
  const progress = current / total;

  function handleAnswer(score: number) {
    const next = [...answers, score];
    setAnswers(next);
    if (current < total - 1) {
      setCurrent(c => c + 1);
    } else {
      // All answered — compute result
      const sum = next.reduce((a, b) => a + b, 0);
      const res = scoreToProfile(sum);
      setResult(res);
      setStep("result");
      persistResult(res);
    }
  }

  async function persistResult(res: RiskResult) {
    // Save to localStorage immediately; bust allocation cache so new plan is generated
    try {
      localStorage.setItem(RISK_CACHE_KEY, JSON.stringify(res));
      localStorage.removeItem("vela_allocation_v1");
    } catch {}

    // Also save to Supabase profiles
    setSaving(true);
    try {
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        await supabase.from("profiles").upsert(
          { id: data.user.id, risk_profile: res.profile, risk_score: res.score },
          { onConflict: "id" }
        );
      }
    } catch { /* non-critical */ }
    setSaving(false);
  }

  function handleDone() {
    if (result) onSave(result);
    onClose();
  }

  const q = QUESTIONS[current];

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-lg rounded-t-3xl shadow-2xl overflow-hidden"
        style={{ backgroundColor: "white", maxHeight: "92dvh", overflowY: "auto" }}
      >

        {/* ── INTRO ── */}
        {step === "intro" && (
          <div className="p-6 pb-10">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-xl font-bold mb-1" style={{ color: "#1E3A5F" }}>
                  {t("🎯 Risk Assessment", "🎯 Valutazione del Rischio")}
                </h2>
                <p className="text-sm" style={{ color: "#64748B" }}>
                  {t("5 quick questions · ~1 minute", "5 domande rapide · ~1 minuto")}
                </p>
              </div>
              <button onClick={onClose} className="text-2xl leading-none mt-1" style={{ color: "#94A3B8" }}>×</button>
            </div>

            {/* Profile previews */}
            <div className="grid grid-cols-2 gap-2 mb-6">
              {(["Conservative", "Balanced", "Growth", "Aggressive"] as const).map(p => {
                const m = PROFILE_META[p];
                const l = PROFILE_LABEL[p];
                return (
                  <div key={p} className="rounded-2xl p-3 text-center"
                    style={{ backgroundColor: m.bg, border: `1px solid ${m.border}` }}>
                    <p className="text-xl mb-0.5">{m.emoji}</p>
                    <p className="text-xs font-semibold" style={{ color: m.color }}>
                      {lang === "it" ? l.it : l.en}
                    </p>
                  </div>
                );
              })}
            </div>

            <p className="text-xs text-center mb-5" style={{ color: "#94A3B8" }}>
              {t(
                "Your answers determine your risk profile and suggested allocation",
                "Le tue risposte determinano il profilo di rischio e l'allocazione suggerita"
              )}
            </p>

            <button
              onClick={() => setStep("quiz")}
              className="w-full py-3.5 rounded-2xl font-semibold text-white text-sm"
              style={{ backgroundColor: "#0EA5E9" }}>
              {t("Start questionnaire →", "Inizia il questionario →")}
            </button>
          </div>
        )}

        {/* ── QUIZ ── */}
        {step === "quiz" && q && (
          <div className="p-6 pb-10">
            {/* Header */}
            <div className="flex justify-between items-center mb-5">
              <button
                onClick={() => {
                  if (current === 0) { setStep("intro"); setAnswers([]); }
                  else { setCurrent(c => c - 1); setAnswers(a => a.slice(0, -1)); }
                }}
                className="text-sm flex items-center gap-1"
                style={{ color: "#0EA5E9" }}>
                ← {t("Back", "Indietro")}
              </button>
              <span className="text-xs font-medium" style={{ color: "#94A3B8" }}>
                {current + 1} / {total}
              </span>
              <button onClick={onClose} className="text-xl leading-none" style={{ color: "#94A3B8" }}>×</button>
            </div>

            {/* Progress bar */}
            <div className="w-full h-1.5 rounded-full mb-6 overflow-hidden" style={{ backgroundColor: "#E0F2FE" }}>
              <div
                className="h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${((current + 1) / total) * 100}%`, backgroundColor: "#0EA5E9" }}
              />
            </div>

            {/* Question */}
            <h3 className="text-lg font-bold mb-6" style={{ color: "#1E3A5F" }}>
              {lang === "it" ? q.it : q.en}
            </h3>

            {/* Options */}
            <div className="space-y-3">
              {q.options.map((opt, i) => (
                <button
                  key={i}
                  onClick={() => handleAnswer(opt.score)}
                  className="w-full text-left px-4 py-3.5 rounded-2xl font-medium text-sm transition-all active:scale-[0.98]"
                  style={{
                    backgroundColor: "#F0F9FF",
                    border: "1px solid #BAE6FD",
                    color: "#1E3A5F",
                  }}>
                  {lang === "it" ? opt.it : opt.en}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── RESULT ── */}
        {step === "result" && result && (() => {
          const meta  = PROFILE_META[result.profile];
          const label = PROFILE_LABEL[result.profile];
          return (
            <div className="p-6 pb-10">
              {/* Close */}
              <div className="flex justify-end mb-2">
                <button onClick={onClose} className="text-2xl leading-none" style={{ color: "#94A3B8" }}>×</button>
              </div>

              {/* Profile card */}
              <div className="rounded-3xl p-5 mb-5 text-center"
                style={{ backgroundColor: meta.bg, border: `1px solid ${meta.border}` }}>
                <p className="text-5xl mb-2">{meta.emoji}</p>
                <p className="text-2xl font-bold mb-0.5" style={{ color: meta.color }}>
                  {lang === "it" ? label.it : label.en}
                </p>
                <p className="text-sm" style={{ color: meta.color, opacity: 0.8 }}>
                  {t("Risk score", "Punteggio di rischio")}: {result.score} / 25
                </p>
              </div>

              {/* Allocation */}
              <div className="rounded-2xl p-4 mb-4" style={{ backgroundColor: "white", border: "1px solid #E0F2FE" }}>
                <p className="text-sm font-semibold mb-1" style={{ color: "#1E3A5F" }}>
                  {t("Suggested allocation", "Allocazione suggerita")}
                </p>
                <AllocationBar
                  stocks={result.stocks}
                  bonds={result.bonds}
                  cash={result.cash}
                />
              </div>

              {/* Profile description */}
              <div className="rounded-2xl p-4 mb-5" style={{ backgroundColor: "#F8FAFC", border: "1px solid #E2E8F0" }}>
                <p className="text-xs leading-relaxed" style={{ color: "#64748B" }}>
                  {result.profile === "Conservative" && t(
                    "You prioritise capital preservation over returns. A heavier allocation to bonds and cash provides stability and lower volatility — ideal if you'll need the money soon or can't tolerate large drawdowns.",
                    "Preferisci preservare il capitale ai rendimenti elevati. Un'allocazione maggiore in obbligazioni e liquidità garantisce stabilità e bassa volatilità — ideale se hai bisogno del denaro a breve o non tolleri grandi perdite."
                  )}
                  {result.profile === "Balanced" && t(
                    "You seek a balance between growth and stability. A mixed allocation captures equity upside while bonds act as a buffer during market corrections — solid for a medium-term horizon.",
                    "Cerchi un equilibrio tra crescita e stabilità. Un'allocazione mista cattura i rialzi azionari mentre le obbligazioni fungono da cuscinetto durante le correzioni — solida per un orizzonte a medio termine."
                  )}
                  {result.profile === "Growth" && t(
                    "You're comfortable with volatility in pursuit of long-term wealth building. Equities dominate with a modest bond allocation to reduce drawdowns — well suited for a 5–10 year horizon.",
                    "Sei a tuo agio con la volatilità nella ricerca della crescita del patrimonio a lungo termine. Le azioni dominano con una modesta quota obbligazionaria — adatta per un orizzonte di 5-10 anni."
                  )}
                  {result.profile === "Aggressive" && t(
                    "Maximum growth, maximum risk. You're fully committed to equities and willing to ride out major market swings. This profile suits long horizons (10+ years) and strong income stability.",
                    "Massima crescita, massimo rischio. Sei completamente orientato verso le azioni e pronto ad affrontare grandi oscillazioni di mercato. Questo profilo è adatto a orizzonti lunghi (10+ anni) e a un reddito stabile."
                  )}
                </p>
              </div>

              {saving ? (
                <p className="text-xs text-center animate-pulse mb-4" style={{ color: "#94A3B8" }}>
                  {t("Saving your profile…", "Salvataggio del profilo…")}
                </p>
              ) : (
                <p className="text-xs text-center mb-4" style={{ color: "#22C55E" }}>
                  ✓ {t("Profile saved", "Profilo salvato")}
                </p>
              )}

              <button
                onClick={handleDone}
                className="w-full py-3.5 rounded-2xl font-semibold text-white text-sm"
                style={{ backgroundColor: "#0EA5E9" }}>
                {t("Done", "Fatto")}
              </button>

              {/* Personalised plan CTA */}
              <button
                onClick={() => setShowAllocation(true)}
                className="w-full mt-3 py-3.5 rounded-2xl font-semibold text-white text-sm flex items-center justify-center gap-2 active:scale-95 transition-transform"
                style={{ background: "linear-gradient(135deg, #0EA5E9, #6366F1)" }}>
                <span>{t("See your personalised plan →", "Vedi il tuo piano personalizzato →")}</span>
              </button>

              {/* Retake */}
              <button
                onClick={() => { setStep("intro"); setAnswers([]); setCurrent(0); setResult(null); }}
                className="w-full py-2.5 text-sm mt-2"
                style={{ color: "#94A3B8" }}>
                {t("Retake questionnaire", "Rifai il questionario")}
              </button>
            </div>
          );
        })()}
      </div>

      {/* Personalised allocation plan — full-screen, slides over the modal */}
      {showAllocation && result && (
        <AllocationScreen
          onClose={() => setShowAllocation(false)}
          lang={lang}
          profile={result.profile}
          score={result.score}
          holdings={holdings}
        />
      )}
    </div>
  );
}
