"use client";
export const dynamic = "force-dynamic";
import { useState, useEffect, useCallback, useRef } from "react";
import { getLang, setLang, type Lang } from "@/lib/i18n";
import type { NewsItem, TickerSignal, MarketSignalsResponse, MarketStockSignal, CommunityAnalysis } from "@/types";
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import { useRouter } from "next/navigation";
import { supabase, type Holding } from "@/lib/supabase";
import { type ParsedHolding } from "@/types";
import OnboardingModal from "@/components/modals/OnboardingModal";
import ValuationCard   from "@/components/portfolio/ValuationCard";
import RiskModal,           { loadRiskResult, type RiskResult } from "@/components/modals/RiskModal";
import DiversificationPanel from "@/components/portfolio/DiversificationPanel";
import LearnTab            from "@/components/portfolio/LearnTab";
import WatchlistTab        from "@/components/portfolio/WatchlistTab";
import VelaLogo           from "@/components/ui/VelaLogo";
import AnalysisWizard     from "@/components/community/AnalysisWizard";
import UserProfileDrawer  from "@/components/community/UserProfileDrawer";
import TickerDetailDrawer from "@/components/community/TickerDetailDrawer";

// ── CONSTANTS ─────────────────────────────────────────────────────────────────
const TABS    = ["Portfolio", "News", "Analysis", "Learn", "Watchlist", "Community"];
const PERIODS = ["1W", "1M", "3M", "1Y"];

type Signal = "BUY" | "HOLD" | "SELL";

const SIGNAL_STYLE: Record<Signal, { bg: string; color: string }> = {
  BUY:  { bg: "#DCFCE7", color: "#16A34A" },
  HOLD: { bg: "#FEF9C3", color: "#CA8A04" },
  SELL: { bg: "#FEE2E2", color: "#DC2626" },
};

const LINE_COLORS: Record<string, string> = {
  Portfolio:   "#0EA5E9",
  "S&P 500":   "#FCD34D",
  NASDAQ:      "#22C55E",
  "STOXX 600": "#F97316",
};



// ── HELPERS ───────────────────────────────────────────────────────────────────
function fmt(n: number, digits = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function chartDomain(data: Record<string, any>[], keys: string[]): [number, number] {
  let min = Infinity, max = -Infinity;
  data.forEach(row => keys.forEach(k => {
    if (typeof row[k] === "number") {
      if (row[k] < min) min = row[k];
      if (row[k] > max) max = row[k];
    }
  }));
  if (min === Infinity) return [98, 102];
  const pad = Math.max((max - min) * 0.2, 0.5);
  return [parseFloat((min - pad).toFixed(2)), parseFloat((max + pad).toFixed(2))];
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const d = new Date(label);
  const displayDate = isNaN(d.getTime()) ? label
    : d.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
  return (
    <div className="rounded-xl shadow-lg p-3 text-xs"
      style={{ backgroundColor: "#0F1F35", border: "1px solid rgba(255,255,255,0.15)", color: "white" }}>
      <p className="font-semibold mb-1" style={{ color: "#94A3B8" }}>{displayDate}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: LINE_COLORS[p.name] }}>
          {p.name}: {p.value >= 100 ? "+" : ""}{(p.value - 100).toFixed(2)}%
        </p>
      ))}
    </div>
  );
}

// ── TICKER SEARCH RESULT TYPE ──────────────────────────────────────────────────
interface TickerResult { symbol: string; name: string; type: string; exchange: string; }

// ── ADD HOLDING MODAL ─────────────────────────────────────────────────────────
function AddHoldingModal({ onClose, onSave, prefill, userId }: { onClose: () => void; onSave: () => void; prefill?: ParsedHolding | null; userId?: string | null }) {
  const [ticker,      setTicker]      = useState(prefill?.ticker ?? "");
  const [name,        setName]        = useState(prefill?.name   ?? "");
  const [shares,      setShares]      = useState(prefill?.shares ?? "");
  const [cost,        setCost]        = useState(prefill?.cost   ?? "");
  const [date,        setDate]        = useState(prefill?.date   ?? new Date().toISOString().split("T")[0]);
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState("");
  const [results,     setResults]     = useState<TickerResult[]>([]);
  const [searching,   setSearching]   = useState(false);
  const [showDrop,    setShowDrop]    = useState(false);
  const debounceRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confirmed     = useRef(false);   // true once user picked from dropdown

  // Live search with 300ms debounce
  function handleTickerChange(val: string) {
    setTicker(val);
    confirmed.current = false;
    setName("");
    setShowDrop(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.length < 1) { setResults([]); setShowDrop(false); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res  = await fetch(`/api/search?q=${encodeURIComponent(val)}`);
        const data = await res.json();
        setResults(data);
      } catch { setResults([]); }
      setSearching(false);
    }, 300);
  }

  function selectResult(r: TickerResult) {
    confirmed.current = true;
    setTicker(r.symbol);
    setName(r.name);
    setResults([]);
    setShowDrop(false);
  }

  async function handleSave() {
    if (!ticker || !shares || !cost) { setError("Please fill all required fields."); return; }
    setSaving(true);
    // Always fetch user_id fresh — the prop may be null if auth hadn't resolved yet
    const { data: authData } = await supabase.auth.getUser();
    const uid = authData?.user?.id ?? userId;
    if (!uid) { setSaving(false); setError("Not authenticated. Please log in again."); return; }
    const { error: dbErr } = await supabase.from("holdings").insert({
      ticker:         ticker.toUpperCase().trim(),
      name:           name.trim() || ticker.toUpperCase().trim(),
      shares:         parseFloat(shares),
      cost_per_share: parseFloat(cost),
      purchased_at:   date || null,
      signal:         "HOLD",
      user_id:        uid,
    });
    setSaving(false);
    if (dbErr) { setError(dbErr.message); return; }
    onSave();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg rounded-t-3xl p-6 pb-10 shadow-2xl"
        style={{ backgroundColor: "white" }}>
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-lg font-bold" style={{ color: "#1E3A5F" }}>Add Holding</h2>
          <button onClick={onClose} className="text-2xl leading-none" style={{ color: "#94A3B8" }}>×</button>
        </div>

        <div className="space-y-3">

          {/* Ticker with autocomplete */}
          <div className="relative">
            <label className="text-xs font-medium block mb-1" style={{ color: "#64748B" }}>
              Ticker Symbol *
            </label>
            <div className="relative">
              <input
                autoComplete="off"
                className="w-full rounded-xl px-4 py-3 text-sm font-mono uppercase outline-none"
                style={{ backgroundColor: "#F0F9FF", border: "1px solid #BAE6FD", color: "#1E3A5F" }}
                placeholder="Search: AAPL, NVDA, VWCE…"
                value={ticker}
                onChange={e => handleTickerChange(e.target.value)}
                onBlur={() => setTimeout(() => setShowDrop(false), 150)}
                onFocus={() => { if (results.length) setShowDrop(true); }}
              />
              {searching && (
                <span className="absolute right-3 top-3 text-xs animate-pulse" style={{ color: "#0EA5E9" }}>…</span>
              )}
            </div>

            {/* Dropdown */}
            {showDrop && results.length > 0 && (
              <div className="absolute z-10 w-full mt-1 rounded-2xl shadow-xl overflow-hidden"
                style={{ backgroundColor: "white", border: "1px solid #BAE6FD" }}>
                {results.map(r => (
                  <button key={r.symbol}
                    className="w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors hover:bg-blue-50"
                    onMouseDown={() => selectResult(r)}>
                    <div>
                      <span className="font-mono font-bold text-sm" style={{ color: "#0EA5E9" }}>{r.symbol}</span>
                      <span className="text-xs ml-2" style={{ color: "#1E3A5F" }}>{r.name}</span>
                    </div>
                    <span className="text-xs ml-2 flex-shrink-0 px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: "#F0F9FF", color: "#64748B" }}>
                      {r.exchange}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Company name (auto-filled, read-only after selection) */}
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "#64748B" }}>
              Company / ETF Name <span style={{ color: "#BAE6FD" }}>(auto-filled)</span>
            </label>
            <input
              className="w-full rounded-xl px-4 py-3 text-sm outline-none"
              style={{
                backgroundColor: name ? "#F0F9FF" : "#F8FAFC",
                border: "1px solid #BAE6FD",
                color: "#1E3A5F",
              }}
              placeholder="Auto-filled when you select a ticker"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>

          {/* Shares + Cost */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-medium block mb-1" style={{ color: "#64748B" }}>Shares *</label>
              <input type="number" min="0" step="any"
                className="w-full rounded-xl px-4 py-3 text-sm outline-none"
                style={{ backgroundColor: "#F0F9FF", border: "1px solid #BAE6FD", color: "#1E3A5F" }}
                placeholder="10"
                value={shares}
                onChange={e => setShares(e.target.value)} />
            </div>
            <div className="flex-1">
              <label className="text-xs font-medium block mb-1" style={{ color: "#64748B" }}>Avg. Cost / Share *</label>
              <input type="number" min="0" step="any"
                className="w-full rounded-xl px-4 py-3 text-sm outline-none"
                style={{ backgroundColor: "#F0F9FF", border: "1px solid #BAE6FD", color: "#1E3A5F" }}
                placeholder="150.00"
                value={cost}
                onChange={e => setCost(e.target.value)} />
            </div>
          </div>

          {/* Purchase date */}
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "#64748B" }}>Purchase Date *</label>
            <input
              type="date"
              max={new Date().toISOString().split("T")[0]}
              className="w-full rounded-xl px-4 py-3 text-sm outline-none"
              style={{ backgroundColor: "#F0F9FF", border: "1px solid #BAE6FD", color: "#1E3A5F" }}
              value={date}
              onChange={e => setDate(e.target.value)}
            />
          </div>

          {error && <p className="text-xs font-medium" style={{ color: "#EF4444" }}>{error}</p>}

          <button onClick={handleSave} disabled={saving}
            className="w-full py-3 rounded-xl font-semibold text-sm transition-opacity"
            style={{ backgroundColor: "#0EA5E9", color: "white", opacity: saving ? 0.6 : 1 }}>
            {saving ? "Saving…" : "Add to Portfolio"}
          </button>

          <p className="text-center text-xs" style={{ color: "#94A3B8" }}>
            Voice & PDF import — coming soon
          </p>
        </div>
      </div>
    </div>
  );
}

