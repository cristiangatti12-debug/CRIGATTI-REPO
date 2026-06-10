import { NextRequest, NextResponse } from "next/server";
import { getQuote } from "@/lib/marketData";

export const dynamic = "force-dynamic";

// ── Sector defaults ────────────────────────────────────────────────────────────
const SECTOR_DEFAULTS: Record<string, {
  fairPE: number; evEbitda: number; wacc: number; termGrowth: number; g1: number;
}> = {
  "Technology":             { fairPE: 28, evEbitda: 22, wacc: 0.09, termGrowth: 0.03,  g1: 0.08 },
  "Healthcare":             { fairPE: 22, evEbitda: 16, wacc: 0.08, termGrowth: 0.03,  g1: 0.07 },
  "Consumer Cyclical":      { fairPE: 20, evEbitda: 12, wacc: 0.09, termGrowth: 0.025, g1: 0.06 },
  "Consumer Defensive":     { fairPE: 18, evEbitda: 14, wacc: 0.07, termGrowth: 0.025, g1: 0.05 },
  "Financial Services":     { fairPE: 14, evEbitda: 0,  wacc: 0.10, termGrowth: 0.02,  g1: 0.05 },
  "Energy":                 { fairPE: 12, evEbitda: 8,  wacc: 0.10, termGrowth: 0.02,  g1: 0.03 },
  "Utilities":              { fairPE: 16, evEbitda: 10, wacc: 0.06, termGrowth: 0.02,  g1: 0.03 },
  "Basic Materials":        { fairPE: 15, evEbitda: 10, wacc: 0.09, termGrowth: 0.02,  g1: 0.04 },
  "Industrials":            { fairPE: 18, evEbitda: 14, wacc: 0.08, termGrowth: 0.025, g1: 0.05 },
  "Real Estate":            { fairPE: 20, evEbitda: 18, wacc: 0.07, termGrowth: 0.025, g1: 0.04 },
  "Communication Services": { fairPE: 22, evEbitda: 14, wacc: 0.08, termGrowth: 0.03,  g1: 0.07 },
};
const DEFAULT_SECTOR = { fairPE: 20, evEbitda: 14, wacc: 0.09, termGrowth: 0.025, g1: 0.05 };

// Approximate trailing PE for common EU stocks — used to derive EPS when financial
// statement data is unavailable (FMP free plan covers EU profiles but not financials).
const EU_APPROX_PE: Record<string, number> = {
  IP:25, RACE:52, ENEL:11, ENI:7,  ISP:8,  UCG:8,  MONC:38, CPR:32,
  MB:13, STLA:4,  AMP:32,  BMED:16,
  MC:24, AIR:30,  OR:32,   SAN:14, BNP:7,  ACA:7,  DG:17,   RNO:5,
  BAYN:11, DTE:12, ALV:11, BMW:5,  MBG:5,  SIE:24,
  NESN:20, ROG:16, NOVN:16, ABB:24,
  HSBA:11, GSK:13, AZN:30, RIO:9,  ULVR:19,
  HEIA:20, INGA:7, AD:14,
};

// Alpha Vantage uses uppercase sector names — map to our keys
const AV_SECTOR: Record<string, string> = {
  "TECHNOLOGY":              "Technology",
  "HEALTH CARE":             "Healthcare",
  "CONSUMER DISCRETIONARY":  "Consumer Cyclical",
  "CONSUMER STAPLES":        "Consumer Defensive",
  "FINANCIALS":              "Financial Services",
  "FINANCIAL SERVICES":      "Financial Services",
  "ENERGY":                  "Energy",
  "UTILITIES":               "Utilities",
  "MATERIALS":               "Basic Materials",
  "INDUSTRIALS":             "Industrials",
  "REAL ESTATE":             "Real Estate",
  "COMMUNICATION SERVICES":  "Communication Services",
};

export interface ValuationResult {
  ticker:  string;
  name:    string;
  price:   number;
  sector:  string;
  isETF:   boolean;
  isCrypto?: boolean;
  isBond?:  boolean;

