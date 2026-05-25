import { Trade } from '../types/tradeTypes';

// ─── Types ────────────────────────────────────────────────────────────────────
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
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function stdDev(values: number[]): number {
  if (values.length < 2) {
    return 0;
  }
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function downsideStdDev(values: number[]): number {
  const negatives = values.filter((v) => v < 0);
  if (negatives.length < 2) {
    return 0;
  }
  return stdDev(negatives);
}

// ─── Stats computation ────────────────────────────────────────────────────────
export function computeTradeStats(trades: Trade[]): TradeStats {
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
  const expectancy = totalTrades > 0 ? totalPnl / totalTrades : 0;
  const meanPnl = totalTrades > 0 ? totalPnl / totalTrades : 0;
  const std = stdDev(pnlList);
  const sharpeRatio = std > 0 ? meanPnl / std : 0;
  const dStd = downsideStdDev(pnlList);
  const sortino = dStd > 0 ? meanPnl / dStd : meanPnl > 0 ? Infinity : 0;
  const calmarRatio = maxDrawdown > 0 ? totalPnl / maxDrawdown : totalPnl > 0 ? Infinity : 0;
  const recoveryFactor = maxDrawdown > 0 ? totalPnl / maxDrawdown : totalPnl > 0 ? Infinity : 0;
  const sortedPnl = [...pnlList].sort((a, b) => a - b);
  const var95Index = Math.max(0, Math.ceil(0.05 * sortedPnl.length) - 1);
  const var95 = sortedPnl.length > 0 ? (sortedPnl[var95Index] ?? 0) : 0;

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
  };
}

