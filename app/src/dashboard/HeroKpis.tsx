import { memo } from 'react';
import type { TradeStats } from './panels/statistics';
import { fmtNum, fmtPct, sign, posNegClass } from './panels/statistics';

// ─── Hero KPI row (level-1 hierarchy, Overview tab) ───────────────────────────
interface HeroKpi {
  label: string;
  value: string;
  sub?: string;
  colorClass?: string;
}

const buildKpis = (st: TradeStats): HeroKpi[] => [
  {
    label: 'Total PnL',
    value: `${sign(st.totalPnl)}${fmtNum(st.totalPnl)} $`,
    colorClass: posNegClass(st.totalPnl),
  },
  {
    label: 'Win Rate',
    value: fmtPct(st.winRate),
    sub: `${st.winTrades} wins`,
    colorClass: st.winRate >= 50 ? 'tc-green' : 'tc-red',
  },
  {
    label: 'Profit Factor',
    value: isFinite(st.profitFactor) ? fmtNum(st.profitFactor) : '∞',
    sub: st.profitFactor >= 1 ? 'Profitable' : 'Unprofitable',
    colorClass: st.profitFactor >= 1 ? 'tc-green' : 'tc-red',
  },
  {
    label: 'Max Drawdown',
    value: `-${fmtNum(st.maxDrawdown)} $`,
    sub: `${fmtNum(st.maxDrawdownPct, 1)}% from peak`,
    colorClass: 'tc-red',
  },
  {
    label: 'Expectancy',
    value: `${sign(st.expectancy)}${fmtNum(st.expectancy)} $`,
    sub: 'per trade',
    colorClass: posNegClass(st.expectancy),
  },
  {
    label: 'Total Trades',
    value: String(st.totalTrades),
  },
];

const HeroKpis = memo(({ stats }: { stats: TradeStats }) => (
  <div className="tc-kpis">
    {buildKpis(stats).map((k) => (
      <div key={k.label} className="tc-kpi">
        <p className="tc-kpi-label">{k.label}</p>
        <p className={`tc-kpi-value ${k.colorClass ?? ''}`}>{k.value}</p>
        {k.sub && <p className="tc-kpi-sub">{k.sub}</p>}
      </div>
    ))}
  </div>
));

export default HeroKpis;
