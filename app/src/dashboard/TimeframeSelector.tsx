// ─── Date-range control (presets + custom) ───────────────────────────────────
// Single source of truth for dashboard date filtering. Presets set an absolute
// range relative to today; 'CUSTOM' reveals the From/To inputs; 'ALL' clears.
export type DateRange = '1D' | '7D' | '30D' | '90D' | 'ALL' | 'CUSTOM';

export const DATE_RANGES: DateRange[] = ['1D', '7D', '30D', '90D', 'ALL', 'CUSTOM'];

const RANGE_LABELS: Record<DateRange, string> = {
  '1D': '1D',
  '7D': '7D',
  '30D': '30D',
  '90D': '90D',
  ALL: 'All',
  CUSTOM: 'Custom',
};

/** Days covered by each preset (null = not a rolling preset). */
const RANGE_DAYS: Record<DateRange, number | null> = {
  '1D': 1,
  '7D': 7,
  '30D': 30,
  '90D': 90,
  ALL: null,
  CUSTOM: null,
};

/** Format a Date as the YYYY-MM-DD value expected by <input type="date">. */
const toYMD = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/**
 * Absolute {start, end} (YYYY-MM-DD) for a preset, relative to today.
 * Returns empty strings for ALL/CUSTOM (caller decides what to do).
 */
export const presetRange = (range: DateRange): { start: string; end: string } => {
  const days = RANGE_DAYS[range];
  if (days === null) return { start: '', end: '' };
  const now = new Date();
  const start = new Date(now.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  return { start: toYMD(start), end: toYMD(now) };
};

interface DateRangeSelectorProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

export const TimeframeSelector = ({ value, onChange }: DateRangeSelectorProps) => (
  <div className="tc-timeframe" role="group" aria-label="Date range">
    {DATE_RANGES.map((r) => (
      <button
        key={r}
        type="button"
        className={`tc-timeframe-btn${value === r ? ' tc-timeframe-btn--active' : ''}`}
        aria-pressed={value === r}
        onClick={() => onChange(r)}
      >
        {RANGE_LABELS[r]}
      </button>
    ))}
  </div>
);
