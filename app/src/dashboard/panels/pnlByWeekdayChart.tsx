import { memo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';
import { Trade } from '../../types/tradeTypes';
import { useTheme } from '../../context/ThemeContext';
import { getChartColors, TOOLTIP_CURSOR } from '../../utils/chartColors';
import { fmtUsd } from '../../utils/formatters';
import { TimeToggle } from './timeToggle';
import TooltipContainer from './TooltipContainer';

// ─── Types ────────────────────────────────────────────────────────────────────
interface WeekdayRow {
  day: number;
  label: string;
  pnl: number;
  trades: number;
  wins: number;
  winRate: number;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ─── Data computation ─────────────────────────────────────────────────────────
export const computeByWeekday = (trades: Trade[], useOpen: boolean): WeekdayRow[] => {
  const buckets = Array.from({ length: 7 }, (_, d) => ({ day: d, pnl: 0, trades: 0, wins: 0 }));
  for (const t of trades) {
    const d = (useOpen ? t.opened : t.closed).getDay();
    buckets[d].pnl += t.pnl;
    buckets[d].trades++;
    if (t.pnl > 0) buckets[d].wins++;
  }
  return buckets
    .filter((b) => b.trades > 0)
    .map((b) => ({
      day: b.day,
      label: DAY_LABELS[b.day],
      pnl: parseFloat(b.pnl.toFixed(2)),
      trades: b.trades,
      wins: b.wins,
      winRate: Math.round((b.wins / b.trades) * 100),
    }));
};

// ─── Tooltip ──────────────────────────────────────────────────────────────────
const WeekdayTooltip = ({
  active, payload, textColor, surfaceColor, borderColor, greenColor, redColor,
}: {
  active?: boolean;
  payload?: { payload: WeekdayRow }[];
  textColor: string; surfaceColor: string; borderColor: string;
  greenColor: string; redColor: string;
}) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <TooltipContainer surfaceColor={surfaceColor} borderColor={borderColor} textColor={textColor}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{d.label}</div>
      <div>PnL: <strong style={{ color: d.pnl >= 0 ? greenColor : redColor }}>{fmtUsd(d.pnl)}</strong></div>
      <div style={{ opacity: 0.7, marginTop: 2 }}>{d.wins}W / {d.trades - d.wins}L &middot; {d.trades} trades &middot; {d.winRate}% WR</div>
    </TooltipContainer>
  );
};

// ─── Component ────────────────────────────────────────────────────────────────
const PnlByWeekdayChart = memo(({ trades }: { trades: Trade[] }) => {
  const { theme } = useTheme();
  const [useOpen, setUseOpen] = useState(true);
  const data = computeByWeekday(trades, useOpen);
  if (!data.length) return null;

  const { axisColor, textColor, surfaceColor, borderColor, greenColor, redColor, refLineColor } = getChartColors(theme === 'dark');

  return (
    <div style={{ width: '100%' }}>
      <TimeToggle useOpen={useOpen} onChange={setUseOpen} axisColor={axisColor} />
      <ResponsiveContainer width="100%" height={190}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }} barCategoryGap="28%">
          <XAxis dataKey="label" tick={{ fill: axisColor, fontSize: 10 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fill: axisColor, fontSize: 9 }} tickLine={false} axisLine={false} tickFormatter={fmtUsd} width={44} />
          <ReferenceLine y={0} stroke={refLineColor} />
          <Tooltip cursor={TOOLTIP_CURSOR} content={<WeekdayTooltip textColor={textColor} surfaceColor={surfaceColor} borderColor={borderColor} greenColor={greenColor} redColor={redColor} />} />
          <Bar dataKey="pnl" radius={[3, 3, 0, 0]}>
            {data.map((row) => <Cell key={row.day} fill={row.pnl >= 0 ? greenColor : redColor} fillOpacity={0.82} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
});

export default PnlByWeekdayChart;
