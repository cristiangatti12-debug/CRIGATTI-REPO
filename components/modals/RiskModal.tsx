"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import AllocationScreen from "../portfolio/AllocationScreen";
import type { ExtendedRiskResult, BehaviorFlags } from "@/types";

const RISK_CACHE_KEY = "vela_risk_v2";

export interface RiskResult {
  score:   number;
  profile: "Conservative" | "Balanced" | "Growth" | "Aggressive";
  stocks:  number;
  bonds:   number;
  cash:    number;
}

export function loadRiskResult(): RiskResult | null {
  try {
    const raw = localStorage.getItem(RISK_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as RiskResult;
  } catch { return null; }
}

// ── Question types ────────────────────────────────────────────────────────────

interface QuestionMeta {
  section: string;
  id: string;
  en: string;
  it: string;
  options: { en: string; it: string; score: number }[];
  behaviorFlag?: "panicSelling" | "overconfidence" | "emotionalAdjuster";
  behaviorTrigger?: (optionIndex: number) => boolean;
}

// ── Questions (20 across 5 sections) ───────────────────────────────────────────

const QUESTIONS: QuestionMeta[] = [
  // 1. RISK TOLERANCE (4 Qs)
  {
    section: "Risk Tolerance",
    id: "age",
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
    section: "Risk Tolerance",
    id: "timeHorizon",
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
    section: "Risk Tolerance",
    id: "drawdownReaction",
    en: "If your portfolio dropped 20%, you would…",
    it: "Se il tuo portafoglio scendesse del 20%, tu…",
    options: [
      { en: "Buy more",     it: "Comprerei di più",          score: 5 },
      { en: "Hold",         it: "Manterrei le posizioni",     score: 4 },
      { en: "Sell some",    it: "Venderei una parte",         score: 2 },
      { en: "Sell all",     it: "Venderei tutto",             score: 1 },
    ],
    behaviorFlag: "panicSelling",
    behaviorTrigger: (idx) => idx === 3, // "Sell all"
  },
  {
    section: "Risk Tolerance",
    id: "investmentGoal",
    en: "Your main investment goal is…",
    it: "Il tuo obiettivo principale è…",
    options: [
      { en: "Maximum growth",    it: "Crescita massima",   score: 5 },
      { en: "Strong growth",     it: "Crescita forte",     score: 4 },
      { en: "Steady growth",     it: "Crescita graduale",  score: 2 },
      { en: "Preserve wealth",   it: "Preservare il capitale", score: 1 },
    ],
  },

  // 2. FINANCIAL FOUNDATION (4 Qs)
  {
    section: "Financial Foundation",
    id: "incomeStability",
    en: "Your income is…",
    it: "Il tuo reddito è…",
    options: [
      { en: "Very stable (permanent job, pension)", it: "Molto stabile (lavoro permanente, pensione)", score: 4 },
      { en: "Stable (contract work, freelance)", it: "Stabile (lavoro contrattuale, freelance)", score: 3 },
      { en: "Variable (commission, seasonal)", it: "Variabile (commissioni, lavoro stagionale)", score: 2 },
      { en: "Uncertain (job search, startup)", it: "Incerto (ricerca lavoro, startup)", score: 1 },
    ],
  },
  {
    section: "Financial Foundation",
    id: "emergencyFund",
    en: "How many months of expenses do you have saved as an emergency fund?",
    it: "Quanti mesi di spese hai risparmiato come fondo di emergenza?",
    options: [
      { en: "6+ months",   it: "6+ mesi",    score: 5 },
      { en: "3 – 6 months", it: "3 – 6 mesi", score: 3 },
      { en: "1 – 3 months", it: "1 – 3 mesi", score: 2 },
      { en: "Less than 1 month", it: "Meno di 1 mese", score: 1 },
    ],
  },
  {
    section: "Financial Foundation",
    id: "debtLevel",
    en: "Your total debt (mortgage, loans, credit cards) is…",
    it: "Il tuo debito totale (mutuo, prestiti, carte di credito) è…",
    options: [
      { en: "None",     it: "Nessuno",           score: 5 },
      { en: "Low (< 2x annual income)",   it: "Basso (< 2x reddito annuale)",    score: 3 },
      { en: "Moderate (2x – 4x income)", it: "Moderato (2x – 4x reddito)",  score: 2 },
      { en: "High (> 4x income)",    it: "Alto (> 4x reddito)",        score: 1 },
    ],
  },
  {
    section: "Financial Foundation",
    id: "majorGoals",
    en: "Major financial goals in the next 2 years?",
    it: "Importanti obiettivi finanziari nei prossimi 2 anni?",
    options: [
      { en: "None — can stay invested",   it: "Nessuno — posso restare investito",  score: 5 },
      { en: "Maybe something small",     it: "Forse qualcosa di piccolo",      score: 3 },
      { en: "Yes, significant purchase planned", it: "Sì, acquisto importante pianificato", score: 1 },
      { en: "Yes, multiple major needs",  it: "Sì, molteplici esigenze importanti", score: 0 },
    ],
  },

  // 3. EXPERIENCE & BEHAVIOR (4 Qs)
  {
    section: "Experience & Behavior",
    id: "investingYears",
    en: "How many years have you been investing?",
    it: "Da quanti anni investi?",
    options: [
      { en: "0 – 1 year (beginner)",   it: "0 – 1 anno (principiante)",   score: 1 },
      { en: "1 – 5 years",            it: "1 – 5 anni",                 score: 2 },
      { en: "5 – 10 years",           it: "5 – 10 anni",                score: 4 },
      { en: "10+ years",              it: "10+ anni",                   score: 5 },
    ],
  },
  {
    section: "Experience & Behavior",
    id: "overconfidence",
    en: "I can beat the market through stock picking",
    it: "Posso battere il mercato scegliendo i titoli giusti",
    options: [
      { en: "Strongly disagree",       it: "Completamente in disaccordo", score: 5 },
      { en: "Somewhat disagree",       it: "Abbastanza in disaccordo",     score: 3 },
      { en: "Somewhat agree",          it: "Abbastanza d'accordo",          score: 2 },
      { en: "Strongly agree",          it: "Completamente d'accordo",       score: 1 },
    ],
    behaviorFlag: "overconfidence",
    behaviorTrigger: (idx) => idx >= 2,
  },
  {
    section: "Experience & Behavior",
    id: "panicHistory",
    en: "Have you ever sold investments at a loss to 'protect capital'?",
    it: "Hai mai venduto investimenti in perdita per 'proteggere il capitale'?",
    options: [
      { en: "Never — I hold through downturns",   it: "Mai — mantengo durante i ribassi",  score: 5 },
      { en: "Rarely",                            it: "Raramente",                         score: 3 },
      { en: "Sometimes",                         it: "A volte",                          score: 2 },
      { en: "Often — I regret it later",        it: "Spesso — me ne pento dopo",        score: 1 },
    ],
    behaviorFlag: "panicSelling",
    behaviorTrigger: (idx) => idx >= 2,
  },
  {
    section: "Experience & Behavior",
    id: "emotionalAdjustment",
    en: "When markets drop, I…",
    it: "Quando i mercati crollano, io…",
    options: [
      { en: "Stick to my plan — no emotional changes",      it: "Rimango fedele al piano — nessun cambio emotivo", score: 5 },
      { en: "Review rationally, adjust if fundamentals change", it: "Rivedo razionalmente, aggiusto se i fondamentali cambiano", score: 4 },
      { en: "Feel tempted to change things", it: "Mi sento tentato di cambiare", score: 2 },
      { en: "Panic and make hasty changes", it: "Panico e apporto cambiamenti frettolosi", score: 1 },
    ],
    behaviorFlag: "emotionalAdjuster",
    behaviorTrigger: (idx) => idx >= 2,
  },

  // 4. PREFERENCES (4 Qs)
  {
    section: "Preferences",
    id: "sectorPreferences",
    en: "Do you want to avoid certain sectors? (e.g., oil, tobacco, weapons)",
    it: "Vuoi evitare certi settori? (es. petrolio, tabacco, armi)",
    options: [
      { en: "No restrictions — broad diversification",       it: "Nessuna restrizione — ampia diversificazione",  score: 5 },
      { en: "Minor preferences only",                       it: "Solo preferenze minori",                     score: 4 },
      { en: "Yes, avoid a few sectors",                     it: "Sì, evito alcuni settori",                  score: 3 },
      { en: "Yes, must be 100% ethical/ESG",               it: "Sì, deve essere 100% etico/ESG",            score: 2 },
    ],
  },
  {
    section: "Preferences",
    id: "esgConcern",
    en: "How important is ESG (Environmental, Social, Governance) investing?",
    it: "Quanto è importante l'investimento ESG (Ambientale, Sociale, Governance)?",
    options: [
      { en: "Not important — returns only",        it: "Non importante — solo rendimenti",    score: 5 },
      { en: "Somewhat important",                  it: "Abbastanza importante",              score: 3 },
      { en: "Very important",                      it: "Molto importante",                   score: 2 },
      { en: "Essential — only ESG funds",         it: "Essenziale — solo fondi ESG",        score: 1 },
    ],
  },
  {
    section: "Preferences",
    id: "liquidityNeeds",
    en: "How often might you need to access cash from your portfolio?",
    it: "Con quale frequenza potrebbe essere necessario accedere a contanti dal tuo portafoglio?",
    options: [
      { en: "Never — fully committed long-term",   it: "Mai — completamente impegnato a lungo termine",  score: 5 },
      { en: "Rarely (maybe once per year)",       it: "Raramente (forse una volta all'anno)",         score: 4 },
      { en: "Sometimes (a few times per year)",   it: "A volte (più volte all'anno)",               score: 2 },
      { en: "Often — need regular access",        it: "Spesso — ho bisogno di accesso regolare",    score: 1 },
    ],
  },
  {
    section: "Preferences",
    id: "taxEfficiency",
    en: "How important is tax efficiency?",
    it: "Quanto è importante l'efficienza fiscale?",
    options: [
      { en: "Not important",           it: "Non importante",           score: 3 },
      { en: "Somewhat important",      it: "Abbastanza importante",    score: 3 },
      { en: "Very important",          it: "Molto importante",         score: 4 },
      { en: "Essential — tax-optimized",  it: "Essenziale — ottimizzato fiscalmente", score: 5 },
    ],
  },

  // 5. CURRENT PORTFOLIO (3 Qs)
  {
    section: "Current Portfolio",
    id: "diversificationScore",
    en: "How would you rate your portfolio's current diversification?",
    it: "Come valuteresti la diversificazione attuale del tuo portafoglio?",
    options: [
      { en: "Excellent — well balanced across sectors",  it: "Eccellente — ben equilibrato tra settori", score: 5 },
      { en: "Good — mostly diversified",               it: "Buono — per lo più diversificato",        score: 3 },
      { en: "Fair — some concentration risk",          it: "Discreto — alcuni rischi di concentrazione", score: 2 },
      { en: "Poor — too concentrated in few stocks",   it: "Scarso — troppo concentrato in pochi titoli", score: 1 },
    ],
  },
  {
    section: "Current Portfolio",
    id: "currentAllocation",
    en: "Roughly, what % is in stocks vs bonds vs cash now?",
    it: "Approssimativamente, quale % è in azioni vs obbligazioni vs contanti adesso?",
    options: [
      { en: "I don't know — not sure",   it: "Non lo so — non sono sicuro", score: 1 },
      { en: "I have a rough idea",      it: "Ho un'idea approssimativa",   score: 2 },
      { en: "I track it closely",       it: "Lo seguo da vicino",          score: 4 },
      { en: "I rebalance regularly",    it: "Riequilibrio regolarmente",   score: 5 },
    ],
  },
  {
    section: "Current Portfolio",
    id: "concentration",
    en: "Do you have any single stock at 20%+ of your portfolio?",
    it: "Hai qualche singolo titolo al 20%+ del tuo portafoglio?",
    options: [
      { en: "No — all positions under 10%",     it: "No — tutte le posizioni sotto il 10%", score: 5 },
      { en: "Maybe one at 10 – 20%",           it: "Forse uno al 10 – 20%",               score: 3 },
      { en: "Yes, 2 – 3 large positions",      it: "Sì, 2 – 3 posizioni di grandi",      score: 2 },
      { en: "Yes, heavily concentrated",       it: "Sì, molto concentrato",               score: 1 },
    ],
  },
];

// ── Scoring ────────────────────────────────────────────────────────────────────

function scoreToProfile(score: number): RiskResult {
  if (score <= 9)  return { score, profile: "Conservative", stocks: 30,  bonds: 50, cash: 20 };
  if (score <= 14) return { score, profile: "Balanced",     stocks: 50,  bonds: 35, cash: 15 };
  if (score <= 19) return { score, profile: "Growth",       stocks: 70,  bonds: 20, cash: 10 };
  return              { score, profile: "Aggressive",    stocks: 90,  bonds:  5, cash:  5 };
}

function buildExtendedRiskResult(
  baseResult: RiskResult,
  answers: number[],
  selectedOptions: QuestionMeta[],
  behaviorFlags: BehaviorFlags
): ExtendedRiskResult {
  return {
    ...baseResult,
    subsectionScores: {
      riskTolerance:       averageScore(answers.slice(0, 4)),
      financialFoundation: averageScore(answers.slice(4, 8)),
      experience:          averageScore(answers.slice(8, 12)),
      preferences:         averageScore(answers.slice(12, 16)),
    },
    warnings: buildWarnings(answers, selectedOptions),
    behaviorFlags,
  };
}

function averageScore(slice: number[]): number {
  return slice.length === 0 ? 0 : Math.round(slice.reduce((a, b) => a + b, 0) / slice.length);
}

function buildWarnings(answers: number[], questions: QuestionMeta[]): string[] {
  const warnings: string[] = [];
  const emergencyFundIdx = questions.findIndex(q => q.id === "emergencyFund");
  if (emergencyFundIdx >= 0 && answers[emergencyFundIdx] <= 2) {
    warnings.push("⚠️ Emergency fund is insufficient — build to 3+ months before investing");
  }
  const debtIdx = questions.findIndex(q => q.id === "debtLevel");
  if (debtIdx >= 0 && answers[debtIdx] <= 1) {
    warnings.push("⚠️ High debt load — consider paying down before aggressive investing");
  }
  const goalsIdx = questions.findIndex(q => q.id === "majorGoals");
  if (goalsIdx >= 0 && answers[goalsIdx] <= 1) {
    warnings.push("⚠️ Near-term financial needs — keep that portion in cash/bonds");
  }
  return warnings;
}

function detectBehaviorFlags(answers: number[], questions: QuestionMeta[]): BehaviorFlags {
  const flags: BehaviorFlags = {
    panicSelling: false,
    overconfidence: false,
    emotionalAdjuster: false,
  };

  questions.forEach((q, idx) => {
    if (!q.behaviorFlag || !q.behaviorTrigger) return;
    if (q.behaviorTrigger(answers[idx])) {
      flags[q.behaviorFlag] = true;
    }
  });

  return flags;
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

function AllocationBar({ stocks, bonds, cash }: { stocks: number; bonds: number; cash: number }) {
  return (
    <div className="mt-3">
      <div className="flex rounded-full overflow-hidden h-3 mb-2">
        <div style={{ width: `${stocks}%`, backgroundColor: "#0EA5E9" }} />
        <div style={{ width: `${bonds}%`,  backgroundColor: "#6366F1" }} />
        <div style={{ width: `${cash}%`,   backgroundColor: "#94A3B8" }} />
      </div>
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

interface Props {
  lang:     "en" | "it";
  onClose:  () => void;
  onSave:   (result: RiskResult) => void;
  holdings?: HoldingSlim[];
}

export default function RiskModal({ lang, onClose, onSave, holdings = [] }: Props) {
  const t = (en: string, it: string) => lang === "it" ? it : en;

  const [step,                setStep]                = useState<"intro" | "quiz" | "result">("intro");
  const [current,             setCurrent]             = useState(0);
  const [answers,             setAnswers]             = useState<number[]>([]);
  const [result,              setResult]              = useState<RiskResult | null>(null);
  const [extendedResult,      setExtendedResult]      = useState<ExtendedRiskResult | null>(null);
  const [fullQuestionnaire,   setFullQuestionnaire]   = useState<Record<string, any> | null>(null);
  const [saving,              setSaving]              = useState(false);
  const [showAllocation,      setShowAllocation]      = useState(false);

  const total    = QUESTIONS.length;
  const progress = current / total;

  // Group questions by section
  const sections = Array.from(new Set(QUESTIONS.map(q => q.section)));
  const sectionQuestions: Record<string, QuestionMeta[]> = {};
  sections.forEach(s => {
    sectionQuestions[s] = QUESTIONS.filter(q => q.section === s);
  });

  function handleAnswer(score: number) {
    const next = [...answers, score];
    setAnswers(next);
    if (current < total - 1) {
      setCurrent(c => c + 1);
    } else {
      // All answered — compute result
      const sum = next.reduce((a, b) => a + b, 0);
      const baseResult = scoreToProfile(sum);
      const behaviorFlags = detectBehaviorFlags(next, QUESTIONS);
      const extended = buildExtendedRiskResult(baseResult, next, QUESTIONS, behaviorFlags);
      setResult(baseResult);
      setExtendedResult(extended);
      setStep("result");
      persistResult(baseResult, extended, next);
    }
  }

  async function persistResult(res: RiskResult, extended: ExtendedRiskResult, answerList: number[]) {
    try {
      localStorage.setItem(RISK_CACHE_KEY, JSON.stringify(res));
      localStorage.removeItem("vela_allocation_v1");
    } catch {}

    setSaving(true);
    try {
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        // Build questionnaire JSON from answers
        const q: Record<string, any> = {};
        QUESTIONS.forEach((question, idx) => {
          q[question.id] = q.options[answerList[idx]];
        });
        setFullQuestionnaire(q);

        await supabase.from("profiles").upsert(
          {
            id: data.user.id,
            risk_profile: res.profile,
            risk_score: res.score,
            full_questionnaire: q,
            questionnaire_version: 2,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" }
        );
      }
    } catch (e) {
      console.error("Error saving risk profile:", e);
    }
    setSaving(false);
  }

  function handleDone() {
    if (result) onSave(result);
    onClose();
  }

  const q = QUESTIONS[current];
  const currentSection = q?.section || "";

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
                  {t("🎯 Detailed Risk Assessment", "🎯 Valutazione del Rischio Dettagliata")}
                </h2>
                <p className="text-sm" style={{ color: "#64748B" }}>
                  {t("20 questions · ~5–10 minutes", "20 domande · ~5–10 minuti")}
                </p>
              </div>
              <button onClick={onClose} className="text-2xl leading-none mt-1" style={{ color: "#94A3B8" }}>×</button>
            </div>

            <div className="rounded-2xl p-4 mb-6" style={{ backgroundColor: "#F0F9FF", border: "1px solid #BAE6FD" }}>
              <p className="text-sm font-semibold mb-2" style={{ color: "#1E3A5F" }}>
                {t("What we'll assess:", "Cosa valuteremo:")}
              </p>
              <ul className="text-xs space-y-1" style={{ color: "#64748B" }}>
                <li>✓ {t("Risk tolerance & investment horizon", "Tolleranza al rischio e orizzonte di investimento")}</li>
                <li>✓ {t("Financial foundation & stability", "Fondamento finanziario e stabilità")}</li>
                <li>✓ {t("Experience & behavioral patterns", "Esperienza e schemi comportamentali")}</li>
                <li>✓ {t("Investment preferences & values", "Preferenze di investimento e valori")}</li>
                <li>✓ {t("Current portfolio composition", "Composizione attuale del portafoglio")}</li>
              </ul>
            </div>

            <p className="text-xs text-center mb-5" style={{ color: "#94A3B8" }}>
              {t(
                "This detailed assessment helps us create a truly personalized allocation plan",
                "Questa valutazione dettagliata ci aiuta a creare un piano di allocazione veramente personalizzato"
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

            {/* Section badge */}
            <div className="inline-block px-2.5 py-1 rounded-full mb-3" style={{ backgroundColor: "#E0F2FE", color: "#0369A1", fontSize: "11px", fontWeight: "600" }}>
              {currentSection}
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
        {step === "result" && result && extendedResult && (() => {
          const meta  = PROFILE_META[result.profile];
          const label = PROFILE_LABEL[result.profile];
          return (
            <div className="p-6 pb-10">
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

              {/* Subsection scores */}
              <div className="rounded-2xl p-4 mb-4" style={{ backgroundColor: "#F8FAFC", border: "1px solid #E2E8F0" }}>
                <p className="text-xs font-semibold mb-3" style={{ color: "#1E3A5F" }}>
                  {t("Detailed Breakdown", "Analisi Dettagliata")}
                </p>
                <div className="space-y-2">
                  {[
                    { label: t("Risk Tolerance", "Tolleranza al Rischio"), score: extendedResult.subsectionScores.riskTolerance },
                    { label: t("Financial Foundation", "Fondamento Finanziario"), score: extendedResult.subsectionScores.financialFoundation },
                    { label: t("Experience & Behavior", "Esperienza e Comportamento"), score: extendedResult.subsectionScores.experience },
                    { label: t("Preferences", "Preferenze"), score: extendedResult.subsectionScores.preferences },
                  ].map(item => (
                    <div key={item.label} className="flex items-center justify-between">
                      <span className="text-xs" style={{ color: "#64748B" }}>{item.label}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 rounded-full" style={{ backgroundColor: "#E0F2FE" }}>
                          <div
                            className="h-2 rounded-full"
                            style={{
                              width: `${(item.score / 5) * 100}%`,
                              backgroundColor: "#0EA5E9",
                            }}
                          />
                        </div>
                        <span className="text-xs font-semibold" style={{ color: "#1E3A5F", minWidth: "20px" }}>
                          {item.score}/5
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Behavior flags */}
              {(extendedResult.behaviorFlags.panicSelling || extendedResult.behaviorFlags.overconfidence || extendedResult.behaviorFlags.emotionalAdjuster) && (
                <div className="rounded-2xl p-4 mb-4" style={{ backgroundColor: "#FEF3C7", border: "1px solid #FCD34D" }}>
                  <p className="text-xs font-semibold mb-2" style={{ color: "#92400E" }}>
                    {t("🎯 Behavioral Insights", "🎯 Intuizioni Comportamentali")}
                  </p>
                  <ul className="text-xs space-y-1" style={{ color: "#78350F" }}>
                    {extendedResult.behaviorFlags.panicSelling && <li>• {t("Tendency to panic sell", "Tendenza a vendere nel panico")}</li>}
                    {extendedResult.behaviorFlags.overconfidence && <li>• {t("Possible overconfidence in stock picking", "Possibile eccessiva sicurezza nella scelta dei titoli")}</li>}
                    {extendedResult.behaviorFlags.emotionalAdjuster && <li>• {t("Makes emotional portfolio changes", "Apporta cambiamenti emozionali al portafoglio")}</li>}
                  </ul>
                </div>
              )}

              {/* Warnings */}
              {extendedResult.warnings.length > 0 && (
                <div className="rounded-2xl p-4 mb-4" style={{ backgroundColor: "#FEE2E2", border: "1px solid #FCA5A5" }}>
                  {extendedResult.warnings.map((w, i) => (
                    <p key={i} className="text-xs" style={{ color: "#991B1B" }}>
                      {w}
                    </p>
                  ))}
                </div>
              )}

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

              <button
                onClick={() => setShowAllocation(true)}
                className="w-full mt-3 py-3.5 rounded-2xl font-semibold text-white text-sm flex items-center justify-center gap-2 active:scale-95 transition-transform"
                style={{ background: "linear-gradient(135deg, #0EA5E9, #6366F1)" }}>
                <span>{t("See your personalised plan →", "Vedi il tuo piano personalizzato →")}</span>
              </button>

              <button
                onClick={() => { setStep("intro"); setAnswers([]); setCurrent(0); setResult(null); setExtendedResult(null); }}
                className="w-full py-2.5 text-sm mt-2"
                style={{ color: "#94A3B8" }}>
                {t("Retake questionnaire", "Rifai il questionario")}
              </button>
            </div>
          );
        })()}
      </div>

      {showAllocation && result && extendedResult && (
        <AllocationScreen
          onClose={() => setShowAllocation(false)}
          lang={lang}
          profile={result.profile}
          score={result.score}
          holdings={holdings}
          full_questionnaire={fullQuestionnaire || undefined}
          behavioral_flags={extendedResult.behaviorFlags}
          risk_profile={result.profile}
        />
      )}
    </div>
  );
}
