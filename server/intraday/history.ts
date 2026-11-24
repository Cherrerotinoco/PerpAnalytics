import { query } from '../db/index.js';

/**
 * The global intraday pull sequence.
 *
 * It used to live in each visitor's localStorage, which made the Rule 7 sequence
 * and the capitulation checklist depend on when that person happened to open the
 * page. Now the SSR refresh writes one row every ~15 minutes, so the series is
 * continuous and shared — a much better input for both.
 *
 * The record shape mirrors `HistoryRecord` in app/src/utils/intraday/types.ts.
 * It is restated here rather than imported because server/tsconfig.json pins
 * `rootDir` to this directory: pulling a type in from app/src would drag the
 * whole app into the server build. The two must be kept in step by hand; the
 * mapping in `rowToRecord` is the single place that would break.
 */
export interface PullRecord {
  t: string;
  price: number | null;
  cvdSpot: number | null;
  cvdPerp: number | null;
  gammaRegime: string | null;
  netGammaM: number | null;
}

/** Pulls kept. Mirrors the 6 the CLI reads, with headroom for the chart. */
export const MAX_HISTORY = 12;

interface PullRow {
  generated_at: string | Date;
  price: number | null;
  cvd_spot: number | null;
  cvd_perp: number | null;
  gamma_regime: string | null;
  net_gamma_m: number | null;
}

const asNumber = (v: unknown): number | null => {
  // The HTTP driver can hand back a numeric column as a string.
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

const rowToRecord = (row: PullRow): PullRecord => ({
  t: row.generated_at instanceof Date ? row.generated_at.toISOString() : String(row.generated_at),
  price: asNumber(row.price),
  cvdSpot: asNumber(row.cvd_spot),
  cvdPerp: asNumber(row.cvd_perp),
  gammaRegime: row.gamma_regime,
  netGammaM: asNumber(row.net_gamma_m),
});

/** The last `MAX_HISTORY` pulls, oldest first (the order the analysis expects). */
export const loadHistory = async (limit: number = MAX_HISTORY): Promise<PullRecord[]> => {
  const rows = await query<PullRow>(
    `select generated_at, price, cvd_spot, cvd_perp, gamma_regime, net_gamma_m
       from intraday_pull
      order by generated_at desc
      limit $1`,
    [limit]
  );
  return rows.map(rowToRecord).reverse();
};

/** Two pulls are the same reading when price and both CVDs are unchanged. */
const isDuplicate = (a: PullRecord, b: PullRecord): boolean =>
  a.price === b.price && a.cvdSpot === b.cvdSpot && a.cvdPerp === b.cvdPerp;

/**
 * Appends a pull unless it repeats the previous one — Binance can serve a cached
 * candle between refreshes, and a duplicate would fake a flat sequence, which is
 * exactly what Rule 7 reads. Same rule as the browser version it replaces.
 *
 * Returns the resulting history so the caller does not re-query.
 */
export const appendRecord = async (
  history: PullRecord[],
  record: PullRecord
): Promise<{ history: PullRecord[]; deduped: boolean }> => {
  const last = history[history.length - 1];
  if (last && isDuplicate(last, record)) return { history, deduped: true };

  await query(
    `insert into intraday_pull (generated_at, price, cvd_spot, cvd_perp, gamma_regime, net_gamma_m)
     values ($1, $2, $3, $4, $5, $6)`,
    [record.t, record.price, record.cvdSpot, record.cvdPerp, record.gammaRegime, record.netGammaM]
  );
  return { history: [...history, record].slice(-MAX_HISTORY), deduped: false };
};
