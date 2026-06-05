import { memo } from 'react';
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

// ─── Types ────────────────────────────────────────────────────────────────────
interface HourRow {
  hour: number;
  label: string;
  pnl: number;
  trades: number;
  wins: number;
  winRate: number;
}

// ─── Data computation ─────────────────────────────────────────────────────────
const computeByHour = (trades: Trade[]): HourRow[] => {
  const buckets = Array.from({ length: 24 }, (_, h) => ({ hour: h, pnl: 0, trades: 0, wins: 0 }));
  for (const t of trades) {
    const h = t.closed.getHours();
    buckets[h].pnl += t.pnl;
    buckets[h].trades++;
    if (t.pnl > 0) buckets[h].wins++;
  }
  return buckets
    .filter((b) => b.trades > 0)
    .map((b) => ({
      hour: b.hour,
      label: `${String(b.hour).padStart(2, '0')}h`,
      pnl: parseFloat(b.pnl.toFixed(2)),
      trades: b.trades,
      wins: b.wins,
      winRate: Math.round((b.wins / b.trades) * 100),
    }));
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtUsd = (v: number): string => {
  const abs = Math.abs(v);
  const prefix = v >= 0 ? '+' : '-';
  if (abs >= 1000) return `${prefix}$${(abs / 1000).toFixed(1)}k`;
  return `${prefix}$${abs.toFixed(0)}`;
};

// ─── Tooltip ──────────────────────────────────────────────────────────────────
const HourTooltip = ({
  active,
  payload,
  textColor,
  surfaceColor,
  borderColor,
  greenColor,
  redColor,
}: {
  active?: boolean;
  payload?: { payload: HourRow }[];
  textColor: string;
  surfaceColor: string;
  borderColor: string;
  greenColor: string;
  redColor: string;
}) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div
      style={{
        background: surfaceColor,
        border: `1px solid ${borderColor}`,
        borderRadius: 5,
        fontSize: '0.72rem',
        padding: '0.4rem 0.6rem',
        color: textColor,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{d.label}</div>
      <div>
        PnL: <strong style={{ color: d.pnl >= 0 ? greenColor : redColor }}>{fmtUsd(d.pnl)}</strong>
      </div>
      <div style={{ opacity: 0.7, marginTop: 2 }}>
        {d.wins}W / {d.trades - d.wins}L &middot; {d.trades} trades &middot; {d.winRate}% WR
      </div>
    </div>
  );
};

// ─── Component ────────────────────────────────────────────────────────────────
const PnlByHourChart = memo(({ trades }: { trades: Trade[] }) => {
  const { theme } = useTheme();
  const data = computeByHour(trades);
  if (!data.length) return null;

  const isDark = theme === 'dark';
  const axisColor = isDark ? '#6b7280' : '#9ca3af';
  const textColor = isDark ? '#e0e0e0' : '#111827';
  const surfaceColor = isDark ? '#141414' : '#ffffff';
  const borderColor = isDark ? '#2a2a2a' : '#e5e7eb';
  const greenColor = isDark ? '#22c55e' : '#16a34a';
  const redColor = isDark ? '#ef4444' : '#dc2626';
  const refLineColor = isDark ? '#3a3a3a' : '#d1d5db';

  return (
    <ResponsiveContainer width="100%" height={190}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }} barCategoryGap="18%">
        <XAxis
          dataKey="label"
          tick={{ fill: axisColor, fontSize: 9 }}
          tickLine={false}
          axisLine={false}
          interval={data.length > 16 ? 1 : 0}
        />
        <YAxis
          tick={{ fill: axisColor, fontSize: 9 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={fmtUsd}
          width={44}
        />
        <ReferenceLine y={0} stroke={refLineColor} />
        <Tooltip
          cursor={{ fill: 'rgba(255,255,255,0.04)' }}
          content={
            <HourTooltip
              textColor={textColor}
              surfaceColor={surfaceColor}
              borderColor={borderColor}
              greenColor={greenColor}
              redColor={redColor}
            />
          }
        />
        <Bar dataKey="pnl" radius={[3, 3, 0, 0]}>
          {data.map((row) => (
            <Cell key={row.hour} fill={row.pnl >= 0 ? greenColor : redColor} fillOpacity={0.82} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
});

export default PnlByHourChart;
