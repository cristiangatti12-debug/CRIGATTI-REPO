"use client";
import { useEffect, useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { supabase } from "@/lib/supabase";
import type { AllocationResult, AllocationSlice, BehaviorFlags } from "@/types";

interface HoldingSlim {
  ticker:         string;
  name:           string;
  shares:         number;
  cost_per_share: number;
  currency?:      string;
}

interface ExtendedAllocationResult extends AllocationResult {
  confidence_score?: number;
  key_risks?:        string[];
  learning_notes?:   string;
  model_used?:       string;
}

interface Props {
  onClose:             () => void;
  lang:                "en" | "it";
  profile:             string;
  score:               number;
  holdings:            HoldingSlim[];
  full_questionnaire?: Record<string, any>;
  behavioral_flags?:   BehaviorFlags;
  risk_profile?:       string;
}

const COLORS    = ["#38BDF8", "#818CF8", "#34D399", "#FBBF24", "#F87171"];
const CACHE_KEY = "vela_allocation_v1";
const CACHE_TTL = 24 * 60 * 60 * 1000;

export default function AllocationScreen({
  onClose, lang, profile, score, holdings, full_questionnaire, behavioral_flags, risk_profile
}: Props) {
  const [result,  setResult]  = useState<ExtendedAllocationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const t = (en: string, it: string) => lang === "it" ? it : en;

  useEffect(() => { loadAllocation(); }, []);

  async function loadAllocation() {
    setError(null);
    setLoading(true);
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < CACHE_TTL) {
          setResult(data);
          setLoading(false);
          return;
        }
      }
    } catch {}

    try {
      const holdingsParam = encodeURIComponent(JSON.stringify(
        holdings.map(h => ({ ticker: h.ticker, name: h.name, shares: h.shares, cost_per_share: h.cost_per_share, currency: h.currency }))
      ));

      // Build API URL with questionnaire data
      let url = `/api/allocation?profile=${encodeURIComponent(profile)}&score=${score}&holdings=${holdingsParam}`;
      if (full_questionnaire) {
        url += `&full_questionnaire=${encodeURIComponent(JSON.stringify(full_questionnaire))}`;
      }
      if (behavioral_flags) {
        url += `&behavioral_flags=${encodeURIComponent(JSON.stringify(behavioral_flags))}`;
      }

      const res = await fetch(url);
      if (!res.ok) throw new Error();
      const data: ExtendedAllocationResult = await res.json();
      setResult(data);
      localStorage.setItem(CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));

      // Auto-save to allocation_history
      await saveAllocationHistory(data);
    } catch (err) {
      console.error("Allocation load error:", err);
      setError(t("Could not load your plan. Please try again.", "Impossibile caricare il piano. Riprova."));
    }
    setLoading(false);
  }

  async function saveAllocationHistory(allocationData: ExtendedAllocationResult) {
    try {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;

      // Get current market context (timestamp, model used, etc.)
      const marketContext = {
        timestamp: new Date().toISOString(),
        date: new Date().toLocaleDateString("en-CA"),
        model_used: allocationData.model_used || "Unknown",
        confidence_score: allocationData.confidence_score || null,
        key_risks: allocationData.key_risks || [],
      };

      // Compute portfolio snapshot (% per asset class)
      const portfolioSnapshot: Record<string, number> = {};
      holdings.forEach(h => {
        const value = h.shares * h.cost_per_share;
        portfolioSnapshot[h.ticker] = value;
      });

      // Insert into allocation_history table
      const { error } = await supabase.from("allocation_history").insert({
        user_id: data.user.id,
        risk_questionnaire: full_questionnaire || {},
        risk_score: score,
        risk_profile: risk_profile || profile,
        ai_recommendation: allocationData.allocation,
        portfolio_snapshot: portfolioSnapshot,
        market_context: marketContext,
      });

      if (error) console.error("Error saving allocation history:", error);
    } catch (err) {
      console.error("saveAllocationHistory error:", err);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col"
      style={{ backgroundColor: "#0A1628", animation: "allocSlideUp 0.3s ease-out" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-6 pb-4 flex-shrink-0"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.10)" }}>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider mb-0.5" style={{ color: "#38BDF8" }}>
            {t("Your Plan", "Il tuo Piano")}
          </p>
          <h2 className="text-xl font-bold text-white">
            {result ? `${result.profile} Portfolio` : loading ? t("Analysing…", "Analisi in corso…") : t("Your Plan", "Il tuo Piano")}
          </h2>
        </div>
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-full flex items-center justify-center text-white"
          style={{ backgroundColor: "rgba(255,255,255,0.10)" }}>✕</button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-10 h-10 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>
              {t("Building your personalised plan…", "Costruendo il tuo piano personalizzato…")}
            </p>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="rounded-2xl p-4"
            style={{ backgroundColor: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.20)" }}>
            <p className="text-sm mb-3" style={{ color: "#F87171" }}>{error}</p>
            <button
              onClick={() => loadAllocation()}
              className="text-sm font-semibold underline"
              style={{ color: "#38BDF8" }}>
              {t("Try again", "Riprova")}
            </button>
          </div>
        )}

        {/* Result */}
        {result && !loading && (
          <>
            {/* Summary */}
            <div className="rounded-2xl p-4"
              style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)" }}>
              <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.80)" }}>
                {result.summary}
              </p>
            </div>

            {/* Donut + legend */}
            <div className="rounded-2xl p-4"
              style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)" }}>
              <p className="text-xs uppercase tracking-wider mb-3" style={{ color: "rgba(255,255,255,0.50)" }}>
                {t("Target Allocation", "Allocazione Obiettivo")}
              </p>
              <div className="flex items-center gap-4">
                <div className="w-32 h-32 flex-shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={result.allocation}
                        dataKey="target_pct"
                        nameKey="asset_class"
                        cx="50%" cy="50%"
                        innerRadius={30} outerRadius={55}
                        strokeWidth={0}
                      >
                        {result.allocation.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(val) => [`${val}%`]}
                        contentStyle={{ background: "#1E2D45", border: "none", borderRadius: 8, fontSize: 12 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 space-y-2">
                  {result.allocation.map((slice, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span className="text-xs flex-1 truncate" style={{ color: "rgba(255,255,255,0.70)" }}>
                        {slice.asset_class}
                      </span>
                      <span className="text-xs font-bold text-white">{slice.target_pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Breakdown cards */}
            <div>
              <p className="text-xs uppercase tracking-wider mb-3" style={{ color: "rgba(255,255,255,0.50)" }}>
                {t("Breakdown", "Dettaglio")}
              </p>
              <div className="space-y-3">
                {result.allocation.map((slice, i) => (
                  <AllocationCard key={i} slice={slice} color={COLORS[i % COLORS.length]} t={t} />
                ))}
              </div>
            </div>

            {/* Gap analysis */}
            <div className="rounded-2xl p-4"
              style={{ backgroundColor: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.20)" }}>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "#FCD34D" }}>
                ⚠️ {t("Gap Analysis", "Analisi del Gap")}
              </p>
              <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.80)" }}>
                {result.gap}
              </p>
            </div>

            {/* Next steps */}
            <div className="rounded-2xl p-4"
              style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)" }}>
              <p className="text-xs uppercase tracking-wider mb-3" style={{ color: "rgba(255,255,255,0.50)" }}>
                {t("Next Steps", "Prossimi Passi")}
              </p>
              <div className="space-y-3">
                {result.actions.map((action, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{ backgroundColor: "rgba(14,165,233,0.20)" }}>
                      <span className="text-xs font-bold" style={{ color: "#38BDF8" }}>{i + 1}</span>
                    </div>
                    <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.80)" }}>
                      {action}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Disclaimer */}
            <p className="text-xs text-center pb-4" style={{ color: "rgba(255,255,255,0.25)" }}>
              {t(
                "Not financial advice. For educational purposes only.",
                "Non è una consulenza finanziaria. Solo a scopo educativo."
              )}
            </p>
          </>
        )}
      </div>

      <style jsx global>{`
        @keyframes allocSlideUp {
          from { transform: translateY(100%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function AllocationCard({
  slice, color, t,
}: {
  slice: AllocationSlice;
  color: string;
  t: (en: string, it: string) => string;
}) {
  const gap      = slice.target_pct - slice.current_pct;
  const gapLabel = gap > 0 ? `+${gap}% ${t("to add", "da aggiungere")}` : gap < 0 ? `${gap}% ${t("to reduce", "da ridurre")}` : t("On target", "In target");
  const gapColor = gap > 0 ? "#38BDF8" : gap < 0 ? "#F87171" : "#34D399";

  return (
    <div className="rounded-2xl p-4"
      style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)" }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
          <span className="text-sm font-semibold text-white">{slice.asset_class}</span>
        </div>
        <span className="text-sm font-bold text-white">{slice.target_pct}%</span>
      </div>
      {/* Dual bar: current vs target */}
      <div className="relative h-1.5 rounded-full mb-2" style={{ backgroundColor: "rgba(255,255,255,0.08)" }}>
        <div className="absolute left-0 top-0 h-full rounded-full"
          style={{ width: `${Math.min(slice.current_pct, 100)}%`, backgroundColor: color, opacity: 0.4 }} />
        <div className="absolute left-0 top-0 h-full rounded-full"
          style={{ width: `${Math.min(slice.target_pct, 100)}%`, backgroundColor: color, opacity: 0.25 }} />
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs" style={{ color: "rgba(255,255,255,0.50)" }}>{slice.why}</p>
        <span className="text-xs font-semibold ml-2" style={{ color: gapColor }}>{gapLabel}</span>
      </div>
      {slice.example_instrument && (
        <div className="mt-2 inline-flex items-center gap-1 rounded-lg px-2 py-1"
          style={{ backgroundColor: "rgba(255,255,255,0.06)" }}>
          <span className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>e.g.</span>
          <span className="text-xs font-mono" style={{ color: "#38BDF8" }}>{slice.example_instrument}</span>
        </div>
      )}
    </div>
  );
}
