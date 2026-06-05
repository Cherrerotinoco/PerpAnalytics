import { describe, it, expect } from 'vitest';
import { computeByHour } from './pnlByHourChart';
import type { Trade } from '../../types/tradeTypes';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const makeTrade = (hour: number, pnl: number, useOpen = true): Trade =>
  ({
    opened: new Date(2025, 0, 1, hour, 0, 0),
    closed: new Date(2025, 0, 1, hour + 1, 0, 0),
    pnl,
  }) as unknown as Trade;

// ─── computeByHour (PnL) ─────────────────────────────────────────────────────
describe('pnlByHourChart — computeByHour', () => {
  it('returns empty array for no trades', () => {
    expect(computeByHour([], true)).toEqual([]);
  });

  it('excludes hours with no trades', () => {
    const trades = [makeTrade(9, 100), makeTrade(9, 50)];
    const result = computeByHour(trades, true);
    expect(result).toHaveLength(1);
    expect(result[0].hour).toBe(9);
  });

  it('sums pnl correctly within the same hour', () => {
    const trades = [makeTrade(14, 100), makeTrade(14, -30), makeTrade(14, 20)];
    const result = computeByHour(trades, true);
    expect(result[0].pnl).toBeCloseTo(90);
  });

  it('counts wins correctly', () => {
    const trades = [makeTrade(10, 50), makeTrade(10, -20), makeTrade(10, 30)];
    const result = computeByHour(trades, true);
    expect(result[0].wins).toBe(2);
    expect(result[0].trades).toBe(3);
  });

  it('formats label as zero-padded hour', () => {
    const trades = [makeTrade(3, 10)];
    const result = computeByHour(trades, true);
    expect(result[0].label).toBe('03h');
  });

  it('uses opened time when useOpen is true', () => {
    const t = {
      opened: new Date(2025, 0, 1, 9, 0, 0),
      closed: new Date(2025, 0, 1, 17, 0, 0),
      pnl: 100,
    } as unknown as Trade;
    const r = computeByHour([t], true);
    expect(r[0].hour).toBe(9);
  });

  it('uses closed time when useOpen is false', () => {
    const t = {
      opened: new Date(2025, 0, 1, 9, 0, 0),
      closed: new Date(2025, 0, 1, 17, 0, 0),
      pnl: 100,
    } as unknown as Trade;
    const r = computeByHour([t], false);
    expect(r[0].hour).toBe(17);
  });

  it('rounds pnl to 2 decimal places', () => {
    const trades = [makeTrade(8, 0.1), makeTrade(8, 0.2)];
    const result = computeByHour(trades, true);
    expect(result[0].pnl).toBe(0.3);
  });

  it('computes winRate correctly', () => {
    const trades = [makeTrade(12, 10), makeTrade(12, -5), makeTrade(12, 5), makeTrade(12, -3)];
    const result = computeByHour(trades, true);
    expect(result[0].winRate).toBe(50);
  });

  it('returns results sorted by hour of appearance (bucket order)', () => {
    const trades = [makeTrade(16, 10), makeTrade(8, 20), makeTrade(12, -5)];
    const result = computeByHour(trades, true);
    const hours = result.map((r) => r.hour);
    expect(hours).toEqual([...hours].sort((a, b) => a - b));
  });
});
