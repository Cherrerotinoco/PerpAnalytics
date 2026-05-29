import type { Trade } from '../types/tradeTypes';

// ─── Helpers ──────────────────────────────────────────────────────────────────
/** Return a Date that is `daysBack` days before May 1 2025. */
const ago = (daysBack: number, hourOffset = 0): Date => {
  const base = new Date('2025-05-01T12:00:00Z');
  base.setDate(base.getDate() - daysBack);
  base.setHours(base.getHours() + hourOffset);
  return base;
};

const mk = (
  symbol: string,
  side: 'long' | 'short',
  pnl: number,
  daysBack: number,
  durationH: number,
  closeType: 'TP' | 'SL' | 'Manual',
  source: 'Jupiter' | 'Pacifica' = 'Jupiter',
): Trade => {
  const closed = ago(daysBack);
  const opened = new Date(closed.getTime() - durationH * 3_600_000);
  const sizeUsd = Math.abs(pnl) * (8 + (daysBack % 6));
  const fee     = sizeUsd * 0.0008 + 1.5;
  return { symbol, side, pnl, fee, sizeUsd, opened, closed, closeType, source };
};

// ─── Mock trades (≈ Jan – Apr 2025) ──────────────────────────────────────────
// Produces ~62 % win-rate, steady equity curve, realistic Solana-perps mix.
export const MOCK_TRADES: Trade[] = [
  // ── January ──────────────────────────────────────────────────────────────
  mk('SOL-USD',  'long',   +420,  110,  6, 'TP'),
  mk('ETH-USD',  'short',  -180,  108,  3, 'SL'),
  mk('BTC-USD',  'long',   +850,  106,  8, 'TP', 'Pacifica'),
  mk('SOL-USD',  'long',    -95,  104,  2, 'SL'),
  mk('WIF-USD',  'long',   +230,  102,  4, 'TP'),
  mk('SOL-USD',  'short',  +380,  100,  5, 'TP', 'Pacifica'),
  mk('ETH-USD',  'long',   -210,   98,  3, 'SL'),
  mk('BTC-USD',  'short',  +640,   96,  7, 'TP'),
  mk('JTO-USD',  'long',   +175,   94,  3, 'TP', 'Pacifica'),
  mk('SOL-USD',  'long',   -320,   92,  4, 'SL'),
  mk('ETH-USD',  'long',   +520,   90,  6, 'TP'),
  mk('SOL-USD',  'short',  -145,   88,  2, 'SL', 'Pacifica'),

  // ── February ─────────────────────────────────────────────────────────────
  mk('BTC-USD',  'long',   +910,   87,  9, 'Manual'),
  mk('WIF-USD',  'long',   +160,   85,  3, 'TP'),
  mk('JTO-USD',  'short',   -88,   83,  2, 'SL', 'Pacifica'),
  mk('SOL-USD',  'long',   +670,   81,  7, 'TP'),
  mk('ETH-USD',  'short',  +340,   79,  5, 'TP'),
  mk('BTC-USD',  'long',   -275,   77,  4, 'SL'),
  mk('SOL-USD',  'long',   +480,   75,  6, 'TP', 'Pacifica'),
  mk('WIF-USD',  'long',   +120,   73,  2, 'TP'),
  mk('ETH-USD',  'long',   -190,   71,  3, 'SL'),
  mk('SOL-USD',  'short',  +290,   70,  4, 'TP'),
  mk('BTC-USD',  'long',   +730,   68,  8, 'TP', 'Pacifica'),
  mk('JTO-USD',  'long',    -65,   66,  2, 'SL'),
  mk('SOL-USD',  'long',   +560,   64,  6, 'TP'),
  mk('ETH-USD',  'long',   -240,   62,  3, 'SL', 'Pacifica'),
  mk('BTC-USD',  'short', +1100,   60, 10, 'TP'),

  // ── March ─────────────────────────────────────────────────────────────────
  mk('SOL-USD',  'long',   +380,   58,  5, 'TP'),
  mk('WIF-USD',  'short',  -155,   56,  2, 'SL', 'Pacifica'),
  mk('ETH-USD',  'long',   +490,   54,  6, 'TP'),
  mk('SOL-USD',  'long',   -180,   52,  3, 'SL'),
  mk('BTC-USD',  'long',   +820,   50,  8, 'TP', 'Pacifica'),
  mk('JTO-USD',  'long',   +145,   48,  3, 'TP'),
  mk('SOL-USD',  'short',   -95,   47,  2, 'SL'),
  mk('ETH-USD',  'long',   +620,   45,  7, 'TP'),
  mk('BTC-USD',  'short',  +440,   43,  5, 'TP', 'Pacifica'),
  mk('SOL-USD',  'long',   +280,   41,  4, 'TP'),
  mk('WIF-USD',  'long',   -205,   39,  3, 'SL'),
  mk('ETH-USD',  'long',   +510,   37,  6, 'TP'),
  mk('SOL-USD',  'long',   +180,   35,  3, 'TP', 'Pacifica'),
  mk('BTC-USD',  'long',   -340,   33,  4, 'SL'),

  // ── April ─────────────────────────────────────────────────────────────────
  mk('JTO-USD',  'short',  +260,   31,  4, 'TP'),
  mk('SOL-USD',  'long',   +420,   29,  5, 'TP'),
  mk('ETH-USD',  'long',   -155,   27,  3, 'SL', 'Pacifica'),
  mk('BTC-USD',  'short',  +680,   25,  7, 'TP'),
  mk('SOL-USD',  'long',   +350,   23,  5, 'TP'),
  mk('WIF-USD',  'long',   -110,   21,  2, 'SL'),
  mk('ETH-USD',  'long',   +580,   19,  6, 'TP', 'Pacifica'),
  mk('SOL-USD',  'long',   +240,   17,  4, 'TP'),
  mk('BTC-USD',  'long',   -285,   15,  4, 'SL'),
  mk('SOL-USD',  'short',  +460,   13,  5, 'TP'),
  mk('ETH-USD',  'long',   +310,   11,  4, 'TP', 'Pacifica'),
  mk('SOL-USD',  'long',   -175,    9,  3, 'SL'),
  mk('BTC-USD',  'long',   +920,    7,  9, 'TP'),
  mk('SOL-USD',  'long',   +290,    5,  4, 'TP'),
  mk('ETH-USD',  'short',  -130,    3,  2, 'SL', 'Pacifica'),
  mk('JTO-USD',  'long',   +195,    1,  3, 'TP'),
];
