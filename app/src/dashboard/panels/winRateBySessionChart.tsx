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
import { useTheme } from '../../context/ThemeContext';
import { getChartColors, getWinRateColor, TOOLTIP_CURSOR } from '../../utils/chartColors';
import type { TradeStats, SessionStats } from './statistics';
import TooltipContainer from './TooltipContainer';

// ─── Tooltip ──────────────────────────────────────────────────────────────────
const WRSessionTooltip = ({
  active,
  payload,
  textColor,
  surfaceColor,
  borderColor,
}: {
  active?: boolean;
  payload?: { payload: SessionStats }[];
  textColor: string;
  surfaceColor: string;
  borderColor: string;
}) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <TooltipContainer surfaceColor={surfaceColor} borderColor={borderColor} textColor={textColor}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{d.name}</div>
      <div>
        Win rate: <strong>{Math.round(d.winRate)}%</strong>
      </div>
      <div style={{ opacity: 0.7, marginTop: 2 }}>
        {d.wins}W / {d.trades - d.wins}L &middot; {d.trades} trades
      </div>
    </TooltipContainer>
  );
};

// ─── Component ────────────────────────────────────────────────────────────────
const WinRateBySessionChart = memo(({ stats }: { stats: TradeStats }) => {
  const { theme } = useTheme();
  const { bySession } = stats;
  if (!bySession.length) return null;

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

  const totalWins = bySession.reduce((s, r) => s + r.wins, 0);
  const totalTrades = bySession.reduce((s, r) => s + r.trades, 0);
  const avgWr = totalTrades > 0 ? Math.round((totalWins / totalTrades) * 100) : 50;

  return (
    <div style={{ width: '100%' }}>
      <ResponsiveContainer width="100%" height={190}>
        <BarChart
          data={bySession}
          margin={{ top: 8, right: 8, left: -8, bottom: 0 }}
          barCategoryGap="28%"
        >
          <XAxis
            dataKey="name"
            tick={{ fill: axisColor, fontSize: 10 }}
            tickLine={false}
            axisLine={false}
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
            y={avgWr}
            stroke={refLineColor}
            strokeDasharray="4 3"
            label={{
              value: `avg ${avgWr}%`,
              position: 'insideTopRight',
              fill: axisColor,
              fontSize: 9,
            }}
          />
          <Tooltip
            cursor={TOOLTIP_CURSOR}
            content={
              <WRSessionTooltip
                textColor={textColor}
                surfaceColor={surfaceColor}
                borderColor={borderColor}
              />
            }
          />
          <Bar dataKey="winRate" radius={[3, 3, 0, 0]}>
            {bySession.map((row) => (
              <Cell
                key={row.name}
                fill={getWinRateColor(Math.round(row.winRate), avgWr, colors)}
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

export default WinRateBySessionChart;
