// ─── Chart colour palette ─────────────────────────────────────────────────────
// Single source of truth for all dashboard chart components.
// Usage: const colors = getChartColors(theme === 'dark');

export interface ChartColors {
  axisColor: string;
  textColor: string;
  surfaceColor: string;
  borderColor: string;
  greenColor: string;
  redColor: string;
  amberColor: string;
  infoColor: string;
  neutralColor: string;
  gridColor: string;
  refLineColor: string;
}

// Each ChartColors field maps to a CSS custom property (design token).
// Recharts writes colours as SVG presentation attributes, where `var(--x)`
// does NOT resolve — so we read the *computed* token value at render time.
const TOKEN_MAP: Record<keyof ChartColors, string> = {
  axisColor: '--tc-chart-axis',
  textColor: '--tc-text',
  surfaceColor: '--tc-surface',
  borderColor: '--tc-border',
  greenColor: '--tc-green',
  redColor: '--tc-red',
  amberColor: '--tc-amber',
  infoColor: '--tc-info',
  neutralColor: '--tc-neutral',
  gridColor: '--tc-chart-grid',
  refLineColor: '--tc-chart-refline',
};

// SSR / first-paint fallbacks — mirror the token values in index.css so the
// server-rendered markup matches before getComputedStyle is available.
const FALLBACK_DARK: ChartColors = {
  axisColor: '#7d8592',
  textColor: '#f5f7fa',
  surfaceColor: '#121316',
  borderColor: '#2d313a',
  greenColor: '#22c55e',
  redColor: '#ef4444',
  amberColor: '#f4b942',
  infoColor: '#60a5fa',
  neutralColor: '#94a3b8',
  gridColor: 'rgba(255,255,255,0.06)',
  refLineColor: '#475569',
};

const FALLBACK_LIGHT: ChartColors = {
  axisColor: '#9ca3af',
  textColor: '#111827',
  surfaceColor: '#ffffff',
  borderColor: '#e5e7eb',
  greenColor: '#16a34a',
  redColor: '#dc2626',
  amberColor: '#d97706',
  infoColor: '#2563eb',
  neutralColor: '#64748b',
  gridColor: 'rgba(0,0,0,0.06)',
  refLineColor: '#cbd5e1',
};

export const getChartColors = (isDark: boolean): ChartColors => {
  const fallback = isDark ? FALLBACK_DARK : FALLBACK_LIGHT;
  if (typeof document === 'undefined') return fallback;

  const styles = getComputedStyle(document.documentElement);
  const keys = Object.keys(TOKEN_MAP) as (keyof ChartColors)[];
  return keys.reduce((acc, key) => {
    acc[key] = styles.getPropertyValue(TOKEN_MAP[key]).trim() || fallback[key];
    return acc;
  }, {} as ChartColors);
};

// ─── Win-rate semantic colour ─────────────────────────────────────────────────
// Returns green when wr is ≥ avg+10, red when ≤ avg-10, amber otherwise.
export const getWinRateColor = (
  wr: number,
  avgWr: number,
  colors: Pick<ChartColors, 'greenColor' | 'redColor' | 'amberColor'>
): string => {
  if (wr >= avgWr + 10) return colors.greenColor;
  if (wr <= avgWr - 10) return colors.redColor;
  return colors.amberColor;
};

// ─── Tooltip cursor ───────────────────────────────────────────────────────────
// Pass as <Tooltip cursor={TOOLTIP_CURSOR} …> on every bar/line chart.
export const TOOLTIP_CURSOR = { fill: 'rgba(255,255,255,0.04)' } as const;
