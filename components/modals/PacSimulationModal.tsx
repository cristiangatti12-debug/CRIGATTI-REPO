"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import {
  ComposedChart, Area, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from "recharts";
import type { AccumulationPlan } from "@/types";
import { runMonteCarlo, hashTicker, type SimResult } from "@/lib/montecarlo";

const CURR_SYM: Record<string, string> = { EUR: "€", USD: "$", GBP: "£" };

function fmt(n: number, d = 0) {
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

function toMonthly(amount: number, interval: "weekly" | "monthly" | "quarterly") {
  if (interval === "weekly")    return amount * (52 / 12);
  if (interval === "quarterly") return amount / 3;
  return amount;
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
  plan:    AccumulationPlan;
  onClose: () => void;
  t:       (en: string, it: string) => string;
  appLang: "en" | "it";
}

export default function PacSimulationModal({ plan, onClose, t, appLang }: Props) {
  const curr = CURR_SYM[plan.currency] ?? plan.currency;

  const [monthlyAmount, setMonthlyAmount] = useState<string>(() =>
    toMonthly(plan.amount, plan.interval).toFixed(0)
  );
  const [years,   setYears]   = useState<YearOpt>(5);
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [result,  setResult]  = useState<SimResult | null>(null);

  // Fetch historical stats once per ticker.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setHistory(null);
    fetch(`/api/pac-history?ticker=${encodeURIComponent(plan.ticker)}`)
      .then(r => r.json())
      .then((data: HistoryResponse) => {
        if (cancelled) return;
        if (data.error === "insufficient-history") {
          setError(t(
            `Not enough history for ${plan.ticker} to run a reliable simulation (need at least 12 months).`,
            `Storico insufficiente per ${plan.ticker} per una simulazione affidabile (servono almeno 12 mesi).`
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
  }, [plan.ticker, t]);

  // Re-run Monte Carlo when inputs or stats change (debounced).
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!history || error) { setResult(null); return; }
    if (history.muMonthly === 0 && history.sigmaMonthly === 0) { setResult(null); return; }
    const amt = parseFloat(monthlyAmount);
    if (!Number.isFinite(amt) || amt <= 0) { setResult(null); return; }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const sim = runMonteCarlo({
        muMonthly:           history.muMonthly,
        sigmaMonthly:        history.sigmaMonthly,
        monthlyContribution: amt,
        horizonMonths:       years * 12,
        paths:               500,
        seed:                hashTicker(plan.ticker),
      });
      setResult(sim);
    }, 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [history, error, monthlyAmount, years]);

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
              📊 {t("Simulate Plan", "Simula Piano")}
            </h2>
            <p className="text-xs mt-0.5 truncate" style={{ color: "#94A3B8" }}>
              <span className="font-mono font-bold" style={{ color: "#38BDF8" }}>{plan.ticker}</span>
              <span className="ml-2">{plan.name}</span>
            </p>
            {history && !error && history.nObs > 0 && (
              <p className="text-[10px] mt-1" style={{ color: "#64748B" }}>
                {t(
                  `5y history: ${history.nObs} months · avg ${annualMuPct.toFixed(1)}%/y · vol ${annualSigmaPct.toFixed(1)}%`,
                  `Storico 5y: ${history.nObs} mesi · media ${annualMuPct.toFixed(1)}%/a · vol ${annualSigmaPct.toFixed(1)}%`
                )}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-2xl leading-none flex-shrink-0 ml-2" style={{ color: "#64748B" }}>×</button>
        </div>

        {/* Error banner */}
        {error && (
          <p className="text-xs mb-4 px-3 py-2 rounded-xl"
            style={{ backgroundColor: "rgba(252,211,77,0.12)", color: "#FCD34D" }}>
            {error}
          </p>
        )}

        {/* Inputs */}
        <div className="space-y-3 mb-4">
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "#64748B" }}>
              {t("Monthly contribution", "Versamento mensile")} ({curr})
            </label>
            <input type="number" min="1" step="any"
              className="w-full rounded-xl px-4 py-3 text-sm outline-none"
              style={{ backgroundColor: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", color: "white" }}
              value={monthlyAmount}
              onChange={e => setMonthlyAmount(e.target.value)} />
          </div>

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

        {/* Chart */}
        {loading && (
          <div className="rounded-2xl p-8 text-center"
            style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <p className="text-xs animate-pulse" style={{ color: "#0EA5E9" }}>
              {t("Loading historical data…", "Caricamento dati storici…")}
            </p>
          </div>
        )}

        {!loading && result && (
          <>
            <p className="text-[11px] leading-relaxed mb-2" style={{ color: "#94A3B8" }}>
              {t(
                "This chart shows 500 possible futures for your plan, based on how this investment moved over the last 5 years.",
                "Questo grafico mostra 500 futuri possibili per il tuo piano, basati su come questo investimento si è mosso negli ultimi 5 anni."
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
                title={t("Money you put in", "Soldi versati")}
                sub={t(
                  "The total you contributed, before any market growth.",
                  "Il totale che hai versato, prima di qualsiasi crescita del mercato."
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
                label={t("Median", "Mediana")}
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
              {t("Total invested", "Totale investito")}:{" "}
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
                      `${result.lossCount} out of ${result.pathsCount} simulated futures ended below your contributions.`,
                      `${result.lossCount} scenari simulati su ${result.pathsCount} sono finiti sotto i tuoi versamenti.`
                    )}
                  </p>
                </div>
              );
            })()}

            {/* Why monthly beats lump sum */}
            <div className="rounded-2xl p-3 mb-3"
              style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <p className="text-xs font-semibold mb-1.5 text-white">
                💡 {t(
                  "Why a monthly plan beats investing everything at once",
                  "Perché un piano mensile è meglio che investire tutto in una volta"
                )}
              </p>
              <p className="text-[11px] leading-relaxed" style={{ color: "#94A3B8" }}>
                {t(
                  "Putting all your money in on day one means you're betting on a single price. If the market drops the next month, you've already bought everything at the high.",
                  "Mettere tutti i tuoi soldi il primo giorno significa scommettere su un singolo prezzo. Se il mercato scende il mese dopo, hai già comprato tutto al massimo."
                )}
              </p>
              <p className="text-[11px] leading-relaxed mt-2" style={{ color: "#94A3B8" }}>
                {t(
                  "With a monthly plan you keep buying through the dips, so you automatically pick up more shares when prices are low and fewer when they're high. Over time the journey gets smoother: you don't need to guess the right moment, and one bad month doesn't sink your whole investment.",
                  "Con un piano mensile continui a comprare anche nei ribassi, quindi prendi automaticamente più quote quando i prezzi sono bassi e meno quando sono alti. Nel tempo il percorso diventa più stabile: non devi indovinare il momento giusto, e un mese brutto non affonda tutto il tuo investimento."
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

        {!loading && !result && !error && history && (
          <p className="text-xs px-3 py-2 rounded-xl"
            style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "#94A3B8" }}>
            {t("Enter a monthly amount to run the simulation.", "Inserisci un importo mensile per avviare la simulazione.")}
          </p>
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

  // Recharts gives us each series as its own payload entry. Pull out by dataKey.
  const band     = payload.find((p: any) => p.dataKey === "band")?.value as [number, number] | undefined;
  const median   = payload.find((p: any) => p.dataKey === "p50")?.value as number | undefined;
  const invested = payload.find((p: any) => p.dataKey === "invested")?.value as number | undefined;

  return (
    <div className="rounded-xl shadow-lg p-2.5 text-[11px]"
      style={{ backgroundColor: "#0F1F35", border: "1px solid rgba(255,255,255,0.15)", color: "white" }}>
      <p className="font-semibold mb-1" style={{ color: "#94A3B8" }}>{yLabel}</p>
      {median !== undefined && (
        <p style={{ color: "#0EA5E9" }}>{t("Median", "Mediana")}: {curr}{fmt(median)}</p>
      )}
      {band && (
        <p style={{ color: "#38BDF8" }}>P10–P90: {curr}{fmt(band[0])} – {curr}{fmt(band[1])}</p>
      )}
      {invested !== undefined && (
        <p style={{ color: "#FCD34D" }}>{t("Invested", "Investito")}: {curr}{fmt(invested)}</p>
      )}
    </div>
  );
}
