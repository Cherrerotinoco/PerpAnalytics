import { Trade } from '../../types/tradeTypes';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface DurationRow {
  key: 'scalping' | 'daytrading' | 'swing';
  label: string;
  description: string;
  pnl: number;
  trades: number;
  wins: number;
  winRate: number;
}

// ─── Buckets ──────────────────────────────────────────────────────────────────
export const DURATION_BUCKETS: {
  key: DurationRow['key'];
  label: string;
  description: string;
  maxMs: number;
}[] = [
  { key: 'scalping', label: 'Scalping', description: '< 1 h', maxMs: 60 * 60 * 1000 },
  {
    key: 'daytrading',
    label: 'Day Trading',
    description: '1 h – 24 h',
    maxMs: 24 * 60 * 60 * 1000,
  },
  { key: 'swing', label: 'Swing', description: '> 24 h', maxMs: Infinity },
];

// ─── Shared compute ───────────────────────────────────────────────────────────
export const computeByDuration = (trades: Trade[]): DurationRow[] => {
  const acc: Record<DurationRow['key'], { pnl: number; trades: number; wins: number }> = {
    scalping: { pnl: 0, trades: 0, wins: 0 },
    daytrading: { pnl: 0, trades: 0, wins: 0 },
    swing: { pnl: 0, trades: 0, wins: 0 },
  };

  for (const t of trades) {
    const durMs = t.closed.getTime() - t.opened.getTime();
    const bucket = DURATION_BUCKETS.find((b) => durMs < b.maxMs)!;
    acc[bucket.key].pnl += t.pnl;
    acc[bucket.key].trades++;
    if (t.pnl > 0) acc[bucket.key].wins++;
  }

  return DURATION_BUCKETS.map(({ key, label, description }) => ({
    key,
    label,
    description,
    pnl: parseFloat(acc[key].pnl.toFixed(2)),
    trades: acc[key].trades,
    wins: acc[key].wins,
    winRate: acc[key].trades > 0 ? Math.round((acc[key].wins / acc[key].trades) * 100) : 0,
  })).filter((r) => r.trades > 0);
};
