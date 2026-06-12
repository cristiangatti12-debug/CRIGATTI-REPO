# Vela.ai — Master Project Reference

> **Living document.** Update this file whenever a significant feature is added, a design decision is made, or a known issue is discovered. Every new Claude session should start by reading this file.

---

## 1. What Is Vela.ai

A personal investment portfolio management app — mobile-first (iOS + Android) and web — that gives active investors a single dashboard to track all their holdings, get AI-powered valuation analysis, and ask their portfolio questions in plain language.

**Core user promise:** Feel like a professional investor. In control, informed, effortless.

**App name:** Vela.ai — dual purpose: consumer brand AND future fund name.

**Markets:** Italy first (Italian UI, MiFID II awareness). USA secondary.

**Business model:** Freemium. Free tier with limited analysis, paid Premium for full multi-model valuation + Excel exports for all holdings.

---

## 2. Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript |
| Styling | Tailwind CSS (inline styles for precise palette control) |
| Backend | Next.js API Routes (serverless, Vercel Edge) |
| Database | Supabase (PostgreSQL + Auth) |
| Deployment | Vercel (production: vela-ai-two.vercel.app) |
| Charts | Recharts |
| Excel | ExcelJS (client-side, dynamic import) |
| AI/Chat | Groq API (llama-3.3-70b-versatile, 700 tokens) |
| Voice | Whisper via Groq |

### External APIs Used
| API | Purpose | Key Location |
|-----|---------|-------------|
| Alpha Vantage | Stock OVERVIEW + CASH_FLOW (primary for US stocks) | Vercel env `AV_API_KEY` |
| Yahoo Finance (query2) | Universal fallback + ETF fundProfile + REIT dividend data | No key (browser headers) |
| CoinGecko | Crypto market data (free, no key) | No key required |
| Groq | AI chat + voice transcription | Vercel env `GROQ_API_KEY` |
| Supabase | Auth + holdings storage + risk profile | Vercel env `SUPABASE_URL`, `SUPABASE_ANON_KEY` |

---

## 3. Design System

### Color Palette — "Sea, Cloud, Sun"
```
Primary blue:    #0EA5E9  (sky/sea — CTAs, charts, accents)
Light blue:      #BAE6FD  (borders, subtle backgrounds)
Background:      #F0F9FF  (cloud white — page background)
Card background: #FFFFFF  (pure white)
Deep navy:       #1E3A5F  (headings, strong text)
Body text:       #334155
Muted text:      #64748B
Placeholder:     #94A3B8
Border:          #E2E8F0
Accent gold:     #FCD34D  (sun — highlights, best performer)
Success green:   #16A34A / bg #DCFCE7
Warning amber:   #CA8A04 / bg #FEF9C3
Danger red:      #DC2626 / bg #FEE2E2
Excluded gray:   #94A3B8 / bg #F1F5F9
```

### UX References
- **PayPal** → horizontal scrollable summary cards at top of Portfolio tab
- **Spotify** → pill tab navigation (Portfolio | News | Analysis | Profile)
- **Revolut** → overall simplicity, no clutter, every element earns its place

### Typography
- Font: System default (Geist/Inter)
- Card titles: `text-sm font-bold` navy
- Body: `text-xs` slate-600
- Numbers: `font-bold` with color-coded P&L

### Card Style
```css
border-radius: 1rem (rounded-2xl)
border: 1px solid #E0F2FE
background: white
shadow: shadow-sm
```

---

## 4. Application Structure

```
app/
├── page.tsx                    # Main app — Portfolio, News, Analysis, Profile tabs
├── chat/page.tsx               # Ask Vela AI chat page
├── login/page.tsx              # Auth (Supabase)
├── globals.css                 # Global styles + Tailwind
│
├── api/
│   ├── valuation/route.ts      # AI valuation engine (DCF, P/E, Graham, EV/EBITDA)
│   ├── chat/route.ts           # Groq AI chat endpoint
│   ├── prices/route.ts         # Real-time price fetching
│   ├── news/route.ts           # Portfolio-filtered news
│   ├── signals/route.ts        # Buy/Hold/Sell signals
│   ├── market-signals/route.ts # Market-level signals
│   ├── history/route.ts        # Price history for charts
│   ├── search/route.ts         # Ticker search
│   ├── transcribe/route.ts     # Voice → text (Whisper/Groq)
│   └── delete-account/route.ts # GDPR account deletion
│
└── components/
    ├── ValuationCard.tsx        # Per-holding AI valuation card + Excel export
    ├── DiversificationPanel.tsx # Sector donut, concentration score, geo split
    ├── RiskModal.tsx            # 5-question risk questionnaire → risk profile
    └── OnboardingModal.tsx      # First-run onboarding

lib/
├── supabase.ts                 # Supabase client + Holding type
└── i18n.ts                     # EN/IT language helper

types/
└── index.ts                    # Shared TypeScript types
```

