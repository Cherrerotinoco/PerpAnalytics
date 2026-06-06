import { memo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from 'recharts';
import { Trade } from '../../types/tradeTypes';
import { useTheme } from '../../context/ThemeContext';
import { getChartColors, TOOLTIP_CURSOR } from '../../utils/chartColors';
import { fmtUsd } from '../../utils/formatters';
import { computeByDuration } from './durationUtils';
import type { DurationRow } from './durationUtils';
import TooltipContainer from './TooltipContainer';

// ─── Tooltip ──────────────────────────────────────────────────────────────────
const DurationTooltip = ({
  active,
  payload,
  textColor,
  surfaceColor,
  borderColor,
  greenColor,
  redColor,
}: {
  active?: boolean;
  payload?: { payload: DurationRow }[];
  textColor: string;
  surfaceColor: string;
  borderColor: string;
  greenColor: string;
  redColor: string;
}) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <TooltipContainer surfaceColor={surfaceColor} borderColor={borderColor} textColor={textColor}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>
        {d.label} <span style={{ fontWeight: 400, opacity: 0.6 }}>({d.description})</span>
      </div>
      <div>
        PnL: <strong style={{ color: d.pnl >= 0 ? greenColor : redColor }}>{fmtUsd(d.pnl)}</strong>
      </div>
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
const PnlByDurationChart = memo(({ trades }: { trades: Trade[] }) => {
  const { theme } = useTheme();
  const data = computeByDuration(trades);
  if (!data.length) return null;

  const { axisColor, textColor, surfaceColor, borderColor, greenColor, redColor } = getChartColors(
    theme === 'dark'
  );

  return (
    <div style={{ width: '100%' }}>
      <ResponsiveContainer width="100%" height={190}>
        <BarChart
          data={data}
          margin={{ top: 16, right: 8, left: -4, bottom: 0 }}
          barCategoryGap="30%"
        >
          <XAxis
            dataKey="label"
            tick={{ fill: axisColor, fontSize: 10 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fill: axisColor, fontSize: 9 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={fmtUsd}
            width={44}
          />
          <Tooltip
            cursor={TOOLTIP_CURSOR}
            content={
              <DurationTooltip
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
              <Cell key={row.key} fill={row.pnl >= 0 ? greenColor : redColor} fillOpacity={0.82} />
            ))}
            <LabelList
              dataKey="pnl"
              position="top"
              formatter={fmtUsd}
              style={{ fontSize: 9, fill: axisColor }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div
        style={{
          display: 'flex',
          gap: 16,
          justifyContent: 'center',
          marginTop: 6,
          fontSize: '0.68rem',
          color: axisColor,
        }}
      >
        {data.map((row) => (
          <span key={row.key}>
            <strong>{row.label}</strong>: {row.trades} trades &middot; {row.description}
          </span>
        ))}
      </div>
    </div>
  );
});

export default PnlByDurationChart;