  // ETF-specific data (populated when isETF = true)
  etfInfo?: {
    totalAssets:    number | null;   // AUM in USD
    expenseRatio:   number | null;   // e.g. 0.0003 for 0.03%
    categoryName:   string;          // "Large Blend", "Technology", etc.
    dividendYield:  number | null;   // trailing annual yield
    fiftyTwoWkLow:  number | null;
    fiftyTwoWkHigh: number | null;
  };

  // Crypto-specific market data (populated when isCrypto = true)
  cryptoData?: {
    marketCap:         number;
    marketCapRank:     number;
    change24h:         number;
    change7d:          number;
    change30d:         number;
    circulatingSupply: number;
    totalSupply:       number | null;
    ath:               number;
    athChangePercent:  number;
  };

  graham: {
    fairValue:  number | null;
    eps:        number;
    bookValue:  number;
    weight:     number;
    note:       string;
  };

  pe: {
    fairValue:  number | null;
    eps:        number;
    fairPE:     number;
    trailingPE: number;
    weight:     number;
    note:       string;
  };

  dcf: {
    fairValue:         number | null;
    fcfPerShare:       number;
    growthRate:        number;
    terminalGrowth:    number;
    wacc:              number;
    yearlyProjections: { year: number; fcf: number; pv: number }[];
    terminalValue:     number;
    pvTerminal:        number;
    weight:            number;
    note:              string;
  };

  evEbitda: {
    fairValue:       number | null;
    ebitda:          number;
    currentMultiple: number;
    sectorMultiple:  number;
    marketCap:       number;
    totalDebt:       number;
    cash:            number;
    shares:          number;
    weight:          number;
    note:            string;
  };

  verdict: {
    weightedFairValue: number | null;
    vsCurrentPct:      number | null;
    recommendation:    string;
    totalWeight:       number;
  };
}

// ── Crypto ticker → CoinGecko ID ──────────────────────────────────────────────
const CRYPTO_MAP: Record<string, string> = {
  BTC: "bitcoin",         ETH: "ethereum",        SOL: "solana",
  BNB: "binancecoin",     XRP: "ripple",           ADA: "cardano",
  AVAX: "avalanche-2",    DOT: "polkadot",         MATIC: "matic-network",
  LINK: "chainlink",      UNI: "uniswap",          DOGE: "dogecoin",
  SHIB: "shiba-inu",      LTC: "litecoin",         BCH: "bitcoin-cash",
  ATOM: "cosmos",         FIL: "filecoin",         ICP: "internet-computer",
  NEAR: "near",           APT: "aptos",            ARB: "arbitrum",
  OP: "optimism",         ALGO: "algorand",        VET: "vechain",
  SAND: "the-sandbox",    MANA: "decentraland",    AXS: "axie-infinity",
  CRO: "crypto-com-chain",FTM: "fantom",           HBAR: "hedera-hashgraph",
  THETA: "theta-token",   TRX: "tron",             XLM: "stellar",
  AAVE: "aave",           MKR: "maker",            SUI: "sui",
  TON: "the-open-network",INJ: "injective-protocol",SEI: "sei-network",
};

// Safe number parser for Alpha Vantage string fields
const n = (v: any) => { const x = parseFloat(v ?? ""); return isFinite(x) ? x : 0; };

