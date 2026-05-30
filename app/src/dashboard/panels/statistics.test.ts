import { describe, it, expect } from 'vitest';
import { computeTradeStats } from './statistics';
import type { Trade } from '../../types/tradeTypes';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const day = (n: number) => new Date(Date.UTC(2025, 0, n)); // Jan n 2025

const makeTrade = (overrides: Partial<Trade> & { pnl: number }): Trade => ({
  symbol:    'BTC',
  opened:    day(1),
  closed:    day(2),
  side:      'long',
  fee:       0,
  sizeUsd:   1000,
  closeType: 'TP',
  source:    'Jupiter',
  ...overrides,
});

// ─── Empty input ──────────────────────────────────────────────────────────────

describe('computeTradeStats — empty input', () => {
  const stats = computeTradeStats([]);

  it('returns zero for all numeric fields', () => {
    expect(stats.totalPnl).toBe(0);
    expect(stats.totalTrades).toBe(0);
    expect(stats.winTrades).toBe(0);
    expect(stats.lossTrades).toBe(0);
    expect(stats.maxWin).toBe(0);
    expect(stats.maxLoss).toBe(0);
    expect(stats.maxDrawdown).toBe(0);
    expect(stats.maxDrawdownPct).toBe(0);
    expect(stats.maxConsecWins).toBe(0);
    expect(stats.maxConsecLosses).toBe(0);
    expect(stats.totalFees).toBe(0);
  });

  it('returns zero rates', () => {
    expect(stats.winRate).toBe(0);
    expect(stats.lossRate).toBe(0);
    expect(stats.expectancy).toBe(0);
  });

  it('returns empty arrays', () => {
    expect(stats.equityCurve).toEqual([]);
    expect(stats.pnlList).toEqual([]);
  });

  it('returns empty feesBySource', () => {
    expect(stats.feesBySource).toEqual({});
  });
});

// ─── Basic aggregation ────────────────────────────────────────────────────────

describe('computeTradeStats — basic aggregation', () => {
  const trades = [
    makeTrade({ pnl: 10 }),
    makeTrade({ pnl: -5 }),
    makeTrade({ pnl: 20 }),
  ];
  const stats = computeTradeStats(trades);

  it('sums totalPnl correctly', () => {
    expect(stats.totalPnl).toBeCloseTo(25);
  });

  it('counts trades correctly', () => {
    expect(stats.totalTrades).toBe(3);
    expect(stats.winTrades).toBe(2);
    expect(stats.lossTrades).toBe(1);
  });

  it('computes win/loss rates', () => {
    expect(stats.winRate).toBeCloseTo(66.67, 1);
    expect(stats.lossRate).toBeCloseTo(33.33, 1);
  });

  it('identifies maxWin and maxLoss', () => {
    expect(stats.maxWin).toBe(20);
    expect(stats.maxLoss).toBe(5);
  });

  it('computes expectancy', () => {
    // 25 / 3
    expect(stats.expectancy).toBeCloseTo(8.33, 1);
  });

  it('builds equityCurve in trade order', () => {
    expect(stats.equityCurve).toEqual([10, 5, 25]);
  });

  it('builds pnlList in trade order', () => {
    expect(stats.pnlList).toEqual([10, -5, 20]);
  });
});

// ─── Profit factor ────────────────────────────────────────────────────────────

describe('computeTradeStats — profitFactor', () => {
  it('calculates grossProfit / grossLoss', () => {
    const stats = computeTradeStats([
      makeTrade({ pnl: 30 }),
      makeTrade({ pnl: -10 }),
    ]);
    expect(stats.profitFactor).toBeCloseTo(3);
  });

  it('returns Infinity when there are no losses', () => {
    const stats = computeTradeStats([makeTrade({ pnl: 10 })]);
    expect(stats.profitFactor).toBe(Infinity);
  });

  it('returns 0 when there is no profit and no loss', () => {
    const stats = computeTradeStats([makeTrade({ pnl: 0 })]);
    expect(stats.profitFactor).toBe(0);
  });
});

