import { memo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
  ReferenceLine,
} from 'recharts';
import { useTheme } from '../../context/ThemeContext';
import type { TradeStats, SessionStats } from './statistics';

const fmtMoney = (v: number): string =>
  v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtPct = (v: number): string => `${v.toFixed(0)}%`;

// ─── Tooltip ──────────────────────────────────────────────────────────────────
interface TooltipProps {
  active?: boolean;
  payload?: Array<{ payload: SessionStats }>;
  label?: string;
}

const CustomTooltip = ({ active, payload }: TooltipProps) => {
  if (!active || !payload?.length) return null;
  const s = payload[0].payload;
  return (
    <div className="tc-chart-tooltip">
      <p className="tc-chart-tooltip-date" style={{ fontWeight: 600 }}>
        {s.name}
      </p>
      <p className={`tc-chart-tooltip-val ${s.totalPnl >= 0 ? 'tc-green' : 'tc-red'}`}>
        {s.totalPnl >= 0 ? '+' : ''}
        {fmtMoney(s.totalPnl)} $
      </p>
      <p className="tc-chart-tooltip-val" style={{ fontSize: 11 }}>
        {s.trades} trades · {fmtPct(s.winRate)} WR · avg {s.avgPnl >= 0 ? '+' : ''}
        {fmtMoney(s.avgPnl)} $
      </p>
    </div>
  );
};

// ─── Win-rate dots below each bar ─────────────────────────────────────────────
const WinRateTick = (props: {
  x?: number;
  y?: number;
  payload?: { value: string };
  data: SessionStats[];
}) => {
  const { x = 0, y = 0, payload, data } = props;
  if (!payload) return null;
  const s = data.find((d) => d.name === payload.value);
  if (!s) return null;
  return (
    <g>
      <text x={x} y={y + 14} textAnchor="middle" fontSize={11} fill="var(--tc-muted)">
        {s.name}
      </text>
      <text x={x} y={y + 26} textAnchor="middle" fontSize={10} fill="var(--tc-muted)">
        {fmtPct(s.winRate)} WR
      </text>
    </g>
  );
};

// ─── Component ────────────────────────────────────────────────────────────────
const PnlBySessionChart = memo(({ stats }: { stats: TradeStats }) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const { bySession } = stats;
  if (!bySession.length) return null;

  const greenColor = isDark ? '#22c55e' : '#16a34a';
  const redColor = isDark ? '#ef4444' : '#dc2626';
  const gridColor = isDark ? '#2a2a2a' : '#e5e7eb';
  const axisColor = isDark ? '#6b7280' : '#9ca3af';
  const refColor = isDark ? '#374151' : '#d1d5db';

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={bySession} margin={{ top: 8, right: 16, left: 8, bottom: 40 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
        <XAxis
          dataKey="name"
          tick={(props) => <WinRateTick {...props} data={bySession} />}
          tickLine={false}
          axisLine={{ stroke: gridColor }}
          height={48}
        />
        <YAxis
          tick={{ fill: axisColor, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) =>
            `${v >= 0 ? '' : '-'}${Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 0 })} $`
          }
          width={72}
        />
        <Tooltip
          content={<CustomTooltip />}
          cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }}
        />
        <ReferenceLine y={0} stroke={refColor} strokeDasharray="4 4" />
        <Bar dataKey="totalPnl" radius={[4, 4, 0, 0]} maxBarSize={64}>
          {bySession.map((s) => (
            <Cell key={s.name} fill={s.totalPnl >= 0 ? greenColor : redColor} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
});

export default PnlBySessionChart;
