import { useState, useEffect, useMemo, memo } from 'react';
import { Trade } from '../../types/tradeTypes';

// ─── Constants ────────────────────────────────────────────────────────────────
const WEEK_DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

// ─── Types ────────────────────────────────────────────────────────────────────
// equityStart = cumulative PnL of all prior days (the account equity at the
// start of this day), used to express the day's PnL as an equity-based % that
// compounds like the equity curve.
type DayStat = { pnl: number; equityStart: number };
type DailyMap = Map<string, DayStat>; // "YYYY-MM-DD" → day stats

// ─── Helpers ──────────────────────────────────────────────────────────────────
const buildDailyMap = (trades: Trade[]): DailyMap => {
  // First aggregate PnL per day.
  const totals = new Map<string, number>();
  for (const t of trades) {
    const d = t.closed ?? t.opened;
    if (!d) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    totals.set(key, (totals.get(key) ?? 0) + t.pnl);
  }
  // Walk days chronologically, recording the running equity before each day.
  // Keys are "YYYY-MM-DD" so lexical sort is chronological.
  const map: DailyMap = new Map();
  let equity = 0;
  for (const key of [...totals.keys()].sort()) {
    const pnl = totals.get(key)!;
    map.set(key, { pnl, equityStart: equity });
    equity += pnl;
  }
  return map;
};

const getYearRange = (trades: Trade[]): number[] => {
  const dates = trades.map((t) => t.closed ?? t.opened).filter(Boolean) as Date[];
  if (!dates.length) return [];

  // Use reduce instead of spread+Math.min/max to avoid V8's argument count limit
  // (~65 k) which would cause a stack overflow for power users with large histories.
  const minTs = dates.reduce((m, d) => Math.min(m, d.getTime()), Infinity);
  const maxTs = dates.reduce((m, d) => Math.max(m, d.getTime()), -Infinity);
  const minYear = new Date(minTs).getFullYear();
  const maxYear = new Date(maxTs).getFullYear();

  const result: number[] = [];
  for (let y = minYear; y <= maxYear; y++) result.push(y);
  return result;
};

// Aggregate a single month's PnL and the equity at the start of its first
// trading day (used for the equity-based %).
const monthSummary = (
  dailyMap: DailyMap,
  year: number,
  month: number
): { total: number; equityStart: number | null; hasTrades: boolean } => {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let total = 0;
  let equityStart: number | null = null;
  let hasTrades = false;
  for (let d = 1; d <= daysInMonth; d++) {
    const stat = dailyMap.get(dayKey(year, month, d));
    if (stat) {
      hasTrades = true;
      if (equityStart === null) equityStart = stat.equityStart;
      total += stat.pnl;
    }
  }
  return { total, equityStart, hasTrades };
};

const dayKey = (year: number, month: number, day: number): string =>
  `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

const fmtCell = (v: number): string => {
  const abs = Math.abs(v);
  const s = v >= 0 ? '+' : '';
  if (abs >= 1000) return `${s}${(v / 1000).toFixed(1)}k`;
  if (abs >= 100) return `${s}${v.toFixed(0)}`;
  return `${s}${v.toFixed(1)}`;
};

const fmtTotal = (v: number): string => {
  const s = v >= 0 ? '+' : '';
  return `${s}${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;
};

// Equity-based return: PnL as a % of the account equity at the start of the
// period. Uses the magnitude of equity as the base so a negative equity (account
// underwater) still yields a correctly-signed % — a gain shows +, a loss shows −.
// Only a base of exactly 0 (the very first trading day) is undefined and hidden.
const fmtPct = (pnl: number, equityStart: number): string | null => {
  if (equityStart === 0) return null;
  const pct = (pnl / Math.abs(equityStart)) * 100;
  const s = pct >= 0 ? '+' : '';
  return `${s}${pct.toFixed(1)}%`;
};

// ─── Nav button ───────────────────────────────────────────────────────────────
const NavBtn = ({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  children: React.ReactNode;
}) => (
  <button type="button" onClick={onClick} disabled={disabled} className="tc-nav-btn">
    {children}
  </button>
);

