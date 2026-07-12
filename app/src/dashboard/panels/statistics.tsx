import { memo, useState, createContext, useContext } from 'react';
import { Trade } from '../../types/tradeTypes';
import { TOOLTIPS } from '../../utils/metricTooltips';

// When true, Metric renders its label text inside the card (used on the landing page).
export const MetricLabelContext = createContext(false);

// ─── Types ────────────────────────────────────────────────────────────────────
export interface SessionStats {
  name: string;
  trades: number;
  wins: number;
  winRate: number;
  totalPnl: number;
  avgPnl: number;
}

export interface TradeStats {
  totalPnl: number;
  equityCurve: number[];
  equityCurveLabels: string[];
  maxLoss: number;
  maxWin: number;
  profitFactor: number;
  totalTrades: number;
  winTrades: number;
  lossTrades: number;
  winRate: number;
  lossRate: number;
  avgWin: number;
  avgLoss: number;
  medianWin: number;
  medianLoss: number;
  p90Win: number;
  p90Loss: number;
  riskReward: number;
  expectancy: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  sharpeRatio: number;
  sortino: number;
  maxConsecWins: number;
  maxConsecLosses: number;
  calmarRatio: number;
  recoveryFactor: number;
  var95: number;
  pnlList: number[];
  feesBySource: Record<string, number>;
  totalFees: number;
  // Maker/taker split — only counts trades from venues that report it (Pacifica).
  takerFees: number;
  makerFees: number;
  feesWithRole: number; // total fee from trades that have a maker/taker split
  takerFeePct: number;
  bySession: SessionStats[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const median = (sorted: number[]): number => {
  if (!sorted.length) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const percentile = (sorted: number[], p: number): number => {
  if (!sorted.length) return 0;
  const idx = Math.ceil(p * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
};

/** UTC hour → market session name */
const sessionOf = (date: Date): string => {
  const h = date.getUTCHours();
  if (h < 8) return 'Asia';
  if (h < 13) return 'London';
  if (h < 17) return 'NY Open';
  if (h < 21) return 'New York';
  return 'Off Hours';
};

const SESSION_ORDER = ['Asia', 'London', 'NY Open', 'New York', 'Off Hours'];

const stdDev = (values: number[]): number => {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
};

// Downside deviation per Sortino standard: RMS of returns clipped at MAR=0,
// using the full trade count as denominator (not just the losing-trade count).
//   σ_d = sqrt( Σ min(rᵢ, 0)² / n )
const downsideStdDev = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sumSq = values.reduce((acc, v) => acc + Math.min(v, 0) ** 2, 0);
  return Math.sqrt(sumSq / values.length);
};

// ─── Stats computation ────────────────────────────────────────────────────────
export const computeTradeStats = (trades: Trade[]): TradeStats => {
  const sortedTrades = [...trades].sort((a, b) => {
    const tA = a.closed?.getTime() ?? a.opened?.getTime() ?? 0;
    const tB = b.closed?.getTime() ?? b.opened?.getTime() ?? 0;
    return tA - tB;
  });

  let totalPnl = 0;
  const equityCurve: number[] = [];
  const equityCurveLabels: string[] = [];
  let maxLoss = 0;
  let maxWin = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let winTrades = 0;
  let lossTrades = 0;
  let sumWin = 0;
  let sumLoss = 0;
  const pnlList: number[] = [];
  const feesBySource: Record<string, number> = {};
  let takerFees = 0;
  let makerFees = 0;

  let peak = 0;
  let maxDrawdown = 0;
  let maxDrawdownPct = 0;
  let consecWins = 0;
  let consecLosses = 0;
  let maxConsecWins = 0;
  let maxConsecLosses = 0;

  sortedTrades.forEach((t) => {
    totalPnl += t.pnl;
    equityCurve.push(Number(totalPnl.toFixed(2)));
    pnlList.push(t.pnl);
    if (t.source) {
      feesBySource[t.source] = (feesBySource[t.source] ?? 0) + (t.fee ?? 0);
    }
    if (t.takerFee !== undefined) takerFees += t.takerFee;
    if (t.makerFee !== undefined) makerFees += t.makerFee;

    const dateRef = t.closed ?? t.opened;
    const ts = dateRef instanceof Date && !isNaN(dateRef.getTime()) ? dateRef.getTime() : null;
    equityCurveLabels.push(ts !== null ? String(ts) : '');

    if (totalPnl > peak) {
      peak = totalPnl;
    }
    const dd = peak - totalPnl;
    if (dd > maxDrawdown) {
      maxDrawdown = dd;
      maxDrawdownPct = peak > 0 ? (dd / peak) * 100 : 0;
    }

    if (t.pnl > 0) {
      grossProfit += t.pnl;
      sumWin += t.pnl;
      winTrades++;
      if (t.pnl > maxWin) {
        maxWin = t.pnl;
      }
      consecWins++;
      consecLosses = 0;
      if (consecWins > maxConsecWins) {
        maxConsecWins = consecWins;
      }
    } else if (t.pnl < 0) {
      grossLoss += Math.abs(t.pnl);
      sumLoss += Math.abs(t.pnl);
      lossTrades++;
      if (Math.abs(t.pnl) > maxLoss) {
        maxLoss = Math.abs(t.pnl);
      }
      consecLosses++;
      consecWins = 0;
      if (consecLosses > maxConsecLosses) {
        maxConsecLosses = consecLosses;
      }
    } else {
      consecWins = 0;
      consecLosses = 0;
    }
  });

  const totalTrades = trades.length;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
  const winRate = totalTrades > 0 ? (winTrades / totalTrades) * 100 : 0;
  const lossRate = totalTrades > 0 ? (lossTrades / totalTrades) * 100 : 0;
  const avgWin = winTrades > 0 ? sumWin / winTrades : 0;
  const avgLoss = lossTrades > 0 ? sumLoss / lossTrades : 0;
  const riskReward = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? Infinity : 0;
  const expectancy = totalTrades > 0 ? (winRate / 100) * avgWin - (lossRate / 100) * avgLoss : 0;
  const std = stdDev(pnlList);
  const sharpeRatio = std > 0 ? expectancy / std : 0;
  const dStd = downsideStdDev(pnlList);
  const sortino = dStd > 0 ? expectancy / dStd : expectancy > 0 ? Infinity : 0;

  // Calmar: annualised PnL ÷ max drawdown.
  // Period = time between first and last closed trade; falls back to raw PnL
  // when the window is < 1 day (avoids division by near-zero).
  const firstTs = sortedTrades[0]?.closed?.getTime() ?? sortedTrades[0]?.opened?.getTime() ?? 0;
  const lastTs =
    sortedTrades[sortedTrades.length - 1]?.closed?.getTime() ??
    sortedTrades[sortedTrades.length - 1]?.opened?.getTime() ??
    0;
  const periodYears =
    firstTs > 0 && lastTs > firstTs ? (lastTs - firstTs) / (365.25 * 24 * 60 * 60 * 1000) : 0;
  const annualisedPnl = periodYears >= 1 / 365 ? totalPnl / periodYears : totalPnl;
  const calmarRatio =
    maxDrawdown > 0 ? annualisedPnl / maxDrawdown : annualisedPnl > 0 ? Infinity : 0;

  // Recovery Factor: total net profit ÷ max drawdown (not annualised).
  const recoveryFactor = maxDrawdown > 0 ? totalPnl / maxDrawdown : totalPnl > 0 ? Infinity : 0;
  const sortedPnl = [...pnlList].sort((a, b) => a - b);
  const var95Index = Math.max(0, Math.ceil(0.05 * sortedPnl.length) - 1);
  const var95 = sortedPnl.length > 0 ? (sortedPnl[var95Index] ?? 0) : 0;
  const totalFees = Object.values(feesBySource).reduce((a, b) => a + b, 0);
  const feesWithRole = takerFees + makerFees;
  const takerFeePct = feesWithRole > 0 ? (takerFees / feesWithRole) * 100 : 0;

  // ── Distribution stats ──────────────────────────────────────────────────────
  const winPnls = pnlList.filter((v) => v > 0).sort((a, b) => a - b);
  const lossPnls = pnlList
    .filter((v) => v < 0)
    .map(Math.abs)
    .sort((a, b) => a - b);

  const medianWin = median(winPnls);
  const medianLoss = median(lossPnls);
  // p90Win: 90th percentile of wins — "top 10% wins are above this"
  const p90Win = percentile(winPnls, 0.9);
  // p90Loss: 90th percentile of losses by size — "top 10% losses are above this"
  const p90Loss = percentile(lossPnls, 0.9);

  // ── Session breakdown ───────────────────────────────────────────────────────
  const sessionMap = new Map<string, { wins: number; pnls: number[] }>();
  SESSION_ORDER.forEach((s) => sessionMap.set(s, { wins: 0, pnls: [] }));

  for (const t of sortedTrades) {
    const ref = t.opened ?? t.closed;
    if (!(ref instanceof Date) || isNaN(ref.getTime())) continue;
    const s = sessionOf(ref);
    const bucket = sessionMap.get(s)!;
    bucket.pnls.push(t.pnl);
    if (t.pnl > 0) bucket.wins++;
  }

  const bySession: SessionStats[] = SESSION_ORDER.map((name) => {
    const { wins, pnls } = sessionMap.get(name)!;
    const n = pnls.length;
    const total = pnls.reduce((a, b) => a + b, 0);
    return {
      name,
      trades: n,
      wins,
      winRate: n > 0 ? (wins / n) * 100 : 0,
      totalPnl: total,
      avgPnl: n > 0 ? total / n : 0,
    };
  }).filter((s) => s.trades > 0);

  return {
    totalPnl,
    equityCurve,
    equityCurveLabels,
    maxLoss,
    maxWin,
    profitFactor,
    totalTrades,
    winTrades,
    lossTrades,
    winRate,
    lossRate,
    avgWin,
    avgLoss,
    medianWin,
    medianLoss,
    p90Win,
    p90Loss,
    riskReward,
    expectancy,
    maxDrawdown,
    maxDrawdownPct,
    sharpeRatio,
    sortino,
    maxConsecWins,
    maxConsecLosses,
    calmarRatio,
    recoveryFactor,
    var95,
    pnlList,
    feesBySource,
    totalFees,
    takerFees,
    makerFees,
    feesWithRole,
    takerFeePct,
    bySession,
  };
};

// ─── Formatters ───────────────────────────────────────────────────────────────
export const fmtNum = (n: number, decimals = 2): string => {
  if (!isFinite(n)) {
    return '∞';
  }
  return n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

export const fmtPct = (n: number): string => `${n.toFixed(0)}%`;

export const sign = (n: number): string => (n >= 0 ? '+' : '');

export const sharpeLabel = (v: number): string => {
  if (v >= 2) {
    return 'Excellent';
  }
  if (v >= 1) {
    return 'Good';
  }
  if (v >= 0) {
    return 'Acceptable';
  }
  return 'Negative';
};

// ─── Color helpers ────────────────────────────────────────────────────────────
export const posNegClass = (v: number): string => (v >= 0 ? 'tc-green' : 'tc-red');

export const ratioClass = (v: number): string => {
  if (v >= 1) {
    return 'tc-green';
  }
  if (v >= 0) {
    return 'tc-amber';
  }
  return 'tc-red';
};

// ─── Shared UI primitives ─────────────────────────────────────────────────────
export const Metric = ({
  label,
  value,
  sub,
  colorClass,
  tooltip,
}: {
  label: string;
  value: string;
  sub?: string;
  colorClass?: string;
  tooltip?: string;
}) => {
  const [flipped, setFlipped] = useState(false);
  const showLabel = useContext(MetricLabelContext);

  if (!tooltip) {
    return (
      <div className="tc-card">
        {showLabel && <p className="tc-metric-inline-label">{label}</p>}
        <p className={`tc-value mb-0 ${colorClass ?? ''}`}>{value}</p>
        {sub && <p className="tc-metric-sub">{sub}</p>}
      </div>
    );
  }

  return (
    <div
      className={`tc-card tc-flip-card${flipped ? ' tc-flip-card--flipped' : ''}`}
      onMouseLeave={() => setFlipped(false)}
    >
      <div className="tc-flip-inner">
        {/* ── Front ── */}
        <div className="tc-flip-front">
          {showLabel ? (
            <div className="tc-metric-header">
              <p className="tc-metric-inline-label">{label}</p>
              <button
                type="button"
                className="tc-flip-trigger tc-flip-trigger--inline"
                onMouseEnter={() => setFlipped(true)}
                aria-label={`About ${label}`}
              >
                ?
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="tc-flip-trigger"
              onMouseEnter={() => setFlipped(true)}
              aria-label={`About ${label}`}
            >
              ?
            </button>
          )}
          <p className={`tc-value mb-0 ${colorClass ?? ''}`}>{value}</p>
          {sub && <p className="tc-metric-sub">{sub}</p>}
        </div>
        {/* ── Back ── */}
        <div className="tc-flip-back">
          <div className="tc-flip-back-text-wrap">
            <p className="tc-flip-back-text">{tooltip}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

const MetricGrid = ({ children }: { children: React.ReactNode }) => (
  <div className="tc-metric-grid">{children}</div>
);

// ─── Performance section ──────────────────────────────────────────────────────
export const PerformanceSection = memo(({ stats: st }: { stats: TradeStats }) => (
  <div className="tc-section">
    <MetricGrid>
      <Metric
        label="Total PnL"
        value={`${sign(st.totalPnl)}${fmtNum(st.totalPnl)} $`}
        colorClass={posNegClass(st.totalPnl)}
        tooltip={TOOLTIPS.totalPnl}
      />
      <Metric
        label="Profit Factor"
        value={isFinite(st.profitFactor) ? fmtNum(st.profitFactor) : '∞'}
        sub={st.profitFactor >= 1 ? 'Profitable' : 'Unprofitable'}
        colorClass={st.profitFactor >= 1 ? 'tc-green' : 'tc-red'}
        tooltip={TOOLTIPS.profitFactor}
      />
      <Metric
        label="Max Profit"
        value={`+${fmtNum(st.maxWin)} $`}
        colorClass="tc-green"
        tooltip={TOOLTIPS.maxProfit}
      />
      <Metric
        label="Max Loss"
        value={`-${fmtNum(st.maxLoss)} $`}
        colorClass="tc-red"
        tooltip={TOOLTIPS.maxLoss}
      />
      <Metric
        label="Expectancy"
        value={`${sign(st.expectancy)}${fmtNum(st.expectancy)} $`}
        sub="per trade"
        colorClass={posNegClass(st.expectancy)}
        tooltip={TOOLTIPS.expectancy}
      />
      <Metric
        label="Risk / Reward"
        value={isFinite(st.riskReward) ? fmtNum(st.riskReward) : '∞'}
        sub="avg win / avg loss"
        colorClass={st.riskReward >= 1 ? 'tc-green' : ''}
        tooltip={TOOLTIPS.riskReward}
      />
    </MetricGrid>

    {/* ── Fees by platform ── */}
    {Object.keys(st.feesBySource).length > 0 && (
      <div className="tc-card mt-2">
        <p className="tc-label mb-1">Fees Paid</p>

        {Object.entries(st.feesBySource)
          .sort((a, b) => b[1] - a[1])
          .map(([source, fee]) => (
            <div key={source} className="tc-fees-row">
              <span className="tc-metric-sub">{source}</span>
              <span className="tc-fees-amount">-{fmtNum(fee)} $</span>
            </div>
          ))}

        {Object.keys(st.feesBySource).length > 1 && (
          <div className="tc-fees-total">
            <span className="tc-metric-sub fw-semibold">Total</span>
            <span className="tc-fees-amount">-{fmtNum(st.totalFees)} $</span>
          </div>
        )}

        {st.feesWithRole > 0 && (
          <div className="tc-fees-role">
            <div className="tc-fees-row">
              <span className="tc-metric-sub">Taker</span>
              <span className="tc-fees-amount">-{fmtNum(st.takerFees)} $</span>
            </div>
            <div className="tc-fees-row">
              <span className="tc-metric-sub">Maker</span>
              <span className="tc-fees-amount">-{fmtNum(st.makerFees)} $</span>
            </div>
            <p className="tc-metric-sub mt-1">
              {fmtPct(st.takerFeePct)} of fees paid as taker
              {st.takerFeePct >= 99 ? ' — using limit (maker) orders could cut this.' : ''}
            </p>
          </div>
        )}
      </div>
    )}
  </div>
));

// ─── Risk & Drawdown section ──────────────────────────────────────────────────
export const RiskSection = memo(({ stats: st }: { stats: TradeStats }) => (
  <div className="tc-section">
    <MetricGrid>
      <Metric
        label="Max Drawdown"
        value={`-${fmtNum(st.maxDrawdown)} $`}
        sub={`${fmtNum(st.maxDrawdownPct, 1)}% from peak`}
        colorClass="tc-red"
        tooltip={TOOLTIPS.maxDrawdown}
      />
      <Metric
        label="Calmar Ratio"
        value={isFinite(st.calmarRatio) ? fmtNum(st.calmarRatio) : '∞'}
        sub="PnL / max drawdown"
        colorClass={ratioClass(st.calmarRatio)}
        tooltip={TOOLTIPS.calmarRatio}
      />
      <Metric
        label="Sharpe Ratio"
        value={fmtNum(st.sharpeRatio)}
        sub={sharpeLabel(st.sharpeRatio)}
        colorClass={ratioClass(st.sharpeRatio)}
        tooltip={TOOLTIPS.sharpeRatio}
      />
      <Metric
        label="Sortino Ratio"
        value={isFinite(st.sortino) ? fmtNum(st.sortino) : '∞'}
        sub="downside vol. only"
        colorClass={ratioClass(st.sortino)}
        tooltip={TOOLTIPS.sortino}
      />
      <Metric
        label="Recovery Factor"
        value={isFinite(st.recoveryFactor) ? fmtNum(st.recoveryFactor) : '∞'}
        sub="profit vs risk"
        colorClass={st.recoveryFactor >= 1 ? 'tc-green' : 'tc-red'}
        tooltip={TOOLTIPS.recoveryFactor}
      />
      <Metric
        label="VaR 95%"
        value={`${st.var95 >= 0 ? '+' : ''}${fmtNum(st.var95)} $`}
        sub="worst loss in 95% of trades"
        colorClass={st.var95 >= 0 ? 'tc-green' : 'tc-red'}
        tooltip={TOOLTIPS.var95}
      />
    </MetricGrid>
  </div>
));

// ─── Trades section ───────────────────────────────────────────────────────────
export const TradesSection = memo(({ stats: st }: { stats: TradeStats }) => {
  const breakeven = st.totalTrades - st.winTrades - st.lossTrades;

  return (
    <div className="tc-section">
      <MetricGrid>
        <Metric
          label="Total"
          value={String(st.totalTrades)}
          sub={breakeven > 0 ? `${breakeven} breakeven` : undefined}
          tooltip={TOOLTIPS.totalTrades}
        />
        <Metric
          label="Win Rate"
          value={fmtPct(st.winRate)}
          sub={`${st.winTrades} wins`}
          colorClass={st.winRate >= 50 ? 'tc-green' : 'tc-red'}
          tooltip={TOOLTIPS.winRate}
        />
        <Metric
          label="Loss Rate"
          value={fmtPct(st.lossRate)}
          sub={`${st.lossTrades} losses`}
          colorClass="tc-red"
          tooltip={TOOLTIPS.lossRate}
        />
        {/* Streaks card */}
        <div className="tc-card">
          <p className="tc-label mb-2">Max Streaks</p>
          <div className="tc-streaks-row mb-1">
            <span className="tc-metric-sub">Consec. Wins</span>
            <span className="tc-streaks-value tc-green">{st.maxConsecWins}</span>
          </div>
          <div className="tc-streaks-row">
            <span className="tc-metric-sub">Consec. Losses</span>
            <span className="tc-streaks-value tc-red">{st.maxConsecLosses}</span>
          </div>
        </div>
      </MetricGrid>

      {/* Win / loss bar */}
      <div className="mt-3">
        <div className="tc-winloss-labels">
          <span className="tc-winloss-won">Won {fmtPct(st.winRate)}</span>
          <span className="tc-winloss-lost">Lost {fmtPct(st.lossRate)}</span>
        </div>
        <div className="tc-progress d-flex">
          <div className="tc-progress-green" style={{ width: `${st.winRate}%` }} />
          <div className="tc-progress-red" style={{ width: `${st.lossRate}%` }} />
        </div>
      </div>
    </div>
  );
});
