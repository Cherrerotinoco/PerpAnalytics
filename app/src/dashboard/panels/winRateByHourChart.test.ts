import { describe, it, expect } from 'vitest';
import { computeByHour } from './winRateByHourChart';
import type { Trade } from '../../types/tradeTypes';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const makeTrade = (hour: number, pnl: number): Trade =>
  ({
    opened: new Date(2025, 0, 1, hour, 0, 0),
    closed: new Date(2025, 0, 1, hour + 1, 0, 0),
    pnl,
  }) as unknown as Trade;

// ─── computeByHour (Win Rate) ─────────────────────────────────────────────────
describe('winRateByHourChart — computeByHour', () => {
  it('returns empty array for no trades', () => {
    expect(computeByHour([], true)).toEqual([]);
  });

  it('excludes hours with no trades', () => {
    const trades = [makeTrade(10, 50), makeTrade(10, -10)];
    const result = computeByHour(trades, true);
    expect(result).toHaveLength(1);
  });

  it('computes winRate as percentage of wins', () => {
    const trades = [makeTrade(9, 10), makeTrade(9, 10), makeTrade(9, -5)]; // 2/3
    const result = computeByHour(trades, true);
    expect(result[0].winRate).toBe(67); // Math.round(2/3 * 100)
  });

  it('winRate is 0% when all trades are losses', () => {
    const trades = [makeTrade(11, -10), makeTrade(11, -20)];
    const result = computeByHour(trades, true);
    expect(result[0].winRate).toBe(0);
  });

  it('winRate is 100% when all trades are wins', () => {
    const trades = [makeTrade(14, 30), makeTrade(14, 50)];
    const result = computeByHour(trades, true);
    expect(result[0].winRate).toBe(100);
  });

  it('counts wins and total trades', () => {
    const trades = [makeTrade(8, 10), makeTrade(8, -5), makeTrade(8, 15)];
    const result = computeByHour(trades, true);
    expect(result[0].wins).toBe(2);
    expect(result[0].trades).toBe(3);
  });

  it('formats label as zero-padded hour', () => {
    const result = computeByHour([makeTrade(5, 10)], true);
    expect(result[0].label).toBe('05h');
  });

  it('uses opened time when useOpen is true', () => {
    const t = {
      opened: new Date(2025, 0, 1, 7, 0, 0),
      closed: new Date(2025, 0, 1, 20, 0, 0),
      pnl: 100,
    } as unknown as Trade;
    expect(computeByHour([t], true)[0].hour).toBe(7);
  });

  it('uses closed time when useOpen is false', () => {
    const t = {
      opened: new Date(2025, 0, 1, 7, 0, 0),
      closed: new Date(2025, 0, 1, 20, 0, 0),
      pnl: 100,
    } as unknown as Trade;
    expect(computeByHour([t], false)[0].hour).toBe(20);
  });

  it('handles multiple different hours independently', () => {
    const trades = [makeTrade(9, 10), makeTrade(10, -5), makeTrade(9, -3), makeTrade(10, 7)];
    const result = computeByHour(trades, true);
    expect(result).toHaveLength(2);
    const h9 = result.find((r) => r.hour === 9)!;
    const h10 = result.find((r) => r.hour === 10)!;
    expect(h9.winRate).toBe(50);
    expect(h10.winRate).toBe(50);
  });
});
