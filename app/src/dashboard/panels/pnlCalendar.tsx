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

const getMonthRange = (trades: Trade[]): Array<{ year: number; month: number }> => {
  const dates = trades.map((t) => t.closed ?? t.opened).filter(Boolean) as Date[];
  if (!dates.length) return [];

  // Use reduce instead of spread+Math.min/max to avoid V8's argument count limit
  // (~65 k) which would cause a stack overflow for power users with large histories.
  const minTs = dates.reduce((m, d) => Math.min(m, d.getTime()), Infinity);
  const maxTs = dates.reduce((m, d) => Math.max(m, d.getTime()), -Infinity);
  const minDate = new Date(minTs);
  const maxDate = new Date(maxTs);

  const result: Array<{ year: number; month: number }> = [];
  let y = minDate.getFullYear();
  let m = minDate.getMonth();

  while (y < maxDate.getFullYear() || (y === maxDate.getFullYear() && m <= maxDate.getMonth())) {
    result.push({ year: y, month: m });
    m++;
    if (m > 11) {
      m = 0;
      y++;
    }
  }
  return result;
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
const PnlCalendar = memo(({ trades }: { trades: Trade[] }) => {
  const dailyMap = useMemo(() => buildDailyMap(trades), [trades]);
  const months = useMemo(() => getMonthRange(trades), [trades]);
  const [idx, setIdx] = useState(0);

  // Jump to most recent month whenever the trade set changes
  useEffect(() => {
    setIdx(Math.max(0, months.length - 1));
  }, [months.length]);

  if (!months.length) return null;

  const safeIdx = Math.min(idx, months.length - 1);
  const { year, month } = months[safeIdx];

  // Month total, with % relative to the equity at the start of the month
  // (equityStart of the first trading day of the month).
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let monthTotal = 0;
  let monthEquityStart: number | null = null;
  for (let d = 1; d <= daysInMonth; d++) {
    const stat = dailyMap.get(dayKey(year, month, d));
    if (stat) {
      if (monthEquityStart === null) monthEquityStart = stat.equityStart;
      monthTotal += stat.pnl;
    }
  }
  const monthPct = monthEquityStart !== null ? fmtPct(monthTotal, monthEquityStart) : null;

  return (
    <div>
      {/* ── Navigation header ── */}
      <div className="tc-cal-nav">
        <NavBtn onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={safeIdx === 0}>
          ◀
        </NavBtn>

        <div className="text-center flex-fill">
          <span className="tc-cal-month">
            {MONTH_NAMES[month]} {year}
          </span>
          {monthTotal !== 0 && (
            <span className={`tc-cal-total ${monthTotal >= 0 ? 'tc-green' : 'tc-red'}`}>
              {fmtTotal(monthTotal)}
              {monthPct && <span className="tc-cal-total-pct">{monthPct}</span>}
            </span>
          )}
        </div>

        <NavBtn
          onClick={() => setIdx((i) => Math.min(months.length - 1, i + 1))}
          disabled={safeIdx === months.length - 1}
        >
          ▶
        </NavBtn>
      </div>

      {/* ── Calendar grid ── */}
      <MonthGrid year={year} month={month} dailyMap={dailyMap} />
    </div>
  );
});

export default PnlCalendar;
