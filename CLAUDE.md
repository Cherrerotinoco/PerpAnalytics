# PerpAnalytics — Project Context

## What this is
A Solana perpetuals trade analytics dashboard. Users paste a public wallet address and the app fetches their closed trade history from **Jupiter Perpetuals** and **Pacifica Finance**, then renders a fully customisable metrics dashboard.

Live domain: **perpAnalytics.app**

---

## Tech stack

| Layer | Choice |
|---|---|
| UI framework | React 19 |
| Language | TypeScript 5.9 (strict) |
| Bundler | Vite 8 |
| Package manager | pnpm (root workspace, single `package.json`) |
| Routing | react-router-dom v7 |
| Dashboard grid | GridStack v12.6 |
| Charts | Recharts 2.15 |
| Trade chart | TradingView Lightweight Charts v5.2 |
| Icons | react-icons/cg |
| Cookie consent | vanilla-cookieconsent v3 |
| SSR | Custom Vite SSR (`entry-client.tsx` / `entry-server.tsx`) + prerender script |

> **Node requirement:** Vite 8 requires Node ≥ 20. The repo engine field says `>=18` but `pnpm build` will error on Node 18. Use `nvm use 20` before running build commands.

---

## Scripts

```bash
pnpm typecheck          # tsc --noEmit (run after every change)
pnpm dev:app            # Vite dev server
pnpm build:client       # Client bundle only (skips SSR + prerender)
pnpm build              # Full build: client + SSR + prerender
pnpm lint               # ESLint
pnpm format             # Prettier
pnpm test               # Vitest (run once)
```

---

## Routes

| Path | Component | Notes |
|---|---|---|
| `/` | `pages/HomePage.tsx` | Landing page with mock-data showcase |
| `/dashboard` | `WalletForm` + `DashboardGrid` | Main app |
| `/cookie-policy` | `pages/CookiePolicyPage.tsx` | Static |

**Backward-compat redirect:** `HomePage` checks for `?wallet=` on mount and redirects to `/dashboard?...` so old shared links keep working.

---

## Project structure

```
app/src/
├── App.tsx                        # Router, recent-wallets state
├── index.css                      # All styles (single file, design tokens + components)
├── entry-client.tsx               # Hydration entry
├── entry-server.tsx               # SSR render entry
│
├── pages/
│   ├── HomePage.tsx               # Landing page
│   └── CookiePolicyPage.tsx
│
├── layout/
│   ├── MainLayout.tsx             # Header + footer wrapper
│   ├── Footer.tsx
│   └── header/Header.tsx          # Sticky header, theme toggle, "Open app" link
│
├── components/
│   ├── WalletForm.tsx             # Wallet input, date filters, platform checkboxes, fetch + cache logic, URL sync
│   ├── RecentWallets.tsx          # Recent wallet chips
│   └── Logo.tsx
│
├── dashboard/
│   ├── DashboardGrid.tsx          # GridStack integration, portal rendering, panel registry
│   ├── FilterBar.tsx              # Desktop dropdown + mobile off-canvas filter/layout drawer
│   ├── PanelPlaceholder.tsx       # Empty-state shown before data loads
│   ├── TradeModal.tsx             # Trade detail popup: stats card + Lightweight Charts candlestick
│   └── panels/
│       ├── statistics.tsx         # computeTradeStats(), TradeStats type, Metric component
│       ├── metricPanel.tsx        # METRIC_PANEL_CONFIGS, MetricPanel, METRIC_PANEL_MAP
│       ├── equityCurveChart.tsx   # Recharts area chart, segment green/red line
│       ├── pnlBySymbolChart.tsx   # Recharts bar chart
│       ├── pnlCalendar.tsx        # Calendar heatmap
│       └── tradeList.tsx          # Sortable/paginated trade table, opens TradeModal on row click
│
├── context/
│   └── ThemeContext.tsx            # dark/light toggle, persisted to localStorage
│
├── hooks/
│   └── useCookieConsent.ts
│
├── types/
│   ├── tradeTypes.ts              # Trade, Side, CloseType (includes entryPrice?, exitPrice?)
│   ├── jupiterSchema.json
│   └── pacificaSchema.json
│
└── utils/
    ├── mockTrades.ts              # 55 deterministic mock trades for the landing page
    ├── normalizeJupiter.ts        # Raw Jupiter API → Trade[] (tracks entryPrice/exitPrice)
    ├── normalizePacifica.ts       # Raw Pacifica API → Trade[] (tracks entryPrice/exitPrice)
    ├── normalizeJupiter.test.ts
    ├── normalizePacifica.test.ts
    └── statistics.test.ts
```

---

## Data flow

