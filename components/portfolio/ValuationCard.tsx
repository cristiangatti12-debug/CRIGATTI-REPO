"use client";
import { useState, useEffect, useRef } from "react";
import type { ValuationResult } from "@/app/api/valuation/route";
import { userKey } from "@/lib/userCache";

function fmt2(n: number) { return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtB(n: number) { return `$${(n / 1e9).toFixed(2)}B`; }

function pctColor(pct: number | null) {
  if (pct === null) return "#94A3B8";
  if (pct > 10) return "#16A34A";
  if (pct > -10) return "#CA8A04";
  return "#DC2626";
}

interface Props {
  ticker:           string;
  name:             string;
  price:            number;
  currSym:          string;
  pctGain:          number;
  isLargestHolding: boolean; // true = free full card this month
  isSimple?:        boolean; // true = non-free card → show only P/E + premium lock
  isPremium?:       boolean; // true = user has active subscription → unlock all cards
  staggerMs?:       number;  // milliseconds to wait before firing the first fetch
  t: (en: string, it: string) => string;
  appLang: "en" | "it";
}

export default function ValuationCard({
  ticker, name, price, currSym, pctGain,
  isLargestHolding, isSimple = false, isPremium = false, staggerMs = 0,
  t, appLang,
}: Props) {
  const [data,    setData]    = useState<ValuationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [retryIn, setRetryIn] = useState<number | null>(null);
  const [queued,  setQueued]  = useState(false);
  const retryTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const staggerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Simple cards skip CASH_FLOW → different cache bucket so upgrading to full loads fresh.
  // Per-user namespacing keeps cards isolated across accounts on the same device.
  const CACHE_KEY = userKey(isSimple ? `vela_val_v8_simple_${ticker}` : `vela_val_v8_${ticker}`);
  const FETCH_URL = `/api/valuation?ticker=${ticker}&price=${price}${isSimple ? "&simple=true" : ""}`;

  function doFetch() {
    const today = new Date().toISOString().slice(0, 10);
    setError(null);
    setRetryIn(null);
    setLoading(true);

    fetch(FETCH_URL)
      .then(async r => {
        const d = await r.json();
        if (d.error === "rate_limited") {
          setError("rate_limited");
          let secs = 65;
          setRetryIn(secs);
          const tick = () => {
            secs -= 1;
            if (secs <= 0) { setRetryIn(null); doFetch(); }
            else { setRetryIn(secs); retryTimer.current = setTimeout(tick, 1000); }
          };
          retryTimer.current = setTimeout(tick, 1000);
          return;
        }
        if (d.error) { setError(d.error); return; }
        const result = d as ValuationResult;
        setData(result);
        if (CACHE_KEY) {
          try { localStorage.setItem(CACHE_KEY, JSON.stringify({ d: result, date: today })); } catch {}
        }
      })
      .catch(() => setError("Network error — please try again"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    if (CACHE_KEY) {
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const { d, date } = JSON.parse(cached);
          if (date === today) {
            setData(d);
            return;
          }
        }
      } catch {}
    }

    if (staggerMs > 0) {
      setQueued(true);
      staggerTimer.current = setTimeout(() => { setQueued(false); doFetch(); }, staggerMs);
    } else {
      doFetch();
    }

    return () => {
      if (staggerTimer.current) clearTimeout(staggerTimer.current);
      if (retryTimer.current)   clearTimeout(retryTimer.current);
    };
  }, [ticker]);

  // ── Excel generation — styled financial model layout ──────────────────────────
  async function downloadExcel() {
    if (!data) return;

    const EJSmod = await import("exceljs");
    const EJS    = (EJSmod as any).default ?? EJSmod;
    const wb: any = new EJS.Workbook();

    // ── Design tokens (matching screenshot style) ──────────────────────────────
    const HDR  = "FF1E3A5F";  // dark navy  — title/report header bg
    const SEC  = "FF2B6193";  // mid blue   — section header bg  (Income Statement bar)
    const GRN  = "FFE2F0D9";  // light green — calculated/output cells
    const SAL  = "FFFCE4D6";  // salmon     — input cells
    const TEAL = "FF1D7391";  // teal text  — % / italic rows
    const WHT  = "FFFFFFFF";
    const BLK  = "FF1E1E1E";
    const BDR  = "FFD6E4F0";  // light border
    const F    = "Calibri";

    const solid = (a: string) => ({ type:"pattern" as const, pattern:"solid" as const, fgColor:{argb:a} });
    const thin  = (a: string) => ({ style:"thin" as const, color:{argb:a} });
    const bdr   = ()          => ({ top:thin(BDR), bottom:thin(BDR), left:thin(BDR), right:thin(BDR) });
    const fnt   = (bold=false, size=10, argb=BLK, italic=false) =>
                  ({ name:F, size, bold, italic, color:{argb} });
    const aln   = (h:"left"|"center"|"right"="left", wrap=false) =>
                  ({ horizontal:h, vertical:"middle" as const, wrapText:wrap });

    // Single-cell style setter — no eachCell, no loops side-effects
    interface CO { val?:any; bg?:string; fg?:string; bold?:boolean; italic?:boolean;
                   size?:number; h?:"left"|"center"|"right"; wrap?:boolean; border?:boolean }
    function sc(cell:any, o:CO) {
      if (o.val !== undefined) cell.value = o.val;
      if (o.bg) cell.fill = solid(o.bg);
      cell.font      = fnt(o.bold??false, o.size??10, o.fg??BLK, o.italic??false);
      cell.alignment = aln(o.h??"left", o.wrap??false);
      if (o.border)  cell.border = bdr();
    }

    // Fill entire row with a background without touching values/fonts
    function fillRow(ws:any, r:number, nc:number, bg:string) {
      for (let c=1; c<=nc; c++) ws.getCell(r,c).fill = solid(bg);
    }

    // ── Row-type builders ──────────────────────────────────────────────────────
    function hdrRow(ws:any, r:number, nc:number, txt:string, sub=false) {
      fillRow(ws, r, nc, HDR);
      sc(ws.getCell(r,1), { val:txt, bg:HDR, fg:sub?"FFADD8E6":WHT, bold:!sub, italic:sub, size:sub?9:12 });
      ws.getRow(r).height = sub ? 14 : 26;
    }
    function secRow(ws:any, r:number, nc:number, txt:string) {
      fillRow(ws, r, nc, SEC);
      sc(ws.getCell(r,1), { val:txt, bg:SEC, fg:WHT, bold:true });
      ws.getRow(r).height = 18;
    }
    function colHdr(ws:any, r:number, labels:string[]) {
      labels.forEach((lbl,i) =>
        sc(ws.getCell(r,i+1), { val:lbl, bg:SEC, fg:WHT, bold:true, h:i===0?"left":"center", border:true })
      );
      ws.getRow(r).height = 18;
    }
    function inputRow(ws:any, r:number, lbl:string, val:any, nc=2) {
      sc(ws.getCell(r,1), { val:lbl, border:true });
      sc(ws.getCell(r,2), { val, bg:SAL, h:"right", border:true });
      for (let c=3; c<=nc; c++) sc(ws.getCell(r,c), { bg:SAL, border:true });
      ws.getRow(r).height = 16;
    }
    function calcRow(ws:any, r:number, lbl:string, val:any, bold=false, nc=2) {
      sc(ws.getCell(r,1), { val:lbl, bold, border:true });
      sc(ws.getCell(r,2), { val, bg:GRN, bold, h:"right", border:true });
      for (let c=3; c<=nc; c++) sc(ws.getCell(r,c), { bg:GRN, border:true });
      ws.getRow(r).height = bold ? 18 : 16;
    }
    function pctRow(ws:any, r:number, lbl:string, val:any) {
      sc(ws.getCell(r,1), { val:lbl, fg:TEAL, italic:true });
      sc(ws.getCell(r,2), { val, fg:TEAL, italic:true, h:"right" });
      ws.getRow(r).height = 14;
    }
    function blankRow(ws:any, r:number) { ws.getRow(r).height = 8; }

    // ── Data aliases & formatters ──────────────────────────────────────────────
    const p   = data.price;
    const dcf = data.dcf;
    const pe  = data.pe;
    const g   = data.graham;
    const ev  = data.evEbitda;
    const today = new Date().toLocaleDateString("en-GB", { day:"numeric", month:"long", year:"numeric" });
    const $v  = (n:number) => `$${n.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
    const $n  = (n:number|null) => n!==null ? $v(n) : "N/A";
    const vsP = (n:number|null) => {
      if (n===null || p===0) return "N/A";
      const pct = (n-p)/p*100;
      return `${pct>=0?"+":""}${pct.toFixed(1)}%`;
    };
    const wt  = (w:number) => {
      const tot = data.verdict.totalWeight;
      return tot>0&&w>0 ? `${Math.round(w/tot*100)}%  (${w}/${tot} pts)` : "0%  (excluded)";
    };
    const B   = (n:number) => `$${(n/1e9).toFixed(2)}B`;

    // ─────────────────────────────────────────────────────────────────────────
    // SHEET 1 — Summary
    // ─────────────────────────────────────────────────────────────────────────
    {
      const NC=5;
      const ws:any = wb.addWorksheet("Summary");
      ws.columns = [{width:30},{width:18},{width:18},{width:22},{width:60}];
      let r=1;

      hdrRow(ws,r,NC,`${ticker}  —  ${name}  |  AI Valuation Report by Vela.ai`); r++;
      hdrRow(ws,r,NC,`Generated: ${today}   |   Educational purposes only — not financial advice`,true); r++;
      blankRow(ws,r); r++;

      secRow(ws,r,NC,"COMPANY SNAPSHOT"); r++;
      [["Ticker",ticker],["Company",name],["Sector",data.sector||"—"],["Current Price",$v(p)]].forEach(([l,v])=>{
        inputRow(ws,r,l,v,NC); r++;
      });
      blankRow(ws,r); r++;

      secRow(ws,r,NC,"VALUATION MODELS"); r++;
      colHdr(ws,r,["Model","AI Fair Value","vs Current Price","Weight","Notes"]); r++;
      [
        {l:"Graham Number",  fv:g.fairValue,  w:g.weight,  n:g.note},
        {l:"P/E Model",      fv:pe.fairValue, w:pe.weight, n:pe.note},
        {l:"DCF (Cash Flow)",fv:dcf.fairValue,w:dcf.weight,n:dcf.note},
        {l:"EV/EBITDA",      fv:ev.fairValue, w:ev.weight, n:ev.note},
      ].forEach(({l,fv,w,n})=>{
        sc(ws.getCell(r,1),{val:l,border:true});
        sc(ws.getCell(r,2),{val:$n(fv),bg:GRN,h:"right",border:true});
        sc(ws.getCell(r,3),{val:vsP(fv),bg:GRN,h:"center",border:true});
        sc(ws.getCell(r,4),{val:wt(w),h:"center",border:true});
        sc(ws.getCell(r,5),{val:n,wrap:true,border:true});
        ws.getRow(r).height=16; r++;
      });
      blankRow(ws,r); r++;

      secRow(ws,r,NC,"AI VERDICT"); r++;
      const fv=data.verdict.weightedFairValue;
      const vp=data.verdict.vsCurrentPct;
      calcRow(ws,r,"Weighted Fair Value",fv!==null?$v(fv):"N/A",true,NC); r++;
      pctRow(ws,r,"vs Current Price",vp!==null?`${vp>=0?"+":""}${vp.toFixed(1)}%`:"N/A"); r++;
      sc(ws.getCell(r,1),{val:"Recommendation",bold:true,border:true});
      sc(ws.getCell(r,2),{val:data.verdict.recommendation,bold:true,border:true});
      ws.getRow(r).height=16; r++;
      blankRow(ws,r); r++;
      fillRow(ws,r,NC,HDR);
      sc(ws.getCell(r,1),{val:"DISCLAIMER: Generated automatically by Vela.ai. For educational purposes only. Not financial advice.",bg:HDR,fg:"FFADD8E6",italic:true,size:8,wrap:true});
      ws.getRow(r).height=20;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SHEET 2 — DCF Model   (has year columns — widest sheet)
    // ─────────────────────────────────────────────────────────────────────────
    {
      const ypArr = dcf.yearlyProjections;
      const NC    = 2 + ypArr.length + 1;   // label + base + Y1..Y5 + terminal
      const ws:any = wb.addWorksheet("DCF Model");
      ws.columns = [{width:32},{width:15},...ypArr.map(()=>({width:13})),{width:16}];
      let r=1;

      hdrRow(ws,r,NC,`${ticker}  —  DCF Model (Discounted Cash Flow)`); r++;
      hdrRow(ws,r,NC,`Weight: ${wt(dcf.weight)}   |   Sector: ${data.sector||"—"}`,true); r++;
      blankRow(ws,r); r++;

      secRow(ws,r,NC,"ASSUMPTIONS"); r++;
      inputRow(ws,r,"FCF per Share (Base Year)",$v(dcf.fcfPerShare)); r++;
      inputRow(ws,r,"Growth Rate (Years 1-5)",`${(dcf.growthRate*100).toFixed(1)}%`); r++;
      inputRow(ws,r,"Terminal Growth Rate",`${(dcf.terminalGrowth*100).toFixed(1)}%`); r++;
      inputRow(ws,r,"Discount Rate (WACC)",`${(dcf.wacc*100).toFixed(1)}%`); r++;
      blankRow(ws,r); r++;

      secRow(ws,r,NC,"YEAR-BY-YEAR PROJECTIONS"); r++;

      // Column headers
      sc(ws.getCell(r,1),{val:"",bg:SEC,fg:WHT,bold:true,border:true});
      sc(ws.getCell(r,2),{val:"Base Year",bg:SEC,fg:WHT,bold:true,h:"center",border:true});
      ypArr.forEach((y,i)=> sc(ws.getCell(r,i+3),{val:`Year ${y.year}`,bg:SEC,fg:WHT,bold:true,h:"center",border:true}));
      sc(ws.getCell(r,NC),{val:"Terminal",bg:SEC,fg:WHT,bold:true,h:"center",border:true});
      ws.getRow(r).height=18; r++;

      // Revenue / FCF row (green calc)
      sc(ws.getCell(r,1),{val:"FCF per Share ($)",border:true});
      sc(ws.getCell(r,2),{val:+dcf.fcfPerShare.toFixed(2),bg:SAL,h:"right",border:true});
      ypArr.forEach((y,i)=> sc(ws.getCell(r,i+3),{val:+y.fcf.toFixed(2),bg:GRN,h:"right",border:true}));
      sc(ws.getCell(r,NC),{val:"—",bg:GRN,h:"right",border:true});
      ws.getRow(r).height=16; r++;

      // % growth (teal italic)
      sc(ws.getCell(r,1),{val:"% growth",italic:true,fg:TEAL});
      sc(ws.getCell(r,2),{val:"—",italic:true,fg:TEAL,h:"right"});
      ypArr.forEach((_,i)=> sc(ws.getCell(r,i+3),{val:`${(dcf.growthRate*100).toFixed(1)}%`,italic:true,fg:TEAL,h:"right"}));
      sc(ws.getCell(r,NC),{val:`${(dcf.terminalGrowth*100).toFixed(1)}%`,italic:true,fg:TEAL,h:"right"});
      ws.getRow(r).height=14; r++;

      // Discount factor (teal italic)
      sc(ws.getCell(r,1),{val:"Discount Factor",italic:true,fg:TEAL});
      sc(ws.getCell(r,2),{val:"1.0000",italic:true,fg:TEAL,h:"right"});
      ypArr.forEach((y,i)=> sc(ws.getCell(r,i+3),{val:+(1/Math.pow(1+dcf.wacc,y.year)).toFixed(4),italic:true,fg:TEAL,h:"right"}));
      sc(ws.getCell(r,NC),{val:+(1/Math.pow(1+dcf.wacc,5)).toFixed(4),italic:true,fg:TEAL,h:"right"});
      ws.getRow(r).height=14; r++;

      // Present value (green)
      sc(ws.getCell(r,1),{val:"Present Value ($)",border:true});
      sc(ws.getCell(r,2),{val:"—",bg:GRN,h:"right",border:true});
      ypArr.forEach((y,i)=> sc(ws.getCell(r,i+3),{val:+y.pv.toFixed(2),bg:GRN,h:"right",border:true}));
      sc(ws.getCell(r,NC),{val:+dcf.pvTerminal.toFixed(2),bg:GRN,h:"right",border:true});
      ws.getRow(r).height=16; r++;
      blankRow(ws,r); r++;

      secRow(ws,r,NC,"RESULT"); r++;
      const pvSum = ypArr.reduce((s,y)=>s+y.pv,0);
      const spanCalc = (lbl:string, val:any, bold=false) => {
        sc(ws.getCell(r,1),{val:lbl,bold,border:true});
        sc(ws.getCell(r,2),{val,bg:GRN,bold,h:"right",border:true});
        for(let c=3;c<=NC;c++) sc(ws.getCell(r,c),{bg:GRN,border:true});
        ws.getRow(r).height=bold?18:16; r++;
      };
      spanCalc("Sum PV — Years 1 to 5",+pvSum.toFixed(2));
      spanCalc("PV of Terminal Value",+dcf.pvTerminal.toFixed(2));
      spanCalc("DCF Intrinsic Value / Share",dcf.fairValue!==null?+dcf.fairValue.toFixed(2):"N/A",true);
      spanCalc("Current Market Price",+p.toFixed(2));
      // % upside (teal italic, spanning)
      sc(ws.getCell(r,1),{val:"Upside / (Downside)",italic:true,fg:TEAL});
      sc(ws.getCell(r,2),{val:vsP(dcf.fairValue),italic:true,fg:TEAL,h:"right"});
      ws.getRow(r).height=14; r++;
      blankRow(ws,r); r++;
      sc(ws.getCell(r,1),{val:`Note: ${dcf.note}`,italic:true,fg:TEAL,wrap:true});
      ws.getRow(r).height=24;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SHEET 3 — P/E Model
    // ─────────────────────────────────────────────────────────────────────────
    {
      const NC=2;
      const ws:any = wb.addWorksheet("PE Model");
      ws.columns = [{width:36},{width:30}];
      let r=1;

      hdrRow(ws,r,NC,`${ticker}  —  P/E Valuation Model`); r++;
      hdrRow(ws,r,NC,`Weight: ${wt(pe.weight)}   |   Sector: ${data.sector||"—"}`,true); r++;
      blankRow(ws,r); r++;

      secRow(ws,r,NC,"INPUTS"); r++;
      inputRow(ws,r,"EPS (Trailing 12 Months)",+pe.eps.toFixed(2)); r++;
      inputRow(ws,r,"Trailing P/E",pe.trailingPE>0?`${pe.trailingPE.toFixed(1)}x`:"N/A"); r++;
      inputRow(ws,r,"Sector Fair P/E",`${pe.fairPE}x`); r++;
      blankRow(ws,r); r++;

      secRow(ws,r,NC,"CALCULATION"); r++;
      sc(ws.getCell(r,1),{val:"Formula",border:true});
      sc(ws.getCell(r,2),{val:"Fair Value = EPS x Sector Fair P/E",border:true});
      ws.getRow(r).height=16; r++;
      sc(ws.getCell(r,1),{val:`$${fmt2(pe.eps)} x ${pe.fairPE}x =`,border:true});
      sc(ws.getCell(r,2),{val:pe.fairValue!==null?+pe.fairValue.toFixed(2):"N/A",bg:GRN,h:"right",border:true});
      ws.getRow(r).height=16; r++;
      blankRow(ws,r); r++;

      secRow(ws,r,NC,"RESULT"); r++;
      calcRow(ws,r,"P/E Fair Value / Share",pe.fairValue!==null?+pe.fairValue.toFixed(2):"N/A",true); r++;
      sc(ws.getCell(r,1),{val:"Current Market Price",border:true});
      sc(ws.getCell(r,2),{val:+p.toFixed(2),h:"right",border:true});
      ws.getRow(r).height=16; r++;
      pctRow(ws,r,"Upside / (Downside)",vsP(pe.fairValue)); r++;
      blankRow(ws,r); r++;
      sc(ws.getCell(r,1),{val:`Note: ${pe.note}`,italic:true,fg:TEAL,wrap:true});
      ws.getRow(r).height=30;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SHEET 4 — Graham Number
    // ─────────────────────────────────────────────────────────────────────────
    {
      const NC=2;
      const ws:any = wb.addWorksheet("Graham Number");
      ws.columns = [{width:42},{width:30}];
      let r=1;

      hdrRow(ws,r,NC,`${ticker}  —  Graham Number`); r++;
      hdrRow(ws,r,NC,`Weight: ${wt(g.weight)}   |   Formula: sqrt(22.5 x EPS x Book Value)`,true); r++;
      blankRow(ws,r); r++;

      secRow(ws,r,NC,"INPUTS"); r++;
      inputRow(ws,r,"EPS (Trailing 12 Months)",+g.eps.toFixed(2)); r++;
      inputRow(ws,r,"Book Value per Share",+g.bookValue.toFixed(2)); r++;
      blankRow(ws,r); r++;

      secRow(ws,r,NC,"CALCULATION"); r++;
      sc(ws.getCell(r,1),{val:"sqrt(22.5 x EPS x Book Value)",border:true});
      sc(ws.getCell(r,2),{val:g.fairValue!==null?+g.fairValue.toFixed(2):"N/A",bg:GRN,h:"right",border:true});
      ws.getRow(r).height=16; r++;
      if(g.eps>0&&g.bookValue>0){
        sc(ws.getCell(r,1),{val:`sqrt(22.5 x $${fmt2(g.eps)} x $${fmt2(g.bookValue)})`,border:true});
        sc(ws.getCell(r,2),{val:g.fairValue!==null?+g.fairValue.toFixed(2):"N/A",bg:GRN,h:"right",border:true});
        ws.getRow(r).height=16; r++;
      }
      blankRow(ws,r); r++;

      secRow(ws,r,NC,"RESULT"); r++;
      calcRow(ws,r,"Graham Fair Value / Share",g.fairValue!==null?+g.fairValue.toFixed(2):"N/A",true); r++;
      sc(ws.getCell(r,1),{val:"Current Market Price",border:true});
      sc(ws.getCell(r,2),{val:+p.toFixed(2),h:"right",border:true});
      ws.getRow(r).height=16; r++;
      pctRow(ws,r,"Upside / (Downside)",vsP(g.fairValue)); r++;
      blankRow(ws,r); r++;
      sc(ws.getCell(r,1),{val:`Note: ${g.note}`,italic:true,fg:TEAL,wrap:true});
      ws.getRow(r).height=36;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SHEET 5 — EV/EBITDA
    // ─────────────────────────────────────────────────────────────────────────
    {
      const NC=2;
      const ws:any = wb.addWorksheet("EV-EBITDA");
      ws.columns = [{width:38},{width:30}];
      let r=1;
      const fairEV = ev.ebitda*ev.sectorMultiple;
      const fairEq = fairEV-ev.totalDebt+ev.cash;

      hdrRow(ws,r,NC,`${ticker}  —  EV/EBITDA Valuation`); r++;
      hdrRow(ws,r,NC,`Weight: ${wt(ev.weight)}   |   Sector: ${data.sector||"—"}`,true); r++;
      blankRow(ws,r); r++;

      secRow(ws,r,NC,"INPUTS"); r++;
      inputRow(ws,r,"EBITDA",B(ev.ebitda)); r++;
      inputRow(ws,r,"Market Capitalisation",B(ev.marketCap)); r++;
      inputRow(ws,r,"Total Debt",B(ev.totalDebt)); r++;
      inputRow(ws,r,"Cash & Equivalents",B(ev.cash)); r++;
      inputRow(ws,r,"Sector Median EV/EBITDA",`${ev.sectorMultiple}x`); r++;
      inputRow(ws,r,"Shares Outstanding",ev.shares>0?`${(ev.shares/1e9).toFixed(2)}B`:"N/A"); r++;
      blankRow(ws,r); r++;

      secRow(ws,r,NC,"EV BRIDGE"); r++;
      sc(ws.getCell(r,1),{val:"Current EV/EBITDA Multiple",border:true});
      sc(ws.getCell(r,2),{val:ev.currentMultiple>0?`${ev.currentMultiple.toFixed(1)}x`:"N/A",h:"right",border:true});
      ws.getRow(r).height=16; r++;
      sc(ws.getCell(r,1),{val:"Fair EV = EBITDA x Sector Median",border:true});
      sc(ws.getCell(r,2),{val:B(fairEV),bg:GRN,h:"right",border:true});
      ws.getRow(r).height=16; r++;
      sc(ws.getCell(r,1),{val:"Less: Total Debt",border:true});
      sc(ws.getCell(r,2),{val:`(${B(ev.totalDebt)})`,h:"right",border:true});
      ws.getRow(r).height=16; r++;
      sc(ws.getCell(r,1),{val:"Plus: Cash & Equivalents",border:true});
      sc(ws.getCell(r,2),{val:B(ev.cash),h:"right",border:true});
      ws.getRow(r).height=16; r++;
      sc(ws.getCell(r,1),{val:"= Fair Equity Value",bold:true,border:true});
      sc(ws.getCell(r,2),{val:B(Math.max(0,fairEq)),bg:GRN,bold:true,h:"right",border:true});
      ws.getRow(r).height=18; r++;
      blankRow(ws,r); r++;

      secRow(ws,r,NC,"RESULT"); r++;
      calcRow(ws,r,"EV/EBITDA Fair Value / Share",ev.fairValue!==null?+ev.fairValue.toFixed(2):"N/A",true); r++;
      sc(ws.getCell(r,1),{val:"Current Market Price",border:true});
      sc(ws.getCell(r,2),{val:+p.toFixed(2),h:"right",border:true});
      ws.getRow(r).height=16; r++;
      pctRow(ws,r,"Upside / (Downside)",vsP(ev.fairValue)); r++;
      blankRow(ws,r); r++;
      sc(ws.getCell(r,1),{val:`Note: ${ev.note}`,italic:true,fg:TEAL,wrap:true});
      ws.getRow(r).height=30;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SHEET 6 — Glossary
    // ─────────────────────────────────────────────────────────────────────────
    {
      const NC=2;
      const ws:any = wb.addWorksheet("Glossary");
      ws.columns = [{width:32},{width:82}];
      let r=1;

      hdrRow(ws,r,NC,"Glossary — Key Terms Explained"); r++;
      hdrRow(ws,r,NC,"No finance degree required",true); r++;
      blankRow(ws,r); r++;
      colHdr(ws,r,["Term","Plain English Definition"]); r++;

      ([
        ["EPS (Earnings Per Share)",`Net profit / diluted shares. Current for ${name}: $${fmt2(pe.eps)}.`],
        ["P/E Ratio","Price / EPS. How much investors pay per $1 of annual earnings."],
        ["Book Value per Share","(Total Assets minus Liabilities) / Shares. Net accounting value per share."],
        ["Free Cash Flow (FCF)","Cash after all operating costs and capital investments (Operating CF minus CapEx)."],
        ["WACC",`Weighted Average Cost of Capital. Minimum required return. ${(dcf.wacc*100).toFixed(0)}% for ${data.sector||"this sector"}.`],
        ["DCF (Discounted Cash Flow)","Values a company by projecting future cash flows and discounting to today's value."],
        ["Terminal Value","Estimated value of all cash flows from Year 6 onward (Gordon Growth Model)."],
        ["Enterprise Value (EV)","Market Cap plus Debt minus Cash. Total theoretical acquisition cost."],
        ["EBITDA","Earnings Before Interest, Taxes, Depreciation and Amortisation."],
        [`EV/EBITDA (Sector ${ev.sectorMultiple}x)`,`Sector median: ${ev.sectorMultiple}x. Current: ${ev.currentMultiple>0?ev.currentMultiple.toFixed(1)+"x":"N/A"}.`],
        ["Graham Number","sqrt(22.5 x EPS x Book Value). Max fair price per Graham's formula."],
        [`Sector Fair P/E (${pe.fairPE}x)`,`Historical average P/E for ${data.sector||"this sector"}.`],
        ["Weighted AI Verdict","Combines model outputs weighted by applicability. Excluded models do not affect the result."],
        ["DISCLAIMER","Generated automatically by Vela.ai. For educational purposes only. Not financial advice."],
      ] as [string,string][]).forEach(([term,def],i)=>{
        const bg = i%2===0 ? WHT : "FFF5F9FF";
        sc(ws.getCell(r,1),{val:term,bold:true,bg,border:true});
        sc(ws.getCell(r,2),{val:def,bg,wrap:true,border:true});
        ws.getRow(r).height=30; r++;
      });
    }

    // ── Download ───────────────────────────────────────────────────────────────
    const buf  = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `Vela_${ticker}_Valuation.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(()=> URL.revokeObjectURL(url), 10_000);
  }

  // ── Shared header ────────────────────────────────────────────────────────────
  const tickerDisplay = ticker.replace(/\.(DE|PA|L|AS|SW|CO|MI)$/, "");

  const headerEl = (
    <div className="px-4 pt-4 pb-3" style={{ borderBottom: "1px solid #F0F9FF" }}>
      <div className="flex items-center justify-between">
        <div>
          <p className="font-bold text-sm" style={{ color: "#1E3A5F" }}>
            {tickerDisplay}
            <span className="font-normal text-xs ml-1.5" style={{ color: "#64748B" }}>— {name}</span>
          </p>
          <p className="text-xs mt-0.5" style={{ color: "#94A3B8" }}>
            {t("Current price", "Prezzo attuale")}: {currSym}{fmt2(price)}
            {"  ·  "}
            {t("Your P&L", "Il tuo P&L")}: <span style={{ color: pctGain >= 0 ? "#16A34A" : "#DC2626" }}>{pctGain >= 0 ? "+" : ""}{pctGain.toFixed(1)}%</span>
          </p>
        </div>
        {/* Excel button — unlocked for free biggest holding or premium users */}
        {!isSimple && (
          (isLargestHolding || isPremium) ? (
            <button
              onClick={downloadExcel}
              disabled={!data || loading}
              title={t("Download valuation model as Excel", "Scarica il modello di valutazione in Excel")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-opacity disabled:opacity-40"
              style={{ backgroundColor: "#F0F9FF", color: "#0EA5E9", border: "1px solid #BAE6FD" }}>
              📥 {t("Excel", "Excel")}
            </button>
          ) : (
            <button disabled
              title={t("Upgrade to Premium to download Excel for all holdings", "Passa a Premium per scaricare l'Excel per tutti i titoli")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold cursor-not-allowed"
              style={{ backgroundColor: "#F8FAFC", color: "#CBD5E1", border: "1px solid #E2E8F0" }}>
              🔒 {t("Excel", "Excel")}
            </button>
          )
        )}
      </div>
    </div>
  );

  // ── Full card model data ──────────────────────────────────────────────────────
  const fullModels = data ? [
    { label: t("Graham Number", "Graham Number"), value: data.graham.fairValue, weight: data.graham.weight, note: data.graham.note, icon: "📐" },
    { label: t("P/E Model",     "Modello P/E"),   value: data.pe.fairValue,     weight: data.pe.weight,     note: data.pe.note,     icon: "📊" },
    { label: t("DCF",           "DCF"),            value: data.dcf.fairValue,    weight: data.dcf.weight,    note: data.dcf.note,    icon: "🔢" },
    { label: t("EV/EBITDA",     "EV/EBITDA"),      value: data.evEbitda.fairValue, weight: data.evEbitda.weight, note: data.evEbitda.note, icon: "🏢" },
  ] : [];

  const verdict   = data?.verdict;
  const vPct      = verdict?.vsCurrentPct ?? null;
  const vColor    = pctColor(vPct);
  const totalWt   = verdict?.totalWeight ?? 0;

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="rounded-2xl overflow-hidden shadow-sm"
      style={{ backgroundColor: "white", border: "1px solid #E0F2FE" }}>

      {headerEl}

      {/* ── Loading states ── */}
      {/* Only show "queued" message if the wait is long (> 5 s) — short stagger looks like normal loading */}
      {queued && !data && staggerMs > 5_000 && (
        <div className="px-4 py-6 text-center">
          <p className="text-xs animate-pulse" style={{ color: "#94A3B8" }}>
            ⏳ {t("Queued — loading shortly…", "In coda — caricamento a breve…")}
          </p>
        </div>
      )}
      {loading && (
        <div className="px-4 py-6 text-center">
          <p className="text-xs animate-pulse" style={{ color: "#94A3B8" }}>
            {t("Running valuation models…", "Calcolo modelli di valutazione…")}
          </p>
        </div>
      )}

      {/* ── Error ── */}
      {error && !loading && (
        <div className="px-4 py-4">
          {error === "rate_limited" ? (
            <div className="text-center space-y-1">
              <p className="text-xs" style={{ color: "#94A3B8" }}>
                ⏳ {t("Too many requests — auto-retrying in", "Troppe richieste — nuovo tentativo tra")}{" "}
                <span className="font-bold" style={{ color: "#0EA5E9" }}>{retryIn ?? "…"}s</span>
              </p>
              <button onClick={doFetch} className="text-xs underline" style={{ color: "#0EA5E9" }}>
                {t("Retry now", "Riprova ora")}
              </button>
            </div>
          ) : error === "international_unavailable" ? (
            <div className="rounded-xl p-4 text-center space-y-2" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <p className="text-lg">🌍</p>
              <p className="text-xs font-semibold" style={{ color: "#E2E8F0" }}>
                {t("International stock", "Titolo internazionale")}
              </p>
              <p className="text-xs" style={{ color: "#94A3B8" }}>
                {t(
                  "Full valuation analysis (DCF, P/E, Graham, EV/EBITDA) is currently available for US-listed stocks only. We're working on expanding coverage to European markets.",
                  "L'analisi di valutazione completa (DCF, P/E, Graham, EV/EBITDA) è attualmente disponibile solo per i titoli quotati negli USA. Stiamo lavorando per estendere la copertura ai mercati europei."
                )}
              </p>
            </div>
          ) : (
            <p className="text-xs text-center" style={{ color: "#EF4444" }}>⚠️ {error}</p>
          )}
        </div>
      )}

      {/* ── ETF info card ── */}
      {data?.isETF && (
        <div className="px-4 pt-3 pb-4 space-y-3">
          {/* ETF header chip */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: "#E0F2FE", color: "#0EA5E9" }}>🏦 ETF</span>
            {data.etfInfo?.categoryName && (
              <span className="text-xs" style={{ color: "#64748B" }}>{data.etfInfo.categoryName}</span>
            )}
            {/* Accumulating / Distributing badge */}
            {(() => {
              const isAcc = !data.etfInfo?.dividendYield || data.etfInfo.dividendYield === 0;
              return (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={{
                    backgroundColor: isAcc ? "rgba(74,222,128,0.15)" : "rgba(251,191,36,0.15)",
                    color:           isAcc ? "#4ADE80" : "#FBBF24",
                    border:          `1px solid ${isAcc ? "rgba(74,222,128,0.3)" : "rgba(251,191,36,0.3)"}`,
                  }}>
                  {isAcc
                    ? t("Accumulating", "Accumulante")
                    : t("Distributing", "Distribuente")}
                </span>
              );
            })()}
          </div>

          {/* Acc/Dist plain-English note */}
          {(() => {
            const isAcc = !data.etfInfo?.dividendYield || data.etfInfo.dividendYield === 0;
            const yieldPct = data.etfInfo?.dividendYield
              ? (data.etfInfo.dividendYield * 100).toFixed(2)
              : null;
            return (
              <div className="rounded-xl px-3 py-2"
                style={{ backgroundColor: isAcc ? "rgba(74,222,128,0.06)" : "rgba(251,191,36,0.06)",
                         border: `1px solid ${isAcc ? "rgba(74,222,128,0.15)" : "rgba(251,191,36,0.15)"}` }}>
                <p className="text-xs leading-relaxed" style={{ color: "#94A3B8" }}>
                  {isAcc
                    ? t(
                        "♻️ Dividends are reinvested automatically — your shares grow in value over time without you doing anything.",
                        "♻️ I dividendi vengono reinvestiti automaticamente — le tue quote crescono di valore nel tempo senza che tu faccia nulla."
                      )
                    : t(
                        `💸 Dividends are paid out to you as cash (${yieldPct ?? "—"}% yield/yr). Useful for income, but you'll need to reinvest manually to maximise compounding.`,
                        `💸 I dividendi vengono pagati a te in contanti (rendimento ${yieldPct ?? "—"}%/anno). Utile per il reddito, ma dovrai reinvestire manualmente per massimizzare il rendimento composto.`
                      )}
                </p>
              </div>
            );
          })()}

          {/* Key metrics grid */}
          <div className="grid grid-cols-2 gap-2">
            {/* AUM */}
            {data.etfInfo?.totalAssets != null && (
              <div className="rounded-xl p-3" style={{ backgroundColor: "#F0F9FF", border: "1px solid #BAE6FD" }}>
                <p className="text-xs" style={{ color: "#94A3B8" }}>{t("AUM", "Patrimonio Gestito")}</p>
                <p className="text-sm font-bold mt-0.5" style={{ color: "#1E3A5F" }}>
                  ${(data.etfInfo.totalAssets / 1e9).toFixed(1)}B
                </p>
              </div>
            )}
            {/* Expense ratio */}
            <div className="rounded-xl p-3" style={{ backgroundColor: "#F0F9FF", border: "1px solid #BAE6FD" }}>
              <p className="text-xs" style={{ color: "#94A3B8" }}>{t("Annual Fee (TER)", "Costo Annuale (TER)")}</p>
              <p className="text-sm font-bold mt-0.5" style={{ color: "#1E3A5F" }}>
                {data.etfInfo?.expenseRatio != null
                  ? `${(data.etfInfo.expenseRatio * 100).toFixed(2)}%`
                  : "—"}
              </p>
            </div>
            {/* Dividend yield */}
            {data.etfInfo?.dividendYield != null && data.etfInfo.dividendYield > 0 && (
              <div className="rounded-xl p-3" style={{ backgroundColor: "#F0F9FF", border: "1px solid #BAE6FD" }}>
                <p className="text-xs" style={{ color: "#94A3B8" }}>{t("Dividend Yield", "Rendimento Dividendi")}</p>
                <p className="text-sm font-bold mt-0.5" style={{ color: "#16A34A" }}>
                  {(data.etfInfo.dividendYield * 100).toFixed(2)}%
                </p>
              </div>
            )}
            {/* 52-week range */}
            {data.etfInfo?.fiftyTwoWkLow != null && data.etfInfo?.fiftyTwoWkHigh != null && (
              <div className="rounded-xl p-3" style={{ backgroundColor: "#F0F9FF", border: "1px solid #BAE6FD" }}>
                <p className="text-xs" style={{ color: "#94A3B8" }}>{t("52-Week Range", "Range 52 Settimane")}</p>
                <p className="text-sm font-bold mt-0.5" style={{ color: "#1E3A5F" }}>
                  {currSym}{fmt2(data.etfInfo.fiftyTwoWkLow)} – {currSym}{fmt2(data.etfInfo.fiftyTwoWkHigh)}
                </p>
                {/* Price position bar */}
                {(() => {
                  const lo = data.etfInfo!.fiftyTwoWkLow!;
                  const hi = data.etfInfo!.fiftyTwoWkHigh!;
                  const pct = hi > lo ? Math.round(((price - lo) / (hi - lo)) * 100) : 50;
                  return (
                    <div className="mt-1.5 h-1 rounded-full" style={{ backgroundColor: "#E0F2FE" }}>
                      <div className="h-1 rounded-full" style={{ width: `${pct}%`, backgroundColor: "#0EA5E9" }} />
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          <p className="text-xs text-center" style={{ color: "#CBD5E1" }}>
            {t("Valuation models don't apply to ETFs — ETFs track an index, not earnings", "I modelli di valutazione non si applicano agli ETF che replicano un indice")}
          </p>
        </div>
      )}

      {/* ── Crypto info card ── */}
      {data?.isCrypto && data.cryptoData && (
        <div className="px-4 pt-3 pb-4 space-y-3">
          {/* Crypto header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                style={{ backgroundColor: "#FEF9C3", color: "#CA8A04" }}>₿ Crypto</span>
              {data.cryptoData.marketCapRank > 0 && (
                <span className="text-xs" style={{ color: "#94A3B8" }}>
                  #{data.cryptoData.marketCapRank} {t("by market cap", "per cap. di mercato")}
                </span>
              )}
            </div>
          </div>

          {/* Performance row */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: t("24h", "24h"),  val: data.cryptoData.change24h },
              { label: t("7 days", "7 giorni"), val: data.cryptoData.change7d },
              { label: t("30 days", "30 giorni"), val: data.cryptoData.change30d },
            ].map(({ label, val }) => (
              <div key={label} className="rounded-xl p-2.5 text-center"
                style={{ backgroundColor: "#F8FAFC", border: "1px solid #E2E8F0" }}>
                <p className="text-xs" style={{ color: "#94A3B8" }}>{label}</p>
                <p className="text-sm font-bold mt-0.5"
                  style={{ color: val >= 0 ? "#16A34A" : "#DC2626" }}>
                  {val >= 0 ? "+" : ""}{val.toFixed(1)}%
                </p>
              </div>
            ))}
          </div>

          {/* Market cap + supply */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl p-3" style={{ backgroundColor: "#F0F9FF", border: "1px solid #BAE6FD" }}>
              <p className="text-xs" style={{ color: "#94A3B8" }}>{t("Market Cap", "Cap. di Mercato")}</p>
              <p className="text-sm font-bold mt-0.5" style={{ color: "#1E3A5F" }}>
                ${(data.cryptoData.marketCap / 1e9).toFixed(1)}B
              </p>
            </div>
            <div className="rounded-xl p-3" style={{ backgroundColor: "#F0F9FF", border: "1px solid #BAE6FD" }}>
              <p className="text-xs" style={{ color: "#94A3B8" }}>{t("vs All-Time High", "vs Massimo Storico")}</p>
              <p className="text-sm font-bold mt-0.5"
                style={{ color: data.cryptoData.athChangePercent >= 0 ? "#16A34A" : "#DC2626" }}>
                {data.cryptoData.athChangePercent.toFixed(1)}%
              </p>
            </div>
          </div>

          {/* Circulating supply */}
          {data.cryptoData.circulatingSupply > 0 && (
            <div className="rounded-xl p-3" style={{ backgroundColor: "#F8FAFC", border: "1px solid #E2E8F0" }}>
              <div className="flex justify-between items-center">
                <p className="text-xs" style={{ color: "#94A3B8" }}>
                  {t("Circulating Supply", "Offerta Circolante")}
                </p>
                <p className="text-xs font-medium" style={{ color: "#64748B" }}>
                  {(data.cryptoData.circulatingSupply / 1e6).toFixed(1)}M {ticker}
                </p>
              </div>
              {data.cryptoData.totalSupply != null && data.cryptoData.totalSupply > 0 && (
                <>
                  <div className="mt-1.5 h-1.5 rounded-full" style={{ backgroundColor: "#E2E8F0" }}>
                    <div className="h-1.5 rounded-full" style={{
                      width: `${Math.min(100, (data.cryptoData.circulatingSupply / data.cryptoData.totalSupply) * 100).toFixed(0)}%`,
                      backgroundColor: "#CA8A04"
                    }} />
                  </div>
                  <p className="text-xs mt-1" style={{ color: "#CBD5E1" }}>
                    {((data.cryptoData.circulatingSupply / data.cryptoData.totalSupply) * 100).toFixed(0)}% {t("of max supply", "dell'offerta massima")}
                  </p>
                </>
              )}
            </div>
          )}

          <p className="text-xs text-center" style={{ color: "#CBD5E1" }}>
            {t("Traditional valuation models don't apply to cryptoassets", "I modelli di valutazione tradizionali non si applicano alle criptovalute")}
          </p>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ── SIMPLE card (non-free tickers): P/E only + premium lock ── */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ── Bond / fixed income card ── */}
      {data?.isBond && (
        <div className="px-4 pt-3 pb-4">
          <div className="rounded-xl p-4 text-center space-y-2"
            style={{ backgroundColor: "#F8FAFC", border: "1px solid #E2E8F0" }}>
            <p className="text-2xl">📄</p>
            <p className="text-xs font-semibold" style={{ color: "#334155" }}>
              {t("Fixed Income / Bond", "Reddito Fisso / Obbligazione")}
            </p>
            <p className="text-xs leading-relaxed" style={{ color: "#94A3B8" }}>
              {t(
                "Equity valuation models (DCF, P/E, Graham, EV/EBITDA) do not apply to bonds. Track this position for P&L purposes — coupon payments and yield-to-maturity analysis are not yet supported.",
                "I modelli di valutazione azionaria non si applicano alle obbligazioni. Monitora questa posizione per il P&L — i pagamenti cedolari e il rendimento a scadenza non sono ancora supportati."
              )}
            </p>
          </div>
        </div>
      )}

      {isSimple && data && !data.isETF && !data.isCrypto && !data.isBond && (
        <div className="px-4 pt-3 pb-3 space-y-2">

          {/* P/E comparison block */}
          <div className="rounded-xl p-3" style={{ backgroundColor: "#F0F9FF", border: "1px solid #BAE6FD" }}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold" style={{ color: "#1E3A5F" }}>
                📊 {t("P/E Fair Value", "Valore P/E")}
              </p>
              {data.pe.trailingPE > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: "#E0F2FE", color: "#0EA5E9" }}>
                  {data.pe.trailingPE.toFixed(1)}× {t("current", "attuale")}
                </span>
              )}
            </div>

            {data.pe.fairValue !== null ? (
              <>
                <div className="flex items-baseline gap-3 mb-1">
                  <p className="text-xl font-bold" style={{ color: "#1E3A5F" }}>
                    {currSym}{fmt2(data.pe.fairValue)}
                  </p>
                  {price > 0 && (() => {
                    const pePct = (data.pe.fairValue! - price) / price * 100;
                    return (
                      <p className="text-sm font-bold" style={{ color: pctColor(pePct) }}>
                        {pePct >= 0 ? "+" : ""}{pePct.toFixed(1)}% {t("vs price", "vs prezzo")}
                      </p>
                    );
                  })()}
                </div>
                <p className="text-xs" style={{ color: "#64748B" }}>
                  {t("Sector fair P/E", "P/E equo settore")}: {data.pe.fairPE}×
                  {data.pe.eps > 0 && ` · EPS: ${currSym}${fmt2(data.pe.eps)}`}
                </p>
              </>
            ) : (
              <p className="text-sm font-medium" style={{ color: "#94A3B8" }}>
                {t("P/E not applicable (negative EPS)", "P/E non applicabile (EPS negativo)")}
              </p>
            )}
          </div>

          {/* Premium lock CTA */}
          <div className="rounded-xl p-3" style={{ background: "linear-gradient(135deg, #1E3A5F, #1e1b4b)" }}>
            <p className="text-xs font-semibold text-white mb-0.5">
              🔒 {t("Full Analysis — Premium", "Analisi Completa — Premium")}
            </p>
            <p className="text-xs mb-2" style={{ color: "#BAE6FD" }}>
              {t("DCF · Graham Number · EV/EBITDA · Excel Export", "DCF · Graham Number · EV/EBITDA · Export Excel")}
            </p>
            <p className="text-xs" style={{ color: "#A5B4FC" }}>
              {t("Open your profile to upgrade — €9.99/mo · 7-day free trial",
                 "Apri il profilo per aggiornare — €9,99/mese · 7 giorni gratis")}
            </p>
          </div>

          <p className="text-xs text-center" style={{ color: "#CBD5E1" }}>
            {t("Model estimates only — not financial advice", "Solo stime modellistiche — non consulenza finanziaria")}
          </p>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ── FULL card: all 4 models + verdict + notes ── */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {!isSimple && data && !data.isETF && !data.isCrypto && !data.isBond && (
        <div className="px-4 pt-3 pb-2">
          <div className="grid grid-cols-2 gap-2 mb-3">
            {fullModels.map(m => {
              const vsPct = m.value !== null && price > 0 ? (m.value - price) / price * 100 : null;
              const isNA  = m.weight === 0;
              return (
                <div key={m.label} className="rounded-xl p-3"
                  style={{ backgroundColor: isNA ? "#F8FAFC" : "#F0F9FF", border: `1px solid ${isNA ? "#E2E8F0" : "#BAE6FD"}` }}>
                  <p className="text-xs font-semibold mb-1" style={{ color: isNA ? "#94A3B8" : "#1E3A5F" }}>
                    {m.icon} {m.label}
                  </p>
                  {m.value !== null ? (
                    <>
                      <p className="text-base font-bold" style={{ color: isNA ? "#94A3B8" : "#1E3A5F" }}>
                        {currSym}{fmt2(m.value)}
                      </p>
                      <p className="text-xs font-medium" style={{ color: pctColor(vsPct) }}>
                        {vsPct !== null ? `${vsPct >= 0 ? "+" : ""}${vsPct.toFixed(1)}% vs price` : ""}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm font-bold" style={{ color: "#CBD5E1" }}>N/A</p>
                  )}
                  {isNA && (
                    <p className="text-xs mt-0.5" style={{ color: "#CBD5E1" }}>{t("weight: 0%", "peso: 0%")}</p>
                  )}
                  {!isNA && totalWt > 0 && (
                    <p className="text-xs mt-0.5" style={{ color: "#94A3B8" }}>
                      {t("weight", "peso")}: {Math.round((m.weight / totalWt) * 100)}%
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {/* AI Verdict */}
          {verdict?.weightedFairValue && (
            <div className="rounded-xl p-3 mb-3" style={{ backgroundColor: "#1E3A5F" }}>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-semibold text-white">🤖 {t("AI Verdict", "Verdetto AI")}</p>
                <p className="text-xs font-bold" style={{ color: vColor }}>
                  {vPct !== null ? `${vPct >= 0 ? "+" : ""}${vPct.toFixed(1)}%` : ""}
                </p>
              </div>
              <div className="flex items-baseline gap-2">
                <p className="text-xl font-bold text-white">{currSym}{fmt2(verdict.weightedFairValue)}</p>
                <p className="text-xs" style={{ color: "#BAE6FD" }}>{t("weighted fair value", "valore equo ponderato")}</p>
              </div>
              <p className="text-xs mt-1 font-medium" style={{ color: vColor }}>{verdict.recommendation}</p>
            </div>
          )}

          {/* Model notes */}
          <div className="space-y-1 mb-3">
            {fullModels.map(m => (
              <div key={m.label} className="flex gap-2 items-start">
                <span className="text-xs flex-shrink-0" style={{ color: "#94A3B8" }}>{m.icon}</span>
                <p className="text-xs leading-relaxed" style={{ color: "#94A3B8" }}>
                  <span className="font-medium">{m.label}:</span> {m.note}
                </p>
              </div>
            ))}
          </div>

          <p className="text-xs text-center pb-1" style={{ color: "#CBD5E1" }}>
            {t("Model estimates only — not financial advice", "Solo stime modellistiche — non consulenza finanziaria")}
          </p>
        </div>
      )}
    </div>
  );
}
