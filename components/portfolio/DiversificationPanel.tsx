"use client";
import { useMemo } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import type { RiskResult } from "../modals/RiskModal";

// ── Types ─────────────────────────────────────────────────────────────────────
interface HoldingInput {
  ticker:         string;
  shares:         number;
  cost_per_share: number;
  currentVal:     number;  // 0 until prices load — we fall back to cost basis
}

interface Props {
  holdings:   HoldingInput[];
  riskResult: RiskResult | null;
  t:          (en: string, it: string) => string;
}

// ── Sector heuristics (fallback when valuation cache is empty) ─────────────────
const TICKER_SECTOR: Record<string, string> = {
  // Technology
  AAPL: "Technology", MSFT: "Technology", NVDA: "Technology", GOOGL: "Technology",
  GOOG: "Technology", META: "Technology", AMD: "Technology",  INTC: "Technology",
  ORCL: "Technology", CRM:  "Technology", ADBE: "Technology", QCOM: "Technology",
  TSM:  "Technology", ASML: "Technology", SAP:  "Technology",
  // Healthcare
  JNJ: "Healthcare", UNH: "Healthcare", PFE: "Healthcare", ABBV: "Healthcare",
  MRK: "Healthcare", LLY: "Healthcare", BMY: "Healthcare", AMGN: "Healthcare",
  // Financials
  JPM: "Financials", BAC: "Financials", WFC: "Financials", GS:  "Financials",
  MS:  "Financials", BLK: "Financials", V:   "Financials", MA:  "Financials",
  AXP: "Financials", ALV: "Financials",
  // Consumer Discretionary
  AMZN: "Consumer Discretionary", TSLA: "Consumer Discretionary",
  NKE:  "Consumer Discretionary", MCD:  "Consumer Discretionary",
  SBUX: "Consumer Discretionary", BKNG: "Consumer Discretionary",
  // Consumer Staples
  PG: "Consumer Staples", KO: "Consumer Staples", PEP: "Consumer Staples",
  WMT: "Consumer Staples", COST: "Consumer Staples", PM: "Consumer Staples",
  // Energy
  XOM: "Energy", CVX: "Energy", SHEL: "Energy", BP: "Energy", TTE: "Energy",
  // Industrials
  CAT: "Industrials", BA: "Industrials", HON: "Industrials", UPS: "Industrials",
  GE:  "Industrials", DE: "Industrials", RTX: "Industrials",
  // Communication Services
  DIS: "Communication Services", NFLX: "Communication Services",
  SPOT: "Communication Services", T: "Communication Services",
  VZ:  "Communication Services",
  // Real Estate
  AMT: "Real Estate", PLD: "Real Estate", EQIX: "Real Estate",
  // Utilities
  NEE: "Utilities", DUK: "Utilities", SO: "Utilities",
  // Materials
  LIN: "Materials", APD: "Materials", NEM: "Materials",
};

const SECTOR_COLORS: Record<string, string> = {
  "Technology":             "#0EA5E9",
  "Healthcare":             "#22C55E",
  "Financials":             "#6366F1",
  "Consumer Discretionary": "#F97316",
  "Consumer Staples":       "#84CC16",
  "Energy":                 "#EAB308",
  "Industrials":            "#14B8A6",
  "Communication Services": "#EC4899",
  "Real Estate":            "#A855F7",
  "Utilities":              "#94A3B8",
  "Materials":              "#F59E0B",
  "ETF / Mixed":            "#CBD5E1",
  "Other":                  "#E2E8F0",
};

// Resolve sector: check valuation cache first, then heuristic, then "Other"
function getSector(ticker: string): string {
  const key = ticker.toUpperCase();
  // Try full cache first, then simple cache
  for (const cacheKey of [`vela_val_v8_${key}`, `vela_val_v8_simple_${key}`]) {
    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) {
        const { d } = JSON.parse(raw);
        if (d?.isETF)   return "ETF / Mixed";
        if (d?.sector)  return d.sector;
      }
    } catch {}
  }
  // Ticker heuristic (strip exchange suffix: ALV.DE → ALV)
  const base = key.replace(/\.(DE|PA|L|AS|SW|MI|CO|MC|BR)$/i, "");
  return TICKER_SECTOR[base] ?? "Other";
}