// ── DELETE CONFIRM ────────────────────────────────────────────────────────────
function DeleteConfirm({ ticker, id, onClose, onDelete }: { ticker: string; id: string; onClose: () => void; onDelete: () => void }) {
  const [deleting, setDeleting] = useState(false);
  async function handleDelete() {
    setDeleting(true);
    await supabase.from("holdings").delete().eq("id", id);
    setDeleting(false);
    onDelete();
    onClose();
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-6"
      style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-sm rounded-2xl p-6 shadow-2xl" style={{ backgroundColor: "white" }}>
        <h2 className="font-bold text-base mb-2" style={{ color: "#1E3A5F" }}>Remove {ticker}?</h2>
        <p className="text-sm mb-5" style={{ color: "#64748B" }}>This will permanently delete this holding from your portfolio.</p>
        <div className="flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium"
            style={{ backgroundColor: "#F0F9FF", color: "#64748B" }}>Cancel</button>
          <button onClick={handleDelete} disabled={deleting}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white"
            style={{ backgroundColor: "#EF4444", opacity: deleting ? 0.6 : 1 }}>
            {deleting ? "Removing…" : "Remove"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── SCORE DETAIL BOTTOM SHEET ────────────────────────────────────────────────
function ScoreDrawer({
  open, onClose, title, score, signal, children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  score: number | null;
  signal: string;
  children: React.ReactNode;
}) {
  const [dragY,    setDragY]    = useState(0);
  const dragStart  = useRef<number | null>(null);

  if (!open) return null;
  const badgeBg  = signal === "BUY" ? "#DCFCE7" : signal === "SELL" ? "#FEE2E2" : "#FEF9C3";
  const badgeClr = signal === "BUY" ? "#16A34A" : signal === "SELL" ? "#DC2626" : "#CA8A04";
  return (
    <div
      className="fixed inset-0 z-50 flex items-end"
      style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
      onClick={() => { onClose(); setDragY(0); }}
    >
      <div
        className="w-full rounded-t-2xl px-5 pb-8 space-y-4"
        style={{
          backgroundColor: "#0F1F35",
          border: "1px solid rgba(255,255,255,0.12)",
          maxHeight: "80vh", overflowY: "auto",
          transform: `translateY(${dragY}px)`,
          transition: dragStart.current !== null ? "none" : "transform 0.3s ease",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle — drag to dismiss */}
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
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold" style={{ color: "#94A3B8" }}>Score breakdown</p>
            <p className="text-base font-bold text-white">{title}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold px-2.5 py-1 rounded-full"
              style={{ backgroundColor: badgeBg, color: badgeClr }}>
              {signal} {score}/100
            </span>
            <button onClick={() => { onClose(); setDragY(0); }} className="text-lg leading-none" style={{ color: "#64748B" }}>✕</button>
          </div>
        </div>
        {/* Factor rows */}
        {children}
      </div>
    </div>
  );
}

function FactorRow({ label, score, max, description }: { label: string; score: number; max: number; description: string }) {
  const pct = score / max;
  const barColor = pct >= 0.75 ? "#4ADE80" : pct >= 0.50 ? "#FCD34D" : pct >= 0.25 ? "#94A3B8" : "#F87171";
  return (
    <div className="space-y-1.5 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-white">{label}</span>
        <span className="text-sm font-bold" style={{ color: barColor }}>{score}/{max}</span>
      </div>
      <div className="w-full h-1.5 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.08)" }}>
        <div className="h-1.5 rounded-full" style={{ width: `${pct * 100}%`, backgroundColor: barColor }} />
      </div>
      <p className="text-xs leading-relaxed" style={{ color: "#94A3B8" }}>{description}</p>
    </div>
  );
}

// ── HOLDING SIGNAL ROW (badge / reasoning / backtest / how button) ────────────
function HoldingSignalRow({
  signal, t, prevScore,
}: {
  signal: TickerSignal;
  t: (en: string, it: string) => string;
  prevScore?: number | null;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const sig  = SIGNAL_STYLE[signal.signal];
  const an   = signal.analyst;
  const bt   = signal.backtest;
  const f    = signal.factors;
  const m    = signal.meta;
  const analystColor =
    an?.label === "STRONG BUY" ? "#16A34A" :
    an?.label === "BUY"        ? "#22C55E" :
    an?.label === "SELL"       ? "#DC2626" : "#CA8A04";

  const scoreDiff = (signal.score !== null && prevScore != null)
    ? (signal.score ?? 0) - prevScore : null;
  const showTrend = scoreDiff !== null && Math.abs(scoreDiff) >= 5;

  const verdictText =
    signal.signal === "BUY"  ? t("Looking good 👍", "Segnale positivo 👍") :
    signal.signal === "SELL" ? t("Not the moment ❌", "Momento non ideale ❌") :
                               t("Keep watching ⚠️", "Tieni d'occhio ⚠️");

  return (
    <div className="mt-2 space-y-1.5">
      {/* Signal badge + trend + analyst line */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-bold px-2.5 py-0.5 rounded-full"
          style={{ backgroundColor: sig.bg, color: sig.color }}>
          {signal.signal} {signal.score}/100
        </span>
        {showTrend && (
          <span className="text-xs font-semibold"
            style={{ color: scoreDiff! > 0 ? "#4ADE80" : "#F87171" }}>
            {scoreDiff! > 0 ? "▲" : "▼"} {Math.abs(scoreDiff!)} pts
          </span>
        )}
        {an ? (
          <span className="text-xs font-medium" style={{ color: analystColor }}>
            {t("Analysts","Analisti")}: {an.strongBuy + an.buy} {t("Buy","Acquisto")} · {an.hold} {t("Hold","Neutro")} · {an.sell + an.strongSell} {t("Sell","Vendita")}
          </span>
        ) : (
          <span className="text-xs" style={{ color: "#475569" }}>
            {t("No analyst coverage","Nessuna copertura analisti")}
          </span>
        )}
      </div>
      {/* Plain-language verdict */}
      <p className="text-xs font-medium" style={{ color: sig.color }}>{verdictText}</p>
      {/* Reasoning */}
      {signal.reasoning && (
        <p className="text-xs italic leading-relaxed" style={{ color: "#64748B" }}>
          &ldquo;{signal.reasoning}&rdquo;
        </p>
      )}
      {/* Bottom row: backtest + How button */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        {bt && bt.buySignals >= 3 ? (
          <p className="text-xs" style={{ color: "#475569" }}>
            📊 {t("BUY accuracy","Accuratezza BUY")}: {bt.winRate}%
            ({bt.wins}/{bt.buySignals} {t("signals","segnali")})
          </p>
        ) : <span />}
        {f && (
          <button
            onClick={() => setDrawerOpen(true)}
            className="text-xs font-semibold px-3 py-1 rounded-full"
            style={{ backgroundColor: "rgba(14,165,233,0.15)", color: "#38BDF8", border: "1px solid rgba(14,165,233,0.3)" }}>
            {t("How is this calculated?","Come viene calcolato?")} →
          </button>
        )}
      </div>

      {/* Score detail drawer */}
      {f && m && (
        <ScoreDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          title={signal.ticker}
          score={signal.score}
          signal={signal.signal}
        >
          {/* One-sentence verdict */}
          <div className="rounded-xl px-4 py-3"
            style={{
              backgroundColor: signal.signal === "BUY" ? "rgba(34,197,94,0.08)" : signal.signal === "SELL" ? "rgba(239,68,68,0.08)" : "rgba(202,138,4,0.08)",
              border: `1px solid ${signal.signal === "BUY" ? "rgba(34,197,94,0.2)" : signal.signal === "SELL" ? "rgba(239,68,68,0.2)" : "rgba(202,138,4,0.2)"}`,
            }}>
            <p className="text-xs leading-relaxed" style={{ color: signal.signal === "BUY" ? "#4ADE80" : signal.signal === "SELL" ? "#F87171" : "#FCD34D" }}>
              {signal.signal === "BUY"
                ? t("✅ Strong buy signal — trend, valuation and momentum all support adding to this position.", "✅ Segnale d'acquisto forte — trend, valutazione e momentum supportano l'acquisto.")
                : signal.signal === "SELL"
                ? t("⚠️ Weak signal across factors — consider reviewing or reducing this position.", "⚠️ Segnale debole su più fattori — valuta di rivedere o ridurre la posizione.")
                : t("⏸️ Mixed signals — no clear direction. Hold the position and keep monitoring.", "⏸️ Segnali misti — nessuna direzione chiara. Mantieni la posizione e monitora.")}
            </p>
          </div>
          <FactorRow
            label={t("Trend ↗", "Trend ↗")}
            score={f.trend} max={40}
            description={t(
              `Price is ${m.ma200Diff >= 0 ? "+" : ""}${m.ma200Diff.toFixed(1)}% vs its 200-day moving average. Being above the long-term trend line means the stock is in an uptrend — a healthy sign.`,
              `Il prezzo è ${m.ma200Diff >= 0 ? "+" : ""}${m.ma200Diff.toFixed(1)}% rispetto alla media a 200 giorni. Essere sopra il trend di lungo periodo è un segnale positivo.`
            )}
          />
          <FactorRow
            label={t("Fair Value ⚖️", "Valore Equo ⚖️")}
            score={f.value} max={35}
            description={(() => {
              const sectorLabel = m.sector || "this sector";
              if (m.pe !== null && typeof m.pe === "number") {
                const approxNote = m.peEstimated ? " (approx.)" : "";
                const compare = m.pe < m.fairPE
                  ? t("Currently trading below fair value — could be undervalued.", "Al momento sotto il valore equo — potenzialmente sottovalutato.")
                  : t("Trading above fair value — market has high expectations.", "Sopra il valore equo — il mercato ha aspettative alte.");
                return t(
                  `PE ratio is ${m.pe.toFixed(1)}x${approxNote} vs fair value ${m.fairPE}x for ${sectorLabel}. ${compare}`,
                  `Rapporto PE di ${m.pe.toFixed(1)}x${approxNote} rispetto al valore equo di ${m.fairPE}x per ${sectorLabel}. ${compare}`
                );
              }
              return t(
                "No PE data available (ETF or index fund). Fair value score is neutral.",
                "Nessun dato PE disponibile (ETF o fondo indicizzato). Punteggio di valore equo neutro."
              );
            })()}
          />
          <FactorRow
            label={t("Momentum 🚀", "Momentum 🚀")}
            score={f.momentum} max={25}
            description={t(
              `${m.mom3m >= 0 ? "+" : ""}${m.mom3m.toFixed(1)}% return over the last 3 months. Positive momentum means the stock has been moving in the right direction recently.`,
              `${m.mom3m >= 0 ? "+" : ""}${m.mom3m.toFixed(1)}% di rendimento negli ultimi 3 mesi. Momentum positivo significa che il titolo si sta muovendo nella direzione giusta.`
            )}
          />
        </ScoreDrawer>
      )}
    </div>
  );
}

// ── AI SUGGESTIONS PANEL ─────────────────────────────────────────────────────
function MarketSignalCard({ stock, t }: { stock: MarketStockSignal; t: (en: string, it: string) => string }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const isBuy    = stock.signal === "BUY";
  const flag     = stock.region === "US" ? "🇺🇸" : "🇪🇺";
  const scoreBar = Math.round((stock.score / 100) * 100);
  const barColor = isBuy ? "#22C55E" : "#EF4444";
  const badgeBg  = isBuy ? "#DCFCE7" : "#FEE2E2";
  const badgeClr = isBuy ? "#16A34A" : "#DC2626";
  const displayTicker = stock.ticker.replace(/\.(AS|DE|PA|L|SW|CO|MI)$/, "");

  return (
    <>
      <div className="rounded-2xl px-4 py-3"
        style={{
          backgroundColor: "rgba(255,255,255,0.06)",
          border: `1px solid ${isBuy ? "rgba(74,222,128,0.25)" : "rgba(248,113,113,0.25)"}`,
        }}>
        {/* Top row */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: badgeBg, color: badgeClr }}>
              {stock.signal}
            </span>
            <span className="text-sm font-bold truncate text-white">
              {flag} {displayTicker}
            </span>
            <span className="text-xs truncate hidden sm:inline" style={{ color: "#64748B" }}>
              — {stock.name}
            </span>
          </div>
          <span className="text-xs font-semibold flex-shrink-0 ml-2" style={{ color: badgeClr }}>
            {stock.score}/100
          </span>
        </div>
        {/* Company name (mobile) */}
        <p className="text-xs mb-2 sm:hidden" style={{ color: "#64748B" }}>{stock.name}</p>
        {/* Score bar */}
        <div className="w-full rounded-full h-1.5 mb-2" style={{ backgroundColor: "rgba(255,255,255,0.08)" }}>
          <div className="h-1.5 rounded-full score-bar" style={{ width: `${scoreBar}%`, backgroundColor: barColor }} />
        </div>
        {/* Reasoning + How button */}
        <div className="flex items-end justify-between gap-2">
          <div className="flex-1 min-w-0">
            {stock.reasoning && (
              <p className="text-xs italic leading-relaxed" style={{ color: "#64748B" }}>
                &ldquo;{stock.reasoning}&rdquo;
              </p>
            )}
          </div>
          <button
            onClick={() => setDrawerOpen(true)}
            className="flex-shrink-0 text-xs font-semibold px-3 py-1 rounded-full"
            style={{ backgroundColor: "rgba(14,165,233,0.15)", color: "#38BDF8", border: "1px solid rgba(14,165,233,0.3)" }}>
            {t("How?", "Come?")} →
          </button>
        </div>
      </div>

      {/* Score detail drawer */}
      <ScoreDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={`${flag} ${displayTicker} — ${stock.name}`}
        score={stock.score}
        signal={stock.signal}
      >
        {/* One-sentence verdict */}
        <div className="rounded-xl px-4 py-3"
          style={{
            backgroundColor: isBuy ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
            border: `1px solid ${isBuy ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}`,
          }}>
          <p className="text-xs leading-relaxed" style={{ color: isBuy ? "#4ADE80" : "#F87171" }}>
            {isBuy
              ? t("✅ This stock ranks among the best opportunities on the market today — all three signals point up.", "✅ Questo titolo è tra le migliori opportunità di mercato oggi — tutti e tre i segnali sono positivi.")
              : t("⚠️ This stock shows weak fundamentals — trend, valuation or momentum are unfavourable.", "⚠️ Questo titolo mostra fondamentali deboli — trend, valutazione o momentum sono sfavorevoli.")}
          </p>
        </div>
        <FactorRow
          label={t("Trend ↗", "Trend ↗")}
          score={stock.factors.trend} max={40}
          description={t(
            `Price is ${stock.meta.ma200Diff >= 0 ? "+" : ""}${stock.meta.ma200Diff.toFixed(1)}% vs its 200-day moving average. Being above the long-term trend line means the stock is in an uptrend.`,
            `Il prezzo è ${stock.meta.ma200Diff >= 0 ? "+" : ""}${stock.meta.ma200Diff.toFixed(1)}% rispetto alla media a 200 giorni. Sopra il trend di lungo periodo è un segnale positivo.`
          )}
        />
        <FactorRow
          label={t("Fair Value ⚖️", "Valore Equo ⚖️")}
          score={stock.factors.value} max={35}
          description={(() => {
            const pe          = stock.meta?.pe ?? null;
            const fairPE      = stock.meta?.fairPE ?? 18;
            const sector      = stock.meta?.sector ?? "";
            const peEstimated = stock.meta?.peEstimated ?? false;
            if (pe !== null && typeof pe === "number") {
              const approxNote  = peEstimated ? t(" (approx.)", " (stimato)") : "";
              const sectorLabel = sector || t("this sector", "questo settore");
              const compare = pe < fairPE
                ? t("Currently trading below fair value — could be undervalued.", "Al momento sotto il valore equo — potenzialmente sottovalutato.")
                : t("Trading above fair value — market has high expectations.", "Sopra il valore equo — il mercato ha aspettative alte.");
              return t(
                `PE ratio is ${pe.toFixed(1)}x${approxNote} vs fair value ${fairPE}x for ${sectorLabel}. ${compare}`,
                `Rapporto PE di ${pe.toFixed(1)}x${approxNote} rispetto al valore equo di ${fairPE}x per ${sectorLabel}. ${compare}`
              );
            }
            return t(
              "No PE data available (ETF or index). Fair value score is neutral.",
              "Nessun dato PE disponibile (ETF o indice). Punteggio di valore equo neutro."
            );
          })()}
        />
        <FactorRow
          label={t("Momentum 🚀", "Momentum 🚀")}
          score={stock.factors.momentum} max={25}
          description={t(
            `${stock.meta.mom3m >= 0 ? "+" : ""}${stock.meta.mom3m.toFixed(1)}% return over the last 3 months. Positive momentum means the stock has been moving in the right direction recently.`,
            `${stock.meta.mom3m >= 0 ? "+" : ""}${stock.meta.mom3m.toFixed(1)}% di rendimento negli ultimi 3 mesi. Momentum positivo significa che il titolo si sta muovendo nella direzione giusta.`
          )}
        />
      </ScoreDrawer>
    </>
  );
}

function AISuggestionsPanel({
  marketSignals, marketLoading, t,
}: {
  marketSignals: MarketSignalsResponse | null;
  marketLoading: boolean;
  t:             (en: string, it: string) => string;
}) {
  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-sm font-semibold text-white">
          🌐 {t("Market Opportunities", "Opportunità di Mercato")}
        </h2>
        <span className="text-xs px-2 py-0.5 rounded-full"
          style={{ backgroundColor: "rgba(14,165,233,0.15)", color: "#38BDF8" }}>
          {t("S&P 500 · STOXX 600", "S&P 500 · STOXX 600")}
        </span>
      </div>

      {/* Loading skeleton */}
      {marketLoading && (
        <div className="space-y-2">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="rounded-2xl px-4 py-4 animate-pulse"
              style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", height: 80 }} />
          ))}
        </div>
      )}

      {/* No data yet */}
      {!marketLoading && !marketSignals && (
        <p className="text-xs text-center py-6" style={{ color: "#475569" }}>
          {t("Analysing 80 stocks…", "Analisi di 80 titoli…")}
        </p>
      )}

      {/* Results */}
      {marketSignals && (() => {
        return (
          <div className="space-y-3">
            {/* BUY section */}
            {marketSignals.buys.length > 0 && (
              <div>
                <p className="text-xs font-semibold mb-2 flex items-center gap-1.5"
                  style={{ color: "#4ADE80" }}>
                  <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: "#4ADE80" }} />
                  {t("Opportunity — Buy", "Opportunità — Acquisto")}
                </p>
                <div className="space-y-2">
                  {marketSignals.buys.map(s => (
                    <MarketSignalCard key={s.ticker} stock={s} t={t} />
                  ))}
                </div>
              </div>
            )}

            {/* SELL section */}
            {marketSignals.sells.length > 0 && (
              <div>
                <p className="text-xs font-semibold mb-2 flex items-center gap-1.5"
                  style={{ color: "#F87171" }}>
                  <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: "#F87171" }} />
                  {t("Caution — Weak Signal", "Attenzione — Segnale Debole")}
                </p>
                <div className="space-y-2">
                  {marketSignals.sells.map(s => (
                    <MarketSignalCard key={s.ticker} stock={s} t={t} />
                  ))}
                </div>
              </div>
            )}

            {marketSignals.buys.length === 0 && marketSignals.sells.length === 0 && (
              <p className="text-xs text-center py-4" style={{ color: "#475569" }}>
                {t("No strong signals available right now.", "Nessun segnale forte disponibile al momento.")}
              </p>
            )}

            <p className="text-xs text-center pt-1" style={{ color: "#334155" }}>
              {t("Screened daily from 80 blue-chip stocks", "Screening giornaliero su 80 titoli blue-chip")}
            </p>
          </div>
        );
      })()}
    </div>
  );
}

