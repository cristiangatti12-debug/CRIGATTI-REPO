// Run with: node scripts/generate-sample-valuation.mjs
import ExcelJS from "exceljs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─────────────────────────────────────────────────────────────────────────────
// AAPL sample data (realistic 2025/2026 figures)
// ─────────────────────────────────────────────────────────────────────────────
const ticker = "AAPL";
const name   = "Apple Inc.";
const price  = 210.00;
const sector = "Technology";

// Raw financials (as pulled from Yahoo Finance / public filings)
const raw = {
  operatingCashFlow: 110e9,   // Cash Flow Statement
  capex:              11e9,   // Cash Flow Statement (capital expenditures)
  netIncome:          97e9,   // Income Statement
  sharesOutstanding: 15.2e9,  // Balance Sheet
  totalAssets:       353e9,   // Balance Sheet
  totalLiabilities:  308e9,   // Balance Sheet
  totalDebt:         101e9,   // Balance Sheet (short-term + long-term debt)
  cash:               65e9,   // Balance Sheet (cash + short-term investments)
  ebitda:            137e9,   // Income Statement (EBIT + D&A)
  marketCap:         3.2e12,  // Market Price × Shares Outstanding
  trailingPE:         33.1,   // Market Price ÷ EPS
};

// Derived metrics
const fcfTotal   = raw.operatingCashFlow - raw.capex;                        // $99B
const fcfPS      = +(fcfTotal / raw.sharesOutstanding).toFixed(2);           // $6.51/share
const eps        = +(raw.netIncome / raw.sharesOutstanding).toFixed(2);      // $6.38/share
const bookValPS  = +((raw.totalAssets - raw.totalLiabilities) / raw.sharesOutstanding).toFixed(2); // ~$2.96
const ev         = raw.marketCap + raw.totalDebt - raw.cash;                 // Enterprise value

// Model assumptions (sector defaults for Technology)
const growthRate  = 0.08;   // 8% — analyst consensus EPS growth estimate
const termGrowth  = 0.03;   // 3% — long-term GDP growth assumption
const wacc        = 0.09;   // 9% — Technology sector WACC
const fairPE      = 28;     // Technology sector historical fair P/E
const evMultiple  = 22;     // Technology sector median EV/EBITDA

// ── Model calculations ────────────────────────────────────────────────────────

// Graham Number
const grahamFV = +(Math.sqrt(22.5 * eps * Math.max(bookValPS, 0))).toFixed(2);
const grahamWt = 0; // asset-light

// P/E Model
const peFV = +(eps * fairPE).toFixed(2);
const peWt = 2;

// DCF — horizontal projection
const dcfYears = [];
let fcfCurrent = fcfPS;
for (let y = 1; y <= 5; y++) {
  fcfCurrent = +(fcfCurrent * (1 + growthRate)).toFixed(2);
  const pv = +(fcfCurrent / Math.pow(1 + wacc, y)).toFixed(2);
  dcfYears.push({ year: y, fcf: fcfCurrent, pv, discFactor: +((1 / Math.pow(1 + wacc, y)).toFixed(4)) });
}
const fcf5      = dcfYears[4].fcf;
const termV     = +(fcf5 * (1 + termGrowth) / (wacc - termGrowth)).toFixed(2);
const pvTerm    = +(termV / Math.pow(1 + wacc, 5)).toFixed(2);
const sumPV     = +(dcfYears.reduce((s, y) => s + y.pv, 0)).toFixed(2);
const dcfFV     = +(sumPV + pvTerm).toFixed(2);
const dcfWt     = 3;

// EV/EBITDA
const fairEV    = raw.ebitda * evMultiple;
const fairEq    = fairEV - raw.totalDebt + raw.cash;
const evFV      = +(fairEq / raw.sharesOutstanding).toFixed(2);
const evWt      = 2;

// Weighted verdict (only applicable models)
const models = [
  { v: peFV,  w: peWt  },
  { v: dcfFV, w: dcfWt },
  { v: evFV,  w: evWt  },
];
const totalW = models.reduce((s, m) => s + m.w, 0);
const wfv    = +(models.reduce((s, m) => s + m.v * m.w, 0) / totalW).toFixed(2);
const vsPct  = +((wfv - price) / price * 100).toFixed(1);
const rec    = vsPct > 25 ? "Significantly undervalued" :
               vsPct > 10 ? "Moderately undervalued"    :
               vsPct > -10? "Fairly valued / priced for perfection" :
               vsPct > -25? "Moderately overvalued"     : "Significantly overvalued";
const emoji  = vsPct > 10 ? "🟢" : vsPct > -10 ? "🟡" : "🔴";

// ─────────────────────────────────────────────────────────────────────────────
// STYLE HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const C = {
  navy:      "FF1E3A5F",
  blue:      "FF0EA5E9",
  navyMid:   "FF1E40AF",
  lightBlue: "FFE0F2FE",
  paleBlue:  "FFF0F9FF",
  yellow:    "FFFEF9C3",
  yellowBdr: "FFFBBF24",
  green:     "FFF0FDF4",  greenTxt: "FF16A34A",
  red:       "FFFEF2F2",  redTxt:   "FFDC2626",
  amber:     "FFFEF3C7",  amberTxt: "FFD97706",
  white:     "FFFFFFFF",  offWhite: "FFF8FAFC",
  darkText:  "FF1E293B",  midText:  "FF64748B",  lightText: "FF94A3B8",
  border:    "FFE2E8F0",  borderMid:"FFBAE6FD",
  slate:     "FF475569",
};

const FONT = "Calibri";
const fill = argb => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const bdr  = (argb = C.border) => { const s = { style:"thin", color:{ argb } }; return { top:s, bottom:s, left:s, right:s }; };
const bdrB = (argb = C.border) => ({ bottom: { style:"thin", color:{ argb } } });

function s(cell, { bg, fg=C.darkText, bold=false, italic=false, sz=10, ha="left", va="middle", wrap=false, numFmt, border: bd } = {}) {
  if (bg) cell.fill = fill(bg);
  cell.font      = { name: FONT, size: sz, bold, italic, color: { argb: fg } };
  cell.alignment = { horizontal: ha, vertical: va, wrapText: wrap };
  if (numFmt) cell.numFmt = numFmt;
  if (bd)     cell.border = bd;
}

// Preset styles
const sTitle   = c => s(c, { bg:C.navy,      fg:C.white,    bold:true,  sz:13, ha:"center" });
const sSec     = c => s(c, { bg:C.navy,      fg:C.white,    bold:true,  sz:10, ha:"left",  border:bdr(C.navy) });
const sSub     = c => s(c, { bg:C.navyMid,   fg:C.white,    bold:true,  sz:10, ha:"left",  border:bdr(C.navyMid) });
const sInpLbl  = c => s(c, { bg:C.yellow,    fg:C.darkText, sz:10,      ha:"left",  border:bdr(C.yellowBdr) });
const sInpVal  = c => s(c, { bg:C.yellow,    fg:"FF1D4ED8", bold:true,  sz:10, ha:"right", border:bdr(C.yellowBdr) });
const sInpFrm  = c => s(c, { bg:"FFFFFDE7",  fg:C.midText,  sz:9, italic:true,  ha:"left",  border:bdr(C.yellowBdr) });
const sCalc    = c => s(c, { bg:C.white,     fg:C.darkText, sz:10, ha:"left",   border:bdr() });
const sCalcV   = c => s(c, { bg:C.white,     fg:C.darkText, sz:10, ha:"right",  border:bdr() });
const sCalcFrm = c => s(c, { bg:C.paleBlue,  fg:C.midText,  sz:9,  italic:true, ha:"left",  border:bdr(C.borderMid) });
const sNote    = c => s(c, { bg:C.paleBlue,  fg:C.midText,  sz:9,  italic:true, wrap:true });
const sGrey    = c => s(c, { bg:C.offWhite,  fg:C.lightText,sz:10, ha:"left",   border:bdr() });
const sGreyV   = c => s(c, { bg:C.offWhite,  fg:C.lightText,sz:10, ha:"right",  border:bdr() });
const sGreyFrm = c => s(c, { bg:C.offWhite,  fg:C.lightText,sz:9,  italic:true, ha:"left",  border:bdr() });

