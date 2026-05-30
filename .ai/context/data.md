# Data & APIs

## Trade type

Defined in `app/src/types/tradeTypes.ts`.

```ts
type Side      = 'long' | 'short';
type CloseType = 'tp' | 'sl' | 'liquidation' | 'manual';

interface Trade {
  id:        string;
  openTime:  number;   // Unix ms
  closeTime: number;   // Unix ms
  symbol:    string;   // e.g. "BTC", "SOL"
  side:      Side;
  pnl:       number;   // USD
  fee:       number;   // USD
  size:      number;   // USD notional
  closeType: CloseType;
  source:    'Jupiter' | 'Pacifica';
}
```

## External APIs

| Platform | Endpoint |
|---|---|
| Jupiter | `https://perps-api.jup.ag/v1/trades?walletAddress={addr}&start={n}&end={n}` |
| Pacifica | `https://api.pacifica.fi/api/v1/trades/history?account={addr}&limit=1000&cursor={c}` |

Both are public, no auth required. Paginated — Jupiter by offset (`start`/`end`), Pacifica by cursor.

JSON schemas: `app/src/types/jupiterSchema.json` and `app/src/types/pacificaSchema.json`.

## Normalizers

| File | Input → Output |
|---|---|
| `utils/normalizeJupiter.ts` | Raw Jupiter response → `Trade[]` |
| `utils/normalizePacifica.ts` | Raw Pacifica response → `Trade[]` |

Each normalizer exports:
- A normalize function (`normalizeJupiterTrades`, `normalizePacificaTrades`)
- The raw trade type (`JupiterTrade`, `PacificaFill`)

Both have companion test files (`*.test.ts`) using Vitest.

## LocalStorage cache

Trades are cached per wallet+platforms combination.

- **TTL:** 5 minutes
- **Key format:** `tc:trades:{wallet}:{platforms}`
- **Max entries:** 10 (oldest evicted)

## Mock trades

`utils/mockTrades.ts` exports `MOCK_TRADES` — 55 hardcoded trades (Jan–May 2025), SOL/ETH/BTC/WIF/JTO, ~62% win rate, both platforms. Used exclusively on the landing page.

## computeTradeStats

Defined in `dashboard/panels/statistics.tsx`. Takes `Trade[]` and returns `TradeStats` — a derived object containing all metrics: totalPnl, winRate, lossRate, maxDrawdown, sharpe, sortino, etc.

This is the most computation-heavy function in the app. It is memoized in `DashboardGrid` with `useMemo`.