---

## 5. Key Features — Current State

### Portfolio Tab
- Holdings tracked manually (ticker, shares, cost per share, date, currency)
- Real-time prices via Yahoo Finance API
- Summary cards: Total Value, Today P&L, Best/Worst Today (horizontal scroll)
- Performance chart: indexed to 100, vs S&P 500 / NASDAQ / STOXX 600 benchmarks
- Period selector: 1W / 1M / 3M / 1Y
- Market signals panel (BUY/HOLD/SELL per holding)

### Analysis Tab
- **Biggest holding** → Full 4-model analysis (DCF + P/E + Graham + EV/EBITDA) + Excel download
  - Data cached daily (localStorage key `vela_val_v4_${ticker}`, date-keyed)
  - Biggest holding always shown first, loads immediately (0 ms stagger)
- **Other stocks** → P/E only + premium lock
  - Staggered: batch of 3 every 15 seconds to avoid rate limits
  - Cache key: `vela_val_v4_simple_${ticker}`
- **ETFs** → Dedicated ETF card (AUM, TER, dividend yield, 52-week range bar)
- **Crypto** → Dedicated crypto card (24h/7d/30d change, market cap rank, ATH %, supply bar)
  - 38 coins supported via CoinGecko (BTC, ETH, SOL, BNB, XRP, ADA, AVAX, DOT, MATIC, LINK, UNI, DOGE, SHIB, LTC, BCH, ATOM, FIL, ICP, NEAR, APT, ARB, OP, ALGO, VET, SAND, MANA, AXS, CRO, FTM, HBAR, THETA, TRX, XLM, AAVE, MKR, SUI, TON, INJ, SEI)
- **REITs** → Treated as stocks; P/E note shows "P/FFO" terminology + dividend yield
- **Bonds** → Simple card, no valuation (bonds require broker-held data)
- **Diversification Panel** (above cards): Sector donut, concentration warning, geographic bar, 0-100 score
- **Risk profile comparison**: Shows if diversification matches risk questionnaire result

### News Tab
- Portfolio-specific news filtered by tickers held
- Color-coded impact badges per headline

### Ask Vela (Chat)
- Model: `llama-3.3-70b-versatile` (Groq, 700 max tokens)
- Knows user's full portfolio (passed in system prompt)
- Can analyze concentration risk, suggest rebalancing, explain valuations
- Voice input (Whisper transcription)
- Quick-action chips on first load
- State machine for adding holdings via chat (regex: only triggers on "I bought/purchased/add/record")

### Profile Tab
- Language toggle (EN/IT)
- Risk questionnaire (5 questions → Conservative / Balanced / Growth / Aggressive)
  - Score 5-25, saved to `profiles` table in Supabase + `localStorage vela_risk_v1`
  - Supabase columns: `risk_profile TEXT`, `risk_score INT`
- Account management (delete account)

---

## 6. Valuation Engine — How It Works

### Data Sources (parallel fetch, no sequential blocking)
1. **Alpha Vantage OVERVIEW** — primary for US stocks (symbol, sector, EPS, book value, market cap, EBITDA, PE, shares)
2. **Yahoo Finance query2** — universal fallback with browser-like headers. More reliable from Vercel shared IPs. Also used for ETF fundProfile, REIT dividend yield, European stocks.
3. **CoinGecko** — crypto only (bypasses AV + YF entirely)

When both AV and YF return empty → respond `rate_limited` (triggers auto-retry countdown in UI, NOT a permanent error).

### Four Models
| Model | Weight | When excluded |
|-------|--------|--------------|
| Graham Number | 1 | Book value < $10/share (asset-light) |
| P/E | 2 | Negative EPS |
| DCF | 3 (or 2 if EPS proxy) | No positive earnings at all |
| EV/EBITDA | 2 | EBITDA negative or Financial sector |

**Verdict** = weighted average of included models only.

### EPS Proxy Rule
When FCF data unavailable (rate-limited), EPS is used as FCF/share estimate. DCF weight drops from 3→2 to reflect approximation. Clearly labelled in UI and Excel.

### Sector Defaults
Each sector has: `fairPE`, `evEbitda`, `wacc`, `termGrowth`, `g1` (5-year growth rate). Used when company data is incomplete.

