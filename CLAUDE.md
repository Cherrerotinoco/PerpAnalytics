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
│   └── header/header.tsx          # Sticky header, theme toggle, "Open app" link
│
├── components/
│   ├── walletForm.tsx             # Wallet input, date filters, platform checkboxes, fetch logic
│   ├── RecentWallets.tsx          # Recent wallet chips
│   ├── Logo.tsx
│   └── dashboard/
│       ├── index.tsx              # Re-export
│       ├── DashboardGrid.tsx      # GridStack integration, portal rendering, panel registry
│       ├── FilterBar.tsx          # Dropdown filter bar (section → panel visibility)
│       ├── PanelPlaceholder.tsx   # Empty-state component shown before data loads
│       └── panels/
│           ├── statistics.tsx         # computeTradeStats(), TradeStats type, Metric component
│           ├── metricPanel.tsx        # METRIC_PANEL_CONFIGS, MetricPanel component
│           ├── equityCurveChart.tsx   # Recharts area chart
│           ├── pnlBySymbolChart.tsx   # Recharts bar chart
│           ├── pnlCalendar.tsx        # Calendar heatmap
│           └── tradeList.tsx          # Sortable trade history table
│
├── context/
│   └── ThemeContext.tsx            # dark/light toggle, persisted to localStorage
│
├── hooks/
│   └── useCookieConsent.ts
│
├── types/
│   └── tradeTypes.ts              # Trade, Side, CloseType
│
└── utils/
    ├── mockTrades.ts              # 55 deterministic mock trades for the landing page
    ├── normalizeJupiter.ts        # Raw Jupiter API → Trade[]
    ├── normalizePacifica.ts       # Raw Pacifica API → Trade[]
    └── (normalizer test files)
```

---

## Data flow

```
walletForm.tsx
  └─ fetch Jupiter API  (paginated, 1000/page)
  └─ fetch Pacifica API (paginated, cursor-based)
       │
       ▼
  normalizeJupiter / normalizePacifica → Trade[]
       │
       ├─ cached in localStorage (5 min TTL, key = wallet+platforms)
       │
       ▼
  filteredTrades (useMemo — date range + platform filter)
       │
       ▼
  DashboardGrid → computeTradeStats() → panels
```

---

## Dashboard architecture

`DashboardGrid` uses **GridStack** for drag/resize and **React portals** to render panel content into GridStack-managed DOM nodes.

### Panel registry
- `CHART_PANELS` — equity, symbol, calendar, history (static positions for first two)
- `METRIC_PANELS` — 17 individual metric cards (from `METRIC_PANEL_CONFIGS`)
- `ALL_PANELS = [...CHART_PANELS, ...METRIC_PANELS]`

### Visibility state
- `visiblePanelIds: Set<string>` — persisted to `localStorage` under `tc:panel-visibility-v1`
- Layout positions persisted under `tc:gs-layout-v1`
- "Reset layout" clears both keys and reloads

### Three effects
1. **Init** (`[]`) — creates GridStack instance, sets `gsReady = true`
2. **Sync panels** (`[gsReady, visiblePanelIds]`) — `addWidget` / `removeWidget` per diff, rebuilds `mounts` state map
3. **Auto-size** (`[gsReady, hasData, mounts]`) — rAF → `gs.resizeToContent(el)` on all items

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

Dropdown-style toolbar: one button per section (Charts / Performance / Risk & Drawdown / Trades), each opening a panel-checkbox list. Count badge shows `visible/total` when any panels are hidden. Single open at a time; closes on outside click. Reset button on the far right with a left-border divider.

---

## Metric panels

Each metric is its own GridStack panel (not grouped). The `Metric` component has a **flip-card tooltip**: hover the `?` button (top-right, absolutely positioned) to flip the card and show an explanation.

**Labels are intentionally removed from the `Metric` component.** The panel header already shows the title in the dashboard. On the landing page, `ShowcaseMetricCard` wraps `MetricPanel` and adds a `.tc-landing-metric-label` above the card — homepage-only pattern, no global change.

---

## Styling

Single file: `app/src/index.css`. No CSS framework (Bootstrap class names are present in some older components but the stylesheet is custom).

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
```

Both are public, no auth required. Responses are validated and normalised by the respective `normalizeX.ts` utils. Schemas in `utils/jupiterSchema.json` and `utils/pacificaSchema.json`.

---

## Key decisions / gotchas

- **GridStack + React StrictMode**: StrictMode runs effects twice. The init effect clears `el.innerHTML = ''` before `GridStack.init` to prevent duplicate panels on remount.
- **`GridStack.renderCB`**: must be overridden to use `innerHTML` (v12 defaults to `textContent` for XSS safety). Set before `GridStack.init`.
- **`mounts` is `useState`, not `useRef`**: changing visibility triggers a React re-render so portals are created/destroyed correctly.
- **`_initParams` in walletForm.tsx**: module-level `new URLSearchParams(window.location.search)` — reads the URL once at module evaluation time. Works correctly because the module is only evaluated when the `/dashboard` route first renders.
- **pnpm store version mismatch**: if `pnpm add` fails with a store error, run `pnpm install --store-dir ~/.pnpm-store-v20` with Node 20 first.
