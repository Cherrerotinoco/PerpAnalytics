// ─── Calculator math — pure functions, no React deps ─────────────────────────
// Extracted here so they can be unit-tested independently of the page component.

const MAX_ITER = 200_000;
const MAX_CHART_POINTS = 300;

// ─── Types ────────────────────────────────────────────────────────────────────
export interface CalcParams {
  winRate: number; // 0–1
  rr: number;
  lev: number;
  sl: number; // fraction (0–1)
}

export interface ChartPoint {
  trade: number;
  capital: number;
}

export interface MilestoneHit {
  target: number;
  trades: number | null;
}

export interface ComputeResult {
  riesgoReal: number;
  liqPct: number;
  expectancy: number;
  isLiquidated: boolean;
  isRentable: boolean;
  trajectory: ChartPoint[];
  milestoneHits: MilestoneHit[];
  totalTrades: number | null;
}

// ─── Core ─────────────────────────────────────────────────────────────────────
export const computeCalc = (
  p: CalcParams,
  initialCapital: number,
  target: number | null,
): ComputeResult => {
  const riesgoReal = p.sl * p.lev;
  const liqPct = (1 / p.lev) * 100;
  const expectancy = p.winRate * p.rr - (1 - p.winRate);
  const isLiquidated = riesgoReal >= 1;
  const isRentable = expectancy > 0 && !isLiquidated;

  const milestones = deriveMilestones(initialCapital, target);
  const milestoneHits: MilestoneHit[] = milestones.map((m) => ({ target: m, trades: null }));
  let totalTrades: number | null = null;
  let trajectory: ChartPoint[] = [{ trade: 0, capital: initialCapital }];

  if (isRentable) {
    const growth = 1 + expectancy * riesgoReal;
    let capital = initialCapital;
    let trade = 0;

    const stopAt = target ?? Infinity;
    while (capital < stopAt && trade < MAX_ITER) {
      capital *= growth;
      trade++;
      milestoneHits.forEach((mh) => {
        if (mh.trades === null && capital >= mh.target) mh.trades = trade;
      });
    }
    if (target !== null && capital >= target) totalTrades = trade;

    const totalSteps = totalTrades ?? Math.min(trade, MAX_ITER);
    const step = Math.max(1, Math.floor(totalSteps / MAX_CHART_POINTS));
    capital = initialCapital;
    const sparse: ChartPoint[] = [{ trade: 0, capital }];
    for (let t = 1; t <= totalSteps; t++) {
      capital *= growth;
      if (t % step === 0 || t === totalSteps) sparse.push({ trade: t, capital });
    }
    trajectory = sparse;
  }

  return { riesgoReal, liqPct, expectancy, isLiquidated, isRentable, trajectory, milestoneHits, totalTrades };
};

export const deriveMilestones = (initial: number, target: number | null): number[] => {
  if (target === null) {
    return [2, 5, 10, 20, 50].map((x) => parseFloat((initial * x).toPrecision(2)));
  }
  const ratio = target / initial;
  if (ratio <= 1) return [target];
  return [0.2, 0.4, 0.6, 0.8, 1.0].map((f) =>
    parseFloat((initial * Math.pow(ratio, f)).toPrecision(3)),
  );
};
