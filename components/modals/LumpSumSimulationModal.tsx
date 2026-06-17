"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import {
  ComposedChart, Area, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from "recharts";
import type { TickerResult } from "@/types";
import { runMonteCarlo, hashTicker, type SimResult } from "@/lib/montecarlo";

const CURR_SYM: Record<string, string> = { EUR: "€", USD: "$", GBP: "£" };

function fmt(n: number, d = 0) {
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

const YEAR_OPTIONS = [1, 2, 3, 5, 10] as const;
type YearOpt = typeof YEAR_OPTIONS[number];

interface HistoryResponse {
  ticker:       string;
  currency:     string;
  closes:       number[];
  muMonthly:    number;
  sigmaMonthly: number;
  nObs:         number;
  error?:       string;
}

interface Props {
  onClose: () => void;
  t:       (en: string, it: string) => string;
  appLang: "en" | "it";
}

export default function LumpSumSimulationModal({ onClose, t }: Props) {
  // ── Ticker search ─────────────────────────────────────────────────────────
  const [ticker,    setTicker]    = useState("");
  const [tickerName, setTickerName] = useState("");
  const [results,   setResults]   = useState<TickerResult[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceSearchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confirmed = useRef(false);

  function handleTickerChange(val: string) {
    setTicker(val);
    confirmed.current = false;
    setTickerName("");
    if (debounceSearchRef.current) clearTimeout(debounceSearchRef.current);
    if (val.length < 1) { setResults([]); return; }
    debounceSearchRef.current = setTimeout(async () => {
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
    setTickerName(r.name);
    setResults([]);
  }

  // ── Inputs ───────────────────────────────────────────────────────────────
  const [currency,     setCurrency]     = useState<"EUR" | "USD" | "GBP">("EUR");
  const [lumpSumAmount, setLumpSumAmount] = useState<string>("10000");
  const [years,        setYears]        = useState<YearOpt>(5);

  // ── Simulation state ─────────────────────────────────────────────────────
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [result,  setResult]  = useState<SimResult | null>(null);

  // Fetch historical stats when a ticker is confirmed.
  useEffect(() => {
    if (!confirmed.current || !ticker) {
      setHistory(null);
      setError(null);
      setResult(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setHistory(null);
    fetch(`/api/pac-history?ticker=${encodeURIComponent(ticker)}`)
      .then(r => r.json())
      .then((data: HistoryResponse) => {
        if (cancelled) return;
        if (data.error === "insufficient-history") {
          setError(t(
            `Not enough history for ${ticker} to run a reliable simulation (need at least 12 months).`,
            `Storico insufficiente per ${ticker} per una simulazione affidabile (servono almeno 12 mesi).`
          ));
        } else if (data.error) {
          setError(t(
            "Could not fetch historical data. Please try again.",
            "Impossibile recuperare i dati storici. Riprova."
          ));
        }
        setHistory(data);
      })
      .catch(() => {
        if (cancelled) return;
        setError(t("Network error. Please try again.", "Errore di rete. Riprova."));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ticker, t]);

  // Re-run Monte Carlo when inputs change.
  const debounceSimRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!history || error) { setResult(null); return; }
    if (history.muMonthly === 0 && history.sigmaMonthly === 0) { setResult(null); return; }
    const amt = parseFloat(lumpSumAmount);
    if (!Number.isFinite(amt) || amt <= 0) { setResult(null); return; }

    if (debounceSimRef.current) clearTimeout(debounceSimRef.current);
    debounceSimRef.current = setTimeout(() => {
      const sim = runMonteCarlo({
        muMonthly:           history.muMonthly,
        sigmaMonthly:        history.sigmaMonthly,
        monthlyContribution: 0,
        initialBalance:      amt,
        horizonMonths:       years * 12,
        paths:               500,
        seed:                hashTicker(ticker),
      });
      setResult(sim);
    }, 250);
    return () => { if (debounceSimRef.current) clearTimeout(debounceSimRef.current); };
  }, [history, error, lumpSumAmount, years, ticker]);

  const curr = CURR_SYM[currency] ?? currency;

  const chartData = useMemo(() => {
    if (!result) return [];
    return result.series.map(pt => ({
      month:    pt.month,
      band:     [pt.p10, pt.p90] as [number, number],
      p50:      pt.p50,
      invested: pt.invested,
    }));
  }, [result]);

  const yDomain = useMemo<[number, number]>(() => {
    if (!result || result.series.length === 0) return [0, 100];
    let lo = Infinity, hi = -Infinity;
    result.series.forEach(p => {
      if (p.p10 < lo) lo = p.p10;
      if (p.p90 > hi) hi = p.p90;
      if (p.invested < lo) lo = p.invested;
      if (p.invested > hi) hi = p.invested;
    });
    const pad = Math.max((hi - lo) * 0.1, 1);
    return [Math.max(0, lo - pad), hi + pad];
  }, [result]);

  const annualMuPct    = history ? history.muMonthly * 12 * 100 : 0;
  const annualSigmaPct = history ? history.sigmaMonthly * Math.sqrt(12) * 100 : 0;

  function pctVsInvested(value: number, invested: number) {
    if (invested <= 0) return 0;
    return ((value - invested) / invested) * 100;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg rounded-t-3xl p-6 pb-10 shadow-2xl max-h-[92dvh] overflow-y-auto"
        style={{ backgroundColor: "#0F1F35", border: "1px solid rgba(255,255,255,0.12)" }}>

        {/* Header */}
        <div className="flex justify-between items-start mb-4">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-white">
              💸 {t("Simulate a one-time investment", "Simula un investimento singolo")}
            </h2>
            <p className="text-xs mt-0.5" style={{ color: "#94A3B8" }}>
              {t(
                "See what could happen if you invested a lump sum today.",
                "Vedi cosa potrebbe succedere se investi una somma oggi."
              )}
            </p>
          </div>
          <button onClick={onClose} className="text-2xl leading-none flex-shrink-0 ml-2" style={{ color: "#64748B" }}>×</button>
        </div>

        {/* Inputs */}
        <div className="space-y-3 mb-4">
          {/* Ticker search */}
          <div className="relative">
            <label className="text-xs font-medium block mb-1" style={{ color: "#64748B" }}>
              {t("What do you want to invest in?", "In cosa vuoi investire?")} *
            </label>
            <div className="relative">
              <input
                autoComplete="off"
                className="w-full rounded-xl px-4 py-3 text-sm font-mono uppercase outline-none"
                style={{ backgroundColor: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", color: "white" }}
                placeholder="VWCE.DE, CSPX, AAPL…"
                value={ticker}
                onChange={e => handleTickerChange(e.target.value)}
                onBlur={() => setTimeout(() => setResults([]), 150)}
              />
              {searching && (
                <span className="absolute right-3 top-3 text-xs animate-pulse" style={{ color: "#0EA5E9" }}>…</span>
              )}
            </div>
            {tickerName && (
              <p className="text-[11px] mt-1 truncate" style={{ color: "#94A3B8" }}>{tickerName}</p>
            )}
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

          {/* Amount + currency */}
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs font-medium block mb-1" style={{ color: "#64748B" }}>
                {t("Amount", "Importo")} *
              </label>
              <input type="number" min="1" step="any"
                className="w-full rounded-xl px-4 py-3 text-sm outline-none"
                style={{ backgroundColor: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", color: "white" }}
                placeholder="10000"
                value={lumpSumAmount}
                onChange={e => setLumpSumAmount(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "#64748B" }}>
                {t("Currency", "Valuta")}
              </label>
              <select
                className="rounded-xl px-3 py-3 text-sm outline-none appearance-none"
                style={{ backgroundColor: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", color: "white", minWidth: 72 }}
                value={currency}
                onChange={e => setCurrency(e.target.value as "EUR" | "USD" | "GBP")}>
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
                <option value="GBP">GBP</option>
              </select>
            </div>
          </div>

          {/* Horizon */}
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "#64748B" }}>
              {t("Time horizon", "Orizzonte temporale")}
            </label>
            <div className="flex gap-2">
              {YEAR_OPTIONS.map(y => (
                <button key={y}
                  onClick={() => setYears(y)}
                  className="flex-1 py-2 rounded-xl text-xs font-semibold transition-all"
                  style={{
                    backgroundColor: years === y ? "#0EA5E9" : "rgba(255,255,255,0.08)",
                    color:           years === y ? "white" : "#94A3B8",
                    border:          `1px solid ${years === y ? "#0EA5E9" : "rgba(255,255,255,0.12)"}`,
                  }}>
                  {y}{t("y", "a")}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Empty state — no ticker yet */}
        {!ticker && !loading && (
          <p className="text-xs px-3 py-2 rounded-xl"
            style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "#94A3B8" }}>
            {t(
              "Pick a stock or ETF above to run the simulation. Try common ETFs like VWCE.DE (global) or CSPX (S&P 500), or a single stock like AAPL.",
              "Scegli un'azione o un ETF qui sopra per avviare la simulazione. Prova ETF comuni come VWCE.DE (mondo) o CSPX (S&P 500), oppure un'azione come AAPL."
            )}
          </p>
        )}

        {/* Loading */}
        {loading && (
          <div className="rounded-2xl p-8 text-center"
            style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <p className="text-xs animate-pulse" style={{ color: "#0EA5E9" }}>
              {t("Loading historical data…", "Caricamento dati storici…")}
            </p>
          </div>
        )}

        {/* Error */}
        {error && (
          <p className="text-xs mb-4 px-3 py-2 rounded-xl"
            style={{ backgroundColor: "rgba(252,211,77,0.12)", color: "#FCD34D" }}>
            {error}
          </p>
        )}

        {/* Result */}
        {!loading && result && history && history.nObs > 0 && (
          <>
            <p className="text-[10px] mb-2" style={{ color: "#64748B" }}>
              {t(
                `5y history: ${history.nObs} months · avg ${annualMuPct.toFixed(1)}%/y · vol ${annualSigmaPct.toFixed(1)}%`,
                `Storico 5y: ${history.nObs} mesi · media ${annualMuPct.toFixed(1)}%/a · vol ${annualSigmaPct.toFixed(1)}%`
              )}
            </p>

            <p className="text-[11px] leading-relaxed mb-2" style={{ color: "#94A3B8" }}>
              {t(
                "This chart shows 500 possible futures if you invested the whole amount today, based on how this investment moved over the last 5 years.",
                "Questo grafico mostra 500 futuri possibili se investissi tutta la somma oggi, basati su come questo investimento si è mosso negli ultimi 5 anni."
              )}
            </p>

            <div className="rounded-2xl p-3 mb-3"
              style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <ResponsiveContainer width="100%" height={240}>
                <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="month"
                    tickFormatter={(m: number) => m % 12 === 0 ? `${m / 12}${t("y", "a")}` : ""}
                    stroke="#64748B" fontSize={10} tickLine={false} />
                  <YAxis domain={yDomain}
                    tickFormatter={(v: number) =>
                      v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0)
                    }
                    stroke="#64748B" fontSize={10} tickLine={false} width={42} />
                  <Tooltip content={<SimTooltip curr={curr} t={t} />} />
                  <Area dataKey="band" stroke="none" fill="#38BDF8" fillOpacity={0.18} isAnimationActive={false} />
                  <Line dataKey="p50" stroke="#0EA5E9" strokeWidth={2} dot={false} isAnimationActive={false} name="median" />
                  <Line dataKey="invested" stroke="#FCD34D" strokeWidth={1.5} strokeDasharray="4 4" dot={false} isAnimationActive={false} name="invested" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Plain-language legend */}
            <div className="space-y-2 mb-4">
              <LegendRow
                swatch={<span style={{ width: 14, height: 10, borderRadius: 2, backgroundColor: "rgba(56,189,248,0.35)" }} />}
                title={t("Likely range", "Intervallo probabile")}
                sub={t(
                  "8 out of 10 simulated futures end up inside this blue band.",
                  "8 scenari simulati su 10 finiscono dentro questa banda azzurra."
                )} />
              <LegendRow
                swatch={<span style={{ width: 14, height: 2, backgroundColor: "#0EA5E9" }} />}
                title={t("Typical outcome", "Scenario tipico")}
                sub={t(
                  "The middle scenario — half the simulations did better, half worse.",
                  "Il caso di mezzo — metà delle simulazioni va meglio, metà peggio."
                )} />
              <LegendRow
                swatch={<span style={{
                  width: 14, height: 0, borderTop: "2px dashed #FCD34D",
                }} />}
                title={t("Your one-time deposit", "Tuo versamento iniziale")}
                sub={t(
                  "The amount you put in on day one — flat, because you don't add more.",
                  "Quello che hai versato il primo giorno — piatto, perché non aggiungi altro."
                )} />
            </div>

            {/* Result summary */}
            <div className="grid grid-cols-3 gap-2 mb-3">
              <ResultCard
                label={t("Pessimistic", "Pessimistico")}
                sub="P10"
                value={result.finalP10}
                pct={pctVsInvested(result.finalP10, result.totalInvested)}
                color="#F87171"
                bg="rgba(239,68,68,0.10)"
                curr={curr}
              />
              <ResultCard
                label={t("Typical", "Tipico")}
                sub="P50"
                value={result.finalP50}
                pct={pctVsInvested(result.finalP50, result.totalInvested)}
                color="#38BDF8"
                bg="rgba(56,189,248,0.12)"
                curr={curr}
                prominent
              />
              <ResultCard
                label={t("Optimistic", "Ottimistico")}
                sub="P90"
                value={result.finalP90}
                pct={pctVsInvested(result.finalP90, result.totalInvested)}
                color="#4ADE80"
                bg="rgba(74,222,128,0.10)"
                curr={curr}
              />
            </div>

            <p className="text-xs mb-3" style={{ color: "#94A3B8" }}>
              {t("Amount you invested", "Importo investito")}:{" "}
              <span className="font-semibold text-white">{curr}{fmt(result.totalInvested)}</span>
            </p>

            {/* Loss probability */}
            {(() => {
              const pct = Math.round(result.lossProbability * 100);
              const high = pct >= 25;
              return (
                <div className="rounded-2xl px-3 py-2.5 mb-3"
                  style={{
                    backgroundColor: high ? "rgba(252,211,77,0.10)" : "rgba(74,222,128,0.10)",
                    border: `1px solid ${high ? "rgba(252,211,77,0.30)" : "rgba(74,222,128,0.25)"}`,
                  }}>
                  <p className="text-xs font-semibold" style={{ color: high ? "#FCD34D" : "#4ADE80" }}>
                    📉 {t("Chance of ending with less than you put in", "Probabilità di finire con meno di quanto hai versato")}:{" "}
                    <span className="text-sm">{pct}%</span>
                  </p>
                  <p className="text-[10px] mt-0.5" style={{ color: "#94A3B8" }}>
                    {t(
                      `${result.lossCount} out of ${result.pathsCount} simulated futures ended below your deposit.`,
                      `${result.lossCount} scenari simulati su ${result.pathsCount} sono finiti sotto il tuo versamento.`
                    )}
                  </p>
                </div>
              );
            })()}

            {/* What this means + lump-sum vs monthly */}
            <div className="rounded-2xl p-3 mb-3"
              style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <p className="text-xs font-semibold mb-1.5 text-white">
                💡 {t(
                  "What this simulation tells you",
                  "Cosa ti dice questa simulazione"
                )}
              </p>
              <p className="text-[11px] leading-relaxed" style={{ color: "#94A3B8" }}>
                {t(
                  "Investing the full amount today means you're buying at one single price — whatever the market is at right now. Historically, this tends to outperform spreading the money out about two-thirds of the time, because markets trend up over the long run.",
                  "Investire tutto oggi significa comprare a un unico prezzo — quello del mercato in questo momento. Storicamente, fare così batte il versamento dilazionato circa due volte su tre, perché nel lungo periodo i mercati tendono a salire."
                )}
              </p>
              <p className="text-[11px] leading-relaxed mt-2" style={{ color: "#94A3B8" }}>
                {t(
                  "But the band is wider than for a monthly plan: if you happen to buy right before a big drop, the worst scenarios are deeper. A monthly plan (PAC) trades some of that upside for a smoother, more predictable ride.",
                  "Però la banda è più larga di un piano mensile: se compri proprio prima di un crollo, gli scenari peggiori sono più cupi. Un piano mensile (PAC) sacrifica un po' di guadagno potenziale per un percorso più stabile e prevedibile."
                )}
              </p>
            </div>

            <p className="text-[10px]" style={{ color: "#64748B" }}>
              {t(
                "Past performance is not a guarantee of future results.",
                "Le performance passate non garantiscono i risultati futuri."
              )}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function LegendRow({
  swatch, title, sub,
}: {
  swatch: React.ReactNode; title: string; sub: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="flex items-center justify-center" style={{ width: 16, minHeight: 16, paddingTop: 4 }}>
        {swatch}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-white">{title}</p>
        <p className="text-[10px] leading-snug" style={{ color: "#94A3B8" }}>{sub}</p>
      </div>
    </div>
  );
}

function ResultCard({
  label, sub, value, pct, color, bg, curr, prominent,
}: {
  label: string; sub: string; value: number; pct: number;
  color: string; bg: string; curr: string; prominent?: boolean;
}) {
  return (
    <div className="rounded-xl p-2.5 text-center"
      style={{ backgroundColor: bg, border: `1px solid ${color}33` }}>
      <p className="text-[10px] font-medium" style={{ color: "#94A3B8" }}>{label}</p>
      <p className="text-[9px]" style={{ color: "#64748B" }}>{sub}</p>
      <p className={`mt-1 font-bold ${prominent ? "text-base" : "text-sm"}`} style={{ color }}>
        {curr}{fmt(value)}
      </p>
      <p className="text-[10px] font-semibold mt-0.5" style={{ color }}>
        {pct >= 0 ? "+" : ""}{pct.toFixed(1)}%
      </p>
    </div>
  );
}

function SimTooltip({ active, payload, label, curr, t }: any) {
  if (!active || !payload?.length) return null;
  const months = Number(label);
  const yLabel = months % 12 === 0
    ? `${months / 12}${t("y", "a")}`
    : `${months}${t("mo", "mes")}`;

  const band     = payload.find((p: any) => p.dataKey === "band")?.value as [number, number] | undefined;
  const median   = payload.find((p: any) => p.dataKey === "p50")?.value as number | undefined;
  const invested = payload.find((p: any) => p.dataKey === "invested")?.value as number | undefined;

  return (
    <div className="rounded-xl shadow-lg p-2.5 text-[11px]"
      style={{ backgroundColor: "#0F1F35", border: "1px solid rgba(255,255,255,0.15)", color: "white" }}>
      <p className="font-semibold mb-1" style={{ color: "#94A3B8" }}>{yLabel}</p>
      {median !== undefined && (
        <p style={{ color: "#0EA5E9" }}>{t("Typical", "Tipico")}: {curr}{fmt(median)}</p>
      )}
      {band && (
        <p style={{ color: "#38BDF8" }}>P10–P90: {curr}{fmt(band[0])} – {curr}{fmt(band[1])}</p>
      )}
      {invested !== undefined && (
        <p style={{ color: "#FCD34D" }}>{t("Deposit", "Versamento")}: {curr}{fmt(invested)}</p>
      )}
    </div>
  );
}
