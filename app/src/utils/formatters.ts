// ─── Shared formatters for chart panels ──────────────────────────────────────

/** "+$1.2k" / "-$340" style — compact USD with sign */
export const fmtUsd = (v: number): string => {
  const abs = Math.abs(v);
  const prefix = v >= 0 ? '+' : '-';
  if (abs >= 1000) return `${prefix}$${(abs / 1000).toFixed(1)}k`;
  return `${prefix}$${abs.toFixed(0)}`;
};

/** "1,234.56" style — full precision, no sign, no symbol */
export const fmtMoney = (v: number): string =>
  v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "42%" style — integer percentage */
export const fmtPct = (v: number): string => `${v.toFixed(0)}%`;