// Is European (exchange suffix)?
function isEuropean(ticker: string) {
  return /\.(DE|PA|L|AS|SW|MI|CO|MC|BR)$/i.test(ticker);
}

// ── Score computation ──────────────────────────────────────────────────────────
function diversificationScore(
  sectorMap: Record<string, number>,
  topPct:    number,
  count:     number,
): number {
  const sectorCount = Object.keys(sectorMap).filter(s => s !== "ETF / Mixed").length;
  // 40 pts: sector spread (10 per distinct sector, max 4)
  const sectorPts = Math.min(4, sectorCount) * 10;
  // 30 pts: top holding concentration
  const concPts = topPct < 0.20 ? 30 : topPct < 0.30 ? 20 : topPct < 0.50 ? 10 : 0;
  // 30 pts: number of holdings (5 each, max 6)
  const countPts = Math.min(6, count) * 5;
  return sectorPts + concPts + countPts;
}

// ── Custom PieChart label ──────────────────────────────────────────────────────
function renderCustomLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) {
  if (percent < 0.05) return null;
  const RADIAN  = Math.PI / 180;
  const radius  = innerRadius + (outerRadius - innerRadius) * 0.6;
  const x       = cx + radius * Math.cos(-midAngle * RADIAN);
  const y       = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central"
      style={{ fontSize: 10, fontWeight: 700 }}>
      {(percent * 100).toFixed(0)}%
    </text>
  );
}

