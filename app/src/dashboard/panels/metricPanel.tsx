import { memo } from 'react';
import {
  TradeStats,
  Metric,
  fmtNum,
  fmtPct,
  sign,
  posNegClass,
  ratioClass,
  sharpeLabel,
} from './statistics';
import { TOOLTIPS } from '../../utils/metricTooltips';

// ─── Types ────────────────────────────────────────────────────────────────────
export type PanelSection = 'charts' | 'performance' | 'risk' | 'trades';

export interface MetricPanelConfig {
  id: string;
  title: string;
  section: PanelSection;
  defaultVisible: boolean;
  /** Default grid column span for this panel */
  w: number;
  render: (stats: TradeStats) => React.ReactNode;
}

// ─── Metric panel configs ─────────────────────────────────────────────────────
export const METRIC_PANEL_CONFIGS: MetricPanelConfig[] = [
  // ── Performance ────────────────────────────────────────────────────────────
  {
    id: 'metric-total-pnl',
    title: 'Total PnL',
    section: 'performance',
    defaultVisible: true,
    w: 3,
    render: (st) => (
      <Metric
        label="Total PnL"
        value={`${sign(st.totalPnl)}${fmtNum(st.totalPnl)} $`}
        colorClass={posNegClass(st.totalPnl)}
        tooltip={TOOLTIPS.totalPnl}
      />
    ),
  },
  {
    id: 'metric-profit-factor',
    title: 'Profit Factor',
    section: 'performance',
    defaultVisible: false,
    w: 3,
    render: (st) => (
      <Metric
        label="Profit Factor"
        value={isFinite(st.profitFactor) ? fmtNum(st.profitFactor) : '∞'}
        sub={st.profitFactor >= 1 ? 'Profitable' : 'Unprofitable'}
        colorClass={st.profitFactor >= 1 ? 'tc-green' : 'tc-red'}
        tooltip={TOOLTIPS.profitFactor}
      />
    ),
  },
  {
    id: 'metric-max-profit',
    title: 'Max Profit',
    section: 'performance',
    defaultVisible: false,
    w: 3,
    render: (st) => (
      <Metric
        label="Max Profit"
        value={`+${fmtNum(st.maxWin)} $`}
        colorClass="tc-green"
        tooltip={TOOLTIPS.maxProfit}
      />
    ),
  },
  {
    id: 'metric-max-loss',
    title: 'Max Loss',
    section: 'performance',
    defaultVisible: false,
    w: 3,
    render: (st) => (
      <Metric
        label="Max Loss"
        value={`-${fmtNum(st.maxLoss)} $`}
        colorClass="tc-red"
        tooltip={TOOLTIPS.maxLoss}
      />
    ),
  },
  {
    id: 'metric-expectancy',
    title: 'Expectancy',
    section: 'performance',
    defaultVisible: false,
    w: 3,
    render: (st) => (
      <Metric
        label="Expectancy"
        value={`${sign(st.expectancy)}${fmtNum(st.expectancy)} $`}
        sub="per trade"
        colorClass={posNegClass(st.expectancy)}
        tooltip={TOOLTIPS.expectancy}
      />
    ),
  },
  {
    id: 'metric-risk-reward',
    title: 'Risk / Reward',
    section: 'performance',
    defaultVisible: false,
    w: 3,
    render: (st) => (
      <Metric
        label="Risk / Reward"
        value={isFinite(st.riskReward) ? fmtNum(st.riskReward) : '∞'}
        sub="avg win / avg loss"
        colorClass={st.riskReward >= 1 ? 'tc-green' : ''}
        tooltip={TOOLTIPS.riskReward}
      />
    ),
  },
  {
    id: 'metric-fees',
    title: 'Fees Paid',
    section: 'performance',
    defaultVisible: false,
    w: 3,
    render: (st) => <FeesPanel stats={st} />,
  },

  // ── Risk & Drawdown ─────────────────────────────────────────────────────────
  {
    id: 'metric-max-drawdown',
    title: 'Max Drawdown',
    section: 'risk',
    defaultVisible: false,
    w: 3,
    render: (st) => (
      <Metric
        label="Max Drawdown"
        value={`-${fmtNum(st.maxDrawdown)} $`}
        sub={`${fmtNum(st.maxDrawdownPct, 1)}% from peak`}
        colorClass="tc-red"
        tooltip={TOOLTIPS.maxDrawdown}
      />
    ),
  },
  {
    id: 'metric-calmar',
    title: 'Calmar Ratio',
    section: 'risk',
    defaultVisible: false,
    w: 3,
    render: (st) => (
      <Metric
        label="Calmar Ratio"
        value={isFinite(st.calmarRatio) ? fmtNum(st.calmarRatio) : '∞'}
        sub="PnL / max drawdown"
        colorClass={ratioClass(st.calmarRatio)}
        tooltip={TOOLTIPS.calmarRatio}
      />
    ),
  },
  {
    id: 'metric-sharpe',
    title: 'Sharpe Ratio',
    section: 'risk',
    defaultVisible: false,
    w: 3,
    render: (st) => (
      <Metric
        label="Sharpe Ratio"
        value={fmtNum(st.sharpeRatio)}
        sub={sharpeLabel(st.sharpeRatio)}
        colorClass={ratioClass(st.sharpeRatio)}
        tooltip={TOOLTIPS.sharpeRatio}
      />
    ),
  },
  {
    id: 'metric-sortino',
    title: 'Sortino Ratio',
    section: 'risk',
    defaultVisible: false,
    w: 3,
    render: (st) => (
      <Metric
        label="Sortino Ratio"
        value={isFinite(st.sortino) ? fmtNum(st.sortino) : '∞'}
        sub="downside vol. only"
        colorClass={ratioClass(st.sortino)}
        tooltip={TOOLTIPS.sortino}
      />
    ),
  },
  {
    id: 'metric-recovery-factor',
    title: 'Recovery Factor',
    section: 'risk',
    defaultVisible: false,
    w: 3,
    render: (st) => (
      <Metric
        label="Recovery Factor"
        value={isFinite(st.recoveryFactor) ? fmtNum(st.recoveryFactor) : '∞'}
        sub="profit vs risk"
        colorClass={st.recoveryFactor >= 1 ? 'tc-green' : 'tc-red'}
        tooltip={TOOLTIPS.recoveryFactor}
      />
    ),
  },
  {
    id: 'metric-var95',
    title: 'VaR 95%',
    section: 'risk',
    defaultVisible: false,
    w: 3,
    render: (st) => (
      <Metric
        label="VaR 95%"
        value={`${st.var95 >= 0 ? '+' : ''}${fmtNum(st.var95)} $`}
        sub="worst loss in 95% of trades"
        colorClass={st.var95 >= 0 ? 'tc-green' : 'tc-red'}
        tooltip={TOOLTIPS.var95}
      />
    ),
  },

  // ── Trades ──────────────────────────────────────────────────────────────────
  {
    id: 'metric-total-trades',
    title: 'Total Trades',
    section: 'trades',
    defaultVisible: true,
    w: 3,
    render: (st) => {
      const breakeven = st.totalTrades - st.winTrades - st.lossTrades;
      return (
        <Metric
          label="Total Trades"
          value={String(st.totalTrades)}
          sub={breakeven > 0 ? `${breakeven} breakeven` : undefined}
          tooltip={TOOLTIPS.totalTrades}
        />
      );
    },
  },
  {
    id: 'metric-win-rate',
    title: 'Win Rate',
    section: 'trades',
    defaultVisible: true,
    w: 3,
    render: (st) => <WinRatePanel stats={st} />,
  },
  {
    id: 'metric-loss-rate',
    title: 'Loss Rate',
    section: 'trades',
    defaultVisible: false,
    w: 3,
    render: (st) => (
      <Metric
        label="Loss Rate"
        value={fmtPct(st.lossRate)}
        sub={`${st.lossTrades} losses`}
        colorClass="tc-red"
        tooltip={TOOLTIPS.lossRate}
      />
    ),
  },
  {
    id: 'metric-streaks',
    title: 'Max Streaks',
    section: 'trades',
    defaultVisible: true,
    w: 3,
    render: (st) => <StreaksPanel stats={st} />,
  },
  // ── Distribution ───────────────────────────────────────────────────────────
  {
    id: 'metric-avg-win',
    title: 'Avg Winner',
    section: 'performance',
    defaultVisible: false,
    w: 3,
    render: (st) => (
      <Metric
        label="Avg Winner"
        value={`+${fmtNum(st.avgWin)} $`}
        colorClass="tc-green"
        tooltip={TOOLTIPS.avgWin}
      />
    ),
  },
  {
    id: 'metric-avg-loss',
    title: 'Avg Loser',
    section: 'performance',
    defaultVisible: false,
    w: 3,
    render: (st) => (
      <Metric
        label="Avg Loser"
        value={`-${fmtNum(st.avgLoss)} $`}
        colorClass="tc-red"
        tooltip={TOOLTIPS.avgLoss}
      />
    ),
  },
  {
    id: 'metric-median-win',
    title: 'Median Winner',
    section: 'performance',
    defaultVisible: false,
    w: 3,
    render: (st) => (
      <Metric
        label="Median Winner"
        value={`+${fmtNum(st.medianWin)} $`}
        colorClass="tc-green"
        tooltip={TOOLTIPS.medianWin}
      />
    ),
  },
  {
    id: 'metric-median-loss',
    title: 'Median Loser',
    section: 'performance',
    defaultVisible: false,
    w: 3,
    render: (st) => (
      <Metric
        label="Median Loser"
        value={`-${fmtNum(st.medianLoss)} $`}
        colorClass="tc-red"
        tooltip={TOOLTIPS.medianLoss}
      />
    ),
  },
  {
    id: 'metric-p90-win',
    title: 'P90 Winner',
    section: 'performance',
    defaultVisible: false,
    w: 3,
    render: (st) => (
      <Metric
        label="P90 Winner"
        value={`+${fmtNum(st.p90Win)} $`}
        sub="90th percentile"
        colorClass="tc-green"
        tooltip={TOOLTIPS.p90Win}
      />
    ),
  },
  {
    id: 'metric-p90-loss',
    title: 'P90 Loser',
    section: 'performance',
    defaultVisible: false,
    w: 3,
    render: (st) => (
      <Metric
        label="P90 Loser"
        value={`-${fmtNum(st.p90Loss)} $`}
        sub="90th percentile"
        colorClass="tc-red"
        tooltip={TOOLTIPS.p90Loss}
      />
    ),
  },
];

