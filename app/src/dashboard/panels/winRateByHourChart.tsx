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
  winRate: number;
  trades: number;
  wins: number;
}

// ─── Data computation ─────────────────────────────────────────────────────────
const computeByHour = (trades: Trade[]): HourRow[] => {
  const buckets = Array.from({ length: 24 }, (_, h) => ({ hour: h, wins: 0, total: 0 }));

  for (const t of trades) {
    const h = t.closed.getHours();
    buckets[h].total++;
    if (t.pnl > 0) buckets[h].wins++;
  }

  return buckets
    .filter((b) => b.total > 0)
    .map((b) => ({
      hour: b.hour,
      label: `${String(b.hour).padStart(2, '0')}h`,
      winRate: Math.round((b.wins / b.total) * 100),
      trades: b.total,
      wins: b.wins,
    }));
};

// ─── Tooltip ──────────────────────────────────────────────────────────────────
const HourTooltip = ({
  active,
  payload,
  textColor,
  surfaceColor,
  borderColor,
}: {
  active?: boolean;
  payload?: { payload: HourRow }[];
  textColor: string;
  surfaceColor: string;
  borderColor: string;
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
      <div>Win rate: <strong>{d.winRate}%</strong></div>
      <div style={{ opacity: 0.7, marginTop: 2 }}>
        {d.wins}W / {d.trades - d.wins}L &middot; {d.trades} trades
      </div>
    </div>
  );
};

// ─── Component ────────────────────────────────────────────────────────────────
const WinRateByHourChart = memo(({ trades }: { trades: Trade[] }) => {
  const { theme } = useTheme();
  const data = computeByHour(trades);

  if (!data.length) return null;

  const isDark = theme === 'dark';
  const axisColor   = isDark ? '#6b7280' : '#9ca3af';
  const textColor   = isDark ? '#e0e0e0' : '#111827';
  const surfaceColor = isDark ? '#141414' : '#ffffff';
  const borderColor  = isDark ? '#2a2a2a' : '#e5e7eb';
  const greenColor   = isDark ? '#22c55e' : '#16a34a';
  const redColor     = isDark ? '#ef4444' : '#dc2626';
  const amberColor   = isDark ? '#f59e0b' : '#d97706';
  const refLineColor = isDark ? '#3a3a3a' : '#d1d5db';

  // Overall win rate as reference line
  const totalTrades = trades.length;
  const totalWins   = trades.filter((t) => t.pnl > 0).length;
  const avgWinRate  = totalTrades > 0 ? Math.round((totalWins / totalTrades) * 100) : 50;

  const getColor = (wr: number) => {
    if (wr >= avgWinRate + 10) return greenColor;
    if (wr <= avgWinRate - 10) return redColor;
    return amberColor;
  };

  return (
    <div style={{ width: '100%' }}>
      <ResponsiveContainer width="100%" height={190}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }} barCategoryGap="18%">
          <XAxis
            dataKey="label"
            tick={{ fill: axisColor, fontSize: 9 }}
            tickLine={false}
            axisLine={false}
            interval={data.length > 16 ? 1 : 0}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fill: axisColor, fontSize: 9 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `${v}%`}
            width={32}
          />
          <ReferenceLine
            y={avgWinRate}
            stroke={refLineColor}
            strokeDasharray="4 3"
            label={{
              value: `avg ${avgWinRate}%`,
              position: 'insideTopRight',
              fill: axisColor,
              fontSize: 9,
            }}
          />
          <Tooltip
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            content={
              <HourTooltip
                textColor={textColor}
                surfaceColor={surfaceColor}
                borderColor={borderColor}
              />
            }
          />
          <Bar dataKey="winRate" radius={[3, 3, 0, 0]}>
            {data.map((row) => (
              <Cell key={row.hour} fill={getColor(row.winRate)} fillOpacity={0.85} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div
        style={{
          display: 'flex',
          gap: 14,
          justifyContent: 'center',
          marginTop: 6,
          fontSize: '0.68rem',
          color: axisColor,
        }}
      >
        <span><span style={{ color: greenColor }}>●</span> Above avg (+10%)</span>
        <span><span style={{ color: amberColor }}>●</span> Near avg</span>
        <span><span style={{ color: redColor }}>●</span> Below avg (−10%)</span>
      </div>
    </div>
  );
});

export default WinRateByHourChart;
