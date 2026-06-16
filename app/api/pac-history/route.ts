import { NextRequest, NextResponse } from "next/server";
import { computeMonthlyStats } from "@/lib/montecarlo";

export const maxDuration = 30;

async function fetchMonthly(ticker: string) {
  for (const host of ["query2", "query1"]) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
      const url = `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1mo&range=5y`;
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "application/json",
        },
        signal: controller.signal,
        next: { revalidate: 86400 },
      } as RequestInit);
      clearTimeout(timer);
      if (!res.ok) continue;
      const json = await res.json();
      const data = json?.chart?.result?.[0];
      if (!data) continue;
      const closes: (number | null)[] = data.indicators?.quote?.[0]?.close ?? [];
      const cleaned = closes.filter((c): c is number => c != null && Number.isFinite(c) && c > 0);
      return {
        closes:   cleaned,
        currency: data.meta?.currency ?? "USD",
      };
    } catch {
      clearTimeout(timer);
      continue;
    }
  }
  return null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ticker = searchParams.get("ticker")?.trim().toUpperCase();

  if (!ticker) {
    return NextResponse.json({ error: "missing-ticker" }, { status: 400 });
  }

  const fetched = await fetchMonthly(ticker);
  if (!fetched) {
    return NextResponse.json({
      ticker,
      error:        "fetch-failed",
      currency:     "USD",
      closes:       [],
      muMonthly:    0,
      sigmaMonthly: 0,
      nObs:         0,
    });
  }

  const { closes, currency } = fetched;

  if (closes.length < 12) {
    return NextResponse.json({
      ticker,
      error:        "insufficient-history",
      currency,
      closes,
      muMonthly:    0,
      sigmaMonthly: 0,
      nObs:         Math.max(0, closes.length - 1),
    });
  }

  const stats = computeMonthlyStats(closes);

  return NextResponse.json({
    ticker,
    currency,
    closes,
    muMonthly:    stats.muMonthly,
    sigmaMonthly: stats.sigmaMonthly,
    nObs:         stats.nObs,
  });
}