// ─── Risk / Reward ────────────────────────────────────────────────────────────

describe('computeTradeStats — riskReward', () => {
  it('calculates avgWin / avgLoss', () => {
    const stats = computeTradeStats([
      makeTrade({ pnl: 20 }),
      makeTrade({ pnl: 20 }),
      makeTrade({ pnl: -5 }),
      makeTrade({ pnl: -5 }),
    ]);
    // avgWin=20, avgLoss=5 → 4
    expect(stats.riskReward).toBeCloseTo(4);
  });

  it('returns Infinity when there are no losses', () => {
    const stats = computeTradeStats([makeTrade({ pnl: 10 })]);
    expect(stats.riskReward).toBe(Infinity);
  });

  it('returns 0 when there are no wins and no losses', () => {
    const stats = computeTradeStats([makeTrade({ pnl: 0 })]);
    expect(stats.riskReward).toBe(0);
  });
});

// ─── Max drawdown ─────────────────────────────────────────────────────────────

describe('computeTradeStats — maxDrawdown', () => {
  it('calculates peak-to-trough drawdown', () => {
    // equity: 10 → 20 → 5 → 15  →  peak=20, trough=5, dd=15
    const stats = computeTradeStats([
      makeTrade({ pnl: 10, closed: day(1) }),
      makeTrade({ pnl: 10, closed: day(2) }),
      makeTrade({ pnl: -15, closed: day(3) }),
      makeTrade({ pnl: 10, closed: day(4) }),
    ]);
    expect(stats.maxDrawdown).toBeCloseTo(15);
  });

  it('calculates maxDrawdownPct relative to peak', () => {
    // peak=20, dd=15 → 75%
    const stats = computeTradeStats([
      makeTrade({ pnl: 10, closed: day(1) }),
      makeTrade({ pnl: 10, closed: day(2) }),
      makeTrade({ pnl: -15, closed: day(3) }),
    ]);
    expect(stats.maxDrawdownPct).toBeCloseTo(75);
  });

  it('returns 0 drawdown when equity only goes up', () => {
    const stats = computeTradeStats([
      makeTrade({ pnl: 5 }),
      makeTrade({ pnl: 5 }),
    ]);
    expect(stats.maxDrawdown).toBe(0);
    expect(stats.maxDrawdownPct).toBe(0);
  });
});

// ─── Consecutive streaks ──────────────────────────────────────────────────────

describe('computeTradeStats — consecutive streaks', () => {
  it('tracks maxConsecWins', () => {
    const stats = computeTradeStats([
      makeTrade({ pnl:  5 }),
      makeTrade({ pnl:  5 }),
      makeTrade({ pnl:  5 }),
      makeTrade({ pnl: -1 }),
      makeTrade({ pnl:  5 }),
    ]);
    expect(stats.maxConsecWins).toBe(3);
  });

  it('tracks maxConsecLosses', () => {
    const stats = computeTradeStats([
      makeTrade({ pnl:  5 }),
      makeTrade({ pnl: -1 }),
      makeTrade({ pnl: -1 }),
      makeTrade({ pnl: -1 }),
      makeTrade({ pnl:  5 }),
    ]);
    expect(stats.maxConsecLosses).toBe(3);
  });

  it('resets streak on breakeven trade', () => {
    const stats = computeTradeStats([
      makeTrade({ pnl:  5 }),
      makeTrade({ pnl:  5 }),
      makeTrade({ pnl:  0 }),  // breakeven resets streak
      makeTrade({ pnl:  5 }),
    ]);
    expect(stats.maxConsecWins).toBe(2);
  });
});

// ─── Fees ─────────────────────────────────────────────────────────────────────