### Cache Strategy
- Full card: `localStorage vela_val_v4_${ticker}` — date-keyed (refreshes daily)
- Simple card: `localStorage vela_val_v4_simple_${ticker}` — date-keyed
- Biggest holding always gets the full card (4 models + Excel)

---

## 7. Excel Export — Professional Financial Model

6-sheet ExcelJS workbook (`Vela_${ticker}_Valuation.xlsx`):

| Sheet | Tab Color | Content |
|-------|-----------|---------|
| Summary | Navy | Company snapshot, all 4 models color-coded, AI Verdict (large), Legend, Disclaimer |
| DCF Model | Sky blue | Plain-English explanation, inputs, year-by-year horizontal projection with PV factors |
| PE Model | Green | Inputs, calculation, result |
| Graham Number | Orange | With auto-exclusion explanation when weight=0 |
| EV-EBITDA | Purple | Enterprise value bridge step-by-step |
| Glossary | Gray | 16 financial terms in plain English |

**Cell styling:** navy/sky/green/amber/red palette, Calibri font, thin borders, frozen header rows, color-coded verdict cells (green >+10%, amber ±10%, red <-10%).

Only the **biggest holding** gets Excel. Others show a locked button (Premium feature placeholder).

---

## 8. Diversification Panel

Component: `app/components/DiversificationPanel.tsx`

**Diversification Score (0–100):**
- 40 pts: sector spread (10 pts per sector, max 4)
- 30 pts: top holding concentration (<20% = 30, <30% = 20, <50% = 10, ≥50% = 0)
- 30 pts: number of holdings (5 pts each, max 6)

**Geographic split:** `isEuropean()` checks `.DE|.PA|.L|.AS|.SW|.MI|.CO|.MC|.BR` suffixes.

**Sector source:** Reads from localStorage cache (`vela_val_v4_${ticker}` or `vela_val_v4_simple_${ticker}`). Falls back to 50+ ticker heuristics (e.g., AAPL/MSFT/NVDA → Technology).

**Shows:** when `holdings.length >= 2`.

---

## 9. Risk Questionnaire

Component: `app/components/RiskModal.tsx`

5 questions (scored 1–5 each, total 5–25):
1. Age bracket
2. Investment horizon
3. Reaction to 20% portfolio drop
4. Income stability
5. Primary goal

| Score | Profile | Allocation |
|-------|---------|-----------|
| 5–9 | 🛡️ Conservative | 30% stocks · 50% bonds · 20% cash |
| 10–14 | ⚖️ Balanced | 50% stocks · 35% bonds · 15% cash |
| 15–19 | 📈 Growth | 70% stocks · 20% bonds · 10% cash |
| 20–25 | 🚀 Aggressive | 90% stocks · 5% bonds · 5% cash |

**Storage:** Supabase `profiles` table (`risk_profile`, `risk_score`) + `localStorage vela_risk_v1`.

---

## 10. Database Schema (Supabase)

### `holdings` table
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
user_id         UUID REFERENCES auth.users NOT NULL
ticker          TEXT NOT NULL
name            TEXT NOT NULL
shares          NUMERIC NOT NULL
cost_per_share  NUMERIC NOT NULL
currency        TEXT DEFAULT 'USD'
purchase_date   DATE
created_at      TIMESTAMPTZ DEFAULT now()
```

### `profiles` table
```sql
id              UUID PRIMARY KEY REFERENCES auth.users
lang            TEXT DEFAULT 'en'
risk_profile    TEXT    -- 'Conservative' | 'Balanced' | 'Growth' | 'Aggressive'
risk_score      INT     -- 5–25
created_at      TIMESTAMPTZ DEFAULT now()
updated_at      TIMESTAMPTZ DEFAULT now()
```

RLS enabled on both tables — users can only read/write their own rows.

---

## 11. Known Issues & Decisions

| Issue | Status | Notes |
|-------|--------|-------|
| SELL signal logic broken | ⚠️ Known | Momentum model gives SELL after crash (worst time). Needs fundamental overlay (earnings surprise, insider buying, short interest). Fix in Premium sprint. |
| Voice input quality | ⚠️ Known | Flagged by user. Improve in later sprint. |
| Bond analysis | 🚫 Intentional | Bonds show a "no valuation" card. Bond price data is not available via free public APIs reliably. Focus on stocks + ETFs + crypto. |
| Alpha Vantage throttling | ✅ Handled | AV silently returns `{}` on Vercel shared IPs. Parallel fetch with YF query2 as fallback. Empty from both = `rate_limited` (auto-retry, not permanent error). |
| ExcelJS in browser | ✅ Working | Dynamic import `await import("exceljs")` with `.default ?? mod` pattern. Blob → createObjectURL → anchor download. |

---

## 12. Freemium Boundaries (Current Implementation)

| Feature | Free | Premium (planned) |
|---------|------|-------------------|
| Holdings tracking | ✅ Unlimited | ✅ Unlimited |
| Real-time prices | ✅ All | ✅ All |
| P/E valuation | ✅ All holdings | ✅ All holdings |
| Full 4-model analysis | Biggest holding only | All holdings |
| Excel download | Biggest holding only | All holdings |
| Risk questionnaire | ✅ Free | ✅ Free |
| Diversification panel | ✅ Free | ✅ Free |
| Ask Vela (AI chat) | ✅ Free | ✅ Enhanced |

---

## 13. Roadmap — What's Next

### Immediate (approved plan)
- [x] **Sprint D+E — WOW Visual Redesign**: Dark navy (`#0A1628`) full app, glass morphism cards (`rgba(255,255,255,0.07)`), AreaChart with gradient fill + Compare toggle, hero portfolio value with count-up animation, animated score bars (`.score-bar` CSS keyframe), simpler plain-English analysis language, dark news/profile tabs — deployed 2026-05-29

