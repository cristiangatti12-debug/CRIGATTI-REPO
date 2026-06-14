import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

interface YahooNewsItem {
  uuid:                string;
  title:               string;
  publisher:           string;
  link:                string;
  providerPublishTime: number;
  relatedTickers?:     string[];
}

interface FormattedItem {
  source:    string;
  time:      string;
  headline:  string;
  link:      string;
  tickers:   string[];
  timestamp: number;
}

function timeAgo(unixSec: number, lang: string): string {
  const age = Math.floor(Date.now() / 1000) - unixSec;
  if (lang === "it") {
    if (age < 3600)  return `${Math.floor(age / 60)}m fa`;
    if (age < 86400) return `${Math.floor(age / 3600)}h fa`;
    return `${Math.floor(age / 86400)}g fa`;
  }
  if (age < 3600)  return `${Math.floor(age / 60)}m ago`;
  if (age < 86400) return `${Math.floor(age / 3600)}h ago`;
  return `${Math.floor(age / 86400)}d ago`;
}

// Strip exchange suffix for news search — Yahoo news search works better with
// the base ticker (e.g. "IP" from "IP.MI") than the full exchange-qualified symbol.
// For US tickers with no suffix (AAPL, MSFT) this is a no-op.
function newsQuery(ticker: string): string {
  return ticker.includes(".") ? ticker.split(".")[0] : ticker;
}

async function fetchYahooNews(ticker: string): Promise<YahooNewsItem[]> {
  const query = newsQuery(ticker);
  for (const host of ["query2", "query1"]) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
      const url = `https://${host}.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=0&newsCount=8&enableNavLinks=false`;
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
        signal: controller.signal,
        next: { revalidate: 300 },
      } as RequestInit);
      clearTimeout(timer);
      if (!res.ok) continue;
      const data = await res.json();
      const items = (data.news ?? []) as YahooNewsItem[];
      if (items.length > 0) return items;
    } catch { clearTimeout(timer); continue; }
  }
  return [];
}

function dedup(batches: YahooNewsItem[][], exclude: Set<string> = new Set()): YahooNewsItem[] {
  const seen = new Set<string>(exclude);
  const out:  YahooNewsItem[] = [];
  for (const batch of batches) {
    for (const item of batch) {
      if (!seen.has(item.uuid)) { seen.add(item.uuid); out.push(item); }
    }
  }
  return out.sort((a, b) => b.providerPublishTime - a.providerPublishTime);
}

function format(item: YahooNewsItem, lang: string): FormattedItem {
  return {
    source:    item.publisher,
    time:      timeAgo(item.providerPublishTime, lang),
    headline:  item.title,
    link:      item.link,
    tickers:   (item.relatedTickers ?? []).slice(0, 4),
    timestamp: item.providerPublishTime,
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tickers = searchParams.get("tickers")?.split(",").filter(Boolean) ?? [];
  const lang    = searchParams.get("lang") ?? "en";

  // ── Holdings news: one query per ticker, deduplicated, max 4 ──────────────
  let holdingsNews:  FormattedItem[] = [];
  const holdingUuids = new Set<string>();

  if (tickers.length > 0) {
    const batches = await Promise.all(
      tickers.slice(0, 6).map(t => fetchYahooNews(t))
    );
    const items = dedup(batches);
    items.forEach(i => holdingUuids.add(i.uuid));
    holdingsNews = items.slice(0, 6).map(i => format(i, lang));
  }

  // ── Market news: broad finance queries, exclude what's already shown ───────
  const marketQueries = ["stock market today", "S&P 500", "investing", "economy"];
  const marketBatches = await Promise.all(marketQueries.map(q => fetchYahooNews(q)));
  const marketItems   = dedup(marketBatches, holdingUuids); // no overlap with holdings section
  const marketNews    = marketItems.slice(0, 8).map(i => format(i, lang));

  return NextResponse.json({ holdings: holdingsNews, market: marketNews });
}
