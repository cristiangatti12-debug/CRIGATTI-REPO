import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export const maxDuration = 60;

// Runs daily at 08:00 UTC via Vercel Cron.
// Finds signal_history rows from ~365 days ago with no outcome recorded,
// fetches current price from Yahoo Finance, and fills in price_1y_later + return_1y.

async function fetchPrice(ticker: string): Promise<number | null> {
  for (const host of ["query2", "query1"]) {
    try {
      const url = `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=2d`;
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      });
      if (!res.ok) continue;
      const json  = await res.json();
      const price = json?.chart?.result?.[0]?.meta?.regularMarketPrice as number | undefined;
      if (price && price > 0) return price;
    } catch { continue; }
  }
  return null;
}

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "Missing env" }, { status: 500 });

  const admin = createAdminClient(url, key);

  // Rows signaled ~365 days ago (within a ±7 day window to handle weekends/holidays)
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - 372);
  const windowEnd   = new Date();
  windowEnd.setDate(windowEnd.getDate() - 358);

  const { data: pending, error } = await admin
    .from("signal_history")
    .select("id, ticker, price_at_signal")
    .is("price_1y_later", null)
    .gte("signaled_at", windowStart.toISOString().split("T")[0])
    .lte("signaled_at", windowEnd.toISOString().split("T")[0])
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!pending || pending.length === 0) return NextResponse.json({ updated: 0 });

  // Fetch current prices (deduplicated by ticker)
  const uniqueTickers = [...new Set((pending as { ticker: string }[]).map(r => r.ticker))];
  const priceMap: Record<string, number | null> = {};
  await Promise.all(uniqueTickers.map(async t => {
    priceMap[t] = await fetchPrice(t);
  }));

  // Update each row
  let updated = 0;
  for (const row of pending as { id: string; ticker: string; price_at_signal: number }[]) {
    const currentPrice = priceMap[row.ticker];
    if (!currentPrice || row.price_at_signal <= 0) continue;
    const return1y = parseFloat(((currentPrice - row.price_at_signal) / row.price_at_signal * 100).toFixed(2));
    await admin
      .from("signal_history")
      .update({ price_1y_later: currentPrice, return_1y: return1y })
      .eq("id", row.id);
    updated++;
  }

  return NextResponse.json({ updated, checked: pending.length });
}
