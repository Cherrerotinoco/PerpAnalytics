import { describe, it, expect } from 'vitest';
import { computeByWeekday } from './winRateByWeekdayChart';
import type { Trade } from '../../types/tradeTypes';

// ─── Helpers ──────────────────────────────────────────────────────────────────
// Jan 5 2025 = Sunday (day 0), Jan 6 = Monday, etc.
const makeTrade = (dayOfWeek: number, pnl: number): Trade =>
  ({
    opened: new Date(2025, 0, 5 + dayOfWeek), // Sunday + offset
    closed: new Date(2025, 0, 5 + dayOfWeek),
    pnl,
  }) as unknown as Trade;

// ─── computeByWeekday (Win Rate) ─────────────────────────────────────────────
describe('winRateByWeekdayChart — computeByWeekday', () => {
  it('returns empty array for no trades', () => {
    expect(computeByWeekday([], true)).toEqual([]);
  });

  it('excludes days with no trades', () => {
    const trades = [makeTrade(1, 50), makeTrade(1, -10)]; // Monday only
    const result = computeByWeekday(trades, true);
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('Mon');
  });

  it('computes winRate correctly', () => {
    const trades = [makeTrade(3, 10), makeTrade(3, 20), makeTrade(3, -5)]; // Wed: 2/3
    const result = computeByWeekday(trades, true);
    expect(result[0].winRate).toBe(67);
  });

  it('winRate is 0 when all trades lose', () => {
    const trades = [makeTrade(5, -10), makeTrade(5, -20)]; // Fri
    const result = computeByWeekday(trades, true);
    expect(result[0].winRate).toBe(0);
  });

  it('winRate is 100 when all trades win', () => {
    const trades = [makeTrade(2, 10), makeTrade(2, 30)]; // Tue
    const result = computeByWeekday(trades, true);
    expect(result[0].winRate).toBe(100);
  });

  it('assigns correct labels for all 7 days', () => {
    const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    labels.forEach((label, i) => {
      const result = computeByWeekday([makeTrade(i, 10)], true);
      expect(result[0].label).toBe(label);
    });
  });

  it('uses opened time when useOpen is true', () => {
    const t = {
      opened: new Date(2025, 0, 7), // Tuesday
      closed: new Date(2025, 0, 10), // Friday
      pnl: 50,
    } as unknown as Trade;
    const result = computeByWeekday([t], true);
    expect(result[0].label).toBe('Tue');
  });

  it('uses closed time when useOpen is false', () => {
    const t = {
      opened: new Date(2025, 0, 7), // Tuesday
      closed: new Date(2025, 0, 10), // Friday
      pnl: 50,
    } as unknown as Trade;
    const result = computeByWeekday([t], false);
    expect(result[0].label).toBe('Fri');
  });

  it('counts wins and total trades per day', () => {
    const trades = [makeTrade(4, 10), makeTrade(4, -5), makeTrade(4, 15), makeTrade(4, -2)]; // Thu
    const result = computeByWeekday(trades, true);
    expect(result[0].trades).toBe(4);
    expect(result[0].wins).toBe(2);
  });

  it('handles multiple weekdays independently', () => {
    const trades = [
      makeTrade(1, 10),
      makeTrade(1, -5), // Mon: 1/2
      makeTrade(4, 10),
      makeTrade(4, 10), // Thu: 2/2
    ];
    const result = computeByWeekday(trades, true);
    expect(result).toHaveLength(2);
    const mon = result.find((r) => r.label === 'Mon')!;
    const thu = result.find((r) => r.label === 'Thu')!;
    expect(mon.winRate).toBe(50);
    expect(thu.winRate).toBe(100);
  });
});
