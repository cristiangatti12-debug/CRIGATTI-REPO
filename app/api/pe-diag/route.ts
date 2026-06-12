// Temporary diagnostic endpoint — surfaces raw FMP + Finnhub responses so we
// can see what each provider returns for a given ticker.
// DELETE this file once the P/E flow is confirmed working for the full
// ticker universe (US + EU + unprofitable).

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ticker      = req.nextUrl.searchParams.get("ticker") ?? "MSFT";
  const FMP_KEY     = (process.env.FMP_API_KEY ?? "").trim();
  const FINNHUB_KEY = (process.env.FINNHUB_API_KEY ?? "").trim();
  if (!FMP_KEY && !FINNHUB_KEY) return NextResponse.json({ error: "no data API keys" }, { status: 500 });

  const endpoints: Array<[string, string]> = [];
  if (FMP_KEY) {
    endpoints.push(
      ["fmp /stable/ratios-ttm",      `https://financialmodelingprep.com/stable/ratios-ttm?symbol=${encodeURIComponent(ticker)}&apikey=${FMP_KEY}`],
      ["fmp /stable/key-metrics-ttm", `https://financialmodelingprep.com/stable/key-metrics-ttm?symbol=${encodeURIComponent(ticker)}&apikey=${FMP_KEY}`],
    );
  }
  if (FINNHUB_KEY) {
    endpoints.push(
      ["finnhub /stock/metric",       `https://finnhub.io/api/v1/stock/metric?symbol=${encodeURIComponent(ticker)}&metric=all&token=${FINNHUB_KEY}`],
      ["finnhub /quote",              `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(ticker)}&token=${FINNHUB_KEY}`],
      ["finnhub /stock/profile2",     `https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(ticker)}&token=${FINNHUB_KEY}`],
    );
  }

  const results = await Promise.all(endpoints.map(async ([label, url]) => {
    try {
      const res = await fetch(url, { cache: "no-store" });
      const text = await res.text();
      let parsed: unknown;
      try { parsed = JSON.parse(text); } catch { parsed = text.slice(0, 400); }
      return { label, status: res.status, body: parsed };
    } catch (e) {
      return { label, status: 0, error: (e as Error).message };
    }
  }));

  return NextResponse.json({ ticker, results });
}