describe('computeTradeStats — fees', () => {
  it('groups fees by source', () => {
    const stats = computeTradeStats([
      makeTrade({ pnl: 10, fee: 1, source: 'Jupiter' }),
      makeTrade({ pnl: 10, fee: 2, source: 'Jupiter' }),
      makeTrade({ pnl: 10, fee: 0.5, source: 'Pacifica' }),
    ]);
    expect(stats.feesBySource['Jupiter']).toBeCloseTo(3);
    expect(stats.feesBySource['Pacifica']).toBeCloseTo(0.5);
    expect(stats.totalFees).toBeCloseTo(3.5);
  });
});

// ─── VaR 95% ──────────────────────────────────────────────────────────────────

describe('computeTradeStats — var95', () => {
  it('returns the 5th-percentile PnL', () => {
    // 20 trades, 5th percentile = worst 5% = 1st value when sorted asc
    const trades = Array.from({ length: 20 }, (_, i) =>
      makeTrade({ pnl: i + 1 }),  // pnl: 1..20
    );
    const stats = computeTradeStats(trades);
    // sorted: [1,2,...20], ceil(0.05*20)-1 = ceil(1)-1 = 0 → var95 = 1
    expect(stats.var95).toBe(1);
  });

  it('returns 0 for empty trades', () => {
    expect(computeTradeStats([]).var95).toBe(0);
  });
});

// ─── Sharpe & Sortino ─────────────────────────────────────────────────────────

describe('computeTradeStats — Sharpe ratio', () => {
  it('returns 0 when all PnLs are equal (zero std dev)', () => {
    const stats = computeTradeStats([
      makeTrade({ pnl: 5 }),
      makeTrade({ pnl: 5 }),
      makeTrade({ pnl: 5 }),
    ]);
    expect(stats.sharpeRatio).toBe(0);
  });

  it('returns positive Sharpe for profitable trades with variance', () => {
    const stats = computeTradeStats([
      makeTrade({ pnl: 10 }),
      makeTrade({ pnl: 20 }),
      makeTrade({ pnl: -2 }),
    ]);
    expect(stats.sharpeRatio).toBeGreaterThan(0);
  });
});

describe('computeTradeStats — Sortino ratio', () => {
  it('returns Infinity when there are no losing trades', () => {
    const stats = computeTradeStats([
      makeTrade({ pnl: 10 }),
      makeTrade({ pnl: 20 }),
    ]);
    expect(stats.sortino).toBe(Infinity);
  });

  it('returns a finite number when there are losing trades', () => {
    const stats = computeTradeStats([
      makeTrade({ pnl: 10 }),
      makeTrade({ pnl: -5 }),
    ]);
    expect(isFinite(stats.sortino)).toBe(true);
  });
});

// ─── Recovery factor ──────────────────────────────────────────────────────────

describe('computeTradeStats — recoveryFactor', () => {
  it('returns totalPnl / maxDrawdown', () => {
    const stats = computeTradeStats([
      makeTrade({ pnl: 20, closed: day(1) }),
      makeTrade({ pnl: -10, closed: day(2) }),
      makeTrade({ pnl: 15, closed: day(3) }),
    ]);
    // peak=20, dd=10, totalPnl=25 → rf=2.5
    expect(stats.recoveryFactor).toBeCloseTo(2.5);
  });

  it('returns Infinity when there is no drawdown but positive PnL', () => {
    const stats = computeTradeStats([makeTrade({ pnl: 10 })]);
    expect(stats.recoveryFactor).toBe(Infinity);
  });
});

// ─── Sorting ──────────────────────────────────────────────────────────────────

describe('computeTradeStats — sorts by closed date', () => {
  it('builds equityCurve in chronological order regardless of input order', () => {
    const trades = [
      makeTrade({ pnl: 30, closed: day(3) }),
      makeTrade({ pnl: 10, closed: day(1) }),
      makeTrade({ pnl: 20, closed: day(2) }),
    ];
    const stats = computeTradeStats(trades);
    expect(stats.equityCurve).toEqual([10, 30, 60]);
  });
});
