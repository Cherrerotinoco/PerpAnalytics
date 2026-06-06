import { memo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList, ReferenceLine,
} from 'recharts';
import { Trade } from '../../types/tradeTypes';
import { useTheme } from '../../context/ThemeContext';
import { getChartColors, getWinRateColor, TOOLTIP_CURSOR } from '../../utils/chartColors';
import { fmtUsd } from '../../utils/formatters';
import { computeByDuration } from './durationUtils';
import type { DurationRow } from './durationUtils';
import TooltipContainer from './TooltipContainer';

// ─── Tooltip ──────────────────────────────────────────────────────────────────
const DurationTooltip = ({
  active, payload, textColor, surfaceColor, borderColor, greenColor, redColor,
}: {
  active?: boolean;
  payload?: { payload: DurationRow }[];
  textColor: string; surfaceColor: string; borderColor: string;
  greenColor: string; redColor: string;
}) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <TooltipContainer surfaceColor={surfaceColor} borderColor={borderColor} textColor={textColor}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{d.label} <span style={{ fontWeight: 400, opacity: 0.6 }}>({d.description})</span></div>
      <div>Win rate: <strong>{d.winRate}%</strong></div>
      <div>PnL: <strong style={{ color: d.pnl >= 0 ? greenColor : redColor }}>{fmtUsd(d.pnl)}</strong></div>
      <div style={{ opacity: 0.7, marginTop: 2 }}>{d.wins}W / {d.trades - d.wins}L &middot; {d.trades} trades</div>
    </TooltipContainer>
  );
};

// ─── Component ────────────────────────────────────────────────────────────────
const WinRateByDurationChart = memo(({ trades }: { trades: Trade[] }) => {
  const { theme } = useTheme();
  const data = computeByDuration(trades);
  if (!data.length) return null;

  const colors = getChartColors(theme === 'dark');
  const { axisColor, textColor, surfaceColor, borderColor, greenColor, amberColor, redColor, refLineColor } = colors;

  const totalWins   = data.reduce((s, r) => s + r.wins, 0);
  const totalTrades = data.reduce((s, r) => s + r.trades, 0);
  const avgWr       = totalTrades > 0 ? Math.round((totalWins / totalTrades) * 100) : 50;

  return (
    <div style={{ width: '100%' }}>
      <ResponsiveContainer width="100%" height={190}>
        <BarChart data={data} margin={{ top: 16, right: 8, left: -8, bottom: 0 }} barCategoryGap="30%">
          <XAxis dataKey="label" tick={{ fill: axisColor, fontSize: 10 }} tickLine={false} axisLine={false} />
          <YAxis domain={[0, 100]} tick={{ fill: axisColor, fontSize: 9 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} width={32} />
          <ReferenceLine y={avgWr} stroke={refLineColor} strokeDasharray="4 3" label={{ value: `avg ${avgWr}%`, position: 'insideTopRight', fill: axisColor, fontSize: 9 }} />
          <Tooltip cursor={TOOLTIP_CURSOR} content={<DurationTooltip textColor={textColor} surfaceColor={surfaceColor} borderColor={borderColor} greenColor={greenColor} redColor={redColor} />} />
          <Bar dataKey="winRate" radius={[3, 3, 0, 0]}>
            {data.map((row) => <Cell key={row.key} fill={getWinRateColor(row.winRate, avgWr, colors)} fillOpacity={0.85} />)}
            <LabelList dataKey="winRate" position="top" formatter={(v: number) => `${v}%`} style={{ fontSize: 9, fill: axisColor }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div style={{ display: 'flex', gap: 14, justifyContent: 'center', marginTop: 6, fontSize: '0.68rem', color: axisColor }}>
        <span><span style={{ color: greenColor }}>●</span> Above avg (+10%)</span>
        <span><span style={{ color: amberColor }}>●</span> Near avg</span>
        <span><span style={{ color: redColor }}>●</span> Below avg (−10%)</span>
      </div>
    </div>
  );
});

export default WinRateByDurationChart;
