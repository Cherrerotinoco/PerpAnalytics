import { describe, it, expect } from 'vitest';
import { computeCalc, deriveMilestones } from './calculatorMath';
import type { CalcParams } from './calculatorMath';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const p = (overrides: Partial<CalcParams> = {}): CalcParams => ({
  winRate: 0.5,
  rr: 2,
  lev: 1,
  sl: 0.01, // 1% SL → 1% real risk
  ...overrides,
});

// ─── deriveMilestones ─────────────────────────────────────────────────────────
describe('deriveMilestones', () => {
  it('returns multiples of initial when target is null', () => {
    const ms = deriveMilestones(100, null);
    expect(ms).toHaveLength(5);
    expect(ms[0]).toBeCloseTo(200);  // ×2
    expect(ms[4]).toBeCloseTo(5000); // ×50
  });

  it('returns [target] when target <= initial', () => {
    expect(deriveMilestones(100, 50)).toEqual([50]);
    expect(deriveMilestones(100, 100)).toEqual([100]);
  });

  it('returns 5 checkpoints between initial and target', () => {
    const ms = deriveMilestones(100, 10000);
    expect(ms).toHaveLength(5);
    expect(ms[0]).toBeGreaterThan(100);
    expect(ms[4]).toBeCloseTo(10000, 0);
  });

  it('checkpoints increase monotonically', () => {
    const ms = deriveMilestones(100, 10000);
    for (let i = 1; i < ms.length; i++) {
      expect(ms[i]).toBeGreaterThan(ms[i - 1]);
    }
  });
});

// ─── computeCalc — edge cases ─────────────────────────────────────────────────
describe('computeCalc — edge cases', () => {
  it('flags liquidation when riesgoReal >= 100%', () => {
    // 10× leverage, 15% SL → riesgoReal = 1.5
    const r = computeCalc(p({ lev: 10, sl: 0.15 }), 100, 1000);
    expect(r.isLiquidated).toBe(true);
    expect(r.isRentable).toBe(false);
    expect(r.trajectory).toHaveLength(1); // only starting point
  });

  it('flags not rentable when expectancy <= 0', () => {
    // winRate 30%, RR 0.8 → expectancy = 0.3*0.8 - 0.7 = -0.46
    const r = computeCalc(p({ winRate: 0.3, rr: 0.8 }), 100, 1000);
    expect(r.isRentable).toBe(false);
    expect(r.totalTrades).toBeNull();
  });

  it('computes correct expectancy', () => {
    // winRate 0.5, RR 2 → expectancy = 0.5*2 - 0.5 = 0.5
    const r = computeCalc(p(), 100, 200);
    expect(r.expectancy).toBeCloseTo(0.5);
  });

  it('computes riesgoReal as sl × lev', () => {
    const r = computeCalc(p({ sl: 0.02, lev: 5 }), 100, 1000);
    expect(r.riesgoReal).toBeCloseTo(0.1);
  });

  it('computes liqPct as 100 / lev', () => {
    const r = computeCalc(p({ lev: 4 }), 100, 1000);
    expect(r.liqPct).toBeCloseTo(25);
  });
});

// ─── computeCalc — growth model ───────────────────────────────────────────────
describe('computeCalc — growth model', () => {
  it('reaches the target in a finite number of trades', () => {
    const r = computeCalc(p(), 100, 200);
    expect(r.totalTrades).not.toBeNull();
    expect(r.totalTrades).toBeGreaterThan(0);
  });

  it('trajectory starts at initialCapital', () => {
    const r = computeCalc(p(), 100, 200);
    expect(r.trajectory[0]).toEqual({ trade: 0, capital: 100 });
  });

  it('trajectory ends at or above target', () => {
    const r = computeCalc(p(), 100, 200);
    const last = r.trajectory[r.trajectory.length - 1];
    expect(last.capital).toBeGreaterThanOrEqual(200);
  });

  it('trajectory is monotonically increasing for profitable system', () => {
    const r = computeCalc(p(), 100, 500);
    for (let i = 1; i < r.trajectory.length; i++) {
      expect(r.trajectory[i].capital).toBeGreaterThan(r.trajectory[i - 1].capital);
    }
  });

  it('returns null totalTrades when no target is set', () => {
    const r = computeCalc(p(), 100, null);
    expect(r.totalTrades).toBeNull();
    expect(r.trajectory.length).toBeGreaterThan(1);
  });

  it('milestone hits are in ascending trade count order', () => {
    const r = computeCalc(p(), 100, 10000);
    const hits = r.milestoneHits.filter((mh) => mh.trades !== null);
    for (let i = 1; i < hits.length; i++) {
      expect(hits[i].trades!).toBeGreaterThanOrEqual(hits[i - 1].trades!);
    }
  });

  it('all milestones are hit when target is reachable', () => {
    const r = computeCalc(p(), 100, 10000);
    r.milestoneHits.forEach((mh) => {
      expect(mh.trades).not.toBeNull();
    });
  });

  it('higher leverage with same SL % reaches target faster', () => {
    const slow = computeCalc(p({ lev: 1, sl: 0.02 }), 100, 200);
    const fast = computeCalc(p({ lev: 2, sl: 0.02 }), 100, 200);
    expect(fast.totalTrades!).toBeLessThan(slow.totalTrades!);
  });
});
