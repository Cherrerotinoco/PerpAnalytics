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
        tooltip="Sum of PnL across all closed trades."
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
        tooltip="Gross profit ÷ gross loss. A value above 1.0 means the strategy is net-profitable."
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
        tooltip="PnL of the single largest winning trade."
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
        tooltip="Absolute PnL of the single largest losing trade."
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
        tooltip="Total PnL ÷ total trades. Average dollars earned (or lost) per trade."
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
        tooltip="Average winning trade ÷ average losing trade. A value > 1 means wins are larger than losses on average."
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
        tooltip="Largest peak-to-trough decline in the running equity curve."
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
        tooltip="Annualised PnL ÷ max drawdown. Higher values mean better annualised return relative to the worst drawdown."
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
        tooltip="Mean PnL ÷ std deviation of all trade PnLs. Measures return per unit of total volatility."
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
        tooltip="Mean PnL ÷ downside deviation. Penalises downside risk exclusively."
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
        tooltip="Total net PnL ÷ max drawdown. Indicates how well total profit covers the worst drawdown."
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
        tooltip="5th-percentile trade PnL. In 95% of trades, the loss will not exceed this value."
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
          tooltip="Total number of closed trades in the selected period and platforms."
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
        tooltip="(Losing trades ÷ total trades) × 100."
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
];

// ─── Special panels ───────────────────────────────────────────────────────────

const WinRatePanel = ({ stats: st }: { stats: TradeStats }) => (
  <Metric
    label="Win Rate"
    value={fmtPct(st.winRate)}
    sub={`${st.winTrades} wins`}
    colorClass={st.winRate >= 50 ? 'tc-green' : 'tc-red'}
    tooltip="(Winning trades ÷ total trades) × 100. A trade is a win when PnL > 0."
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
