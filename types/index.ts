// ── Domain types ──────────────────────────────────────────────────────────────

export type Signal   = "BUY" | "HOLD" | "SELL";
export type Lang     = "en" | "it";
export type Period   = "1W" | "1M" | "3M" | "1Y";
export type TabName  = "Portfolio" | "News" | "Analysis" | "Learn";

// ── Database rows (mirror Supabase schema) ────────────────────────────────────

export interface Holding {
  id?:             string;
  user_id?:        string;
  ticker:          string;
  name:            string;
  shares:          number;
  cost_per_share:  number;
  currency?:       string;
  purchased_at?:   string;   // YYYY-MM-DD
  signal?:         Signal;
  created_at?:     string;
}

export interface Profile {
  id:           string;
  display_name: string | null;
  lang:         Lang;
  created_at:   string;
}

// ── Enriched holding (after price data is merged in) ─────────────────────────

export interface EnrichedHolding extends Holding {
  price:       number;
  changePct:   number;
  currSymbol:  string;
  currentVal:  number;
  absGain:     number;
  pctGain:     number;
}

// ── API response shapes ───────────────────────────────────────────────────────

export interface PriceQuote {
  symbol:        string;
  price:         number;
  previousClose: number;
  change:        number;
  changePct:     number;
  currency:      string;
  error?:        boolean;
}

export interface ChartPoint {
  date:  string;
  [key: string]: number | string;   // Portfolio, S&P 500, NASDAQ, STOXX 600
}

export interface TickerResult {
  symbol:   string;
  name:     string;
  type:     string;
  exchange: string;
}

// ── UI helpers ────────────────────────────────────────────────────────────────

export interface SummaryCard {
  label:    string;
  value:    string;
  sub:      string;
  positive: boolean;
}

export interface AISuggestion {
  type:    Signal;
  ticker:  string;
  name:    string;
  reason:  string;
  target:  string;
}

export interface NewsItem {
  source:     string;
  time:       string;
  headline:   string;
  link?:      string;
  tickers:    string[];
  timestamp?: number;
}

// ── AI Signal per holding ────────────────────────────────────────────────────

export interface TickerSignal {
  ticker:    string;
  score:     number | null;
  signal:    Signal;
  factors:   { trend: number; value: number; momentum: number } | null;
  meta:      { ma200Diff: number; mom3m: number; pe: number | null; fairPE: number; sector: string; peEstimated?: boolean } | null;
  analyst: {
    label: string;               // "STRONG BUY" | "BUY" | "HOLD" | "SELL"
    strongBuy: number; buy: number; hold: number; sell: number; strongSell: number;
    total: number;
  } | null;
  reasoning: string | null;
  backtest: {
    buySignals: number;
    wins:       number;
    winRate:    number;          // 0–100 %
    sampleSize: number;
  } | null;
}

// ── Market-wide signal (watchlist stocks, no cost basis) ─────────────────────

export type Region = "US" | "EU";

export interface MarketStockSignal {
  ticker:    string;
  name:      string;
  region:    Region;
  score:     number;
  signal:    Signal;
  meta: {
    ma200Diff:   number;          // % above/below 200-day MA
    mom3m:       number;          // 3-month price return %
    pe:          number | null;   // trailing or forward PE (null = ETF/unknown)
    fairPE:      number;          // sector fair PE benchmark
    sector:      string;          // sector label
    peEstimated: boolean;         // true when using hardcoded fallback PE
  };
  factors: {
    trend:     number;   // 0–40 (200MA trend)
    value:     number;   // 0–35 (P/E valuation)
    momentum:  number;   // 0–25 (3-month momentum)
  };
  reasoning: string | null;
}

export interface MarketSignalsResponse {
  buys:  MarketStockSignal[];
  sells: MarketStockSignal[];
}

// ── Parsed holding from voice/chat ────────────────────────────────────────────

export interface ParsedHolding {
  ticker: string;
  name:   string;
  shares: string;
  cost:   string;
  date:   string;
}

export interface WatchlistItem {
  ticker:        string;
  name:          string;
  added_at:      string;   // ISO date string
  target_price?: number;
  notes?:        string;
}

// ── Sprint 10 — AI Portfolio Allocation ───────────────────────────────────────

export interface AllocationSlice {
  asset_class:        string;
  target_pct:         number;
  current_pct:        number;
  why:                string;
  example_instrument: string;
}

export interface AllocationResult {
  profile:    string;
  summary:    string;
  allocation: AllocationSlice[];
  gap:        string;
  actions:    string[];
}

// ── Sprint 6 — Community Analysis ────────────────────────────────────────────

export type Sentiment  = "bullish" | "neutral" | "bearish";
export type Horizon    = "short" | "mid" | "long";
export type Conviction = "low" | "medium" | "high";

export interface CommunityAnalysis {
  id:           string;
  user_id:      string;
  display_name: string;
  ticker:       string;
  ticker_name:  string;
  sentiment:    Sentiment;
  horizon:      Horizon;
  conviction:   Conviction;
  bull_case:    string;
  risk:         string;
  created_at:   string;
}