### Near-term
- [ ] Ask Vela improvements: quick action chips, chat history persistence, portfolio summary header in chat
- [ ] Chart upgrade: absolute portfolio value on Y-axis (not indexed), Compare benchmark toggle
- [ ] Market opportunities panel: animated score bars

### Later
- [x] Premium paywall implementation (Stripe) — subscriptions table + checkout + portal + webhook + UI gate
- [ ] SELL signal fix (fundamental overlay)
- [ ] More crypto coins
- [ ] Broker API integrations (Open Banking)
- [ ] Courses / financial education section
- [ ] Broker comparison tool
- [ ] Public Comparables (AI-tracked peer multiples)

---

## 14. Deployment

**Production URL:** https://vela-ai-two.vercel.app

**Deploy command:** `npx vercel --prod` (run from `C:\Users\crist\Desktop\Portfolio APP\vela-ai`)

**Environment variables (Vercel dashboard):**
- `AV_API_KEY` — Alpha Vantage free key
- `GROQ_API_KEY` — Groq API key
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon key
- `SUPABASE_SERVICE_ROLE_KEY` — required for full account deletion (`/api/delete-account`). Without it the route wipes user data + signs out but the auth row lingers and an admin must remove it manually.
- `FMP_API_KEY` — Financial Modeling Prep (optional but strongly recommended). Provides EU fundamentals + a 250-req/day free tier that absorbs traffic when AV exhausts its 25-req/day limit.
- `FINNHUB_API_KEY` — optional, used as third-fallback P/E source.
- `GOOGLE_AI_API_KEY` — optional Gemini key for AI fallback chain (allocation, digest, news sentiment).
- `ANTHROPIC_API_KEY` — optional, enables Claude in the allocation model chain.
- `NEXT_PUBLIC_SITE_URL` — pin Supabase email confirmation links to the production origin (prevents preview-deploy signups from getting blocked by the redirect allowlist).

**Stripe (Premium tier):**
- `STRIPE_SECRET_KEY` — Stripe secret key (server-only).
- `STRIPE_WEBHOOK_SECRET` — Stripe webhook signing secret for `/api/stripe/webhook`.
- `NEXT_PUBLIC_STRIPE_PRICE_MONTHLY` — Stripe Price ID for the €9.99/mo plan (e.g. `price_xxx`). Exposed to client so the checkout button can pass it.
- `STRIPE_PRICE_ANNUAL` — Stripe Price ID for the €89/yr plan (server-only, optional).

**Setup checklist for Stripe:**
1. Create product "Vela Premium" in Stripe dashboard → add Monthly (€9.99) and Annual (€89) prices.
2. Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PRICE_MONTHLY` in Vercel.
3. Apply migration `supabase/migrations/20260620_subscriptions.sql` to production.
4. Add Stripe webhook endpoint `https://vela-ai-two.vercel.app/api/stripe/webhook` in Stripe dashboard → listen for `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`.
5. Configure Stripe Customer Portal at dashboard.stripe.com/settings/billing/portal.

**TypeScript check before deploy:** `npx tsc --noEmit`

---

## 15. Language Rule

**ALL responses to the user must be in English followed by Italian translation. No exceptions.**

This is a project rule set in Claude memory (`feedback_language.md`). Every message back to the user ends with the Italian equivalent.

---

*Last updated: 2026-05-29 — Sessions covering Sprints 1–5 (stagger fix, Ask Vela, risk questionnaire, diversification panel, Excel rewrite, multi-instrument analysis cards, Sprint D+E WOW Visual Redesign)*