```
WalletForm.tsx
  └─ fetchTradesFor(wallet, platforms)   ← called by form submit, URL navigation, recent wallet select
       │
       ├─ check memory cache (cacheRef)
       ├─ check localStorage cache (5 min TTL, key = wallet+platforms)
       └─ fetch Jupiter API  (paginated, 1000/page)
          fetch Pacifica API (paginated, cursor-based)
               │
               ▼
          normalizeJupiter / normalizePacifica → Trade[]
               │
               ├─ saved to localStorage cache
               │
               ▼
          filteredTrades (useMemo — date range + platform filter)
               │
               ▼
          DashboardGrid → computeTradeStats() → panels
```

---

## URL params

The dashboard URL encodes all search state so links are shareable:

| Param | Format | Example |
|---|---|---|
| `wallet` | Base58, 32–44 chars | `?wallet=ABC...` |
| `start_date` | DD.MM.YYYY | `&start_date=01.01.2025` |
| `end_date` | DD.MM.YYYY | `&end_date=31.05.2025` |
| `platforms` | comma-separated | `&platforms=jupiter,pacifica` |

### URL sync behaviour
- **Live-sync** (`useEffect` on `[startDate, endDate, platforms]`): writes filter changes to URL via `window.history.replaceState` — does NOT trigger `useSearchParams`.
- **Navigation listener** (`useEffect` on `[searchParams]`): fires on back/forward/direct URL access (React Router updates `searchParams`). If `wallet` is valid, syncs all form state and calls `fetchTradesFor` directly. Deduped via `lastAutoKey` ref (`wallet|platforms`) to avoid double-fetching the same params.
- **Recent wallet select** (`handleSelectRecentWallet`): sets wallet, writes URL via `replaceState`, resets `lastAutoKey`, and calls `fetchTradesFor` immediately.

---

## Dashboard architecture

`DashboardGrid` uses **GridStack** for drag/resize and **React portals** to render panel content into GridStack-managed DOM nodes.

### Panel registry
- `CHART_PANELS` — equity, symbol, calendar, history (all `sizeToContent: true`)
- `METRIC_PANELS` — 17 individual metric cards (from `METRIC_PANEL_CONFIGS`, all `sizeToContent: true`)
- `ALL_PANELS = [...CHART_PANELS, ...METRIC_PANELS]`

### Visibility state
- `visiblePanelIds: Set<string>` — persisted to `localStorage` under `tc:panel-visibility-v1`
- Layout positions persisted under `tc:gs-layout-v1`
- `gsKey` counter — incrementing it destroys and recreates GridStack (layout change) without a page reload, preserving React state (trades data)
- "Reset layout" clears both keys and reloads

### Three effects
1. **Init** (`[gsKey]`) — creates GridStack instance, sets `gsReady = true`, registers bin-button event delegation
2. **Sync panels** (`[gsReady, visiblePanelIds]`) — `addWidget` / `removeWidget` per diff, rebuilds `mounts` state map
3. **Auto-size** (`[gsReady, hasData, mounts]`) — rAF → `gs.resizeToContent(el)` on all items

### Bin button (remove panel)
`panelHTML()` injects a `.tc-gs-remove-btn[data-panel-id]` SVG button inside each panel header. A single delegated click listener on the container reads `data-panel-id` and calls `onRemovePanelRef.current(id)` (ref pattern avoids stale closure without re-registering the listener).

### Portal pattern
```
addWidget({ content: panelHTML(id, title) })   // injects <div id="gsmount-{id}">
→ collect DOM mount elements into mounts Map
→ createPortal(<PanelBody>…</PanelBody>, mountEl, id)
```

### Critical CSS rule
`.tc-gs-panel` must have `height: auto` (NOT `height: 100%`). If it's `100%`, `getBoundingClientRect()` always returns the container height and `sizeToContent` never resizes anything.

---

## FilterBar

**Desktop:** dropdown per section (Charts / Performance / Risk & Drawdown / Trades), each opening a panel-checkbox list. Count badge shows `visible/total` when any panels are hidden. Single open at a time; closes on outside click.

**Mobile (< 768px):** the dropdown bar is hidden. A single filter button opens an **off-canvas drawer** (`OffCanvas` component) containing all sections + layout presets. Closes on Escape, backdrop click, or the ✕ button. Body scroll is locked while open.

Both surfaces share `onTogglePanel` / `onToggleSection` (check-all) / `onApplyPreset` callbacks from the parent.

---

## TradeModal

Clicking a row in the Trade History table opens `TradeModal` as a portal on `document.body`.

