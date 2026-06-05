import { describe, it, expect } from 'vitest';
import { computeByWeekday } from './pnlByWeekdayChart';
import type { Trade } from '../../types/tradeTypes';

// ─── Helpers ──────────────────────────────────────────────────────────────────
// Jan 6 2025 = Monday (day 1), Jan 5 = Sunday (day 0)
const DAY_OFFSETS: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const makeTrade = (dayOfWeek: number, pnl: number, openDow = dayOfWeek): Trade => {
  // Find a date in Jan 2025 matching dayOfWeek
  // Jan 5 2025 = Sunday
  const baseDate = new Date(2025, 0, 5 + openDow); // offset from Sunday
  const closeDate = new Date(2025, 0, 5 + dayOfWeek);
  return {
    opened: baseDate,
    closed: closeDate,
    pnl,
  } as unknown as Trade;
};

// ─── computeByWeekday (PnL) ──────────────────────────────────────────────────
describe('pnlByWeekdayChart — computeByWeekday', () => {
  it('returns empty array for no trades', () => {
    expect(computeByWeekday([], true)).toEqual([]);
  });

  it('excludes days with no trades', () => {
    const trades = [makeTrade(1, 100), makeTrade(1, 50)]; // both Monday
    const result = computeByWeekday(trades, true);
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('Mon');
  });

  it('sums pnl correctly for the same day', () => {
    const trades = [makeTrade(3, 200), makeTrade(3, -50)]; // Wednesday
    const result = computeByWeekday(trades, true);
    expect(result[0].pnl).toBeCloseTo(150);
  });

  it('counts trades and wins correctly', () => {
    const trades = [makeTrade(5, 80), makeTrade(5, -20), makeTrade(5, 10)]; // Friday
    const result = computeByWeekday(trades, true);
    expect(result[0].trades).toBe(3);
    expect(result[0].wins).toBe(2);
  });

  it('assigns correct day labels', () => {
    const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    labels.forEach((label, i) => {
      const result = computeByWeekday([makeTrade(i, 10)], true);
      expect(result[0].label).toBe(label);
    });
  });

  it('uses opened time when useOpen is true', () => {
    // opened = Tuesday (day 2), closed = Friday (day 5)
    const t = {
      opened: new Date(2025, 0, 7), // Jan 7 2025 = Tuesday
      closed: new Date(2025, 0, 10), // Jan 10 2025 = Friday
      pnl: 100,
    } as unknown as Trade;
    const result = computeByWeekday([t], true);
    expect(result[0].label).toBe('Tue');
  });

  it('uses closed time when useOpen is false', () => {
    const t = {
      opened: new Date(2025, 0, 7), // Tuesday
      closed: new Date(2025, 0, 10), // Friday
      pnl: 100,
    } as unknown as Trade;
    const result = computeByWeekday([t], false);
    expect(result[0].label).toBe('Fri');
  });

  it('computes winRate per day', () => {
    const trades = [makeTrade(2, 10), makeTrade(2, -5), makeTrade(2, 10), makeTrade(2, 10)]; // 3/4
    const result = computeByWeekday(trades, true);
    expect(result[0].winRate).toBe(75);
  });

  it('rounds pnl to 2 decimal places', () => {
    const trades = [makeTrade(4, 0.1), makeTrade(4, 0.2)];
    const result = computeByWeekday(trades, true);
    expect(result[0].pnl).toBeCloseTo(0.3);
  });
});
