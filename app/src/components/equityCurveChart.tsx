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
import { Trade } from '../types/tradeTypes';
import { computeTradeStats } from './statistics';
import { useTheme } from '../context/ThemeContext';

function fmtMoney(v: number): string {
  return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const val: number = payload[0].value;
  return (
    <div className="tc-chart-tooltip">
      <p className="tc-chart-tooltip-date">{fmtDate(label)}</p>
      <p className="tc-chart-tooltip-val" style={{ color: val >= 0 ? 'var(--tc-green)' : 'var(--tc-red)' }}>
        {val >= 0 ? '+' : ''}{fmtMoney(val)} $
      </p>
    </div>
  );
};

export default memo(function EquityCurveChart({ trades }: { trades: Trade[] }) {
  const { theme } = useTheme();
  const stats = computeTradeStats(trades);

  const data = stats.equityCurve
    .map((y, i) => ({ x: Number(stats.equityCurveLabels[i]), y }))
    .filter((d) => d.x > 0);

  if (!data.length) return null;

  const isPositive = stats.totalPnl >= 0;
  const lineColor   = isPositive ? (theme === 'dark' ? '#22c55e' : '#16a34a') : (theme === 'dark' ? '#ef4444' : '#dc2626');
  const gridColor   = theme === 'dark' ? '#2a2a2a' : '#e5e7eb';
  const axisColor   = theme === 'dark' ? '#6b7280' : '#9ca3af';
  const refLineColor = theme === 'dark' ? '#374151' : '#d1d5db';

  const xMin = data[0].x;
  const xMax = data[data.length - 1].x;
  const tickCount = Math.min(data.length, 6);
  const ticks = Array.from({ length: tickCount }, (_, i) =>
    Math.round(xMin + (i / (tickCount - 1)) * (xMax - xMin))
  );

  return (
    <>
      <div className="tc-chart-header">
        <span className="tc-chart-date-range">{fmtDate(xMin)} — {fmtDate(xMax)}</span>
        <span
          className="tc-pnl-badge"
          style={{
            color: lineColor,
            background: isPositive ? 'rgba(34,197,94,0.1)' : 'rgba(220,38,38,0.1)',
            border: `1px solid ${isPositive ? 'rgba(34,197,94,0.2)' : 'rgba(220,38,38,0.2)'}`,
          }}
        >
          {isPositive ? '+' : ''}{fmtMoney(stats.totalPnl)} $
        </span>
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 24 }}>
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
            stroke={lineColor}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: lineColor, strokeWidth: 0 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </>
  );
});