export async function GET(req: NextRequest) {
  const ticker      = req.nextUrl.searchParams.get("ticker")?.toUpperCase();
  const passedPrice = parseFloat(req.nextUrl.searchParams.get("price") ?? "0");
  if (!ticker) return NextResponse.json({ error: "ticker required" }, { status: 400 });

  const AV_KEY  = (process.env.AV_API_KEY  ?? "").trim();
  const FMP_KEY = (process.env.FMP_API_KEY ?? "").trim();
  if (!AV_KEY && !FMP_KEY) {
    return NextResponse.json(
      { error: "No data API key configured — add AV_API_KEY or FMP_API_KEY to env vars" },
      { status: 500 }
    );
  }

  const AV     = "https://www.alphavantage.co/query";
  const FMP    = "https://financialmodelingprep.com/api/v3";

  const YF_HEADERS = {
    "User-Agent":      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept":          "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer":         "https://finance.yahoo.com/",
    "Origin":          "https://finance.yahoo.com",
  };

  // ── Bond / fixed-income early exit — no valuation available ─────────────────
  // Detect ISIN codes (2 letters + 10 alphanumeric) or common bond keyword patterns.
  const BOND_RE = /^[A-Z]{2}[A-Z0-9]{10}$|BTP|BUND|GILT|TREAS|OAT|BOT|CCT|BONO|BKO|SCHATZ/i;
  if (BOND_RE.test(ticker)) {
    const na = (note: string) => ({ fairValue: null, weight: 0, note });
    return NextResponse.json({
      ticker, name: ticker, price: passedPrice, sector: "Fixed Income", isETF: false, isBond: true,
      graham:   { ...na("Fixed income instruments do not have EPS or book value"), eps: 0, bookValue: 0 },
      pe:       { ...na("Fixed income instruments do not have earnings per share"), eps: 0, fairPE: 0, trailingPE: 0 },
      dcf:      { ...na("Fixed income instruments do not report free cash flow"), fcfPerShare: 0, growthRate: 0, terminalGrowth: 0, wacc: 0, yearlyProjections: [], terminalValue: 0, pvTerminal: 0 },
      evEbitda: { ...na("Fixed income instruments do not have EBITDA"), ebitda: 0, currentMultiple: 0, sectorMultiple: 0, marketCap: 0, totalDebt: 0, cash: 0, shares: 0 },
      verdict:  { weightedFairValue: null, vsCurrentPct: null, recommendation: "Equity valuation models do not apply to bonds and fixed income instruments", totalWeight: 0 },
    } satisfies ValuationResult);
  }

  // ── Crypto early exit — skip AV/YF entirely, use CoinGecko ───────────────────
  const coinId = CRYPTO_MAP[ticker];
  if (coinId) {
    try {
      const cg: any = await fetch(
        `https://api.coingecko.com/api/v3/coins/${coinId}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false`,
        { headers: { Accept: "application/json" } }
      ).then(r => r.json());
      const md = cg?.market_data;
      if (!md) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
      const cgPrice = md.current_price?.usd ?? 0;
      const price_  = passedPrice > 0 ? passedPrice : cgPrice;
      const na = (note: string) => ({ fairValue: null, weight: 0, note });
      return NextResponse.json({
        ticker, name: cg.name ?? ticker, price: price_, sector: "Crypto",
        isETF: false, isCrypto: true,
        cryptoData: {
          marketCap:         md.market_cap?.usd          ?? 0,
          marketCapRank:     cg.market_cap_rank           ?? 0,
          change24h:         md.price_change_percentage_24h  ?? 0,
          change7d:          md.price_change_percentage_7d   ?? 0,
          change30d:         md.price_change_percentage_30d  ?? 0,
          circulatingSupply: md.circulating_supply        ?? 0,
          totalSupply:       md.total_supply              ?? null,
          ath:               md.ath?.usd                  ?? 0,
          athChangePercent:  md.ath_change_percentage?.usd ?? 0,
        },
        graham:   { ...na("Cryptoassets do not have EPS or book value"),     eps: 0, bookValue: 0 },
        pe:       { ...na("Cryptoassets do not have earnings per share"),     eps: 0, fairPE: 0, trailingPE: 0 },
        dcf:      { ...na("Cryptoassets do not report free cash flow"), fcfPerShare: 0, growthRate: 0, terminalGrowth: 0, wacc: 0, yearlyProjections: [], terminalValue: 0, pvTerminal: 0 },
        evEbitda: { ...na("Cryptoassets do not have EBITDA"), ebitda: 0, currentMultiple: 0, sectorMultiple: 0, marketCap: 0, totalDebt: 0, cash: 0, shares: 0 },
        verdict:  { weightedFairValue: null, vsCurrentPct: null, recommendation: "Traditional valuation models do not apply to cryptoassets", totalWeight: 0 },
      } satisfies ValuationResult);
    } catch {
      return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }
  }

  const isSimple = req.nextUrl.searchParams.get("simple") === "true";

  // ── Detect international (non-US) tickers — e.g. IP.MI, MC.PA, ALV.DE ────────
  const EU_SUFFIX       = /\.[A-Z]{1,2}$/i;
  const isInternational = EU_SUFFIX.test(ticker);

  // ── FMP path — used for all international stocks ──────────────────────────────
  // AV has no coverage of EU exchanges; YF v10 quoteSummary is blocked from Vercel
  // for non-US tickers. FMP supports EU exchanges natively and is reliable.
  let fmpProfile: any = null;
  let fmpMetrics: any = null;
  let fmpIncome:  any = null;

  if (isInternational && FMP_KEY) {
    // FMP stable profile is free for EU stocks; financial statements require paid plan.
    // We fetch only the profile (name, sector, marketCap, isEtf) and derive EPS from
    // hardcoded approximate PE ratios stored in EU_APPROX_PE.
    const raw = await fetch(
      `https://financialmodelingprep.com/stable/profile?symbol=${encodeURIComponent(ticker)}&apikey=${FMP_KEY}`
    ).then(r => r.json()).catch(() => null);
    fmpProfile = Array.isArray(raw) && raw.length > 0 ? raw[0] : null;
  }

  const hasFMP = !!fmpProfile?.symbol;

  // For EU stocks: use getQuote (query2 v7) which is reliable from Vercel IPs.
  // Returns bookValue, enterpriseValue, evToEbitda, eps, marketCap.
  // sharesOutstanding is derived from marketCap / price when not directly available.
  let yfQuoteEU: any = null;
  if (isInternational && hasFMP) {
    try {
      const quote = await getQuote(ticker);
      yfQuoteEU = {
        bookValue:          quote.bookValue,
        enterpriseValue:    quote.enterpriseValue,
        enterpriseToEbitda: quote.evToEbitda,
        sharesOutstanding:  (quote.marketCap && passedPrice > 0)
                              ? Math.round(quote.marketCap / passedPrice)
                              : 0,
        trailingEps:        quote.eps,
        marketCap:          quote.marketCap,
      };
    } catch {}
  }

  // International + no FMP data (key missing or ticker unknown) → unavailable
  if (isInternational && !hasFMP) {
    return NextResponse.json({ error: "international_unavailable" }, { status: 422 });
  }

  // ── AV + Yahoo Finance path — US stocks only ───────────────────────────────────

  let ov: any      = {};
  let yfResult: any = null;

  if (!isInternational) {
    if (!AV_KEY) {
      return NextResponse.json({ error: "AV_API_KEY not set" }, { status: 500 });
    }
    const [ovRaw, yfRaw] = await Promise.allSettled([
      fetch(`${AV}?function=OVERVIEW&symbol=${ticker}&apikey=${AV_KEY}`).then(r => r.json()).catch(() => ({})),
      fetch(
        `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=summaryDetail,financialData,defaultKeyStatistics,assetProfile,fundProfile&formatted=false`,
        { headers: YF_HEADERS }
      ).then(r => r.json()).catch(() => null),
    ]);

    ov = ovRaw.status === "fulfilled" ? ovRaw.value : {};
    const yfRawData: any = yfRaw.status === "fulfilled" ? yfRaw.value : null;
    yfResult = yfRawData?.quoteSummary?.result?.[0] ?? null;

    const ovNote      = ov?.["Note"] ?? ov?.["Information"] ?? "";
    const avHasSymbol = !!ov?.["Symbol"];
    const hasAV       = avHasSymbol;
    const hasYF       = !!yfResult;

    if (ov?.["Error Message"] && !hasYF) {
      return NextResponse.json({ error: `Ticker not found: ${ticker}` }, { status: 404 });
    }
    if (ovNote && !hasYF) {
      return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }
    if (!hasAV && !hasYF) {
      return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }
  }

  // ── Step 2: CASH_FLOW (AV full card only; YF/FMP provide FCF directly) ─────────
  let cfRaw: any = {};
  const avHasSymbol2 = !!ov?.["Symbol"];
  if (!isSimple && avHasSymbol2 && !yfResult && !isInternational && AV_KEY) {
    try {
      cfRaw = await fetch(`${AV}?function=CASH_FLOW&symbol=${ticker}&apikey=${AV_KEY}`).then(r => r.json()).catch(() => ({}));
    } catch {}
  }

  // ── Parse fields — unified from FMP, Yahoo Finance, or Alpha Vantage ────────
  let name: string, sector: string, isETF: boolean;
  let marketCap = 0, shares = 0, eps = 0, bookVal = 0;
  let ebitda = 0, evEbitdaRaw = 0, trailingPE = 0;
  let cfOk: boolean, opCF = 0, capex = 0, fcf = 0;

  if (hasFMP) {
    // ── FMP source (international stocks) ──────────────────────────────────────
    // FMP stable profile is free for EU stocks but does NOT include EPS, PE, FCF,
    // EBITDA or book value (those require a paid plan). We derive EPS from hardcoded
    // approximate PE ratios so that the P/E and DCF(EPS-proxy) models still work.
    name        = fmpProfile.companyName ?? ticker;
    const fmpSec = fmpProfile.sector ?? "";
    sector      = SECTOR_DEFAULTS[fmpSec] ? fmpSec : "";
    isETF       = fmpProfile.isEtf === true || fmpProfile.isFund === true;
    marketCap   = fmpProfile.marketCap ?? 0;
    const fmpPrice_ = passedPrice > 0 ? passedPrice : (fmpProfile.price ?? 0);
    shares      = marketCap > 0 && fmpPrice_ > 0 ? Math.round(marketCap / fmpPrice_) : 0;
    // Derive EPS from hardcoded approximate PE × price (best we can do without paid financial data)
    const baseTicker = ticker.replace(/\.[A-Z]+$/i, "").toUpperCase();
    trailingPE  = EU_APPROX_PE[baseTicker] ?? 0;
    eps         = trailingPE > 0 && fmpPrice_ > 0 ? parseFloat((fmpPrice_ / trailingPE).toFixed(4)) : 0;
    // Supplement with Yahoo Finance v7/quote fundamentals (works for EU tickers from Vercel)
    const yfBV      = typeof yfQuoteEU?.bookValue            === "number" ? yfQuoteEU.bookValue            : 0;
    const yfEV      = typeof yfQuoteEU?.enterpriseValue      === "number" ? yfQuoteEU.enterpriseValue      : 0;
    const yfEVRatio = typeof yfQuoteEU?.enterpriseToEbitda   === "number" ? yfQuoteEU.enterpriseToEbitda   : 0;
    const yfShares  = typeof yfQuoteEU?.sharesOutstanding    === "number" ? yfQuoteEU.sharesOutstanding    : 0;
    const yfEPS     = typeof yfQuoteEU?.trailingEps          === "number" ? yfQuoteEU.trailingEps          : 0;
    const yfMktCap  = typeof yfQuoteEU?.marketCap            === "number" ? yfQuoteEU.marketCap            : 0;
    // Book value → Graham Number
    if (yfBV > 0)     bookVal = yfBV;
    // EBITDA derived from EV ÷ (EV/EBITDA ratio) — no direct EBITDA field in v7/quote
    if (yfEV > 0 && yfEVRatio > 0) ebitda = yfEV / yfEVRatio;
    if (yfEVRatio > 0) evEbitdaRaw = yfEVRatio;
    // Better share count and market cap from Yahoo Finance
    if (yfShares > 0) shares = yfShares;
    if (yfMktCap > 0) marketCap = yfMktCap;
    // Better EPS from Yahoo Finance (more accurate than price ÷ approx PE)
    if (yfEPS > 0)    eps = yfEPS;
    opCF        = 0;
    capex       = 0;
    fcf         = 0;
    cfOk        = false;
  } else if (yfResult) {
    // ── Yahoo Finance source ────────────────────────────────────────────────
    name        = yfResult.assetProfile?.longName ?? ticker;
    const yfSec = yfResult.assetProfile?.sector ?? "";
    sector      = SECTOR_DEFAULTS[yfSec] ? yfSec : "";   // YF sectors match our keys directly
    isETF       = !yfResult.assetProfile?.sector;          // ETFs have no assetProfile sector
    marketCap   = yfResult.summaryDetail?.marketCap?.raw ?? 0;
    shares      = yfResult.defaultKeyStatistics?.sharesOutstanding?.raw ?? 0;
    eps         = yfResult.defaultKeyStatistics?.trailingEps?.raw ?? 0;
    bookVal     = yfResult.defaultKeyStatistics?.bookValue?.raw ?? 0;
    ebitda      = yfResult.financialData?.ebitda?.raw ?? 0;
    evEbitdaRaw = yfResult.defaultKeyStatistics?.enterpriseToEbitda?.raw ?? 0;
    trailingPE  = yfResult.summaryDetail?.trailingPE?.raw ?? 0;
    // YF provides FCF directly (operating CF − CapEx already netted)
    opCF        = yfResult.financialData?.operatingCashflow?.raw ?? 0;
    capex       = 0;
    fcf         = yfResult.financialData?.freeCashflow?.raw ?? 0;
    cfOk        = !isSimple && (fcf !== 0 || opCF > 0);
  } else {
    // ── Alpha Vantage source ────────────────────────────────────────────────
    name        = (ov["Name"] ?? ticker) as string;
    const avSec = (ov["Sector"] ?? "").toUpperCase();
    sector      = AV_SECTOR[avSec] ?? (ov["Sector"] ?? "");
    isETF       = (ov["AssetType"] ?? "") === "ETF";
    marketCap   = n(ov["MarketCapitalization"]);
    shares      = n(ov["SharesOutstanding"]);
    eps         = n(ov["EPS"]);
    bookVal     = n(ov["BookValue"]);
    ebitda      = n(ov["EBITDA"]);
    evEbitdaRaw = n(ov["EVToEBITDA"]);
    trailingPE  = n(ov["TrailingPE"]);
    const cfNote2 = cfRaw?.["Note"] ?? cfRaw?.["Information"] ?? "";
    cfOk        = !cfNote2 && Array.isArray(cfRaw?.annualReports) && cfRaw.annualReports.length > 0;
    const cf0   = cfOk ? cfRaw.annualReports[0] : {};
    opCF        = n(cf0["operatingCashflow"]);
    capex       = Math.abs(n(cf0["capitalExpenditures"]));
    fcf         = cfOk && opCF > 0 ? Math.max(0, opCF - capex) : 0;
  }

  // Price: use what the component passed in; fall back to market-cap / shares
  const price = passedPrice > 0 ? passedPrice
    : (shares > 0 && marketCap > 0 ? marketCap / shares : 0);

  // ── EPS proxy: when real FCF unavailable, use EPS as FCF/share estimate ───
  // For profitable companies EPS ≈ FCF/share (within ~10-30%), giving a conservative DCF.
  // We reduce the DCF weight to 2 (vs 3) to reflect the approximation.
  const fcfPS_real = cfOk ? (yfResult ? (fcf > 0 ? fcf / (shares > 0 ? shares : 1) : opCF / (shares > 0 ? shares : 1)) : (opCF > 0 ? fcf / (shares > 0 ? shares : 1) : 0)) : 0;
  let fcfPS: number;
  let usingEpsProxy = false;
  if (fcfPS_real > 0) {
    fcfPS = fcfPS_real;
  } else if (eps > 0) {
    fcfPS = eps;           // EPS as FCF/share proxy
    usingEpsProxy = true;
  } else {
    fcfPS = 0;
  }

  // Net debt derived from current EV = EBITDA × current multiple
  // EV = marketCap + netDebt  →  netDebt = EV − marketCap
  const currentEV = ebitda > 0 && evEbitdaRaw > 0 ? ebitda * evEbitdaRaw : marketCap;
  const netDebt   = currentEV - marketCap;
  const totalDebt = Math.max(0,  netDebt);
  const cash      = Math.max(0, -netDebt);

  const sd = SECTOR_DEFAULTS[sector] ?? DEFAULT_SECTOR;
  const g1 = Math.min(0.20, Math.max(-0.05, sd.g1));

  // ── ETF handling ───────────────────────────────────────────────────────────
  if (isETF) {
    const na = (note: string) => ({ fairValue: null, weight: 0, note });
    // Extract ETF-specific data from Yahoo Finance fundProfile + summaryDetail
    const fp  = yfResult?.fundProfile ?? null;
    const sd_ = yfResult?.summaryDetail ?? null;
    const etfInfo: ValuationResult["etfInfo"] = {
      totalAssets:    sd_?.totalAssets?.raw             ?? null,
      expenseRatio:   fp?.feesExpensesInvestment?.annualReportExpenseRatio?.raw
                   ?? fp?.feesExpensesInvestment?.netExpRatio?.raw
                   ?? null,
      categoryName:   fp?.categoryName                  ?? "",
      dividendYield:  sd_?.trailingAnnualDividendYield?.raw ?? null,
      fiftyTwoWkLow:  sd_?.fiftyTwoWeekLow?.raw         ?? null,
      fiftyTwoWkHigh: sd_?.fiftyTwoWeekHigh?.raw        ?? null,
    };
    return NextResponse.json({
      ticker, name, price, sector: "ETF", isETF: true, etfInfo,
      graham:   { ...na("ETFs do not have EPS or book value"), eps: 0, bookValue: 0 },
      pe:       { ...na("ETFs do not have EPS"), eps: 0, fairPE: 0, trailingPE: 0 },
      dcf:      { ...na("ETFs do not report free cash flow"), fcfPerShare: 0, growthRate: 0, terminalGrowth: 0, wacc: 0, yearlyProjections: [], terminalValue: 0, pvTerminal: 0 },
      evEbitda: { ...na("ETFs do not have EBITDA"), ebitda: 0, currentMultiple: 0, sectorMultiple: 0, marketCap: 0, totalDebt: 0, cash: 0, shares: 0 },
      verdict:  { weightedFairValue: null, vsCurrentPct: null, recommendation: "Valuation models are not applicable to ETFs", totalWeight: 0 },
    } satisfies ValuationResult);
  }

  // ── REIT note: Real Estate sector — add dividend yield context to notes ──────
  const isREIT = sector === "Real Estate";
  const divYield = yfResult?.summaryDetail?.trailingAnnualDividendYield?.raw ?? 0;

  // ── Graham Number ──────────────────────────────────────────────────────────
  const grahamApplicable = eps > 0 && bookVal > 0;
  const grahamValue      = grahamApplicable ? Math.sqrt(22.5 * eps * bookVal) : null;
  const grahamWeight     = grahamApplicable && bookVal >= 10 ? 1 : 0;
  const grahamNote       = !grahamApplicable
    ? "Requires positive EPS and book value — insufficient data"
    : bookVal < 10
      ? `Asset-light company (book value $${bookVal.toFixed(2)}/share) — Graham Number not meaningful; weight set to 0`
      : "Applicable — company has significant tangible assets";

  // ── P/E Model ─────────────────────────────────────────────────────────────
  const peApplicable = eps > 0;
  const peValue      = peApplicable ? eps * sd.fairPE : null;
  const peWeight     = peApplicable ? 2 : 0;
  const peNote       = !peApplicable
    ? "Company is currently unprofitable (negative EPS) — weight set to 0"
    : isREIT && divYield > 0
      ? `Fair value = EPS $${eps.toFixed(2)} × REIT sector P/FFO ${sd.fairPE}× (current trailing P/E: ${trailingPE.toFixed(1)}×)  ·  Dividend yield: ${(divYield * 100).toFixed(2)}%`
      : `Fair value = EPS $${eps.toFixed(2)} × sector fair P/E ${sd.fairPE}× (current trailing P/E: ${trailingPE.toFixed(1)}×)`;

  // ── DCF ───────────────────────────────────────────────────────────────────
  const dcfApplicable = fcfPS > 0;
  const yearlyProjections: { year: number; fcf: number; pv: number }[] = [];
  let dcfValue: number | null = null;
  let terminalValue = 0, pvTerminal = 0;

  if (dcfApplicable) {
    let cumPV = 0, fcfCurrent = fcfPS;
    for (let y = 1; y <= 5; y++) {
      fcfCurrent = fcfCurrent * (1 + g1);
      const pv = fcfCurrent / Math.pow(1 + sd.wacc, y);
      yearlyProjections.push({ year: y, fcf: parseFloat(fcfCurrent.toFixed(4)), pv: parseFloat(pv.toFixed(4)) });
      cumPV += pv;
    }
    terminalValue = yearlyProjections[4].fcf * (1 + sd.termGrowth) / (sd.wacc - sd.termGrowth);
    pvTerminal    = terminalValue / Math.pow(1 + sd.wacc, 5);
    dcfValue      = parseFloat((cumPV + pvTerminal).toFixed(2));
  }

  const dcfWeight = dcfApplicable ? (usingEpsProxy ? 2 : 3) : 0;
  const dcfNote   = !dcfApplicable
    ? "Company has negative earnings and no cash flow data — DCF not applicable; weight set to 0"
    : usingEpsProxy
      ? `EPS used as FCF proxy (cash flow data rate-limited) · Growth ${(g1 * 100).toFixed(1)}%, WACC ${(sd.wacc * 100).toFixed(1)}%, terminal growth ${(sd.termGrowth * 100).toFixed(1)}%`
      : `Growth rate ${(g1 * 100).toFixed(1)}% (yrs 1–5), WACC ${(sd.wacc * 100).toFixed(1)}%, terminal growth ${(sd.termGrowth * 100).toFixed(1)}%`;

  // ── EV/EBITDA ─────────────────────────────────────────────────────────────
  const evApplicable = ebitda > 0 && shares > 0 && sd.evEbitda > 0;
  let evValue: number | null = null;
  if (evApplicable) {
    const fairEV     = ebitda * sd.evEbitda;
    const fairEquity = fairEV - netDebt;          // netDebt = totalDebt - cash
    evValue = parseFloat((fairEquity / shares).toFixed(2));
  }
  const evWeight = evApplicable ? 2 : 0;
  const evNote   = sd.evEbitda === 0
    ? "EV/EBITDA not meaningful for financial companies — weight set to 0"
    : !evApplicable
      ? "EBITDA is negative or data unavailable — weight set to 0"
      : `Fair EV = EBITDA $${(ebitda / 1e9).toFixed(1)}B × sector median ${sd.evEbitda}× (current: ${evEbitdaRaw.toFixed(1)}×)`;

  // ── Weighted verdict ───────────────────────────────────────────────────────
  const models = [
    { value: grahamValue, weight: grahamWeight },
    { value: peValue,     weight: peWeight     },
    { value: dcfValue,    weight: dcfWeight    },
    { value: evValue,     weight: evWeight     },
  ];
  const valid       = models.filter(m => m.value !== null && m.weight > 0);
  const totalWeight = valid.reduce((s, m) => s + m.weight, 0);

  let weightedFairValue: number | null = null;
  let vsCurrentPct: number | null = null;
  let recommendation = "Insufficient data for valuation";

  if (totalWeight > 0) {
    weightedFairValue = parseFloat(
      (valid.reduce((s, m) => s + m.value! * m.weight, 0) / totalWeight).toFixed(2)
    );
    if (price > 0) {
      vsCurrentPct = parseFloat(((weightedFairValue - price) / price * 100).toFixed(1));
      if      (vsCurrentPct > 25)  recommendation = "Significantly undervalued";
      else if (vsCurrentPct > 10)  recommendation = "Moderately undervalued";
      else if (vsCurrentPct > -10) recommendation = "Fairly valued / priced for perfection";
      else if (vsCurrentPct > -25) recommendation = "Moderately overvalued";
      else                         recommendation = "Significantly overvalued";
    }
  }

  return NextResponse.json({
    ticker, name, price, sector, isETF: false, isCrypto: false,
    graham:   { fairValue: grahamValue, eps, bookValue: bookVal, weight: grahamWeight, note: grahamNote },
    pe:       { fairValue: peValue, eps, fairPE: sd.fairPE, trailingPE, weight: peWeight, note: peNote },
    dcf:      { fairValue: dcfValue, fcfPerShare: fcfPS, growthRate: g1, terminalGrowth: sd.termGrowth, wacc: sd.wacc, yearlyProjections, terminalValue, pvTerminal, weight: dcfWeight, note: dcfNote },
    evEbitda: { fairValue: evValue, ebitda, currentMultiple: evEbitdaRaw, sectorMultiple: sd.evEbitda, marketCap, totalDebt, cash, shares, weight: evWeight, note: evNote },
    verdict:  { weightedFairValue, vsCurrentPct, recommendation, totalWeight },
  } satisfies ValuationResult);
}
