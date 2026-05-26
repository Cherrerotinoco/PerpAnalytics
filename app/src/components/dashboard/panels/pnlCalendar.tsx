import { useState, useEffect, memo } from 'react';
import { Trade } from '../../../types/tradeTypes';

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
type DailyMap = Map<string, number>; // "YYYY-MM-DD" → total PnL

// ─── Helpers ──────────────────────────────────────────────────────────────────
const buildDailyMap = (trades: Trade[]): DailyMap => {
  const map: DailyMap = new Map();
  for (const t of trades) {
    const d = t.closed ?? t.opened;
    if (!d) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    map.set(key, (map.get(key) ?? 0) + t.pnl);
  }
  return map;
};

const getMonthRange = (trades: Trade[]): Array<{ year: number; month: number }> => {
  const dates = trades.map((t) => t.closed ?? t.opened).filter(Boolean) as Date[];
  if (!dates.length) return [];

  const minDate = new Date(Math.min(...dates.map((d) => d.getTime())));
  const maxDate = new Date(Math.max(...dates.map((d) => d.getTime())));

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
              const pnl = dailyMap.get(dayKey(year, month, day));
              const hasTrade = pnl !== undefined;
              return (
                <td
                  key={di}
                  title={
                    hasTrade
                      ? `${String(day).padStart(2, '0')}/${String(month + 1).padStart(2, '0')}/${year}: ${pnl! >= 0 ? '+' : ''}${pnl!.toFixed(2)} $`
                      : `${String(day).padStart(2, '0')}/${String(month + 1).padStart(2, '0')}/${year}`
                  }
                  className={`tc-cal-cell ${hasTrade ? (pnl! > 0 ? 'tc-cal-cell--win' : pnl! < 0 ? 'tc-cal-cell--loss' : 'tc-cal-cell--zero') : ''}`}
                >
                  <div className="tc-cal-cell-inner">
                    <span
                      className={`tc-cal-day-num ${hasTrade ? (pnl! >= 0 ? 'tc-cal-day-num--win' : 'tc-cal-day-num--loss') : 'tc-cal-day-num--empty'}`}
                    >
                      {day}
                    </span>
                    {hasTrade && (
                      <span
                        className={`tc-cal-day-pnl ${pnl! >= 0 ? 'tc-cal-day-pnl--win' : 'tc-cal-day-pnl--loss'}`}
                      >
                        {fmtCell(pnl!)}
                      </span>
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
  const dailyMap = buildDailyMap(trades);
  const months = getMonthRange(trades);
  const [idx, setIdx] = useState(0);

  // Jump to most recent month whenever the trade set changes
  useEffect(() => {
    setIdx(Math.max(0, months.length - 1));
  }, [months.length]);

  if (!months.length) return null;

  const safeIdx = Math.min(idx, months.length - 1);
  const { year, month } = months[safeIdx];

  // Month total
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let monthTotal = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    monthTotal += dailyMap.get(dayKey(year, month, d)) ?? 0;
  }

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
