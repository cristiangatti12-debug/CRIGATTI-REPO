// Shared P/E lookup tables — single source of truth across signals,
// market-signals, and valuation routes. Previously each route maintained
// its own near-duplicate copy and they drifted.

export const FAIR_PE_BY_SECTOR: Record<string, number> = {
  "Technology":             28,
  "Healthcare":             22,
  "Consumer Cyclical":      20,
  "Consumer Defensive":     18,
  "Financial Services":     14,
  "Energy":                 12,
  "Utilities":              16,
  "Basic Materials":        15,
  "Industrials":            18,
  "Real Estate":            20,
  "Communication Services": 22,
};

export const DEFAULT_FAIR_PE = 18;

// Per-ticker fair P/E overrides for common holdings (US + EU). Union of the
// maps previously duplicated in /api/signals and /api/market-signals.
export const TICKER_FAIR_PE: Record<string, number> = {
  AAPL:28, MSFT:28, NVDA:35, GOOGL:25, GOOG:25, META:22, AMZN:35, TSLA:45,
  NFLX:25, AMD:30, INTC:15, ORCL:22, CRM:30, ADBE:28, QCOM:18, TXN:20,
  AVGO:22, ASML:30, SAP:22, INTU:35, CSCO:14, ACN:28,
  JNJ:18, PFE:12, UNH:22, ABBV:16, MRK:18, LLY:35, BMY:12, AMGN:18, GILD:12,
  JPM:14, BAC:12, WFC:12, GS:14, MS:14, V:28, MA:28, AXP:20, BLK:20,
  WMT:26, COST:38, HD:22, NKE:28, MCD:24, SBUX:22, KO:24, PEP:24, PG:24,
  XOM:12, CVX:12, COP:12, SLB:16, BP:10, SHEL:10, TTE:10,
  BA:30, GE:20, CAT:18, MMM:15, HON:22, RTX:20, LMT:17,
  DIS:25, CMCSA:14, T:10, VZ:10,
  // ETFs / passive — fair P/E concept doesn't apply, signal 0
  SPY:0, QQQ:0, IWM:0, VTI:0, VWCE:0, IWDA:0, CSPX:0, EEM:0, GLD:0, TLT:0,
  // European stocks (base ticker without exchange suffix)
  IP:18, RACE:50, ENEL:14, ENI:10, ISP:10, UCG:10, MONC:35, CPR:30,
  MB:12, STLA:6, AMP:30, FCA:6, BMED:14,
  MC:25, AIR:28, OR:30, SAN:16, BNP:8, ACA:8, DG:18, RNO:8,
  BAYN:12, DTE:14, ALV:12, BMW:6, MBG:6, SIE:22, MUV2:14,
  NESN:22, ROG:18, NOVN:18, ABB:22,
  HSBA:12, GSK:14, AZN:28, RIO:10, ULVR:18, BARC:10,
  HEIA:22, INGA:8, AD:16, VOW3:7, ADS:22, DBK:10,
  STM:18, AXA:10, CAP:22, KER:18, PHIA:18, ADYEN:30, ABBN:22,
};