// ─── Month grid ───────────────────────────────────────────────────────────────
const MonthGrid = ({
  year,
  month,
  dailyMap,
}: {
  year: number;
  month: number;
  dailyMap: DailyMap;
}) => {
  const firstDow = new Date(year, month, 1).getDay();
  const startOffset = (firstDow + 6) % 7; // Mon = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (number | null)[] = [
    ...Array<null>(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    <table className="tc-cal-table">
      <thead>
        <tr>
          {WEEK_DAYS.map((d) => (
            <th key={d} className="tc-cal-weekday">
              {d}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {weeks.map((week, wi) => (
          <tr key={wi}>
            {week.map((day, di) => {
              if (!day) {
                return <td key={di} className="tc-cal-cell" />;
              }
              const stat = dailyMap.get(dayKey(year, month, day));
              const hasTrade = stat !== undefined;
              const pnl = stat?.pnl ?? 0;
              const pct = hasTrade ? fmtPct(pnl, stat!.equityStart) : null;
              const dateStr = `${String(day).padStart(2, '0')}/${String(month + 1).padStart(2, '0')}/${year}`;
              return (
                <td
                  key={di}
                  title={
                    hasTrade
                      ? `${dateStr}: ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} $${pct ? ` (${pct})` : ''}`
                      : dateStr
                  }
                  className={`tc-cal-cell ${hasTrade ? (pnl > 0 ? 'tc-cal-cell--win' : pnl < 0 ? 'tc-cal-cell--loss' : 'tc-cal-cell--zero') : ''}`}
                >
                  <div className="tc-cal-cell-inner">
                    <span
                      className={`tc-cal-day-num ${hasTrade ? (pnl >= 0 ? 'tc-cal-day-num--win' : 'tc-cal-day-num--loss') : 'tc-cal-day-num--empty'}`}
                    >
                      {day}
                    </span>
                    {hasTrade && (
                      <>
                        <span
                          className={`tc-cal-day-pnl ${pnl >= 0 ? 'tc-cal-day-pnl--win' : 'tc-cal-day-pnl--loss'}`}
                        >
                          {fmtCell(pnl)}
                        </span>
                        {pct && (
                          <span
                            className={`tc-cal-day-pct ${pnl >= 0 ? 'tc-cal-day-pnl--win' : 'tc-cal-day-pnl--loss'}`}
                          >
                            {pct}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────
// Full-year view: renders all twelve months of the selected year, navigable one
// whole year at a time. `maxMonths` (homepage showcase) truncates the grid to
// the first N months instead of all twelve.
const PnlCalendar = memo(({ trades, maxMonths = 12 }: { trades: Trade[]; maxMonths?: number }) => {
  const dailyMap = useMemo(() => buildDailyMap(trades), [trades]);
  const years = useMemo(() => getYearRange(trades), [trades]);
  const [idx, setIdx] = useState(0);

  // Jump to most recent year whenever the trade set changes
  useEffect(() => {
    setIdx(Math.max(0, years.length - 1));
  }, [years.length]);

  if (!years.length) return null;

  const safeIdx = Math.min(idx, years.length - 1);
  const year = years[safeIdx];

  // Year total, with % relative to the equity at the start of the year
  // (equityStart of the first trading day of the year).
  let yearTotal = 0;
  let yearEquityStart: number | null = null;
  for (let m = 0; m < 12; m++) {
    const { total, equityStart, hasTrades } = monthSummary(dailyMap, year, m);
    if (hasTrades) {
      if (yearEquityStart === null) yearEquityStart = equityStart;
      yearTotal += total;
    }
  }
  const yearPct = yearEquityStart !== null ? fmtPct(yearTotal, yearEquityStart) : null;

  return (
    <div className="tc-cal-year">
      {/* ── Navigation header ── */}
      <div className="tc-cal-nav">
        <NavBtn onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={safeIdx === 0}>
          ◀
        </NavBtn>

        <div className="text-center flex-fill">
          <span className="tc-cal-month">{year}</span>
          {yearTotal !== 0 && (
            <span className={`tc-cal-total ${yearTotal >= 0 ? 'tc-green' : 'tc-red'}`}>
              {fmtTotal(yearTotal)}
              {yearPct && <span className="tc-cal-total-pct">{yearPct}</span>}
            </span>
          )}
        </div>

        <NavBtn
          onClick={() => setIdx((i) => Math.min(years.length - 1, i + 1))}
          disabled={safeIdx === years.length - 1}
        >
          ▶
        </NavBtn>
      </div>

      {/* ── Month grid ── */}
      <div className="tc-cal-year-grid">
        {MONTH_NAMES.slice(0, maxMonths).map((name, m) => {
          const { total, equityStart, hasTrades } = monthSummary(dailyMap, year, m);
          const pct = hasTrades && equityStart !== null ? fmtPct(total, equityStart) : null;
          return (
            <div key={name} className="tc-cal-month-card">
              <div className="tc-cal-month-card-head">
                <span className="tc-cal-month-name">{name}</span>
                {hasTrades && total !== 0 && (
                  <span className={`tc-cal-month-total ${total >= 0 ? 'tc-green' : 'tc-red'}`}>
                    {fmtCell(total)}
                    {pct && <span className="tc-cal-total-pct">{pct}</span>}
                  </span>
                )}
              </div>
              <MonthGrid year={year} month={m} dailyMap={dailyMap} />
            </div>
          );
        })}
      </div>
    </div>
  );
});

export default PnlCalendar;
