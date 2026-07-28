import { memo } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useTheme } from '../../context/ThemeContext';
import { getChartColors } from '../../utils/chartColors';
import type { CvdAnalysis } from '../../utils/intraday/types';

// Cumulative session CVD (left axis, BTC) against price (right axis, USD). The
// shape of the gap between the two lines is the whole point: price falling while
// CVD climbs is buy-side absorption, and vice versa.

const fmtHm = (ts: number): string => new Date(ts).toISOString().slice(11, 16);

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ dataKey: string; value: number }>;
  label?: number;
}

const CustomTooltip = ({ active, payload, label }: TooltipProps) => {
  if (!active || !payload?.length || label == null) return null;
  const cvd = payload.find((p) => p.dataKey === 'cvd')?.value;
  const price = payload.find((p) => p.dataKey === 'price')?.value;
  return (
    <div className="tc-chart-tooltip">
      <p className="tc-chart-tooltip-date">{fmtHm(label)} UTC</p>
      {cvd != null && (
        <p className={`tc-chart-tooltip-val ${cvd >= 0 ? 'tc-green' : 'tc-red'}`}>
          CVD {cvd >= 0 ? '+' : ''}
          {cvd.toFixed(1)} BTC
        </p>
      )}
      {price != null && (
        <p className="tc-chart-tooltip-val">
          ${price.toLocaleString('en-US', { maximumFractionDigits: 0 })}
        </p>
      )}
    </div>
  );
};

const CvdSessionChart = memo(({ cvd, height = 260 }: { cvd: CvdAnalysis; height?: number }) => {
  const { theme } = useTheme();
  const { greenColor, redColor, gridColor, axisColor, refLineColor, neutralColor } = getChartColors(
    theme === 'dark'
  );

  const data = cvd.curve
    .filter((p): p is { time: number; cvd: number; price: number | null } => p.time != null)
    .map((p) => ({ time: p.time, cvd: p.cvd, price: p.price }));

  if (!data.length) return null;

  // Fraction from the top where CVD = 0 falls, so the line is green above the
  // zero line and red below it (same technique as the equity curve).
  const values = data.map((d) => d.cvd);
  const yMin = Math.min(...values);
  const yMax = Math.max(...values);
  const range = yMax - yMin;
  const zeroRatio =
    range === 0 ? (yMax >= 0 ? 1 : 0) : yMax > 0 && yMin < 0 ? yMax / range : yMax <= 0 ? 0 : 1;

  const xMin = data[0].time;
  const xMax = data[data.length - 1].time;
  const tickCount = Math.min(data.length, 7);
  const ticks =
    tickCount <= 1
      ? [xMin]
      : Array.from({ length: tickCount }, (_, i) =>
          Math.round(xMin + (i / (tickCount - 1)) * (xMax - xMin))
        );

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
        <defs>
          <linearGradient id="cvdLineGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset={zeroRatio} stopColor={greenColor} />
            <stop offset={zeroRatio} stopColor={redColor} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
        <XAxis
          dataKey="time"
          type="number"
          scale="time"
          domain={[xMin, xMax]}
          ticks={ticks}
          tickFormatter={fmtHm}
          tick={{ fill: axisColor, fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: gridColor }}
          height={28}
        />
        <YAxis
          yAxisId="cvd"
          tick={{ fill: axisColor, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          domain={['auto', 'auto']}
          tickFormatter={(v: number) => `${v >= 0 ? '' : '-'}${Math.abs(v).toFixed(0)}`}
          width={52}
        />
        <YAxis
          yAxisId="price"
          orientation="right"
          tick={{ fill: axisColor, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          domain={['auto', 'auto']}
          tickFormatter={(v: number) => `${(v / 1000).toFixed(1)}k`}
          width={48}
        />
        <Tooltip content={<CustomTooltip />} />
        <ReferenceLine yAxisId="cvd" y={0} stroke={refLineColor} strokeDasharray="4 4" />
        <Line
          yAxisId="price"
          type="monotone"
          dataKey="price"
          stroke={neutralColor}
          strokeWidth={1.25}
          strokeDasharray="3 3"
          dot={false}
          activeDot={false}
        />
        <Line
          yAxisId="cvd"
          type="monotone"
          dataKey="cvd"
          stroke="url(#cvdLineGradient)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: cvd.totalCvd >= 0 ? greenColor : redColor, strokeWidth: 0 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
});

export default CvdSessionChart;