// ── Custom Tooltip ─────────────────────────────────────────────────────────────
function SectorTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0];
  return (
    <div className="rounded-xl shadow-lg px-3 py-2 text-xs"
      style={{ backgroundColor: "#1E3A5F", color: "white" }}>
      <p className="font-semibold">{name}</p>
      <p>{(value * 100).toFixed(1)}%</p>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function DiversificationPanel({ holdings, riskResult, t }: Props) {
  const analysis = useMemo(() => {
    if (holdings.length === 0) return null;

    // Use currentVal if loaded, otherwise fall back to cost basis
    const withValues = holdings.map(h => ({
      ticker: h.ticker,
      value:  h.currentVal > 0 ? h.currentVal : h.shares * h.cost_per_share,
      sector: getSector(h.ticker),
    }));

    const total = withValues.reduce((s, h) => s + h.value, 0);
    if (total === 0) return null;

    // Sector breakdown (normalised to 0-1 fractions)
    const sectorMap: Record<string, number> = {};
    withValues.forEach(h => {
      sectorMap[h.sector] = (sectorMap[h.sector] ?? 0) + h.value / total;
    });

    // Top holding
    const sorted = [...withValues].sort((a, b) => b.value - a.value);
    const top = sorted[0];
    const topPct = top.value / total;

    // Geographic split
    const euValue = withValues.filter(h => isEuropean(h.ticker)).reduce((s, h) => s + h.value, 0);
    const usValue = total - euValue;
    const euPct   = euValue / total;
    const usPct   = usValue / total;

    // Score
    const score = diversificationScore(sectorMap, topPct, holdings.length);

    // Pie data
    const pieData = Object.entries(sectorMap)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value }));

    return { sectorMap, pieData, top, topPct, euPct, usPct, score, total };
  }, [holdings]);

  if (!analysis || holdings.length < 2) return null;

  const { pieData, top, topPct, euPct, usPct, score } = analysis;

  // Score colour
  const scoreColor = score >= 70 ? "#22C55E" : score >= 40 ? "#EAB308" : "#EF4444";
  const scoreLabel = score >= 70
    ? t("Well diversified", "Ben diversificato")
    : score >= 40
    ? t("Moderate risk", "Rischio moderato")
    : t("Concentrated", "Concentrato");

  // Concentration warning
  const concWarning = topPct > 0.50
    ? { level: "danger",  bg: "#FEE2E2", border: "#FECACA", color: "#DC2626" }
    : topPct > 0.30
    ? { level: "warning", bg: "#FEF9C3", border: "#FDE68A", color: "#CA8A04" }
    : null;

  // Equity vs bonds comparison with risk profile
  const equityPct = Math.round((1) * 100); // all holdings are equity
  const riskGap   = riskResult ? Math.abs(equityPct - riskResult.stocks) : 0;

  return (
    <div className="rounded-2xl overflow-hidden shadow-sm"
      style={{ backgroundColor: "white", border: "1px solid #E0F2FE" }}>

      {/* ── Header ── */}
      <div className="px-4 pt-4 pb-3 flex items-center justify-between"
        style={{ borderBottom: "1px solid #F0F9FF" }}>
        <div>
          <h3 className="text-sm font-bold" style={{ color: "#1E3A5F" }}>
            {t("Portfolio Diversification", "Diversificazione del Portafoglio")}
          </h3>
          <p className="text-xs" style={{ color: "#94A3B8" }}>
            {t("Sector · Concentration · Geography", "Settore · Concentrazione · Geografia")}
          </p>
        </div>
        {/* Diversification score badge */}
        <div className="flex flex-col items-center">
          <div className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm"
            style={{ backgroundColor: `${scoreColor}18`, border: `2px solid ${scoreColor}`, color: scoreColor }}>
            {score}
          </div>
          <p className="text-[10px] mt-0.5 font-medium" style={{ color: scoreColor }}>{scoreLabel}</p>
        </div>
      </div>

      {/* ── Concentration warning (if triggered) ── */}
      {concWarning && (
        <div className="mx-4 mt-3 rounded-xl px-3 py-2 flex items-start gap-2"
          style={{ backgroundColor: concWarning.bg, border: `1px solid ${concWarning.border}` }}>
          <span className="text-sm flex-shrink-0">{concWarning.level === "danger" ? "🚨" : "⚠️"}</span>
          <p className="text-xs leading-relaxed" style={{ color: concWarning.color }}>
            <strong>{top.ticker.replace(/\.(DE|PA|L|AS|SW|MI|CO)$/i, "")}</strong>
            {" "}{t("is", "è")}{" "}
            <strong>{(topPct * 100).toFixed(0)}%</strong>
            {" "}{t("of your portfolio —", "del tuo portafoglio —")}{" "}
            {concWarning.level === "danger"
              ? t("extreme concentration, consider rebalancing urgently.", "concentrazione estrema, considera di ribilanciare urgentemente.")
              : t("high concentration, consider diversifying.", "alta concentrazione, considera di diversificare.")}
          </p>
        </div>
      )}

      {/* ── Sector donut + legend ── */}
      <div className="px-4 pt-3 pb-2">
        <p className="text-xs font-semibold mb-2" style={{ color: "#64748B" }}>
          {t("Sector allocation", "Allocazione per settore")}
        </p>
        <div className="flex items-center gap-3">
          {/* Donut chart */}
          <div className="flex-shrink-0" style={{ width: 110, height: 110 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={28}
                  outerRadius={52}
                  paddingAngle={2}
                  dataKey="value"
                  labelLine={false}
                  label={renderCustomLabel}
                >
                  {pieData.map((entry, i) => (
                    <Cell
                      key={entry.name}
                      fill={SECTOR_COLORS[entry.name] ?? `hsl(${i * 40}, 60%, 55%)`}
                    />
                  ))}
                </Pie>
                <Tooltip content={<SectorTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Legend */}
          <div className="flex-1 space-y-1.5 min-w-0">
            {pieData.slice(0, 6).map(entry => (
              <div key={entry.name} className="flex items-center gap-1.5 min-w-0">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: SECTOR_COLORS[entry.name] ?? "#CBD5E1" }} />
                <span className="text-xs truncate flex-1" style={{ color: "#1E3A5F" }}>
                  {entry.name}
                </span>
                <span className="text-xs font-semibold flex-shrink-0" style={{ color: "#64748B" }}>
                  {(entry.value * 100).toFixed(0)}%
                </span>
              </div>
            ))}
            {pieData.length > 6 && (
              <p className="text-xs" style={{ color: "#94A3B8" }}>
                +{pieData.length - 6} {t("more", "altri")}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Geographic split ── */}
      <div className="px-4 pt-1 pb-3" style={{ borderTop: "1px solid #F0F9FF" }}>
        <p className="text-xs font-semibold mb-2 mt-2" style={{ color: "#64748B" }}>
          {t("Geographic exposure", "Esposizione geografica")}
        </p>
        <div className="flex rounded-full overflow-hidden h-3 mb-2">
          <div style={{ width: `${usPct * 100}%`, backgroundColor: "#0EA5E9" }} />
          <div style={{ width: `${euPct * 100}%`, backgroundColor: "#6366F1" }} />
        </div>
        <div className="flex gap-4">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "#0EA5E9" }} />
            <span className="text-xs" style={{ color: "#64748B" }}>
              🇺🇸 {t("US", "USA")} <strong style={{ color: "#1E3A5F" }}>{(usPct * 100).toFixed(0)}%</strong>
            </span>
          </div>
          {euPct > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "#6366F1" }} />
              <span className="text-xs" style={{ color: "#64748B" }}>
                🇪🇺 {t("Europe", "Europa")} <strong style={{ color: "#1E3A5F" }}>{(euPct * 100).toFixed(0)}%</strong>
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Risk profile comparison ── */}
      {riskResult && (
        <div className="mx-4 mb-4 mt-1 rounded-xl p-3"
          style={{ backgroundColor: "#F8FAFC", border: "1px solid #E2E8F0" }}>
          <p className="text-xs font-semibold mb-2" style={{ color: "#64748B" }}>
            {t("vs your risk profile", "vs il tuo profilo di rischio")} ·{" "}
            <span style={{ color: "#0EA5E9" }}>{riskResult.profile}</span>
          </p>
          <div className="space-y-1.5">
            {/* Actual: 100% stocks (all holdings are equity) */}
            <div>
              <div className="flex justify-between text-xs mb-0.5">
                <span style={{ color: "#64748B" }}>{t("Current", "Attuale")}</span>
                <span style={{ color: "#1E3A5F", fontWeight: 600 }}>100% {t("Stocks", "Azioni")}</span>
              </div>
              <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: "#E0F2FE" }}>
                <div className="h-2 rounded-full" style={{ width: "100%", backgroundColor: "#0EA5E9" }} />
              </div>
            </div>
            {/* Suggested */}
            <div>
              <div className="flex justify-between text-xs mb-0.5">
                <span style={{ color: "#64748B" }}>{t("Suggested", "Suggerito")}</span>
                <span style={{ color: "#1E3A5F", fontWeight: 600 }}>
                  {riskResult.stocks}% {t("Stocks", "Azioni")} · {riskResult.bonds}% {t("Bonds", "Obbl.")} · {riskResult.cash}% {t("Cash", "Liq.")}
                </span>
              </div>
              <div className="flex rounded-full overflow-hidden h-2">
                <div style={{ width: `${riskResult.stocks}%`, backgroundColor: "#0EA5E9" }} />
                <div style={{ width: `${riskResult.bonds}%`,  backgroundColor: "#6366F1" }} />
                <div style={{ width: `${riskResult.cash}%`,   backgroundColor: "#94A3B8" }} />
              </div>
            </div>
          </div>
          {riskGap >= 10 && (
            <p className="text-xs mt-2" style={{ color: "#CA8A04" }}>
              ⚠️ {t(
                `Your portfolio is 100% stocks — your ${riskResult.profile} profile suggests adding ${riskResult.bonds}% bonds and ${riskResult.cash}% cash.`,
                `Il tuo portafoglio è 100% azioni — il tuo profilo ${riskResult.profile} suggerisce di aggiungere ${riskResult.bonds}% obbligazioni e ${riskResult.cash}% liquidità.`
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
