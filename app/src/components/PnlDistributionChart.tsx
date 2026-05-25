import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useTheme } from '../context/ThemeContext';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function niceStep(raw: number): number {
  const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(raw) || 1)));
  const n = raw / mag;
  return n <= 1 ? mag : n <= 2 ? 2 * mag : n <= 5 ? 5 * mag : 10 * mag;
}

interface BinData {
  label: string;
  count: number;
  lo: number;
  hi: number;
}

function computeBins(pnlList: number[]): BinData[] {
  if (!pnlList.length) return [];

  const lo = Math.min(...pnlList);
  const hi = Math.max(...pnlList);
  if (lo === hi) {
    return [{ label: lo.toFixed(0), lo, hi: lo + 1, count: pnlList.length }];
  }

  const step = niceStep((hi - lo) / 15);
  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(hi / step) * step;

  const bins: BinData[] = [];
  for (let s = start; s < end - step * 0.0001; s += step) {
    const label = s < 0 ? s.toFixed(0) : s === 0 ? '0' : `+${s.toFixed(0)}`;
    bins.push({ lo: s, hi: s + step, count: 0, label });
  }

  for (const v of pnlList) {
    const i = Math.min(Math.floor((v - start) / step), bins.length - 1);
    if (i >= 0) bins[i].count++;
  }

  return bins;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function PnlDistributionChart({ pnlList }: { pnlList: number[] }) {
  const { theme } = useTheme();
  const bins = computeBins(pnlList);

  if (!bins.length) return null;

  const axisColor = theme === 'dark' ? '#6b7280' : '#9ca3af';
  const greenColor = theme === 'dark' ? '#22c55e' : '#16a34a';
  const redColor = theme === 'dark' ? '#ef4444' : '#dc2626';
  const amberColor = theme === 'dark' ? '#f59e0b' : '#d97706';

  const barColor = (b: BinData) => {
    if (b.hi <= 0) return redColor;
    if (b.lo >= 0) return greenColor;
    return amberColor; // straddles 0
  };

  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart
        data={bins}
        margin={{ top: 4, right: 4, left: -24, bottom: 0 }}
        barCategoryGap="8%"
      >
        <XAxis
          dataKey="label"
          tick={{ fill: axisColor, fontSize: 9 }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fill: axisColor, fontSize: 9 }}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
          width={28}
        />
        <Tooltip
          cursor={{ fill: 'rgba(255,255,255,0.04)' }}
          contentStyle={{
            background: 'var(--tc-surface)',
            border: '1px solid var(--tc-border)',
            borderRadius: 5,
            fontSize: '0.72rem',
            color: 'var(--tc-text)',
            padding: '0.3rem 0.5rem',
          }}
          formatter={(value: number) => [value, 'Trades']}
          labelFormatter={(_label, payload) => {
            if (payload?.length) {
              const d = payload[0].payload as BinData;
              return `${d.lo.toFixed(1)} → ${d.hi.toFixed(1)} $`;
            }
            return _label;
          }}
        />
        <Bar dataKey="count" radius={[2, 2, 0, 0]}>
          {bins.map((b, i) => (
            <Cell key={i} fill={barColor(b)} fillOpacity={0.8} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
