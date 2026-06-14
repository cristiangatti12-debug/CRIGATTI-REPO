"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import type { Lang } from "@/lib/i18n";
import type { TickerSignal, WatchlistItem } from "@/types";

// ── Constants ─────────────────────────────────────────────────────────────────
const STORAGE_KEY = "vela_watchlist_v1";
const SIG_CACHE   = "vela_wl_signals_v4";

const SIGNAL_STYLE: Record<string, { bg: string; color: string }> = {
  BUY:  { bg: "#DCFCE7", color: "#16A34A" },
  HOLD: { bg: "#FEF9C3", color: "#CA8A04" },
  SELL: { bg: "#FEE2E2", color: "#DC2626" },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n: number, digits = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
function loadItems(): WatchlistItem[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"); } catch { return []; }
}
function saveItems(items: WatchlistItem[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch {}
}

// ── Add modal ─────────────────────────────────────────────────────────────────
interface TickerResult { symbol: string; name: string; type: string; exchange: string; }

function AddModal({ onClose, onSave, t }: {
  onClose: () => void;
  onSave:  (item: WatchlistItem) => void;
  t: (en: string, it: string) => string;
}) {
  const [query,       setQuery]       = useState("");
  const [results,     setResults]     = useState<TickerResult[]>([]);
  const [searching,   setSearching]   = useState(false);
  const [selected,    setSelected]    = useState<{ symbol: string; name: string } | null>(null);
  const [targetPrice, setTargetPrice] = useState("");
  const [notes,       setNotes]       = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  function pick(r: TickerResult) {
    setSelected({ symbol: r.symbol, name: r.name });
    setQuery(r.symbol);
    setResults([]);
  }

  function handleSave() {
    if (!selected) return;
    const item: WatchlistItem = {
      ticker:   selected.symbol,
      name:     selected.name,
      added_at: new Date().toISOString(),
      ...(targetPrice ? { target_price: parseFloat(targetPrice) } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };
    onSave(item);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg rounded-t-3xl p-6 pb-10 shadow-2xl"
        style={{ backgroundColor: "white" }}>

        <div className="flex justify-between items-center mb-5">
          <h2 className="text-lg font-bold" style={{ color: "#1E3A5F" }}>
            {t("Add to Watchlist", "Aggiungi agli Osservati")}
          </h2>
          <button onClick={onClose} className="text-2xl leading-none" style={{ color: "#94A3B8" }}>×</button>
        </div>

        <div className="space-y-3">
          {/* Ticker search */}
          <div className="relative">
            <label className="text-xs font-medium block mb-1" style={{ color: "#64748B" }}>
              {t("Ticker / Name *", "Ticker / Nome *")}
            </label>
            <div className="relative">
              <input
                autoComplete="off"
                className="w-full rounded-xl px-4 py-3 text-sm font-mono uppercase outline-none"
                style={{ backgroundColor: "#F0F9FF", border: "1px solid #BAE6FD", color: "#1E3A5F" }}
                placeholder={t("Search: AAPL, NVDA, VWCE…", "Cerca: AAPL, NVDA, VWCE…")}
                value={query}
                onChange={e => handleQueryChange(e.target.value)}
                onBlur={() => setTimeout(() => setResults([]), 150)}
              />
              {searching && (
                <span className="absolute right-3 top-3 text-xs animate-pulse" style={{ color: "#0EA5E9" }}>…</span>
              )}
            </div>
            {results.length > 0 && (
              <div className="absolute z-10 w-full mt-1 rounded-2xl shadow-xl overflow-hidden"
                style={{ backgroundColor: "white", border: "1px solid #BAE6FD" }}>
                {results.map(r => (
                  <button key={r.symbol}
                    className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-blue-50"
                    onMouseDown={() => pick(r)}>
                    <div>
                      <span className="font-mono font-bold text-sm" style={{ color: "#0EA5E9" }}>{r.symbol}</span>
                      <span className="text-xs ml-2" style={{ color: "#1E3A5F" }}>{r.name}</span>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: "#F0F9FF", color: "#64748B" }}>{r.exchange}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Target price */}
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "#64748B" }}>
              {t("Target buy price (optional)", "Prezzo obiettivo (opzionale)")}
            </label>
            <input type="number" min="0" step="any"
              className="w-full rounded-xl px-4 py-3 text-sm outline-none"
              style={{ backgroundColor: "#F0F9FF", border: "1px solid #BAE6FD", color: "#1E3A5F" }}
              placeholder="150.00"
              value={targetPrice}
              onChange={e => setTargetPrice(e.target.value)} />
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "#64748B" }}>
              {t("Note (optional)", "Nota (opzionale)")}
            </label>
            <input
              className="w-full rounded-xl px-4 py-3 text-sm outline-none"
              style={{ backgroundColor: "#F0F9FF", border: "1px solid #BAE6FD", color: "#1E3A5F" }}
              placeholder={t("e.g. Wait for earnings dip", "es. Aspetto calo post-utili")}
              value={notes}
              onChange={e => setNotes(e.target.value)} />
          </div>

          <button
            onClick={handleSave}
            disabled={!selected}
            className="w-full py-3 rounded-xl font-semibold text-sm transition-opacity"
            style={{ backgroundColor: "#6366F1", color: "white", opacity: selected ? 1 : 0.4 }}>
            {t("Add to Watchlist", "Aggiungi agli Osservati")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
interface Props {
  t: (en: string, it: string) => string;
  appLang: Lang;
  onAddToPortfolio: (prefill: { ticker: string; name: string }) => void;
  userId: string | null;
}

interface AiState { analysis: string | null; loading: boolean; error: string; }

export default function WatchlistTab({ t, appLang, onAddToPortfolio, userId }: Props) {
  const [items,          setItems]          = useState<WatchlistItem[]>([]);
  const [prices,         setPrices]         = useState<Record<string, { price: number; changePct: number; currency: string }>>({});
  const [signals,        setSignals]        = useState<Record<string, TickerSignal>>({});
  const [signalsLoading, setSignalsLoading] = useState(false);
  const [expandedIds,    setExpandedIds]    = useState<Set<string>>(new Set());
  const [showAddModal,   setShowAddModal]   = useState(false);
  const [aiStates,       setAiStates]       = useState<Record<string, AiState>>({});
  const [usedToday,      setUsedToday]      = useState(() => {
    if (typeof window === "undefined") return false;
    const saved = localStorage.getItem("vela_ai_asks_date");
    const today = new Date().toISOString().split("T")[0];
    if (saved !== today) return false;
    return parseInt(localStorage.getItem("vela_ai_asks_count") ?? "0", 10) >= 1;
  });

  function getAiState(ticker: string): AiState {
    return aiStates[ticker] ?? { analysis: null, loading: false, error: "" };
  }

  async function handleAskAI(ticker: string, score: number | null, signal: string) {
    if (usedToday || !userId || getAiState(ticker).loading) return;
    setAiStates(prev => ({ ...prev, [ticker]: { analysis: null, loading: true, error: "" } }));
    try {
      const res  = await fetch(`/api/signal-analysis?ticker=${ticker}&score=${score ?? 0}&signal=${signal}&lang=${appLang}`);
      const data = await res.json();
      if (res.status === 429 || data.limited) {
        setUsedToday(true);
        setAiStates(prev => ({ ...prev, [ticker]: { analysis: null, loading: false, error: t("Daily limit reached. Resets at midnight UTC.", "Limite giornaliero raggiunto. Si resetta a mezzanotte UTC.") } }));
      } else if (data.analysis) {
        setAiStates(prev => ({ ...prev, [ticker]: { analysis: data.analysis, loading: false, error: "" } }));
        const today = new Date().toISOString().split("T")[0];
        localStorage.setItem("vela_ai_asks_date", today);
        localStorage.setItem("vela_ai_asks_count", "1");
        setUsedToday(true);
      } else {
        setAiStates(prev => ({ ...prev, [ticker]: { analysis: null, loading: false, error: t("Analysis unavailable. Try again.", "Analisi non disponibile. Riprova.") } }));
      }
    } catch {
      setAiStates(prev => ({ ...prev, [ticker]: { analysis: null, loading: false, error: t("Analysis unavailable. Try again.", "Analisi non disponibile. Riprova.") } }));
    }
  }

  // Load persisted items on mount
  useEffect(() => { setItems(loadItems()); }, []);

  // Fetch live prices for the given items list
  const fetchPrices = useCallback((hs: WatchlistItem[]) => {
    if (hs.length === 0) { setPrices({}); return; }
    const symbols = hs.map(i => i.ticker).join(",");
    fetch(`/api/prices?symbols=${symbols}`)
      .then(r => r.json())
      .then((data: { symbol: string; price: number; changePct: number; currency: string }[]) => {
        const map: Record<string, { price: number; changePct: number; currency: string }> = {};
        data.forEach(q => { map[q.symbol] = q; });
        setPrices(map);
      })
      .catch(() => {});
  }, []);

  useEffect(() => { fetchPrices(items); }, [items, fetchPrices]);

  // Fetch AI signals with 24h localStorage cache
  const fetchSignals = useCallback(async (overrideItems?: WatchlistItem[]) => {
    const hs = overrideItems ?? items;
    if (hs.length === 0) { setSignals({}); return; }
    const sorted   = hs.map(i => i.ticker).sort().join(",");
    const cacheKey = `${SIG_CACHE}_${appLang}_${sorted}`;
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
      const tickers = hs.map(i => i.ticker).join(",");
      const costs   = hs.map(() => "0").join(",");
      const res  = await fetch(`/api/signals?tickers=${tickers}&costs=${costs}&lang=${appLang}`);
      const data: TickerSignal[] = await res.json();
      if (Array.isArray(data)) {
        setSignals(Object.fromEntries(data.map(s => [s.ticker, s])));
        localStorage.setItem(cacheKey, JSON.stringify({ data, ts: Date.now() }));
      }
    } catch {}
    setSignalsLoading(false);
  }, [items, appLang]);

  useEffect(() => { fetchSignals(); }, [fetchSignals]);

  function persist(next: WatchlistItem[]) { setItems(next); saveItems(next); }
  function removeItem(ticker: string)    { persist(items.filter(i => i.ticker !== ticker)); }
  function addItem(item: WatchlistItem)  {
    const next = [...items.filter(i => i.ticker !== item.ticker), item];
    persist(next);
    fetchPrices(next);
    fetchSignals(next);
  }

  function handleAddToPortfolio(item: WatchlistItem) {
    onAddToPortfolio({ ticker: item.ticker, name: item.name });
    removeItem(item.ticker);
  }

  return (
    <div className="px-4 py-4 space-y-4">

      {/* ── Header ── */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-sm font-semibold text-white">
            🔭 {t("My Watchlist", "I Miei Osservati")}
          </h2>
          <p className="text-xs mt-0.5" style={{ color: "#64748B" }}>
            {t("Track instruments before you buy", "Monitora i titoli prima di comprare")}
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-lg font-bold transition-transform hover:scale-105 active:scale-95 shadow-lg"
          style={{ background: "linear-gradient(135deg, #6366F1, #8B5CF6)" }}>+</button>
      </div>

      {/* ── Empty state ── */}
      {items.length === 0 && (
        <div className="rounded-2xl p-8 text-center"
          style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "2px dashed rgba(255,255,255,0.15)" }}>
          <p className="text-3xl mb-2">🔭</p>
          <p className="font-semibold text-sm mb-1 text-white">
            {t("Your watchlist is empty", "La tua lista osservati è vuota")}
          </p>
          <p className="text-xs mb-4" style={{ color: "#94A3B8" }}>
            {t("Add stocks you're considering buying", "Aggiungi titoli che stai valutando di acquistare")}
          </p>
          <button onClick={() => setShowAddModal(true)}
            className="px-5 py-2 rounded-full text-sm font-semibold text-white"
            style={{ backgroundColor: "#6366F1" }}>
            {t("Add instrument", "Aggiungi strumento")}
          </button>
        </div>
      )}

      {/* ── Cards ── */}
      {items.map(item => {
        const q          = prices[item.ticker];
        const price      = q?.price      ?? 0;
        const changePct  = q?.changePct  ?? 0;
        const currSymbol = q?.currency === "EUR" ? "€" : "$";
        const todayAbs   = price * changePct / 100;
        const isExpanded = expandedIds.has(item.ticker);
        const sig        = signals[item.ticker];

        // Target price row
        let targetNode: React.ReactNode = null;
        if (item.target_price && price > 0) {
          const diff    = ((item.target_price - price) / price) * 100;
          const reached = price >= item.target_price;
          targetNode = (
            <p className="text-xs">
              <span style={{ color: "#64748B" }}>{t("Target", "Obiettivo")}: </span>
              <span className="text-white font-medium">{currSymbol}{fmt(item.target_price)}</span>
              <span className="ml-1.5 font-semibold" style={{ color: reached ? "#4ADE80" : "#FCD34D" }}>
                {reached
                  ? `✓ ${t("Reached!", "Raggiunto!")}`
                  : `${diff.toFixed(1)}% ${t("to go", "mancante")}`}
              </span>
            </p>
          );
        }

        // P/E row
        let peNode: React.ReactNode = null;
        if (sig?.meta) {
          const { pe, fairPE } = sig.meta;
          const unprofitable = sig.meta.unprofitable ?? false;
          if (unprofitable) {
            peNode = (
              <p className="text-xs" style={{ color: "#F87171" }}>
                {t("Currently unprofitable (negative earnings)", "Attualmente in perdita (utili negativi)")}
              </p>
            );
          } else if (pe === null || pe === undefined) {
            const { ter, aum } = sig.meta as { ter?: number | null; aum?: number | null };
            if (ter !== null && ter !== undefined) {
              const aumStr = aum
                ? aum >= 1e9
                  ? ` · AUM $${(aum / 1e9).toFixed(1)}B`
                  : ` · AUM $${(aum / 1e6).toFixed(0)}M`
                : "";
              peNode = (
                <p className="text-xs">
                  <span style={{ color: "#94A3B8" }}>TER </span>
                  <span className="text-white font-semibold">{(ter * 100).toFixed(2)}%/yr</span>
                  {aumStr && <span style={{ color: "#64748B" }}>{aumStr}</span>}
                </p>
              );
            } else {
              peNode = (
                <p className="text-xs" style={{ color: "#64748B" }}>
                  {t("No P/E data (ETF / index)", "P/E non disponibile (ETF / indice)")}
                </p>
              );
            }
          } else {
            const ratio    = pe / fairPE;
            const peColor  = ratio < 0.85 ? "#4ADE80" : ratio > 1.15 ? "#F87171" : "#FCD34D";
            const peLabel  = ratio < 0.85
              ? t("undervalued", "sottovalutato")
              : ratio > 1.15
              ? t("overvalued", "sopravvalutato")
              : t("fair value", "valore equo");
            peNode = (
              <p className="text-xs">
                <span style={{ color: "#94A3B8" }}>P/E </span>
                <span className="text-white font-semibold">{pe.toFixed(1)}x</span>
                <span style={{ color: "#64748B" }}> · {t("Fair", "Equo")} {fairPE}x</span>
                <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded-full font-medium"
                  style={{ backgroundColor: `${peColor}22`, color: peColor }}>
                  {peLabel}
                </span>
              </p>
            );
          }
        }

        return (
          <div key={item.ticker} className="rounded-2xl overflow-hidden"
            style={{ backgroundColor: "rgba(255,255,255,0.07)", border: "1px solid rgba(99,102,241,0.20)" }}>

            {/* ── Collapsed row ── */}
            <div
              className="flex items-center justify-between px-4 py-3 cursor-pointer select-none active:opacity-70"
              onClick={() => setExpandedIds(prev => {
                const n = new Set(prev);
                n.has(item.ticker) ? n.delete(item.ticker) : n.add(item.ticker);
                return n;
              })}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                  style={{ background: "linear-gradient(135deg, #6366F1, #8B5CF6)" }}>
                  {item.ticker.replace(/\.[A-Z]+$/, "").slice(0, 2)}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-white truncate">
                    {item.ticker.replace(/\.[A-Z]+$/, "")}
                    <span className="font-normal text-xs" style={{ color: "#64748B" }}> — {item.name}</span>
                  </p>
                  {price > 0 && (
                    <p className="text-xs font-medium"
                      style={{ color: changePct >= 0 ? "#4ADE80" : "#F87171" }}>
                      {changePct >= 0 ? "+" : ""}{fmt(changePct, 2)}%
                      {" "}({changePct >= 0 ? "+" : ""}{currSymbol}{fmt(Math.abs(todayAbs))}) {t("today", "oggi")}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                <div className="text-right">
                  {price === 0 ? (
                    <p className="text-sm animate-pulse" style={{ color: "#94A3B8" }}>…</p>
                  ) : (
                    <>
                      <p className="font-bold text-sm text-white">{currSymbol}{fmt(price)}</p>
                      {sig && (
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                          style={{
                            backgroundColor: SIGNAL_STYLE[sig.signal]?.bg,
                            color:           SIGNAL_STYLE[sig.signal]?.color,
                          }}>
                          {sig.signal} {sig.score}/100
                        </span>
                      )}
                    </>
                  )}
                </div>
                <span style={{ color: "#6366F1", fontSize: "9px" }}>{isExpanded ? "▲" : "▼"}</span>
              </div>
            </div>

            {/* ── Expanded details ── */}
            {isExpanded && (
              <div className="px-4 pb-4 space-y-3"
                style={{ borderTop: "1px solid rgba(99,102,241,0.15)" }}>

                <div className="pt-2 space-y-1.5">
                  <p className="text-xs" style={{ color: "#64748B" }}>
                    {t("Added", "Aggiunto")}{" "}
                    {new Date(item.added_at).toLocaleDateString(
                      appLang === "it" ? "it-IT" : "en-GB",
                      { day: "2-digit", month: "long", year: "numeric" }
                    )}
                  </p>
                  {targetNode}
                  {peNode}
                </div>

                {/* Signal */}
                {signalsLoading && !sig && (
                  <p className="text-xs animate-pulse" style={{ color: "#64748B" }}>
                    {t("Analysing…", "Analisi…")}
                  </p>
                )}
                {sig && (() => {
                  const ai = getAiState(item.ticker);
                  return (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold px-2.5 py-0.5 rounded-full"
                        style={{
                          backgroundColor: SIGNAL_STYLE[sig.signal]?.bg,
                          color:           SIGNAL_STYLE[sig.signal]?.color,
                        }}>
                        {sig.signal} {sig.score}/100
                      </span>
                      {sig.analyst ? (
                        <span className="text-xs" style={{ color: "#94A3B8" }}>
                          {sig.analyst.strongBuy + sig.analyst.buy} {t("Buy", "Acq.")}
                          {" · "}{sig.analyst.hold} {t("Hold", "Neutro")}
                          {" · "}{sig.analyst.sell + sig.analyst.strongSell} {t("Sell", "Vend.")}
                        </span>
                      ) : (
                        <span className="text-xs" style={{ color: "#475569" }}>
                          {t("No analyst coverage", "Nessuna copertura analisti")}
                        </span>
                      )}
                    </div>
                    {sig.reasoning && (
                      <p className="text-xs italic leading-relaxed" style={{ color: "#64748B" }}>
                        &ldquo;{sig.reasoning}&rdquo;
                      </p>
                    )}

                    {/* Ask AI Analysis */}
                    <div className="pt-1">
                      {!ai.analysis && (
                        <button
                          onClick={() => handleAskAI(item.ticker, sig.score, sig.signal)}
                          disabled={ai.loading || usedToday}
                          className="w-full py-2 rounded-xl text-xs font-semibold transition-opacity active:opacity-70"
                          style={{
                            backgroundColor: usedToday ? "rgba(255,255,255,0.04)" : "rgba(252,211,77,0.12)",
                            color:           usedToday ? "#475569" : "#FCD34D",
                            border:          `1px solid ${usedToday ? "rgba(255,255,255,0.08)" : "rgba(252,211,77,0.25)"}`,
                            opacity: ai.loading ? 0.7 : 1,
                          }}>
                          {ai.loading
                            ? t("🤖 Analysing…", "🤖 Analisi…")
                            : usedToday
                            ? t("✓ AI ask used today · resets midnight", "✓ AI usata oggi · si resetta a mezzanotte")
                            : t("🤖 Ask AI Analysis", "🤖 Chiedi all'AI")}
                        </button>
                      )}
                      {ai.error && <p className="text-xs mt-1" style={{ color: "#F87171" }}>{ai.error}</p>}
                      {ai.analysis && (
                        <div className="rounded-xl p-3"
                          style={{ backgroundColor: "rgba(252,211,77,0.06)", border: "1px solid rgba(252,211,77,0.18)" }}>
                          <p className="text-xs font-semibold mb-1.5" style={{ color: "#FCD34D" }}>
                            🤖 {t("AI Analysis", "Analisi AI")}
                          </p>
                          <p className="text-xs leading-relaxed" style={{ color: "#CBD5E1" }}>{ai.analysis}</p>
                          <p className="text-xs mt-2" style={{ color: "#334155" }}>
                            {t("Educational only — not financial advice.", "Solo educativo — non è consulenza finanziaria.")}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                  );
                })()}

                {/* Notes */}
                {item.notes && (
                  <div className="rounded-xl px-3 py-2"
                    style={{ backgroundColor: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.20)" }}>
                    <p className="text-xs" style={{ color: "#A5B4FC" }}>
                      📝 {item.notes}
                    </p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => handleAddToPortfolio(item)}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity active:opacity-70"
                    style={{ background: "linear-gradient(135deg, #0EA5E9, #0284C7)" }}>
                    {t("📋 Add to Portfolio", "📋 Aggiungi al Portafoglio")}
                  </button>
                  <button
                    onClick={() => removeItem(item.ticker)}
                    className="px-4 py-2.5 rounded-xl text-sm font-medium"
                    style={{ backgroundColor: "rgba(239,68,68,0.12)", color: "#F87171", border: "1px solid rgba(239,68,68,0.20)" }}>
                    {t("Remove", "Rimuovi")}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* ── Add modal ── */}
      {showAddModal && (
        <AddModal
          onClose={() => setShowAddModal(false)}
          onSave={addItem}
          t={t}
        />
      )}
    </div>
  );
}
