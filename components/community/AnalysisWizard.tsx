"use client";
import { useState, useRef } from "react";
import type { Sentiment, Horizon, Conviction } from "@/types";

interface TickerResult { symbol: string; name: string; type: string; exchange: string; }

interface Props {
  onClose:     () => void;
  onPublished: () => void;
  userId:      string | null;
  displayName: string;
  t:           (en: string, it: string) => string;
}

// ── Chip option ───────────────────────────────────────────────────────────────
function Chip({
  label, selected, color, onSelect,
}: {
  label:    string;
  selected: boolean;
  color:    string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
      style={{
        backgroundColor: selected ? color : "rgba(255,255,255,0.08)",
        color:           selected ? "white" : "#94A3B8",
        border:          selected ? `1px solid ${color}` : "1px solid rgba(255,255,255,0.12)",
      }}
    >
      {label}
    </button>
  );
}

// ── Step indicator ─────────────────────────────────────────────────────────────
function StepDots({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-2 justify-center mb-5">
      {[1, 2, 3].map(n => (
        <div
          key={n}
          className="rounded-full transition-all"
          style={{
            width:           n === step ? 20 : 8,
            height:          8,
            backgroundColor: n === step ? "#0EA5E9" : n < step ? "rgba(14,165,233,0.4)" : "rgba(255,255,255,0.15)",
          }}
        />
      ))}
    </div>
  );
}

