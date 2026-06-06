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
import { getChartColors, getWinRateColor, TOOLTIP_CURSOR } from '../../utils/chartColors';
import { TimeToggle } from './timeToggle';
import TooltipContainer from './TooltipContainer';

// ─── Types ────────────────────────────────────────────────────────────────────
interface HourRow {
  hour: number;
  label: string;
  winRate: number;
  trades: number;
  wins: number;
}

// ─── Data computation ─────────────────────────────────────────────────────────
export const computeByHour = (trades: Trade[], useOpen: boolean): HourRow[] => {
  const buckets = Array.from({ length: 24 }, (_, h) => ({ hour: h, wins: 0, total: 0 }));
  for (const t of trades) {
    const h = (useOpen ? t.opened : t.closed).getHours();
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
    <TooltipContainer surfaceColor={surfaceColor} borderColor={borderColor} textColor={textColor}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{d.label}</div>
      <div>
        Win rate: <strong>{d.winRate}%</strong>
      </div>
      <div style={{ opacity: 0.7, marginTop: 2 }}>
        {d.wins}W / {d.trades - d.wins}L &middot; {d.trades} trades
      </div>
    </TooltipContainer>
  );
};

// ─── Component ────────────────────────────────────────────────────────────────
const WinRateByHourChart = memo(({ trades }: { trades: Trade[] }) => {
  const { theme } = useTheme();
  const [useOpen, setUseOpen] = useState(true);
  const data = computeByHour(trades, useOpen);
  if (!data.length) return null;

  const colors = getChartColors(theme === 'dark');
  const {
    axisColor,
    textColor,
    surfaceColor,
    borderColor,
    greenColor,
    amberColor,
    redColor,
    refLineColor,
  } = colors;

  const totalWins = trades.filter((t) => t.pnl > 0).length;
  const avgWinRate = trades.length > 0 ? Math.round((totalWins / trades.length) * 100) : 50;

  return (
    <div style={{ width: '100%' }}>
      <TimeToggle useOpen={useOpen} onChange={setUseOpen} axisColor={axisColor} />
      <ResponsiveContainer width="100%" height={190}>
        <BarChart
          data={data}
          margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
          barCategoryGap="18%"
        >
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
            cursor={TOOLTIP_CURSOR}
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
              <Cell
                key={row.hour}
                fill={getWinRateColor(row.winRate, avgWinRate, colors)}
                fillOpacity={0.85}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
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
        <span>
          <span style={{ color: greenColor }}>●</span> Above avg (+10%)
        </span>
        <span>
          <span style={{ color: amberColor }}>●</span> Near avg
        </span>
        <span>
          <span style={{ color: redColor }}>●</span> Below avg (−10%)
        </span>
      </div>
    </div>
  );
});

export default WinRateByHourChart;