export const TICKER_SECTOR: Record<string, string> = {
  AAPL:"Technology", MSFT:"Technology", NVDA:"Technology", GOOGL:"Technology",
  GOOG:"Technology", META:"Technology", AMZN:"Consumer Cyclical", TSLA:"Consumer Cyclical",
  NFLX:"Communication Services", AMD:"Technology", INTC:"Technology", ORCL:"Technology",
  CRM:"Technology", ADBE:"Technology", QCOM:"Technology", TXN:"Technology",
  AVGO:"Technology", ASML:"Technology", SAP:"Technology", INTU:"Technology",
  CSCO:"Technology", ACN:"Technology",
  JNJ:"Healthcare", PFE:"Healthcare", UNH:"Healthcare", ABBV:"Healthcare",
  MRK:"Healthcare", LLY:"Healthcare", BMY:"Healthcare", AMGN:"Healthcare", GILD:"Healthcare",
  JPM:"Financial Services", BAC:"Financial Services", WFC:"Financial Services",
  GS:"Financial Services", MS:"Financial Services", V:"Financial Services",
  MA:"Financial Services", AXP:"Financial Services", BLK:"Financial Services",
  WMT:"Consumer Defensive", COST:"Consumer Defensive", HD:"Consumer Cyclical",
  NKE:"Consumer Cyclical", MCD:"Consumer Defensive", SBUX:"Consumer Cyclical",
  KO:"Consumer Defensive", PEP:"Consumer Defensive", PG:"Consumer Defensive",
  XOM:"Energy", CVX:"Energy", COP:"Energy", SLB:"Energy", BP:"Energy",
  SHEL:"Energy", TTE:"Energy",
  BA:"Industrials", GE:"Industrials", CAT:"Industrials", MMM:"Industrials",
  HON:"Industrials", RTX:"Industrials", LMT:"Industrials",
  DIS:"Communication Services", CMCSA:"Communication Services", T:"Communication Services",
  VZ:"Communication Services",
  // European stocks
  IP:"Industrials", RACE:"Consumer Cyclical", ENEL:"Utilities", ENI:"Energy",
  ISP:"Financial Services", UCG:"Financial Services", MONC:"Consumer Cyclical",
  CPR:"Consumer Defensive", MB:"Financial Services", STLA:"Consumer Cyclical",
  AMP:"Healthcare", BMED:"Financial Services",
  MC:"Consumer Cyclical", AIR:"Industrials", OR:"Consumer Defensive",
  SAN:"Healthcare", BNP:"Financial Services", ACA:"Financial Services",
  DG:"Industrials", RNO:"Consumer Cyclical",
  BAYN:"Healthcare", DTE:"Communication Services", ALV:"Financial Services",
  BMW:"Consumer Cyclical", MBG:"Consumer Cyclical", SIE:"Industrials", MUV2:"Financial Services",
  NESN:"Consumer Defensive", ROG:"Healthcare", NOVN:"Healthcare", ABB:"Industrials",
  HSBA:"Financial Services", GSK:"Healthcare", AZN:"Healthcare",
  RIO:"Basic Materials", ULVR:"Consumer Defensive", BARC:"Financial Services",
  HEIA:"Consumer Defensive", INGA:"Financial Services", AD:"Consumer Defensive",
  VOW3:"Consumer Cyclical", ADS:"Consumer Cyclical", DBK:"Financial Services",
  STM:"Technology", AXA:"Financial Services", CAP:"Technology", KER:"Consumer Cyclical",
  PHIA:"Healthcare", ADYEN:"Technology", ABBN:"Industrials",
};

// Approximate trailing P/E for common EU tickers — used as a live-data
// proxy when no upstream API returns a P/E for the symbol.
export const EU_APPROX_PE: Record<string, number> = {
  IP:25, RACE:52, ENEL:11, ENI:7,  ISP:8,  UCG:8,  MONC:38, CPR:32,
  MB:13, STLA:4,  AMP:32,  BMED:16,
  MC:24, AIR:30,  OR:32,   SAN:14, BNP:7,  ACA:7,  DG:17,   RNO:5,
  BAYN:11, DTE:12, ALV:11, BMW:5,  MBG:5,  SIE:24,
  NESN:20, ROG:16, NOVN:16, ABB:24,
  HSBA:11, GSK:13, AZN:30, RIO:9,  ULVR:19,
  HEIA:20, INGA:7, AD:14,
};

// Alpha Vantage uses uppercase sector names — map to our keys.
export const AV_SECTOR: Record<string, string> = {
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

// Strip exchange suffix (e.g. "ISP.MI" → "ISP") for map lookups.
export function baseTicker(ticker: string): string {
  return ticker.toUpperCase().replace(/\.[A-Z]+$/, "");
}

export function resolveSector(ticker: string): string {
  return TICKER_SECTOR[baseTicker(ticker)] ?? "";
}

export function resolveFairPE(ticker: string, sectorHint?: string): number {
  const key    = baseTicker(ticker);
  const sector = sectorHint || TICKER_SECTOR[key] || "";
  return FAIR_PE_BY_SECTOR[sector] ?? TICKER_FAIR_PE[key] ?? DEFAULT_FAIR_PE;
}