export default function AnalysisWizard({ onClose, onPublished, userId, displayName, t }: Props) {
  const [step, setStep] = useState(1);

  // Step 1
  const [query,       setQuery]       = useState("");
  const [results,     setResults]     = useState<TickerResult[]>([]);
  const [searching,   setSearching]   = useState(false);
  const [selected,    setSelected]    = useState<{ symbol: string; name: string } | null>(null);
  const [sentiment,   setSentiment]   = useState<Sentiment | null>(null);
  const [horizon,     setHorizon]     = useState<Horizon | null>(null);
  const [conviction,  setConviction]  = useState<Conviction | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Step 2
  const [bullCase,     setBullCase]     = useState("");
  const [risk,         setRisk]         = useState("");
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftError,   setDraftError]   = useState("");

  // Step 3
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [done, setDone] = useState(false);

  // Drag-to-dismiss
  const [dragY, setDragY] = useState(0);
  const dragStart = useRef<number | null>(null);

  function handleQueryChange(val: string) {
    setQuery(val);
    setSelected(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!val.trim()) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(val)}`);
        setResults(await res.json());
      } catch { setResults([]); }
      setSearching(false);
    }, 300);
  }

  function pickTicker(r: TickerResult) {
    setSelected({ symbol: r.symbol, name: r.name });
    setQuery(r.symbol);
    setResults([]);
  }

  const step1Ready = selected && sentiment && horizon && conviction;
  const step2Ready = bullCase.trim().length >= 30 && risk.trim().length >= 20;

  async function handleDraft() {
    if (!selected || !sentiment || !horizon) return;
    setDraftLoading(true);
    setDraftError("");
    try {
      const res = await fetch("/api/draft-analysis", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          ticker:       selected.symbol,
          ticker_name:  selected.name,
          sentiment,
          horizon,
          score:        50,
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setBullCase(data.bull_case);
      setRisk(data.risk);
    } catch {
      setDraftError("Could not generate draft. Please try again.");
    }
    setDraftLoading(false);
  }

  async function handleSubmit() {
    if (!selected || !sentiment || !horizon || !conviction) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const res = await fetch("/api/community-analyses", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          ticker:       selected.symbol,
          ticker_name:  selected.name,
          sentiment,
          horizon,
          conviction,
          bull_case:    bullCase.trim(),
          risk:         risk.trim(),
          display_name: displayName,
        }),
      });
      if (res.status === 201) {
        setDone(true);
        setTimeout(() => { onPublished(); onClose(); }, 1600);
      } else {
        const body = await res.json();
        setSubmitError(body.reason ?? body.error ?? "Could not publish. Please try again.");
      }
    } catch {
      setSubmitError("Network error. Please try again.");
    }
    setSubmitting(false);
  }

  const SENTIMENT_OPTIONS: { value: Sentiment; label: string; color: string }[] = [
    { value: "bullish",  label: t("🐂 Bullish", "🐂 Rialzista"),  color: "#16A34A" },
    { value: "neutral",  label: t("⚖️ Neutral", "⚖️ Neutrale"),   color: "#CA8A04" },
    { value: "bearish",  label: t("🐻 Bearish", "🐻 Ribassista"),  color: "#DC2626" },
  ];

  const HORIZON_OPTIONS: { value: Horizon; label: string; color: string }[] = [
    { value: "short", label: t("⚡ Short ≤3M", "⚡ Breve ≤3M"),  color: "#0EA5E9" },
    { value: "mid",   label: t("📅 Mid 3-12M", "📅 Medio 3-12M"), color: "#0EA5E9" },
    { value: "long",  label: t("🌱 Long 1Y+",  "🌱 Lungo 1A+"),   color: "#0EA5E9" },
  ];

  const CONVICTION_OPTIONS: { value: Conviction; label: string; color: string }[] = [
    { value: "low",    label: t("Low",    "Bassa"),  color: "#6366F1" },
    { value: "medium", label: t("Medium", "Media"),  color: "#6366F1" },
    { value: "high",   label: t("High",   "Alta"),   color: "#6366F1" },
  ];

  const sentimentColor = sentiment === "bullish" ? "#16A34A" : sentiment === "bearish" ? "#DC2626" : "#CA8A04";
  const horizonLabel   = HORIZON_OPTIONS.find(o => o.value === horizon)?.label   ?? "";
  const convictionLabel = CONVICTION_OPTIONS.find(o => o.value === conviction)?.label ?? "";
  const sentimentLabel  = SENTIMENT_OPTIONS.find(o => o.value === sentiment)?.label   ?? "";

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
          maxHeight:       "90vh",
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
            if (dragY > 80) { onClose(); setDragY(0); } else { setDragY(0); }
            dragStart.current = null;
          }}
        >
          <div className="w-10 h-1 rounded-full mx-auto" style={{ backgroundColor: "rgba(255,255,255,0.2)" }} />
        </div>

        <div className="px-5 pb-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-white">
              {t("Write Analysis", "Scrivi Analisi")}
            </h2>
            <button onClick={onClose} className="text-lg leading-none" style={{ color: "#64748B" }}>✕</button>
          </div>

          <StepDots step={step} />

          {/* ── Step 1 ── */}
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-xs font-semibold" style={{ color: "#94A3B8" }}>
                {t("Pick your stock & stance", "Scegli titolo e posizione")}
              </p>

              {/* Ticker search */}
              <div className="relative">
                <label className="text-xs font-medium block mb-1" style={{ color: "#64748B" }}>
                  {t("Ticker *", "Ticker *")}
                </label>
                <div className="relative">
                  <input
                    autoComplete="off"
                    className="w-full rounded-xl px-4 py-3 text-sm font-mono uppercase outline-none"
                    style={{ backgroundColor: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)", color: "white" }}
                    placeholder={t("Search: AAPL, NVDA, VWCE…", "Cerca: AAPL, NVDA, VWCE…")}
                    value={query}
                    onChange={e => handleQueryChange(e.target.value)}
                    onBlur={() => setTimeout(() => setResults([]), 150)}
                  />
                  {searching && (
                    <span className="absolute right-3 top-3 text-xs animate-pulse" style={{ color: "#0EA5E9" }}>…</span>
                  )}
                  {selected && (
                    <span className="absolute right-3 top-3 text-xs" style={{ color: "#4ADE80" }}>✓</span>
                  )}
                </div>
                {results.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 rounded-2xl shadow-xl overflow-hidden"
                    style={{ backgroundColor: "#0F1F35", border: "1px solid rgba(255,255,255,0.15)" }}>
                    {results.map(r => (
                      <button key={r.symbol}
                        className="w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors"
                        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
                        onMouseDown={() => pickTicker(r)}>
                        <div>
                          <span className="font-mono font-bold text-sm" style={{ color: "#0EA5E9" }}>{r.symbol}</span>
                          <span className="text-xs ml-2" style={{ color: "#94A3B8" }}>{r.name}</span>
                        </div>
                        <span className="text-xs px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: "rgba(255,255,255,0.08)", color: "#64748B" }}>{r.exchange}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Sentiment chips */}
              <div>
                <p className="text-xs font-medium mb-2" style={{ color: "#64748B" }}>
                  {t("Sentiment *", "Sentiment *")}
                </p>
                <div className="flex gap-2 flex-wrap">
                  {SENTIMENT_OPTIONS.map(o => (
                    <Chip key={o.value} label={o.label} selected={sentiment === o.value}
                      color={o.color} onSelect={() => setSentiment(o.value)} />
                  ))}
                </div>
              </div>

              {/* Horizon chips */}
              <div>
                <p className="text-xs font-medium mb-2" style={{ color: "#64748B" }}>
                  {t("Time Horizon *", "Orizzonte Temporale *")}
                </p>
                <div className="flex gap-2 flex-wrap">
                  {HORIZON_OPTIONS.map(o => (
                    <Chip key={o.value} label={o.label} selected={horizon === o.value}
                      color={o.color} onSelect={() => setHorizon(o.value)} />
                  ))}
                </div>
              </div>

              {/* Conviction chips */}
              <div>
                <p className="text-xs font-medium mb-2" style={{ color: "#64748B" }}>
                  {t("Conviction *", "Convinzione *")}
                </p>
                <div className="flex gap-2 flex-wrap">
                  {CONVICTION_OPTIONS.map(o => (
                    <Chip key={o.value} label={o.label} selected={conviction === o.value}
                      color={o.color} onSelect={() => setConviction(o.value)} />
                  ))}
                </div>
              </div>

              <button
                onClick={() => setStep(2)}
                disabled={!step1Ready}
                className="w-full py-3 rounded-xl font-semibold text-sm transition-opacity mt-2"
                style={{ backgroundColor: "#0EA5E9", color: "white", opacity: step1Ready ? 1 : 0.35 }}>
                {t("Next →", "Avanti →")}
              </button>
            </div>
          )}

          {/* ── Step 2 ── */}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-xs font-semibold" style={{ color: "#94A3B8" }}>
                {t("Make your case", "Costruisci la tua tesi")}
              </p>

              {/* Bull case */}
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: "#64748B" }}>
                  {t("Bull Case *", "Tesi Rialzista *")}
                </label>
                <textarea
                  rows={4}
                  className="w-full rounded-xl px-4 py-3 text-sm outline-none resize-none"
                  style={{
                    backgroundColor: "rgba(255,255,255,0.06)",
                    border:          "1px solid rgba(255,255,255,0.12)",
                    color:           "white",
                  }}
                  placeholder={t(
                    `Why could ${selected?.symbol ?? "this stock"} go up? (e.g. earnings growth, sector tailwinds, undervalued vs peers)`,
                    `Perché ${selected?.symbol ?? "questo titolo"} potrebbe salire? (es. crescita utili, settore in espansione, sottovalutato)`
                  )}
                  value={bullCase}
                  onChange={e => setBullCase(e.target.value)}
                />
                <p className="text-xs mt-1 text-right" style={{ color: bullCase.trim().length >= 30 ? "#4ADE80" : "#64748B" }}>
                  {bullCase.trim().length}/30 {t("min", "min")}
                </p>
              </div>

              {/* Risk */}
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: "#64748B" }}>
                  {t("Key Risk *", "Rischio Principale *")}
                </label>
                <textarea
                  rows={3}
                  className="w-full rounded-xl px-4 py-3 text-sm outline-none resize-none"
                  style={{
                    backgroundColor: "rgba(255,255,255,0.06)",
                    border:          "1px solid rgba(255,255,255,0.12)",
                    color:           "white",
                  }}
                  placeholder={t(
                    "What could go wrong? (e.g. high valuation, macro headwinds, competition)",
                    "Cosa potrebbe andare storto? (es. valutazione alta, rischi macro, concorrenza)"
                  )}
                  value={risk}
                  onChange={e => setRisk(e.target.value)}
                />
                <p className="text-xs mt-1 text-right" style={{ color: risk.trim().length >= 20 ? "#4ADE80" : "#64748B" }}>
                  {risk.trim().length}/20 {t("min", "min")}
                </p>
              </div>

              {/* Draft error */}
              {draftError && (
                <div className="rounded-xl px-3 py-2 text-xs"
                  style={{ backgroundColor: "rgba(239,68,68,0.10)", color: "#F87171" }}>
                  {draftError}
                </div>
              )}

              {/* Draft button */}
              <button
                onClick={handleDraft}
                disabled={draftLoading || !selected || !sentiment || !horizon}
                className="w-full py-2 rounded-xl text-xs font-semibold transition-opacity flex items-center justify-center gap-2"
                style={{
                  backgroundColor: "rgba(168,85,247,0.15)",
                  color: "#D8B4FE",
                  opacity: draftLoading || !selected || !sentiment || !horizon ? 0.5 : 1,
                }}>
                {draftLoading && <span className="inline-block w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />}
                {t("✨ Draft with AI", "✨ Bozza con AI")}
              </button>

              <div className="flex gap-3 mt-2">
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 py-3 rounded-xl text-sm font-medium"
                  style={{ backgroundColor: "rgba(255,255,255,0.07)", color: "#94A3B8" }}>
                  {t("← Back", "← Indietro")}
                </button>
                <button
                  onClick={() => setStep(3)}
                  disabled={!step2Ready}
                  className="flex-1 py-3 rounded-xl font-semibold text-sm transition-opacity"
                  style={{ backgroundColor: "#0EA5E9", color: "white", opacity: step2Ready ? 1 : 0.35 }}>
                  {t("Review →", "Rivedi →")}
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3 ── */}
          {step === 3 && (
            <div className="space-y-4">
              <p className="text-xs font-semibold" style={{ color: "#94A3B8" }}>
                {t("Review & publish", "Rivedi e pubblica")}
              </p>

              {/* Summary card */}
              <div className="rounded-2xl p-4 space-y-3"
                style={{ backgroundColor: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}>

                {/* Ticker + chips row */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-bold text-white">{selected?.symbol}</span>
                  <span className="text-xs" style={{ color: "#64748B" }}>{selected?.name}</span>
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
                    style={{ backgroundColor: `${sentimentColor}22`, color: sentimentColor }}>
                    {sentimentLabel}
                  </span>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
                    style={{ backgroundColor: "rgba(14,165,233,0.15)", color: "#38BDF8" }}>
                    {horizonLabel}
                  </span>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
                    style={{ backgroundColor: "rgba(99,102,241,0.15)", color: "#A5B4FC" }}>
                    {t("Conviction:", "Convinzione:")} {convictionLabel}
                  </span>
                </div>

                {/* Bull case snippet */}
                <div>
                  <p className="text-xs font-medium mb-1" style={{ color: "#4ADE80" }}>
                    {t("Bull Case", "Tesi Rialzista")}
                  </p>
                  <p className="text-xs leading-relaxed" style={{ color: "#CBD5E1" }}>
                    {bullCase.trim()}
                  </p>
                </div>

                {/* Risk snippet */}
                <div>
                  <p className="text-xs font-medium mb-1" style={{ color: "#F87171" }}>
                    {t("Risk", "Rischio")}
                  </p>
                  <p className="text-xs leading-relaxed" style={{ color: "#CBD5E1" }}>
                    {risk.trim()}
                  </p>
                </div>
              </div>

              {/* Moderation error */}
              {submitError && (
                <div className="rounded-xl px-4 py-3"
                  style={{ backgroundColor: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.25)" }}>
                  <p className="text-xs font-semibold mb-0.5" style={{ color: "#F87171" }}>
                    {t("Could not publish", "Pubblicazione non riuscita")}
                  </p>
                  <p className="text-xs" style={{ color: "#94A3B8" }}>{submitError}</p>
                </div>
              )}

              {/* Success state */}
              {done && (
                <div className="rounded-xl px-4 py-3 text-center"
                  style={{ backgroundColor: "rgba(74,222,128,0.10)", border: "1px solid rgba(74,222,128,0.25)" }}>
                  <p className="text-sm font-semibold" style={{ color: "#4ADE80" }}>
                    {t("Published! ✓", "Pubblicato! ✓")}
                  </p>
                </div>
              )}

              {!done && (
                <div className="flex gap-3">
                  <button
                    onClick={() => { setStep(2); setSubmitError(""); }}
                    disabled={submitting}
                    className="flex-1 py-3 rounded-xl text-sm font-medium"
                    style={{ backgroundColor: "rgba(255,255,255,0.07)", color: "#94A3B8" }}>
                    {t("← Edit", "← Modifica")}
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="flex-1 py-3 rounded-xl font-semibold text-sm transition-opacity"
                    style={{
                      background: "linear-gradient(135deg, #0EA5E9, #6366F1)",
                      color:      "white",
                      opacity:    submitting ? 0.6 : 1,
                    }}>
                    {submitting
                      ? t("Publishing…", "Pubblicazione…")
                      : t("Publish", "Pubblica")}
                  </button>
                </div>
              )}

              <p className="text-center text-xs" style={{ color: "#475569" }}>
                {t(
                  "Your analysis will be visible to the community.",
                  "La tua analisi sarà visibile alla community."
                )}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
