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
  refLineColor: string;
}

export const getChartColors = (isDark: boolean): ChartColors => ({
  axisColor: isDark ? '#6b7280' : '#9ca3af',
  textColor: isDark ? '#e0e0e0' : '#111827',
  surfaceColor: isDark ? '#141414' : '#ffffff',
  borderColor: isDark ? '#2a2a2a' : '#e5e7eb',
  greenColor: isDark ? '#22c55e' : '#16a34a',
  redColor: isDark ? '#ef4444' : '#dc2626',
  amberColor: isDark ? '#f59e0b' : '#d97706',
  refLineColor: isDark ? '#3a3a3a' : '#d1d5db',
});

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
