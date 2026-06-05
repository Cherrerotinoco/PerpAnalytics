import { memo, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from 'recharts';
import { Trade } from '../../types/tradeTypes';
import { useTheme } from '../../context/ThemeContext';
import { TimeToggle } from './timeToggle';

// ─── Types ────────────────────────────────────────────────────────────────────
interface WeekdayRow {
  day: number;
  label: string;
  winRate: number;
  trades: number;
  wins: number;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ─── Data computation ─────────────────────────────────────────────────────────
export const computeByWeekday = (trades: Trade[], useOpen: boolean): WeekdayRow[] => {
  const buckets = Array.from({ length: 7 }, (_, d) => ({ day: d, wins: 0, total: 0 }));
  for (const t of trades) {
    const d = (useOpen ? t.opened : t.closed).getDay();
    buckets[d].total++;
    if (t.pnl > 0) buckets[d].wins++;
  }
  return buckets
    .filter((b) => b.total > 0)
    .map((b) => ({
      day: b.day,
      label: DAY_LABELS[b.day],
      winRate: Math.round((b.wins / b.total) * 100),
      trades: b.total,
      wins: b.wins,
    }));
};

// ─── Tooltip ──────────────────────────────────────────────────────────────────
const WRWeekdayTooltip = ({
  active, payload, textColor, surfaceColor, borderColor,
}: {
  active?: boolean;
  payload?: { payload: WeekdayRow }[];
  textColor: string; surfaceColor: string; borderColor: string;
}) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{ background: surfaceColor, border: `1px solid ${borderColor}`, borderRadius: 5, fontSize: '0.72rem', padding: '0.4rem 0.6rem', color: textColor }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{d.label}</div>
      <div>Win rate: <strong>{d.winRate}%</strong></div>
      <div style={{ opacity: 0.7, marginTop: 2 }}>{d.wins}W / {d.trades - d.wins}L &middot; {d.trades} trades</div>
    </div>
  );
};

// ─── Component ────────────────────────────────────────────────────────────────
const WinRateByWeekdayChart = memo(({ trades }: { trades: Trade[] }) => {
  const { theme } = useTheme();
  const [useOpen, setUseOpen] = useState(true);
  const data = computeByWeekday(trades, useOpen);
  if (!data.length) return null;

  const isDark       = theme === 'dark';
  const axisColor    = isDark ? '#6b7280' : '#9ca3af';
  const textColor    = isDark ? '#e0e0e0' : '#111827';
  const surfaceColor = isDark ? '#141414' : '#ffffff';
  const borderColor  = isDark ? '#2a2a2a' : '#e5e7eb';
  const greenColor   = isDark ? '#22c55e' : '#16a34a';
  const redColor     = isDark ? '#ef4444' : '#dc2626';
  const amberColor   = isDark ? '#f59e0b' : '#d97706';
  const refLineColor = isDark ? '#3a3a3a' : '#d1d5db';

  const totalWins  = trades.filter((t) => t.pnl > 0).length;
  const avgWinRate = trades.length > 0 ? Math.round((totalWins / trades.length) * 100) : 50;
  const getColor   = (wr: number) => wr >= avgWinRate + 10 ? greenColor : wr <= avgWinRate - 10 ? redColor : amberColor;

  return (
    <div style={{ width: '100%' }}>
      <TimeToggle useOpen={useOpen} onChange={setUseOpen} axisColor={axisColor} />
      <ResponsiveContainer width="100%" height={190}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }} barCategoryGap="28%">
          <XAxis dataKey="label" tick={{ fill: axisColor, fontSize: 10 }} tickLine={false} axisLine={false} />
          <YAxis domain={[0, 100]} tick={{ fill: axisColor, fontSize: 9 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} width={32} />
          <ReferenceLine y={avgWinRate} stroke={refLineColor} strokeDasharray="4 3" label={{ value: `avg ${avgWinRate}%`, position: 'insideTopRight', fill: axisColor, fontSize: 9 }} />
          <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} content={<WRWeekdayTooltip textColor={textColor} surfaceColor={surfaceColor} borderColor={borderColor} />} />
          <Bar dataKey="winRate" radius={[3, 3, 0, 0]}>
            {data.map((row) => <Cell key={row.day} fill={getColor(row.winRate)} fillOpacity={0.85} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div style={{ display: 'flex', gap: 14, justifyContent: 'center', marginTop: 6, fontSize: '0.68rem', color: axisColor }}>
        <span><span style={{ color: greenColor }}>●</span> Above avg (+10%)</span>
        <span><span style={{ color: amberColor }}>●</span> Near avg</span>
        <span><span style={{ color: redColor }}>●</span> Below avg (−10%)</span>
      </div>
    </div>
  );
});

export default WinRateByWeekdayChart;
