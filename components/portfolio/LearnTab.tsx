"use client";
import { useState, useRef, useCallback } from "react";
import type { EnrichedHolding, TickerSignal } from "@/types";

interface Props {
  enriched: EnrichedHolding[];
  signals:  Record<string, TickerSignal>;
  t:        (en: string, it: string) => string;
  appLang:  "en" | "it";
}

function fmt(n: number, d = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

// ── Difficulty badge ───────────────────────────────────────────────────────────
function DiffBadge({ level, t }: { level: "basic"|"intermediate"|"advanced"; t:(en:string,it:string)=>string }) {
  const cfg = {
    basic:        { dot: "#4ADE80", label: t("Basic","Base") },
    intermediate: { dot: "#FCD34D", label: t("Intermediate","Intermedio") },
    advanced:     { dot: "#F87171", label: t("Advanced","Avanzato") },
  }[level];
  return (
    <span className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0"
      style={{ backgroundColor:"rgba(255,255,255,0.08)", color:"#94A3B8" }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor:cfg.dot }} />
      {cfg.label}
    </span>
  );
}

// ── Blue contextual box ───────────────────────────────────────────────────────
function CtxBox({ label, children }: { label:string; children:React.ReactNode }) {
  return (
    <div className="rounded-xl p-3 mt-3"
      style={{ backgroundColor:"rgba(14,165,233,0.10)", border:"1px solid rgba(14,165,233,0.25)" }}>
      <p className="text-xs font-semibold mb-1" style={{ color:"#38BDF8" }}>{label}</p>
      <div className="text-xs leading-relaxed" style={{ color:"#CBD5E1" }}>{children}</div>
    </div>
  );
}

// ── Amber key insight box ─────────────────────────────────────────────────────
function InsightBox({ children }: { children:React.ReactNode }) {
  return (
    <div className="rounded-xl p-3 mt-2"
      style={{ backgroundColor:"rgba(252,211,77,0.08)", border:"1px solid rgba(252,211,77,0.25)" }}>
      <p className="text-xs font-semibold mb-1" style={{ color:"#FCD34D" }}>💡 {""}</p>
      <p className="text-xs leading-relaxed" style={{ color:"#CBD5E1" }}>{children}</p>
    </div>
  );
}

