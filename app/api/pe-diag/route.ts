// Temporary diagnostic endpoint — surfaces raw FMP responses so we can see
// what the free-tier returns for the tickers that fall to estimate.
// DELETE this file once the FMP P/E flow is confirmed working.

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ticker  = req.nextUrl.searchParams.get("ticker") ?? "MSFT";
  const FMP_KEY = (process.env.FMP_API_KEY ?? "").trim();
  if (!FMP_KEY) return NextResponse.json({ error: "no FMP_API_KEY" }, { status: 500 });

  const endpoints: Array<[string, string]> = [
    ["/api/v3/quote",          `https://financialmodelingprep.com/api/v3/quote/${encodeURIComponent(ticker)}?apikey=${FMP_KEY}`],
    ["/stable/quote",          `https://financialmodelingprep.com/stable/quote?symbol=${encodeURIComponent(ticker)}&apikey=${FMP_KEY}`],
    ["/stable/key-metrics-ttm",`https://financialmodelingprep.com/stable/key-metrics-ttm?symbol=${encodeURIComponent(ticker)}&apikey=${FMP_KEY}`],
    ["/stable/ratios-ttm",     `https://financialmodelingprep.com/stable/ratios-ttm?symbol=${encodeURIComponent(ticker)}&apikey=${FMP_KEY}`],
    ["/api/v3/ratios-ttm",     `https://financialmodelingprep.com/api/v3/ratios-ttm/${encodeURIComponent(ticker)}?apikey=${FMP_KEY}`],
    ["/api/v3/key-metrics-ttm",`https://financialmodelingprep.com/api/v3/key-metrics-ttm/${encodeURIComponent(ticker)}?apikey=${FMP_KEY}`],
  ];

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
