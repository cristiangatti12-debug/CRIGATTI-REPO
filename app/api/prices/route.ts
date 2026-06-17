import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

async function fetchQuote(symbol: string) {
  // Try query2 first (more reliable from Vercel IPs), fall back to query1
  for (const host of ["query2", "query1"]) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const url = `https://${host}.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=2d`;
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "application/json",
        },
        signal: controller.signal,
        next: { revalidate: 60 },
      } as RequestInit);
      clearTimeout(timer);
      if (!res.ok) continue;
      const json = await res.json();
      const result = json?.chart?.result?.[0];
      const meta   = result?.meta;
      if (!meta) continue;

      const price = meta.regularMarketPrice ?? 0;

      // Find the previous trading day's close.
      // Yahoo's `chartPreviousClose` for range=2d is the close at the boundary of the
      // chart window (~2-3 trading days ago) — NOT yesterday's close. The reliable
      // source is the first daily bar in the close array.
      const closes: (number | null)[] = result?.indicators?.quote?.[0]?.close ?? [];
      // Find the most recent non-null close that is strictly before the current price bar.
      // Bars are oldest→newest; the last non-null close is "today", the one before it is "yesterday".
      const nonNull = closes.filter((c): c is number => typeof c === "number");
      const prevFromBars = nonNull.length >= 2 ? nonNull[nonNull.length - 2] : null;

      const prev =
        prevFromBars ??
        meta.regularMarketPreviousClose ??
        meta.previousClose              ??
        meta.chartPreviousClose         ??
        price;

      return {
        symbol,
        price,
        previousClose: prev,
        change:    price - prev,
        changePct: prev !== 0 ? ((price - prev) / prev) * 100 : 0,
        currency:  meta.currency ?? "USD",
      };
    } catch { clearTimeout(timer); continue; }
  }
  return { symbol, price: 0, change: 0, changePct: 0, currency: "USD", error: true };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbols = searchParams.get("symbols")?.split(",").filter(Boolean) ?? [];

  if (!symbols.length) {
    return NextResponse.json({ error: "No symbols" }, { status: 400 });
  }

  const results = await Promise.all(symbols.map(fetchQuote));
  return NextResponse.json(results);
}
