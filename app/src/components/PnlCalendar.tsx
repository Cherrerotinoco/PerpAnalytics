import { Trade } from '../types/tradeTypes';

// ─── Constants ────────────────────────────────────────────────────────────────
const WEEK_DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// ─── Types ────────────────────────────────────────────────────────────────────
type DailyMap = Map<string, number>; // "YYYY-MM-DD" → total PnL

// ─── Helpers ──────────────────────────────────────────────────────────────────
function buildDailyMap(trades: Trade[]): DailyMap {
  const map: DailyMap = new Map();
  for (const t of trades) {
    const d = t.closed ?? t.opened;
    if (!d) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    map.set(key, (map.get(key) ?? 0) + t.pnl);
  }
  return map;
}

function getMonthRange(trades: Trade[]): Array<{ year: number; month: number }> {
  const dates = trades.map((t) => t.closed ?? t.opened).filter(Boolean) as Date[];
  if (!dates.length) return [];

  const minDate = new Date(Math.min(...dates.map((d) => d.getTime())));
  const maxDate = new Date(Math.max(...dates.map((d) => d.getTime())));

  const result: Array<{ year: number; month: number }> = [];
  let y = minDate.getFullYear();
  let m = minDate.getMonth();
  const ey = maxDate.getFullYear();
  const em = maxDate.getMonth();

  while (y < ey || (y === ey && m <= em)) {
    result.push({ year: y, month: m });
    m++;
    if (m > 11) { m = 0; y++; }
  }
  return result;
}

function dayKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function cellBg(pnl: number | undefined, maxAbs: number): string {
  if (pnl === undefined) return 'transparent';
  if (pnl === 0) return 'var(--tc-surface-2)';
  const opacity = Math.min(0.88, 0.15 + 0.73 * (Math.abs(pnl) / (maxAbs || 1)));
  return pnl > 0
    ? `rgba(34,197,94,${opacity.toFixed(2)})`
    : `rgba(239,68,68,${opacity.toFixed(2)})`;
}

function fmtCell(v: number): string {
  const abs = Math.abs(v);
  const s = v >= 0 ? '+' : '';
  if (abs >= 1000) return `${s}${(v / 1000).toFixed(1)}k`;
  if (abs >= 100) return `${s}${v.toFixed(0)}`;
  return `${s}${v.toFixed(1)}`;
}

// ─── Single month grid ────────────────────────────────────────────────────────
function MonthGrid({
  year,
  month,
  dailyMap,
  maxAbs,
}: {
  year: number;
  month: number;
  dailyMap: DailyMap;
  maxAbs: number;
}) {
  const firstDow = new Date(year, month, 1).getDay(); // 0 = Sun
  const startOffset = (firstDow + 6) % 7; // shift to Mon = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Build flat cell array (null = empty padding)
  const cells: (number | null)[] = [
    ...Array<null>(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  // Chunk into weeks
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  // Month total
  let monthTotal = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    monthTotal += dailyMap.get(dayKey(year, month, d)) ?? 0;
  }

  const CELL_W = 38;
  const CELL_H = 32;

  return (
    <div style={{ flexShrink: 0, width: CELL_W * 7 + 12 /* borderSpacing × 6 */ }}>
      {/* Header: month name + total */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: '0.35rem',
        }}
      >
        <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--tc-text)' }}>
          {MONTH_NAMES[month].slice(0, 3)} {year}
        </span>
        {monthTotal !== 0 && (
          <span
            style={{
              fontSize: '0.62rem',
              fontWeight: 700,
              color: monthTotal >= 0 ? 'var(--tc-green)' : 'var(--tc-red)',
            }}
          >
            {monthTotal >= 0 ? '+' : ''}
            {monthTotal.toFixed(0)}
          </span>
        )}
      </div>

      {/* Grid */}
      <table style={{ borderCollapse: 'separate', borderSpacing: '2px' }}>
        <thead>
          <tr>
            {WEEK_DAYS.map((d) => (
              <th
                key={d}
                style={{
                  width: CELL_W,
                  fontSize: '0.55rem',
                  fontWeight: 600,
                  color: 'var(--tc-muted)',
                  textAlign: 'center',
                  padding: '0 0 3px',
                }}
              >
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
                  return <td key={di} style={{ width: CELL_W, height: CELL_H }} />;
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
                    style={{
                      width: CELL_W,
                      height: CELL_H,
                      background: cellBg(pnl, maxAbs),
                      borderRadius: 3,
                      verticalAlign: 'middle',
                      cursor: 'default',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: '100%',
                        gap: 1,
                      }}
                    >
                      <span
                        style={{
                          fontSize: '0.5rem',
                          lineHeight: 1,
                          color: hasTrade
                            ? pnl! >= 0
                              ? 'rgba(34,197,94,0.65)'
                              : 'rgba(239,68,68,0.65)'
                            : 'var(--tc-muted)',
                        }}
                      >
                        {day}
                      </span>
                      {hasTrade && (
                        <span
                          style={{
                            fontSize: '0.52rem',
                            fontWeight: 700,
                            lineHeight: 1,
                            color:
                              pnl! >= 0
                                ? 'rgba(34,197,94,0.95)'
                                : 'rgba(239,68,68,0.95)',
                          }}
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
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function PnlCalendar({ trades }: { trades: Trade[] }) {
  const dailyMap = buildDailyMap(trades);
  const months = getMonthRange(trades);

  if (!months.length) return null;

  let maxAbs = 0;
  dailyMap.forEach((pnl) => { if (Math.abs(pnl) > maxAbs) maxAbs = Math.abs(pnl); });

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '1.25rem 1.5rem',
        maxHeight: 420,
        overflowY: 'auto',
        paddingBottom: 2,
      }}
    >
      {months.map(({ year, month }) => (
        <MonthGrid
          key={`${year}-${month}`}
          year={year}
          month={month}
          dailyMap={dailyMap}
          maxAbs={maxAbs}
        />
      ))}
    </div>
  );
}