function sResult(cell, value, ref, opts = {}) {
  const pct = ref > 0 ? (value - ref) / ref * 100 : 0;
  const [bg, fg] = pct > 10 ? [C.green, C.greenTxt] : pct > -10 ? [C.amber, C.amberTxt] : [C.red, C.redTxt];
  s(cell, { bg, fg, bold:true, ha:"right", border:bdr(fg), ...opts });
}

const fmtUSD  = '"$"#,##0.00';
const fmtPct  = '+0.0%;-0.0%';
const fmtMult = '0.0"×"';
const fv  = v => `$${v.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const fmtB = v => `$${(v/1e9).toFixed(2)}B`;
const pStr = v => `${v>=0?"+":""}${v.toFixed(1)}%`;
const wtStr = (w,tot) => tot>0&&w>0 ? `${Math.round(w/tot*100)}%` : "0% — excluded";

// ─────────────────────────────────────────────────────────────────────────────
// WORKBOOK
// ─────────────────────────────────────────────────────────────────────────────
const wb = new ExcelJS.Workbook();
wb.creator = "Vela.ai"; wb.created = new Date();

// ═════════════════════════════════════════════════════════════════════════════
// SHEET 1 — SUMMARY
// ═════════════════════════════════════════════════════════════════════════════
{
  const ws = wb.addWorksheet("📊 Summary", { views:[{showGridLines:false}] });
  ws.getColumn("A").width = 28;
  ws.getColumn("B").width = 20;
  ws.getColumn("C").width = 20;
  ws.getColumn("D").width = 18;
  ws.getColumn("E").width = 58;

  let r = 1;

  // Title
  ws.mergeCells(`A${r}:E${r}`); ws.getRow(r).height = 36;
  const t = ws.getCell(`A${r}`);
  t.value = `  📈  ${ticker} — ${name}   |   AI Valuation Report by Vela.ai`;
  sTitle(t); r++;

  ws.mergeCells(`A${r}:E${r}`); ws.getRow(r).height = 16;
  const sub = ws.getCell(`A${r}`);
  sub.value = `  Generated ${new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"long",year:"numeric"})}   ·   For educational purposes only — not financial advice`;
  s(sub, { bg:C.lightBlue, fg:C.midText, italic:true, sz:9, ha:"center" }); r++;

  ws.getRow(r).height = 8; r++;

  // What is this?
  ws.mergeCells(`A${r}:E${r}`); ws.getRow(r).height = 20;
  const wh = ws.getCell(`A${r}`); wh.value = "  💡  WHAT IS THIS REPORT?"; sSec(wh); r++;
  for (const txt of [
    "  This report estimates Apple's fair value using 4 independent financial models used by professional investors and investment banks.",
    "  Each model looks at the company from a different angle. Models that don't apply (e.g. Graham for tech companies) are auto-excluded (weight = 0%).",
    "  The AI Verdict combines the relevant models into one weighted fair value. Use as a reference — not as personal financial advice.",
  ]) {
    ws.mergeCells(`A${r}:E${r}`); ws.getRow(r).height = 15;
    const c = ws.getCell(`A${r}`); c.value = txt;
    s(c, { bg:C.paleBlue, fg:C.darkText, sz:9, italic:true }); r++;
  }

  ws.getRow(r).height = 10; r++;

  // Snapshot
  ws.mergeCells(`A${r}:E${r}`); ws.getRow(r).height = 20;
  const sn = ws.getCell(`A${r}`); sn.value = "  COMPANY SNAPSHOT"; sSec(sn); r++;

  for (const [l1,v1,l2,v2] of [
    ["  Ticker",        ticker,            "  Sector",     sector],
    ["  Current Price", `$${price.toFixed(2)}`,"  Report Date", new Date().toLocaleDateString("en-GB")],
  ]) {
    ws.getRow(r).height = 18;
    const [a,b,c2,d2] = ["A","B","C","D"].map(col => ws.getCell(`${col}${r}`));
    ws.getCell(`E${r}`).fill = fill(C.lightBlue);
    a.value=l1; s(a,{bg:C.lightBlue,fg:C.midText,sz:9});
    b.value=v1; s(b,{bg:C.lightBlue,fg:C.navy,bold:true,sz:10,ha:"right"});
    c2.value=l2; s(c2,{bg:C.lightBlue,fg:C.midText,sz:9});
    d2.value=v2; s(d2,{bg:C.lightBlue,fg:C.navy,bold:true,sz:10,ha:"right"});
    r++;
  }

  ws.getRow(r).height = 10; r++;

  // Table header
  ws.mergeCells(`A${r}:E${r}`); ws.getRow(r).height = 20;
  const th = ws.getCell(`A${r}`); th.value = "  VALUATION RESULTS — ALL MODELS"; sSec(th); r++;

  ws.getRow(r).height = 22;
  for (const [col,hdr,ha] of [["A","  Method","left"],["B","AI Fair Value","right"],["C","vs Current Price","center"],["D","Model Weight","center"],["E","  Notes","left"]]) {
    const c = ws.getCell(`${col}${r}`); c.value = hdr;
    s(c,{bg:C.navyMid,fg:C.white,bold:true,sz:10,ha,border:bdr(C.navyMid)});
  }
  r++;

  const mRows = [
    { method:"📐  Graham Number", fVal:grahamFV, wt:grahamWt,  applicable:false,
      note:"Benjamin Graham's formula works for industrial/asset-heavy companies. Apple's book value is only $2.96/share — the model underestimates value by design. Auto-excluded." },
    { method:"📊  P/E Model",     fVal:peFV,     wt:peWt,      applicable:true,
      note:`EPS $${eps} × sector fair P/E ${fairPE}× = ${fv(peFV)}. Apple's current trailing P/E is ${raw.trailingPE}× — above the historical sector average, suggesting a premium.` },
    { method:"🔢  DCF (Cash Flow)",fVal:dcfFV,   wt:dcfWt,     applicable:true,
      note:`Projects FCF ($${fcfPS}/share) growing at ${(growthRate*100).toFixed(0)}%/yr for 5 years, discounted at ${(wacc*100).toFixed(0)}% WACC. Highest confidence — most comprehensive model.` },
    { method:"🏢  EV/EBITDA",     fVal:evFV,     wt:evWt,      applicable:true,
      note:`Fair EV = EBITDA ${fmtB(raw.ebitda)} × ${evMultiple}× (sector median) = ${fmtB(fairEV)}. After debt/cash adjustment: ${fv(evFV)}/share. Current multiple: ${(ev/raw.ebitda).toFixed(1)}×.` },
  ];

  for (const m of mRows) {
    ws.getRow(r).height = 44;
    const pct = m.applicable ? (m.fVal - price) / price * 100 : null;
    const bg  = m.applicable ? C.white : C.offWhite;
    const fg  = m.applicable ? C.darkText : C.lightText;

    const cA = ws.getCell(`A${r}`); cA.value = m.method;
    s(cA,{bg,fg,bold:m.applicable,sz:10,border:bdr()});

    const cB = ws.getCell(`B${r}`);
    if (m.applicable) { cB.value = m.fVal; cB.numFmt = fmtUSD; sResult(cB, m.fVal, price); }
    else              { cB.value = "Not applicable"; s(cB,{bg:C.offWhite,fg:C.lightText,ha:"center",border:bdr()}); }

    const cC = ws.getCell(`C${r}`);
    if (pct !== null) { cC.value = pct/100; cC.numFmt = fmtPct; sResult(cC, m.fVal, price, {ha:"center"}); }
    else              { cC.value = "⚠️ 0% — excluded"; s(cC,{bg:C.offWhite,fg:C.lightText,ha:"center",border:bdr()}); }

    const cD = ws.getCell(`D${r}`); cD.value = wtStr(m.wt,totalW);
    s(cD,{bg:m.applicable?C.paleBlue:C.offWhite,fg:m.applicable?C.navy:C.lightText,sz:9,ha:"center",border:bdr()});

    const cE = ws.getCell(`E${r}`); cE.value = `  ${m.note}`;
    s(cE,{bg:m.applicable?C.white:C.offWhite,fg:m.applicable?C.midText:C.lightText,sz:9,wrap:true,border:bdr()});
    r++;
  }

  // Verdict row
  ws.getRow(r).height = 30;
  const vPct = vsPct / 100;
  const [cA,cB,cC,cD,cE] = ["A","B","C","D","E"].map(col => ws.getCell(`${col}${r}`));
  cA.value = "  🤖  AI VERDICT (Weighted Average)";
  s(cA,{bg:C.navy,fg:C.white,bold:true,sz:11,border:bdr(C.navy)});
  cB.value = wfv; cB.numFmt = fmtUSD;
  s(cB,{bg:C.navy,fg:C.white,bold:true,sz:13,ha:"right",border:bdr(C.navy)});
  cC.value = vPct; cC.numFmt = fmtPct;
  const vFg = vsPct>10?C.greenTxt:vsPct>-10?"FFFBBF24":C.redTxt;
  s(cC,{bg:C.navy,fg:vFg,bold:true,sz:11,ha:"center",border:bdr(C.navy)});
  cD.value = `P/E ${wtStr(peWt,totalW)} · DCF ${wtStr(dcfWt,totalW)} · EV ${wtStr(evWt,totalW)}`;
  s(cD,{bg:C.navy,fg:"FFBAE6FD",sz:8,ha:"center",wrap:true,border:bdr(C.navy)});
  cE.value = `  ${emoji}  ${rec}`;
  s(cE,{bg:C.navy,fg:vFg,bold:true,sz:10,border:bdr(C.navy)});
  r++;

  ws.getRow(r).height = 10; r++;

  // Legend + disclaimer
  ws.mergeCells(`A${r}:E${r}`); ws.getRow(r).height = 16;
  const leg = ws.getCell(`A${r}`);
  leg.value = "  🟢 Undervalued (model > market +10%)    🟡 Fairly valued (±10%)    🔴 Overvalued (model < market −10%)    ⚠️ Model excluded";
  s(leg,{bg:C.paleBlue,fg:C.midText,sz:9,italic:true}); r++;

  ws.getRow(r).height = 8; r++;
  ws.mergeCells(`A${r}:E${r}`); ws.getRow(r).height = 26;
  const disc = ws.getCell(`A${r}`);
  disc.value = "  ⚠️  DISCLAIMER: Generated automatically by Vela.ai using public financial data. For educational purposes only. Not financial advice. Always consult a qualified advisor before investing.";
  s(disc,{bg:"FFFFF7ED",fg:C.amberTxt,sz:8,italic:true,wrap:true});
}