// ─── Formatters ───────────────────────────────────────────────────────────────
function fmtNum(n: number, decimals = 2): string {
  if (!isFinite(n)) {
    return '∞';
  }
  return n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
function fmtPct(n: number): string {
  return `${n.toFixed(0)}%`;
}
function sign(n: number): string {
  return n >= 0 ? '+' : '';
}
function sharpeLabel(v: number): string {
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
}

// ─── Color helpers ────────────────────────────────────────────────────────────
function posNegClass(v: number): string {
  return v >= 0 ? 'tc-green' : 'tc-red';
}
function ratioClass(v: number): string {
  if (v >= 1) {
    return 'tc-green';
  }
  if (v >= 0) {
    return 'tc-amber';
  }
  return 'tc-red';
}

// ─── Shared UI primitives ─────────────────────────────────────────────────────
function TipIcon({ text }: { text: string }) {
  return (
    <span className="tc-tip">
      ?<span className="tc-tip-box">{text}</span>
    </span>
  );
}

function Metric({
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
}) {
  return (
    <div className="tc-card" style={{ padding: '0.5rem 0.65rem' }}>
      <div
        className='d-flex align-items-start gap-1 justify-content-between mb-1'
      >
        <p className="tc-label mb-0">
          {label}
        </p>
        {tooltip && <TipIcon text={tooltip} />}
      </div>
      <p className={`tc-value mb-0 ${colorClass ?? ''}`}>{value}</p>
      {sub && (
        <p style={{ fontSize: '0.65rem', color: 'var(--tc-muted)', margin: 0, lineHeight: 1.3 }}>
          {sub}
        </p>
      )}
    </div>
  );
}

function MetricGrid({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
      {children}
    </div>
  );
}

// ─── Performance section ──────────────────────────────────────────────────────
export function PerformanceSection({ stats: st }: { stats: TradeStats }) {
  return (
    <div style={{ padding: '0.75rem' }}>
      <MetricGrid>
        <Metric
          label="Total PnL"
          value={`${sign(st.totalPnl)}${fmtNum(st.totalPnl)} $`}
          colorClass={posNegClass(st.totalPnl)}
          tooltip="Sum of PnL across all closed trades."
        />
        <Metric
          label="Profit Factor"
          value={isFinite(st.profitFactor) ? fmtNum(st.profitFactor) : '∞'}
          sub={st.profitFactor >= 1 ? 'Profitable' : 'Unprofitable'}
          colorClass={st.profitFactor >= 1 ? 'tc-green' : 'tc-red'}
          tooltip="Gross profit ÷ gross loss. A value above 1.0 means the strategy is net-profitable."
        />
        <Metric
          label="Max Profit"
          value={`+${fmtNum(st.maxWin)} $`}
          colorClass="tc-green"
          tooltip="PnL of the single largest winning trade."
        />
        <Metric
          label="Max Loss"
          value={`-${fmtNum(st.maxLoss)} $`}
          colorClass="tc-red"
          tooltip="Absolute PnL of the single largest losing trade."
        />
        <Metric
          label="Expectancy"
          value={`${sign(st.expectancy)}${fmtNum(st.expectancy)} $`}
          sub="per trade"
          colorClass={posNegClass(st.expectancy)}
          tooltip="Total PnL ÷ total trades. Average dollars earned (or lost) per trade."
        />
        <Metric
          label="Risk / Reward"
          value={isFinite(st.riskReward) ? fmtNum(st.riskReward) : '∞'}
          sub="avg win / avg loss"
          colorClass={st.riskReward >= 1 ? 'tc-green' : ''}
          tooltip="Average winning trade ÷ average losing trade. A value > 1 means wins are larger than losses on average."
        />
      </MetricGrid>
    </div>
  );
}

// ─── Risk & Drawdown section ──────────────────────────────────────────────────
export function RiskSection({ stats: st }: { stats: TradeStats }) {
  return (
    <div style={{ padding: '0.75rem' }}>
      <MetricGrid>
        <Metric
          label="Max Drawdown"
          value={`-${fmtNum(st.maxDrawdown)} $`}
          sub={`${fmtNum(st.maxDrawdownPct, 1)}% from peak`}
          colorClass="tc-red"
          tooltip="Largest peak-to-trough decline in the running equity curve."
        />
        <Metric
          label="Calmar Ratio"
          value={isFinite(st.calmarRatio) ? fmtNum(st.calmarRatio) : '∞'}
          sub="PnL / max drawdown"
          colorClass={ratioClass(st.calmarRatio)}
          tooltip="Total PnL ÷ max drawdown. Higher values mean better return relative to the worst drawdown."
        />
        <Metric
          label="Sharpe Ratio"
          value={fmtNum(st.sharpeRatio)}
          sub={sharpeLabel(st.sharpeRatio)}
          colorClass={ratioClass(st.sharpeRatio)}
          tooltip="Mean PnL ÷ std deviation of all trade PnLs. Measures return per unit of total volatility."
        />
        <Metric
          label="Sortino Ratio"
          value={isFinite(st.sortino) ? fmtNum(st.sortino) : '∞'}
          sub="downside vol. only"
          colorClass={ratioClass(st.sortino)}
          tooltip="Mean PnL ÷ std deviation of losing trades only. Penalises downside volatility exclusively."
        />
        <Metric
          label="Recovery Factor"
          value={isFinite(st.recoveryFactor) ? fmtNum(st.recoveryFactor) : '∞'}
          sub="profit vs risk"
          colorClass={st.recoveryFactor >= 1 ? 'tc-green' : 'tc-red'}
          tooltip="Total PnL ÷ max drawdown. Indicates how well total profit covers the worst drawdown experienced."
        />
        <Metric
          label="VaR 95%"
          value={`${st.var95 >= 0 ? '+' : ''}${fmtNum(st.var95)} $`}
          sub="worst loss in 95% of trades"
          colorClass={st.var95 >= 0 ? 'tc-green' : 'tc-red'}
          tooltip="5th-percentile trade PnL (sorted ascending). In 95% of trades, the loss will not exceed this value."
        />
      </MetricGrid>
    </div>
  );
}

// ─── Trades section ───────────────────────────────────────────────────────────
export function TradesSection({ stats: st }: { stats: TradeStats }) {
  const breakeven = st.totalTrades - st.winTrades - st.lossTrades;

  return (
    <div style={{ padding: '0.75rem' }}>
      <MetricGrid>
        <Metric
          label="Total"
          value={String(st.totalTrades)}
          sub={breakeven > 0 ? `${breakeven} breakeven` : undefined}
          tooltip="Total number of closed trades in the selected period and platforms."
        />
        <Metric
          label="Win Rate"
          value={fmtPct(st.winRate)}
          sub={`${st.winTrades} wins`}
          colorClass={st.winRate >= 50 ? 'tc-green' : 'tc-red'}
          tooltip="(Winning trades ÷ total trades) × 100. A trade is a win when PnL > 0."
        />
        <Metric
          label="Loss Rate"
          value={fmtPct(st.lossRate)}
          sub={`${st.lossTrades} losses`}
          colorClass="tc-red"
          tooltip="(Losing trades ÷ total trades) × 100. A trade is a loss when PnL < 0."
        />
        {/* Streaks card */}
        <div className="tc-card" style={{ padding: '0.5rem 0.65rem' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem',
              marginBottom: '0.5rem',
            }}
          >
            <p className="tc-label mb-0" style={{ margin: 0 }}>
              Max Streaks
            </p>
            <TipIcon text="Longest uninterrupted run of consecutive wins and consecutive losses." />
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '0.3rem',
            }}
          >
            <span style={{ fontSize: '0.65rem', color: 'var(--tc-muted)' }}>Consec. Wins</span>
            <span className="tc-value tc-green" style={{ fontSize: '0.95rem' }}>
              {st.maxConsecWins}
            </span>
          </div>
          <div
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <span style={{ fontSize: '0.65rem', color: 'var(--tc-muted)' }}>Consec. Losses</span>
            <span className="tc-value tc-red" style={{ fontSize: '0.95rem' }}>
              {st.maxConsecLosses}
            </span>
          </div>
        </div>
      </MetricGrid>

      {/* Win / loss bar */}
      <div style={{ marginTop: '0.75rem' }}>
        <div
          style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}
        >
          <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--tc-green)' }}>
            Won {fmtPct(st.winRate)}
          </span>
          <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--tc-red)' }}>
            Lost {fmtPct(st.lossRate)}
          </span>
        </div>
        <div className="tc-progress" style={{ display: 'flex' }}>
          <div className="tc-progress-green" style={{ width: `${st.winRate}%` }} />
          <div className="tc-progress-red" style={{ width: `${st.lossRate}%` }} />
        </div>
      </div>
    </div>
  );
}
