"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { AccumulationPlan, PacInterval, TickerResult } from "@/types";

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n: number, d = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

function nextPurchaseDate(plan: AccumulationPlan): Date {
  const base = new Date(plan.last_purchase ?? plan.start_date);
  if (!plan.last_purchase) return base;
  const d = new Date(base);
  if (plan.interval === "weekly")    d.setDate(d.getDate() + 7);
  if (plan.interval === "monthly")   d.setMonth(d.getMonth() + 1);
  if (plan.interval === "quarterly") d.setMonth(d.getMonth() + 3);
  return d;
}

function formatDate(iso: string, lang: string) {
  return new Date(iso).toLocaleDateString(lang === "it" ? "it-IT" : "en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

const CURR_SYM: Record<string, string> = { EUR: "€", USD: "$", GBP: "£" };

// ── Add Plan Modal ────────────────────────────────────────────────────────────
function AddPacModal({
  onClose, onSaved, userId, t,
}: {
  onClose:  () => void;
  onSaved:  () => void;
  userId:   string | null;
  t:        (en: string, it: string) => string;
}) {
  const [ticker,    setTicker]    = useState("");
  const [name,      setName]      = useState("");
  const [amount,    setAmount]    = useState("");
  const [currency,  setCurrency]  = useState("EUR");
  const [interval,  setInterval]  = useState<PacInterval>("monthly");
  const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState("");
  const [results,   setResults]   = useState<TickerResult[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confirmed   = useRef(false);

  function handleTickerChange(val: string) {
    setTicker(val);
    confirmed.current = false;
    setName("");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.length < 1) { setResults([]); return; }
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
  }

  async function handleSave() {
    if (!ticker || !amount || !startDate) { setError(t("Fill all required fields.", "Compila tutti i campi richiesti.")); return; }
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id ?? userId;
    if (!uid) { setError(t("Not authenticated.", "Non autenticato.")); return; }
    setSaving(true);
    const { error: dbErr } = await supabase.from("accumulation_plans").insert({
      user_id:    uid,
      ticker:     ticker.toUpperCase().trim(),
      name:       name.trim() || ticker.toUpperCase().trim(),
      amount:     parseFloat(amount),
      currency,
      interval,
      start_date: startDate,
    });
    setSaving(false);
    if (dbErr) { setError(dbErr.message); return; }
    onSaved();
    onClose();
  }

  const INTERVALS: { value: PacInterval; label: string; labelIt: string }[] = [
    { value: "weekly",    label: "Weekly",    labelIt: "Settimanale" },
    { value: "monthly",   label: "Monthly",   labelIt: "Mensile" },
    { value: "quarterly", label: "Quarterly", labelIt: "Trimestrale" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg rounded-t-3xl p-6 pb-10 shadow-2xl"
        style={{ backgroundColor: "#0F1F35", border: "1px solid rgba(255,255,255,0.12)" }}>

        <div className="flex justify-between items-center mb-5">
          <h2 className="text-base font-bold text-white">
            📅 {t("New Recurring Plan", "Nuovo Piano di Accumulo")}
          </h2>
          <button onClick={onClose} className="text-2xl leading-none" style={{ color: "#64748B" }}>×</button>
        </div>

        {error && (
          <p className="text-xs mb-3 px-3 py-2 rounded-xl"
            style={{ backgroundColor: "rgba(239,68,68,0.12)", color: "#F87171" }}>{error}</p>
        )}

        <div className="space-y-3">
          {/* Ticker */}
          <div className="relative">
            <label className="text-xs font-medium block mb-1" style={{ color: "#64748B" }}>
              {t("Ticker / Name *", "Ticker / Nome *")}
            </label>
            <div className="relative">
              <input
                autoComplete="off"
                className="w-full rounded-xl px-4 py-3 text-sm font-mono uppercase outline-none"
                style={{ backgroundColor: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", color: "white" }}
                placeholder="VWCE, AAPL…"
                value={ticker}
                onChange={e => handleTickerChange(e.target.value)}
                onBlur={() => setTimeout(() => setResults([]), 150)}
              />
              {searching && (
                <span className="absolute right-3 top-3 text-xs animate-pulse" style={{ color: "#0EA5E9" }}>…</span>
              )}
            </div>
            {results.length > 0 && (
              <div className="absolute z-10 w-full mt-1 rounded-2xl shadow-xl overflow-hidden"
                style={{ backgroundColor: "#0F1F35", border: "1px solid rgba(255,255,255,0.15)" }}>
                {results.map(r => (
                  <button key={r.symbol}
                    className="w-full flex items-center justify-between px-4 py-2.5 text-left"
                    style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
                    onMouseDown={() => selectResult(r)}>
                    <div>
                      <span className="font-mono font-bold text-sm" style={{ color: "#38BDF8" }}>{r.symbol}</span>
                      <span className="text-xs ml-2" style={{ color: "#94A3B8" }}>{r.name}</span>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: "rgba(255,255,255,0.08)", color: "#64748B" }}>{r.exchange}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Amount + Currency row */}
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs font-medium block mb-1" style={{ color: "#64748B" }}>
                {t("Amount per period *", "Importo per periodo *")}
              </label>
              <input type="number" min="1" step="any"
                className="w-full rounded-xl px-4 py-3 text-sm outline-none"
                style={{ backgroundColor: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", color: "white" }}
                placeholder="200"
                value={amount}
                onChange={e => setAmount(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "#64748B" }}>
                {t("Currency", "Valuta")}
              </label>
              <select
                className="rounded-xl px-3 py-3 text-sm outline-none appearance-none"
                style={{ backgroundColor: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", color: "white", minWidth: 72 }}
                value={currency}
                onChange={e => setCurrency(e.target.value)}>
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
                <option value="GBP">GBP</option>
              </select>
            </div>
          </div>

          {/* Interval */}
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "#64748B" }}>
              {t("Frequency *", "Frequenza *")}
            </label>
            <div className="flex gap-2">
              {INTERVALS.map(opt => (
                <button key={opt.value}
                  onClick={() => setInterval(opt.value)}
                  className="flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all"
                  style={{
                    backgroundColor: interval === opt.value ? "#0EA5E9" : "rgba(255,255,255,0.08)",
                    color: interval === opt.value ? "white" : "#94A3B8",
                    border: `1px solid ${interval === opt.value ? "#0EA5E9" : "rgba(255,255,255,0.12)"}`,
                  }}>
                  {t(opt.label, opt.labelIt)}
                </button>
              ))}
            </div>
          </div>

          {/* Start date */}
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "#64748B" }}>
              {t("Start date *", "Data di inizio *")}
            </label>
            <input type="date"
              className="w-full rounded-xl px-4 py-3 text-sm outline-none"
              style={{ backgroundColor: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", color: "white", colorScheme: "dark" }}
              value={startDate}
              onChange={e => setStartDate(e.target.value)} />
          </div>

          <button
            onClick={handleSave}
            disabled={saving || !ticker || !amount}
            className="w-full py-3.5 rounded-2xl font-bold text-sm text-white transition-opacity"
            style={{
              background: "linear-gradient(135deg, #0EA5E9, #6366F1)",
              opacity: (saving || !ticker || !amount) ? 0.5 : 1,
            }}>
            {saving ? t("Saving…", "Salvataggio…") : t("Create Plan", "Crea Piano")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Log Purchase Modal ────────────────────────────────────────────────────────
function LogPurchaseModal({
  plan, onClose, onLogged, t,
}: {
  plan:     AccumulationPlan;
  onClose:  () => void;
  onLogged: () => void;
  t:        (en: string, it: string) => string;
}) {
  const [shares, setShares] = useState("");
  const [price,  setPrice]  = useState("");
  const [date,   setDate]   = useState(new Date().toISOString().split("T")[0]);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");
  const curr = CURR_SYM[plan.currency] ?? plan.currency;

  async function handleLog() {
    if (!shares || !price) { setError(t("Enter shares and price.", "Inserisci azioni e prezzo.")); return; }
    const sharesN = parseFloat(shares);
    const priceN  = parseFloat(price);
    if (isNaN(sharesN) || isNaN(priceN) || sharesN <= 0 || priceN <= 0) {
      setError(t("Invalid values.", "Valori non validi.")); return;
    }
    setSaving(true);

    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id ?? plan.user_id;
    if (!uid) { setSaving(false); setError(t("Not authenticated.", "Non autenticato.")); return; }

    // 1. Insert holding
    const { error: holdErr } = await supabase.from("holdings").insert({
      user_id:        uid,
      ticker:         plan.ticker,
      name:           plan.name,
      shares:         sharesN,
      cost_per_share: priceN,
      purchased_at:   date || null,
      signal:         "HOLD",
    });
    if (holdErr) { setSaving(false); setError(holdErr.message); return; }

    // 2. Update plan counters
    const { error: planErr } = await supabase.from("accumulation_plans").update({
      last_purchase:  date,
      purchase_count: (plan.purchase_count ?? 0) + 1,
      total_invested: (plan.total_invested ?? 0) + sharesN * priceN,
    }).eq("id", plan.id!);

    setSaving(false);
    if (planErr) { setError(planErr.message); return; }
    onLogged();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg rounded-t-3xl p-6 pb-10 shadow-2xl"
        style={{ backgroundColor: "#0F1F35", border: "1px solid rgba(255,255,255,0.12)" }}>

        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-base font-bold text-white">
              ✅ {t("Log Purchase", "Registra Acquisto")}
            </h2>
            <p className="text-xs mt-0.5" style={{ color: "#64748B" }}>
              {plan.ticker} · {curr}{fmt(plan.amount)}/{t(plan.interval, plan.interval === "weekly" ? "settimana" : plan.interval === "monthly" ? "mese" : "trimestre")}
            </p>
          </div>
          <button onClick={onClose} className="text-2xl leading-none" style={{ color: "#64748B" }}>×</button>
        </div>

        {error && (
          <p className="text-xs mb-3 px-3 py-2 rounded-xl"
            style={{ backgroundColor: "rgba(239,68,68,0.12)", color: "#F87171" }}>{error}</p>
        )}

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "#64748B" }}>
              {t("Shares purchased *", "Azioni acquistate *")}
            </label>
            <input type="number" min="0.0001" step="any"
              className="w-full rounded-xl px-4 py-3 text-sm outline-none"
              style={{ backgroundColor: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", color: "white" }}
              placeholder="1.234"
              value={shares}
              onChange={e => setShares(e.target.value)} />
          </div>

          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "#64748B" }}>
              {t("Price per share *", "Prezzo per azione *")} ({curr})
            </label>
            <input type="number" min="0.01" step="any"
              className="w-full rounded-xl px-4 py-3 text-sm outline-none"
              style={{ backgroundColor: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", color: "white" }}
              placeholder="95.50"
              value={price}
              onChange={e => setPrice(e.target.value)} />
          </div>

          {shares && price && !isNaN(parseFloat(shares)) && !isNaN(parseFloat(price)) && (
            <p className="text-xs" style={{ color: "#4ADE80" }}>
              {t("Total cost:", "Costo totale:")} {curr}{fmt(parseFloat(shares) * parseFloat(price))}
            </p>
          )}

          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "#64748B" }}>
              {t("Purchase date", "Data acquisto")}
            </label>
            <input type="date"
              className="w-full rounded-xl px-4 py-3 text-sm outline-none"
              style={{ backgroundColor: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", color: "white", colorScheme: "dark" }}
              max={new Date().toISOString().split("T")[0]}
              value={date}
              onChange={e => setDate(e.target.value)} />
          </div>

          <button
            onClick={handleLog}
            disabled={saving || !shares || !price}
            className="w-full py-3.5 rounded-2xl font-bold text-sm text-white transition-opacity"
            style={{
              background: "linear-gradient(135deg, #4ADE80, #16A34A)",
              opacity: (saving || !shares || !price) ? 0.5 : 1,
            }}>
            {saving ? t("Saving…", "Salvataggio…") : t("Log Purchase", "Registra Acquisto")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
interface Props {
  userId:           string | null;
  t:                (en: string, it: string) => string;
  appLang:          "en" | "it";
  onPurchaseLogged: () => void;
}

export default function PacSection({ userId, t, appLang, onPurchaseLogged }: Props) {
  const [plans,       setPlans]       = useState<AccumulationPlan[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [collapsed,   setCollapsed]   = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("vela_pac_collapsed") === "1";
  });
  const [showAdd,     setShowAdd]     = useState(false);
  const [logTarget,   setLogTarget]   = useState<AccumulationPlan | null>(null);
  const [deleteId,    setDeleteId]    = useState<string | null>(null);

  const fetchPlans = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id ?? userId;
    if (!uid) { setLoading(false); return; }
    const { data } = await supabase
      .from("accumulation_plans")
      .select("*")
      .eq("user_id", uid)
      .order("created_at");
    setPlans((data as AccumulationPlan[]) ?? []);
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetchPlans(); }, [fetchPlans]);

  async function toggleStatus(plan: AccumulationPlan) {
    const next = plan.status === "active" ? "paused" : "active";
    await supabase.from("accumulation_plans").update({ status: next }).eq("id", plan.id!);
    setPlans(prev => prev.map(p => p.id === plan.id ? { ...p, status: next } : p));
  }

  async function deletePlan(id: string) {
    await supabase.from("accumulation_plans").delete().eq("id", id);
    setPlans(prev => prev.filter(p => p.id !== id));
    setDeleteId(null);
  }

  const active = plans.filter(p => p.status === "active");
  const paused = plans.filter(p => p.status === "paused");

  if (loading) return null;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => { const next = !collapsed; setCollapsed(next); try { localStorage.setItem("vela_pac_collapsed", next ? "1" : "0"); } catch {} }}
          className="flex items-center gap-2 select-none">
          <h2 className="text-sm font-semibold text-white">
            📅 {t("Recurring Plans", "Piani di Accumulo")}
            {plans.length > 0 && (
              <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded-full font-medium"
                style={{ backgroundColor: "rgba(14,165,233,0.2)", color: "#38BDF8" }}>
                {active.length}
              </span>
            )}
          </h2>
          <span style={{ color: "#475569", fontSize: "10px" }}>{collapsed ? "▼" : "▲"}</span>
        </button>
        <button
          onClick={() => setShowAdd(true)}
          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-lg font-bold transition-transform hover:scale-105 active:scale-95 shadow-lg"
          style={{ background: "linear-gradient(135deg, #0EA5E9, #6366F1)" }}>+</button>
      </div>

      {!collapsed && (
        <div className="space-y-2">
          {plans.length === 0 && (
            <div className="rounded-2xl p-7 text-center"
              style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "2px dashed rgba(255,255,255,0.12)" }}>
              <p className="text-2xl mb-2">📅</p>
              <p className="font-semibold text-sm mb-1 text-white">
                {t("No recurring plans yet", "Nessun piano di accumulo")}
              </p>
              <p className="text-xs mb-4" style={{ color: "#94A3B8" }}>
                {t("Set up a monthly investment plan (DCA) for any stock or ETF.", "Imposta un piano mensile (DCA) per qualsiasi azione o ETF.")}
              </p>
              <button onClick={() => setShowAdd(true)}
                className="px-5 py-2 rounded-full text-sm font-semibold text-white"
                style={{ background: "linear-gradient(135deg, #0EA5E9, #6366F1)" }}>
                {t("+ Add plan", "+ Aggiungi piano")}
              </button>
            </div>
          )}

          {[...active, ...paused].map(plan => {
            const curr     = CURR_SYM[plan.currency] ?? plan.currency;
            const next     = nextPurchaseDate(plan);
            const today    = new Date();
            today.setHours(0, 0, 0, 0);
            const overdue  = plan.status === "active" && next < today;
            const daysLeft = Math.ceil((next.getTime() - today.getTime()) / 86_400_000);
            const isPaused = plan.status === "paused";

            const intervalLabel =
              plan.interval === "weekly"    ? t("/ week",    "/ sett.") :
              plan.interval === "quarterly" ? t("/ quarter", "/ trim.") :
                                             t("/ month",   "/ mese");

            return (
              <div key={plan.id}
                className="rounded-2xl px-4 py-3"
                style={{
                  backgroundColor: "rgba(255,255,255,0.06)",
                  border: isPaused
                    ? "1px solid rgba(255,255,255,0.08)"
                    : overdue
                    ? "1px solid rgba(252,211,77,0.30)"
                    : "1px solid rgba(14,165,233,0.20)",
                  opacity: isPaused ? 0.7 : 1,
                }}>

                {/* Top row: ticker + amount + status */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-bold text-sm" style={{ color: "#38BDF8" }}>
                        {plan.ticker}
                      </span>
                      <span className="text-xs font-bold" style={{ color: "#94A3B8" }}>
                        {curr}{fmt(plan.amount, 0)} {intervalLabel}
                      </span>
                      {isPaused && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{ backgroundColor: "rgba(255,255,255,0.08)", color: "#64748B" }}>
                          {t("Paused", "In pausa")}
                        </span>
                      )}
                    </div>
                    <p className="text-xs mt-0.5 truncate" style={{ color: "#64748B" }}>{plan.name}</p>
                  </div>

                  {/* Delete button */}
                  {deleteId === plan.id ? (
                    <div className="flex gap-1.5 flex-shrink-0">
                      <button onClick={() => deletePlan(plan.id!)}
                        className="text-xs px-2.5 py-1 rounded-full font-semibold"
                        style={{ backgroundColor: "rgba(239,68,68,0.20)", color: "#F87171" }}>
                        {t("Delete", "Elimina")}
                      </button>
                      <button onClick={() => setDeleteId(null)}
                        className="text-xs px-2.5 py-1 rounded-full"
                        style={{ backgroundColor: "rgba(255,255,255,0.08)", color: "#94A3B8" }}>
                        {t("Cancel", "Annulla")}
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setDeleteId(plan.id!)}
                      className="text-xs flex-shrink-0 px-1.5 py-0.5 rounded-full"
                      style={{ backgroundColor: "rgba(239,68,68,0.12)", color: "#F87171" }}>✕</button>
                  )}
                </div>

                {/* Stats row */}
                <div className="flex items-center gap-4 mt-2 text-xs" style={{ color: "#64748B" }}>
                  <span>
                    {t("Purchases:", "Acquisti:")} <span className="text-white font-medium">{plan.purchase_count}</span>
                  </span>
                  <span>
                    {t("Invested:", "Investito:")} <span className="text-white font-medium">{curr}{fmt(plan.total_invested, 0)}</span>
                  </span>
                </div>

                {/* Next purchase date */}
                {!isPaused && (
                  <div className="mt-2 flex items-center gap-1.5">
                    <span className="text-xs" style={{ color: overdue ? "#FCD34D" : "#64748B" }}>
                      {overdue
                        ? t("⚠️ Overdue since", "⚠️ Scaduto dal")
                        : t("Next:", "Prossimo:")}
                    </span>
                    <span className="text-xs font-semibold" style={{ color: overdue ? "#FCD34D" : "#38BDF8" }}>
                      {formatDate(next.toISOString().split("T")[0], appLang)}
                      {!overdue && daysLeft > 0 && (
                        <span style={{ color: "#475569" }}> ({daysLeft}d)</span>
                      )}
                    </span>
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex gap-2 mt-3">
                  {!isPaused && (
                    <button
                      onClick={() => setLogTarget(plan)}
                      className="flex-1 py-2 rounded-xl text-xs font-semibold text-white transition-opacity active:opacity-70"
                      style={{ background: "linear-gradient(135deg, #0EA5E9, #0284C7)" }}>
                      ✅ {t("Log Purchase", "Registra Acquisto")}
                    </button>
                  )}
                  <button
                    onClick={() => toggleStatus(plan)}
                    className="px-4 py-2 rounded-xl text-xs font-medium transition-opacity active:opacity-70"
                    style={{
                      backgroundColor: isPaused ? "rgba(14,165,233,0.15)" : "rgba(255,255,255,0.08)",
                      color: isPaused ? "#38BDF8" : "#94A3B8",
                      border: "1px solid rgba(255,255,255,0.10)",
                    }}>
                    {isPaused ? t("Resume", "Riprendi") : t("Pause", "Metti in pausa")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      {showAdd && (
        <AddPacModal
          onClose={() => setShowAdd(false)}
          onSaved={fetchPlans}
          userId={userId}
          t={t}
        />
      )}
      {logTarget && (
        <LogPurchaseModal
          plan={logTarget}
          onClose={() => setLogTarget(null)}
          onLogged={() => { fetchPlans(); onPurchaseLogged(); }}
          t={t}
        />
      )}
    </div>
  );
}
