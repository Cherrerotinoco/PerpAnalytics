# Architecture

## Folder structure

```
app/src/
├── App.tsx                        # Router, recent-wallets state
├── index.css                      # All styles — single file, no exceptions
├── entry-client.tsx               # Hydration entry
├── entry-server.tsx               # SSR render entry
├── vite-env.d.ts
│
├── pages/
│   ├── HomePage.tsx               # Landing page with mock-data showcase
│   └── CookiePolicyPage.tsx
│
├── layout/
│   ├── MainLayout.tsx             # Header + footer wrapper
│   ├── Footer.tsx
│   └── header/
│       └── Header.tsx             # Sticky header, theme toggle, "Open app" link
│
├── components/                    # Small shared UI components
│   ├── Logo.tsx
│   ├── RecentWallets.tsx
│   └── WalletForm.tsx             # Wallet input, date filters, platform checkboxes, fetch logic
│
├── dashboard/                     # Core feature — GridStack dashboard
│   ├── DashboardGrid.tsx          # GridStack init, portal rendering, panel registry, presets
│   ├── FilterBar.tsx              # Dropdown filter bar + layout preset selector
│   ├── PanelPlaceholder.tsx       # Empty-state shown before data loads
│   └── panels/
│       ├── statistics.tsx         # computeTradeStats(), TradeStats type, Metric component
│       ├── metricPanel.tsx        # METRIC_PANEL_CONFIGS, MetricPanel, special panels
│       ├── equityCurveChart.tsx
│       ├── pnlBySymbolChart.tsx
│       ├── pnlCalendar.tsx
│       └── tradeList.tsx
│
├── context/
│   └── ThemeContext.tsx            # dark/light toggle, persisted to localStorage
│
├── hooks/
│   └── useCookieConsent.ts
│
├── types/
│   ├── tradeTypes.ts              # Trade, Side, CloseType
│   ├── jupiterSchema.json
│   └── pacificaSchema.json
│
└── utils/
    ├── mockTrades.ts              # 55 deterministic mock trades for the landing page
    ├── normalizeJupiter.ts        # Raw Jupiter API → Trade[]
    ├── normalizeJupiter.test.ts
    ├── normalizePacifica.ts       # Raw Pacifica API → Trade[]
    └── normalizePacifica.test.ts
```

## Routes

| Path | Component | Notes |
|---|---|---|
| `/` | `HomePage.tsx` | Landing page, mock-data showcase |
| `/dashboard` | `WalletForm` + `DashboardGrid` | Main app |
| `/cookie-policy` | `CookiePolicyPage.tsx` | Static |

Backward-compat: `HomePage` checks for `?wallet=` on mount and redirects to `/dashboard?...`.

## Data flow

```
WalletForm.tsx
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