- **Stats card**: direction, open/close times, duration, close type, source, PnL net/gross, fee, size, entry/exit price.
- **Candlestick chart** (`TradeChart`): Lightweight Charts v5 (`createChart`, `addSeries(CandlestickSeries)`). Fetches OHLCV from Binance (`/api/v3/klines`) with Bybit fallback (`/v5/market/kline`). `pickInterval(durationMs)` selects candle timeframe and padding automatically.
- **Markers**: `createSeriesMarkers(series, markers)` — white arrow at entry, white circle at exit with price + PnL text.
- Closes on Escape, backdrop click, or ✕ button. Locks body scroll while open. Chart scroll/zoom disabled (`handleScroll: false`, `handleScale: false`).

### Lightweight Charts v5 API notes
- `chart.addSeries(CandlestickSeries, opts)` — NOT `addCandlestickSeries()`
- `createSeriesMarkers(seriesRef, markers)` imported from `lightweight-charts` — NOT `series.setMarkers()`

---

## Metric panels

Each metric is its own GridStack panel (not grouped). The `Metric` component has a **flip-card tooltip**: hover the `?` button (top-right, absolutely positioned) to flip the card and show an explanation. O(1) config lookup via `METRIC_PANEL_MAP = new Map(METRIC_PANEL_CONFIGS.map(c => [c.id, c]))`.

**Labels are intentionally removed from the `Metric` component.** The panel header already shows the title in the dashboard. On the landing page, `ShowcaseMetricCard` wraps `MetricPanel` and adds a `.tc-landing-metric-label` above the card — homepage-only pattern.

---

## Equity curve chart

Line color changes segment-by-segment: green when equity > 0, red when < 0. Implemented via an SVG `linearGradient` whose stop offset is calculated from `yMax / (yMax - yMin)` (the zero-crossing ratio).

---

## Styling

Single file: `app/src/index.css`. No CSS framework (some Bootstrap class names remain in older markup but the stylesheet is fully custom).

### Design tokens
```css
--tc-bg, --tc-surface, --tc-surface-2, --tc-surface-3
--tc-border, --tc-text, --tc-muted
--tc-green, --tc-red, --tc-amber
--tc-accent   /* amber — primary brand colour */
--tc-radius   /* 6px */
```

Dark by default (`:root`). Light mode via `[data-theme='light']` on `<html>`.

---

## Landing page sections (HomePage.tsx)

1. **Hero** — headline, subtitle, two CTAs
2. **Trust row** — 3 cards (public address only / no signup / nothing stored), `react-icons/cg` icons
3. **Stats showcase** — 4 metric cards with labels + equity curve + PnL calendar, all rendered with `MOCK_TRADES`
4. **Features grid** — 4 feature cards
5. **Bottom CTA**

Mock data: `utils/mockTrades.ts` — 55 hardcoded trades (Jan–May 2025), SOL/ETH/BTC/WIF/JTO, ~62% win rate, both platforms.

---

## External APIs

```
Jupiter:  https://perps-api.jup.ag/v1/trades?walletAddress={addr}&start={n}&end={n}
Pacifica: https://api.pacifica.fi/api/v1/trades/history?account={addr}&limit=1000&cursor={c}
Binance:  https://api.binance.com/api/v3/klines?symbol={sym}USDT&interval={iv}&startTime={s}&endTime={e}&limit=1000
Bybit:    https://api.bybit.com/v5/market/kline?category=linear&symbol={sym}USDT&interval={iv}&start={s}&end={e}&limit=1000
```

All public, no auth required. Jupiter/Pacifica responses validated by normalizers. Binance is tried first for OHLCV; Bybit is the fallback (and primary for tokens in `BYBIT_SYMBOLS`: WIF, JTO, BONK, PYTH, JUP, RNDR, TIA, SEI, SUI, APT).

---

## Key decisions / gotchas

- **GridStack + React StrictMode**: StrictMode runs effects twice. The init effect clears `el.innerHTML = ''` before `GridStack.init` to prevent duplicate panels on remount.
- **`GridStack.renderCB`**: must be overridden to use `innerHTML` (v12 defaults to `textContent` for XSS safety). Set before `GridStack.init`.
- **`mounts` is `useState`, not `useRef`**: changing visibility triggers a React re-render so portals are created/destroyed correctly.
- **`replaceState` does not update `useSearchParams`**: the live-sync effect writes filter changes to the URL silently. Only real navigation events (popstate, initial load) trigger the `searchParams` effect and auto-fetch.
- **`fetchTradesFor` takes explicit params**: fetch logic accepts `(wallet, platforms)` directly so it can be called from the URL navigation effect without waiting for React state to settle after `setWallet` / `setPlatforms`.
- **pnpm store version mismatch**: if `pnpm add` fails with a store error, run `pnpm install --store-dir ~/.pnpm-store-v20` with Node 20 first.