// ── NEWS CARD ─────────────────────────────────────────────────────────────────
function NewsCard({
  item, t, highlight = false,
}: {
  item:      NewsItem;
  t:         (en: string, it: string) => string;
  highlight?: boolean;
}) {
  const card = (
    <div
      className="rounded-2xl p-4 transition-all active:scale-[0.99]"
      style={{
        backgroundColor: "rgba(255,255,255,0.06)",
        border: highlight ? "1px solid rgba(14,165,233,0.30)" : "1px solid rgba(255,255,255,0.10)",
      }}
    >
      {/* Meta */}
      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
        {item.tickers.slice(0, 3).map(ticker => (
          <span key={ticker}
            className="text-xs px-2 py-0.5 rounded-full font-medium"
            style={{
              backgroundColor: highlight ? "rgba(14,165,233,0.18)" : "rgba(255,255,255,0.08)",
              color: "#38BDF8",
            }}>
            {ticker.replace(".DE", "").replace(".MI", "").replace(".L", "")}
          </span>
        ))}
        <span className="text-xs ml-auto flex-shrink-0" style={{ color: "#475569" }}>
          {item.time} · {item.source}
        </span>
      </div>
      {/* Headline */}
      <p className="text-sm font-medium leading-snug text-white">
        {item.headline}
      </p>
      {item.link && (
        <p className="text-xs mt-1.5" style={{ color: "#38BDF8" }}>
          {t("Read article →", "Leggi articolo →")}
        </p>
      )}
    </div>
  );

  return item.link ? (
    <a href={item.link} target="_blank" rel="noopener noreferrer" className="block no-underline">
      {card}
    </a>
  ) : (
    <>{card}</>
  );
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
export default function Home() {
  const router = useRouter();
  const [activeTab,      setActiveTab]      = useState("Portfolio");
  const [activePeriod,   setActivePeriod]   = useState("1M");
  const [holdings,       setHoldings]       = useState<Holding[]>([]);
  const [quotes,         setQuotes]         = useState<Record<string, any>>({});
  const [chartData,      setChartData]      = useState<Record<string, any>[]>([]);
  const [loadingDB,      setLoadingDB]      = useState(true);
  const [loadingPrices,  setLoadingPrices]  = useState(false);
  const [loadingChart,   setLoadingChart]   = useState(true);
  const [news,           setNews]           = useState<{ holdings: NewsItem[]; market: NewsItem[] }>({ holdings: [], market: [] });
  const [loadingNews,    setLoadingNews]    = useState(false);
  const [newsUpdatedAt,  setNewsUpdatedAt]  = useState<Date | null>(null);
  const [signals,        setSignals]        = useState<Record<string, TickerSignal>>({});
  const [signalsLoading, setSignalsLoading] = useState(false);
  const [marketSignals,  setMarketSignals]  = useState<MarketSignalsResponse | null>(null);
  const [marketLoading,  setMarketLoading]  = useState(false);
  const [showOnboarding,    setShowOnboarding]    = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingAccount,   setDeletingAccount]   = useState(false);
  const [showAdd,        setShowAdd]        = useState(false);
  const [voicePrefill,   setVoicePrefill]   = useState<ParsedHolding | null>(null);
  const [deleteTarget,   setDeleteTarget]   = useState<Holding | null>(null);
  const [userId,         setUserId]         = useState<string | null>(null);
  const [displayName,    setDisplayName]    = useState<string>("");
  const [userEmail,      setUserEmail]      = useState<string>("");
  const [joinDate,       setJoinDate]       = useState<string>("");
  const [showRiskModal,  setShowRiskModal]  = useState(false);
  const [riskResult,     setRiskResult]     = useState<RiskResult | null>(null);
  const [prevScores,     setPrevScores]     = useState<Record<string, number>>({});
  const [profileOpen,    setProfileOpen]    = useState(false);
  const [profileDragY,  setProfileDragY]  = useState(0);
  const profileDragStart = useRef<number | null>(null);
  const [showBenchmarks,     setShowBenchmarks]     = useState(false);
  const [displayedVal,       setDisplayedVal]       = useState(0);
  const [expandedIds,        setExpandedIds]        = useState<Set<string>>(new Set());
  const [showAnalysisWizard, setShowAnalysisWizard] = useState(false);
  const [communityAnalyses,  setCommunityAnalyses]  = useState<CommunityAnalysis[]>([]);
  const [communityLoading,   setCommunityLoading]   = useState(false);
  const [profileSubject,     setProfileSubject]     = useState<string | null>(null);
  const [tickerDetail,       setTickerDetail]       = useState<{ ticker: string; name: string } | null>(null);
  const [showAllCommunity,   setShowAllCommunity]   = useState(false);

  // Lazy initializer reads localStorage immediately (client-only) — no flash
  const [appLang] = useState<Lang>(() =>
    typeof window !== "undefined" ? getLang() : "en"
  );

  async function handleLangChange(l: Lang) {
    setLang(l);          // save to localStorage
    // Also persist to Supabase profiles so it syncs across devices
    try {
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        await supabase.from("profiles").upsert(
          { id: data.user.id, lang: l },
          { onConflict: "id" }
        );
      }
    } catch {}
    window.location.reload();  // full reload so every string renders in the new language from scratch
  }

  // Inline translation helper
  const t = (en: string, it: string) => appLang === "it" ? it : en;

  // ── Load holdings from Supabase ──────────────────────────────────────────
  const loadHoldings = useCallback(async () => {
    setLoadingDB(true);
    const { data } = await supabase.from("holdings").select("*").order("created_at");
    const hs = (data as Holding[]) ?? [];
    setHoldings(hs);
    setLoadingDB(false);
    return hs;
  }, []);

  // ── Fetch live prices ─────────────────────────────────────────────────────
  const fetchPrices = useCallback(async (hs: Holding[]) => {
    if (!hs.length) return;
    setLoadingPrices(true);
    try {
      const symbols = hs.map(h => h.ticker).join(",");
      const res  = await fetch(`/api/prices?symbols=${symbols}`);
      const data = await res.json();
      const map: Record<string, any> = {};
      data.forEach((q: any) => { map[q.symbol] = q; });
      setQuotes(map);
    } catch {}
    setLoadingPrices(false);
  }, []);

  // ── Fetch AI signals (24h localStorage cache) ────────────────────────────
  const fetchSignals = useCallback(async (hs: Holding[]) => {
    if (hs.length === 0) return;

    // Check 24h cache
    const cacheKey = `vela_signals_v8_${appLang}_${hs.map(h => h.ticker).sort().join(",")}`;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const { data, ts } = JSON.parse(cached);
        if (Date.now() - ts < 24 * 60 * 60 * 1000) {
          setSignals(Object.fromEntries((data as TickerSignal[]).map(s => [s.ticker, s])));
          return;
        }
      }
    } catch {}

    setSignalsLoading(true);
    try {
      const tickers = hs.map(h => h.ticker).join(",");
      const costs   = hs.map(h => h.cost_per_share).join(",");
      const res     = await fetch(`/api/signals?tickers=${tickers}&costs=${costs}&lang=${appLang}`);
      const data: TickerSignal[] = await res.json();
      if (Array.isArray(data)) {
        setSignals(Object.fromEntries(data.map(s => [s.ticker, s])));
        // Only cache when we received real scored data — don't cache null-score fallbacks
        if (data.some(s => s.score !== null)) {
          localStorage.setItem(cacheKey, JSON.stringify({ data, ts: Date.now() }));
        }
        // Save daily score snapshot for trend arrows (only if date changed)
        const today = new Date().toISOString().slice(0, 10);
        try {
          const existing = JSON.parse(localStorage.getItem("vela_score_snap_v1") ?? "null");
          if (!existing || existing.date !== today) {
            const scores = Object.fromEntries(data.map(s => [s.ticker, s.score ?? 0]));
            localStorage.setItem("vela_score_snap_v1", JSON.stringify({ date: today, scores }));
          }
        } catch {}
      }
    } catch {}
    setSignalsLoading(false);
  }, [appLang]);

  // ── Fetch market-wide signals (S&P 500 + STOXX 600, 12h localStorage cache)
  const fetchMarketSignals = useCallback(async () => {
    const heldStr  = holdings.map(h => h.ticker.toUpperCase()).sort().join(",");
    const cacheKey = `vela_market_v6_${appLang}_${heldStr}`;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const { data, ts } = JSON.parse(cached);
        if (Date.now() - ts < 12 * 60 * 60 * 1000) {
          setMarketSignals(data as MarketSignalsResponse);
          return;
        }
      }
    } catch {}

    setMarketLoading(true);
    try {
      const heldParam = encodeURIComponent(heldStr);
      const res  = await fetch(`/api/market-signals?lang=${appLang}&held=${heldParam}`);
      const data = await res.json() as MarketSignalsResponse;
      if (data.buys && data.sells) {
        setMarketSignals(data);
        // Only cache when we have real signals — don't cache empty YF failure responses
        if (data.buys.length > 0 || data.sells.length > 0) {
          localStorage.setItem(cacheKey, JSON.stringify({ data, ts: Date.now() }));
        }
      }
    } catch {}
    setMarketLoading(false);
  }, [appLang, holdings]);

  // ── Fetch community analyses ─────────────────────────────────────────────
  const fetchCommunityAnalyses = useCallback(async () => {
    setCommunityLoading(true);
    try {
      const res  = await fetch("/api/community-analyses");
      const data = await res.json();
      if (Array.isArray(data)) setCommunityAnalyses(data);
    } catch {}
    setCommunityLoading(false);
  }, []);

  async function handleDeleteAnalysis(id: string) {
    try {
      await fetch(`/api/community-analyses?id=${id}`, { method: "DELETE" });
      setCommunityAnalyses(prev => prev.filter(a => a.id !== id));
    } catch {}
  }

  // ── Fetch news ────────────────────────────────────────────────────────────
  const fetchNews = useCallback(async (hs: Holding[]) => {
    setLoadingNews(true);
    try {
      const tickers = hs.map(h => h.ticker).join(",");
      const res  = await fetch(`/api/news?tickers=${tickers}&lang=${appLang}`);
      const data = await res.json();
      setNews({
        holdings: Array.isArray(data.holdings) ? data.holdings : [],
        market:   Array.isArray(data.market)   ? data.market   : [],
      });
      setNewsUpdatedAt(new Date());
    } catch { setNews({ holdings: [], market: [] }); }
    setLoadingNews(false);
  }, [appLang]);

  // ── Fetch chart ───────────────────────────────────────────────────────────
  const fetchChart = useCallback(async (period: string, hs: Holding[]) => {
    setLoadingChart(true);
    try {
      const holdingsParam = hs.length
        ? `&holdings=${encodeURIComponent(JSON.stringify(hs.map(h => ({ ticker: h.ticker, shares: h.shares }))))}`
        : "";
      const res = await fetch(`/api/history?period=${period}${holdingsParam}`);
      const raw: Record<string, { date: string; value: number }[]> = await res.json();
      const dateSet = new Set<string>();
      Object.values(raw).forEach(arr => arr.forEach(p => dateSet.add(p.date)));
      const dates = Array.from(dateSet).sort(); // ISO "YYYY-MM-DD" strings sort correctly as strings
      const merged = dates.map(date => {
        const row: Record<string, any> = { date };
        Object.entries(raw).forEach(([key, arr]) => {
          const pt = arr.find(p => p.date === date);
          if (pt) row[key] = pt.value;
        });
        return row;
      });
      setChartData(merged);
    } catch { setChartData([]); }
    setLoadingChart(false);
  }, []);

  // ── Fetch current user ───────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const u = data.user;
      if (!u) return;
      setUserId(u.id);
      setUserEmail(u.email ?? "");
      setJoinDate(u.created_at ?? "");
      // display_name from user_metadata (set at signup), fall back to email prefix
      const name = (u.user_metadata?.display_name as string | undefined)
        ?? u.email?.split("@")[0]
        ?? "";
      setDisplayName(name);

      // Sync lang from Supabase profile (cross-device support)
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("lang")
          .eq("id", u.id)
          .single();
        if (profile?.lang && profile.lang !== getLang()) {
          setLang(profile.lang as Lang);
          window.location.reload();
        }
      } catch {}
    })();
  }, []);

  // Show onboarding the first time a new user lands with no holdings
  useEffect(() => {
    if (loadingDB) return;
    if (holdings.length > 0) return;
    const dismissed = localStorage.getItem("vela_onboarding_done");
    if (!dismissed) setShowOnboarding(true);
  }, [loadingDB, holdings.length]);

  function dismissOnboarding() {
    localStorage.setItem("vela_onboarding_done", "1");
    setShowOnboarding(false);
  }

  // Load saved risk profile from localStorage on mount
  useEffect(() => {
    const saved = loadRiskResult();
    if (saved) setRiskResult(saved);
  }, []);

  // Load previous-day score snapshot for trend arrows
  useEffect(() => {
    try {
      const snap = JSON.parse(localStorage.getItem("vela_score_snap_v1") ?? "null");
      const today = new Date().toISOString().slice(0, 10);
      if (snap?.date && snap.date !== today && snap.scores) {
        setPrevScores(snap.scores as Record<string, number>);
      }
    } catch {}
  }, []);

  // ── Wipe stale signal caches from old scoring versions ───────────────────────
  useEffect(() => {
    try {
      Object.keys(localStorage)
        .filter(k => /^vela_signals_v[1234567]_/.test(k) || /^vela_market_v[12345]_/.test(k))
        .forEach(k => localStorage.removeItem(k));
    } catch {}
  }, []);

  useEffect(() => { loadHoldings(); }, [loadHoldings]);
  useEffect(() => { if (!loadingDB) fetchPrices(holdings); }, [loadingDB, holdings, fetchPrices]);
  useEffect(() => { fetchChart(activePeriod, holdings); }, [activePeriod, holdings, fetchChart]);
  useEffect(() => { if (!loadingDB) fetchNews(holdings);    }, [loadingDB, holdings, fetchNews]);
  useEffect(() => { if (!loadingDB) fetchSignals(holdings); }, [loadingDB, holdings, fetchSignals]);
  useEffect(() => { fetchMarketSignals(); }, [fetchMarketSignals]);
  useEffect(() => {
    if (activeTab === "Analysis" || activeTab === "Community") fetchCommunityAnalyses();
  }, [activeTab, fetchCommunityAnalyses]);

  // ── Auto-refresh news every 5 minutes ────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      if (!loadingDB) fetchNews(holdings);
    }, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [loadingDB, holdings, fetchNews]);

  // ── Auto-refresh prices every 30 minutes + on tab re-focus ───────────────
  useEffect(() => {
    const interval = setInterval(() => {
      if (holdings.length > 0) fetchPrices(holdings);
    }, 30 * 60 * 1000);
    const onVisible = () => {
      if (document.visibilityState === "visible" && holdings.length > 0) fetchPrices(holdings);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [holdings, fetchPrices]);

  // ── Hero portfolio value count-up animation ───────────────────────────────
  useEffect(() => {
    if (loadingPrices || loadingDB) return;
    const target = enriched.reduce((s, h) => s + h.currentVal, 0);
    if (target === 0) { setDisplayedVal(0); return; }
    const start    = performance.now();
    const duration = 900;
    function step(now: number) {
      const t = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3); // cubic ease-out
      setDisplayedVal(target * ease);
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingPrices, loadingDB]);

  // ── Derived totals ────────────────────────────────────────────────────────
  const enriched = holdings.map(h => {
    const q          = quotes[h.ticker] ?? {};
    const price      = q.price     ?? 0;
    const changePct  = q.changePct ?? 0;
    const currency   = q.currency  ?? "USD";
    const currSymbol = currency === "EUR" ? "€" : "$";
    const currentVal = h.shares * price;
    const costBasis  = h.shares * h.cost_per_share;
    const absGain    = currentVal - costBasis;
    const pctGain    = h.cost_per_share > 0 ? ((price - h.cost_per_share) / h.cost_per_share) * 100 : 0;
    return { ...h, price, changePct, currency, currSymbol, currentVal, absGain, pctGain };
  });

  // Monthly rotation — deterministic per calendar month, cycles through all holdings
  // Same user sees the same stock all month; rotates automatically on the 1st
  // Biggest holding by current market value gets the full 4-model analysis + Excel.
  // All other holdings get P/E-only (isSimple). Cache is date-keyed → refreshes each day.
  const freeExcelTicker = (() => {
    if (enriched.length === 0) return null;
    return [...enriched].sort((a, b) => b.currentVal - a.currentVal)[0].ticker.toUpperCase();
  })();

  const totalValue   = enriched.reduce((s, h) => s + h.currentVal, 0);
  const totalCost    = enriched.reduce((s, h) => s + h.shares * h.cost_per_share, 0);
  const totalGain    = totalValue - totalCost;
  const totalGainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;
  const todayGain    = enriched.reduce((s, h) => s + (h.currentVal * h.changePct / 100), 0);
  const todayGainPct = totalValue > 0 ? (todayGain / totalValue) * 100 : 0;
  const best         = [...enriched].sort((a, b) => b.changePct - a.changePct)[0];
  const worst        = [...enriched].sort((a, b) => a.changePct - b.changePct)[0];

  const SUMMARY_CARDS = [
    { label: t("Best Today","Migliore Oggi"),  value: best?.ticker  ?? "—", sub: `${(best?.changePct  ?? 0) >= 0 ? "+" : ""}${fmt(best?.changePct  ?? 0, 2)}%`, positive: (best?.changePct  ?? 0) >= 0 },
    { label: t("Worst Today","Peggiore Oggi"), value: worst?.ticker ?? "—", sub: `${(worst?.changePct ?? 0) >= 0 ? "+" : ""}${fmt(worst?.changePct ?? 0, 2)}%`, positive: (worst?.changePct ?? 0) >= 0 },
  ];

  const chartKeys = Object.keys(LINE_COLORS);

  return (
    <div className="min-h-screen pb-28" style={{ backgroundColor: "#0A1628" }}>

      {/* Onboarding */}
      {showOnboarding && (
        <OnboardingModal
          lang={appLang}
          onAddHolding={() => { dismissOnboarding(); setShowAdd(true); }}
          onSkip={dismissOnboarding}
        />
      )}

      {/* Modals */}
      {showAdd && (
        <AddHoldingModal
          onClose={() => { setShowAdd(false); setVoicePrefill(null); }}
          onSave={async () => { const hs = await loadHoldings(); fetchPrices(hs); fetchSignals(hs); }}
          prefill={voicePrefill}
          userId={userId}
        />
      )}
      {deleteTarget && (
        <DeleteConfirm
          ticker={deleteTarget.ticker}
          id={deleteTarget.id!}
          onClose={() => setDeleteTarget(null)}
          onDelete={loadHoldings}
        />
      )}
      {showRiskModal && (
        <RiskModal
          lang={appLang}
          onClose={() => setShowRiskModal(false)}
          onSave={(res) => { setRiskResult(res); setShowRiskModal(false); }}
          holdings={holdings}
        />
      )}
      {showAnalysisWizard && (
        <AnalysisWizard
          onClose={() => setShowAnalysisWizard(false)}
          onPublished={fetchCommunityAnalyses}
          userId={userId}
          displayName={displayName}
          t={t}
        />
      )}
      {profileSubject && (
        <UserProfileDrawer
          displayName={profileSubject}
          analyses={communityAnalyses.filter(a => a.display_name === profileSubject)}
          onTickerClick={(ticker, name) => { setProfileSubject(null); setTickerDetail({ ticker, name }); }}
          onClose={() => setProfileSubject(null)}
          t={t}
        />
      )}
      {tickerDetail && (
        <TickerDetailDrawer
          ticker={tickerDetail.ticker}
          tickerName={tickerDetail.name}
          onClose={() => setTickerDetail(null)}
          t={t}
          appLang={appLang}
        />
      )}

      {/* ── HEADER ── */}
      <div className="px-4 pt-10 pb-5 relative overflow-hidden"
        style={{ background: "linear-gradient(160deg, #0F2240 0%, #0A1628 100%)" }}>

        {/* Radial glow behind content */}
        <div className="absolute inset-0 pointer-events-none"
          style={{
            background: "radial-gradient(ellipse 70% 60% at 50% -10%, rgba(14,165,233,0.18) 0%, transparent 70%)",
          }} />

        {/* Top row: greeting + avatar */}
        <div className="flex justify-between items-start mb-4 relative">
          <div>
            <p className="text-sm mb-0.5" style={{ color: "#7DD3FC" }}>
              {displayName
                ? t(`Hey ${displayName} 👋`, `Ciao ${displayName} 👋`)
                : t("Hey there 👋", "Ciao 👋")}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <VelaLogo size={32} />
              <h1 className="text-2xl font-bold text-white tracking-tight">Vela.ai</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {loadingPrices && (
              <span className="text-xs animate-pulse" style={{ color: "#7DD3FC" }}>
                {t("Updating…","Aggiornamento…")}
              </span>
            )}
            <button
              onClick={() => setProfileOpen(true)}
              className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold shadow-lg transition-transform active:scale-90 hover:ring-2 hover:ring-white/30"
              style={{ background: "linear-gradient(135deg, #0EA5E9, #6366F1)" }}
              aria-label="Open profile">
              {displayName ? displayName[0].toUpperCase() : "?"}
            </button>
          </div>
        </div>

        {/* Hero portfolio value */}
        {!loadingDB && enriched.length > 0 && (
          <div className="mb-5 relative animate-count-up">
            <p className="text-xs font-medium mb-1" style={{ color: "#7DD3FC" }}>
              {t("Total Portfolio Value", "Valore Totale Portfolio")}
            </p>
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="text-4xl font-bold text-white tracking-tight">
                €{fmt(displayedVal)}
              </span>
              <span className="text-sm font-semibold px-2.5 py-1 rounded-full"
                style={{
                  backgroundColor: todayGain >= 0 ? "rgba(34,197,94,0.18)" : "rgba(239,68,68,0.18)",
                  color: todayGain >= 0 ? "#4ADE80" : "#F87171",
                }}>
                {todayGain >= 0 ? "▲" : "▼"} {todayGain >= 0 ? "+" : ""}€{fmt(Math.abs(todayGain))} {t("today","oggi")}
              </span>
            </div>
            <p className="text-xs mt-1" style={{ color: totalGainPct >= 0 ? "#4ADE80" : "#F87171" }}>
              {totalGainPct >= 0 ? "+" : ""}{fmt(totalGainPct, 2)}% {t("all-time return","rendimento totale")}
            </p>
          </div>
        )}

        {/* Tab bar */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar relative">
          {TABS.map(tab => {
            const label = appLang === "it"
              ? ({ Portfolio: "Portafoglio", News: "Notizie", Analysis: "Analisi", Learn: "Impara", Watchlist: "Osservati", Community: "Community" }[tab] ?? tab)
              : tab;
            return (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className="px-4 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap transition-all"
                style={{
                  backgroundColor: activeTab === tab ? "#0EA5E9" : "rgba(255,255,255,0.10)",
                  color:           activeTab === tab ? "white"    : "#BAE6FD",
                  backdropFilter:  "blur(8px)",
                  boxShadow:       activeTab === tab ? "0 2px 12px rgba(14,165,233,0.35)" : "none",
                }}>{label}</button>
            );
          })}
        </div>
      </div>

      {/* ── PORTFOLIO ── */}
      {activeTab === "Portfolio" && (
        <div className="px-4 py-4 space-y-5">

          {/* Summary cards */}
          <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
            {SUMMARY_CARDS.map(card => (
              <div key={card.label} className="min-w-[148px] rounded-2xl p-4 flex-shrink-0"
                style={{
                  backgroundColor: "rgba(255,255,255,0.07)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  backdropFilter: "blur(12px)",
                }}>
                <p className="text-xs font-medium mb-1" style={{ color: "#7DD3FC" }}>{card.label}</p>
                <p className="text-xl font-bold text-white">{card.value}</p>
                <p className="text-xs mt-0.5 font-semibold"
                  style={{ color: card.positive ? "#4ADE80" : "#F87171" }}>{card.sub}</p>
              </div>
            ))}
          </div>

          {/* Chart */}
          <div className="rounded-2xl p-4"
            style={{ backgroundColor: "#0F1F35", border: "1px solid rgba(255,255,255,0.10)" }}>
            <div className="flex justify-between items-center mb-3">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-white">
                  {t("Performance", "Andamento")}
                </h2>
                <button
                  onClick={() => setShowBenchmarks(b => !b)}
                  className="text-xs px-2.5 py-0.5 rounded-full font-medium transition-all"
                  style={{
                    backgroundColor: showBenchmarks ? "rgba(14,165,233,0.25)" : "rgba(255,255,255,0.08)",
                    color: showBenchmarks ? "#7DD3FC" : "#64748B",
                    border: `1px solid ${showBenchmarks ? "rgba(14,165,233,0.4)" : "rgba(255,255,255,0.10)"}`,
                  }}>
                  {t("Compare", "Confronta")}
                </button>
              </div>
              <div className="flex gap-1">
                {PERIODS.map(p => (
                  <button key={p} onClick={() => setActivePeriod(p)}
                    className="px-2.5 py-0.5 rounded-full text-xs font-medium transition-all"
                    style={{
                      backgroundColor: activePeriod === p ? "#0EA5E9" : "rgba(255,255,255,0.08)",
                      color:           activePeriod === p ? "white"   : "#64748B",
                    }}>{p}</button>
                ))}
              </div>
            </div>
            {loadingChart ? (
              <div className="h-[210px] flex items-center justify-center">
                <p className="text-sm animate-pulse" style={{ color: "#94A3B8" }}>{t("Loading…","Caricamento…")}</p>
              </div>
            ) : chartData.length < 7 ? (
              <div className="h-[210px] flex flex-col items-center justify-center gap-2 text-center px-4">
                <span className="text-3xl">📈</span>
                <p className="text-sm" style={{ color: "#64748B" }}>
                  {t(
                    "Not enough data yet — check back after a few more trading days.",
                    "Dati insufficienti — riprova dopo qualche giorno di trading."
                  )}
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={210}>
                <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="portfolioGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#0EA5E9" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#0EA5E9" stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748B" }}
                    tickLine={false} axisLine={false}
                    interval={Math.max(Math.floor(chartData.length / 4), 1)}
                    tickFormatter={(iso: string) => {
                      const d = new Date(iso);
                      return activePeriod === "1Y"
                        ? d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" })
                        : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
                    }} />
                  <YAxis tick={{ fontSize: 10, fill: "#64748B" }} tickLine={false} axisLine={false}
                    domain={chartDomain(chartData, showBenchmarks ? Object.keys(LINE_COLORS) : ["Portfolio"])}
                    tickFormatter={(v) => `${(v - 100).toFixed(1)}%`} />
                  <Tooltip content={<ChartTooltip />} />
                  {showBenchmarks && <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8, color: "#94A3B8" }} />}
                  {/* Portfolio area (always visible) */}
                  <Area type="monotone" dataKey="Portfolio"
                    stroke="#0EA5E9" strokeWidth={2.5}
                    fill="url(#portfolioGrad)"
                    dot={false} activeDot={{ r: 4 }} connectNulls />
                  {/* Benchmarks (only when Compare is toggled) */}
                  {showBenchmarks && ["S&P 500", "NASDAQ", "STOXX 600"].map(key => (
                    <Line key={key} type="monotone" dataKey={key}
                      stroke={LINE_COLORS[key]} strokeWidth={1.5} strokeDasharray="4 3"
                      dot={false} activeDot={{ r: 3 }} connectNulls />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Sector concentration warning */}
          {(() => {
            if (enriched.length < 2 || totalValue === 0) return null;
            const bySector: Record<string, number> = {};
            for (const h of enriched) {
              const sector = signals[h.ticker]?.meta?.sector;
              if (!sector) continue;
              bySector[sector] = (bySector[sector] ?? 0) + h.currentVal;
            }
            const dominant = Object.entries(bySector)
              .map(([sector, val]) => ({ sector, pct: (val / totalValue) * 100 }))
              .sort((a, b) => b.pct - a.pct)[0];
            if (!dominant || dominant.pct <= 60) return null;
            return (
              <div className="rounded-2xl px-4 py-3 flex items-start gap-3"
                style={{ backgroundColor: "rgba(234,179,8,0.10)", border: "1px solid rgba(234,179,8,0.25)" }}>
                <span className="text-base mt-0.5 flex-shrink-0">⚠️</span>
                <div>
                  <p className="text-xs font-semibold mb-0.5" style={{ color: "#FCD34D" }}>
                    {t("Concentrated portfolio", "Portafoglio concentrato")}
                  </p>
                  <p className="text-xs leading-relaxed" style={{ color: "#94A3B8" }}>
                    {t(
                      `${dominant.pct.toFixed(0)}% of your portfolio is in ${dominant.sector}. Consider diversifying across other sectors to reduce risk.`,
                      `Il ${dominant.pct.toFixed(0)}% del portafoglio è in ${dominant.sector}. Considera di diversificare in altri settori per ridurre il rischio.`
                    )}
                  </p>
                </div>
              </div>
            );
          })()}

          {/* Holdings */}
          <div>
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-sm font-semibold text-white">{t("My Holdings","I Miei Titoli")}</h2>
              <button onClick={() => setShowAdd(true)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-lg font-bold transition-transform hover:scale-105 active:scale-95 shadow-lg"
                style={{ background: "linear-gradient(135deg, #0EA5E9, #0284C7)" }}>+</button>
            </div>

            {loadingDB ? (
              <div className="space-y-2">
                {[0, 1, 2].map(i => (
                  <div key={i} className="rounded-2xl px-4 py-3 animate-pulse"
                    style={{ backgroundColor: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.11)" }}>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full flex-shrink-0"
                        style={{ backgroundColor: "rgba(255,255,255,0.10)" }} />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 w-24 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.10)" }} />
                        <div className="h-2.5 w-16 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.07)" }} />
                      </div>
                      <div className="text-right space-y-2">
                        <div className="h-3 w-16 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.10)" }} />
                        <div className="h-2.5 w-10 rounded-full ml-auto" style={{ backgroundColor: "rgba(255,255,255,0.07)" }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : enriched.length === 0 ? (
              <div className="rounded-2xl p-8 text-center"
                style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "2px dashed rgba(255,255,255,0.15)" }}>
                <p className="text-2xl mb-2">📭</p>
                <p className="font-semibold text-sm mb-1 text-white">{t("No holdings yet","Nessun titolo ancora")}</p>
                <p className="text-xs mb-4" style={{ color: "#94A3B8" }}>{t("Tap + to add your first investment","Tocca + per aggiungere il tuo primo investimento")}</p>
                <button onClick={() => setShowAdd(true)}
                  className="px-5 py-2 rounded-full text-sm font-semibold text-white"
                  style={{ backgroundColor: "#0EA5E9" }}>{t("Add investment","Aggiungi investimento")}</button>
              </div>
            ) : (
              <div className="space-y-2 pb-28">
                {enriched.map(h => {
                  const positive   = h.absGain >= 0;
                  const gainColor  = positive ? "#4ADE80" : "#F87171";
                  const key        = h.id ?? h.ticker;
                  const isExpanded = expandedIds.has(key);
                  const todayAbs   = h.currentVal * h.changePct / 100;
                  return (
                    <div key={key} className="rounded-2xl overflow-hidden"
                      style={{
                        backgroundColor: "rgba(255,255,255,0.07)",
                        border: "1px solid rgba(255,255,255,0.11)",
                      }}>

                      {/* ── Collapsed row — tap to expand ── */}
                      <div
                        className="flex items-center justify-between px-4 py-3 cursor-pointer select-none active:opacity-70"
                        onClick={() => {
                          navigator.vibrate?.(10);
                          setExpandedIds(prev => {
                            const n = new Set(prev);
                            n.has(key) ? n.delete(key) : n.add(key);
                            return n;
                          });
                        }}
                      >
                        {/* Left: avatar + ticker + name + today's live move */}
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                            style={{ background: "linear-gradient(135deg, #0EA5E9, #6366F1)" }}>
                            {h.ticker.replace(/\.[A-Z]+$/,"").slice(0,2)}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-sm text-white truncate">
                              {h.ticker.replace(/\.[A-Z]+$/,"")}
                              <span className="font-normal text-xs" style={{ color: "#64748B" }}> — {h.name}</span>
                            </p>
                            {h.price > 0 && (
                              <p className="text-xs font-medium" style={{ color: h.changePct >= 0 ? "#4ADE80" : "#F87171" }}>
                                {h.changePct >= 0 ? "+" : ""}{fmt(h.changePct, 2)}%
                                {" "}({h.changePct >= 0 ? "+" : ""}{h.currSymbol}{fmt(Math.abs(todayAbs))}) {t("today","oggi")}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Right: current value + all-time P&L + chevron */}
                        <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                          <div className="text-right">
                            {h.price === 0 ? (
                              <p className="text-sm animate-pulse" style={{ color: "#94A3B8" }}>…</p>
                            ) : (
                              <>
                                <p className="font-bold text-sm text-white">{h.currSymbol}{fmt(h.currentVal)}</p>
                                <p className="text-xs font-semibold" style={{ color: gainColor }}>
                                  {positive ? "+" : ""}{fmt(h.pctGain, 1)}% ({positive ? "+" : ""}{h.currSymbol}{fmt(Math.abs(h.absGain))})
                                </p>
                              </>
                            )}
                          </div>
                          <span style={{ color: "#475569", fontSize: "9px" }}>{isExpanded ? "▲" : "▼"}</span>
                        </div>
                      </div>

                      {/* ── Expanded details ── */}
                      {isExpanded && (
                        <div className="px-4 pb-3 space-y-2"
                          style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>

                          {/* shares · price · avg cost · date */}
                          <p className="text-xs pt-2" style={{ color: "#64748B" }}>
                            {h.shares} {t("shares","az.")} · {h.currSymbol}{fmt(h.price)}/{t("share","az.")}
                            {h.cost_per_share > 0 && (
                              <span> · {t("Avg cost","Costo medio")} {h.currSymbol}{fmt(h.cost_per_share)}</span>
                            )}
                            {h.purchased_at && (
                              <span> · {t("Bought","Acq.")} {new Date(h.purchased_at).toLocaleDateString(appLang === "it" ? "it-IT" : "en-GB", { day: "2-digit", month: "short", year: "numeric" })}</span>
                            )}
                          </p>

                          {/* today % · details link · delete */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <p className="text-xs font-medium" style={{ color: h.changePct >= 0 ? "#4ADE80" : "#F87171" }}>
                                {t("Today","Oggi")}: {h.changePct >= 0 ? "+" : ""}{fmt(h.changePct, 2)}%
                              </p>
                              <a href={`https://www.investing.com/search/?q=${h.ticker}`}
                                target="_blank" rel="noopener noreferrer"
                                className="text-xs" style={{ color: "#38BDF8" }}>
                                {t("Details ↗","Dettagli ↗")}
                              </a>
                            </div>
                            <button
                              onClick={e => { e.stopPropagation(); setDeleteTarget(h); }}
                              className="text-xs px-2 py-0.5 rounded-full"
                              style={{ backgroundColor: "rgba(239,68,68,0.18)", color: "#F87171" }}>✕</button>
                          </div>

                          {/* AI signal */}
                          {signalsLoading && !signals[h.ticker] && (
                            <p className="text-xs animate-pulse" style={{ color: "#64748B" }}>
                              {t("Analysing…", "Analisi…")}
                            </p>
                          )}
                          {signals[h.ticker] && (
                            <HoldingSignalRow signal={signals[h.ticker]} t={t} prevScore={prevScores[h.ticker] ?? null} />
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* AI Market Opportunities — S&P 500 + STOXX 600 */}
          <AISuggestionsPanel
            marketSignals={marketSignals}
            marketLoading={marketLoading}
            t={t}
          />
        </div>
      )}

      {/* ── NEWS ── */}
      {activeTab === "News" && (
        <div className="px-4 py-4 space-y-5">

          {/* Loading indicator */}
          {loadingNews && (
            <div className="text-center py-6">
              <p className="text-sm animate-pulse" style={{ color: "#94A3B8" }}>
                {t("Loading news…", "Caricamento notizie…")}
              </p>
            </div>
          )}

          {/* ── Section 1: My Holdings ── */}
          {!loadingNews && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-base">📌</span>
                <h2 className="text-sm font-bold text-white">
                  {t("My Holdings", "I Miei Titoli")}
                </h2>
                <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{ backgroundColor: "rgba(14,165,233,0.2)", color: "#38BDF8" }}>
                  {t("Latest 4", "Ultime 4")}
                </span>
              </div>

              {news.holdings.length === 0 ? (
                <div className="rounded-2xl p-6 text-center"
                  style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "2px dashed rgba(255,255,255,0.12)" }}>
                  <p className="text-sm" style={{ color: "#64748B" }}>
                    {enriched.length === 0
                      ? t("Add investments to see relevant news", "Aggiungi investimenti per vedere le notizie")
                      : t("No recent news for your holdings", "Nessuna notizia recente per i tuoi titoli")}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {news.holdings.map((n, i) => (
                    <NewsCard key={i} item={n} t={t} highlight />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Section 2: Market News ── */}
          {!loadingNews && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-base">🌍</span>
                <h2 className="text-sm font-bold text-white">
                  {t("Market News", "Mercati")}
                </h2>
              </div>

              {news.market.length === 0 ? (
                <div className="rounded-2xl p-6 text-center"
                  style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)" }}>
                  <p className="text-sm" style={{ color: "#64748B" }}>
                    {t("No market news available", "Nessuna notizia di mercato")}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {news.market.map((n, i) => (
                    <NewsCard key={i} item={n} t={t} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Footer */}
          {!loadingNews && (news.holdings.length > 0 || news.market.length > 0) && (
            <div className="text-center pb-2 space-y-1">
              <p className="text-xs" style={{ color: "#475569" }}>
                {t("Powered by Yahoo Finance · auto-refreshes every 5 min",
                   "Fonte: Yahoo Finance · aggiornamento automatico ogni 5 min")}
              </p>
              {newsUpdatedAt && (
                <p className="text-xs" style={{ color: "#64748B" }}>
                  {t("Last updated", "Aggiornato alle")}{" "}
                  {newsUpdatedAt.toLocaleTimeString(appLang === "it" ? "it-IT" : "en-GB", {
                    hour: "2-digit", minute: "2-digit",
                  })}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── ANALYSIS ── */}
      {activeTab === "Analysis" && (
        <div className="px-4 py-4 space-y-4">

          {/* Section header */}
          <div>
            <h2 className="text-sm font-semibold mb-0.5 text-white">
              {t("Is it worth buying? — AI answers", "Vale la pena comprare? — risponde l'AI")}
            </h2>
            <p className="text-xs" style={{ color: "#64748B" }}>
              {t(
                "We run 4 financial models on your stocks and give you a simple verdict: Undervalued, Fair, or Overvalued.",
                "Eseguiamo 4 modelli finanziari sui tuoi titoli e ti diamo un verdetto semplice: Sottovalutato, Giusto o Sopravvalutato."
              )}
            </p>
          </div>

          {/* Diversification panel — shows when 2+ holdings exist */}
          {enriched.length >= 2 && (
            <DiversificationPanel
              holdings={enriched.map(h => ({
                ticker:         h.ticker,
                shares:         h.shares,
                cost_per_share: h.cost_per_share,
                currentVal:     h.currentVal,
              }))}
              riskResult={riskResult}
              t={t}
            />
          )}

          {enriched.length === 0 ? (
            <div className="rounded-2xl p-8 text-center"
              style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)" }}>
              <p className="text-2xl mb-2">📊</p>
              <p className="text-sm" style={{ color: "#64748B" }}>
                {t("Add your first investment to get started","Aggiungi il tuo primo investimento per iniziare")}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {(() => {
                // Biggest holding loads immediately (0 ms stagger, full 4-model analysis).
                // All other holdings are "simple" (P/E only) and stagger to avoid rate limits.
                // Data is cached by date → each card fetches once per day, not on every page open.
                let simpleIdx = 0;
                // Sort so biggest holding appears first
                const sorted = [...enriched].sort((a, b) =>
                  b.ticker.toUpperCase() === freeExcelTicker ? 1 :
                  a.ticker.toUpperCase() === freeExcelTicker ? -1 : 0
                );
                return sorted.map(h => {
                  const isFree  = h.ticker.toUpperCase() === freeExcelTicker;
                  // Simple cards: batch of 3 every 15 s. Biggest loads immediately.
                  const sMs     = isFree ? 0 : 3_000 + Math.floor(simpleIdx / 3) * 15_000;
                  if (!isFree) simpleIdx++;
                  return (
                    <ValuationCard
                      key={h.id}
                      ticker={h.ticker}
                      name={h.name}
                      price={h.price}
                      currSym={h.currSymbol}
                      pctGain={h.pctGain}
                      isLargestHolding={isFree}
                      isSimple={!isFree}
                      staggerMs={sMs}
                      t={t}
                      appLang={appLang}
                    />
                  );
                });
              })()}
            </div>
          )}

          {/* ── Community Analyses ── */}
          {(() => {
            const heldTickers = new Set(enriched.map(h => h.ticker.toUpperCase()));
            const myTicker    = communityAnalyses.filter(a => heldTickers.has(a.ticker.toUpperCase()));
            const otherAll    = communityAnalyses.filter(a => !heldTickers.has(a.ticker.toUpperCase()));

            function CommunityCard({ a }: { a: CommunityAnalysis }) {
              const sentColor =
                a.sentiment === "bullish" ? "#16A34A" :
                a.sentiment === "bearish" ? "#DC2626" : "#CA8A04";
              const sentLabel =
                a.sentiment === "bullish" ? t("🐂 Bullish", "🐂 Rialzista") :
                a.sentiment === "bearish" ? t("🐻 Bearish", "🐻 Ribassista") :
                                           t("⚖️ Neutral", "⚖️ Neutrale");
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
                <div className="rounded-2xl px-4 py-3 space-y-2"
                  style={{
                    backgroundColor: "rgba(255,255,255,0.06)",
                    border: `1px solid ${a.sentiment === "bullish" ? "rgba(74,222,128,0.18)" : a.sentiment === "bearish" ? "rgba(248,113,113,0.18)" : "rgba(255,255,255,0.10)"}`,
                  }}>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <button
                        onClick={() => setTickerDetail({ ticker: a.ticker, name: a.ticker_name })}
                        className="font-mono font-bold text-sm transition-opacity hover:opacity-70"
                        style={{ color: "#38BDF8" }}>
                        {a.ticker}
                      </button>
                      {a.ticker_name && (
                        <span className="text-xs truncate" style={{ color: "#64748B" }}>— {a.ticker_name}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => setProfileSubject(a.display_name)}
                        className="text-xs transition-opacity hover:opacity-70"
                        style={{ color: "#64748B" }}>
                        {a.display_name} · {dateStr}
                      </button>
                      {a.user_id === userId && (
                        <button
                          onClick={() => handleDeleteAnalysis(a.id)}
                          className="text-xs px-1.5 py-0.5 rounded-full transition-opacity hover:opacity-70"
                          style={{ backgroundColor: "rgba(239,68,68,0.15)", color: "#F87171" }}>
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: `${sentColor}22`, color: sentColor }}>{sentLabel}</span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: "rgba(14,165,233,0.12)", color: "#38BDF8" }}>{horizonLabel}</span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: "rgba(99,102,241,0.12)", color: "#A5B4FC" }}>
                      {t("Conv:", "Conv:")} {convLabel}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs font-medium mb-0.5" style={{ color: "#4ADE80" }}>{t("Bull Case", "Tesi Rialzista")}</p>
                    <p className="text-xs leading-relaxed" style={{ color: "#CBD5E1" }}>{a.bull_case}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium mb-0.5" style={{ color: "#F87171" }}>{t("Risk", "Rischio")}</p>
                    <p className="text-xs leading-relaxed" style={{ color: "#94A3B8" }}>{a.risk}</p>
                  </div>
                </div>
              );
            }

            return (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h2 className="text-sm font-semibold text-white">
                      💬 {t("Community Analyses", "Analisi della Community")}
                    </h2>
                    <p className="text-xs mt-0.5" style={{ color: "#64748B" }}>
                      {t("Share your thesis, read others'", "Condividi la tua tesi, leggi quelle degli altri")}
                    </p>
                  </div>
                  <button
                    onClick={() => setShowAnalysisWizard(true)}
                    className="px-3 py-1.5 rounded-full text-xs font-semibold text-white transition-transform hover:scale-105 active:scale-95 shadow-lg"
                    style={{ background: "linear-gradient(135deg, #0EA5E9, #6366F1)" }}>
                    {t("+ Write", "+ Scrivi")}
                  </button>
                </div>

                {communityLoading && (
                  <div className="space-y-2">
                    {[1, 2].map(i => (
                      <div key={i} className="rounded-2xl px-4 py-4 animate-pulse"
                        style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", height: 90 }} />
                    ))}
                  </div>
                )}

                {!communityLoading && communityAnalyses.length === 0 && (
                  <div className="rounded-2xl p-6 text-center"
                    style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "2px dashed rgba(255,255,255,0.10)" }}>
                    <p className="text-2xl mb-2">✍️</p>
                    <p className="text-sm font-medium mb-1 text-white">{t("No analyses yet", "Nessuna analisi ancora")}</p>
                    <p className="text-xs mb-3" style={{ color: "#64748B" }}>
                      {t("Be the first to share your thesis", "Sii il primo a condividere la tua tesi")}
                    </p>
                    <button onClick={() => setShowAnalysisWizard(true)}
                      className="px-5 py-2 rounded-full text-sm font-semibold text-white"
                      style={{ background: "linear-gradient(135deg, #0EA5E9, #6366F1)" }}>
                      {t("Write Analysis", "Scrivi Analisi")}
                    </button>
                  </div>
                )}

                {!communityLoading && communityAnalyses.length > 0 && (
                  <div className="space-y-4 pb-4">
                    {/* My holdings section */}
                    {myTicker.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold mb-2 flex items-center gap-1.5" style={{ color: "#38BDF8" }}>
                          <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: "#38BDF8" }} />
                          {t("For Your Holdings", "Per i Tuoi Titoli")}
                        </p>
                        <div className="space-y-3">
                          {myTicker.map(a => <CommunityCard key={a.id} a={a} />)}
                        </div>
                      </div>
                    )}

                    {/* All analyses */}
                    {otherAll.length > 0 && (
                      <div>
                        {myTicker.length > 0 && (
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-semibold flex items-center gap-1.5" style={{ color: "#64748B" }}>
                              <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: "#64748B" }} />
                              {t("All Analyses", "Tutte le Analisi")}
                            </p>
                            <button
                              onClick={() => setShowAllCommunity(v => !v)}
                              className="text-xs font-medium"
                              style={{ color: "#38BDF8" }}>
                              {showAllCommunity ? t("Hide ▲", "Nascondi ▲") : `${t("Show", "Mostra")} ${otherAll.length} ▼`}
                            </button>
                          </div>
                        )}
                        {(myTicker.length === 0 || showAllCommunity) && (
                          <div className="space-y-3">
                            {otherAll.map(a => <CommunityCard key={a.id} a={a} />)}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

        </div>
      )}

      {/* ── LEARN ── */}
      {activeTab === "Learn" && (
        <LearnTab enriched={enriched} signals={signals} t={t} appLang={appLang} />
      )}

      {/* ── WATCHLIST ── */}
      {activeTab === "Watchlist" && (
        <WatchlistTab
          t={t}
          appLang={appLang}
          onAddToPortfolio={({ ticker, name }) => {
            setVoicePrefill({ ticker, name, shares: "", cost: "", date: "" });
            setShowAdd(true);
          }}
        />
      )}

      {/* ── COMMUNITY ── */}
      {activeTab === "Community" && (
        <div className="px-4 py-4 space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-white">
                💬 {t("Community", "Community")}
              </h2>
              <p className="text-xs mt-0.5" style={{ color: "#64748B" }}>
                {t("Analyses shared by the community", "Analisi condivise dalla community")}
              </p>
            </div>
            <button
              onClick={() => setShowAnalysisWizard(true)}
              className="px-3 py-1.5 rounded-full text-xs font-semibold text-white transition-transform hover:scale-105 active:scale-95 shadow-lg"
              style={{ background: "linear-gradient(135deg, #0EA5E9, #6366F1)" }}>
              {t("+ Write", "+ Scrivi")}
            </button>
          </div>

          {communityLoading && (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="rounded-2xl px-4 py-4 animate-pulse"
                  style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", height: 100 }} />
              ))}
            </div>
          )}

          {!communityLoading && communityAnalyses.length === 0 && (
            <div className="rounded-2xl p-8 text-center"
              style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "2px dashed rgba(255,255,255,0.10)" }}>
              <p className="text-3xl mb-2">✍️</p>
              <p className="text-sm font-medium mb-1 text-white">{t("No analyses yet", "Nessuna analisi ancora")}</p>
              <p className="text-xs mb-4" style={{ color: "#94A3B8" }}>
                {t("Be the first to share your thesis", "Sii il primo a condividere la tua tesi")}
              </p>
              <button onClick={() => setShowAnalysisWizard(true)}
                className="px-5 py-2 rounded-full text-sm font-semibold text-white"
                style={{ background: "linear-gradient(135deg, #0EA5E9, #6366F1)" }}>
                {t("Write Analysis", "Scrivi Analisi")}
              </button>
            </div>
          )}

          {!communityLoading && communityAnalyses.length > 0 && (
            <div className="space-y-3 pb-28">
              {communityAnalyses.map(a => {
                const sentColor =
                  a.sentiment === "bullish" ? "#16A34A" :
                  a.sentiment === "bearish" ? "#DC2626" : "#CA8A04";
                const sentLabel =
                  a.sentiment === "bullish" ? t("🐂 Bullish", "🐂 Rialzista") :
                  a.sentiment === "bearish" ? t("🐻 Bearish", "🐻 Ribassista") :
                                             t("⚖️ Neutral", "⚖️ Neutrale");
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
                      <div className="flex items-center gap-2 min-w-0">
                        <button
                          onClick={() => setTickerDetail({ ticker: a.ticker, name: a.ticker_name })}
                          className="font-mono font-bold text-sm transition-opacity hover:opacity-70"
                          style={{ color: "#38BDF8" }}>
                          {a.ticker}
                        </button>
                        {a.ticker_name && (
                          <span className="text-xs truncate" style={{ color: "#64748B" }}>— {a.ticker_name}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => setProfileSubject(a.display_name)}
                          className="text-xs transition-opacity hover:opacity-70"
                          style={{ color: "#64748B" }}>
                          {a.display_name} · {dateStr}
                        </button>
                        {a.user_id === userId && (
                          <button
                            onClick={() => handleDeleteAnalysis(a.id)}
                            className="text-xs px-1.5 py-0.5 rounded-full transition-opacity hover:opacity-70"
                            style={{ backgroundColor: "rgba(239,68,68,0.15)", color: "#F87171" }}>
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1.5 flex-wrap">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: `${sentColor}22`, color: sentColor }}>{sentLabel}</span>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: "rgba(14,165,233,0.12)", color: "#38BDF8" }}>{horizonLabel}</span>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: "rgba(99,102,241,0.12)", color: "#A5B4FC" }}>
                        {t("Conv:", "Conv:")} {convLabel}
                      </span>
                    </div>
                    <div>
                      <p className="text-xs font-medium mb-0.5" style={{ color: "#4ADE80" }}>{t("Bull Case", "Tesi Rialzista")}</p>
                      <p className="text-xs leading-relaxed" style={{ color: "#CBD5E1" }}>{a.bull_case}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium mb-0.5" style={{ color: "#F87171" }}>{t("Risk", "Rischio")}</p>
                      <p className="text-xs leading-relaxed" style={{ color: "#94A3B8" }}>{a.risk}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── PROFILE SLIDE-UP PANEL ── */}
      {profileOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => { setProfileOpen(false); setProfileDragY(0); }}
          />
          {/* Sheet */}
          <div className="relative rounded-t-3xl overflow-y-auto max-h-[92vh]"
            style={{
              backgroundColor: "#0A1628",
              border: "1px solid rgba(255,255,255,0.12)",
              transform: `translateY(${profileDragY}px)`,
              transition: profileDragStart.current !== null ? "none" : "transform 0.3s ease",
            }}>

            {/* Handle + header — drag target */}
            <div className="sticky top-0 z-10 px-4 pt-4 pb-3 touch-none"
              style={{ backgroundColor: "#0A1628", borderBottom: "1px solid rgba(255,255,255,0.08)" }}
              onTouchStart={e => {
                profileDragStart.current = e.touches[0].clientY;
                setProfileDragY(0);
              }}
              onTouchMove={e => {
                if (profileDragStart.current === null) return;
                const delta = e.touches[0].clientY - profileDragStart.current;
                if (delta > 0) setProfileDragY(delta);
              }}
              onTouchEnd={() => {
                if (profileDragY > 80) {
                  setProfileOpen(false);
                  setProfileDragY(0);
                } else {
                  setProfileDragY(0);
                }
                profileDragStart.current = null;
              }}>
              <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-3" />
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-white text-base">
                  {t("My Profile", "Il mio Profilo")}
                </h2>
                <button
                  onClick={() => { setProfileOpen(false); setProfileDragY(0); }}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white/60 hover:text-white transition-colors"
                  style={{ backgroundColor: "rgba(255,255,255,0.08)" }}>
                  ✕
                </button>
              </div>
            </div>

            <div className="px-4 py-4 space-y-4">

              {/* Language selector card */}
              <div className="rounded-2xl p-5"
                style={{ backgroundColor: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }}>
                <h3 className="font-bold text-sm mb-1 text-white">
                  {appLang === "it" ? "🌍 Lingua / Language" : "🌍 Language / Lingua"}
                </h3>
                <p className="text-xs mb-4" style={{ color: "#64748B" }}>
                  {appLang === "it"
                    ? "Scegli la lingua per l'app e per Ask Vela (voce + AI)"
                    : "Choose language for the app and Ask Vela (voice + AI)"}
                </p>
                <div className="flex gap-3">
                  {/* English */}
                  <button
                    onClick={() => handleLangChange("en")}
                    className="flex-1 flex flex-col items-center gap-2 py-4 rounded-2xl transition-all"
                    style={{
                      backgroundColor: appLang === "en" ? "#0EA5E9" : "rgba(255,255,255,0.06)",
                      border:          `2px solid ${appLang === "en" ? "#0EA5E9" : "rgba(255,255,255,0.12)"}`,
                    }}>
                    <span className="text-3xl">🇬🇧</span>
                    <span className="text-sm font-semibold" style={{ color: appLang === "en" ? "white" : "#94A3B8" }}>
                      English
                    </span>
                    {appLang === "en" && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{ backgroundColor: "rgba(255,255,255,0.25)", color: "white" }}>
                        Active
                      </span>
                    )}
                  </button>

                  {/* Italian */}
                  <button
                    onClick={() => handleLangChange("it")}
                    className="flex-1 flex flex-col items-center gap-2 py-4 rounded-2xl transition-all"
                    style={{
                      backgroundColor: appLang === "it" ? "#0EA5E9" : "rgba(255,255,255,0.06)",
                      border:          `2px solid ${appLang === "it" ? "#0EA5E9" : "rgba(255,255,255,0.12)"}`,
                    }}>
                    <span className="text-3xl">🇮🇹</span>
                    <span className="text-sm font-semibold" style={{ color: appLang === "it" ? "white" : "#94A3B8" }}>
                      Italiano
                    </span>
                    {appLang === "it" && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{ backgroundColor: "rgba(255,255,255,0.25)", color: "white" }}>
                        Attivo
                      </span>
                    )}
                  </button>
                </div>

                {/* Confirmation message */}
                <p className="text-xs text-center mt-3" style={{ color: "#38BDF8" }}>
                  {appLang === "it"
                    ? "✓ Vela parlerà e capirà l'italiano"
                    : "✓ Vela will speak and understand English"}
                </p>
              </div>

              {/* User profile card */}
              <div className="rounded-2xl p-5"
                style={{ backgroundColor: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }}>
                {/* Avatar with initials */}
                <div className="w-16 h-16 rounded-full mx-auto mb-3 flex items-center justify-center text-2xl font-bold text-white"
                  style={{ background: "linear-gradient(135deg, #0EA5E9, #6366F1)" }}>
                  {displayName ? displayName[0].toUpperCase() : "?"}
                </div>

                {/* Name */}
                <h2 className="font-bold text-lg text-center mb-0.5 text-white">
                  {displayName || t("Your Profile", "Il tuo Profilo")}
                </h2>

                {/* Email */}
                {userEmail && (
                  <p className="text-xs text-center mb-1" style={{ color: "#64748B" }}>{userEmail}</p>
                )}

                {/* Join date */}
                {joinDate && (
                  <p className="text-xs text-center mb-5" style={{ color: "#475569" }}>
                    {t("Member since", "Membro dal")}{" "}
                    {new Date(joinDate).toLocaleDateString(
                      appLang === "it" ? "it-IT" : "en-GB",
                      { month: "long", year: "numeric" }
                    )}
                  </p>
                )}

                {/* Stats strip */}
                <div className="flex justify-center gap-6 mb-5 py-3 rounded-2xl"
                  style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <div className="text-center">
                    <p className="text-xl font-bold text-white">{holdings.length}</p>
                    <p className="text-xs" style={{ color: "#64748B" }}>{t("Holdings", "Titoli")}</p>
                  </div>
                  <div className="w-px self-stretch" style={{ backgroundColor: "rgba(255,255,255,0.10)" }} />
                  <div className="text-center">
                    <p className="text-xl font-bold" style={{ color: totalGain >= 0 ? "#4ADE80" : "#F87171" }}>
                      {totalGain >= 0 ? "+" : ""}{fmt(totalGainPct, 1)}%
                    </p>
                    <p className="text-xs" style={{ color: "#64748B" }}>{t("All-time P&L", "P&L Totale")}</p>
                  </div>
                  <div className="w-px self-stretch" style={{ backgroundColor: "rgba(255,255,255,0.10)" }} />
                  <div className="text-center">
                    {riskResult ? (
                      <>
                        <p className="text-xl font-bold"
                          style={{
                            color: riskResult.profile === "Conservative" ? "#0369A1"
                                 : riskResult.profile === "Balanced"     ? "#CA8A04"
                                 : riskResult.profile === "Growth"       ? "#16A34A" : "#DC2626",
                          }}>
                          {riskResult.profile === "Conservative" ? "🛡️"
                           : riskResult.profile === "Balanced"   ? "⚖️"
                           : riskResult.profile === "Growth"     ? "📈" : "🚀"}
                        </p>
                        <p className="text-xs" style={{ color: "#64748B" }}>
                          {appLang === "it"
                            ? ({ Conservative: "Conservativo", Balanced: "Bilanciato", Growth: "Crescita", Aggressive: "Aggressivo" } as Record<string, string>)[riskResult.profile]
                            : riskResult.profile}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-xl font-bold text-white/40">—</p>
                        <p className="text-xs" style={{ color: "#64748B" }}>{t("Risk", "Rischio")}</p>
                      </>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  {/* ── Risk questionnaire (live) ── */}
                  {riskResult ? (
                    // Show result card
                    <div className="rounded-2xl overflow-hidden"
                      style={{
                        border: `1px solid ${
                          riskResult.profile === "Conservative" ? "#BAE6FD" :
                          riskResult.profile === "Balanced"     ? "#FDE68A" :
                          riskResult.profile === "Growth"       ? "#BBF7D0" : "#FECACA"
                        }`,
                      }}>
                      {/* Header */}
                      <div className="px-4 py-3 flex items-center justify-between"
                        style={{
                          backgroundColor:
                            riskResult.profile === "Conservative" ? "#E0F2FE" :
                            riskResult.profile === "Balanced"     ? "#FEF9C3" :
                            riskResult.profile === "Growth"       ? "#DCFCE7" : "#FEE2E2",
                        }}>
                        <div className="flex items-center gap-2">
                          <span className="text-lg">
                            {riskResult.profile === "Conservative" ? "🛡️" :
                             riskResult.profile === "Balanced"     ? "⚖️" :
                             riskResult.profile === "Growth"       ? "📈" : "🚀"}
                          </span>
                          <div>
                            <p className="text-sm font-bold"
                              style={{
                                color:
                                  riskResult.profile === "Conservative" ? "#0369A1" :
                                  riskResult.profile === "Balanced"     ? "#CA8A04" :
                                  riskResult.profile === "Growth"       ? "#16A34A" : "#DC2626",
                              }}>
                              {appLang === "it"
                                ? ({ Conservative: "Conservativo", Balanced: "Bilanciato", Growth: "Crescita", Aggressive: "Aggressivo" }[riskResult.profile])
                                : riskResult.profile}
                            </p>
                            <p className="text-xs" style={{ color: "#64748B" }}>
                              {t("Score", "Punteggio")}: {riskResult.score}/25
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => setShowRiskModal(true)}
                          className="text-xs px-3 py-1.5 rounded-full font-medium"
                          style={{ backgroundColor: "white", color: "#0EA5E9", border: "1px solid #BAE6FD" }}>
                          {t("Retake", "Rifai")}
                        </button>
                      </div>
                      {/* Allocation bar */}
                      <div className="px-4 py-3" style={{ backgroundColor: "white" }}>
                        <p className="text-xs font-medium mb-2" style={{ color: "#64748B" }}>
                          {t("Suggested allocation", "Allocazione suggerita")}
                        </p>
                        <div className="flex rounded-full overflow-hidden h-2.5 mb-2">
                          <div style={{ width: `${riskResult.stocks}%`, backgroundColor: "#0EA5E9" }} />
                          <div style={{ width: `${riskResult.bonds}%`,  backgroundColor: "#6366F1" }} />
                          <div style={{ width: `${riskResult.cash}%`,   backgroundColor: "#94A3B8" }} />
                        </div>
                        <div className="flex gap-3 flex-wrap">
                          {[
                            { label: t("Stocks","Azioni"), pct: riskResult.stocks, color: "#0EA5E9" },
                            { label: t("Bonds","Obbligaz."),  pct: riskResult.bonds,  color: "#6366F1" },
                            { label: t("Cash","Liquidità"),   pct: riskResult.cash,   color: "#94A3B8" },
                          ].map(item => (
                            <div key={item.label} className="flex items-center gap-1">
                              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                              <span className="text-xs" style={{ color: "#64748B" }}>
                                {item.label} <strong style={{ color: "#1E3A5F" }}>{item.pct}%</strong>
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    // No result yet — show prompt button
                    <button
                      onClick={() => setShowRiskModal(true)}
                      className="w-full flex justify-between items-center px-4 py-3 rounded-xl transition-all"
                      style={{
                        backgroundColor: "rgba(14,165,233,0.10)",
                        border: "1px solid rgba(14,165,233,0.25)",
                      }}>
                      <span className="text-sm text-white">
                        {t("🎯 Discover your investor profile", "🎯 Scopri il tuo profilo investitore")}
                      </span>
                      <span className="text-xs px-2.5 py-1 rounded-full font-medium"
                        style={{ backgroundColor: "#0EA5E9", color: "white" }}>
                        {t("Start →", "Inizia →")}
                      </span>
                    </button>
                  )}

                  {/* Sign out */}
                  <button
                    onClick={async () => {
                      await supabase.auth.signOut();
                      window.location.href = "/login";
                    }}
                    className="w-full flex justify-between items-center px-4 py-3 rounded-xl transition-all"
                    style={{ backgroundColor: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.20)" }}>
                    <span className="text-sm font-medium" style={{ color: "#F87171" }}>
                      {t("Sign out", "Disconnetti")}
                    </span>
                    <span style={{ color: "#F87171" }}>›</span>
                  </button>
                </div>
              </div>

              {/* ── Danger zone ─────────────────────────────────────────────────── */}
              <div className="rounded-2xl p-5 mb-4" style={{ backgroundColor: "rgba(220,38,38,0.07)", border: "1px solid rgba(239,68,68,0.25)" }}>
                <h3 className="text-sm font-bold mb-1" style={{ color: "#DC2626" }}>
                  {appLang === "it" ? "⚠️ Zona pericolosa" : "⚠️ Danger zone"}
                </h3>
                <p className="text-xs mb-4" style={{ color: "#94A3B8" }}>
                  {appLang === "it"
                    ? "Elimina account, titoli e tutti i dati. Operazione irreversibile."
                    : "Deletes your account, all holdings and data. This cannot be undone."}
                </p>

                {!showDeleteConfirm ? (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="w-full py-3 rounded-xl text-sm font-semibold transition-colors"
                    style={{ backgroundColor: "#FEE2E2", color: "#DC2626" }}>
                    {appLang === "it" ? "Elimina account" : "Delete account"}
                  </button>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-center py-2" style={{ color: "#DC2626" }}>
                      {appLang === "it" ? "Sei sicuro? Questa azione è irreversibile." : "Are you sure? This cannot be undone."}
                    </p>
                    <button
                      disabled={deletingAccount}
                      onClick={async () => {
                        setDeletingAccount(true);
                        try {
                          await fetch("/api/delete-account", { method: "DELETE" });
                        } catch {}
                        // Clear all local state regardless of API result
                        Object.keys(localStorage).forEach(k => {
                          if (k.startsWith("vela_")) localStorage.removeItem(k);
                        });
                        await supabase.auth.signOut();
                        window.location.href = "/login";
                      }}
                      className="w-full py-3 rounded-xl text-sm font-bold transition-opacity disabled:opacity-60"
                      style={{ backgroundColor: "#DC2626", color: "white" }}>
                      {deletingAccount
                        ? (appLang === "it" ? "Eliminazione…" : "Deleting…")
                        : (appLang === "it" ? "Sì, elimina tutto" : "Yes, delete everything")}
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      className="w-full py-2 text-sm"
                      style={{ color: "#94A3B8" }}>
                      {appLang === "it" ? "Annulla" : "Cancel"}
                    </button>
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      )}

      {/* ── VOICE BUTTON ── */}
      <div className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-6 flex flex-col items-center gap-1">
        <span className="text-xs font-medium px-2 py-0.5 rounded-full text-white"
          style={{ backgroundColor: "rgba(30,58,95,0.7)" }}>{t("Ask Vela","Chiedi a Vela")}</span>
        <button
          onClick={() => router.push("/chat")}
          className="w-14 h-14 rounded-full shadow-xl flex items-center justify-center text-xl transition-transform hover:scale-105 active:scale-95"
          style={{ backgroundColor: "#0EA5E9" }}
          title="Chat with Vela">⛵</button>
      </div>
    </div>
  );
}