// ═════════════════════════════════════════════════════════════════════════════
// SHEET 2 — DCF MODEL (horizontal layout)
// ═════════════════════════════════════════════════════════════════════════════
{
  const ws = wb.addWorksheet("🔢 DCF Model", { views:[{showGridLines:false}] });
  // Col A = label, B = formula/source, C = Base, D-H = Yr1-5, I = Terminal
  ws.getColumn("A").width = 32;
  ws.getColumn("B").width = 46;
  ws.getColumn("C").width = 14;
  for (const col of ["D","E","F","G","H"]) ws.getColumn(col).width = 14;
  ws.getColumn("I").width = 16;

  let r = 1;

  // Title
  ws.mergeCells(`A${r}:I${r}`); ws.getRow(r).height = 34;
  const t = ws.getCell(`A${r}`); t.value = `  🔢  ${ticker} — DCF Model (Discounted Cash Flow)   ·   Weight: ${wtStr(dcfWt,totalW)}`; sTitle(t); r++;

  ws.mergeCells(`A${r}:I${r}`); ws.getRow(r).height = 14;
  const wh = ws.getCell(`A${r}`);
  wh.value = "  💡  WHAT IS DCF? — Plain English explanation"; sSec(wh); r++;
  for (const txt of [
    "  Imagine Apple earns cash every year. DCF projects those future earnings, then 'discounts' them back to today's value.",
    "  Reason: $100 today is worth more than $100 in 5 years (inflation, opportunity cost). The discount rate (WACC) reflects this.",
    "  Add up all the discounted future cash flows → that sum is the company's intrinsic value today.",
  ]) {
    ws.mergeCells(`A${r}:I${r}`); ws.getRow(r).height = 15;
    const c = ws.getCell(`A${r}`); c.value = txt;
    s(c,{bg:C.paleBlue,fg:C.darkText,sz:9,italic:true}); r++;
  }

  ws.getRow(r).height = 10; r++;

  // ── INPUTS WITH FORMULAS ──────────────────────────────────────────────────
  ws.mergeCells(`A${r}:I${r}`); ws.getRow(r).height = 20;
  const inpH = ws.getCell(`A${r}`); inpH.value = "  📥  INPUTS & DATA SOURCES  (yellow = assumptions)"; sSec(inpH); r++;

  // Column headers for inputs section
  ws.getRow(r).height = 18;
  ws.mergeCells(`C${r}:I${r}`);
  for (const [col,hdr,ha] of [["A","  Input","left"],["B","  Formula / Source","left"],["C","  Value","right"]]) {
    const c = ws.getCell(`${col}${r}`); c.value = hdr;
    s(c,{bg:C.navyMid,fg:C.white,bold:true,sz:9,ha,border:bdr(C.navyMid)});
  }
  r++;

  const inputRows = [
    {
      label: "  Operating Cash Flow",
      formula: "  Cash Flow Statement — cash generated by core operations",
      val: fmtB(raw.operatingCashFlow),
      isFixed: true,
    },
    {
      label: "  Capital Expenditure (CapEx)",
      formula: "  Cash Flow Statement — investment in property, plant & equipment",
      val: fmtB(raw.capex),
      isFixed: true,
    },
    {
      label: "  Free Cash Flow (FCF) — Total",
      formula: `  Operating Cash Flow ${fmtB(raw.operatingCashFlow)} − CapEx ${fmtB(raw.capex)} = FCF`,
      val: fmtB(fcfTotal),
      isFixed: true, bold: true,
    },
    {
      label: "  Shares Outstanding",
      formula: "  Balance Sheet — total diluted shares in circulation",
      val: `${(raw.sharesOutstanding/1e9).toFixed(2)}B`,
      isFixed: true,
    },
    {
      label: "  FCF per Share (Base Year)",
      formula: `  FCF ${fmtB(fcfTotal)} ÷ Shares ${(raw.sharesOutstanding/1e9).toFixed(2)}B = $${fcfPS}/share`,
      val: `$${fcfPS}`,
      isFixed: true, bold: true,
    },
    { spacer: true },
    {
      label: "  Growth Rate — Years 1 to 5",
      formula: "  Analyst consensus EPS growth estimate (source: Yahoo Finance)",
      val: `${(growthRate*100).toFixed(1)}%`,
      isAssumption: true,
    },
    {
      label: "  Terminal Growth Rate (Year 6+)",
      formula: "  Conservative long-term GDP growth (standard practice: 2.5–3%)",
      val: `${(termGrowth*100).toFixed(1)}%`,
      isAssumption: true,
    },
    {
      label: "  Discount Rate (WACC)",
      formula: "  Technology sector average Weighted Average Cost of Capital",
      val: `${(wacc*100).toFixed(1)}%`,
      isAssumption: true,
    },
  ];

  for (const inp of inputRows) {
    if (inp.spacer) { ws.getRow(r).height = 6; r++; continue; }
    ws.getRow(r).height = 18;
    const cA = ws.getCell(`A${r}`); cA.value = inp.label;
    const cB = ws.getCell(`B${r}`); cB.value = inp.formula;
    ws.mergeCells(`C${r}:I${r}`);
    const cC = ws.getCell(`C${r}`); cC.value = inp.val;
    if (inp.isAssumption) {
      sInpLbl(cA); sInpFrm(cB); sInpVal(cC);
    } else {
      sCalc(cA); sCalcFrm(cB);
      s(cC,{bg:C.white,fg:inp.bold?C.navy:C.darkText,bold:inp.bold||false,ha:"right",border:bdr()});
    }
    r++;
  }

  ws.getRow(r).height = 12; r++;

  // ── HORIZONTAL PROJECTION TABLE ───────────────────────────────────────────
  ws.mergeCells(`A${r}:I${r}`); ws.getRow(r).height = 20;
  const projH = ws.getCell(`A${r}`); projH.value = "  📊  YEAR-BY-YEAR CASH FLOW PROJECTION  (horizontal layout)"; sSec(projH); r++;

  // Header row: Base | Yr 1 | Yr 2 | Yr 3 | Yr 4 | Yr 5 | Terminal
  ws.getRow(r).height = 22;
  const yearCols = ["C","D","E","F","G","H","I"];
  const yearHdrs = ["Base Year","Year 1","Year 2","Year 3","Year 4","Year 5","Terminal"];
  const hA = ws.getCell(`A${r}`); hA.value = "  Metric"; s(hA,{bg:C.navyMid,fg:C.white,bold:true,sz:10,border:bdr(C.navyMid)});
  const hB = ws.getCell(`B${r}`); hB.value = "  Formula / How it's calculated"; s(hB,{bg:C.navyMid,fg:C.white,bold:true,sz:9,border:bdr(C.navyMid)});
  for (const [i,col] of yearCols.entries()) {
    const c = ws.getCell(`${col}${r}`); c.value = yearHdrs[i];
    s(c,{bg:i===yearCols.length-1?C.navy:C.navyMid,fg:C.white,bold:true,sz:10,ha:"center",border:bdr(C.navyMid)});
  }
  r++;

  // Row 1: FCF per Share
  ws.getRow(r).height = 20;
  ws.getCell(`A${r}`).value = "  FCF per Share ($)"; sCalc(ws.getCell(`A${r}`));
  ws.getCell(`B${r}`).value = `  Base = $${fcfPS}. Each year: prior year × (1 + ${(growthRate*100).toFixed(0)}% growth)`;
  sCalcFrm(ws.getCell(`B${r}`));
  const fcfVals = [fcfPS, ...dcfYears.map(y=>y.fcf), "—"];
  for (const [i,col] of yearCols.entries()) {
    const c = ws.getCell(`${col}${r}`);
    c.value = typeof fcfVals[i]==="number" ? fcfVals[i] : fcfVals[i];
    if (typeof fcfVals[i]==="number") {
      c.numFmt = fmtUSD;
      s(c,{bg:i===0?C.paleBlue:C.white,fg:C.darkText,bold:i===0,ha:"right",border:bdr()});
    } else {
      s(c,{bg:C.offWhite,fg:C.lightText,ha:"center",border:bdr()});
    }
  }
  r++;

  // Row 2: Growth applied
  ws.getRow(r).height = 18;
  ws.getCell(`A${r}`).value = "  Growth Rate Applied"; sCalc(ws.getCell(`A${r}`));
  ws.getCell(`B${r}`).value = "  Yr 1–5: analyst consensus estimate. Terminal: long-term GDP assumption."; sCalcFrm(ws.getCell(`B${r}`));
  const growthVals = ["—", ...Array(5).fill(`${(growthRate*100).toFixed(0)}%`), `${(termGrowth*100).toFixed(0)}%`];
  for (const [i,col] of yearCols.entries()) {
    const c = ws.getCell(`${col}${r}`); c.value = growthVals[i];
    s(c,{bg:i===0?C.paleBlue:C.yellow,fg:i===0?C.lightText:"FF1D4ED8",sz:9,ha:"center",border:bdr()});
  }
  r++;

  // Row 3: Discount factor
  ws.getRow(r).height = 18;
  ws.getCell(`A${r}`).value = "  Discount Factor"; sCalc(ws.getCell(`A${r}`));
  ws.getCell(`B${r}`).value = `  1 ÷ (1 + WACC)^year = 1 ÷ (1 + ${(wacc*100).toFixed(0)}%)^year`; sCalcFrm(ws.getCell(`B${r}`));
  const discVals = ["—", ...dcfYears.map(y=>y.discFactor), `1 ÷ (1.${(wacc*100).toFixed(0)})⁵`];
  for (const [i,col] of yearCols.entries()) {
    const c = ws.getCell(`${col}${r}`); c.value = discVals[i];
    if (i>0 && i<6 && typeof discVals[i]==="number") {
      c.numFmt = "0.0000"; s(c,{bg:C.paleBlue,fg:C.midText,sz:9,ha:"right",border:bdr()});
    } else { s(c,{bg:C.offWhite,fg:C.lightText,sz:9,ha:"center",border:bdr()}); }
  }
  r++;

  // Row 4: Present value (key row)
  ws.getRow(r).height = 22;
  ws.getCell(`A${r}`).value = "  Present Value (today's $)"; s(ws.getCell(`A${r}`),{bg:C.lightBlue,fg:C.navy,bold:true,border:bdr(C.borderMid)});
  ws.getCell(`B${r}`).value = "  FCF ÷ (1+WACC)^year  →  what each year's cash flow is worth in today's money"; sCalcFrm(ws.getCell(`B${r}`));
  const pvVals = ["—", ...dcfYears.map(y=>y.pv), pvTerm];
  for (const [i,col] of yearCols.entries()) {
    const c = ws.getCell(`${col}${r}`);
    if (i===0) { c.value="—"; s(c,{bg:C.offWhite,fg:C.lightText,ha:"center",border:bdr()}); }
    else { c.value=pvVals[i]; c.numFmt=fmtUSD; s(c,{bg:i===6?C.navy:C.lightBlue,fg:i===6?C.white:"FF1D4ED8",bold:true,ha:"right",border:bdr(i===6?C.navy:C.borderMid)}); }
  }
  r++;

  // Terminal value label (inside projection)
  ws.getRow(r).height = 16;
  ws.getCell(`A${r}`).value = "  Terminal Value (undiscounted)"; sCalc(ws.getCell(`A${r}`));
  ws.getCell(`B${r}`).value = `  FCF Year 5 × (1 + ${(termGrowth*100).toFixed(0)}%) ÷ (WACC ${(wacc*100).toFixed(0)}% − Terminal growth ${(termGrowth*100).toFixed(0)}%) — Gordon Growth Model`; sCalcFrm(ws.getCell(`B${r}`));
  for (const [i,col] of yearCols.entries()) {
    const c = ws.getCell(`${col}${r}`);
    if (i===6) { c.value=termV; c.numFmt=fmtUSD; s(c,{bg:C.navy,fg:"FFBAE6FD",ha:"right",border:bdr(C.navy)}); }
    else { c.value=""; s(c,{bg:C.offWhite,border:bdr()}); }
  }
  r++;

  ws.getRow(r).height = 12; r++;

  // ── RESULT SECTION ─────────────────────────────────────────────────────────
  ws.mergeCells(`A${r}:I${r}`); ws.getRow(r).height = 20;
  const resH = ws.getCell(`A${r}`); resH.value = "  📌  RESULT"; sSec(resH); r++;

  const resRows = [
    { label:"  Sum of PV — Years 1 to 5", formula:`  $${dcfYears.map(y=>y.pv).join(" + $")} = $${sumPV}`, val:sumPV, numFmt:fmtUSD },
    { label:"  PV of Terminal Value",      formula:`  $${termV} ÷ (1.${(wacc*100).toFixed(0)})⁵ = $${pvTerm}`, val:pvTerm, numFmt:fmtUSD },
    { label:"  DCF Intrinsic Value / Share",formula:"  Sum of PV (Years 1–5) + PV of Terminal Value", val:dcfFV, numFmt:fmtUSD, isResult:true },
    { label:"  Current Market Price",       formula:"  Market price as of report date", val:price, numFmt:fmtUSD },
    { label:"  Over / (Under) Valued",      formula:`  ($${dcfFV} − $${price}) ÷ $${price} × 100`, val:(dcfFV-price)/price, numFmt:fmtPct, isVs:true },
  ];

  for (const row of resRows) {
    ws.getRow(r).height = row.isResult ? 26 : 18;
    const cA = ws.getCell(`A${r}`); cA.value = row.label;
    ws.mergeCells(`B${r}:G${r}`);
    const cB = ws.getCell(`B${r}`); cB.value = row.formula;
    ws.mergeCells(`H${r}:I${r}`);
    const cH = ws.getCell(`H${r}`); cH.value = row.val; cH.numFmt = row.numFmt;

    if (row.isResult) {
      s(cA,{bg:C.navy,fg:C.white,bold:true,border:bdr(C.navy)});
      s(cB,{bg:C.navy,fg:"FFBAE6FD",sz:9,italic:true,border:bdr(C.navy)});
      s(cH,{bg:C.navy,fg:C.white,bold:true,sz:13,ha:"right",border:bdr(C.navy)});
    } else if (row.isVs) {
      const pct = (dcfFV-price)/price*100;
      const [bg,fg] = pct>10?[C.green,C.greenTxt]:pct>-10?[C.amber,C.amberTxt]:[C.red,C.redTxt];
      s(cA,{bg,fg,bold:true,border:bdr(fg)}); s(cB,{bg,fg:C.midText,sz:9,italic:true,border:bdr(fg)}); s(cH,{bg,fg,bold:true,ha:"right",border:bdr(fg)});
    } else {
      sCalc(cA); sCalcFrm(cB); sCalcV(cH);
    }
    r++;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// SHEET 3 — P/E MODEL
// ═════════════════════════════════════════════════════════════════════════════
{
  const ws = wb.addWorksheet("📊 P-E Model", { views:[{showGridLines:false}] });
  ws.getColumn("A").width = 32;
  ws.getColumn("B").width = 52;
  ws.getColumn("C").width = 18;

  let r = 1;
  ws.mergeCells(`A${r}:C${r}`); ws.getRow(r).height = 34;
  const t = ws.getCell(`A${r}`); t.value = `  📊  ${ticker} — P/E Valuation Model   ·   Weight: ${wtStr(peWt,totalW)}`; sTitle(t); r++;

  ws.mergeCells(`A${r}:C${r}`); ws.getRow(r).height = 14;
  const wh = ws.getCell(`A${r}`); wh.value = "  💡  WHAT IS P/E?"; sSec(wh); r++;
  for (const txt of [
    "  P/E = Price-to-Earnings. It tells you how much investors pay for every $1 of annual earnings.",
    "  If Apple earns $6.38/share and peers historically trade at 28× earnings → fair value = $6.38 × 28 = $178.64.",
    "  Most widely used valuation metric by analysts. Simple but powerful as a cross-check against other models.",
  ]) {
    ws.mergeCells(`A${r}:C${r}`); ws.getRow(r).height = 15;
    const c = ws.getCell(`A${r}`); c.value = txt; s(c,{bg:C.paleBlue,fg:C.darkText,sz:9,italic:true}); r++;
  }

  ws.getRow(r).height = 10; r++;
  ws.mergeCells(`A${r}:C${r}`); ws.getRow(r).height = 20;
  const inpH = ws.getCell(`A${r}`); inpH.value = "  📥  INPUTS & DATA SOURCES"; sSec(inpH); r++;

  ws.getRow(r).height = 18;
  for (const [col,hdr,ha] of [["A","  Input","left"],["B","  Formula / Source","left"],["C","Value","right"]]) {
    const c = ws.getCell(`${col}${r}`); c.value = hdr;
    s(c,{bg:C.navyMid,fg:C.white,bold:true,sz:9,ha,border:bdr(C.navyMid)});
  }
  r++;

  const inpRows = [
    { label:"  Net Income", formula:`  Income Statement — Apple's total after-tax profit`, val:fmtB(raw.netIncome), fixed:true },
    { label:"  Shares Outstanding", formula:`  Balance Sheet — total diluted shares`, val:`${(raw.sharesOutstanding/1e9).toFixed(2)}B`, fixed:true },
    { label:"  EPS (Earnings per Share)", formula:`  Net Income ${fmtB(raw.netIncome)} ÷ Shares ${(raw.sharesOutstanding/1e9).toFixed(2)}B = $${eps}/share`, val:`$${eps}`, fixed:true, bold:true },
    { spacer:true },
    { label:"  Sector Fair P/E Multiple", formula:`  Technology sector historical avg P/E (current Apple trailing P/E: ${raw.trailingPE}×)`, val:`${fairPE}×`, assumption:true },
  ];

  for (const inp of inpRows) {
    if (inp.spacer) { ws.getRow(r).height = 6; r++; continue; }
    ws.getRow(r).height = 18;
    const cA = ws.getCell(`A${r}`); cA.value = inp.label;
    const cB = ws.getCell(`B${r}`); cB.value = inp.formula;
    const cC = ws.getCell(`C${r}`); cC.value = inp.val;
    if (inp.assumption) { sInpLbl(cA); sInpFrm(cB); sInpVal(cC); }
    else { sCalc(cA); sCalcFrm(cB); s(cC,{bg:C.white,fg:inp.bold?C.navy:C.darkText,bold:inp.bold||false,ha:"right",border:bdr()}); }
    r++;
  }

  ws.getRow(r).height = 10; r++;
  ws.mergeCells(`A${r}:C${r}`); ws.getRow(r).height = 20;
  const calcH = ws.getCell(`A${r}`); calcH.value = "  🧮  CALCULATION"; sSec(calcH); r++;

  for (const [l,f,v,isRes,isVs] of [
    ["  Fair Value = EPS × Sector Fair P/E", `  $${eps} × ${fairPE}× = ${fv(peFV)}`, peFV, true, false],
    ["  Current Market Price",               `  Market price as of report date`, price, false, false],
    ["  Over / (Under) Valued",              `  ($${peFV} − $${price}) ÷ $${price} × 100`, (peFV-price)/price, false, true],
  ]) {
    ws.getRow(r).height = isRes ? 26 : 18;
    const cA = ws.getCell(`A${r}`); cA.value = l;
    const cB = ws.getCell(`B${r}`); cB.value = f;
    const cC = ws.getCell(`C${r}`); cC.value = v;
    if (isRes) {
      cC.numFmt = fmtUSD;
      s(cA,{bg:C.navy,fg:C.white,bold:true,border:bdr(C.navy)});
      s(cB,{bg:C.navy,fg:"FFBAE6FD",sz:9,italic:true,border:bdr(C.navy)});
      s(cC,{bg:C.navy,fg:C.white,bold:true,sz:13,ha:"right",border:bdr(C.navy)});
    } else if (isVs) {
      cC.numFmt = fmtPct;
      const pct=(peFV-price)/price*100;
      const [bg,fg]=pct>10?[C.green,C.greenTxt]:pct>-10?[C.amber,C.amberTxt]:[C.red,C.redTxt];
      s(cA,{bg,fg,bold:true,border:bdr(fg)}); s(cB,{bg,fg:C.midText,sz:9,italic:true,border:bdr(fg)}); s(cC,{bg,fg,bold:true,ha:"right",border:bdr(fg)});
    } else {
      cC.numFmt = fmtUSD; sCalc(cA); sCalcFrm(cB); sCalcV(cC);
    }
    r++;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// SHEET 4 — GRAHAM NUMBER
// ═════════════════════════════════════════════════════════════════════════════
{
  const ws = wb.addWorksheet("📐 Graham Number", { views:[{showGridLines:false}] });
  ws.getColumn("A").width = 32; ws.getColumn("B").width = 52; ws.getColumn("C").width = 18;

  let r = 1;
  ws.mergeCells(`A${r}:C${r}`); ws.getRow(r).height = 34;
  const t = ws.getCell(`A${r}`); t.value = `  📐  ${ticker} — Graham Number   ⚠️  Weight: 0% — Auto-excluded for technology companies`;
  s(t,{bg:C.slate,fg:C.white,bold:true,sz:12,ha:"center",va:"middle"}); r++;

  ws.mergeCells(`A${r}:C${r}`); ws.getRow(r).height = 14;
  const wh = ws.getCell(`A${r}`); wh.value = "  💡  WHAT IS THE GRAHAM NUMBER?";
  s(wh,{bg:C.slate,fg:C.white,bold:true,sz:10}); r++;
  for (const txt of [
    "  Developed by Benjamin Graham (Warren Buffett's mentor). Formula: √(22.5 × EPS × Book Value per Share).",
    "  It represents the maximum price a conservative investor should pay for a company.",
    "  ✅ Best for: Industrial, energy, banking companies with significant tangible assets (factories, equipment, property).",
    "  ⚠️ Not reliable for: Technology and 'asset-light' companies. Their value = brand + software + patents, not physical assets.",
    `  Apple's book value is only $${bookValPS}/share — far below the $10 threshold Vela uses to apply meaningful weight.`,
    "  Result: Vela automatically sets Graham Number weight to 0% for Apple. The calculation is shown below for transparency.",
  ]) {
    ws.mergeCells(`A${r}:C${r}`); ws.getRow(r).height = 15;
    const c = ws.getCell(`A${r}`); c.value = txt;
    s(c,{bg:C.paleBlue,fg:txt.includes("⚠️")?C.amberTxt:C.darkText,sz:9,italic:true,wrap:true}); r++;
  }

  ws.getRow(r).height = 10; r++;
  ws.mergeCells(`A${r}:C${r}`); ws.getRow(r).height = 20;
  const inpH = ws.getCell(`A${r}`); inpH.value = "  📥  INPUTS & DATA SOURCES  (greyed out — model excluded)";
  s(inpH,{bg:C.slate,fg:C.white,bold:true,sz:10}); r++;

  ws.getRow(r).height = 18;
  for (const [col,hdr,ha] of [["A","  Input","left"],["B","  Formula / Source","left"],["C","Value","right"]]) {
    const c = ws.getCell(`${col}${r}`); c.value = hdr;
    s(c,{bg:"FF64748B",fg:C.white,bold:true,sz:9,ha,border:bdr("FF64748B")});
  }
  r++;

  for (const [l,f,v] of [
    ["  Net Income",         "  Income Statement", fmtB(raw.netIncome)],
    ["  Shares Outstanding", "  Balance Sheet", `${(raw.sharesOutstanding/1e9).toFixed(2)}B`],
    ["  EPS",                `  Net Income ${fmtB(raw.netIncome)} ÷ Shares ${(raw.sharesOutstanding/1e9).toFixed(2)}B`, `$${eps}`],
    ["  Total Assets",       "  Balance Sheet", fmtB(raw.totalAssets)],
    ["  Total Liabilities",  "  Balance Sheet", fmtB(raw.totalLiabilities)],
    ["  Book Value per Share",`  (Total Assets ${fmtB(raw.totalAssets)} − Liabilities ${fmtB(raw.totalLiabilities)}) ÷ Shares`, `$${bookValPS}`],
  ]) {
    ws.getRow(r).height = 18;
    const cA=ws.getCell(`A${r}`); cA.value=l; sGrey(cA);
    const cB=ws.getCell(`B${r}`); cB.value=f; sGreyFrm(cB);
    const cC=ws.getCell(`C${r}`); cC.value=v; sGreyV(cC);
    r++;
  }

  ws.getRow(r).height = 10; r++;
  ws.mergeCells(`A${r}:C${r}`); ws.getRow(r).height = 20;
  const calcH = ws.getCell(`A${r}`); calcH.value = "  🧮  CALCULATION  (shown for transparency only — excluded from AI Verdict)";
  s(calcH,{bg:C.slate,fg:C.white,bold:true,sz:10}); r++;

  for (const [l,f,v] of [
    ["  Formula",                "  √(22.5 × EPS × Book Value per Share)", ""],
    ["  = √(22.5 × $" + eps + " × $" + bookValPS + ")", `  = √(${(22.5*eps*bookValPS).toFixed(2)})`, fv(grahamFV)],
    ["  Current Price",          "  Market price as of report date", `$${price.toFixed(2)}`],
    ["  Apparent 'discount'",    "  ⚠️ Misleading figure — Apple is NOT 88% overvalued. The model simply doesn't apply.", pStr((grahamFV-price)/price*100)],
  ]) {
    ws.getRow(r).height = 20;
    const cA=ws.getCell(`A${r}`); cA.value=l; sGrey(cA);
    const cB=ws.getCell(`B${r}`); cB.value=f; sGreyFrm(cB);
    const cC=ws.getCell(`C${r}`); cC.value=v; sGreyV(cC);
    r++;
  }

  ws.getRow(r).height = 10; r++;
  ws.mergeCells(`A${r}:C${r}`); ws.getRow(r).height = 22;
  const verd = ws.getCell(`A${r}`);
  verd.value = "  ✅  VELA VERDICT: Book Value ($" + bookValPS + "/share) < $10 threshold → Graham Number weight automatically set to 0%. Not included in AI Verdict.";
  s(verd,{bg:"FFFFF7ED",fg:C.amberTxt,bold:true,sz:10,wrap:true});
}

// ═════════════════════════════════════════════════════════════════════════════
// SHEET 5 — EV/EBITDA
// ═════════════════════════════════════════════════════════════════════════════
{
  const ws = wb.addWorksheet("🏢 EV-EBITDA", { views:[{showGridLines:false}] });
  ws.getColumn("A").width = 32; ws.getColumn("B").width = 52; ws.getColumn("C").width = 18;

  let r = 1;
  ws.mergeCells(`A${r}:C${r}`); ws.getRow(r).height = 34;
  const t = ws.getCell(`A${r}`); t.value = `  🏢  ${ticker} — EV/EBITDA Valuation   ·   Weight: ${wtStr(evWt,totalW)}`; sTitle(t); r++;

  ws.mergeCells(`A${r}:C${r}`); ws.getRow(r).height = 14;
  const wh = ws.getCell(`A${r}`); wh.value = "  💡  WHAT IS EV/EBITDA?"; sSec(wh); r++;
  for (const txt of [
    "  EV = Enterprise Value (total price to buy the whole company, including its debt). EBITDA = Operating profit before interest, tax, depreciation.",
    "  The EV/EBITDA ratio asks: how many years of operating profit would it take to buy the entire company?",
    "  We apply the Technology sector median (22×) to Apple's EBITDA to estimate a fair total company value,",
    "  then subtract debt and add back cash to find the fair value per share.",
  ]) {
    ws.mergeCells(`A${r}:C${r}`); ws.getRow(r).height = 15;
    const c = ws.getCell(`A${r}`); c.value = txt; s(c,{bg:C.paleBlue,fg:C.darkText,sz:9,italic:true,wrap:true}); r++;
  }

  ws.getRow(r).height = 10; r++;
  ws.mergeCells(`A${r}:C${r}`); ws.getRow(r).height = 20;
  const inpH = ws.getCell(`A${r}`); inpH.value = "  📥  INPUTS & DATA SOURCES"; sSec(inpH); r++;

  ws.getRow(r).height = 18;
  for (const [col,hdr,ha] of [["A","  Input","left"],["B","  Formula / Source","left"],["C","Value","right"]]) {
    const c = ws.getCell(`${col}${r}`); c.value = hdr;
    s(c,{bg:C.navyMid,fg:C.white,bold:true,sz:9,ha,border:bdr(C.navyMid)});
  }
  r++;

  const evInputs = [
    { label:"  EBIT (Operating Income)",  formula:"  Income Statement — earnings before interest & taxes", val:fmtB(raw.ebitda*0.88), fixed:true },
    { label:"  D&A (Depreciation & Amort.)", formula:"  Income Statement / Cash Flow Statement", val:fmtB(raw.ebitda*0.12), fixed:true },
    { label:"  EBITDA",                   formula:`  EBIT + D&A = ${fmtB(raw.ebitda*0.88)} + ${fmtB(raw.ebitda*0.12)}`, val:fmtB(raw.ebitda), fixed:true, bold:true },
    { spacer:true },
    { label:"  Market Capitalisation",    formula:"  Share Price × Shares Outstanding", val:fmtB(raw.marketCap), fixed:true },
    { label:"  Total Debt",               formula:"  Balance Sheet — short-term + long-term financial debt", val:fmtB(raw.totalDebt), fixed:true },
    { label:"  Cash & Equivalents",       formula:"  Balance Sheet — cash + short-term investments", val:fmtB(raw.cash), fixed:true },
    { label:"  Enterprise Value (EV)",    formula:`  Market Cap ${fmtB(raw.marketCap)} + Debt ${fmtB(raw.totalDebt)} − Cash ${fmtB(raw.cash)}`, val:fmtB(ev), fixed:true, bold:true },
    { label:"  Current EV/EBITDA",        formula:`  EV ${fmtB(ev)} ÷ EBITDA ${fmtB(raw.ebitda)}`, val:`${(ev/raw.ebitda).toFixed(1)}×`, fixed:true },
    { spacer:true },
    { label:"  Sector Median EV/EBITDA",  formula:"  Technology sector median (source: Bloomberg/FactSet sector data)", val:`${evMultiple}×`, assumption:true },
    { label:"  Shares Outstanding",       formula:"  Balance Sheet", val:`${(raw.sharesOutstanding/1e9).toFixed(2)}B`, fixed:true },
  ];

  for (const inp of evInputs) {
    if (inp.spacer) { ws.getRow(r).height = 6; r++; continue; }
    ws.getRow(r).height = 18;
    const cA=ws.getCell(`A${r}`); cA.value=inp.label;
    const cB=ws.getCell(`B${r}`); cB.value=inp.formula;
    const cC=ws.getCell(`C${r}`); cC.value=inp.val;
    if (inp.assumption) { sInpLbl(cA); sInpFrm(cB); sInpVal(cC); }
    else { sCalc(cA); sCalcFrm(cB); s(cC,{bg:C.white,fg:inp.bold?C.navy:C.darkText,bold:inp.bold||false,ha:"right",border:bdr()}); }
    r++;
  }

  ws.getRow(r).height = 10; r++;
  ws.mergeCells(`A${r}:C${r}`); ws.getRow(r).height = 20;
  const bridgeH = ws.getCell(`A${r}`); bridgeH.value = "  🧮  ENTERPRISE VALUE BRIDGE  →  Fair Value per Share"; sSec(bridgeH); r++;

  const bridge = [
    ["  Fair Enterprise Value = EBITDA × Sector Median",      `  ${fmtB(raw.ebitda)} × ${evMultiple}×`, fmtB(fairEV), false, false],
    ["  Less: Total Debt",                                     "  Subtract all financial obligations",   `(${fmtB(raw.totalDebt)})`, false, false],
    ["  Plus: Cash & Equivalents",                            "  Add back cash (belongs to shareholders)", fmtB(raw.cash), false, false],
    ["  = Fair Equity Value",                                  "  Fair EV − Debt + Cash",               fmtB(fairEq), false, false],
    ["  ÷ Shares Outstanding",                                `  ${(raw.sharesOutstanding/1e9).toFixed(2)}B shares`, `${(raw.sharesOutstanding/1e9).toFixed(2)}B`, false, false],
    ["  Fair Value per Share",                                 "  Fair Equity ÷ Shares Outstanding",    fv(evFV), true, false],
    ["  Current Market Price",                                "  Market price as of report date",       `$${price.toFixed(2)}`, false, false],
    ["  Over / (Under) Valued",                               `  ($${evFV} − $${price}) ÷ $${price} × 100`, pStr((evFV-price)/price*100), false, true],
  ];

  for (const [l,f,v,isRes,isVs] of bridge) {
    ws.getRow(r).height = isRes ? 26 : 18;
    const cA=ws.getCell(`A${r}`); cA.value=l;
    const cB=ws.getCell(`B${r}`); cB.value=f;
    const cC=ws.getCell(`C${r}`); cC.value=v;
    if (isRes) {
      s(cA,{bg:C.navy,fg:C.white,bold:true,border:bdr(C.navy)});
      s(cB,{bg:C.navy,fg:"FFBAE6FD",sz:9,italic:true,border:bdr(C.navy)});
      s(cC,{bg:C.navy,fg:C.white,bold:true,sz:13,ha:"right",border:bdr(C.navy)});
    } else if (isVs) {
      const pct=(evFV-price)/price*100;
      const [bg,fg]=pct>10?[C.green,C.greenTxt]:pct>-10?[C.amber,C.amberTxt]:[C.red,C.redTxt];
      s(cA,{bg,fg,bold:true,border:bdr(fg)}); s(cB,{bg,fg:C.midText,sz:9,italic:true,border:bdr(fg)}); s(cC,{bg,fg,bold:true,ha:"right",border:bdr(fg)});
    } else {
      sCalc(cA); sCalcFrm(cB); sCalcV(cC);
    }
    r++;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// SHEET 6 — GLOSSARY
// ═════════════════════════════════════════════════════════════════════════════
{
  const ws = wb.addWorksheet("📖 Glossary", { views:[{showGridLines:false}] });
  ws.getColumn("A").width = 28; ws.getColumn("B").width = 82;

  let r = 1;
  ws.mergeCells(`A${r}:B${r}`); ws.getRow(r).height = 34;
  const t = ws.getCell(`A${r}`); t.value = "  📖  GLOSSARY — Key Terms in Plain English"; sTitle(t); r++;
  ws.mergeCells(`A${r}:B${r}`); ws.getRow(r).height = 16;
  const sub = ws.getCell(`A${r}`); sub.value = "  Everything you need to read this report — no finance degree required.";
  s(sub,{bg:C.lightBlue,fg:C.midText,italic:true,sz:9}); r++;
  ws.getRow(r).height = 8; r++;

  const terms = [
    ["EPS (Earnings Per Share)",         "Apple's total net profit divided by number of shares. If Apple earns $97B with 15.2B shares → EPS = $6.38. Higher = better."],
    ["P/E Ratio",                         "Price ÷ EPS. How much you pay per $1 of earnings. Apple at $210 with $6.38 EPS = 33× P/E. The sector average is 28×, so Apple trades at a premium."],
    ["Book Value per Share",             "Net assets (total assets minus all liabilities) per share. Apple's is only $2.96 because it buys back its own shares aggressively — very common in big tech."],
    ["Free Cash Flow (FCF)",             "Cash the company actually generates after all expenses AND capital investments. Different from 'profit', which includes non-cash items. FCF = Operating Cash Flow − CapEx."],
    ["CapEx (Capital Expenditure)",      "Money Apple spends on physical assets: data centres, manufacturing equipment, retail stores. Subtracted from operating cash flow to get FCF."],
    ["WACC (Discount Rate)",             "Weighted Average Cost of Capital. The minimum return investors require from Apple. Used to discount future cash flows back to today's money. Tech average: ~9%."],
    ["DCF (Discounted Cash Flow)",       "Projects Apple's future cash flows and discounts them to today's value. Principle: $100 today > $100 in 5 years because of inflation and opportunity cost."],
    ["Terminal Value",                   "The estimated value of ALL cash flows from Year 6 onwards, to infinity. Assumes Apple grows at 3% (GDP pace) forever. Often 60–70% of the total DCF value."],
    ["Present Value (PV)",               "What a future cash flow is worth in today's money, after applying the discount rate. E.g. $10.43 in Year 5 discounted at 9% for 5 years = $6.78 today."],
    ["Enterprise Value (EV)",            "Total cost to buy the whole company: Market Cap + all Debt − Cash. If you buy Apple, you take on its debt and receive its cash — EV reflects this."],
    ["EBITDA",                           "Earnings Before Interest, Tax, Depreciation & Amortisation. A measure of operating profitability that's comparable across companies regardless of financing."],
    ["EV/EBITDA Multiple",               "How many years of EBITDA the market values the company at. Tech sector median: 22×. Apple currently trades at ~29×, a premium to peers."],
    ["Graham Number",                    "Benjamin Graham's formula: √(22.5 × EPS × Book Value). Reliable for traditional industrial companies. Not reliable for tech/asset-light companies (auto-excluded)."],
    ["Asset-Light Company",              "A company whose value comes from intangibles (brand, software, IP, talent) rather than physical assets. Apple, Google, LVMH are asset-light. Banks, utilities are not."],
    ["Sector Fair P/E",                  "The historical average P/E that a sector has traded at over time. Technology: ~28×. Banks: ~14×. Used as a benchmark for 'normal' valuation for the industry."],
    ["Weighted Average",                 "Combining multiple model results, giving more importance to more reliable models. Vela gives DCF 43%, P/E 29%, EV/EBITDA 29% for Apple (Graham: 0%)."],
    ["Fairly Valued",                    "The market price is within ±10% of the AI's weighted fair value. Not necessarily a buy/sell signal — timing, macro conditions, and your goals also matter."],
  ];

  let alt = false;
  for (const [term, def] of terms) {
    ws.getRow(r).height = 28;
    const bg = alt ? C.white : C.paleBlue;
    const cA = ws.getCell(`A${r}`); cA.value = `  ${term}`; s(cA,{bg,fg:C.navy,bold:true,sz:10,wrap:true,border:bdr()});
    const cB = ws.getCell(`B${r}`); cB.value = `  ${def}`;  s(cB,{bg,fg:C.darkText,sz:10,wrap:true,border:bdr()});
    alt = !alt; r++;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// WRITE FILE
// ─────────────────────────────────────────────────────────────────────────────
const outPath = path.join(__dirname, "..", "Vela_AAPL_Valuation_SAMPLE.xlsx");
await wb.xlsx.writeFile(outPath);

console.log(`\n✅  File saved: ${outPath}`);
console.log(`\n  Sheets: 📊 Summary · 🔢 DCF (horizontal) · 📊 P/E · 📐 Graham (excluded) · 🏢 EV/EBITDA · 📖 Glossary`);
console.log(`\n  Financial data used:`);
console.log(`  Operating CF     : ${fmtB(raw.operatingCashFlow)} (Cash Flow Statement)`);
console.log(`  CapEx            : ${fmtB(raw.capex)} (Cash Flow Statement)`);
console.log(`  FCF Total        : ${fmtB(fcfTotal)} = OpCF − CapEx`);
console.log(`  FCF per Share    : $${fcfPS} = ${fmtB(fcfTotal)} ÷ ${(raw.sharesOutstanding/1e9).toFixed(2)}B shares`);
console.log(`  EPS              : $${eps} = ${fmtB(raw.netIncome)} net income ÷ ${(raw.sharesOutstanding/1e9).toFixed(2)}B shares`);
console.log(`  Book Value/Share : $${bookValPS} = (${fmtB(raw.totalAssets)} assets − ${fmtB(raw.totalLiabilities)} liab.) ÷ shares`);
console.log(`\n  Model results:`);
console.log(`  Graham Number    : ${fv(grahamFV)}  →  weight 0% (book value $${bookValPS} < $10 threshold)`);
console.log(`  P/E Model        : ${fv(peFV)}  →  weight ${wtStr(peWt,totalW)}`);
console.log(`  DCF              : ${fv(dcfFV)}  →  weight ${wtStr(dcfWt,totalW)}`);
console.log(`  EV/EBITDA        : ${fv(evFV)}  →  weight ${wtStr(evWt,totalW)}`);
console.log(`\n  AI Verdict       : ${fv(wfv)}  (${pStr(vsPct)} vs $${price.toFixed(2)})`);
console.log(`  Recommendation   : ${emoji}  ${rec}\n`);
