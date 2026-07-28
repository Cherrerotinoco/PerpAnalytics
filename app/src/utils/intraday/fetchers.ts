import { midnightUtcMs } from './analyze';
import { readCache, readExpiredCache, writeCache } from './cache';

// Exact API URLs. Do NOT change the query params.
//
// Whale Alert (the CLI crawler's main source) is deliberately absent: it answers
// `access-control-allow-origin: https://whale-alert.io`, so the browser blocks it.
// Whale flows, realized/potential profit, HODL and news therefore live only in the
// `bitcoinAnalizer` CLI, not here.

export const GAMMA_URL = 'https://cryptogamma.io/api/public/snapshot/?asset=BTC';

// Spot session CVD (Binance). 5m candles instead of raw trades: each kline already
// carries the taker-buy volume (buy aggressor) broken out, so the per-candle delta
// is reconstructed without downloading millions of trades.
export const BINANCE_KLINES_BASE =
  'https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=5m';

// Perpetual futures CVD (Binance USDT-M, BTCUSDT). Same kline shape as spot
// (takerBuyBase at index 9), so the same parser is reused. Reading spot and perp
// together shows divergences between leverage (perp) and cash (spot).
export const BINANCE_FAPI_KLINES_BASE =
  'https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=5m';

const TIMEOUT_MS = 12_000;

export type FetchResult =
  | { ok: true; data: unknown; stale?: string }
  | { ok: false; error: string };

/** `force` skips the 15 min cache and always goes to the network. */
export interface FetchOpts {
  force?: boolean;
}

// Requests currently on the wire, keyed by URL. Concurrent callers for the same
// URL share one response instead of stampeding the API — which happens on every
// mount under React StrictMode, and would otherwise let two pulls read candle data
// microseconds apart and store them as two distinct history records.
const inFlight = new Map<string, Promise<FetchResult>>();

const fetchJson = (
  url: string,
  name: string,
  { force = false }: FetchOpts = {}
): Promise<FetchResult> => {
  if (!force) {
    const cached = readCache(url);
    if (cached) return Promise.resolve({ ok: true, data: cached.data });
  }
  const pending = inFlight.get(url);
  if (pending) return pending;

  const promise = requestJson(url, name).finally(() => inFlight.delete(url));
  inFlight.set(url, promise);
  return promise;
};

const requestJson = async (url: string, name: string): Promise<FetchResult> => {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: unknown = await res.json();
    writeCache(url, data);
    return { ok: true, data };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    // An expired entry beats an empty panel when the API is down or rate-limiting,
    // but the caller must say so rather than pass it off as a live reading.
    const expired = readExpiredCache(url);
    if (expired) {
      const mins = Math.round((Date.now() - expired.cachedAt) / 60_000);
      return {
        ok: true,
        data: expired.data,
        stale: `${name}: failed (${reason}), showing the last reading from ${mins} min ago.`,
      };
    }
    return { ok: false, error: `${name}: ${reason}` };
  }
};

/**
 * Session CVD: 5m candles since today's 00:00 UTC. `startTime` pins the start of
 * the day; 288 candles/day fit comfortably in limit=1000, so a SINGLE call covers
 * the whole session.
 */
export const fetchCvd = (now: Date = new Date(), opts: FetchOpts = {}): Promise<FetchResult> =>
  fetchJson(
    `${BINANCE_KLINES_BASE}&startTime=${midnightUtcMs(now)}&limit=1000`,
    'Spot CVD (Binance klines 5m)',
    opts
  );

/** Same as fetchCvd but against the USDT-M perpetual. */
export const fetchCvdFutures = (
  now: Date = new Date(),
  opts: FetchOpts = {}
): Promise<FetchResult> =>
  fetchJson(
    `${BINANCE_FAPI_KLINES_BASE}&startTime=${midnightUtcMs(now)}&limit=1000`,
    'Perp CVD (Binance fapi klines 5m)',
    opts
  );

/**
 * Previous-day CVD: 1d candles. Each candle already carries the whole day's
 * takerBuyBase, so ONE call yields several days of net aggressor delta. `limit`
 * candles are requested (including the partial in-progress day, dropped later).
 */
const fetchCvdDaily = (
  base: string,
  name: string,
  limit: number,
  opts: FetchOpts
): Promise<FetchResult> =>
  fetchJson(`${base.replace('interval=5m', 'interval=1d')}&limit=${limit}`, name, opts);

export const fetchCvdDailySpot = (limit = 8, opts: FetchOpts = {}): Promise<FetchResult> =>
  fetchCvdDaily(BINANCE_KLINES_BASE, 'Daily spot CVD (Binance klines 1d)', limit, opts);

export const fetchCvdDailyFutures = (limit = 8, opts: FetchOpts = {}): Promise<FetchResult> =>
  fetchCvdDaily(BINANCE_FAPI_KLINES_BASE, 'Daily perp CVD (Binance fapi klines 1d)', limit, opts);

export const fetchGamma = (opts: FetchOpts = {}): Promise<FetchResult> =>
  fetchJson(GAMMA_URL, 'Gamma Exposure', opts);

/** URLs a single pull touches — used to report how stale the cached data is. */
export const pullUrls = (now: Date = new Date()): string[] => [
  GAMMA_URL,
  `${BINANCE_KLINES_BASE}&startTime=${midnightUtcMs(now)}&limit=1000`,
  `${BINANCE_FAPI_KLINES_BASE}&startTime=${midnightUtcMs(now)}&limit=1000`,
  `${BINANCE_KLINES_BASE.replace('interval=5m', 'interval=1d')}&limit=8`,
  `${BINANCE_FAPI_KLINES_BASE.replace('interval=5m', 'interval=1d')}&limit=8`,
];
