import { Trade } from '../types/tradeTypes';

// ─── Constants ────────────────────────────────────────────────────────────────
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtCell(v: number): string {
  const abs = Math.abs(v);
  const prefix = v >= 0 ? '+' : '';
  if (abs >= 1000) return `${prefix}${(v / 1000).toFixed(1)}k`;
  return `${prefix}${v.toFixed(0)}`;
}

function buildMonthlyData(trades: Trade[]) {
  const data = new Map<number, Map<number, number>>(); // year → month → pnl

  for (const t of trades) {
    const d = t.closed ?? t.opened;
    if (!d) continue;
    const year = d.getFullYear();
    const month = d.getMonth(); // 0–11
    if (!data.has(year)) data.set(year, new Map());
    const ym = data.get(year)!;
    ym.set(month, (ym.get(month) ?? 0) + t.pnl);
  }

  return data;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function MonthlyHeatmap({ trades }: { trades: Trade[] }) {
  const data = buildMonthlyData(trades);
  if (!data.size) return null;

  const years = [...data.keys()].sort();

  // Max absolute PnL for opacity scaling
  let maxAbs = 0;
  data.forEach((ym) => ym.forEach((pnl) => { if (Math.abs(pnl) > maxAbs) maxAbs = Math.abs(pnl); }));

  const cellBg = (pnl: number | undefined): string => {
    if (pnl === undefined) return 'transparent';
    if (pnl === 0) return 'var(--tc-surface-2)';
    const opacity = Math.min(0.85, 0.12 + 0.73 * (Math.abs(pnl) / (maxAbs || 1)));
    return pnl > 0
      ? `rgba(34,197,94,${opacity.toFixed(2)})`
      : `rgba(239,68,68,${opacity.toFixed(2)})`;
  };

  const cellTextColor = (pnl: number | undefined): string => {
    if (pnl === undefined || pnl === 0) return 'var(--tc-muted)';
    return pnl > 0 ? 'rgba(34,197,94,0.95)' : 'rgba(239,68,68,0.95)';
  };

  return (
    <div style={{ overflowX: 'auto' }}>
      <table
        style={{
          borderCollapse: 'separate',
          borderSpacing: '3px',
          width: '100%',
          tableLayout: 'auto',
        }}
      >
        <thead>
          <tr>
            {/* year column */}
            <th style={{ width: 36 }} />
            {MONTHS.map((m) => (
              <th
                key={m}
                style={{
                  fontSize: '0.6rem',
                  fontWeight: 600,
                  color: 'var(--tc-muted)',
                  textAlign: 'center',
                  padding: '0 2px 5px',
                  whiteSpace: 'nowrap',
                }}
              >
                {m}
              </th>
            ))}
            {/* total column */}
            <th
              style={{
                fontSize: '0.6rem',
                fontWeight: 600,
                color: 'var(--tc-muted)',
                textAlign: 'right',
                paddingLeft: 8,
                paddingBottom: 5,
              }}
            >
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {years.map((year) => {
            const ym = data.get(year)!;
            const yearTotal = [...ym.values()].reduce((a, b) => a + b, 0);

            return (
              <tr key={year}>
                {/* year label */}
                <td
                  style={{
                    fontSize: '0.6rem',
                    fontWeight: 600,
                    color: 'var(--tc-muted)',
                    textAlign: 'right',
                    paddingRight: 6,
                    whiteSpace: 'nowrap',
                    paddingBottom: 3,
                  }}
                >
                  {year}
                </td>

                {Array.from({ length: 12 }, (_, m) => {
                  const pnl = ym.get(m);
                  return (
                    <td
                      key={m}
                      title={
                        pnl !== undefined
                          ? `${MONTHS[m]} ${year}: ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} $`
                          : undefined
                      }
                      style={{
                        background: cellBg(pnl),
                        borderRadius: 3,
                        textAlign: 'center',
                        fontSize: '0.58rem',
                        fontWeight: 700,
                        color: cellTextColor(pnl),
                        padding: '4px 2px',
                        minWidth: 34,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {pnl !== undefined ? fmtCell(pnl) : ''}
                    </td>
                  );
                })}

                {/* year total */}
                <td
                  style={{
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    paddingLeft: 10,
                    color: yearTotal >= 0 ? 'var(--tc-green)' : 'var(--tc-red)',
                    whiteSpace: 'nowrap',
                    textAlign: 'right',
                  }}
                >
                  {yearTotal >= 0 ? '+' : ''}
                  {yearTotal.toFixed(0)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