// ── Stats table (for historical data) ────────────────────────────────────────
function StatTable({ rows }: { rows: { label:string; value:string; extra?:string }[] }) {
  return (
    <div className="mt-3 rounded-xl overflow-hidden" style={{ border:"1px solid rgba(255,255,255,0.10)" }}>
      {rows.map((r,i) => (
        <div key={i} className="flex items-center justify-between px-3 py-2"
          style={{ backgroundColor: i%2===0 ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.02)" }}>
          <span className="text-xs" style={{ color:"#CBD5E1" }}>{r.label}</span>
          <div className="text-right">
            <span className="text-xs font-semibold text-white">{r.value}</span>
            {r.extra && <span className="text-xs ml-2" style={{ color:"#94A3B8" }}>{r.extra}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Category header ───────────────────────────────────────────────────────────
function CategoryHeader({ icon, title, subtitle, color }: { icon:string; title:string; subtitle:string; color:string }) {
  return (
    <div className="flex items-center gap-3 pt-5 pb-2">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
        style={{ backgroundColor:`${color}20`, border:`1px solid ${color}50` }}>
        {icon}
      </div>
      <div>
        <p className="text-sm font-bold text-white">{title}</p>
        <p className="text-xs" style={{ color:"#64748B" }}>{subtitle}</p>
      </div>
    </div>
  );
}

// ── Scroll-stopping hook for each lesson (shown in collapsed card) ────────────
const HOOKS: Record<number, { en: string; it: string }> = {
  // Cat 1 — Before You Start
  1:  { en: "No emergency fund = forced to sell at the worst possible time.", it: "Senza fondo emergenza = costretto a vendere nel momento peggiore." },
  2:  { en: "€1,000 in cash loses ~€30 of real value every year. Silently.", it: "€1.000 in contanti perdono ~€30 di valore reale ogni anno. Silenziosamente." },
  3:  { en: "The longer until you need money, the more risk you can afford.", it: "Più lontano è il momento in cui ti servirà il denaro, più rischio puoi permetterti." },
  4:  { en: "€50/month invested at 25 beats €500/month started at 40.", it: "€50/mese investiti a 25 anni battono €500/mese iniziati a 40." },
  // Cat 2 — Investment Types
  5:  { en: "Buy one Apple share = own a tiny piece of Apple. Literally.", it: "Compra un'azione Apple = possiedi un pezzo di Apple. Letteralmente." },
  6:  { en: "One ETF. 1,400 companies. One click.", it: "Un ETF. 1.400 aziende. Un click." },
  7:  { en: "90% of professional fund managers lose to a simple index fund.", it: "Il 90% dei gestori professionisti perde contro un semplice fondo indice." },
  8:  { en: "Bonds pay you interest while you sleep. Here's how.", it: "Le obbligazioni ti pagano interessi mentre dormi. Ecco come." },
  9:  { en: "REITs: own real estate without buying a single brick.", it: "REIT: possiedi immobili senza comprare un singolo mattone." },
  10: { en: "Gold can't pay rent. Here's when it's still worth owning.", it: "L'oro non paga affitti. Ecco quando vale comunque la pena possederlo." },
  11: { en: "Crypto: highest return potential — and highest loss potential.", it: "Crypto: massimo potenziale di guadagno — e di perdita." },
  12: { en: "Cash earns interest now — but still loses to inflation long-term.", it: "La liquidità rende interessi ora — ma perde contro l'inflazione nel lungo periodo." },
  33: { en: "Preferred stocks: the hybrid between a stock and a bond.", it: "Azioni privilegiate: l'ibrido tra un'azione e un'obbligazione." },
  34: { en: "Same idea, very different costs. ETFs vs mutual funds — who wins?", it: "Stessa idea, costi molto diversi. ETF vs fondi comuni — chi vince?" },
  35: { en: "Options let you profit from price moves WITHOUT buying the stock.", it: "Le opzioni ti permettono di guadagnare dai movimenti senza comprare il titolo." },
  // Cat 3 — Key Analysis Concepts
  13: { en: "Your P&L is just a number on a screen — until you sell, nothing is real.", it: "Il tuo P&L è solo un numero sullo schermo — finché non vendi, niente è reale." },
  14: { en: "Einstein called compound interest the 8th wonder of the world.", it: "Einstein definì l'interesse composto l'8° meraviglia del mondo." },
  15: { en: "€200/month for 30 years at 10%/yr = €452,000. Set up once, forget.", it: "€200/mese per 30 anni al 10%/anno = €452.000. Imposta una volta, dimentica." },
  16: { en: "A stock at P/E 50 can be CHEAPER than one at P/E 10. Here's why.", it: "Un titolo a P/E 50 può essere PIÙ ECONOMICO di uno a P/E 10. Ecco perché." },
  17: { en: "The 200-day moving average: one line that reveals the whole trend.", it: "La media mobile a 200 giorni: una linea che rivela l'intero trend." },
  18: { en: "Volume reveals who really believes in a price move.", it: "Il volume rivela chi crede davvero in un movimento di prezzo." },
  19: { en: "Vela's score: three factors, 0–100, your portfolio in plain language.", it: "Il punteggio Vela: tre fattori, 0–100, il tuo portafoglio in linguaggio semplice." },
  20: { en: "When analysts all agree, the market has already priced it in.", it: "Quando tutti gli analisti concordano, il mercato l'ha già scontato." },
  21: { en: "Don't put all eggs in one basket — but how many baskets is enough?", it: "Non mettere tutte le uova in un solo paniere — ma quanti panieri bastano?" },
  22: { en: "Higher risk = higher return? Not always. Here's the real trade-off.", it: "Più rischio = più rendimento? Non sempre. Ecco il vero compromesso." },
  23: { en: "Rebalancing is the only systematic 'sell high, buy low' strategy.", it: "Il ribilanciamento è l'unica strategia sistematica 'vendi alto, compra basso'." },
  // Cat 4 — Historical Performance
  24: { en: "Stocks: ~10%/yr since 1926. Bonds: ~4–5%. Cash: barely beats inflation.", it: "Azioni: ~10%/anno dal 1926. Obbligazioni: ~4–5%. Liquidità: appena batte l'inflazione." },
  25: { en: "The S&P 500 crashed -57% in 2008. Then recovered to all-time highs.", it: "L'S&P 500 crollò del -57% nel 2008. Poi recuperò ai massimi storici." },
  26: { en: "Missing just 10 best market days cuts your 20-year return in HALF.", it: "Perdere solo i 10 giorni migliori dimezza il tuo rendimento in 20 anni." },
  27: { en: "Inflation is a ~3%/yr tax on your savings — invisible but certain.", it: "L'inflazione è una tassa del ~3%/anno sui tuoi risparmi — invisibile ma certa." },
  28: { en: "Bull markets last ~4.5 years on average. Bears last only ~10 months.", it: "I mercati toro durano ~4,5 anni in media. Gli orsi solo ~10 mesi." },
  // Cat 5 — Protecting Your Money
  29: { en: "Guaranteed high returns with zero risk = 100% a scam. Every time.", it: "Alti rendimenti garantiti a rischio zero = 100% una truffa. Sempre." },
  30: { en: "A 1.5% annual fee costs you €266,000 more than 0.1% over 30 years.", it: "Una commissione dell'1,5% annuo ti costa €266.000 in più dello 0,1% in 30 anni." },
  31: { en: "Tax-advantaged accounts are the closest thing to free money from the government.", it: "I conti agevolati fiscalmente sono il più vicino al denaro gratis dal governo." },
  32: { en: "Panic-selling in March 2020 cost investors half their eventual recovery gains.", it: "Vendere per panico a marzo 2020 è costato agli investitori metà dei guadagni del recupero." },
  // Cat 6 — Building Your Financial Plan
  36: { en: "The most important investing decision: where you open your account.", it: "La decisione di investimento più importante: dove apri il tuo conto." },
  37: { en: "Your age, not your mood, should determine your asset allocation.", it: "La tua età, non il tuo umore, dovrebbe determinare la tua asset allocation." },
  38: { en: "50% needs, 30% wants, 20% savings. The only budget rule you need.", it: "50% bisogni, 30% desideri, 20% risparmio. L'unica regola di budget che ti serve." },
  39: { en: "40% of the S&P 500's total return has come from reinvested dividends.", it: "Il 40% del rendimento totale dell'S&P 500 è venuto dai dividendi reinvestiti." },
  40: { en: "Italy is < 1% of global stocks. Investing only locally is a hidden risk.", it: "L'Italia è < 1% delle azioni globali. Investire solo in Italia è un rischio nascosto." },
  // Cat 7 — Investor Psychology
  41: { en: "Your brain feels losses ~2× more painfully than equivalent gains.", it: "Il tuo cervello sente le perdite ~2× più dolorosamente dei guadagni equivalenti." },
  42: { en: "Anchoring: holding a stock at €40 because you bought it at €120.", it: "Ancoraggio: tieni un titolo a €40 perché l'hai comprato a €120." },
  43: { en: "Beginner's luck in a bull market makes everyone feel like a genius.", it: "La fortuna del principiante in un mercato toro fa sentire tutti dei geni." },
  44: { en: "When everyone is excited about an asset — the gains are usually already gone.", it: "Quando tutti sono entusiasti di un asset — i guadagni sono di solito già andati." },
  // Cat 8 — How Markets Work
  45: { en: "Every trade you place gets matched with a real buyer or seller. Here's how.", it: "Ogni ordine che piazzi viene abbinato con un acquirente o venditore reale. Ecco come." },
  46: { en: "One central bank decision can make or break your entire portfolio.", it: "Una decisione di una banca centrale può fare o disfare l'intero tuo portafoglio." },
  47: { en: "Market order vs limit order: one small difference, potentially huge consequence.", it: "Ordine di mercato vs ordine limite: piccola differenza, potenzialmente grande conseguenza." },
  48: { en: "ESG: can you invest with your values without sacrificing returns?", it: "ESG: puoi investire secondo i tuoi valori senza sacrificare i rendimenti?" },
  // Cat 9 — ETF Master Class
  49: { en: "One ETF share = tiny ownership of 1,400+ companies worldwide.", it: "Una quota ETF = piccola proprietà di oltre 1.400 aziende nel mondo." },
  50: { en: "Accumulating or Distributing: one choice that determines how you get paid.", it: "Accumulazione o Distribuzione: una scelta che determina come vieni pagato." },
  51: { en: "Physical vs synthetic: one actually holds the stocks. The other doesn't.", it: "Fisico vs sintetico: uno detiene davvero i titoli. L'altro no." },
  52: { en: "TER: the one number that tells you how much your ETF costs per year.", it: "TER: il numero che ti dice quanto costa il tuo ETF all'anno." },
  53: { en: "Bigger ETF = less closure risk. AUM size matters more than you think.", it: "ETF più grande = meno rischio di chiusura. L'AUM conta più di quanto pensi." },
  54: { en: "Tracking difference > TER: the hidden real cost that matters more.", it: "La tracking difference > TER: il costo reale nascosto che conta di più." },
  55: { en: "MSCI World, S&P 500, FTSE All-World: three indexes, huge differences.", it: "MSCI World, S&P 500, FTSE All-World: tre indici, differenze enormi." },
  56: { en: "How to pick the right ETF in 15 minutes — a step-by-step checklist.", it: "Come scegliere l'ETF giusto in 15 minuti — una checklist passo passo." },
  57: { en: "VWCE, IWDA, CSPX: the most trusted ETFs for European beginners.", it: "VWCE, IWDA, CSPX: gli ETF più affidabili per i principianti europei." },
  58: { en: "5 ETF mistakes that cost beginners thousands — how to avoid them.", it: "5 errori sugli ETF che costano migliaia ai principianti — come evitarli." },
  // Cat 10 — Stock Picking & Valuation
  60: { en: "Most fund managers lose to the index. Why would YOU win?", it: "La maggior parte dei gestori perde contro l'indice. Perché dovresti vincere TU?" },
  61: { en: "A stock at P/E 50 can be CHEAPER than one at P/E 10.", it: "Un titolo a P/E 50 può essere PIÙ ECONOMICO di uno a P/E 10." },
  62: { en: "Buffett ignored the price. He focused on what the company actually owns.", it: "Buffett ignorava il prezzo. Si concentrava su ciò che l'azienda possiedeva davvero." },
  63: { en: "Every stock has a mathematical fair price. Here's how analysts find it.", it: "Ogni azione ha un prezzo equo matematico. Ecco come gli analisti lo trovano." },
  64: { en: "A 70-year-old formula that still helps identify undervalued stocks.", it: "Una formula di 70 anni che aiuta ancora a identificare titoli sottovalutati." },
  65: { en: "The metric private equity firms use that most retail investors ignore.", it: "La metrica che i fondi di private equity usano e che la maggior parte degli investitori retail ignora." },
  66: { en: "P/E only tells half the story. Growth changes everything.", it: "Il P/E racconta solo metà della storia. La crescita cambia tutto." },
  67: { en: "Sometimes the best return is just the cash they pay you each quarter.", it: "A volte il miglior rendimento è semplicemente la cassa che ti pagano ogni trimestre." },
  68: { en: "Is P/E 18 cheap or expensive? Only a comparison tells you.", it: "Un P/E di 18 è economico o costoso? Solo un confronto può dirtelo." },
  69: { en: "No single model is always right. Using all of them gives you safety.", it: "Nessun modello è sempre giusto. Usarli tutti ti dà sicurezza." },
};

// ── Main component ────────────────────────────────────────────────────────────
export default function LearnTab({ enriched, signals, t, appLang }: Props) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [expandedLessonId, setExpandedLessonId] = useState<number | null>(null);
  const expandedRef = useRef<number | null>(null); // ref mirror — readable inside callbacks without stale closure
  const containerRef = useRef<HTMLDivElement>(null);

  // Always update the ref alongside the state so handleScroll can read it synchronously
  const setExpanded = useCallback((id: number | null) => {
    expandedRef.current = id;
    setExpandedLessonId(id);
  }, []);

  // Primary holding (largest by value)
  const sorted   = [...enriched].sort((a,b)=>b.currentVal-a.currentVal);
  const primary  = sorted[0] ?? null;
  const primSig  = primary ? (signals[primary.ticker]??null) : null;
  const totalVal = enriched.reduce((s,h)=>s+h.currentVal,0);
  const topPct   = primary&&totalVal>0 ? (primary.currentVal/totalVal*100) : 0;

  // Sectors
  const sectors = new Set(enriched.map(h=>(signals[h.ticker]?.meta?.sector??"Other")));

  // Risk profile
  let risk: { profile:string; stocks:number; bonds:number; cash:number }|null = null;
  try {
    const raw = typeof window!=="undefined" ? localStorage.getItem("vela_risk_v1") : null;
    if (raw) risk = JSON.parse(raw);
  } catch {}

  const noPort = enriched.length===0;

  // Scroll helpers — defined early so they can be used in the return block
  const scrollToLesson = useCallback((idx: number) => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({ top: idx * el.clientHeight, behavior: "smooth" });
    setCurrentIdx(idx);
  }, []);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el || el.clientHeight === 0) return;
    const newIdx = Math.round(el.scrollTop / el.clientHeight);
    setCurrentIdx(newIdx);
  }, []);

  // ── CATEGORY 1: Before You Start ─────────────────────────────────────────────
  const cat1 = {
    id:"before", icon:"🏦", color:"#0EA5E9",
    title: t("Before You Start","Prima di Iniziare"),
    subtitle: t("The most important things to know before investing a single euro","Le cose più importanti da sapere prima di investire"),
    lessons: [
      {
        id:1, icon:"🆘", level:"basic" as const,
        title: t("Emergency Fund First","Prima il Fondo di Emergenza"),
        explanation: t(
          "Before investing anything, build an emergency fund — 3 to 6 months of living expenses held in cash or a savings account. This is your financial safety net. If you invest money you might need urgently, you could be forced to sell at the worst possible moment — when markets are down.",
          "Prima di investire qualsiasi cosa, costruisci un fondo di emergenza — 3-6 mesi di spese di vita tenuti in contanti o in un conto di risparmio. È la tua rete di sicurezza finanziaria. Se investi denaro che potresti aver bisogno urgentemente, potresti essere costretto a vendere nel peggior momento possibile — quando i mercati sono in calo."
        ),
        ctx: t(
          "Rule of thumb: keep 3–6 months of rent + food + bills in a savings account before investing a single euro.",
          "Regola pratica: tieni 3–6 mesi di affitto + cibo + bollette in un conto di risparmio prima di investire un singolo euro."
        ),
        insight: t(
          "The emergency fund isn't an investment — it's insurance. It lets your invested money stay invested without panic-selling when life happens.",
          "Il fondo di emergenza non è un investimento — è un'assicurazione. Ti permette di mantenere il denaro investito senza vendere in preda al panico quando accadono imprevisti."
        ),
      },
      {
        id:2, icon:"💸", level:"basic" as const,
        title: t("Why Invest at All?","Perché Investire?"),
        explanation: t(
          "Inflation silently erodes the value of cash every year — typically around 3% annually. That means €1,000 sitting in a current account loses roughly €30 of purchasing power per year. Investing is how you make your money work to at least keep pace with — and ideally outpace — inflation over time.",
          "L'inflazione erode silenziosamente il valore del contante ogni anno — tipicamente circa il 3% annuo. Significa che €1.000 fermi in un conto corrente perdono circa €30 di potere d'acquisto all'anno. Investire è il modo in cui fai lavorare il tuo denaro per tenere il passo — e idealmente superare — l'inflazione nel tempo."
        ),
        stats: [
          { label:t("€1,000 in cash in 2000","€1.000 in contanti nel 2000"),   value: t("≈ €600 purchasing power today","≈ €600 potere d'acquisto oggi") },
          { label:t("€1,000 in S&P 500 in 2000","€1.000 nell'S&P 500 nel 2000"), value: t("≈ €7,000 today (approx.)","≈ €7.000 oggi (circa)") },
          { label:t("Average annual inflation","Inflazione media annua"),           value: "~3%" },
          { label:t("Average cash savings rate","Tasso medio conto risparmio"),    value: "~2–3%" },
        ],
        ctx: t(
          "Inflation is the default tax on savings. Even at 2%, €10,000 in cash loses €200 of real value every year — silently, invisibly.",
          "L'inflazione è la tassa predefinita sui risparmi. Anche al 2%, €10.000 in contanti perdono €200 di valore reale ogni anno — silenziosamente, invisibilmente."
        ),
        insight: t(
          "You don't invest to get rich quick. You invest so your money doesn't slowly become worth less while you sleep.",
          "Non investi per arricchirti velocemente. Investi affinché il tuo denaro non perda lentamente valore mentre dormi."
        ),
      },
      {
        id:3, icon:"⏱️", level:"basic" as const,
        title: t("Your Investment Horizon","Il Tuo Orizzonte di Investimento"),
        explanation: t(
          "Investment horizon is how long you plan to leave money invested before needing it. The longer your horizon, the more risk you can afford — because you have time to recover from market crashes. Someone saving for retirement in 30 years can tolerate more volatility than someone saving for a house purchase in 2 years.",
          "L'orizzonte di investimento è quanto tempo pensi di lasciare il denaro investito prima di averne bisogno. Più lungo è l'orizzonte, più rischio puoi permetterti — perché hai tempo per riprenderti dai crolli di mercato. Chi risparmia per la pensione tra 30 anni può tollerare più volatilità di chi risparmia per comprare casa tra 2 anni."
        ),
        stats: [
          { label:t("Horizon < 2 years","Orizzonte < 2 anni"),      value:t("Cash or bonds only","Solo contanti o obbligazioni"),      extra:t("Very low risk","Rischio molto basso") },
          { label:t("Horizon 2–5 years","Orizzonte 2–5 anni"),      value:t("Mix bonds + some stocks","Mix obbligazioni + azioni"),      extra:t("Low-medium","Basso-medio") },
          { label:t("Horizon 5–10 years","Orizzonte 5–10 anni"),    value:t("Balanced portfolio","Portafoglio bilanciato"),              extra:t("Medium","Medio") },
          { label:t("Horizon 10+ years","Orizzonte 10+ anni"),      value:t("Mostly stocks / ETFs","Prevalentemente azioni/ETF"),        extra:t("Higher risk OK","Rischio più alto OK") },
        ],
        ctx: t(
          "Simple rule: never invest in stocks money you'll need in the next 2 years. Markets can fall 30–50% in bad years and take years to recover.",
          "Regola semplice: non investire mai in azioni denaro che ti servirà nei prossimi 2 anni. I mercati possono scendere del 30–50% negli anni peggiori e impiegare anni per recuperare."
        ),
        insight: t(
          "Time is the investor's greatest advantage. A 25-year-old and a 55-year-old with the same portfolio should have very different asset allocations.",
          "Il tempo è il più grande vantaggio dell'investitore. Un 25enne e un 55enne con lo stesso portafoglio dovrebbero avere allocazioni degli asset molto diverse."
        ),
      },
      {
        id:4, icon:"🌱", level:"basic" as const,
        title: t("Starting Small — It's OK","Iniziare In Piccolo — Va Bene"),
        explanation: t(
          "You don't need thousands of euros to start investing. With fractional shares and ETFs, many platforms let you invest from as little as €1–€10. Starting small and getting the habit right matters far more than the amount. A €50/month habit started at 25 is worth far more than €500/month started at 40.",
          "Non hai bisogno di migliaia di euro per iniziare a investire. Con le azioni frazionate e gli ETF, molte piattaforme ti permettono di investire da soli €1–€10. Iniziare in piccolo e sviluppare l'abitudine giusta è molto più importante dell'importo. Un'abitudine da €50/mese iniziata a 25 anni vale molto di più di €500/mese iniziata a 40."
        ),
        ctx: t(
          "The best time to start was 10 years ago. The second best time is today. Waiting for the 'right moment' is the most expensive mistake beginners make.",
          "Il momento migliore per iniziare era 10 anni fa. Il secondo miglior momento è oggi. Aspettare il 'momento giusto' è l'errore più costoso che fanno i principianti."
        ),
        insight: t(
          "Consistency beats timing. A person who invests €100/month without ever trying to time the market will almost always outperform someone who invests €1,000 once a year at 'the right moment'.",
          "La costanza batte il tempismo. Una persona che investe €100/mese senza mai cercare di scegliere il momento giusto supererà quasi sempre qualcuno che investe €1.000 una volta all'anno 'nel momento giusto'."
        ),
      },
    ],
  };

  // ── CATEGORY 2: Investment Types ──────────────────────────────────────────────
  const cat2 = {
    id:"types", icon:"📈", color:"#22C55E",
    title: t("Investment Types","Tipi di Investimento"),
    subtitle: t("What can you actually buy — and what is each instrument?","Cosa puoi comprare e cos'è ogni strumento?"),
    lessons: [
      {
        id:5, icon:"📊", level:"basic" as const,
        title: t("Stocks (Equities)","Azioni"),
        explanation: t(
          "A stock represents ownership in a company. When you buy one Apple share, you own a tiny fraction of Apple Inc. Stockholders benefit when the company grows (rising share price) and often receive dividends — a share of the company's profits paid out regularly. Stocks are the highest-returning major asset class over the long run, but also the most volatile.",
          "Un'azione rappresenta la proprietà di una società. Quando compri un'azione Apple, possiedi una piccola frazione di Apple Inc. Gli azionisti beneficiano quando l'azienda cresce (prezzo delle azioni in aumento) e spesso ricevono dividendi — una quota degli utili dell'azienda distribuita regolarmente. Le azioni sono la classe di asset principale con il rendimento più alto nel lungo periodo, ma anche la più volatile."
        ),
        stats: [
          { label:t("Historical annual return (S&P 500)","Rendimento annuo storico (S&P 500)"), value:"~10%",  extra:t("since 1926","dal 1926") },
          { label:t("Worst single year","Peggior anno singolo"),                                value:"-43%", extra:"1931" },
          { label:t("Best single year","Miglior anno singolo"),                                 value:"+53%", extra:"1954" },
          { label:t("Risk level","Livello di rischio"),                                         value:t("High","Alto") },
        ],
        ctx: noPort ? t("Add stocks to your portfolio to start building your investment knowledge with real examples.","Aggiungi azioni al tuo portafoglio per iniziare a costruire la tua conoscenza degli investimenti con esempi reali.")
          : primary ? <span>{t("You hold","Possiedi")} <strong style={{color:"white"}}>{primary.name} ({primary.ticker})</strong> — {t("a stock in your portfolio currently","un'azione nel tuo portafoglio attualmente")} {primary.pctGain>=0?"+":""}<strong style={{color:primary.pctGain>=0?"#4ADE80":"#F87171"}}>{fmt(primary.pctGain,1)}%</strong>.</span> : null,
        insight: t(
          "Stocks are the engine of long-term wealth. But never put all your money in a single stock — even great companies can fail. Diversify across at least 10–20 stocks or use an ETF.",
          "Le azioni sono il motore della ricchezza a lungo termine. Ma non mettere mai tutti i tuoi soldi in un solo titolo — anche le grandi aziende possono fallire. Diversifica su almeno 10–20 azioni o usa un ETF."
        ),
      },
      {
        id:6, icon:"🧺", level:"basic" as const,
        title: t("ETFs — The Beginner's Best Friend","ETF — Il Miglior Amico del Principiante"),
        explanation: t(
          "An ETF (Exchange-Traded Fund) is a basket of many assets — stocks, bonds, or commodities — bundled into a single product you can buy like a stock. One share of the MSCI World ETF (IWDA) gives you exposure to over 1,400 companies across 23 countries. ETFs are low-cost (often 0.03%–0.50%/year in fees), instantly diversified, and very easy to buy and sell.",
          "Un ETF (Exchange-Traded Fund) è un paniere di molti asset — azioni, obbligazioni o materie prime — racchiusi in un unico prodotto che puoi comprare come un'azione. Una quota dell'ETF MSCI World (IWDA) ti dà esposizione a oltre 1.400 aziende in 23 paesi. Gli ETF hanno costi bassi (spesso 0,03%–0,50%/anno di commissioni), sono istantaneamente diversificati e molto facili da comprare e vendere."
        ),
        stats: [
          { label:t("MSCI World ETF — annual return","ETF MSCI World — rendimento annuo"),      value:"~8%",  extra:t("since 1970","dal 1970") },
          { label:t("S&P 500 ETF (VOO/SPY) — annual return","ETF S&P 500 — rendimento annuo"), value:"~10%", extra:t("since 1926","dal 1926") },
          { label:t("Typical expense ratio","Expense ratio tipico"),                              value:"0.03–0.50%/yr" },
          { label:t("Number of assets in IWDA","Numero di asset in IWDA"),                       value:"1,400+ companies" },
        ],
        ctx: t(
          "Popular ETFs: IWDA (MSCI World), VWCE (All-World including emerging markets), CSPX (S&P 500), EIMI (Emerging Markets). Look for low expense ratios.",
          "ETF popolari: IWDA (MSCI World), VWCE (All-World inclusi mercati emergenti), CSPX (S&P 500), EIMI (Mercati Emergenti). Cerca expense ratio bassi."
        ),
        insight: t(
          "For most beginners, a single global ETF (like VWCE or IWDA) bought monthly via dollar-cost averaging is the simplest, cheapest, and most effective long-term strategy.",
          "Per la maggior parte dei principianti, un singolo ETF globale (come VWCE o IWDA) acquistato mensilmente tramite il piano di accumulo è la strategia a lungo termine più semplice, economica ed efficace."
        ),
      },
      {
        id:7, icon:"🗂️", level:"basic" as const,
        title: t("Index Funds — Passive Investing","Fondi Indice — Investimento Passivo"),
        explanation: t(
          "An index fund tracks a market index — like the S&P 500 (the 500 largest US companies) or the MSCI World — by holding all (or most of) its components. Unlike actively managed funds, they don't try to 'beat the market' — they simply mirror it. This makes them very cheap to run. Studies consistently show that 80–90% of active fund managers underperform a simple S&P 500 index fund over 10 years.",
          "Un fondo indice replica un indice di mercato — come l'S&P 500 (le 500 maggiori aziende statunitensi) o l'MSCI World — detenendo tutti (o la maggior parte) dei suoi componenti. A differenza dei fondi gestiti attivamente, non cercano di 'battere il mercato' — lo replicano semplicemente. Questo li rende molto economici da gestire. Gli studi mostrano costantemente che l'80–90% dei gestori di fondi attivi sottoperforma un semplice fondo indice S&P 500 su 10 anni."
        ),
        stats: [
          { label:t("Active funds beating S&P 500 over 10yr","Fondi attivi che battono S&P 500 in 10 anni"), value:"~10–20%" },
          { label:t("Active funds beating S&P 500 over 20yr","Fondi attivi che battono S&P 500 in 20 anni"), value:"~5%" },
          { label:t("Average active fund fee","Commissione media fondo attivo"),                              value:"1–2%/yr" },
          { label:t("Average index fund fee","Commissione media fondo indice"),                               value:"0.03–0.20%/yr" },
        ],
        ctx: t(
          "The S&P 500 index has returned ~10%/year since 1926 — more than most professional stock pickers. Warren Buffett has publicly recommended index funds for most investors.",
          "L'indice S&P 500 ha reso circa il 10%/anno dal 1926 — più della maggior parte degli stock picker professionisti. Warren Buffett ha raccomandato pubblicamente i fondi indice alla maggior parte degli investitori."
        ),
        insight: t(
          "The fee difference matters enormously over time. A 1% fee vs a 0.1% fee on €100k over 30 years at 7% growth = €56,000 less in your pocket. Always check the expense ratio.",
          "La differenza di commissione è enormemente importante nel tempo. Una commissione dell'1% vs 0,1% su €100k in 30 anni al 7% di crescita = €56.000 in meno nelle tue tasche. Controlla sempre l'expense ratio."
        ),
      },
      {
        id:8, icon:"🏛️", level:"intermediate" as const,
        title: t("Bonds — Lending to Governments","Obbligazioni — Prestare ai Governi"),
        explanation: t(
          "When you buy a bond, you are lending money to a government (government bond) or company (corporate bond). In return, they promise to pay you a fixed interest rate (the 'coupon') every year and return your principal at the end of the bond's term. Bonds are much safer than stocks but offer lower returns. They are a cornerstone of conservative and balanced portfolios.",
          "Quando compri un'obbligazione, stai prestando denaro a un governo (titolo di Stato) o a un'azienda (obbligazione societaria). In cambio, promettono di pagarti un tasso di interesse fisso ('cedola') ogni anno e di restituire il capitale alla scadenza. Le obbligazioni sono molto più sicure delle azioni ma offrono rendimenti inferiori. Sono un pilastro dei portafogli conservativi e bilanciati."
        ),
        stats: [
          { label:t("Gov. bonds — historical annual return","Titoli di Stato — rendimento annuo storico"), value:"~4–5%", extra:t("since 1926","dal 1926") },
          { label:t("Current 10Y US Treasury yield","Rendimento attuale BTP 10 anni USA"),                value:"~4–5%" },
          { label:t("Risk level","Livello di rischio"),                                                    value:t("Low (gov.) / Medium (corp.)","Basso (gov.) / Medio (soc.)") },
          { label:t("Best use","Miglior utilizzo"),                                                        value:t("Stability, income, diversification","Stabilità, reddito, diversificazione") },
        ],
        ctx: t(
          "Rule of thumb: the older you are, the more bonds you should hold. At 60, many advisors suggest 40–60% in bonds for capital preservation.",
          "Regola pratica: più sei vecchio, più obbligazioni dovresti detenere. A 60 anni, molti consulenti suggeriscono il 40–60% in obbligazioni per la preservazione del capitale."
        ),
        insight: t(
          "Bond prices move inversely to interest rates. When rates rise, bond prices fall — and vice versa. This is why 2022 was a rare year when both stocks AND bonds fell sharply.",
          "I prezzi delle obbligazioni si muovono inversamente ai tassi di interesse. Quando i tassi salgono, i prezzi delle obbligazioni scendono — e viceversa. Ecco perché il 2022 è stato un anno raro in cui sia le azioni CHE le obbligazioni sono scese bruscamente."
        ),
      },
      {
        id:9, icon:"🏢", level:"intermediate" as const,
        title: t("REITs — Real Estate Without Buying Property","REITs — Immobiliare Senza Comprare Casa"),
        explanation: t(
          "REITs (Real Estate Investment Trusts) are companies that own and operate income-generating real estate — office buildings, shopping centres, warehouses, hospitals. You can buy REIT shares just like stocks, getting exposure to real estate without the hassle of being a landlord. By law, REITs must distribute at least 90% of their taxable income as dividends — making them a strong income source.",
          "I REIT (Real Estate Investment Trusts) sono aziende che possiedono e gestiscono immobili che generano reddito — edifici per uffici, centri commerciali, magazzini, ospedali. Puoi comprare azioni REIT proprio come le azioni, ottenendo esposizione al settore immobiliare senza il fastidio di essere un proprietario. Per legge, i REIT devono distribuire almeno il 90% del loro reddito imponibile come dividendi — rendendoli una forte fonte di reddito."
        ),
        stats: [
          { label:t("REIT historical annual return","Rendimento annuo storico REIT"),    value:"~11%", extra:t("since 1972 (NAREIT)","dal 1972 (NAREIT)") },
          { label:t("Dividend yield (typical)","Rendimento da dividendo (tipico)"),       value:"3–6%/yr" },
          { label:t("Risk level","Livello di rischio"),                                    value:t("Medium-High","Medio-Alto") },
          { label:t("Correlation with stocks","Correlazione con le azioni"),               value:t("Medium (diversifies well)","Media (diversifica bene)") },
        ],
        ctx: t(
          "Popular REITs: Realty Income (O), American Tower (AMT), Prologis (PLD). For diversified exposure, consider a REIT ETF like VNQI or VNQ.",
          "REIT popolari: Realty Income (O), American Tower (AMT), Prologis (PLD). Per un'esposizione diversificata, considera un ETF REIT come VNQI o VNQ."
        ),
        insight: t(
          "REITs are sensitive to interest rates — when rates are high, their borrowing costs rise and their dividends look less attractive vs bonds. They tend to outperform when rates fall.",
          "I REIT sono sensibili ai tassi di interesse — quando i tassi sono alti, i loro costi di finanziamento aumentano e i loro dividendi sembrano meno attraenti rispetto alle obbligazioni. Tendono a sovraperformare quando i tassi scendono."
        ),
      },
      {
        id:10, icon:"🥇", level:"intermediate" as const,
        title: t("Commodities — Gold, Oil & Raw Materials","Materie Prime — Oro, Petrolio e Risorse"),
        explanation: t(
          "Commodities are physical raw materials: gold, silver, oil, wheat, copper, natural gas. Investors can gain exposure through commodity ETFs, futures, or mining stocks. Gold is the most popular — it has been used as a store of value for thousands of years and tends to hold its value during periods of high inflation or financial crisis. Unlike stocks and bonds, commodities produce no income (no dividends, no interest).",
          "Le materie prime sono risorse fisiche: oro, argento, petrolio, grano, rame, gas naturale. Gli investitori possono ottenere esposizione tramite ETF sulle materie prime, futures o azioni di società minerarie. L'oro è il più popolare — è stato usato come riserva di valore per migliaia di anni e tende a mantenere il suo valore durante periodi di alta inflazione o crisi finanziarie. A differenza di azioni e obbligazioni, le materie prime non producono reddito (nessun dividendo, nessun interesse)."
        ),
        stats: [
          { label:t("Gold — annual return","Oro — rendimento annuo"),          value:"~7%",  extra:t("since 1971","dal 1971") },
          { label:t("Gold — real return","Oro — rendimento reale"),             value:"~1–2%",extra:t("after inflation","dopo inflazione") },
          { label:t("Risk level","Livello di rischio"),                          value:t("Medium — very volatile short-term","Medio — molto volatile a breve termine") },
          { label:t("Best use","Miglior utilizzo"),                              value:t("Inflation hedge, portfolio diversifier","Copertura inflazione, diversificatore") },
        ],
        ctx: t(
          "Gold ETFs (GLD, IAU) are the easiest way to get gold exposure without physically owning it. Many balanced portfolios hold 5–10% in gold as insurance against economic turmoil.",
          "Gli ETF sull'oro (GLD, IAU) sono il modo più semplice per ottenere esposizione all'oro senza possederlo fisicamente. Molti portafogli bilanciati detengono il 5–10% in oro come assicurazione contro le turbolenze economiche."
        ),
        insight: t(
          "Gold protects against crises but not against time. It doesn't compound, doesn't pay dividends, and doesn't grow a business. Use it as a small hedge — not a core investment.",
          "L'oro protegge dalle crisi ma non dal tempo. Non si compone, non paga dividendi e non fa crescere un'azienda. Usalo come piccola copertura — non come investimento principale."
        ),
      },
      {
        id:11, icon:"🪙", level:"intermediate" as const,
        title: t("Cryptocurrencies — High Risk, High Speculation","Criptovalute — Alto Rischio, Alta Speculazione"),
        explanation: t(
          "Cryptocurrencies (Bitcoin, Ethereum, etc.) are digital assets that exist on decentralised blockchains. Unlike stocks, they have no underlying earnings, no dividends, and no physical assets backing them. Their value is driven entirely by supply, demand, and sentiment. They can rise 200% in a bull year and fall 80% in a bear year. They are one of the most volatile assets in existence.",
          "Le criptovalute (Bitcoin, Ethereum, ecc.) sono asset digitali che esistono su blockchain decentralizzate. A differenza delle azioni, non hanno utili sottostanti, nessun dividendo e nessun asset fisico che le garantisce. Il loro valore è guidato esclusivamente da domanda, offerta e sentiment. Possono salire del 200% in un anno rialzista e scendere dell'80% in uno ribassista. Sono uno degli asset più volatili in esistenza."
        ),
        stats: [
          { label:"Bitcoin — best year",                 value:"+1,318% (2013)" },
          { label:"Bitcoin — worst year",                value:"-72% (2022)" },
          { label:t("No underlying cash flows","Nessun flusso di cassa sottostante"), value:t("Purely price-driven","Puramente guidato dal prezzo") },
          { label:t("Regulation risk","Rischio regolatorio"), value:t("High — governments can restrict","Alto — i governi possono limitare") },
        ],
        ctx: t(
          "If you choose to invest in crypto, treat it as the highest-risk portion of your portfolio — maximum 5–10% — and only money you can afford to lose entirely.",
          "Se scegli di investire in criptovalute, trattale come la parte a più alto rischio del tuo portafoglio — massimo il 5–10% — e solo denaro che puoi permetterti di perdere completamente."
        ),
        insight: t(
          "Never invest in crypto because of FOMO (fear of missing out) or a tip from a friend. The people who got rich in Bitcoin bought in 2012–2015. Most people who bought in 2021 are still at a loss.",
          "Non investire mai in criptovalute per FOMO (paura di perdere l'opportunità) o per un consiglio di un amico. Le persone che si sono arricchite con Bitcoin hanno comprato nel 2012–2015. La maggior parte di chi ha comprato nel 2021 è ancora in perdita."
        ),
      },
      {
        id:12, icon:"🏦", level:"basic" as const,
        title: t("Cash & Money Market — The 'Safe' Option","Liquidità e Mercato Monetario — L'Opzione 'Sicura'"),
        explanation: t(
          "Keeping money in cash (savings account, current account, money market fund) is the safest option — your principal is protected. However, with inflation running at ~3%/year, €100 of cash loses about €3 of purchasing power every year, even if the nominal balance stays the same. In the long run, 100% cash is a guaranteed way to slowly lose real wealth.",
          "Tenere il denaro in contanti (conto di risparmio, conto corrente, fondo monetario) è l'opzione più sicura — il capitale è protetto. Tuttavia, con l'inflazione al ~3%/anno, €100 di liquidità perdono circa €3 di potere d'acquisto ogni anno, anche se il saldo nominale rimane invariato. Nel lungo periodo, il 100% di liquidità è un modo garantito per perdere lentamente ricchezza reale."
        ),
        stats: [
          { label:t("Average savings account rate","Tasso medio conto risparmio"),  value:"2–4%/yr" },
          { label:t("Average inflation rate","Tasso medio di inflazione"),           value:"~3%/yr" },
          { label:t("Real return (cash after inflation)","Rendimento reale (liquidità dopo inflazione)"), value:"~0–1%" },
          { label:t("Risk of losing nominal value","Rischio di perdere il valore nominale"),             value:t("Very low (insured)","Molto basso (assicurato)") },
        ],
        ctx: t(
          "Cash is NOT risk-free — it just carries a different kind of risk: the certainty of slow purchasing power erosion. Use it for your emergency fund and short-term goals.",
          "La liquidità NON è priva di rischi — porta semplicemente un tipo diverso di rischio: la certezza di una lenta erosione del potere d'acquisto. Usala per il tuo fondo di emergenza e obiettivi a breve termine."
        ),
        insight: t(
          "Think of cash as a temporary parking spot for money, not a final destination. The right amount is your emergency fund + any specific spending planned in the next 1–2 years.",
          "Pensa alla liquidità come a un parcheggio temporaneo per il denaro, non come a una destinazione finale. La quantità giusta è il tuo fondo di emergenza + qualsiasi spesa specifica pianificata nei prossimi 1–2 anni."
        ),
      },
      {
        id:33, icon:"⭐", level:"intermediate" as const,
        title: t("Preferred Stocks — The Hybrid Instrument","Azioni Privilegiate — Lo Strumento Ibrido"),
        explanation: t(
          "Preferred stocks sit between common stocks and bonds. Like bonds, they pay a fixed dividend regardless of company profits. Like stocks, they trade on exchanges. Preferred shareholders have priority over common shareholders for dividends and, in the event of bankruptcy, for company assets. However, preferred shares typically don't benefit from a company's growth the way common shares do — there is a ceiling on their upside.",
          "Le azioni privilegiate si collocano tra le azioni ordinarie e le obbligazioni. Come le obbligazioni, pagano un dividendo fisso indipendentemente dai profitti dell'azienda. Come le azioni, sono scambiate in borsa. Gli azionisti privilegiati hanno priorità per dividendi e, in caso di fallimento, per gli asset aziendali. Tuttavia, le azioni privilegiate tipicamente non beneficiano della crescita dell'azienda come le azioni ordinarie — c'è un tetto al loro potenziale di guadagno."
        ),
        stats: [
          { label:t("Typical dividend yield","Rendimento da dividendo tipico"),              value:"4–7%/yr" },
          { label:t("Priority over common stock?","Priorità sull'azione ordinaria?"),        value:t("Yes — dividends & liquidation","Sì — dividendi e liquidazione") },
          { label:t("Upside vs common stock","Potenziale di crescita vs azione ordinaria"),  value:t("Limited — fixed value cap","Limitato — crescita limitata") },
          { label:t("Risk level","Livello di rischio"),                                       value:t("Medium — between bonds & stocks","Medio — tra obbligazioni e azioni") },
        ],
        ctx: t(
          "Preferred stocks are popular with income-seeking investors — particularly in the banking and utilities sectors, where they are commonly issued. They are less common in tech. Popular examples: JPMorgan preferred series, Bank of America preferred.",
          "Le azioni privilegiate sono popolari tra gli investitori che cercano reddito — particolarmente nei settori bancario e delle utilities. Esempi popolari: serie privilegiate di JPMorgan, Bank of America preferred."
        ),
        insight: t(
          "If you want income and some stability without the complexity of bonds, preferred stocks are worth exploring. But remember: in a market crash they still fall — they are not as safe as government bonds.",
          "Se vuoi reddito e stabilità senza la complessità delle obbligazioni, le azioni privilegiate meritano attenzione. Ricorda però: in un crollo di mercato scendono comunque — non sono sicure come i titoli di Stato."
        ),
      },
      {
        id:34, icon:"🔀", level:"basic" as const,
        title: t("Mutual Funds vs ETFs — What's the Difference?","Fondi Comuni vs ETF — Qual è la Differenza?"),
        explanation: t(
          "Both mutual funds and ETFs pool money from many investors to buy a basket of assets. The key differences: ETFs trade on stock exchanges in real time like stocks, while mutual funds are priced just once per day after the market closes. ETFs are almost always cheaper — expense ratios are often 5–10× lower. Actively managed mutual funds try to beat the market by picking stocks — but studies show that the vast majority fail to do so over the long run.",
          "Sia i fondi comuni che gli ETF raccolgono denaro da molti investitori per comprare un paniere di asset. Le differenze principali: gli ETF sono scambiati in borsa in tempo reale come le azioni, mentre i fondi comuni vengono quotati una volta al giorno dopo la chiusura del mercato. Gli ETF sono quasi sempre più economici — gli expense ratio sono spesso 5–10 volte inferiori. I fondi comuni attivi cercano di battere il mercato selezionando titoli — ma gli studi mostrano che la grande maggioranza fallisce nel lungo periodo."
        ),
        stats: [
          { label:t("ETF — average expense ratio","ETF — expense ratio medio"),                          value:"0.03–0.50%/yr" },
          { label:t("Active mutual fund — average fee","Fondo comune attivo — commissione media"),        value:"0.5–2.0%/yr" },
          { label:t("ETF — intraday trading?","ETF — trading infragiornaliero?"),                         value:t("Yes — like stocks","Sì — come le azioni") },
          { label:t("Mutual fund — intraday trading?","Fondo comune — trading infragiornaliero?"),        value:t("No — end-of-day price only","No — solo prezzo di fine giornata") },
          { label:t("Active funds beating their index over 15yr","Fondi attivi che battono l'indice in 15 anni"), value:"< 10%" },
        ],
        ctx: t(
          "For most long-term investors, a low-cost index ETF is the better choice over an actively managed mutual fund. The exception: some banks and pension plans only offer mutual funds — in that case, look for the lowest-fee options available.",
          "Per la maggior parte degli investitori a lungo termine, un ETF indice a basso costo è la scelta migliore rispetto a un fondo comune a gestione attiva. L'eccezione: alcune banche e piani pensionistici offrono solo fondi comuni — in quel caso, cerca le opzioni con le commissioni più basse disponibili."
        ),
        insight: t(
          "The mutual fund industry manages trillions of euros but charges fees that consume a large portion of returns. Always ask: what am I paying, and does the extra cost justify it? For index-tracking strategies, the answer is almost always no.",
          "L'industria dei fondi comuni gestisce trilioni di euro ma addebita commissioni che consumano gran parte dei rendimenti. Chiediti sempre: quanto pago e il costo extra è giustificato? Per le strategie che replicano un indice, la risposta è quasi sempre no."
        ),
      },
      {
        id:35, icon:"🎭", level:"advanced" as const,
        title: t("Options & Derivatives — Know Before You Touch","Opzioni e Derivati — Capire Prima di Toccare"),
        explanation: t(
          "Options give you the right (but not the obligation) to buy or sell an asset at a specific price by a specific date. A 'call' option profits if the price rises; a 'put' option profits if it falls. Derivatives are instruments whose value is derived from an underlying asset — stock, index, commodity, or currency. These are powerful tools used by professionals for hedging — but they are extremely complex and risky for beginners. Most retail traders who actively trade options lose money.",
          "Le opzioni ti danno il diritto (ma non l'obbligo) di comprare o vendere un asset a un prezzo specifico entro una data specifica. Un'opzione 'call' guadagna se il prezzo sale; un'opzione 'put' guadagna se scende. I derivati sono strumenti il cui valore deriva da un asset sottostante — azione, indice, materia prima o valuta. Sono strumenti potenti usati dai professionisti per la copertura — ma sono estremamente complessi e rischiosi per i principianti. La maggior parte dei trader al dettaglio che usa le opzioni attivamente perde denaro."
        ),
        stats: [
          { label:t("Retail options traders who lose money","Trader al dettaglio che perdono con le opzioni"), value:"~70–80%" },
          { label:t("Options can expire worthless?","Le opzioni possono scadere senza valore?"),             value:t("Yes — total loss possible","Sì — perdita totale possibile") },
          { label:t("Complexity level","Livello di complessità"),                                             value:t("Very high — specialist knowledge needed","Molto alto — richiede conoscenze specializzate") },
          { label:t("Professional use case","Uso professionale"),                                             value:t("Hedging portfolios, income strategies","Copertura portafogli, strategie di reddito") },
        ],
        ctx: t(
          "For beginners, options and derivatives are best understood as concepts — not tools to trade. Get fully comfortable with stocks and ETFs first. If you are curious, paper-trade (simulated trading with no real money) for at least 6 months before risking capital.",
          "Per i principianti, le opzioni e i derivati si capiscono meglio come concetti — non come strumenti da tradare. Prima familiarizza completamente con azioni ed ETF. Se sei curioso, fai paper trading (trading simulato senza denaro reale) per almeno 6 mesi prima di rischiare capitale."
        ),
        insight: t(
          "Options are not inherently evil — professionals use them daily to reduce portfolio risk. But without deep knowledge, they are one of the fastest ways to lose money. Never trade an instrument you do not fully understand.",
          "Le opzioni non sono intrinsecamente pericolose — i professionisti le usano quotidianamente per ridurre il rischio del portafoglio. Ma senza conoscenza profonda, sono uno dei modi più veloci per perdere denaro. Non tradare mai uno strumento che non capisci completamente."
        ),
      },
    ],
  };

  // ── CATEGORY 3: Key Analysis Concepts ────────────────────────────────────────
  const cat3 = {
    id:"concepts", icon:"🧠", color:"#6366F1",
    title: t("Key Analysis Concepts","Concetti Chiave di Analisi"),
    subtitle: t("How to read and evaluate investments — Vela's toolkit explained","Come leggere e valutare gli investimenti — il toolkit di Vela spiegato"),
    lessons: [
      {
        id:13, icon:"📊", level:"basic" as const,
        title: t("What is P&L?","Cos'è il P&L?"),
        explanation: t(
          "P&L stands for Profit & Loss. It shows how much you've made or lost on an investment since you bought it. If you bought at $100 and it's now $120, your P&L is +$20 (+20%). A negative P&L means a loss. It's the simplest measure of investment performance — but remember it's 'unrealised' until you sell.",
          "P&L significa Profitto e Perdita. Mostra quanto hai guadagnato o perso su un investimento da quando l'hai acquistato. Se hai comprato a $100 e ora vale $120, il tuo P&L è +$20 (+20%). Un P&L negativo significa una perdita. È la misura più semplice della performance dell'investimento — ma ricorda che è 'non realizzato' finché non vendi."
        ),
        ctx: noPort ? t("Add some holdings to see your real P&L here.","Aggiungi dei titoli per vedere il tuo P&L reale qui.")
          : primary ? <span>{t("Your","Il tuo")} <strong style={{color:"white"}}>{primary.ticker}</strong> {t("is","è")} <strong style={{color:primary.pctGain>=0?"#4ADE80":"#F87171"}}>{primary.pctGain>=0?"+":""}{fmt(primary.pctGain,1)}%</strong> {t("since you bought it — an unrealised","da quando l'hai comprato — un")} {primary.absGain>=0?t("gain","guadagno non realizzato"):t("loss","perdita non realizzata")} {t("of","di")} <strong style={{color:"white"}}>{primary.absGain>=0?"+":""}{primary.currSymbol}{fmt(Math.abs(primary.absGain))}</strong>.</span> : null,
        insight: t("P&L is unrealised until you sell. The number on screen is theoretical — it only becomes real cash when you close the position.","Il P&L è non realizzato finché non vendi. Il numero sullo schermo è teorico — diventa denaro reale solo quando chiudi la posizione."),
      },
      {
        id:14, icon:"💫", level:"basic" as const,
        title: t("Compound Interest — The 8th Wonder","Interesse Composto — L'8° Meraviglia"),
        explanation: t(
          "Compound interest means your gains earn gains. €1,000 at 7%/year becomes €1,070 after year 1. In year 2, you earn 7% on €1,070 — not just the original €1,000. This snowball effect accelerates over time: after 30 years, that €1,000 becomes €7,612 without adding a single euro more. The earlier you start, the more dramatic the effect.",
          "L'interesse composto significa che i tuoi guadagni guadagnano guadagni. €1.000 al 7%/anno diventano €1.070 dopo il primo anno. Nel secondo anno, guadagni il 7% su €1.070 — non solo sui €1.000 originali. Questo effetto palla di neve accelera nel tempo: dopo 30 anni, quei €1.000 diventano €7.612 senza aggiungere un solo euro. Prima inizi, più drammatico è l'effetto."
        ),
        stats: [
          { label:t("€1,000 at 7%/yr — after 10 years","€1.000 al 7%/anno — dopo 10 anni"), value:"€1,967" },
          { label:t("€1,000 at 7%/yr — after 20 years","€1.000 al 7%/anno — dopo 20 anni"), value:"€3,870" },
          { label:t("€1,000 at 7%/yr — after 30 years","€1.000 al 7%/anno — dopo 30 anni"), value:"€7,612" },
          { label:t("€200/month at 10%/yr for 30 years","€200/mese al 10%/anno per 30 anni"), value:t("~€452,000 (invested: €72,000)","~€452.000 (investito: €72.000)") },
        ],
        ctx: t("The earlier you start, the less you need to invest. Starting at 25 vs 35 can mean doubling your final wealth — with the same monthly contribution.","Prima inizi, meno devi investire. Iniziare a 25 anni invece di 35 può significare raddoppiare la ricchezza finale — con lo stesso contributo mensile."),
        insight: t("Einstein reportedly called compound interest the 8th wonder of the world: 'He who understands it, earns it. He who doesn't, pays it.' Start early — 10 extra years can double your final wealth.","Einstein avrebbe definito l'interesse composto l'8° meraviglia del mondo: 'Chi lo capisce, lo guadagna. Chi non lo capisce, lo paga.' Inizia presto — 10 anni in più possono raddoppiare la tua ricchezza finale."),
      },
      {
        id:15, icon:"🔁", level:"basic" as const,
        title: t("Dollar-Cost Averaging (DCA)","Piano di Accumulo (PAC/DCA)"),
        explanation: t(
          "DCA means investing a fixed amount (e.g. €200/month) at regular intervals, regardless of whether markets are up or down. When prices are low, your €200 buys more shares. When high, fewer shares. Over time, you naturally average out the ups and downs. This removes the hardest and most dangerous decision in investing: when to buy.",
          "Il DCA (Dollar-Cost Averaging) significa investire un importo fisso (es. €200/mese) a intervalli regolari, indipendentemente dal fatto che i mercati siano in rialzo o in ribasso. Quando i prezzi sono bassi, i tuoi €200 comprano più quote. Quando sono alti, meno quote. Nel tempo, si livellano naturalmente i saliscendi. Questo elimina la decisione più difficile e pericolosa negli investimenti: quando comprare."
        ),
        stats: [
          { label:t("€200/month for 30yr at 10%/yr","€200/mese per 30 anni al 10%/anno"),    value:t("~€452,000 final","~€452.000 finali") },
          { label:t("Total invested","Totale investito"),                                      value:"€72,000" },
          { label:t("Compound gains","Guadagni da interesse composto"),                        value:"~€380,000" },
          { label:t("Effort required","Sforzo richiesto"),                                     value:t("Set up monthly auto-transfer","Imposta bonifico mensile automatico") },
        ],
        ctx: t("DCA is the investing equivalent of going to the gym regularly — the results aren't dramatic in any single month, but over years the transformation is remarkable.","Il DCA è l'equivalente finanziario di andare in palestra regolarmente — i risultati non sono drammatici in nessun singolo mese, ma nel corso degli anni la trasformazione è notevole."),
        insight: t("The biggest enemy of DCA is stopping during market crashes — exactly when it's most valuable, because you're buying at lower prices. Keep going when markets fall.","Il più grande nemico del DCA è fermarsi durante i crolli di mercato — esattamente quando è più prezioso, perché stai comprando a prezzi più bassi. Continua quando i mercati scendono."),
      },
      {
        id:16, icon:"🏷️", level:"intermediate" as const,
        title: t("P/E Ratio — Cheap or Expensive?","Rapporto P/E — Caro o Economico?"),
        explanation: t(
          "P/E (Price ÷ Earnings per share) tells you how much investors pay for each €1 of annual profit. A P/E of 30x means the market values the company at 30 years' worth of current earnings. Compare it to the sector average to judge if a stock is cheap (below average) or expensive (above average). Growth companies (tech) typically trade at higher P/E than value companies (utilities).",
          "Il P/E (Prezzo ÷ Utile per azione) dice quanto gli investitori pagano per ogni €1 di profitto annuo. Un P/E di 30x significa che il mercato valuta l'azienda a 30 anni di utili attuali. Confrontalo con la media del settore per capire se un titolo è economico (sotto la media) o caro (sopra la media). Le aziende growth (tech) tipicamente trattano a P/E più alti rispetto alle value (utilities)."
        ),
        ctx: (() => {
          if (noPort||!primSig?.meta) return t("Add holdings to see a real P/E example.","Aggiungi titoli per vedere un esempio P/E reale.");
          const pe=primSig.meta.pe; const fp=primSig.meta.fairPE; const sec=primSig.meta.sector||t("this sector","questo settore");
          if(primSig.meta.unprofitable) return <span><strong style={{color:"white"}}>{primary!.ticker}</strong> {t("is currently unprofitable — P/E is not meaningful when earnings are negative.","è attualmente in perdita — il P/E non è significativo con utili negativi.")}</span>;
          if(pe===null) return t("No P/E data for this holding (ETF or index fund).","Nessun dato P/E per questo titolo (ETF o fondo indice).");
          return <span><strong style={{color:"white"}}>{primary!.ticker}</strong> P/E: <strong style={{color:"white"}}>{fmt(pe,1)}x</strong> vs sector fair P/E <strong style={{color:"white"}}>{fp}x</strong> ({sec}) → {pe<fp?t("potentially undervalued","potenzialmente sottovalutato"):t("trading at a premium","tratta a premio")}.</span>;
        })(),
        insight: t("P/E alone never tells the full story. A high P/E can mean 'overpriced' OR 'high growth expected'. Always compare to sector peers.","Il P/E da solo non racconta mai tutta la storia. Un P/E alto può significare 'troppo caro' O 'alta crescita attesa'. Confronta sempre con i titoli dello stesso settore."),
      },
      {
        id:17, icon:"📉", level:"intermediate" as const,
        title: t("200-Day Moving Average","Media Mobile a 200 Giorni"),
        explanation: t(
          "The 200-day moving average (200MA) is the average closing price over the last ~10 months. When price is above the 200MA, the stock is in a long-term uptrend — considered bullish. When below, it's in a downtrend — bearish. Vela uses this as one of its 5 scoring factors, worth up to 20 points.",
          "La media mobile a 200 giorni (200MA) è il prezzo di chiusura medio degli ultimi ~10 mesi. Quando il prezzo è sopra la 200MA, il titolo è in un trend rialzista di lungo periodo — segnale positivo. Quando è sotto, è in un downtrend — segnale negativo. Vela la usa come uno dei suoi 5 fattori di scoring, valendo fino a 20 punti."
        ),
        ctx: (() => {
          if (noPort||!primSig?.meta) return t("Add holdings to see their 200-day MA status.","Aggiungi titoli per vedere il loro stato rispetto alla 200MA.");
          const d=primSig.meta.ma200Diff;
          return <span><strong style={{color:"white"}}>{primary!.ticker}</strong> {t("is","è")} <strong style={{color:d>=0?"#4ADE80":"#F87171"}}>{d>=0?"+":""}{fmt(d,1)}%</strong> {d>=0?t("above","sopra"):t("below","sotto")} {t("its 200-day MA","la sua 200MA")} → {d>=5?t("strongly bullish","fortemente rialzista"):d>=0?t("mildly bullish","leggermente rialzista"):d>=-5?t("mildly bearish","leggermente ribassista"):t("strongly bearish","fortemente ribassista")}.</span>;
        })(),
        insight: t("The 200MA doesn't predict the future — it describes the trend. Many professional traders call it the single most important line on a price chart.","La 200MA non prevede il futuro — descrive il trend. Molti trader professionisti la considerano la linea più importante su un grafico dei prezzi."),
      },
      {
        id:18, icon:"🔊", level:"intermediate" as const,
        title: t("Volume & Momentum","Volume e Momentum"),
        explanation: t(
          "Volume is the number of shares traded in a given period. High volume confirms that a price move is genuine — driven by real buyers or sellers. Low volume moves are often noise and can reverse quickly. Rising price + rising volume = strong, confirmed trend. Rising price + falling volume = weak signal, be cautious.",
          "Il volume è il numero di azioni scambiate in un dato periodo. Un volume elevato conferma che un movimento di prezzo è genuino — guidato da veri compratori o venditori. I movimenti a basso volume sono spesso rumore e possono invertirsi rapidamente. Prezzo in salita + volume in aumento = trend forte, confermato. Prezzo in salita + volume in calo = segnale debole, sii cauto."
        ),
        ctx: (() => {
          if (noPort||!primSig?.factors) return t("Add holdings to see momentum analysis.","Aggiungi titoli per vedere l'analisi del momentum.");
          const m=primSig.factors.momentum;
          return <span>{t("Vela scored","Vela ha assegnato")} <strong style={{color:"white"}}>{primary!.ticker}</strong> momentum <strong style={{color:"white"}}>{m}/25</strong> → {m>=20?t("strong — positive short-term price direction","forte — direzione di prezzo a breve termine positiva"):m>=15?t("neutral — flat recent movement","neutro — movimento recente piatto"):t("weak — negative recent price direction","debole — direzione di prezzo recente negativa")}.</span>;
        })(),
        insight: t("Professional traders never trust a price move that isn't backed by volume. High volume = conviction. Low volume = noise.","I trader professionisti non si fidano mai di un movimento di prezzo non supportato dal volume. Volume alto = convinzione. Volume basso = rumore."),
      },
      {
        id:19, icon:"🤖", level:"basic" as const,
        title: t("How Vela Scores Your Stocks","Come Vela Calcola il Punteggio"),
        explanation: t(
          "Vela gives each stock a score from 0 to 100, built from 3 simple factors: (1) Trend — is the price above its 200-day moving average? (40 pts), (2) Fair Value — is it cheap or expensive vs its sector? (35 pts), (3) Momentum — has the price been going up in the last 3 months? (25 pts). Score ≥65 → BUY · 35–64 → HOLD · <35 → SELL.",
          "Vela assegna ad ogni titolo un punteggio da 0 a 100, costruito su 3 fattori semplici: (1) Trend — il prezzo è sopra la media mobile a 200 giorni? (40 pt), (2) Valore Equo — è economico o caro rispetto al settore? (35 pt), (3) Momentum — il prezzo è salito negli ultimi 3 mesi? (25 pt). Punteggio ≥65 → BUY · 35–64 → HOLD · <35 → SELL."
        ),
        ctx: (() => {
          if (noPort||!primSig?.factors||primSig.score===null) return t("Add holdings to see the full score breakdown.","Aggiungi titoli per vedere il dettaglio del punteggio.");
          const f=primSig.factors;
          return <span><strong style={{color:"white"}}>{primary!.ticker}</strong> {t("scores","punteggio")} <strong style={{color:"#0EA5E9"}}>{primSig.score}/100</strong>:<br/>{t("Trend","Trend")} {f.trend}/40 · {t("Fair Value","Valore Equo")} {f.value}/35 · {t("Momentum","Momentum")} {f.momentum}/25</span>;
        })(),
        insight: t("The score is a starting point, not a guarantee. Use it to prioritise which stocks to research further — not as a buy/sell trigger on its own.","Il punteggio è un punto di partenza, non una garanzia. Usalo per dare priorità ai titoli da approfondire — non come segnale di acquisto/vendita autonomo."),
      },
      {
        id:20, icon:"👨‍💼", level:"intermediate" as const,
        title: t("Analyst Consensus","Consenso degli Analisti"),
        explanation: t(
          "Professional analysts at banks and research firms publish Buy, Hold, or Sell ratings after deeply analysing a company. Vela aggregates these: showing how many analysts recommend each action. A strong Buy consensus indicates broad professional confidence. A strong Sell consensus is a warning sign worth taking seriously.",
          "Gli analisti professionisti di banche e società di ricerca pubblicano rating Acquisto, Neutro o Vendita dopo aver analizzato approfonditamente un'azienda. Vela aggrega questi dati: mostra quanti analisti raccomandano ogni azione. Un forte consenso Acquisto indica un'ampia fiducia professionale. Un forte consenso Vendita è un segnale di allerta da prendere sul serio."
        ),
        ctx: (() => {
          if (noPort||!primSig?.analyst) return t("Analyst data appears for most large-cap stocks once your holdings are added.","I dati degli analisti appaiono per la maggior parte dei titoli large-cap una volta aggiunti i tuoi titoli.");
          const an=primSig.analyst;
          return <span>{t("For","Per")} <strong style={{color:"white"}}>{primary!.ticker}</strong>: <strong style={{color:"#4ADE80"}}>{an.strongBuy+an.buy} {t("Buy","Acquisto")}</strong> · <strong style={{color:"#FCD34D"}}>{an.hold} {t("Hold","Neutro")}</strong> · <strong style={{color:"#F87171"}}>{an.sell+an.strongSell} {t("Sell","Vendita")}</strong> ({an.total} {t("total","totale")}). {t("Consensus:","Consenso:")} <strong style={{color:"white"}}>{an.label}</strong>.</span>;
        })(),
        insight: t("Analysts are often wrong on timing — even when right on direction. Use consensus as one input among many, not as the final word.","Gli analisti spesso sbagliano i tempi — anche quando hanno ragione sulla direzione. Usa il consenso come uno degli input tra tanti, non come parola finale."),
      },
      {
        id:21, icon:"🌍", level:"intermediate" as const,
        title: t("Diversification — Don't Put All Eggs in One Basket","Diversificazione — Non Mettere Tutte le Uova in un Paniere"),
        explanation: t(
          "Diversification means spreading investments across different companies, sectors, and regions. If one investment crashes, others cushion the fall. A portfolio of 15 stocks across 5 sectors and 2 continents is far safer than 15 stocks in the same sector — even if each individual stock is excellent. Diversification is the only free lunch in investing.",
          "La diversificazione significa distribuire gli investimenti su diverse aziende, settori e regioni. Se un investimento crolla, gli altri attutiscono la caduta. Un portafoglio di 15 titoli in 5 settori e 2 continenti è molto più sicuro di 15 titoli nello stesso settore — anche se ogni singolo titolo è eccellente. La diversificazione è l'unico pasto gratis negli investimenti."
        ),
        ctx: noPort ? t("Add at least 3–5 holdings across different sectors to start measuring your diversification.","Aggiungi almeno 3–5 titoli in settori diversi per iniziare a misurare la tua diversificazione.")
          : <span>{t("Your portfolio has","Il tuo portafoglio ha")} <strong style={{color:"white"}}>{enriched.length} {t("holdings","titoli")}</strong> {t("across","in")} <strong style={{color:"white"}}>{sectors.size} {t("sectors","settori")}</strong>. {topPct>40?<span style={{color:"#F87171"}}>{t(`Warning: ${primary!.ticker} is ${fmt(topPct,0)}% of your portfolio.`,`Attenzione: ${primary!.ticker} è il ${fmt(topPct,0)}% del tuo portafoglio.`)}</span>:<span style={{color:"#4ADE80"}}>{t("Good spread across positions.","Buona distribuzione tra le posizioni.")}</span>}</span>,
        insight: t("Studies show most diversification benefits are captured with just 15–20 stocks across different sectors. Beyond that, each extra stock adds minimal additional safety.","Gli studi mostrano che la maggior parte dei benefici della diversificazione si ottiene con soli 15–20 titoli in settori diversi. Oltre, ogni titolo aggiuntivo aggiunge una sicurezza minima."),
      },
      {
        id:22, icon:"⚖️", level:"basic" as const,
        title: t("Risk vs Reward","Rischio vs Rendimento"),
        explanation: t(
          "In investing, higher potential returns almost always come with higher risk. This is one of the most fundamental laws of finance. A government bond might return 4–5% safely; a high-growth startup might return 10x or go to zero. There is no such thing as a high-return, zero-risk investment — if someone promises that, it's a scam.",
          "Negli investimenti, rendimenti potenziali più alti comportano quasi sempre rischi più elevati. Questa è una delle leggi più fondamentali della finanza. Un titolo di Stato può rendere il 4–5% in modo sicuro; una startup ad alta crescita può rendere 10x o azzerarsi. Non esiste un investimento ad alto rendimento e a rischio zero — se qualcuno te lo promette, è una truffa."
        ),
        ctx: risk ? <span>{t("Your investor profile is","Il tuo profilo di investitore è")} <strong style={{color:"white"}}>{appLang==="it"?({"Conservative":"Conservativo","Balanced":"Bilanciato","Growth":"Crescita","Aggressive":"Aggressivo"}[risk.profile]??risk.profile):risk.profile}</strong>. {t("Suggested:","Suggerito:")} <strong style={{color:"#0EA5E9"}}>{risk.stocks}% {t("stocks","azioni")}</strong> · <strong style={{color:"#6366F1"}}>{risk.bonds}% {t("bonds","obbligazioni")}</strong> · <strong style={{color:"#94A3B8"}}>{risk.cash}% {t("cash","liquidità")}</strong>.</span>
          : t("Complete the risk questionnaire in your Profile to see your personalised allocation.","Completa il questionario di rischio nel tuo Profilo per vedere la tua allocazione personalizzata."),
        insight: t("Age matters: younger investors can afford more risk (more time to recover from crashes). Older investors near retirement typically shift toward safer assets.","L'età conta: gli investitori più giovani possono permettersi più rischio (più tempo per riprendersi dai crolli). Gli investitori più anziani vicini alla pensione si spostano tipicamente verso asset più sicuri."),
      },
      {
        id:23, icon:"🔄", level:"advanced" as const,
        title: t("Rebalancing — Stay on Target","Ribilanciamento — Rimani in Rotta"),
        explanation: t(
          "Rebalancing means periodically selling positions that have grown too large and buying positions that have shrunk — restoring your original target allocation. For example, if tech stocks soared and now represent 60% of your portfolio (target: 30%), you sell some tech and buy other sectors. This enforces a systematic 'sell high, buy low' discipline.",
          "Il ribilanciamento significa vendere periodicamente le posizioni cresciute troppo e comprare quelle diminuite — ripristinando la tua allocazione target originale. Ad esempio, se i titoli tech sono saliti molto e ora rappresentano il 60% del portafoglio (target: 30%), vendi un po' di tech e compri altri settori. Questo impone una disciplina sistematica 'vendi alto, compra basso'."
        ),
        ctx: noPort ? t("Add holdings to see rebalancing insights.","Aggiungi titoli per vedere i suggerimenti di ribilanciamento.")
          : topPct>30&&primary ? <span style={{color:"#FBBF24"}}>{t("Warning:","Attenzione:")} <strong style={{color:"white"}}>{primary.ticker}</strong> {t("is","è")} <strong style={{color:"#F87171"}}>{fmt(topPct,0)}%</strong> {t("of your portfolio — consider trimming to reduce concentration risk.","del tuo portafoglio — considera di ridurre per diminuire il rischio di concentrazione.")}</span>
          : <span style={{color:"#4ADE80"}}>{t("Your largest position","La tua posizione più grande")} ({primary?.ticker??"-"}) {t("is","è")} {fmt(topPct,0)}% {t("of your portfolio — within a healthy range.","del tuo portafoglio — in un range sano.")}</span>,
        insight: t("Most advisors recommend rebalancing once or twice a year — or when a position drifts more than 5–10% from its target. Don't rebalance too often; transaction costs and taxes eat into gains.","La maggior parte dei consulenti raccomanda di ribilanciare una o due volte all'anno — o quando una posizione si discosta di più del 5–10% dal target. Non ribilanciare troppo spesso; i costi di transazione e le tasse erodono i guadagni."),
      },
    ],
  };

  // ── CATEGORY 4: Historical Performance ───────────────────────────────────────
  const cat4 = {
    id:"history", icon:"📊", color:"#F59E0B",
    title: t("Historical Performance","Performance Storica"),
    subtitle: t("What the data actually shows over decades — verified sources","Cosa mostrano i dati su decenni — fonti verificate"),
    lessons: [
      {
        id:24, icon:"📜", level:"intermediate" as const,
        title: t("Long-Run Returns by Asset Class","Rendimenti di Lungo Periodo per Classe di Asset"),
        explanation: t(
          "Over the very long run, different assets have produced very different returns. Stocks have been the best performers — but with the most volatility. Bonds provided steady, lower returns. Gold preserved wealth against inflation. Cash slowly lost purchasing power. These historical averages don't guarantee future results — but they are the best guide we have.",
          "Nel lunghissimo periodo, diverse classi di asset hanno prodotto rendimenti molto diversi. Le azioni sono state le migliori performer — ma con la maggiore volatilità. Le obbligazioni hanno fornito rendimenti stabili e più bassi. L'oro ha preservato la ricchezza contro l'inflazione. La liquidità ha lentamente perso potere d'acquisto. Queste medie storiche non garantiscono risultati futuri — ma sono la migliore guida che abbiamo."
        ),
        stats: [
          { label:t("S&P 500 (US Stocks) — since 1926","S&P 500 (Azioni USA) — dal 1926"),    value:"~10%/yr", extra:t("~7% real","~7% reale") },
          { label:t("MSCI World (Global Stocks) — since 1970","MSCI World — dal 1970"),         value:"~8%/yr",  extra:t("~5% real","~5% reale") },
          { label:t("Real Estate REITs — since 1972","REIT Immobiliare — dal 1972"),            value:"~11%/yr", extra:t("incl. dividends","incl. dividendi") },
          { label:t("Gold — since 1971","Oro — dal 1971"),                                       value:"~7%/yr",  extra:t("~1–2% real","~1–2% reale") },
          { label:t("Government Bonds (10Y) — since 1926","Titoli di Stato 10 anni — dal 1926"), value:"~4–5%/yr",extra:t("~2% real","~2% reale") },
          { label:t("Cash / Savings — long-run","Liquidità — lungo periodo"),                     value:"~3%/yr",  extra:t("≈ inflation","≈ inflazione") },
        ],
        ctx: t("Sources: Ibbotson/Morningstar SBBI (stocks, bonds since 1926), MSCI (global stocks since 1970), NAREIT (REITs since 1972), World Gold Council (gold since 1971). Past performance does not guarantee future results.","Fonti: Ibbotson/Morningstar SBBI (azioni, obbligazioni dal 1926), MSCI (azioni globali dal 1970), NAREIT (REIT dal 1972), World Gold Council (oro dal 1971). I rendimenti passati non garantiscono risultati futuri."),
        insight: t("The difference between 7% and 10% annual return sounds small — but over 30 years on €10,000: at 7% you get €76,000; at 10% you get €175,000. The extra 3% is worth €99,000.","La differenza tra il 7% e il 10% di rendimento annuo sembra piccola — ma su 30 anni con €10.000: al 7% ottieni €76.000; al 10% ottieni €175.000. Il 3% in più vale €99.000."),
      },
      {
        id:25, icon:"💥", level:"intermediate" as const,
        title: t("Famous Market Crashes — and Recoveries","Famosi Crolli di Mercato — e Recuperi"),
        explanation: t(
          "Markets crash regularly — about once per decade there's a major decline of 30–50% or more. This is normal and expected. What matters most is that every crash in history has been eventually followed by a full recovery and new all-time highs. Investors who stayed invested through crashes recovered everything and made more. Those who sold during the panic locked in permanent losses.",
          "I mercati crollano regolarmente — circa una volta per decennio c'è un grande calo del 30–50% o più. Questo è normale e previsto. Ciò che conta di più è che ogni crollo nella storia è stato alla fine seguito da un recupero completo e nuovi massimi storici. Gli investitori che sono rimasti investiti durante i crolli hanno recuperato tutto e guadagnato di più. Quelli che hanno venduto durante il panico hanno bloccato perdite permanenti."
        ),
        stats: [
          { label:t("Great Depression 1929–32","Grande Depressione 1929–32"),         value:"-89%", extra:t("Recovery: ~25 years","Recupero: ~25 anni") },
          { label:t("Oil Crisis 1973–74","Crisi del Petrolio 1973–74"),               value:"-48%", extra:t("Recovery: ~4 years","Recupero: ~4 anni") },
          { label:t("Dot-com Crash 2000–02","Crollo Dot-com 2000–02"),                value:"-49%", extra:t("Recovery: ~7 years","Recupero: ~7 anni") },
          { label:t("Financial Crisis 2007–09","Crisi Finanziaria 2007–09"),          value:"-57%", extra:t("Recovery: ~4 years","Recupero: ~4 anni") },
          { label:t("COVID-19 Crash 2020","Crollo COVID-19 2020"),                    value:"-34%", extra:t("Recovery: ~5 months","Recupero: ~5 mesi") },
        ],
        ctx: t("Source: S&P 500 historical data. Note: the Great Depression was an extreme outlier — most crashes recover in 1–5 years. The COVID crash recovered in just 5 months, one of the fastest in history.","Fonte: dati storici S&P 500. Nota: la Grande Depressione è stata un caso estremo — la maggior parte dei crolli si recupera in 1–5 anni. Il crollo del COVID si è recuperato in soli 5 mesi, uno dei più veloci nella storia."),
        insight: t("Markets have survived two world wars, the Great Depression, multiple financial crises, pandemics, and geopolitical shocks — and reached new highs after every single one. The most dangerous thing you can do is panic and sell.","I mercati hanno superato due guerre mondiali, la Grande Depressione, molteplici crisi finanziarie, pandemie e shock geopolitici — e hanno raggiunto nuovi massimi dopo ognuno. La cosa più pericolosa che puoi fare è lasciarti prendere dal panico e vendere."),
      },
      {
        id:26, icon:"📅", level:"intermediate" as const,
        title: t("The Cost of Missing the Best Days","Il Costo di Perdere i Giorni Migliori"),
        explanation: t(
          "Markets don't move up gradually every day — most of the annual gains come from just a handful of exceptional days. Missing even 10 of these best days in a 20-year period dramatically reduces your returns. The problem: the best days often occur right after the worst days, during market panics — exactly when most people want to sell.",
          "I mercati non salgono gradualmente ogni giorno — la maggior parte dei guadagni annuali proviene da solo una manciata di giorni eccezionali. Perdere anche solo 10 di questi giorni migliori in un periodo di 20 anni riduce drasticamente i rendimenti. Il problema: i giorni migliori spesso si verificano subito dopo i giorni peggiori, durante i panici di mercato — esattamente quando la maggior parte delle persone vuole vendere."
        ),
        stats: [
          { label:t("Stayed fully invested (2003–2022)","Rimasto completamente investito (2003–2022)"),  value:"$64,844",  extra:t("on $10,000","su $10.000") },
          { label:t("Missed 10 best days","Perso i 10 giorni migliori"),                                 value:"$29,708",  extra:"-54%" },
          { label:t("Missed 20 best days","Perso i 20 giorni migliori"),                                 value:"$17,826",  extra:"-73%" },
          { label:t("Missed 30 best days","Perso i 30 giorni migliori"),                                 value:"$11,701",  extra:"-82%" },
        ],
        ctx: t("Source: JP Morgan Guide to Retirement (2023). S&P 500 data, January 2003 – December 2022. Missing the best days by trying to time the market is one of the most expensive mistakes an investor can make.","Fonte: JP Morgan Guide to Retirement (2023). Dati S&P 500, gennaio 2003 – dicembre 2022. Perdere i giorni migliori cercando di scegliere il momento giusto è uno degli errori più costosi che un investitore possa fare."),
        insight: t("'Time in the market beats timing the market' — this data shows exactly why. The best trading days and worst trading days cluster together. Staying invested means catching both.","'Il tempo nel mercato batte il tempismo del mercato' — questi dati mostrano esattamente perché. I giorni di trading migliori e peggiori si raggruppano insieme. Rimanere investiti significa catturare entrambi."),
      },
      {
        id:27, icon:"🔥", level:"basic" as const,
        title: t("Inflation — The Silent Thief","L'Inflazione — Il Ladro Silenzioso"),
        explanation: t(
          "Inflation is the rate at which prices rise — and the rate at which your money's purchasing power falls. At 3%/year inflation, €100 today will buy only €74 worth of goods in 10 years, and only €55 in 20 years. This happens invisibly — your bank account still shows €100, but it buys less and less. Investing is the primary defence against inflation.",
          "L'inflazione è il tasso a cui salgono i prezzi — e il tasso a cui cade il potere d'acquisto del tuo denaro. Con un'inflazione del 3%/anno, €100 oggi comprano solo €74 di beni tra 10 anni, e solo €55 tra 20 anni. Questo accade invisibilmente — il tuo conto bancario mostra ancora €100, ma compra sempre meno. Investire è la principale difesa contro l'inflazione."
        ),
        stats: [
          { label:t("€100 today — in 10yr at 3% inflation","€100 oggi — tra 10 anni al 3% inflazione"), value:"€74 purchasing power" },
          { label:t("€100 today — in 20yr at 3% inflation","€100 oggi — tra 20 anni al 3% inflazione"), value:"€55 purchasing power" },
          { label:t("€100 today — in 30yr at 3% inflation","€100 oggi — tra 30 anni al 3% inflazione"), value:"€41 purchasing power" },
          { label:t("Avg inflation (Eurozone) 2000–2023","Inflazione media (Eurozona) 2000–2023"),       value:"~2.4%/yr" },
        ],
        ctx: t("Historical example: a coffee that cost €1 in 2000 costs roughly €1.80 today — that's exactly 3% annual inflation over 20 years. Your money must grow faster than that to maintain its real value.","Esempio storico: un caffè che costava €1 nel 2000 oggi costa circa €1,80 — è esattamente il 3% di inflazione annua su 20 anni. Il tuo denaro deve crescere più velocemente di così per mantenere il suo valore reale."),
        insight: t("'Real return' = nominal return minus inflation. A savings account paying 2% when inflation is 3% gives you a REAL return of -1%. You're getting poorer, slowly, even while the nominal balance grows.","'Rendimento reale' = rendimento nominale meno inflazione. Un conto di risparmio che paga il 2% con un'inflazione del 3% ti dà un rendimento REALE del -1%. Stai diventando più povero, lentamente, anche mentre il saldo nominale cresce."),
      },
      {
        id:28, icon:"🐂", level:"intermediate" as const,
        title: t("Bull vs Bear Markets","Mercati Toro vs Orso"),
        explanation: t(
          "A 'bull market' is a sustained period of rising prices — typically defined as a 20%+ rise from a recent low. A 'bear market' is a 20%+ decline from a recent high. Bulls tend to last much longer than bears and produce far larger gains. Understanding this cycle helps you keep perspective when markets feel scary.",
          "Un 'mercato toro' è un periodo sostenuto di prezzi in salita — tipicamente definito come un rialzo del 20%+ da un recente minimo. Un 'mercato orso' è un calo del 20%+ da un recente massimo. I mercati toro tendono a durare molto più a lungo degli orsi e producono guadagni molto maggiori. Capire questo ciclo aiuta a mantenere la prospettiva quando i mercati sembrano spaventosi."
        ),
        stats: [
          { label:t("Average bull market duration","Durata media mercato toro"),    value:t("~4.5 years","~4,5 anni") },
          { label:t("Average bull market return","Rendimento medio mercato toro"),   value:"~180%"                    },
          { label:t("Average bear market duration","Durata media mercato orso"),    value:t("~10 months","~10 mesi") },
          { label:t("Average bear market decline","Calo medio mercato orso"),        value:"-35%"                    },
          { label:t("Since 1926: bull years vs bear years","Dal 1926: anni toro vs orso"), value:t("~75% bull / ~25% bear","~75% toro / ~25% orso") },
        ],
        ctx: t("Source: Ned Davis Research, Bloomberg. Historical data for S&P 500 since 1926. Note that individual market cycles vary widely — the COVID bear lasted only 33 days, one of the shortest ever.","Fonte: Ned Davis Research, Bloomberg. Dati storici per l'S&P 500 dal 1926. Si noti che i cicli di mercato individuali variano ampiamente — il mercato orso COVID è durato solo 33 giorni, uno dei più brevi di sempre."),
        insight: t("Bear markets feel terrifying when you're in them — but looking back, they appear as small dips on a long-term chart. The market spends ~75% of its time rising. Bears are temporary; bulls are the default.","I mercati orso sembrano terrificanti quando ci sei dentro — ma guardando indietro, appaiono come piccoli cali su un grafico a lungo termine. Il mercato trascorre ~75% del suo tempo in salita. Gli orsi sono temporanei; i tori sono il default."),
      },
    ],
  };

  // ── CATEGORY 5: Protecting Your Money ────────────────────────────────────────
  const cat5 = {
    id:"protect", icon:"🛡️", color:"#EF4444",
    title: t("Protecting Your Money","Proteggere il Tuo Denaro"),
    subtitle: t("The mistakes that cost beginners the most — avoid them","Gli errori che costano di più ai principianti — evitali"),
    lessons: [
      {
        id:29, icon:"🚨", level:"basic" as const,
        title: t("Recognise Investment Scams","Riconoscere le Truffe di Investimento"),
        explanation: t(
          "Investment scams are more common than most people think — and they target beginners especially. The golden rule: if an investment promises guaranteed high returns (5–10%+ per month) with zero risk, it is 100% a scam. There are no exceptions. Legitimate investments always carry risk. Scammers use social proof, urgency, and complexity to prevent victims from thinking clearly.",
          "Le truffe di investimento sono più comuni di quanto la maggior parte delle persone pensi — e prendono di mira i principianti in particolare. La regola d'oro: se un investimento promette alti rendimenti garantiti (5–10%+ al mese) con rischio zero, è al 100% una truffa. Non ci sono eccezioni. Gli investimenti legittimi comportano sempre un rischio. I truffatori usano la riprova sociale, l'urgenza e la complessità per impedire alle vittime di ragionare con chiarezza."
        ),
        stats: [
          { label:t("Red flag #1","Segnale d'allarme #1"),  value:t("Guaranteed returns > 1–2%/month","Rendimenti garantiti > 1–2%/mese") },
          { label:t("Red flag #2","Segnale d'allarme #2"),  value:t("'No risk' or 'risk-free' investment","Investimento 'senza rischio'") },
          { label:t("Red flag #3","Segnale d'allarme #3"),  value:t("Pressure to invest quickly","Pressione a investire rapidamente") },
          { label:t("Red flag #4","Segnale d'allarme #4"),  value:t("Unregulated broker / no license","Broker non regolamentato / senza licenza") },
          { label:t("Red flag #5","Segnale d'allarme #5"),  value:t("Difficulty withdrawing your money","Difficoltà a ritirare il tuo denaro") },
        ],
        ctx: t("Always verify: check if your broker is registered with the financial regulator in your country (FCA in UK, CONSOB in Italy, SEC in USA, BaFin in Germany). This takes 2 minutes and could save you thousands.","Verifica sempre: controlla se il tuo broker è registrato presso il regolatore finanziario del tuo paese (FCA nel UK, CONSOB in Italia, SEC negli USA, BaFin in Germania). Ci vogliono 2 minuti e potrebbe salvarti migliaia di euro."),
        insight: t("If someone on social media, a dating app, or a messaging group recommends a 'special' investment opportunity — stop. These are almost always romance scams or Ponzi schemes. No legitimate opportunity requires urgency or secrecy.","Se qualcuno sui social media, su un'app di incontri o in un gruppo di messaggistica ti raccomanda una 'speciale' opportunità di investimento — fermati. Queste sono quasi sempre truffe romantiche o schemi Ponzi. Nessuna opportunità legittima richiede urgenza o segretezza."),
      },
      {
        id:30, icon:"💸", level:"basic" as const,
        title: t("Fees & Expense Ratios — The Hidden Tax","Commissioni ed Expense Ratio — La Tassa Nascosta"),
        explanation: t(
          "Investment fees are charged as a percentage of your assets each year. A 1% annual fee on a €100,000 portfolio costs €1,000/year — and that money also loses its future compound growth. Over 30 years, the difference between a 0.1% fee ETF and a 1.5% fee active fund is staggering. Low-cost investing is one of the highest-ROI financial decisions you can make.",
          "Le commissioni di investimento vengono addebitate come percentuale delle tue attività ogni anno. Una commissione annua dell'1% su un portafoglio da €100.000 costa €1.000/anno — e quel denaro perde anche la sua futura crescita per interesse composto. Nel corso di 30 anni, la differenza tra un ETF con commissione dello 0,1% e un fondo attivo con commissione dell'1,5% è sbalorditiva. Investire a basso costo è una delle decisioni finanziarie con il ROI più alto che puoi prendere."
        ),
        stats: [
          { label:t("€100k at 7%/yr for 30yr — 0.1% fee","€100k al 7%/anno per 30 anni — fee 0,1%"),  value:"€747,000" },
          { label:t("€100k at 7%/yr for 30yr — 0.5% fee","€100k al 7%/anno per 30 anni — fee 0,5%"),  value:"€683,000" },
          { label:t("€100k at 7%/yr for 30yr — 1.0% fee","€100k al 7%/anno per 30 anni — fee 1,0%"),  value:"€574,000" },
          { label:t("€100k at 7%/yr for 30yr — 1.5% fee","€100k al 7%/anno per 30 anni — fee 1,5%"),  value:"€481,000" },
        ],
        ctx: t("The difference between 0.1% and 1.5% fees over 30 years on €100k: €266,000 less in your pocket. Always look for expense ratios below 0.5% — ideally below 0.2% for index ETFs.","La differenza tra commissioni dello 0,1% e dell'1,5% su 30 anni con €100k: €266.000 in meno nelle tue tasche. Cerca sempre expense ratio inferiori allo 0,5% — idealmente inferiori allo 0,2% per gli ETF indice."),
        insight: t("You can't control what markets return — but you can control what you pay in fees. Every euro saved in fees is a euro that compounds for you, not for a fund manager.","Non puoi controllare i rendimenti dei mercati — ma puoi controllare quanto paghi in commissioni. Ogni euro risparmiato in commissioni è un euro che si compone per te, non per un gestore di fondi."),
      },
      {
        id:31, icon:"🧾", level:"intermediate" as const,
        title: t("Tax Basics for Investors","Nozioni Fiscali per Investitori"),
        explanation: t(
          "When you sell an investment at a profit, you typically owe capital gains tax. Dividend income is also usually taxable. Tax rates vary by country and holding period. The good news: most countries offer tax-advantaged accounts where your investments grow tax-free or tax-deferred. Using these accounts is one of the highest-impact actions any investor can take.",
          "Quando vendi un investimento in profitto, di solito sei debitore dell'imposta sulle plusvalenze. Il reddito da dividendi è di solito anch'esso imponibile. Le aliquote fiscali variano per paese e periodo di detenzione. La buona notizia: la maggior parte dei paesi offre conti con agevolazioni fiscali dove i tuoi investimenti crescono in esenzione fiscale o con tassazione differita. Utilizzare questi conti è una delle azioni con il maggior impatto che un investitore possa intraprendere."
        ),
        stats: [
          { label:t("Italy — capital gains tax","Italia — tassazione plusvalenze"),         value:"26%"                              },
          { label:t("Italy — PIR accounts","Italia — conti PIR"),                           value:t("Tax-free if held 5+ years","Esenzione se detenuto 5+ anni") },
          { label:t("UK — ISA accounts","UK — conti ISA"),                                   value:t("£20,000/yr tax-free investing","£20.000/anno investimento esente") },
          { label:t("USA — 401(k) / IRA accounts","USA — conti 401(k) / IRA"),             value:t("Tax-deferred or tax-free growth","Crescita differita o esente") },
        ],
        ctx: t("Key rule: never let tax considerations stop you from investing altogether. A 26% tax on a 10% gain is far better than no gain from not investing. But do use available tax-advantaged accounts — they're free money from the government.","Regola chiave: non lasciare mai che le considerazioni fiscali ti impediscano di investire del tutto. Il 26% di tasse su un guadagno del 10% è molto meglio di nessun guadagno dal non investire. Ma usa i conti con agevolazioni fiscali disponibili — sono denaro gratuito dal governo."),
        insight: t("The longest-held investments are often taxed at lower rates in many countries. One more reason why 'buy and hold' — not frequent trading — is the most tax-efficient strategy.","Gli investimenti detenuti più a lungo sono spesso tassati a aliquote inferiori in molti paesi. Un altro motivo per cui 'comprare e tenere' — non il trading frequente — è la strategia più efficiente dal punto di vista fiscale."),
      },
      {
        id:32, icon:"😱", level:"basic" as const,
        title: t("Don't Panic Sell — The #1 Investor Mistake","Non Vendere per Panico — L'Errore #1 degli Investitori"),
        explanation: t(
          "Panic selling — dumping your investments when markets crash — is the single most common and costly mistake that beginner investors make. When you sell during a crash, you lock in permanent losses. Markets have recovered from every crash in history, including the Great Depression, two world wars, and multiple financial crises. Investors who stayed put recovered everything — and then made more.",
          "La vendita per panico — disfarsi degli investimenti quando i mercati crollano — è l'errore più comune e costoso che i principianti fanno. Quando vendi durante un crollo, blocchi perdite permanenti. I mercati si sono ripresi da ogni crollo nella storia, inclusa la Grande Depressione, due guerre mondiali e molteplici crisi finanziarie. Gli investitori che sono rimasti hanno recuperato tutto — e poi hanno guadagnato di più."
        ),
        stats: [
          { label:t("$10k in S&P 500 in 1980 — stayed invested","$10k nell'S&P 500 nel 1980 — rimasto investito"), value:"~$900,000 (2023)" },
          { label:t("Same — sold during 2008 crash","Stesso — venduto durante crollo 2008"),                        value:"~$350,000 (2023)" },
          { label:t("Same — sold during 2020 crash","Stesso — venduto durante crollo 2020"),                        value:"~$650,000 (2023)" },
          { label:t("Why: missing the recovery rally","Perché: perdere il rally di recupero"),                       value:t("Most gains come right after lows","La maggior parte dei guadagni arriva dopo i minimi") },
        ],
        ctx: t("During the COVID crash (March 2020), the S&P 500 fell 34% in 33 days. It then recovered 100% in just 5 months. Investors who sold in March locked in -34%. Those who held, or bought more, doubled their money in less than a year.","Durante il crollo COVID (marzo 2020), l'S&P 500 è sceso del 34% in 33 giorni. Ha poi recuperato il 100% in soli 5 mesi. Gli investitori che hanno venduto a marzo hanno bloccato un -34%. Quelli che hanno tenuto, o comprato di più, hanno raddoppiato i loro soldi in meno di un anno."),
        insight: t("When markets fall and you feel the urge to sell: close the app, go for a walk, and remember that all-time lows have always been followed by all-time highs. Doing nothing is often the best investing decision.","Quando i mercati scendono e senti l'impulso di vendere: chiudi l'app, fai una passeggiata, e ricorda che i minimi di sempre sono sempre stati seguiti dai massimi di sempre. Non fare nulla è spesso la migliore decisione di investimento."),
      },
    ],
  };

  // ── CATEGORY 6: Building Your Financial Plan ─────────────────────────────────
  const cat6 = {
    id:"plan", icon:"🎯", color:"#8B5CF6",
    title: t("Building Your Financial Plan","Costruire il Tuo Piano Finanziario"),
    subtitle: t("Practical steps to structure your approach before investing a single euro","Passi pratici per strutturare il tuo approccio prima di investire un singolo euro"),
    lessons: [
      {
        id:36, icon:"🖥️", level:"basic" as const,
        title: t("How to Choose a Broker","Come Scegliere un Broker"),
        explanation: t(
          "A broker is the platform through which you buy and sell investments. Choosing the right one matters — fees, available markets, and regulation all differ significantly. The most important factor is regulation: only use a broker authorised by a recognised financial regulator in your country. After that, look at trading costs, minimum deposit, and the range of instruments available.",
          "Un broker è la piattaforma attraverso cui compri e vendi investimenti. Scegliere quello giusto è importante — commissioni, mercati disponibili e regolamentazione differiscono significativamente. Il fattore più importante è la regolamentazione: usa solo un broker autorizzato da un regolatore finanziario riconosciuto nel tuo paese. Poi considera i costi di trading, il deposito minimo e la gamma di strumenti disponibili."
        ),
        stats: [
          { label:t("Trading commission range","Range commissioni per operazione"),    value:"€0–€5 per trade" },
          { label:t("Minimum deposit (typical)","Deposito minimo tipico"),             value:"€0–€500" },
          { label:t("Key regulator — Italy","Regolatore chiave — Italia"),             value:"CONSOB" },
          { label:t("Key regulator — UK","Regolatore chiave — UK"),                    value:"FCA" },
          { label:t("Key regulator — Germany","Regolatore chiave — Germania"),         value:"BaFin" },
          { label:t("Key regulator — USA","Regolatore chiave — USA"),                  value:"SEC / FINRA" },
        ],
        ctx: t(
          "Popular low-cost brokers in Europe: DEGIRO (pan-European, very low fees), Interactive Brokers (global, professional-grade), Fineco (Italy, full-service), Freetrade (UK, zero-commission). Always verify the broker's licence on your regulator's official website before depositing money.",
          "Broker a basso costo popolari in Europa: DEGIRO (paneuropeo, commissioni molto basse), Interactive Brokers (globale, livello professionale), Fineco (Italia, servizio completo), Freetrade (UK, zero commissioni). Verifica sempre la licenza del broker sul sito ufficiale del tuo regolatore prima di depositare denaro."
        ),
        insight: t(
          "The broker you choose should match your needs: a long-term ETF investor needs very different things from an active stock trader. For most beginners, a low-cost broker with access to ETFs and a clean mobile app is the ideal starting point.",
          "Il broker che scegli deve corrispondere alle tue esigenze: un investitore a lungo termine in ETF ha bisogno di cose molto diverse da un trader azionario attivo. Per la maggior parte dei principianti, un broker a basso costo con accesso agli ETF e un'app mobile pulita è il punto di partenza ideale."
        ),
      },
      {
        id:37, icon:"🥧", level:"basic" as const,
        title: t("Asset Allocation — Your Portfolio Blueprint","Asset Allocation — Il Progetto del Tuo Portafoglio"),
        explanation: t(
          "Asset allocation is the decision of how to split your money among different asset classes — stocks, bonds, cash, real estate, commodities. It is the single most important decision you will make as an investor: research consistently shows that asset allocation explains over 90% of long-term portfolio performance. Your allocation should match your risk tolerance and investment horizon.",
          "L'asset allocation è la decisione di come suddividere il denaro tra diverse classi di asset — azioni, obbligazioni, liquidità, immobiliare, materie prime. È la decisione più importante che farai come investitore: la ricerca mostra costantemente che l'asset allocation spiega oltre il 90% della performance del portafoglio a lungo termine. La tua allocazione deve corrispondere alla tua tolleranza al rischio e all'orizzonte di investimento."
        ),
        stats: [
          { label:t("100% Stocks — historical annual return","100% Azioni — rendimento annuo storico"),         value:"~10%/yr", extra:t("High volatility","Alta volatilità") },
          { label:t("80/20 (Stocks/Bonds) — historical return","80/20 (Azioni/Obbligazioni) — rendimento"),    value:"~8.5%/yr", extra:t("Medium-high volatility","Volatilità medio-alta") },
          { label:t("60/40 (Stocks/Bonds) — historical return","60/40 (Azioni/Obbligazioni) — rendimento"),    value:"~7%/yr",   extra:t("Moderate volatility","Volatilità moderata") },
          { label:t("40/60 (Stocks/Bonds) — historical return","40/60 (Azioni/Obbligazioni) — rendimento"),    value:"~5.5%/yr", extra:t("Lower volatility","Volatilità bassa") },
        ],
        ctx: t(
          "A simple starting rule: subtract your age from 110 to find your target stock percentage. Age 30 → 80% stocks, 20% bonds. Age 60 → 50% stocks, 50% bonds. Adjust based on your personal risk tolerance — this is a guide, not a law.",
          "Una regola iniziale semplice: sottrai la tua età da 110 per trovare la tua percentuale target in azioni. 30 anni → 80% azioni, 20% obbligazioni. 60 anni → 50% azioni, 50% obbligazioni. Adatta in base alla tua tolleranza personale al rischio — questa è una guida, non una legge."
        ),
        insight: t(
          "The 60/40 portfolio (60% global stocks, 40% bonds) has been the foundation of balanced investing for decades. In most historical periods it has preserved capital during crashes while capturing most of the bull market upside. It is a great starting point for most investors.",
          "Il portafoglio 60/40 (60% azioni globali, 40% obbligazioni) è stato la base dell'investimento bilanciato per decenni. Nella maggior parte dei periodi storici ha preservato il capitale durante i crolli catturando la maggior parte del rialzo dei mercati toro. È un ottimo punto di partenza per la maggior parte degli investitori."
        ),
      },
      {
        id:38, icon:"💰", level:"basic" as const,
        title: t("The 50/30/20 Rule — Budget to Invest","La Regola 50/30/20 — Budget per Investire"),
        explanation: t(
          "The 50/30/20 rule is a simple budgeting framework to free up money for investing. Allocate 50% of your take-home income to needs (rent, food, utilities, transport), 30% to wants (dining out, subscriptions, entertainment, holidays), and 20% to savings and investments. The 20% is the most important number — it is the fuel for your long-term wealth. If 20% feels impossible, start with 5–10% and increase gradually.",
          "La regola 50/30/20 è un semplice schema di budget per liberare denaro da investire. Destina il 50% del reddito netto ai bisogni (affitto, cibo, utenze, trasporti), il 30% ai desideri (ristoranti, abbonamenti, intrattenimento, vacanze) e il 20% a risparmi e investimenti. Il 20% è il numero più importante — è il carburante per la tua ricchezza a lungo termine. Se il 20% sembra impossibile, inizia con il 5–10% e aumenta gradualmente."
        ),
        stats: [
          { label:t("20% of €1,500/month invested at 8%/yr for 30yr","20% di €1.500/mese investiti all'8%/anno per 30 anni"), value:"~€272,000" },
          { label:t("20% of €2,500/month invested at 8%/yr for 30yr","20% di €2.500/mese investiti all'8%/anno per 30 anni"), value:"~€453,000" },
          { label:t("Total invested vs final value (20yr at 8%)","Totale investito vs valore finale (20 anni all'8%)"),        value:t("~2.5× your contributions","~2,5× i tuoi contributi") },
          { label:t("Starting at 25 vs 35 — same monthly amount","Iniziare a 25 vs 35 — stesso importo mensile"),              value:t("~2× more wealth at 65","~2× più ricchezza a 65 anni") },
        ],
        ctx: t(
          "Pay yourself first: as soon as your salary arrives, automatically transfer your 20% to your investment account before you have a chance to spend it. This one habit — automating the investment — is responsible for the majority of wealth built by ordinary people.",
          "Paga prima te stesso: non appena arriva lo stipendio, trasferisci automaticamente il tuo 20% sul conto di investimento prima di avere la possibilità di spenderlo. Questa singola abitudine — automatizzare l'investimento — è responsabile della maggior parte della ricchezza costruita dalle persone ordinarie."
        ),
        insight: t(
          "Investing is not about what you earn — it is about what you keep and put to work. Someone earning €2,000/month who invests consistently will almost always end up wealthier than someone earning €5,000/month who saves nothing.",
          "Investire non riguarda quanto guadagni — riguarda quanto tieni e metti al lavoro. Qualcuno che guadagna €2.000/mese e investe in modo costante finirà quasi sempre per essere più ricco di qualcuno che guadagna €5.000/mese ma non risparmia nulla."
        ),
      },
      {
        id:39, icon:"💵", level:"basic" as const,
        title: t("Dividends — Getting Paid to Hold","Dividendi — Essere Pagati per Tenere"),
        explanation: t(
          "A dividend is a portion of a company's profits distributed directly to shareholders — typically quarterly. If you own 100 shares of a company paying €2/share per year, you receive €200 annually just for holding the stock. Dividend yield is the annual dividend expressed as a percentage of the share price. Companies that have raised their dividend for 25+ consecutive years are called 'Dividend Aristocrats' — they include firms like Procter & Gamble, Johnson & Johnson, and Coca-Cola.",
          "Un dividendo è una parte degli utili di un'azienda distribuita direttamente agli azionisti — tipicamente trimestralmente. Se possiedi 100 azioni di un'azienda che paga €2/azione all'anno, ricevi €200 annui semplicemente tenendo il titolo. Il dividend yield è il dividendo annuo espresso come percentuale del prezzo dell'azione. Le aziende che hanno aumentato il dividendo per 25+ anni consecutivi si chiamano 'Dividend Aristocrats' — includono società come Procter & Gamble, Johnson & Johnson e Coca-Cola."
        ),
        stats: [
          { label:t("S&P 500 average dividend yield","Dividend yield medio S&P 500"),            value:"~1.5–2%/yr" },
          { label:t("High-dividend ETF yield (e.g. VYM)","Yield ETF alto dividendo (es. VYM)"),  value:"~3–5%/yr" },
          { label:t("Dividend Aristocrats — consecutive raises","Dividend Aristocrats — anni di aumento consecutivo"), value:"25+ years" },
          { label:t("DRIP — dividend reinvestment","DRIP — reinvestimento dividendi"),             value:t("Auto-compounds your returns","Compone automaticamente i rendimenti") },
        ],
        ctx: t(
          "Key dates to know: the ex-dividend date is the cutoff — you must own the stock before this date to receive the next dividend. The payment date is when the money arrives in your account. Many platforms offer DRIP (Dividend Reinvestment Plans) to automatically reinvest dividends into more shares.",
          "Date chiave da conoscere: la ex-dividend date è il termine — devi possedere il titolo prima di questa data per ricevere il prossimo dividendo. Il payment date è quando il denaro arriva sul tuo conto. Molte piattaforme offrono il DRIP (Piano di Reinvestimento dei Dividendi) per reinvestire automaticamente i dividendi in altre quote."
        ),
        insight: t(
          "Reinvesting dividends dramatically accelerates compounding. Historically, roughly 40% of the S&P 500's total return has come from reinvested dividends — not just price appreciation. Never ignore dividends when comparing investment returns.",
          "Reinvestire i dividendi accelera dramatically il compounding. Storicamente, circa il 40% del rendimento totale dell'S&P 500 è provenuto dai dividendi reinvestiti — non solo dall'apprezzamento del prezzo. Non ignorare mai i dividendi quando confronti i rendimenti degli investimenti."
        ),
      },
      {
        id:40, icon:"🌍", level:"intermediate" as const,
        title: t("Geographic Diversification — Go Global","Diversificazione Geografica — Vai Globale"),
        explanation: t(
          "Investing only in your home country exposes you to a single economy's cycles, political risk, and currency risk. The US stock market represents about 62% of global market capitalisation — but the other 38% (Europe, Japan, Asia, Emerging Markets) offers additional diversification and can perform very differently in any given decade. Investors who diversified globally in the 2000s benefited greatly when US stocks lagged for an entire decade.",
          "Investire solo nel tuo paese ti espone ai cicli di una singola economia, al rischio politico e al rischio di cambio. Il mercato azionario statunitense rappresenta circa il 62% della capitalizzazione di mercato globale — ma il restante 38% (Europa, Giappone, Asia, Mercati Emergenti) offre ulteriore diversificazione e può avere performance molto diverse in qualsiasi decennio. Gli investitori che si sono diversificati globalmente negli anni 2000 hanno beneficiato enormemente quando le azioni USA hanno sottoperformato per un intero decennio."
        ),
        stats: [
          { label:t("USA — share of MSCI World index","USA — quota dell'indice MSCI World"),                 value:"~62%" },
          { label:t("Europe — share of MSCI World","Europa — quota MSCI World"),                              value:"~15%" },
          { label:t("Japan — share of MSCI World","Giappone — quota MSCI World"),                            value:"~6%" },
          { label:t("Emerging Markets (MSCI EM) — avg return since 2001","Mercati Emergenti — rendimento medio dal 2001"), value:"~7–8%/yr", extra:t("Higher volatility","Maggiore volatilità") },
        ],
        ctx: t(
          "The simplest way to go global: VWCE (Vanguard All-World) or IWDA + EIMI give you exposure to over 4,000 companies across 50+ countries in just one or two ETF trades. This is the 'lazy portfolio' approach — proven effective and extremely low-maintenance.",
          "Il modo più semplice per diversificare globalmente: VWCE (Vanguard All-World) o IWDA + EIMI ti danno esposizione a oltre 4.000 aziende in 50+ paesi con solo uno o due acquisti di ETF. Questo è l'approccio del 'lazy portfolio' — dimostrato efficace e a bassissima manutenzione."
        ),
        insight: t(
          "Home bias — the tendency to over-invest in your own country — is one of the most common and costly mistakes investors make. Italy represents less than 1% of global stock market value, yet many Italian investors hold the majority of their equity in Italian stocks. Diversify globally.",
          "Il home bias — la tendenza a investire eccessivamente nel proprio paese — è uno degli errori più comuni e costosi degli investitori. L'Italia rappresenta meno dell'1% del valore del mercato azionario globale, eppure molti investitori italiani detengono la maggior parte del loro capitale in titoli italiani. Diversifica globalmente."
        ),
      },
    ],
  };

  // ── CATEGORY 7: Investor Psychology ──────────────────────────────────────────
  const cat7 = {
    id:"psychology", icon:"🧠", color:"#EC4899",
    title: t("Investor Psychology","Psicologia dell'Investitore"),
    subtitle: t("Why our brains are wired to make bad investment decisions — and how to fight back","Perché il nostro cervello è programmato per prendere cattive decisioni di investimento — e come resistere"),
    lessons: [
      {
        id:41, icon:"😰", level:"basic" as const,
        title: t("FOMO & Loss Aversion — Your Brain vs Your Portfolio","FOMO e Avversione alle Perdite — Il Tuo Cervello contro il Tuo Portafoglio"),
        explanation: t(
          "Two of the most powerful psychological forces that destroy investor returns: FOMO (Fear Of Missing Out) causes investors to buy at the peak — when an asset is all over the news and prices are already high. Loss aversion, identified by Nobel Prize winner Daniel Kahneman, shows that the pain of losing €100 feels roughly twice as intense as the pleasure of gaining €100. This causes investors to panic-sell during dips, locking in losses.",
          "Due delle forze psicologiche più potenti che distruggono i rendimenti degli investitori: la FOMO (Fear Of Missing Out) spinge gli investitori ad acquistare al picco — quando un asset è su tutti i giornali e i prezzi sono già alti. L'avversione alle perdite, identificata dal Premio Nobel Daniel Kahneman, mostra che il dolore di perdere €100 è circa due volte più intenso del piacere di guadagnare €100. Questo spinge gli investitori a vendere in preda al panico durante i cali, cristallizzando le perdite."
        ),
        stats: [
          { label:t("Loss aversion ratio (research)","Rapporto avversione alle perdite (ricerca)"), value:t("Losses feel ~2× worse than equivalent gains","Le perdite sembrano ~2× peggiori dei guadagni equivalenti") },
          { label:t("Bitcoin FOMO peak buy — Dec 2017","Acquisto FOMO picco Bitcoin — dic 2017"),     value:"$20,000", extra:t("Price fell -84% in 12 months","Prezzo sceso dell'84% in 12 mesi") },
          { label:t("GME meme stock peak — Jan 2021","Picco meme stock GME — gen 2021"),              value:"$483",   extra:t("Down -90% within months","Giù del 90% in pochi mesi") },
          { label:t("Antidote to FOMO","Antidoto alla FOMO"),                                          value:t("Automated monthly DCA — removes the urge to time","DCA mensile automatico — rimuove l'impulso di scegliere il momento") },
        ],
        ctx: t(
          "The best antidote to both FOMO and loss aversion is automation: set up a monthly automatic transfer to your investment account and let it run without looking at prices. The investor who automates and ignores noise almost always beats the one who watches the market daily.",
          "Il miglior antidoto sia alla FOMO che all'avversione alle perdite è l'automazione: imposta un trasferimento mensile automatico sul tuo conto di investimento e lascialo andare senza guardare i prezzi. L'investitore che automatizza e ignora il rumore quasi sempre supera chi guarda il mercato quotidianamente."
        ),
        insight: t(
          "Every time you feel a strong urge to buy because something is 'going up fast', or to sell because something is 'crashing' — pause. That feeling is almost always the wrong signal. The best investment decisions are usually the most boring ones.",
          "Ogni volta che senti un forte impulso di comprare perché qualcosa 'sta salendo velocemente', o di vendere perché qualcosa sta 'crollando' — fermati. Quella sensazione è quasi sempre il segnale sbagliato. Le migliori decisioni di investimento sono di solito le più noiose."
        ),
      },
      {
        id:42, icon:"⚓", level:"intermediate" as const,
        title: t("Anchoring Bias — The Price You Paid Is Irrelevant","Bias di Ancoraggio — Il Prezzo che Hai Pagato È Irrilevante"),
        explanation: t(
          "Anchoring bias is the tendency to fixate on a specific reference price — usually what you paid — and let it distort all future decisions. 'I'll sell when it gets back to €50' or 'I won't buy more until it drops to what I paid' are both anchoring traps. The market does not know or care what price you paid. The only relevant question is always: 'Where is this likely to go from its current price?' The past price is dead information.",
          "Il bias di ancoraggio è la tendenza a fissarsi su un prezzo di riferimento specifico — di solito quello che hai pagato — e a lasciare che distorca tutte le decisioni future. 'Venderò quando tornerà a €50' o 'Non comprerò altro finché non scende al prezzo che ho pagato' sono entrambe trappole di ancoraggio. Il mercato non sa e non si preoccupa di quanto hai pagato. L'unica domanda rilevante è sempre: 'Dove probabilmente andrà dal suo prezzo attuale?' Il prezzo passato è un'informazione morta."
        ),
        stats: [
          { label:t("Anchoring example: bought at €100, now €60","Esempio: comprato a €100, ora €60"),    value:t("Most investors wait for €100 again — wrong","La maggior parte aspetta €100 di nuovo — sbagliato") },
          { label:t("Correct question","Domanda corretta"),                                                value:t("'Is €60 a good entry point today?'","'È €60 un buon punto di entrata oggi?'") },
          { label:t("Average investor hold time (retail)","Tempo medio di detenzione investitore retail"), value:t("~6 months — far too short","~6 mesi — molto troppo breve") },
          { label:t("Average hold time — top 10% investors","Tempo medio detenzione — top 10% investitori"), value:t("5+ years","5+ anni") },
        ],
        ctx: t(
          "The correct way to evaluate a position you are down on: ignore your purchase price entirely. Ask instead — if I had cash today, would I buy this at the current price? If yes, hold or add. If no, sell. Your purchase price is a sunk cost that should never influence the decision.",
          "Il modo corretto per valutare una posizione in perdita: ignora completamente il tuo prezzo di acquisto. Chiediti invece — se avessi liquidità oggi, la comprerei al prezzo attuale? Se sì, tieni o aggiungi. Se no, vendi. Il tuo prezzo di acquisto è un costo sommerso che non dovrebbe mai influenzare la decisione."
        ),
        insight: t(
          "The sunk cost fallacy — continuing to hold a bad investment just because you are already down — is one of the most expensive mental errors in investing. A loss that exists on paper only becomes a real loss when you sell. But staying in a bad investment to avoid 'making the loss real' is irrational.",
          "La fallacia del costo sommerso — continuare a detenere un cattivo investimento solo perché sei già in perdita — è uno degli errori mentali più costosi negli investimenti. Una perdita che esiste solo sulla carta diventa una perdita reale solo quando vendi. Ma rimanere in un cattivo investimento per evitare di 'rendere la perdita reale' è irrazionale."
        ),
      },
      {
        id:43, icon:"🦅", level:"intermediate" as const,
        title: t("Overconfidence — The Beginner's Luck Trap","Eccessiva Sicurezza — La Trappola della Fortuna del Principiante"),
        explanation: t(
          "Overconfidence is the most well-documented bias in investing. After a few early wins — often in a bull market where nearly everything rises — many beginners dramatically overestimate their skill. The Dunning-Kruger effect describes this precisely: we tend to be most confident exactly when we know the least. A rising market makes everyone look like a genius. Bear markets then reveal who was skilled and who was just lucky.",
          "L'eccessiva sicurezza è il bias più documentato negli investimenti. Dopo alcune vittorie iniziali — spesso in un mercato toro dove quasi tutto sale — molti principianti sopravvalutano drasticamente le proprie capacità. L'effetto Dunning-Kruger descrive questo precisamente: tendiamo ad essere più sicuri esattamente quando sappiamo di meno. Un mercato in rialzo fa sembrare tutti dei geni. I mercati orso poi rivelano chi aveva abilità e chi era semplicemente fortunato."
        ),
        stats: [
          { label:t("Active retail traders who underperform S&P 500","Trader retail attivi che sottoperformano S&P 500"), value:"~75–80%" },
          { label:t("Professional fund managers beating S&P 500 over 20yr","Gestori professionisti che battono S&P 500 in 20 anni"), value:"~5%" },
          { label:t("Frequency of trading — impact on returns","Frequenza di trading — impatto sui rendimenti"),                value:t("More trading = lower returns (fees + mistakes)","Più trading = rendimenti inferiori") },
          { label:t("Best benchmark to compare yourself to","Miglior benchmark per confrontarsi"),                              value:t("A simple S&P 500 or global ETF","Un semplice ETF S&P 500 o globale") },
        ],
        ctx: t(
          "The honest test: track every trade you make for 12 months and compare your total return to a simple MSCI World ETF held for the same period. Most active investors discover they have been working very hard to underperform the index. This is one of the most humbling and valuable experiments a new investor can run.",
          "Il test onesto: traccia ogni operazione che fai per 12 mesi e confronta il rendimento totale con un semplice ETF MSCI World detenuto per lo stesso periodo. La maggior parte degli investitori attivi scopre di aver lavorato molto duramente per sottoperformare l'indice. Questo è uno degli esperimenti più umilianti e preziosi che un nuovo investitore possa fare."
        ),
        insight: t(
          "The antidote to overconfidence is a simple rule: before executing any active trade, ask yourself — 'What do I know that the millions of professional analysts, algorithms, and institutional investors who set this price do not?' If you cannot answer that clearly, the passive ETF is almost certainly the better choice.",
          "L'antidoto all'eccessiva sicurezza è una regola semplice: prima di eseguire qualsiasi operazione attiva, chiediti — 'Cosa so io che i milioni di analisti professionisti, algoritmi e investitori istituzionali che hanno fissato questo prezzo non sanno?' Se non puoi rispondere chiaramente, l'ETF passivo è quasi certamente la scelta migliore."
        ),
      },
      {
        id:44, icon:"🐑", level:"intermediate" as const,
        title: t("Herd Mentality — Why the Crowd Is Usually Wrong","Mentalità Gregge — Perché la Folla Ha di Solito Torto"),
        explanation: t(
          "Herd mentality is the instinct to follow the crowd — to buy what everyone else is buying and sell what everyone is selling. In investing, the crowd is notoriously wrong at major turning points. When everyone is excited about an asset (Bitcoin in late 2021, meme stocks in early 2021), most of the gains have already happened. When everyone is terrified and selling (March 2020, 2008), it is often the best buying opportunity in years.",
          "La mentalità del gregge è l'istinto di seguire la folla — comprare ciò che tutti stanno comprando e vendere ciò che tutti stanno vendendo. Negli investimenti, la folla ha notoriamente torto ai principali punti di svolta. Quando tutti sono entusiasti di un asset (Bitcoin fine 2021, meme stock inizio 2021), la maggior parte dei guadagni si è già verificata. Quando tutti sono terrorizzati e vendono (marzo 2020, 2008), è spesso la migliore opportunità di acquisto degli ultimi anni."
        ),
        stats: [
          { label:t("S&P 500 — best entry points historically","S&P 500 — migliori punti di entrata storici"),    value:t("Recessions & market panics","Recessioni e panici di mercato") },
          { label:t("Peak sentiment = peak price (typically)","Picco del sentiment = picco del prezzo (tipicamente)"), value:t("True in most market cycles","Vero nella maggior parte dei cicli di mercato") },
          { label:t("Retail investor inflows at market peaks","Flussi investitori retail ai picchi di mercato"),     value:t("Historically maximum","Storicamente al massimo") },
          { label:t("Retail investor outflows at market bottoms","Deflussi investitori retail ai minimi di mercato"), value:t("Historically maximum","Storicamente al massimo") },
        ],
        ctx: t(
          "Warren Buffett's most famous investing rule: 'Be fearful when others are greedy, and greedy when others are fearful.' This is harder to execute than it sounds — it requires buying when the news is terrifying and selling (or not buying more) when everyone around you is euphoric. But the data shows it is consistently rewarded over time.",
          "La regola di investimento più famosa di Warren Buffett: 'Sii timoroso quando gli altri sono avidi, e avido quando gli altri sono timorosi.' Questo è più difficile da eseguire di quanto sembri — richiede di comprare quando le notizie fanno paura e di vendere (o non comprare di più) quando tutti intorno a te sono euforici. Ma i dati mostrano che è costantemente premiato nel tempo."
        ),
        insight: t(
          "You do not need to be a contrarian to beat herd mentality. You just need to be consistent: invest the same amount every month, regardless of headlines. By definition, you will buy more when prices are low (when fear is high) and less when prices are high (when greed is high). DCA is automatic anti-herd investing.",
          "Non devi essere un contrarian per battere la mentalità del gregge. Devi solo essere costante: investi lo stesso importo ogni mese, indipendentemente dai titoli di giornale. Per definizione, comprerai di più quando i prezzi sono bassi (quando la paura è alta) e meno quando i prezzi sono alti (quando l'avidità è alta). Il DCA è il contrario automatico dell'investimento gregge."
        ),
      },
    ],
  };

  // ── CATEGORY 8: How Markets Work ─────────────────────────────────────────────
  const cat8 = {
    id:"mechanics", icon:"⚙️", color:"#14B8A6",
    title: t("How Markets Work","Come Funzionano i Mercati"),
    subtitle: t("The mechanics behind buying and selling — what actually happens when you place a trade","La meccanica dietro comprare e vendere — cosa succede davvero quando fai un'operazione"),
    lessons: [
      {
        id:45, icon:"🏛️", level:"basic" as const,
        title: t("How Stock Exchanges Work","Come Funzionano le Borse Valori"),
        explanation: t(
          "A stock exchange is a regulated marketplace where buyers and sellers trade financial instruments. The world's largest are the NYSE (New York Stock Exchange) and NASDAQ in the US, the LSE (London Stock Exchange), Euronext in Europe, and the Deutsche Börse in Germany. When you buy 10 shares through your broker, your order goes to the exchange, which matches it with a seller. Trades are settled — money and shares officially transferred — in T+2 business days (2 days after the trade).",
          "Una borsa valori è un mercato regolamentato dove compratori e venditori scambiano strumenti finanziari. Le più grandi al mondo sono il NYSE (New York Stock Exchange) e il NASDAQ negli USA, la LSE (London Stock Exchange), Euronext in Europa e la Deutsche Börse in Germania. Quando compri 10 azioni tramite il tuo broker, il tuo ordine va in borsa, che lo abbina con un venditore. Le operazioni vengono regolate — denaro e azioni ufficialmente trasferiti — in T+2 giorni lavorativi (2 giorni dopo l'operazione)."
        ),
        stats: [
          { label:t("NYSE — daily trading volume (approx.)","NYSE — volume giornaliero di trading (circa)"),  value:t("~$20–25 billion","~$20–25 miliardi") },
          { label:t("NYSE/NASDAQ market hours (ET)","NYSE/NASDAQ orari di mercato (ET)"),                     value:"9:30am–4:00pm" },
          { label:t("LSE market hours (GMT)","LSE orari di mercato (GMT)"),                                   value:"8:00am–4:30pm" },
          { label:t("Trade settlement","Regolamento operazione"),                                              value:t("T+2 business days","T+2 giorni lavorativi") },
          { label:t("Pre/after-market trading","Trading pre/dopo mercato"),                                   value:t("Available but lower liquidity","Disponibile ma liquidità minore") },
        ],
        ctx: t(
          "Market makers are firms that stand ready to buy or sell at any time, ensuring you can always execute a trade. They earn the bid-ask spread — the tiny difference between the price they buy at and the price they sell at. This is why the price you buy at (ask) is always slightly higher than the price you could sell at (bid) at any moment.",
          "I market maker sono aziende che sono sempre pronte a comprare o vendere, assicurando che tu possa sempre eseguire un'operazione. Guadagnano lo spread denaro-lettera — la piccola differenza tra il prezzo a cui comprano e quello a cui vendono. Ecco perché il prezzo a cui compri (lettera/ask) è sempre leggermente più alto del prezzo a cui potresti vendere (denaro/bid) in qualsiasi momento."
        ),
        insight: t(
          "You don't need to understand every mechanic of how exchanges work to invest successfully. But knowing that your trade takes 2 days to settle, and that pre-market prices can be misleading due to low volume, will help you avoid surprises — especially around earnings announcements or major news events.",
          "Non devi capire ogni meccanismo del funzionamento delle borse per investire con successo. Ma sapere che la tua operazione impiega 2 giorni per essere regolata, e che i prezzi pre-mercato possono essere fuorvianti per il basso volume, ti aiuterà a evitare sorprese — specialmente intorno agli annunci degli utili o agli eventi di notizie importanti."
        ),
      },
      {
        id:46, icon:"📡", level:"intermediate" as const,
        title: t("Interest Rates & Your Portfolio","Tassi di Interesse e il Tuo Portafoglio"),
        explanation: t(
          "Central banks — the Federal Reserve (USA), European Central Bank (ECB), Bank of England — set benchmark interest rates that influence the cost of borrowing across the entire economy. When rates are LOW, borrowing is cheap, companies invest aggressively, stocks tend to rise, and bonds offer low returns. When rates are HIGH, borrowing is expensive, growth slows, bonds become more attractive, and high-debt companies suffer. Understanding the rate cycle is one of the most useful macro tools for investors.",
          "Le banche centrali — Federal Reserve (USA), Banca Centrale Europea (BCE), Bank of England — fissano i tassi di interesse di riferimento che influenzano il costo del prestito in tutta l'economia. Quando i tassi sono BASSI, i prestiti sono economici, le aziende investono aggressivamente, le azioni tendono a salire e le obbligazioni offrono rendimenti bassi. Quando i tassi sono ALTI, i prestiti sono costosi, la crescita rallenta, le obbligazioni diventano più attraenti e le aziende con alto debito soffrono. Capire il ciclo dei tassi è uno degli strumenti macro più utili per gli investitori."
        ),
        stats: [
          { label:t("Fed rate rise 2022–2023 (fastest in 40yr)","Aumento tassi Fed 2022–2023 (il più rapido in 40 anni)"), value:"0% → 5.25%" },
          { label:t("S&P 500 in 2022 (high-rate shock)","S&P 500 nel 2022 (shock tassi alti)"),                           value:"-19.4%" },
          { label:t("Bonds in 2022 (inverse rate effect)","Obbligazioni nel 2022 (effetto inverso dei tassi)"),           value:"-13% to -17%" },
          { label:t("When rates fall — sectors that benefit","Quando i tassi scendono — settori che beneficiano"),         value:t("Tech, growth, REITs, utilities","Tech, crescita, REIT, utilities") },
          { label:t("When rates rise — sectors that benefit","Quando i tassi salgono — settori che beneficiano"),         value:t("Financials, energy, commodities","Finanziari, energia, materie prime") },
        ],
        ctx: t(
          "The key relationship to memorise: bond prices and interest rates move in opposite directions. When rates rise, existing bond prices fall (because new bonds now pay more). When rates fall, bond prices rise. This is why 2022 was historically unusual — both stocks AND bonds fell simultaneously, which rarely happens.",
          "La relazione chiave da memorizzare: i prezzi delle obbligazioni e i tassi di interesse si muovono in direzioni opposte. Quando i tassi salgono, i prezzi delle obbligazioni esistenti scendono (perché le nuove obbligazioni ora pagano di più). Quando i tassi scendono, i prezzi delle obbligazioni salgono. Ecco perché il 2022 è stato storicamente insolito — sia le azioni CHE le obbligazioni sono scese simultaneamente, il che accade raramente."
        ),
        insight: t(
          "You do not need to try to predict central bank decisions — professional economists fail at this regularly. But knowing the direction of rates helps you understand why your bonds or REITs are moving. Always invest for the long run, not around rate predictions.",
          "Non devi cercare di prevedere le decisioni delle banche centrali — gli economisti professionisti falliscono regolarmente in questo. Ma conoscere la direzione dei tassi ti aiuta a capire perché le tue obbligazioni o REIT si stanno muovendo. Investi sempre nel lungo periodo, non in base alle previsioni sui tassi."
        ),
      },
      {
        id:47, icon:"🛒", level:"basic" as const,
        title: t("Market Orders, Limit Orders & Stop-Loss","Ordini di Mercato, Ordini Limite e Stop-Loss"),
        explanation: t(
          "When you buy or sell on a broker platform, you choose the type of order. A market order executes immediately at whatever the current price is — fast but no price control. A limit order executes only at your specified price or better — you might wait, or the trade might not fill, but you avoid paying more than intended. A stop-loss automatically sells if the price falls below your threshold — it is a risk management tool that limits your maximum loss.",
          "Quando compri o vendi su una piattaforma broker, scegli il tipo di ordine. Un ordine di mercato viene eseguito immediatamente al prezzo corrente — veloce ma senza controllo del prezzo. Un ordine limite viene eseguito solo al tuo prezzo specificato o migliore — potresti aspettare, o l'operazione potrebbe non completarsi, ma eviti di pagare più del previsto. Uno stop-loss vende automaticamente se il prezzo scende sotto la tua soglia — è uno strumento di gestione del rischio che limita la tua perdita massima."
        ),
        stats: [
          { label:t("Market order — speed","Ordine di mercato — velocità"),                           value:t("Instant execution","Esecuzione istantanea") },
          { label:t("Market order — price risk","Ordine di mercato — rischio prezzo"),                value:t("You get whatever price the market offers","Ottieni qualsiasi prezzo offra il mercato") },
          { label:t("Limit order — price control","Ordine limite — controllo prezzo"),                value:t("You set the maximum price to pay","Imposti il prezzo massimo da pagare") },
          { label:t("Stop-loss example","Esempio stop-loss"),                                          value:t("Buy at €50, stop-loss at €42 → max -16%","Acquisto a €50, stop-loss a €42 → max -16%") },
          { label:t("Best practice for ETFs & liquid stocks","Migliore pratica per ETF e titoli liquidi"), value:t("Limit orders during market hours","Ordini limite durante orari di mercato") },
        ],
        ctx: t(
          "For beginners buying ETFs or major stocks during normal market hours, market orders are usually fine — the bid-ask spread is tiny and execution is near the displayed price. For less liquid stocks, thinly traded ETFs, or pre/after-market trading, always use limit orders to avoid being filled at an unfavourable price.",
          "Per i principianti che acquistano ETF o titoli principali durante le normali ore di mercato, gli ordini di mercato di solito vanno bene — lo spread denaro-lettera è minimo e l'esecuzione è vicina al prezzo visualizzato. Per i titoli meno liquidi, ETF poco scambiati o per il trading pre/dopo mercato, usa sempre ordini limite per evitare di essere eseguito a un prezzo sfavorevole."
        ),
        insight: t(
          "A trailing stop-loss is an advanced version that moves up automatically as the price rises — protecting profits while letting winners run. If you hold a stock that has risen 50%, a trailing stop-loss at 15% below the current price locks in most of the gain while still giving room to grow.",
          "Uno stop-loss mobile è una versione avanzata che si sposta automaticamente verso l'alto mentre il prezzo sale — proteggendo i profitti e lasciando correre i vincitori. Se detieni un titolo che è salito del 50%, uno stop-loss mobile al 15% sotto il prezzo corrente blocca la maggior parte del guadagno lasciando ancora spazio per crescere."
        ),
      },
      {
        id:48, icon:"🌿", level:"intermediate" as const,
        title: t("ESG Investing — Values & Returns","Investimento ESG — Valori e Rendimenti"),
        explanation: t(
          "ESG stands for Environmental, Social, and Governance — a framework for evaluating companies beyond just financial performance. Environmental criteria assess climate impact, carbon footprint, and resource use. Social criteria cover labour practices, supply chain standards, and community impact. Governance criteria examine board diversity, executive compensation, and shareholder rights. ESG funds select or weight companies based on these scores. Historically, ESG funds have performed comparably to traditional funds — and some studies suggest lower volatility.",
          "ESG sta per Environmental (Ambientale), Social (Sociale) e Governance — un framework per valutare le aziende oltre le semplici performance finanziarie. I criteri ambientali valutano l'impatto climatico, l'impronta di carbonio e l'uso delle risorse. I criteri sociali coprono le pratiche lavorative, gli standard della catena di approvvigionamento e l'impatto sulla comunità. I criteri di governance esaminano la diversità del consiglio di amministrazione, la remunerazione dei dirigenti e i diritti degli azionisti. I fondi ESG selezionano o ponderano le aziende in base a questi punteggi. Storicamente, i fondi ESG hanno performato in modo comparabile ai fondi tradizionali — e alcuni studi suggeriscono una minore volatilità."
        ),
        stats: [
          { label:t("ESG fund assets globally (2024 estimate)","Asset fondi ESG globali (stima 2024)"),      value:t("~$40 trillion","~$40 trilioni") },
          { label:t("ESG vs traditional funds — 10yr return comparison","ESG vs fondi tradizionali — confronto rendimento 10 anni"), value:t("Broadly similar","Generalmente simile") },
          { label:t("ESG funds — typical expense ratio","Fondi ESG — expense ratio tipico"),                  value:"0.10–0.50%/yr" },
          { label:t("Greenwashing risk","Rischio greenwashing"),                                               value:t("High — verify third-party ratings","Alto — verifica rating di terze parti") },
        ],
        ctx: t(
          "Major ESG ETFs: iShares MSCI World SRI (SUSW), Vanguard ESG Global All Cap (V3AM), Lyxor MSCI World ESG. Beware greenwashing — some funds labelled 'ESG' still hold significant positions in oil companies or have weak exclusion criteria. Always check what the fund actually holds.",
          "Principali ETF ESG: iShares MSCI World SRI (SUSW), Vanguard ESG Global All Cap (V3AM), Lyxor MSCI World ESG. Attenzione al greenwashing — alcuni fondi etichettati 'ESG' detengono ancora posizioni significative in compagnie petrolifere o hanno criteri di esclusione deboli. Controlla sempre cosa detiene davvero il fondo."
        ),
        insight: t(
          "Companies with strong governance scores often have fewer scandals, lower regulatory risk, and more sustainable long-term business models. ESG is not charity — it can reflect genuine quality factors that reduce portfolio risk. But it is not a guarantee of outperformance either. Match your investment approach to your values — and always check the actual holdings, not just the label.",
          "Le aziende con buoni punteggi di governance hanno spesso meno scandali, minore rischio regolatorio e modelli di business più sostenibili a lungo termine. L'ESG non è beneficenza — può riflettere fattori di qualità genuini che riducono il rischio del portafoglio. Ma non è nemmeno una garanzia di sovraperformance. Adatta il tuo approccio di investimento ai tuoi valori — e controlla sempre i titoli reali detenuti, non solo l'etichetta."
        ),
      },
    ],
  };

  // ── CATEGORY 9: ETF Master Class ─────────────────────────────────────────────
  const cat9 = {
    id:"etf", icon:"🧺", color:"#F97316",
    title: t("ETF Master Class","Corso Completo sugli ETF"),
    subtitle: t("Everything a beginner needs to choose, buy and hold ETFs confidently","Tutto ciò che un principiante deve sapere per scegliere, comprare e tenere ETF con fiducia"),
    lessons: [
      {
        id:49, icon:"🧺", level:"basic" as const,
        title: t("What Is an ETF — Really?","Cos'è Davvero un ETF?"),
        explanation: t(
          "An ETF (Exchange-Traded Fund) is a single product that holds hundreds or thousands of assets inside it — stocks, bonds, or commodities. You buy one share and instantly own a tiny slice of everything inside. It trades on a stock exchange just like a normal share: you can buy or sell it at any moment during market hours. The price moves throughout the day, tracking the value of all the assets inside (called the Net Asset Value, or NAV). ETFs are created by asset managers like BlackRock (iShares), Vanguard, and Amundi.",
          "Un ETF (Exchange-Traded Fund) è un unico prodotto che contiene al suo interno centinaia o migliaia di asset — azioni, obbligazioni o materie prime. Compri una quota e possiedi subito una piccola fetta di tutto ciò che c'è dentro. Si scambia in borsa come una normale azione: puoi comprarlo o venderlo in qualsiasi momento durante gli orari di mercato. Il prezzo si muove durante la giornata, seguendo il valore di tutti gli asset interni (chiamato NAV, Net Asset Value). Gli ETF sono creati da gestori patrimoniali come BlackRock (iShares), Vanguard e Amundi."
        ),
        stats: [
          { label:t("Global ETF market size","Dimensione del mercato ETF globale"),          value:t("~$14 trillion (2025)","~$14 trilioni (2025)") },
          { label:t("MSCI World ETF — companies inside","ETF MSCI World — aziende all'interno"), value:"1,400+" },
          { label:t("S&P 500 ETF — companies inside","ETF S&P 500 — aziende all'interno"),    value:"500" },
          { label:t("Minimum investment (most platforms)","Investimento minimo (la maggior parte delle piattaforme)"), value:"€1–€10" },
        ],
        ctx: t(
          "When you buy IWDA (iShares Core MSCI World), you own a fraction of Apple, Microsoft, NVIDIA, LVMH, Nestlé, and 1,400+ other companies simultaneously — for a single transaction fee. That is the power of an ETF.",
          "Quando compri IWDA (iShares Core MSCI World), possiedi una frazione di Apple, Microsoft, NVIDIA, LVMH, Nestlé e altre 1.400+ aziende simultaneamente — con una sola commissione di transazione. Questo è il potere di un ETF."
        ),
        insight: t(
          "The difference between an ETF and a mutual fund is that mutual funds are priced once a day after market close and often have higher fees. ETFs trade live like stocks — more flexible, more transparent, almost always cheaper.",
          "La differenza tra un ETF e un fondo comune è che i fondi comuni vengono prezzati una volta al giorno dopo la chiusura del mercato e hanno spesso commissioni più alte. Gli ETF si scambiano in tempo reale come le azioni — più flessibili, più trasparenti, quasi sempre più economici."
        ),
      },
      {
        id:50, icon:"🔄", level:"basic" as const,
        title: t("Accumulating vs Distributing","Accumulazione vs Distribuzione"),
        explanation: t(
          "Every ETF has a policy on what to do with dividends paid by the companies inside it. Accumulating (Acc) ETFs automatically reinvest dividends back into the fund — your number of shares stays the same but each share becomes worth more. Distributing (Dist) ETFs pay dividends out to you as cash, usually every quarter or year. For long-term growth, Accumulating is almost always better: you avoid the hassle of reinvesting manually, and in many European countries dividends are taxed when paid out, so delaying that tax is an advantage.",
          "Ogni ETF ha una politica su cosa fare con i dividendi pagati dalle aziende al suo interno. Gli ETF ad Accumulazione (Acc) reinvestono automaticamente i dividendi nel fondo — il tuo numero di quote rimane lo stesso ma ogni quota vale di più. Gli ETF a Distribuzione (Dist) ti pagano i dividendi in contanti, di solito ogni trimestre o anno. Per la crescita a lungo termine, l'Accumulazione è quasi sempre migliore: eviti il fastidio di reinvestire manualmente, e in molti paesi europei i dividendi vengono tassati quando pagati, quindi ritardare quella tassazione è un vantaggio."
        ),
        stats: [
          { label:t("VWCE (Acc) — Vanguard FTSE All-World","VWCE (Acc) — Vanguard FTSE All-World"),  value:t("Accumulating","Accumulante"),  extra:"ISIN: IE00B3RBWM25" },
          { label:t("VWRL (Dist) — same index, pays dividends","VWRL (Dist) — stesso indice, paga dividendi"), value:t("Distributing","Distribuente"), extra:"ISIN: IE00B3RBWM25" },
          { label:t("Typical dividend yield — MSCI World","Rendimento da dividendi tipico — MSCI World"), value:"~1.5–2.0%/yr" },
          { label:t("Acc compound advantage over 20 years","Vantaggio composto Acc su 20 anni"),         value:t("~15–20% more wealth","~15–20% in più di patrimonio"), extra:t("no tax drag","senza trascinamento fiscale") },
        ],
        ctx: t(
          "For beginners building wealth over the long term: choose Accumulating. The ticker will usually end in 'C' (for accumulating) or have 'Acc' in the name. On JustETF, filter by 'Use of Income: Accumulating' to see only Acc ETFs.",
          "Per i principianti che costruiscono ricchezza a lungo termine: scegli Accumulazione. Il ticker di solito termina con 'C' (per accumulante) o ha 'Acc' nel nome. Su JustETF, filtra per 'Use of Income: Accumulating' per vedere solo gli ETF Acc."
        ),
        insight: t(
          "The only time Distributing makes sense for beginners is if you want to use dividend income to cover living expenses in retirement. Before that point, Accumulating always wins on a pure wealth-building basis.",
          "L'unico momento in cui la Distribuzione ha senso per i principianti è se vuoi usare il reddito da dividendi per coprire le spese di vita in pensione. Prima di quel momento, l'Accumulazione vince sempre in termini di costruzione del patrimonio."
        ),
      },
      {
        id:51, icon:"⚙️", level:"intermediate" as const,
        title: t("Physical vs Synthetic Replication","Replica Fisica vs Sintetica"),
        explanation: t(
          "How does an ETF actually track its index? There are two methods. Physical replication: the ETF buys the actual stocks in the index. Full replication means buying all of them (used for S&P 500 — only 500 stocks). Sampling means buying a representative subset (used for MSCI World — 1,400+ stocks would be costly to hold all). Synthetic replication: instead of buying stocks, the ETF enters a swap agreement with a bank, which promises to pay the exact index return. This avoids the cost of buying individual stocks but adds counterparty risk (the bank could default). For most beginners: stick to Physical ETFs. They are simpler, more transparent, and have no counterparty risk.",
          "Come fa un ETF a tracciare effettivamente il suo indice? Ci sono due metodi. Replica Fisica: l'ETF compra le azioni reali dell'indice. La replica completa significa comprare tutte le azioni (usata per S&P 500 — solo 500 azioni). Il campionamento significa comprare un sottoinsieme rappresentativo (usato per MSCI World — comprare tutte le 1.400+ azioni sarebbe costoso). Replica Sintetica: invece di comprare azioni, l'ETF stipula un contratto swap con una banca, che promette di pagare esattamente il rendimento dell'indice. Questo evita il costo di comprare singole azioni ma aggiunge rischio di controparte (la banca potrebbe fallire). Per la maggior parte dei principianti: attieniti agli ETF Fisici. Sono più semplici, più trasparenti e non hanno rischio di controparte."
        ),
        stats: [
          { label:t("Physical Full — example","Fisica Completa — esempio"),   value:"iShares Core S&P 500 (CSPX)",      extra:t("Buys all 500 stocks","Compra tutte le 500 azioni") },
          { label:t("Physical Sampling — example","Fisica a Campionamento — esempio"), value:"iShares Core MSCI World (IWDA)", extra:t("Buys ~1,400 of 1,600 stocks","Compra ~1.400 su 1.600 azioni") },
          { label:t("Synthetic — example","Sintetica — esempio"),               value:"Invesco MSCI World (MXWD)",         extra:t("Swap-based","Basata su swap") },
          { label:t("Counterparty risk limit (UCITS rules)","Limite rischio controparte (regole UCITS)"), value:"max 10% of NAV" },
        ],
        ctx: t(
          "On JustETF, look for the 'Replication' field. You will see: 'Physical (Full)' or 'Physical (Sampling)' — both are safe. 'Synthetic (Swap-based)' carries additional counterparty risk. Most popular beginner ETFs use physical replication.",
          "Su JustETF, cerca il campo 'Replication'. Vedrai: 'Physical (Full)' o 'Physical (Sampling)' — entrambi sono sicuri. 'Synthetic (Swap-based)' comporta un rischio di controparte aggiuntivo. La maggior parte degli ETF popolari per principianti usa la replica fisica."
        ),
        insight: t(
          "Securities lending is common in physical ETFs — the fund lends its stocks to short-sellers and earns a small fee, which helps reduce the effective cost. This is safe (lending is collateralised) and is disclosed in the fund prospectus.",
          "Il prestito titoli è comune negli ETF fisici — il fondo presta le sue azioni agli short-seller e guadagna una piccola commissione, che aiuta a ridurre il costo effettivo. Questo è sicuro (il prestito è garantito da collaterale) ed è indicato nel prospetto del fondo."
        ),
      },
      {
        id:52, icon:"💸", level:"basic" as const,
        title: t("TER — The True Cost of Your ETF","TER — Il Costo Vero del Tuo ETF"),
        explanation: t(
          "The TER (Total Expense Ratio) is the annual fee charged by the ETF to cover management, administration, and regulatory costs. It is deducted automatically from the fund's NAV — you never pay it directly, but it quietly reduces your returns every year. A 0.20% TER on a €10,000 investment costs you €20 per year. That sounds tiny, but over 30 years of compounding it can cost you tens of thousands of euros compared to a 0.03% alternative. On JustETF every ETF shows its TER prominently. Always compare TERs between ETFs tracking the same index before choosing.",
          "Il TER (Total Expense Ratio) è la commissione annuale addebitata dall'ETF per coprire i costi di gestione, amministrazione e regolamentazione. Viene detratto automaticamente dal NAV del fondo — non lo paghi mai direttamente, ma riduce silenziosamente i tuoi rendimenti ogni anno. Un TER dello 0,20% su un investimento di €10.000 ti costa €20 all'anno. Sembra minuscolo, ma su 30 anni di capitalizzazione può costarti decine di migliaia di euro rispetto a un'alternativa allo 0,03%. Su JustETF ogni ETF mostra il suo TER in modo prominente. Confronta sempre i TER tra ETF che tracciano lo stesso indice prima di scegliere."
        ),
        stats: [
          { label:"iShares Core S&P 500 (CSPX)", value:"0.07%/yr",  extra:t("€7/yr on €10,000","€7/anno su €10.000") },
          { label:"Vanguard FTSE All-World (VWCE)", value:"0.22%/yr", extra:t("€22/yr on €10,000","€22/anno su €10.000") },
          { label:"iShares Core MSCI World (IWDA)", value:"0.20%/yr", extra:t("€20/yr on €10,000","€20/anno su €10.000") },
          { label:t("Actively managed fund — typical TER","Fondo a gestione attiva — TER tipico"), value:"1.00–2.00%/yr", extra:t("10–100x more expensive","10–100x più costoso") },
          { label:t("Difference on €10,000 over 30 years (0.07% vs 1.5%)","Differenza su €10.000 in 30 anni (0,07% vs 1,5%)"), value:t("~€35,000 in lost returns","~€35.000 in rendimenti persi") },
        ],
        ctx: t(
          "TER is not the only cost. Your broker charges a transaction fee each time you buy. Also check the 'Tracking Difference' (next lesson) — it is a more accurate measure of total real cost than TER alone.",
          "Il TER non è l'unico costo. Il tuo broker addebita una commissione di transazione ogni volta che compri. Controlla anche la 'Tracking Difference' (prossima lezione) — è una misura più accurata del costo reale totale rispetto al solo TER."
        ),
        insight: t(
          "Low TER is one of the best predictors of long-term ETF performance. The single most impactful decision you can make as a beginner investor is choosing low-cost index ETFs over high-cost active funds.",
          "Un TER basso è uno dei migliori predittori della performance a lungo termine degli ETF. La decisione più impattante che puoi prendere come investitore principiante è scegliere ETF indicizzati a basso costo invece di fondi attivi ad alto costo."
        ),
      },
      {
        id:53, icon:"🏦", level:"basic" as const,
        title: t("Fund Size (AUM) — Why It Matters","Dimensione del Fondo (AUM) — Perché Conta"),
        explanation: t(
          "AUM (Assets Under Management) is the total money invested in an ETF. A larger fund is almost always better for individual investors. Why? First, fund closure risk: ETF providers close funds that are too small to be profitable (typically under €50–100M). If your ETF closes, you are forced to sell — possibly at a bad time. Second, liquidity: large ETFs have many buyers and sellers, so you can always trade at a fair price with a tight bid-ask spread. Third, cost: larger funds spread fixed costs over more assets, sometimes resulting in a lower effective cost than the stated TER.",
          "L'AUM (Assets Under Management) è il totale del denaro investito in un ETF. Un fondo più grande è quasi sempre migliore per gli investitori individuali. Perché? Primo, rischio di chiusura del fondo: i provider di ETF chiudono i fondi troppo piccoli per essere redditizi (tipicamente sotto €50–100M). Se il tuo ETF chiude, sei costretto a vendere — possibilmente in un momento sfavorevole. Secondo, liquidità: gli ETF grandi hanno molti compratori e venditori, quindi puoi sempre scambiare a un prezzo equo con uno spread bid-ask ridotto. Terzo, costo: i fondi più grandi distribuiscono i costi fissi su più asset, a volte risultando in un costo effettivo inferiore al TER dichiarato."
        ),
        stats: [
          { label:"iShares Core MSCI World (IWDA) — AUM",     value:t("~€70 billion","~€70 miliardi"),  extra:t("No closure risk","Nessun rischio di chiusura") },
          { label:"Vanguard FTSE All-World (VWCE) — AUM",    value:t("~€50 billion","~€50 miliardi"),  extra:t("No closure risk","Nessun rischio di chiusura") },
          { label:t("Minimum safe AUM threshold","Soglia AUM minima sicura"),                        value:t("€100M+","€100M+"),               extra:t("Personal guideline","Linea guida personale") },
          { label:t("ETFs closed in 2023–2024 (EU)","ETF chiusi nel 2023–2024 (UE)"),              value:t("~200/yr","~200/anno"),             extra:t("Mostly small ETFs","Principalmente ETF piccoli") },
        ],
        ctx: t(
          "On JustETF, the fund size is shown in the header of every ETF page. Sort results by 'Fund size' when comparing ETFs on the same index — pick the largest unless the TER difference is very significant.",
          "Su JustETF, la dimensione del fondo è mostrata nell'intestazione di ogni pagina ETF. Ordina i risultati per 'Fund size' quando confronti ETF sullo stesso indice — scegli il più grande a meno che la differenza di TER non sia molto significativa."
        ),
        insight: t(
          "Bigger is not always better in investing — but for ETFs, a large, liquid fund with millions of investors is a strong signal of trustworthiness and operational stability.",
          "Più grande non è sempre meglio negli investimenti — ma per gli ETF, un fondo grande e liquido con milioni di investitori è un forte segnale di affidabilità e stabilità operativa."
        ),
      },
      {
        id:54, icon:"📏", level:"intermediate" as const,
        title: t("Tracking Difference — The Real Cost","Tracking Difference — Il Costo Reale"),
        explanation: t(
          "The TER tells you what the manager charges. The Tracking Difference (TD) tells you the actual difference between what the ETF returned and what the underlying index returned over a full year. It includes TER plus any friction from trading, taxes on dividends, and income from securities lending. A good ETF has a TD close to zero or even negative — meaning it beat the index net of all costs, often thanks to securities lending income. Tracking Error is related but different: it measures how consistently the ETF tracks its index day-to-day (volatility of the difference). Low TD + low TE = excellent ETF execution.",
          "Il TER ti dice cosa addebita il gestore. La Tracking Difference (TD) ti dice la differenza effettiva tra ciò che ha reso l'ETF e ciò che ha reso l'indice sottostante nell'arco di un anno intero. Include il TER più qualsiasi attrito da trading, tasse sui dividendi e proventi dal prestito titoli. Un buon ETF ha una TD vicina a zero o addirittura negativa — il che significa che ha battuto l'indice al netto di tutti i costi, spesso grazie ai proventi del prestito titoli. Il Tracking Error è correlato ma diverso: misura quanto costantemente l'ETF segue il suo indice giorno per giorno (volatilità della differenza). TD bassa + TE bassa = eccellente esecuzione dell'ETF."
        ),
        stats: [
          { label:t("iShares Core S&P 500 — typical TD","iShares Core S&P 500 — TD tipica"),         value:t("~-0.02%/yr","~-0,02%/anno"),  extra:t("Beats the index","Batte l'indice") },
          { label:t("iShares Core MSCI World — typical TD","iShares Core MSCI World — TD tipica"),    value:t("~+0.10%/yr","~+0,10%/anno"),  extra:t("Slightly lags","Leggermente indietro") },
          { label:t("Good TD range","Range TD buono"),                                                 value:t("-0.10% to +0.20%","da -0,10% a +0,20%") },
          { label:t("Where to find TD data","Dove trovare i dati TD"),                                value:"JustETF.com",                    extra:t("'Tracking Difference' tab","tab 'Tracking Difference'") },
        ],
        ctx: t(
          "On JustETF, click any ETF → go to the 'Tracking Difference' tab. You will see 1Y, 3Y, 5Y tracking difference vs the benchmark. Always check 3Y or 5Y for reliability — a single year can be an outlier.",
          "Su JustETF, clicca su qualsiasi ETF → vai alla scheda 'Tracking Difference'. Vedrai la tracking difference a 1A, 3A, 5A rispetto al benchmark. Controlla sempre 3A o 5A per affidabilità — un singolo anno può essere un valore anomalo."
        ),
        insight: t(
          "If two ETFs track the same index and have similar AUM, always pick the one with the better (lower) tracking difference — not just the lower TER. The TD is the single most honest number about an ETF's real-world cost.",
          "Se due ETF tracciano lo stesso indice e hanno AUM simile, scegli sempre quello con la migliore (inferiore) tracking difference — non solo il TER più basso. La TD è il numero più onesto sulla realtà dei costi di un ETF."
        ),
      },
      {
        id:55, icon:"🗺️", level:"basic" as const,
        title: t("The Main Indexes Explained","I Principali Indici Spiegati"),
        explanation: t(
          "An index is a ruleset that defines which companies are included and how much weight each one gets. ETFs track indexes — they do not pick stocks themselves. The most important indexes for beginner investors are: MSCI World (1,400+ large/mid-cap companies from 23 developed countries — ~70% US), S&P 500 (500 largest US companies — the most studied index in history), MSCI ACWI (MSCI World + Emerging Markets — truly global, 2,800+ companies), STOXX Europe 600 (600 large/mid-cap European companies — more EU exposure), MSCI Emerging Markets (25 developing countries: China, India, Brazil, Taiwan, Korea).",
          "Un indice è un insieme di regole che definisce quali aziende sono incluse e quanto peso ha ciascuna. Gli ETF tracciano gli indici — non selezionano azioni da soli. Gli indici più importanti per gli investitori principianti sono: MSCI World (1.400+ aziende large/mid-cap da 23 paesi sviluppati — ~70% USA), S&P 500 (500 più grandi aziende USA — l'indice più studiato della storia), MSCI ACWI (MSCI World + Mercati Emergenti — veramente globale, 2.800+ aziende), STOXX Europe 600 (600 aziende large/mid-cap europee — maggiore esposizione UE), MSCI Emerging Markets (25 paesi in via di sviluppo: Cina, India, Brasile, Taiwan, Corea)."
        ),
        stats: [
          { label:"MSCI World",              value:t("1,400+ companies","1.400+ aziende"),  extra:t("23 developed countries, ~70% US","23 paesi sviluppati, ~70% USA") },
          { label:"S&P 500",                 value:t("500 companies","500 aziende"),         extra:t("US only","Solo USA") },
          { label:"MSCI ACWI",               value:t("2,800+ companies","2.800+ aziende"),  extra:t("Developed + Emerging","Sviluppati + Emergenti") },
          { label:"STOXX Europe 600",        value:t("600 companies","600 aziende"),         extra:t("Europe only","Solo Europa") },
          { label:"MSCI Emerging Markets",   value:t("~1,400 companies","~1.400 aziende"),  extra:t("China 30%, India 20%","Cina 30%, India 20%") },
        ],
        ctx: t(
          "For most European beginner investors, MSCI World (via IWDA or similar) or FTSE All-World (via VWCE) are the most popular starting points. They give you instant global diversification in a single product.",
          "Per la maggior parte degli investitori principianti europei, MSCI World (tramite IWDA o simili) o FTSE All-World (tramite VWCE) sono i punti di partenza più popolari. Ti danno un'istantanea diversificazione globale in un unico prodotto."
        ),
        insight: t(
          "There is no 'best' index. MSCI World has 30 years of strong performance but is 70% US-concentrated. MSCI ACWI adds EM exposure for more true diversification but with more volatility. Pick based on how comfortable you are with US concentration risk.",
          "Non esiste un indice 'migliore'. MSCI World ha 30 anni di buone performance ma è concentrato al 70% sugli USA. MSCI ACWI aggiunge esposizione agli EM per una diversificazione più vera ma con maggiore volatilità. Scegli in base a quanto ti senti a tuo agio con il rischio di concentrazione USA."
        ),
      },
      {
        id:56, icon:"🔍", level:"basic" as const,
        title: t("How to Choose an ETF — Step by Step","Come Scegliere un ETF — Passo per Passo"),
        explanation: t(
          "Step 1 — Pick your index: decide what you want exposure to (global stocks? US only? Europe?). Step 2 — Choose Accumulating (for long-term growth) or Distributing (for income). Step 3 — Filter by replication: prefer Physical. Step 4 — Compare TER between ETFs on the same index: choose the lowest. Step 5 — Check AUM: avoid anything under €100M. Step 6 — Check Tracking Difference on JustETF: prefer ETFs with TD below +0.20%. Step 7 — Check your broker's fee: a cheap ETF on an expensive broker can still cost more than a slightly pricier ETF on a cheap broker.",
          "Passo 1 — Scegli il tuo indice: decidi a cosa vuoi essere esposto (azioni globali? Solo USA? Europa?). Passo 2 — Scegli Accumulazione (per la crescita a lungo termine) o Distribuzione (per il reddito). Passo 3 — Filtra per replica: preferisci Fisica. Passo 4 — Confronta il TER tra ETF sullo stesso indice: scegli il più basso. Passo 5 — Controlla l'AUM: evita tutto ciò che è sotto €100M. Passo 6 — Controlla la Tracking Difference su JustETF: preferisci ETF con TD sotto +0,20%. Passo 7 — Controlla le commissioni del tuo broker: un ETF economico su un broker costoso può comunque costare di più di un ETF leggermente più caro su un broker economico."
        ),
        stats: [
          { label:t("Step 1","Passo 1"), value:t("Choose index","Scegli indice"),           extra:t("MSCI World / S&P 500 / ACWI","MSCI World / S&P 500 / ACWI") },
          { label:t("Step 2","Passo 2"), value:t("Acc or Dist?","Acc o Dist?"),              extra:t("Acc for long-term","Acc per lungo termine") },
          { label:t("Step 3","Passo 3"), value:t("Physical replication","Replica fisica"),   extra:t("Avoid synthetic","Evita sintetica") },
          { label:t("Step 4","Passo 4"), value:t("Compare TER","Confronta TER"),             extra:t("Lower is better","Più basso è meglio") },
          { label:t("Step 5","Passo 5"), value:t("AUM > €100M","AUM > €100M"),               extra:t("Avoid closure risk","Evita rischio chiusura") },
          { label:t("Step 6","Passo 6"), value:t("Check Tracking Difference","Controlla Tracking Difference"), extra:"JustETF.com" },
        ],
        ctx: t(
          "JustETF.com is the best free tool for this process in Europe. Use the ETF screener: filter by index → use of income → replication → sort by TER. Then click each result to check AUM and Tracking Difference.",
          "JustETF.com è il miglior strumento gratuito per questo processo in Europa. Usa lo screener ETF: filtra per indice → utilizzo del reddito → replica → ordina per TER. Poi clicca su ogni risultato per controllare AUM e Tracking Difference."
        ),
        insight: t(
          "The perfect ETF search takes 15 minutes. The impact of choosing well lasts 30 years. Never rush this decision — but also don't let paralysis by analysis prevent you from starting. A good enough ETF bought today beats a perfect ETF bought never.",
          "La ricerca dell'ETF perfetto richiede 15 minuti. L'impatto di una buona scelta dura 30 anni. Non affrettare mai questa decisione — ma non lasciare che la paralisi da analisi ti impedisca di iniziare. Un ETF abbastanza buono comprato oggi batte un ETF perfetto non mai comprato."
        ),
      },
      {
        id:57, icon:"⭐", level:"basic" as const,
        title: t("The Best ETFs for Beginners","I Migliori ETF per Principianti"),
        explanation: t(
          "These are the most popular and trusted ETFs among European beginner investors. They are not the only options — but they are battle-tested, liquid, and from reputable managers. For global diversification: VWCE (Vanguard FTSE All-World, Acc, TER 0.22%) or IWDA (iShares Core MSCI World, Acc, TER 0.20%). For US-only: CSPX (iShares Core S&P 500, Acc, TER 0.07%). For Europe: EXV1 or MEUD (STOXX Europe 600, TER 0.20%). For Emerging Markets only: EIMI (iShares Core MSCI EM, Acc, TER 0.18%). A common beginner portfolio: 80% IWDA + 20% EIMI (gives you global developed + emerging exposure at low cost).",
          "Questi sono gli ETF più popolari e affidabili tra gli investitori principianti europei. Non sono le uniche opzioni — ma sono collaudati, liquidi e di gestori affidabili. Per diversificazione globale: VWCE (Vanguard FTSE All-World, Acc, TER 0,22%) o IWDA (iShares Core MSCI World, Acc, TER 0,20%). Solo USA: CSPX (iShares Core S&P 500, Acc, TER 0,07%). Solo Europa: EXV1 o MEUD (STOXX Europe 600, TER 0,20%). Solo Mercati Emergenti: EIMI (iShares Core MSCI EM, Acc, TER 0,18%). Un portafoglio principiante comune: 80% IWDA + 20% EIMI (ti dà esposizione globale sviluppata + emergente a basso costo)."
        ),
        stats: [
          { label:"VWCE — Vanguard FTSE All-World Acc",  value:"TER 0.22%", extra:t("€50B+ AUM · Global","€50B+ AUM · Globale") },
          { label:"IWDA — iShares Core MSCI World Acc",  value:"TER 0.20%", extra:t("€70B+ AUM · Developed","€70B+ AUM · Sviluppati") },
          { label:"CSPX — iShares Core S&P 500 Acc",     value:"TER 0.07%", extra:t("€50B+ AUM · US only","€50B+ AUM · Solo USA") },
          { label:"EIMI — iShares Core MSCI EM Acc",     value:"TER 0.18%", extra:t("€20B+ AUM · Emerging","€20B+ AUM · Emergenti") },
          { label:"MEUD — Amundi STOXX Europe 600 Acc",  value:"TER 0.07%", extra:t("€3B+ AUM · Europe","€3B+ AUM · Europa") },
        ],
        ctx: (() => {
          if (noPort) return t("Add holdings to see if you already own any of these ETFs.","Aggiungi titoli per vedere se possiedi già uno di questi ETF.");
          const etfTickers = ["VWCE","IWDA","CSPX","EIMI","MEUD","EXV1","SWDA","VOO","SPY","QQQ","VWRL"];
          const held = enriched.filter(h => etfTickers.includes(h.ticker.toUpperCase()));
          if (held.length === 0) return t("You don't currently hold any of the benchmark ETFs. Consider using JustETF to compare options before your next purchase.","Non possiedi attualmente nessuno degli ETF di riferimento. Considera di usare JustETF per confrontare le opzioni prima del tuo prossimo acquisto.");
          return <span>{t("You hold","Possiedi")} {held.map((h,i)=><strong key={h.ticker} style={{color:"#F97316"}}>{h.ticker}{i<held.length-1?", ":""}</strong>)} — {t("great choice for a beginner-friendly, diversified foundation.","ottima scelta per una base diversificata adatta ai principianti.")}</span>;
        })(),
        insight: t(
          "VWCE vs IWDA+EIMI: VWCE includes emerging markets automatically (10% weight), making it a true 'one ETF' solution. IWDA+EIMI gives you more control over your EM allocation. Both are excellent. Pick VWCE if you want simplicity; pick IWDA+EIMI if you want to customise your EM exposure.",
          "VWCE vs IWDA+EIMI: VWCE include automaticamente i mercati emergenti (peso 10%), rendendolo una vera soluzione 'un ETF solo'. IWDA+EIMI ti dà più controllo sulla tua allocazione EM. Entrambi sono eccellenti. Scegli VWCE se vuoi semplicità; scegli IWDA+EIMI se vuoi personalizzare la tua esposizione agli EM."
        ),
      },
      {
        id:58, icon:"⚠️", level:"intermediate" as const,
        title: t("Common ETF Mistakes to Avoid","Errori Comuni sugli ETF da Evitare"),
        explanation: t(
          "Even simple ETF investing has traps. The most common: (1) Overtrading — checking prices daily and selling on dips destroys the compound effect. ETFs reward patience, not activity. (2) Chasing past performance — last year's best ETF is rarely next year's winner. Stick to broad indexes. (3) Buying too many ETFs — owning IWDA, SWDA, VWCE, and SPY is not more diversification; they all hold the same US mega-caps. One or two good ETFs is enough. (4) Ignoring currency risk — a USD-denominated ETF listed in EUR still holds USD assets; currency moves affect returns. (5) Confusing ETF and ETC — ETCs (Exchange-Traded Commodities) track single commodities like gold or oil. They work differently and carry more risk.",
          "Anche l'investimento semplice in ETF ha delle trappole. Le più comuni: (1) Overtrading — controllare i prezzi ogni giorno e vendere ai cali distrugge l'effetto composto. Gli ETF premiano la pazienza, non l'attività. (2) Inseguire le performance passate — il miglior ETF dell'anno scorso raramente è il vincitore dell'anno prossimo. Attieniti agli indici ampi. (3) Comprare troppi ETF — possedere IWDA, SWDA, VWCE e SPY non è maggiore diversificazione; contengono tutti gli stessi mega-cap USA. Uno o due buoni ETF è sufficiente. (4) Ignorare il rischio valutario — un ETF denominato in USD quotato in EUR detiene comunque asset in USD; i movimenti valutari influenzano i rendimenti. (5) Confondere ETF ed ETC — gli ETC (Exchange-Traded Commodities) tracciano singole materie prime come l'oro o il petrolio. Funzionano diversamente e comportano più rischio."
        ),
        stats: [
          { label:t("Overtrading impact","Impatto dell'overtrading"),          value:t("Can halve long-term returns","Può dimezzare i rendimenti a lungo termine"), extra:t("taxes + fees + bad timing","tasse + commissioni + tempismo sbagliato") },
          { label:t("IWDA + SWDA overlap","Sovrapposizione IWDA + SWDA"),     value:"~99%",  extra:t("Same index, different names","Stesso indice, nomi diversi") },
          { label:t("Currency impact (EUR/USD, 1-yr range)","Impatto valutario (EUR/USD, range 1 anno)"), value:"±10–15%", extra:t("Can add or reduce returns","Può aggiungere o ridurre i rendimenti") },
          { label:t("ETC vs ETF — key difference","ETC vs ETF — differenza chiave"),        value:t("ETC = single commodity","ETC = singola materia prima"), extra:t("No diversification","Nessuna diversificazione") },
        ],
        ctx: t(
          "Before buying any new ETF, check on JustETF how much it overlaps with what you already own. Use the 'ETF comparison' tool — enter your current ETF and the new one you are considering. If overlap is above 80%, you are not adding real diversification.",
          "Prima di acquistare qualsiasi nuovo ETF, controlla su JustETF quanto si sovrappone con quello che possiedi già. Usa lo strumento 'ETF comparison' — inserisci il tuo ETF attuale e quello nuovo che stai considerando. Se la sovrapposizione supera l'80%, non stai aggiungendo vera diversificazione."
        ),
        insight: t(
          "The best ETF strategy for most beginners: pick one global ETF (VWCE or IWDA+EIMI), invest a fixed amount every month regardless of market conditions (DCA), and do not touch it for 15–20 years. That is it. Complexity is the enemy of execution.",
          "La migliore strategia ETF per la maggior parte dei principianti: scegli un ETF globale (VWCE o IWDA+EIMI), investi un importo fisso ogni mese indipendentemente dalle condizioni di mercato (DCA), e non toccarlo per 15–20 anni. Questo è tutto. La complessità è il nemico dell'esecuzione."
        ),
      },
    ],
  };

  // ── CATEGORY 10: Stock Picking & Valuation ──────────────────────────────────
  const cat10 = {
    id:"valuation", icon:"🔍", color:"#10B981",
    title: t("Stock Picking & Valuation","Stock Picking e Valutazione"),
    subtitle: t("How to estimate what a company is actually worth — the methods pros use","Come stimare il valore reale di un'azienda — i metodi dei professionisti"),
    lessons: [
      {
        id:60, icon:"🎯", level:"intermediate" as const,
        title: t("Stock Picking vs. Index Investing","Stock Picking vs. Investimento Indicizzato"),
        explanation: t(
          "Stock picking means choosing individual companies to invest in — instead of buying the whole market via an index ETF. It can be rewarding if you're right, but studies show that over 80% of professional fund managers fail to beat a simple S&P 500 index fund over 10 years. They have Bloomberg terminals, PhDs, and full-time research teams — and still lose. Does that mean stock picking is pointless? No — but it should be done with clear analysis, not gut feelings or tips from social media.",
          "Il stock picking significa scegliere singole aziende in cui investire — invece di comprare l'intero mercato tramite un ETF indice. Può essere gratificante se hai ragione, ma gli studi mostrano che oltre l'80% dei gestori professionisti non batte un semplice fondo indice S&P 500 in 10 anni. Hanno terminali Bloomberg, dottorati e team di ricerca a tempo pieno — e perdono comunque. Significa che il stock picking è inutile? No — ma va fatto con analisi chiara, non istinto o consigli dai social."
        ),
        stats: [
          { label:t("Active managers beating S&P 500 over 10yr","Gestori attivi che battono S&P 500 in 10 anni"), value:"~20%", extra:t("SPIVA 2024","SPIVA 2024") },
          { label:t("Active managers beating S&P 500 over 20yr","Gestori attivi che battono S&P 500 in 20 anni"), value:"~5%" },
          { label:t("Minimum stocks for basic diversification","Titoli minimi per diversificazione base"), value:t("10–20 stocks","10–20 titoli") },
          { label:t("Best approach for most investors","Approccio migliore per la maggior parte degli investitori"), value:t("Core ETF + small satellite portfolio","Core ETF + piccolo satellite") },
        ],
        ctx: t(
          "Stock picking makes most sense when you have deep knowledge of a specific industry, or you identify something the market hasn't priced in yet. If neither applies, a global ETF is almost certainly the better choice. The winning hybrid: 80–90% in a global ETF (core) + 10–20% in high-conviction individual stocks (satellite).",
          "Il stock picking ha più senso quando hai profonda conoscenza di un settore specifico, o identifichi qualcosa che il mercato non ha ancora scontato. Se nessuno dei due si applica, un ETF globale è quasi certamente la scelta migliore. L'ibrido vincente: 80–90% in un ETF globale (core) + 10–20% in titoli ad alta convinzione (satellite)."
        ),
        insight: t(
          "The best approach for most investors: use ETFs as the core (80–90%) and express your research in a small satellite of individual stocks. You capture market returns on the core and only bet concentrated where you genuinely have an edge.",
          "L'approccio migliore per la maggior parte degli investitori: usa gli ETF come nucleo (80–90%) ed esprimi la tua ricerca in un piccolo satellite di titoli singoli. Catturi i rendimenti di mercato sul nucleo e scommetti in modo concentrato solo dove hai davvero un vantaggio."
        ),
      },
      {
        id:61, icon:"🏷️", level:"basic" as const,
        title: t("P/E Ratio — Your Primary Valuation Lens","Rapporto P/E — La Tua Prima Lente di Valutazione"),
        explanation: t(
          "The P/E ratio (Price ÷ Earnings per share) tells you how much you pay for each €1 of annual profit. A P/E of 15 means you pay €15 for every €1 the company earns per year. Context is everything: a tech company growing at 30%/year deserves a much higher P/E than a utility growing at 2%/year. A P/E of 50 for a company doubling profits every 3 years can be a bargain. A P/E of 10 for a company losing market share might be a value trap. Always compare within the same sector.",
          "Il rapporto P/E (Prezzo ÷ Utile per azione) dice quanto paghi per ogni €1 di profitto annuo. Un P/E di 15 significa che paghi €15 per ogni €1 che l'azienda guadagna all'anno. Il contesto è tutto: un'azienda tech che cresce al 30%/anno merita un P/E molto più alto di un'utility che cresce al 2%/anno. Un P/E di 50 per un'azienda che raddoppia i profitti ogni 3 anni può essere un affare. Un P/E di 10 per un'azienda che perde quote di mercato potrebbe essere una trappola. Confronta sempre nello stesso settore."
        ),
        stats: [
          { label:t("S&P 500 historical average P/E","P/E storico medio S&P 500"), value:"~15–17×", extra:t("since 1871","dal 1871") },
          { label:t("Tech sector typical P/E","P/E tipico settore tech"), value:"25–40×", extra:t("high growth expected","alta crescita attesa") },
          { label:t("Utilities sector typical P/E","P/E tipico utilities"), value:"12–18×", extra:t("stable but slow","stabile ma lento") },
          { label:t("P/E < 0 (negative)","P/E < 0 (negativo)"), value:t("Company losing money","Azienda in perdita"), extra:t("extra caution","cautela extra") },
        ],
        ctx: (() => {
          if (noPort || !primSig?.meta) return t("Add holdings to see a real P/E example from your portfolio.","Aggiungi titoli per vedere un esempio P/E reale dal tuo portafoglio.");
          const pe = primSig.meta.pe; const fp = primSig.meta.fairPE; const sec = primSig.meta.sector || t("this sector","questo settore");
          if (!pe || !fp) return t("Check the Analysis tab to see P/E data for your largest holding.","Controlla la scheda Analisi per vedere i dati P/E del tuo titolo più grande.");
          return <span><strong style={{color:"white"}}>{primary?.ticker}</strong> {t("trades at P/E","tratta a P/E")} <strong style={{color: pe < fp ? "#4ADE80" : "#F87171"}}>{fmt(pe,1)}×</strong> {t("vs sector fair P/E of","vs P/E equo del settore di")} <strong style={{color:"white"}}>{fmt(fp,1)}×</strong> — {pe < fp ? t("trading below sector average.","sotto la media del settore.") : t("above sector average.","sopra la media del settore.")}</span>;
        })(),
        insight: t(
          "Never compare P/Es across different sectors — it's meaningless. A bank at P/E 8 and a pharma at P/E 25 could both be fairly valued. Always compare a stock's P/E to its own sector's historical range and to direct competitors.",
          "Non confrontare mai i P/E tra settori diversi — è privo di significato. Una banca a P/E 8 e una farmaceutica a P/E 25 potrebbero entrambe essere correttamente valutate. Confronta sempre il P/E di un titolo con il range storico del suo settore e con i concorrenti diretti."
        ),
      },
      {
        id:62, icon:"📚", level:"intermediate" as const,
        title: t("Price-to-Book (P/B) — What Does the Company Own?","Prezzo/Valore Contabile (P/B) — Cosa Possiede l'Azienda?"),
        explanation: t(
          "Price-to-Book (P/B) compares a company's market value to its net assets (total assets minus total liabilities). P/B = 1 means you pay exactly what the company's books say it's worth in assets. P/B < 1 means you could theoretically buy the company for less than its assets — potentially a bargain. P/B > 3 means you're paying a large premium, justified only by strong earnings power or valuable intangibles. Banks and insurance companies are most commonly valued using P/B because their assets are mostly financial instruments.",
          "Il Prezzo/Valore Contabile (P/B) confronta il valore di mercato con i suoi asset netti (totale attività meno passività). P/B = 1 significa che paghi esattamente quello che i libri contabili dicono valga in asset. P/B < 1 significa che potresti teoricamente comprare l'azienda per meno dei suoi asset — potenzialmente un affare. P/B > 3 significa che paghi un grande premio, giustificato solo da forte potere di guadagno o intangibili preziosi. Banche e assicurazioni sono più comunemente valutate con il P/B perché i loro asset sono principalmente strumenti finanziari."
        ),
        stats: [
          { label:"P/B < 1.0", value:t("Below book value","Sotto il valore contabile"), extra:t("Potential value or distress","Potenziale valore o difficoltà") },
          { label:"P/B 1.0–2.0", value:t("Fair to moderate premium","Premio equo o moderato"), extra:t("Typical industrials","Tipico industriali") },
          { label:"P/B > 3.0", value:t("Large premium — growth must justify","Grande premio — la crescita deve giustificarlo"), extra:t("Common in tech","Comune nel tech") },
          { label:t("S&P 500 median P/B (2024)","P/B mediano S&P 500 (2024)"), value:"~3.5×" },
          { label:t("Financial sector typical P/B","P/B tipico settore finanziario"), value:"0.8–1.5×" },
        ],
        ctx: t(
          "P/B is most useful for companies with tangible assets — banks, manufacturers, property companies. For tech and software companies with huge intangible value (brand, patents, network effects), P/B is less meaningful. Apple trades at P/B > 50 — most of its value is intangible and not captured in the balance sheet.",
          "Il P/B è più utile per aziende con asset tangibili — banche, produttori, immobiliari. Per le aziende tech e software con enorme valore intangibile (brand, brevetti, effetti rete), il P/B è meno significativo. Apple tratta a P/B > 50 — la maggior parte del suo valore è intangibile e non catturato nel bilancio."
        ),
        insight: t(
          "Benjamin Graham used P/B extensively — looking for stocks below 1.5× book as a margin of safety. Today, with tech-heavy markets, pure P/B investing misses most great companies. Use it as one filter alongside P/E and earnings growth, not as the sole decision tool.",
          "Benjamin Graham usava molto il P/B — cercando titoli sotto 1,5× il valore contabile come margine di sicurezza. Oggi, con mercati dominati dal tech, il P/B puro non coglie la maggior parte delle grandi aziende. Usalo come uno dei filtri insieme al P/E e alla crescita degli utili, non come unico strumento decisionale."
        ),
      },
      {
        id:63, icon:"🧮", level:"advanced" as const,
        title: t("DCF — What Is a Company Worth?","DCF — Quanto Vale un'Azienda?"),
        explanation: t(
          "DCF (Discounted Cash Flow) is the gold standard of company valuation. The idea: a company is worth the sum of all its future cash flows, discounted back to today's value. A euro received 10 years from now is worth less than a euro today — because today's euro could be invested and grow. The discount rate (WACC) represents the risk of investing in this company. Higher risk = higher discount rate = lower present value. Vela's Analysis tab runs a simplified 5-year DCF model for your largest holding, with a downloadable Excel model.",
          "Il DCF (Discounted Cash Flow) è lo standard di riferimento per la valutazione aziendale. L'idea: un'azienda vale la somma di tutti i futuri flussi di cassa, scontati al valore attuale. Un euro ricevuto tra 10 anni vale meno di un euro oggi — perché l'euro di oggi potrebbe essere investito e crescere. Il tasso di sconto (WACC) rappresenta il rischio di investire in questa azienda. Più rischio = tasso di sconto più alto = valore attuale inferiore. La scheda Analisi di Vela esegue un modello DCF a 5 anni per il tuo titolo più grande, con un modello Excel scaricabile."
        ),
        stats: [
          { label:t("DCF formula","Formula DCF"), value:"Σ (CFₜ ÷ (1+r)ᵗ) + Terminal Value" },
          { label:t("Most sensitive input","Input più sensibile"), value:t("Revenue growth rate","Tasso di crescita dei ricavi"), extra:t("±1% changes value ~5–15%","±1% cambia il valore ~5–15%") },
          { label:t("Discount rate (WACC)","Tasso di sconto (WACC)"), value:t("Typically 8–12% for equities","Tipicamente 8–12% per azioni") },
          { label:t("Terminal growth rate","Tasso di crescita terminale"), value:t("Usually 2–3% (≈ inflation)","Di solito 2–3% (≈ inflazione)") },
        ],
        ctx: t(
          "Vela uses a simplified DCF: 3-year average revenue growth, sector-adjusted WACC (10% default), 2.5% terminal growth. The fair value shown in the Analysis tab is the result. Download the Excel export to adjust assumptions and see the full model. A 1% change in the discount rate can move the fair value by 15–25%.",
          "Vela usa un DCF semplificato: crescita media dei ricavi a 3 anni, WACC adeguato al settore (10% default), crescita terminale al 2,5%. Il valore equo mostrato nella scheda Analisi è il risultato. Scarica il modello Excel per modificare le assunzioni e vedere il modello completo. Un cambiamento dell'1% nel tasso di sconto può spostare il valore equo del 15–25%."
        ),
        insight: t(
          "DCF is powerful but highly sensitive to assumptions. Changing the growth rate by just 2% or the discount rate by 1% can shift the 'fair value' by 20–40%. This is why analysts always express DCF as a range with a bull, base, and bear scenario — never a single number.",
          "Il DCF è potente ma molto sensibile alle assunzioni. Cambiare il tasso di crescita del 2% o il tasso di sconto dell'1% può spostare il 'valore equo' del 20–40%. Ecco perché gli analisti esprimono sempre il DCF come un intervallo con scenario ottimista, base e pessimista — mai un numero singolo."
        ),
      },
      {
        id:64, icon:"📐", level:"intermediate" as const,
        title: t("The Graham Number — A Classic Safety Check","Il Graham Number — Un Classico Controllo di Sicurezza"),
        explanation: t(
          "The Graham Number is the maximum price Benjamin Graham believed an investor should pay for a stock. Formula: √(22.5 × EPS × BVPS) where EPS = Earnings Per Share and BVPS = Book Value Per Share. If the stock price is below the Graham Number, it may be undervalued. The 22.5 factor comes from Graham's rules: P/E should not exceed 15× AND P/B should not exceed 1.5× (15 × 1.5 = 22.5). Vela's Analysis tab shows the Graham Number for your largest holding.",
          "Il Graham Number è il prezzo massimo che Benjamin Graham riteneva un investitore dovesse pagare per un'azione. Formula: √(22,5 × EPS × BVPS) dove EPS = Utile per azione e BVPS = Valore contabile per azione. Se il prezzo è inferiore al Graham Number, il titolo potrebbe essere sottovalutato. Il fattore 22,5 deriva dalle regole di Graham: il P/E non deve superare 15× E il P/B non deve superare 1,5× (15 × 1,5 = 22,5). La scheda Analisi di Vela mostra il Graham Number per il tuo titolo più grande."
        ),
        stats: [
          { label:t("Graham Number formula","Formula Graham Number"), value:"√(22.5 × EPS × BVPS)" },
          { label:t("P/E component","Componente P/E"), value:t("Max 15×","Max 15×"), extra:t("Graham's fair P/E for stable earnings","P/E equo secondo Graham") },
          { label:t("P/B component","Componente P/B"), value:t("Max 1.5×","Max 1,5×"), extra:t("Margin of safety on assets","Margine di sicurezza sugli asset") },
          { label:t("Best suited for","Adatto a"), value:t("Mature, profitable companies","Aziende mature e redditizie") },
          { label:t("Weakness","Limite"), value:t("Ignores future growth","Ignora la crescita futura"), extra:t("Undervalues growth companies","Sottovaluta le aziende in crescita") },
        ],
        ctx: t(
          "The Graham Number works best for stable, asset-heavy companies — industrials, utilities, consumer staples. It systematically undervalues high-growth companies (tech, biotech) because it ignores future earnings growth potential. Use it as a floor price, not a ceiling: a stock consistently above it needs strong growth justification.",
          "Il Graham Number funziona meglio per aziende stabili e ricche di asset — industriali, utilities, beni di consumo. Sottovaluta sistematicamente le aziende ad alta crescita (tech, biotech) perché ignora il potenziale di crescita degli utili futuri. Usalo come prezzo minimo, non massimo: un titolo costantemente sopra di esso necessita di forte giustificazione di crescita."
        ),
        insight: t(
          "Graham himself said by the 1970s that many of his strict formulas needed updating for a world with intangible-heavy companies. The Graham Number is best used as one safety filter among many — particularly useful for screening undervalued industrials, banks, and value stocks.",
          "Lo stesso Graham disse negli anni '70 che molte delle sue formule rigide avevano bisogno di aggiornamenti per un mondo con aziende ricche di intangibili. Il Graham Number è meglio usato come uno dei molti filtri di sicurezza — particolarmente utile per selezionare industriali, banche e titoli value sottovalutati."
        ),
      },
      {
        id:65, icon:"🏢", level:"advanced" as const,
        title: t("EV/EBITDA — The Professional's Metric","EV/EBITDA — La Metrica dei Professionisti"),
        explanation: t(
          "EV/EBITDA (Enterprise Value ÷ Earnings Before Interest, Tax, Depreciation & Amortisation) is the preferred valuation metric of M&A professionals and private equity firms. EV = market cap + debt − cash: the total cost of 'buying' the entire company. Dividing by EBITDA gives the multiple of operating profit you're paying. Unlike P/E, it's capital-structure neutral — it doesn't matter whether a company uses lots of debt or none. This makes it ideal for comparing companies with different financing approaches or across different tax environments.",
          "L'EV/EBITDA (Enterprise Value ÷ Utile prima di interessi, tasse, ammortamenti) è la metrica di valutazione preferita dai professionisti M&A e dai fondi di private equity. EV = capitalizzazione di mercato + debito − cassa: il costo totale di 'acquistare' l'intera azienda. Dividendo per l'EBITDA si ottiene il multiplo del profitto operativo che stai pagando. A differenza del P/E, è neutrale rispetto alla struttura del capitale — non importa se un'azienda usa molto debito o nessuno. Questo lo rende ideale per confrontare aziende con diversi approcci di finanziamento o in ambienti fiscali diversi."
        ),
        stats: [
          { label:t("Enterprise Value formula","Formula Enterprise Value"), value:t("Mkt Cap + Debt − Cash","Cap Mkt + Debito − Cassa") },
          { label:t("EV/EBITDA < 8×","EV/EBITDA < 8×"), value:t("Potentially cheap","Potenzialmente economico"), extra:t("Varies by sector","Varia per settore") },
          { label:t("EV/EBITDA 8–15×","EV/EBITDA 8–15×"), value:t("Fair value range (S&P 500 typical)","Range valore equo (tipico S&P 500)") },
          { label:t("EV/EBITDA > 20×","EV/EBITDA > 20×"), value:t("Premium — growth must justify","Premio — la crescita deve giustificarlo") },
          { label:t("Tech sector typical","Tipico settore tech"), value:"20–40×" },
          { label:t("Energy / Industrials typical","Tipico energia / industriali"), value:"6–12×" },
        ],
        ctx: t(
          "Vela uses EV/EBITDA as one of the four valuation models in the Analysis tab. It often reveals a different picture from P/E — a company with lots of debt can look cheap on P/E but expensive on EV/EBITDA because you're effectively inheriting its debt when you buy shares.",
          "Vela usa l'EV/EBITDA come uno dei quattro modelli di valutazione nella scheda Analisi. Spesso rivela un quadro diverso dal P/E — un'azienda con molto debito può sembrare economica sul P/E ma cara sull'EV/EBITDA perché stai effettivamente ereditando il suo debito quando compri azioni."
        ),
        insight: t(
          "EV/EBITDA is particularly powerful when comparing companies with very different capital structures. Example: two retailers, one debt-free (P/E 20) and one with €5B in debt (P/E 15). The indebted one looks cheaper on P/E — but may be far more expensive on EV/EBITDA because you inherit its debt burden.",
          "L'EV/EBITDA è particolarmente potente quando si confrontano aziende con strutture di capitale molto diverse. Esempio: due retailer, uno senza debito (P/E 20) e uno con €5 mld di debito (P/E 15). Quello indebitato sembra più economico sul P/E — ma può essere molto più caro sull'EV/EBITDA perché ne erediti il peso del debito."
        ),
      },
      {
        id:66, icon:"📈", level:"intermediate" as const,
        title: t("PEG Ratio — Growth-Adjusted Valuation","Rapporto PEG — Valutazione Aggiustata per la Crescita"),
        explanation: t(
          "The PEG ratio solves the biggest problem with P/E: it ignores growth. PEG = P/E ÷ Annual Earnings Growth Rate (%). A stock with P/E 30 growing at 30%/year has PEG = 1.0. A stock with P/E 20 growing at 5%/year has PEG = 4.0. By Peter Lynch's rule of thumb (he averaged 29%/yr returns): PEG < 1.0 = potentially undervalued; PEG > 2.0 = potentially overvalued. The PEG lets you compare fast-growing and slow-growing companies on a level playing field.",
          "Il rapporto PEG risolve il problema più grande del P/E: ignora la crescita. PEG = P/E ÷ Tasso di crescita annuo degli utili (%). Un titolo con P/E 30 che cresce al 30%/anno ha PEG = 1,0. Uno con P/E 20 che cresce al 5%/anno ha PEG = 4,0. Secondo la regola empirica di Peter Lynch (che ha mediato rendimenti del 29%/anno): PEG < 1,0 = potenzialmente sottovalutato; PEG > 2,0 = potenzialmente sopravvalutato. Il PEG ti permette di confrontare aziende a crescita veloce e lenta su un piano paritetico."
        ),
        stats: [
          { label:t("PEG formula","Formula PEG"), value:t("P/E ÷ EPS growth rate (%)","P/E ÷ tasso crescita EPS (%)"), extra:"Peter Lynch" },
          { label:"PEG < 1.0", value:t("Potentially undervalued","Potenzialmente sottovalutato"), extra:t("Lynch buy signal","Segnale di acquisto Lynch") },
          { label:"PEG 1.0–2.0", value:t("Fairly valued","Correttamente valutato") },
          { label:"PEG > 2.0", value:t("Potentially overvalued","Potenzialmente sopravvalutato"), extra:t("Needs strong conviction","Richiede forte convinzione") },
        ],
        ctx: t(
          "The PEG ratio requires reliable earnings growth estimates — which are inherently uncertain. Always use forward-looking analyst consensus growth (next 12 months), not trailing growth. The PEG doesn't work for companies with negative earnings, very low growth, or businesses where growth is hard to predict (commodities, banks).",
          "Il rapporto PEG richiede stime affidabili di crescita degli utili — che sono intrinsecamente incerte. Usa sempre la crescita forward-looking del consenso degli analisti (prossimi 12 mesi), non la crescita storica. Il PEG non funziona per aziende con utili negativi, crescita molto bassa o settori dove la crescita è difficile da prevedere (materie prime, banche)."
        ),
        insight: t(
          "Peter Lynch found many of his best investments by screening for companies with PEG < 1 — fast-growing businesses the market undervalued relative to their growth potential. The key insight: the market often anchors on the P/E number and ignores how quickly the earnings denominator will change.",
          "Peter Lynch trovò molti dei suoi migliori investimenti cercando aziende con PEG < 1 — imprese in rapida crescita che il mercato sottovalutava rispetto al loro potenziale. L'intuizione chiave: il mercato spesso si ancora al numero del P/E e ignora quanto velocemente cambierà il denominatore degli utili."
        ),
      },
      {
        id:67, icon:"💰", level:"basic" as const,
        title: t("Dividend Yield as a Valuation Signal","Il Dividend Yield come Segnale di Valutazione"),
        explanation: t(
          "Dividend yield (annual dividend per share ÷ share price) can signal valuation extremes. When a stable company's yield is historically HIGH relative to its own range, the stock may be cheap (price has fallen). When yield is historically LOW, the stock may be expensive (price has risen). This 'yield reversion' approach works best for stable dividend payers — utilities, consumer staples, telecoms. Warning: a very high yield caused by a collapsing share price is often a 'yield trap' — the dividend may be cut soon.",
          "Il dividend yield (dividendo annuo per azione ÷ prezzo dell'azione) può segnalare estremi di valutazione. Quando il yield di un'azienda stabile è storicamente ALTO rispetto al suo range, il titolo potrebbe essere economico (prezzo sceso). Quando il yield è storicamente BASSO, il titolo potrebbe essere caro (prezzo salito). Questo approccio di 'regressione al rendimento' funziona meglio per i pagatori di dividendi stabili — utilities, beni di consumo, telecomunicazioni. Attenzione: un yield molto alto causato da un crollo del prezzo è spesso una 'trappola del rendimento' — il dividendo potrebbe essere tagliato presto."
        ),
        stats: [
          { label:t("S&P 500 average dividend yield","Dividend yield medio S&P 500"), value:"~1.5–2.0%/yr" },
          { label:t("Utilities sector average yield","Yield medio settore utilities"), value:"3–5%/yr" },
          { label:t("High yield warning threshold","Soglia di avviso yield alto"), value:"> 6–8%", extra:t("Check payout ratio — may signal distress","Controlla payout ratio — può segnalare difficoltà") },
          { label:t("Sustainable payout ratio","Payout ratio sostenibile"), value:"< 70%", extra:t("Dividends ÷ Net income","Dividendi ÷ Utile netto") },
          { label:t("Dividend Aristocrats","Dividend Aristocrats"), value:t("25+ consecutive increases","25+ aumenti consecutivi") },
        ],
        ctx: t(
          "Gordon Growth Model — a simple valuation for dividend payers: Value = Annual Dividend ÷ (Required Return − Dividend Growth Rate). Example: a company paying €2/share/year, growing dividends at 3%/year, and you need 8% return: Value = €2 ÷ (0.08 − 0.03) = €40. If the stock trades at €30, it may be undervalued.",
          "Gordon Growth Model — una valutazione semplice per i pagatori di dividendi: Valore = Dividendo Annuo ÷ (Rendimento Richiesto − Tasso di Crescita del Dividendo). Esempio: un'azienda che paga €2/azione/anno, fa crescere i dividendi al 3%/anno, e tu vuoi un rendimento dell'8%: Valore = €2 ÷ (0,08 − 0,03) = €40. Se il titolo tratta a €30, potrebbe essere sottovalutato."
        ),
        insight: t(
          "Reinvesting dividends dramatically accelerates compounding. Historically ~40% of the S&P 500's total return has come from reinvested dividends — not price appreciation alone. A stock with a 3% yield that grows dividends at 7%/year will pay you more than its original price within 15 years.",
          "Reinvestire i dividendi accelera drasticamente il compounding. Storicamente ~40% del rendimento totale dell'S&P 500 è venuto dai dividendi reinvestiti — non solo dall'apprezzamento del prezzo. Un titolo con un yield del 3% che fa crescere i dividendi al 7%/anno ti pagherà più del prezzo originale entro 15 anni."
        ),
      },
      {
        id:68, icon:"⚖️", level:"intermediate" as const,
        title: t("Relative Valuation — Is It Cheap vs Peers?","Valutazione Relativa — È Economico vs i Peer?"),
        explanation: t(
          "Relative valuation (or 'comps analysis') finds a company's fair value by comparing it to similar businesses. Steps: (1) Identify 5–10 truly comparable companies — same sector, similar size, similar business model. (2) Calculate their median P/E, EV/EBITDA, or P/S ratios. (3) Apply that median to your target company's financials to get an implied fair value. This is why Vela shows your holding's P/E vs the sector fair P/E — that's exactly the relative valuation approach.",
          "La valutazione relativa (o 'analisi comps') trova il valore equo di un'azienda confrontandola con aziende simili. Passaggi: (1) Identifica 5–10 aziende davvero comparabili — stesso settore, dimensioni simili, modello di business simile. (2) Calcola i loro multipli mediani P/E, EV/EBITDA o P/S. (3) Applica quella mediana ai dati finanziari dell'azienda target per ottenere un valore equo implicito. Ecco perché Vela mostra il P/E del tuo titolo vs il P/E equo del settore — è esattamente l'approccio di valutazione relativa."
        ),
        stats: [
          { label:t("Tech sector median P/E (2024)","P/E mediano tech (2024)"), value:"~28×" },
          { label:t("Financial sector median P/E","P/E mediano finanziari"), value:"~12×" },
          { label:t("Healthcare sector median P/E","P/E mediano sanità"), value:"~20×" },
          { label:t("Consumer Staples median P/E","P/E mediano beni di consumo"), value:"~18×" },
          { label:t("Energy sector median P/E","P/E mediano energia"), value:"~10×" },
        ],
        ctx: t(
          "The Analysis tab shows your holding's P/E vs its sector fair P/E estimate — this is relative valuation in practice. If your stock's P/E is 30% below the sector median, it may be undervalued. If it's 30% above, it needs to justify that premium with faster growth or higher quality margins.",
          "La scheda Analisi mostra il P/E del tuo titolo vs il P/E equo stimato del settore — questa è la valutazione relativa in pratica. Se il P/E del tuo titolo è il 30% sotto la mediana del settore, potrebbe essere sottovalutato. Se è il 30% sopra, deve giustificare quel premio con una crescita più rapida o margini di qualità superiori."
        ),
        insight: t(
          "The biggest risk with comps: comparing the wrong companies. Facebook (Meta) and a small regional newspaper both 'sell advertising' — but they are not comparable at all. Always verify: same business model, similar growth rate, similar margin profile, and similar market position before using comps as a valuation anchor.",
          "Il rischio più grande con le comps: confrontare le aziende sbagliate. Facebook (Meta) e un piccolo giornale regionale 'vendono entrambi pubblicità' — ma non sono affatto comparabili. Verifica sempre: stesso modello di business, tasso di crescita simile, profilo dei margini simile e posizione di mercato simile prima di usare le comps come ancora di valutazione."
        ),
      },
      {
        id:69, icon:"🔬", level:"advanced" as const,
        title: t("Putting It All Together — Multi-Model Valuation","Mettere Tutto Insieme — Valutazione Multi-Modello"),
        explanation: t(
          "Professional equity analysts use multiple valuation methods simultaneously, then triangulate. Each model captures something different: DCF captures long-term earnings power; P/E captures market sentiment and growth expectations; Graham Number captures asset safety; EV/EBITDA captures operational value vs total enterprise cost. When all models agree on a fair value range — and the current price is significantly below — you have a margin of safety. When models wildly disagree, it means either assumptions need review or the company has unusual characteristics that require deeper research.",
          "Gli analisti azionari professionisti usano più metodi di valutazione contemporaneamente, poi triangolano. Ogni modello cattura qualcosa di diverso: il DCF cattura il potere di guadagno a lungo termine; il P/E cattura il sentiment di mercato e le aspettative di crescita; il Graham Number cattura la sicurezza degli asset; l'EV/EBITDA cattura il valore operativo vs il costo totale dell'impresa. Quando tutti i modelli concordano su un intervallo di valore equo — e il prezzo corrente è significativamente al di sotto — si ha un margine di sicurezza. Quando i modelli non concordano, significa che le assunzioni necessitano di revisione o che l'azienda ha caratteristiche inusuali."
        ),
        stats: [
          { label:t("Vela's weighting approach","Approccio ponderato di Vela"), value:t("DCF 40% · P/E 25% · Graham 20% · EV/EBITDA 15%","DCF 40% · P/E 25% · Graham 20% · EV/EBITDA 15%") },
          { label:t("Ideal margin of safety","Margine di sicurezza ideale"), value:"> 20–30%", extra:t("below weighted fair value","sotto il valore equo ponderato") },
          { label:t("Models wildly disagree → action","Modelli in forte disaccordo → azione"), value:t("Research more — do not invest yet","Ricerca di più — non investire ancora") },
          { label:t("Cross-validation","Validazione incrociata"), value:t("Check analyst consensus too","Controlla anche il consenso degli analisti") },
        ],
        ctx: t(
          "This is exactly what Vela's Analysis tab does for your largest holding: runs all four models (DCF, P/E, Graham Number, EV/EBITDA), weights them, and produces a single AI verdict with an upside/downside percentage vs current price. Use it as your research starting point, not the final answer — always verify the underlying assumptions.",
          "Questo è esattamente ciò che fa la scheda Analisi di Vela per il tuo titolo più grande: esegue tutti e quattro i modelli (DCF, P/E, Graham Number, EV/EBITDA), li pondera e produce un unico verdetto AI con una percentuale di upside/downside rispetto al prezzo attuale. Usalo come punto di partenza della ricerca, non come risposta finale — verifica sempre le assunzioni sottostanti."
        ),
        insight: t(
          "The goal of valuation is not to find the 'perfect' number — it's to build enough conviction to act. If all your models show 30%+ upside with stress-tested assumptions, you have a thesis. If they show 5% upside, the risk/reward doesn't justify concentrated betting — a broad ETF is likely a better use of that capital.",
          "L'obiettivo della valutazione non è trovare il numero 'perfetto' — è costruire abbastanza convinzione per agire. Se tutti i tuoi modelli mostrano più del 30% di upside con assunzioni testate sotto stress, hai una tesi. Se mostrano il 5% di upside, il rischio/rendimento non giustifica una scommessa concentrata — un ETF ampio è probabilmente un uso migliore di quel capitale."
        ),
      },
    ],
  };

  const CATEGORIES = [cat1, cat2, cat3, cat4, cat5, cat6, cat7, cat8, cat9, cat10];
  const totalLessons = CATEGORIES.reduce((s,c)=>s+c.lessons.length,0);

  // Flat list of all lessons with their category metadata attached
  const allLessons = CATEGORIES.flatMap(cat =>
    cat.lessons.map(lesson => ({ ...lesson, catId: cat.id, catIcon: cat.icon, catTitle: cat.title, catColor: cat.color }))
  );

  const scrollToCategory = useCallback((catId: string) => {
    const idx = allLessons.findIndex(l => l.catId === catId);
    if (idx >= 0) scrollToLesson(idx);
  }, [allLessons, scrollToLesson]);

  // Navigate between lessons while keeping the expanded view open
  const goToLesson = useCallback((newIdx: number) => {
    if (newIdx < 0 || newIdx >= allLessons.length) return;
    setExpanded(null);
    scrollToLesson(newIdx);
    const nextId = allLessons[newIdx].id;
    // Re-open the next lesson once the smooth scroll has settled
    setTimeout(() => setExpanded(nextId), 320);
  }, [allLessons, scrollToLesson, setExpanded]);

  // Which category is currently active
  const activeCat = allLessons[currentIdx]?.catId ?? CATEGORIES[0].id;

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"calc(100dvh - 195px)", minHeight:"400px" }}>

      {/* ── Category pill tabs ── */}
      <div className="no-scrollbar" style={{ overflowX:"auto", flexShrink:0, padding:"8px 16px 6px" }}>
        <div style={{ display:"flex", gap:"8px", width:"max-content" }}>
          {CATEGORIES.map(cat => {
            const active = activeCat === cat.id;
            return (
              <button key={cat.id} onClick={() => scrollToCategory(cat.id)}
                style={{
                  backgroundColor: active ? `${cat.color}22` : "rgba(255,255,255,0.06)",
                  border: `1px solid ${active ? cat.color+"60" : "rgba(255,255,255,0.10)"}`,
                  color: active ? cat.color : "#64748B",
                  borderRadius:"9999px",
                  padding:"4px 12px",
                  fontSize:"11px",
                  fontWeight:"600",
                  whiteSpace:"nowrap",
                  transition:"all 0.15s",
                }}>
                {cat.icon} {cat.title}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Progress bar ── */}
      <div style={{ height:"2px", backgroundColor:"rgba(255,255,255,0.06)", flexShrink:0, margin:"0 16px" }}>
        <div style={{
          height:"100%", borderRadius:"9999px",
          backgroundColor: allLessons[currentIdx]?.catColor ?? "#0EA5E9",
          width: `${((currentIdx + 1) / totalLessons) * 100}%`,
          transition:"width 0.2s",
        }} />
      </div>

      {/* ── Reels scroll container ── */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="no-scrollbar"
        style={{
          height:"100dvh",
          overflowY:"scroll",
          scrollSnapType: expandedLessonId === null ? "y mandatory" : "none",
          WebkitOverflowScrolling:"touch",
        }}
      >
        {allLessons.map((lesson, idx) => {
          const hook = HOOKS[lesson.id];
          const isExpanded = expandedLessonId === lesson.id;
          return (
            <div
              key={lesson.id}
              style={{
                height:"100dvh",
                scrollSnapAlign:"start",
                flexShrink:0,
                padding:"12px 16px 16px",
                display:"flex",
                flexDirection:"column",
                gap:"10px",
                overflow:"hidden",
              }}
              className="no-scrollbar"
            >
              {/* Top row: category + lesson counter */}
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexShrink:0 }}>
                <span style={{ color:lesson.catColor, fontSize:"11px", fontWeight:"600" }}>
                  {lesson.catIcon} {lesson.catTitle}
                </span>
                <span style={{ color:"#334155", fontSize:"11px" }}>
                  {idx + 1} / {totalLessons}
                </span>
              </div>

              {!isExpanded ? (
                /* ── COLLAPSED: hook view ── */
                <div
                  onClick={() => setExpanded(lesson.id)}
                  className="no-scrollbar"
                  style={{
                    flex:1,
                    borderRadius:"20px",
                    backgroundColor:"rgba(255,255,255,0.06)",
                    border:`1px solid ${lesson.catColor}40`,
                    padding:"28px 22px",
                    display:"flex",
                    flexDirection:"column",
                    alignItems:"center",
                    justifyContent:"center",
                    gap:"18px",
                    cursor:"pointer",
                    userSelect:"none",
                  }}
                >
                  <div style={{ fontSize:"56px", lineHeight:1, textAlign:"center" }}>{lesson.icon}</div>
                  <p style={{ color:"white", fontWeight:"700", fontSize:"20px", lineHeight:"1.35", textAlign:"center", margin:0, maxWidth:"280px" }}>
                    {hook ? t(hook.en, hook.it) : lesson.title}
                  </p>
                  <DiffBadge level={lesson.level} t={t} />
                  <div style={{ width:"36px", height:"1px", backgroundColor:"rgba(255,255,255,0.12)" }} />
                  <button
                    style={{
                      backgroundColor:`${lesson.catColor}18`,
                      border:`1px solid ${lesson.catColor}50`,
                      color:lesson.catColor,
                      borderRadius:"9999px",
                      padding:"9px 22px",
                      fontSize:"13px",
                      fontWeight:"600",
                      cursor:"pointer",
                      letterSpacing:"0.01em",
                    }}
                  >
                    ↓ {t("Tap to learn more", "Scopri di più")}
                  </button>
                </div>
              ) : (
                /* ── EXPANDED: full content ── */
                <div className="no-scrollbar"
                  style={{
                  flex:1,
                  borderRadius:"20px",
                  backgroundColor:"rgba(255,255,255,0.06)",
                  border:`1px solid ${lesson.catColor}30`,
                  padding:"18px",
                  overflowY:"auto",
                  overscrollBehaviorY:"contain",
                  display:"flex",
                  flexDirection:"column",
                  gap:"10px",
                }}>
                  {/* Compact header row */}
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0, gap:"8px" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
                      <span style={{ fontSize:"26px", lineHeight:1 }}>{lesson.icon}</span>
                      <DiffBadge level={lesson.level} t={t} />
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:"6px" }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); goToLesson(idx - 1); }}
                        disabled={idx === 0}
                        aria-label={t("Previous lesson", "Lezione precedente")}
                        title={t("Previous lesson", "Lezione precedente")}
                        style={{
                          backgroundColor:"rgba(255,255,255,0.06)",
                          border:"1px solid rgba(255,255,255,0.12)",
                          color: idx === 0 ? "#475569" : "#CBD5E1",
                          borderRadius:"9999px",
                          width:"30px",
                          height:"30px",
                          fontSize:"13px",
                          cursor: idx === 0 ? "not-allowed" : "pointer",
                          opacity: idx === 0 ? 0.5 : 1,
                          display:"flex",
                          alignItems:"center",
                          justifyContent:"center",
                        }}
                      >
                        ◀
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); goToLesson(idx + 1); }}
                        disabled={idx === totalLessons - 1}
                        aria-label={t("Next lesson", "Lezione successiva")}
                        title={t("Next lesson", "Lezione successiva")}
                        style={{
                          backgroundColor:"rgba(255,255,255,0.06)",
                          border:"1px solid rgba(255,255,255,0.12)",
                          color: idx === totalLessons - 1 ? "#475569" : "#CBD5E1",
                          borderRadius:"9999px",
                          width:"30px",
                          height:"30px",
                          fontSize:"13px",
                          cursor: idx === totalLessons - 1 ? "not-allowed" : "pointer",
                          opacity: idx === totalLessons - 1 ? 0.5 : 1,
                          display:"flex",
                          alignItems:"center",
                          justifyContent:"center",
                        }}
                      >
                        ▶
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setExpanded(null); }}
                        style={{
                          backgroundColor:"rgba(255,255,255,0.06)",
                          border:"1px solid rgba(255,255,255,0.12)",
                          color:"#94A3B8",
                          borderRadius:"9999px",
                          padding:"4px 14px",
                          fontSize:"12px",
                          cursor:"pointer",
                        }}
                      >
                        ↑ {t("Less", "Meno")}
                      </button>
                    </div>
                  </div>

                  {/* Title */}
                  <h2 style={{ color:"white", fontWeight:"700", fontSize:"17px", lineHeight:"1.3", margin:0, flexShrink:0 }}>
                    {lesson.title}
                  </h2>

                  {/* Explanation */}
                  <p style={{ color:"#CBD5E1", fontSize:"13px", lineHeight:"1.65" }}>
                    {lesson.explanation}
                  </p>

                  {/* Stats */}
                  {"stats" in lesson && lesson.stats && <StatTable rows={lesson.stats} />}

                  {/* Context box */}
                  {lesson.ctx && <CtxBox label={t("In Context","In Contesto")}>{lesson.ctx}</CtxBox>}

                  {/* Insight */}
                  <InsightBox>{lesson.insight}</InsightBox>
                </div>
              )}

              {/* Swipe hint — only on first lesson when collapsed */}
              {idx === 0 && !isExpanded && (
                <p style={{ textAlign:"center", color:"#334155", fontSize:"11px", flexShrink:0 }}>
                  ↕ {t("Swipe up to browse lessons","Scorri verso l'alto per sfogliare le lezioni")}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
