import { memo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import { useTheme } from '../../context/ThemeContext';
import { fmtMoney } from '../../utils/formatters';
import type { TradeStats } from './statistics';

const fmtDate = (ts: number): string =>
  new Date(ts).toLocaleDateString('en-US', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: number;
}

const CustomTooltip = ({ active, payload, label }: TooltipProps) => {
  if (!active || !payload?.length || label == null) return null;
  const val: number = payload[0].value;
  return (
    <div className="tc-chart-tooltip">
      <p className="tc-chart-tooltip-date">{fmtDate(label)}</p>
      <p className={`tc-chart-tooltip-val ${val >= 0 ? 'tc-green' : 'tc-red'}`}>
        {val >= 0 ? '+' : ''}
        {fmtMoney(val)} $
      </p>
    </div>
  );
};

const EquityCurveChart = memo(({ stats }: { stats: TradeStats }) => {
  const { theme } = useTheme();

  const data = stats.equityCurve
    .map((y, i) => ({ x: Number(stats.equityCurveLabels[i]), y }))
    .filter((d) => d.x > 0);

  if (!data.length) return null;

  const isPositive = stats.totalPnl >= 0;
  const greenColor = theme === 'dark' ? '#22c55e' : '#16a34a';
  const redColor = theme === 'dark' ? '#ef4444' : '#dc2626';
  const gridColor = theme === 'dark' ? '#2a2a2a' : '#e5e7eb';
  const axisColor = theme === 'dark' ? '#6b7280' : '#9ca3af';
  const refLineColor = theme === 'dark' ? '#374151' : '#d1d5db';

  const yValues = data.map((d) => d.y);
  const yMin = Math.min(...yValues);
  const yMax = Math.max(...yValues);
  // Fraction from the top where y=0 falls (0 = top, 1 = bottom).
  // Guard: if yMax === yMin (single point or flat line), avoid division by zero.
  const yRange = yMax - yMin;
  const zeroRatio =
    yRange === 0
      ? yMax >= 0
        ? 1
        : 0 // flat line: all green if ≥0, all red if <0
      : yMax > 0 && yMin < 0
        ? yMax / yRange
        : yMax <= 0
          ? 0 // all negative → full red
          : 1; // all positive → full green

  const xMin = data[0].x;
  const xMax = data[data.length - 1].x;
  const tickCount = Math.min(data.length, 6);
  // Guard: if only one data point, avoid division by zero in tick spacing.
  const ticks =
    tickCount <= 1
      ? [xMin]
      : Array.from({ length: tickCount }, (_, i) =>
          Math.round(xMin + (i / (tickCount - 1)) * (xMax - xMin))
        );

  return (
    <>
      <div className="tc-chart-header">
        <span className="tc-chart-date-range">
          {fmtDate(xMin)} — {fmtDate(xMax)}
        </span>
        <span
          className={`tc-pnl-badge ${isPositive ? 'tc-badge--positive' : 'tc-badge--negative'}`}
        >
          {isPositive ? '+' : ''}
          {fmtMoney(stats.totalPnl)} $
        </span>
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 24 }}>
          <defs>
            <linearGradient id="equityLineGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset={zeroRatio} stopColor={greenColor} />
              <stop offset={zeroRatio} stopColor={redColor} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
          <XAxis
            dataKey="x"
            type="number"
            scale="time"
            domain={[xMin, xMax]}
            ticks={ticks}
            tickFormatter={fmtDate}
            tick={{ fill: axisColor, fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: gridColor }}
            angle={-30}
            textAnchor="end"
            height={48}
          />
          <YAxis
            tick={{ fill: axisColor, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            domain={['auto', 'auto']}
            tickFormatter={(v: number) =>
              `${v >= 0 ? '' : '-'}${Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 0 })} $`
            }
            width={72}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={0} stroke={refLineColor} strokeDasharray="4 4" />
          <Line
            type="monotone"
            dataKey="y"
            stroke="url(#equityLineGradient)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: isPositive ? greenColor : redColor, strokeWidth: 0 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </>
  );
});

export default EquityCurveChart;
