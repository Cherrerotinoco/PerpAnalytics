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
import { Trade } from '../../../types/tradeTypes';
import { useTheme } from '../../../context/ThemeContext';

// ─── Helpers ──────────────────────────────────────────────────────────────────
interface SymbolRow {
  symbol: string;
  pnl: number;
}

const computeBySymbol = (trades: Trade[], top = 8): SymbolRow[] => {
  const map = new Map<string, number>();
  for (const t of trades) {
    if (!t.symbol) continue;
    map.set(t.symbol, (map.get(t.symbol) ?? 0) + t.pnl);
  }
  return [...map.entries()]
    .map(([symbol, pnl]) => ({ symbol, pnl }))
    .sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl))
    .slice(0, top);
};

const fmtLabel = (v: number): string => {
  const abs = Math.abs(v);
  const prefix = v >= 0 ? '+' : '';
  if (abs >= 1000) return `${prefix}${(v / 1000).toFixed(1)}k`;
  return `${prefix}${v.toFixed(0)}`;
};

const fmtAxis = (v: number): string => {
  const abs = Math.abs(v);
  if (abs >= 1000) return `${v >= 0 ? '' : '-'}${(abs / 1000).toFixed(0)}k`;
  return String(v);
};

// ─── Component ────────────────────────────────────────────────────────────────
const PnlBySymbolChart = memo(({ trades }: { trades: Trade[] }) => {
  const { theme } = useTheme();
  const data = computeBySymbol(trades);

  if (!data.length) return null;

  const axisColor = theme === 'dark' ? '#6b7280' : '#9ca3af';
  const textColor = theme === 'dark' ? '#e0e0e0' : '#111827';
  const surfaceColor = theme === 'dark' ? '#141414' : '#ffffff';
  const borderColor = theme === 'dark' ? '#2a2a2a' : '#e5e7eb';
  const greenColor = theme === 'dark' ? '#22c55e' : '#16a34a';
  const redColor = theme === 'dark' ? '#ef4444' : '#dc2626';

  const chartHeight = Math.max(140, data.length * 32);

  return (
    <ResponsiveContainer width="100%" height={chartHeight}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 0, right: 52, left: 0, bottom: 0 }}
        barCategoryGap="25%"
      >
        <XAxis
          type="number"
          tick={{ fill: axisColor, fontSize: 9 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={fmtAxis}
        />
        <YAxis
          type="category"
          dataKey="symbol"
          tick={{ fill: axisColor, fontSize: 10, fontFamily: 'monospace' }}
          tickLine={false}
          axisLine={false}
          width={62}
        />
        <Tooltip
          cursor={{ fill: 'rgba(255,255,255,0.04)' }}
          contentStyle={{
            background: surfaceColor,
            border: `1px solid ${borderColor}`,
            borderRadius: 5,
            fontSize: '0.72rem',
            padding: '0.3rem 0.5rem',
          }}
          labelStyle={{ color: textColor, fontWeight: 600, marginBottom: 2 }}
          itemStyle={{ color: textColor }}
          formatter={(value: number) => [`${value >= 0 ? '+' : ''}${value.toFixed(2)} $`, 'PnL']}
        />
        <Bar dataKey="pnl" radius={[0, 3, 3, 0]}>
          <LabelList
            dataKey="pnl"
            position="right"
            style={{ fontSize: 9, fill: axisColor }}
            formatter={(v: number) => fmtLabel(v)}
          />
          {data.map((row, i) => (
            <Cell key={i} fill={row.pnl >= 0 ? greenColor : redColor} fillOpacity={0.82} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
});

export default PnlBySymbolChart;
