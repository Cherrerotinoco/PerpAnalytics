import { describe, it, expect } from 'vitest';
import { computeByDuration } from './durationUtils';
import type { Trade } from '../../types/tradeTypes';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const makeTrade = (durationMs: number, pnl: number): Trade => {
  const opened = new Date(2025, 0, 1, 10, 0, 0);
  const closed = new Date(opened.getTime() + durationMs);
  return { opened, closed, pnl } as unknown as Trade;
};

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

// ─── computeByDuration ───────────────────────────────────────────────────────
describe('computeByDuration', () => {
  it('returns empty array for no trades', () => {
    expect(computeByDuration([])).toEqual([]);
  });

  it('buckets scalping trades (< 1h)', () => {
    const trades = [makeTrade(30 * MIN, 100), makeTrade(59 * MIN, -20)];
    const result = computeByDuration(trades);
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe('scalping');
    expect(result[0].trades).toBe(2);
  });

  it('buckets day-trading trades (1h – 24h)', () => {
    const trades = [makeTrade(HOUR, 50), makeTrade(12 * HOUR, -10)];
    const result = computeByDuration(trades);
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe('daytrading');
  });

  it('buckets swing trades (> 24h)', () => {
    const trades = [makeTrade(25 * HOUR, 200), makeTrade(72 * HOUR, 150)];
    const result = computeByDuration(trades);
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe('swing');
  });

  it('returns multiple buckets when trades span categories', () => {
    const trades = [
      makeTrade(15 * MIN, 50), // scalping
      makeTrade(4 * HOUR, -30), // day trading
      makeTrade(48 * HOUR, 100), // swing
    ];
    const result = computeByDuration(trades);
    expect(result).toHaveLength(3);
    const keys = result.map((r) => r.key);
    expect(keys).toContain('scalping');
    expect(keys).toContain('daytrading');
    expect(keys).toContain('swing');
  });

  it('sums pnl correctly within a bucket', () => {
    const trades = [makeTrade(10 * MIN, 100), makeTrade(20 * MIN, -40), makeTrade(30 * MIN, 60)];
    const result = computeByDuration(trades);
    expect(result[0].pnl).toBeCloseTo(120);
  });

  it('counts wins correctly', () => {
    const trades = [makeTrade(5 * MIN, 10), makeTrade(5 * MIN, -5), makeTrade(5 * MIN, 20)];
    const result = computeByDuration(trades);
    expect(result[0].wins).toBe(2);
    expect(result[0].trades).toBe(3);
  });

  it('computes winRate as percentage', () => {
    const trades = [makeTrade(5 * MIN, 10), makeTrade(5 * MIN, -5)]; // 1/2 = 50%
    const result = computeByDuration(trades);
    expect(result[0].winRate).toBe(50);
  });

  it('excludes bucket with no trades', () => {
    const trades = [makeTrade(10 * MIN, 50)]; // scalping only
    const result = computeByDuration(trades);
    const keys = result.map((r) => r.key);
    expect(keys).not.toContain('daytrading');
    expect(keys).not.toContain('swing');
  });

  it('boundary: exactly 1h goes to daytrading not scalping', () => {
    const trades = [makeTrade(HOUR, 100)];
    const result = computeByDuration(trades);
    expect(result[0].key).toBe('daytrading');
  });

  it('boundary: exactly 24h goes to swing not daytrading', () => {
    const trades = [makeTrade(24 * HOUR, 100)];
    const result = computeByDuration(trades);
    expect(result[0].key).toBe('swing');
  });

  it('rounds pnl to 2 decimal places', () => {
    const trades = [makeTrade(10 * MIN, 0.1), makeTrade(10 * MIN, 0.2)];
    const result = computeByDuration(trades);
    expect(result[0].pnl).toBe(0.3);
  });
});