// ─── Special panels ───────────────────────────────────────────────────────────

const WinRatePanel = ({ stats: st }: { stats: TradeStats }) => (
  <Metric
    label="Win Rate"
    value={fmtPct(st.winRate)}
    sub={`${st.winTrades} wins`}
    colorClass={st.winRate >= 50 ? 'tc-green' : 'tc-red'}
    tooltip={TOOLTIPS.winRate}
  />
);

/** Streaks panel — consecutive wins and losses */
const StreaksPanel = ({ stats: st }: { stats: TradeStats }) => (
  <div className="tc-card">
    <div className="tc-streaks-row mb-1">
      <span className="tc-metric-sub">Consec. Wins</span>
      <span className="tc-streaks-value tc-green">{st.maxConsecWins}</span>
    </div>
    <div className="tc-streaks-row">
      <span className="tc-metric-sub">Consec. Losses</span>
      <span className="tc-streaks-value tc-red">{st.maxConsecLosses}</span>
    </div>
  </div>
);

/** Fees panel — breakdown by platform */
const FeesPanel = ({ stats: st }: { stats: TradeStats }) => {
  if (Object.keys(st.feesBySource).length === 0) {
    return <Metric label="Fees Paid" value="—" />;
  }
  return (
    <div className="tc-card">
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
    </div>
  );
};

// ─── O(1) lookup map ─────────────────────────────────────────────────────────
const METRIC_PANEL_MAP = new Map(METRIC_PANEL_CONFIGS.map((c) => [c.id, c]));

// ─── MetricPanel component ────────────────────────────────────────────────────
interface MetricPanelProps {
  panelId: string;
  stats: TradeStats;
}

export const MetricPanel = memo(({ panelId, stats }: MetricPanelProps) => {
  const config = METRIC_PANEL_MAP.get(panelId);
  if (!config) return null;
  return <>{config.render(stats)}</>;
});
