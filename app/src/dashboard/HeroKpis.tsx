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
    colorClass: 'tc-amber',
  },
  {
    label: 'Profit Factor',
    value: isFinite(st.profitFactor) ? fmtNum(st.profitFactor) : '∞',
    sub: st.profitFactor >= 1 ? 'Profitable' : 'Unprofitable',
    colorClass: 'tc-info',
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
    colorClass: 'tc-neutral',
  },
];

const KpiCard = ({ k, hero }: { k: HeroKpi; hero?: boolean }) => (
  <div className={`tc-kpi${hero ? ' tc-kpi--hero' : ''}`}>
    <p className="tc-kpi-label">{k.label}</p>
    <p className={`tc-kpi-value ${k.colorClass ?? ''}`}>{k.value}</p>
    {k.sub && <p className="tc-kpi-sub">{k.sub}</p>}
  </div>
);

const HeroKpis = memo(({ stats }: { stats: TradeStats }) => {
  const [hero, ...rest] = buildKpis(stats);
  return (
    <div className="tc-kpis">
      <KpiCard k={hero} hero />
      <div className="tc-kpi-grid">
        {rest.map((k) => (
          <KpiCard key={k.label} k={k} />
        ))}
      </div>
    </div>
  );
});

export default HeroKpis;
