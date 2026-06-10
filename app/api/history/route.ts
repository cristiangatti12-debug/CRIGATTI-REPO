import { NextRequest, NextResponse } from "next/server";

const INDEXES: Record<string, string> = {
  "S&P 500":   "^GSPC",
  "NASDAQ":    "^IXIC",
  "STOXX 600": "^STOXX50E",
};

const PERIOD_RANGE: Record<string, string> = {
  "1W": "5d",
  "1M": "1mo",
  "3M": "3mo",
  "1Y": "1y",
};

const PERIOD_INTERVAL: Record<string, string> = {
  "1W": "1d",
  "1M": "1d",
  "3M": "1d",
  "1Y": "1wk",
};

interface HoldingParam { ticker: string; shares: number; }

// Fetch OHLCV from Yahoo Finance
async function fetchHistory(ticker: string, range: string, interval: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${interval}&range=${range}`;
  const res  = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  const json = await res.json();
  const data = json?.chart?.result?.[0];
  if (!data) return [];
  const timestamps: number[]  = data.timestamp ?? [];
  const closes: number[]      = data.indicators?.quote?.[0]?.close ?? [];
  return timestamps
    .map((t, i) => ({ t, c: closes[i] }))
    .filter(x => x.c != null) as { t: number; c: number }[];
}

function toLabel(ts: number) {
  return new Date(ts * 1000).toISOString().slice(0, 10); // "YYYY-MM-DD" — sorts correctly
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const period   = searchParams.get("period") ?? "1M";
  const range    = PERIOD_RANGE[period]    ?? "1mo";
  const interval = PERIOD_INTERVAL[period] ?? "1d";

  // Holdings passed as JSON: [{"ticker":"AAPL","shares":10}, ...]
  let holdings: HoldingParam[] = [];
  try {
    const raw = searchParams.get("holdings");
    if (raw) holdings = JSON.parse(raw);
  } catch {}

  const result: Record<string, { date: string; value: number }[]> = {};

  // ── Fetch indexes ──────────────────────────────────────────────────────────
  await Promise.all(
    Object.entries(INDEXES).map(async ([label, ticker]) => {
      try {
        const pts = await fetchHistory(ticker, range, interval);
        if (!pts.length) { result[label] = []; return; }
        const base = pts[0].c;
        result[label] = pts.map(p => ({
          date:  toLabel(p.t),
          value: parseFloat(((p.c / base) * 100).toFixed(2)),
        }));
      } catch { result[label] = []; }
    })
  );

  // ── Fetch portfolio (real holdings) ────────────────────────────────────────
  if (holdings.length > 0) {
    try {
      // Fetch price history for each holding in parallel
      const seriesArr = await Promise.all(
        holdings.map(h => fetchHistory(h.ticker, range, interval).catch(() => []))
      );

      // Collect every unique timestamp across all holdings
      const allTs = [...new Set(seriesArr.flatMap(pts => pts.map(p => p.t)))].sort((a, b) => a - b);

      // Build portfolio value with forward-fill so cross-exchange gaps don't create partial sums.
      // If a holding has no data yet for a timestamp, use its last known price.
      const valueMap: Record<number, number> = {};
      allTs.forEach(ts => {
        let total = 0;
        let valid = true;
        seriesArr.forEach((pts, i) => {
          if (!pts.length) { valid = false; return; }
          const shares = holdings[i].shares;
          let price: number | null = null;
          for (let j = pts.length - 1; j >= 0; j--) {
            if (pts[j].t <= ts) { price = pts[j].c; break; }
          }
          if (price === null) { valid = false; return; }
          total += shares * price;
        });
        if (valid) valueMap[ts] = total;
      });

      const timestamps = Object.keys(valueMap).map(Number).sort((a, b) => a - b);
      if (timestamps.length > 0) {
        const base = valueMap[timestamps[0]];
        result["Portfolio"] = timestamps.map(t => ({
          date:  toLabel(t),
          value: parseFloat(((valueMap[t] / base) * 100).toFixed(2)),
        }));
      }
    } catch { /* skip portfolio line */ }
  }

  return NextResponse.json(result);
}
