import { midnightUtcMs } from './analyze';
import { readCache, readExpiredCache, writeCache } from './cache';

// Exact API URLs. Do NOT change the query params.
//
// Whale Alert (the CLI crawler's main source) is deliberately absent: it answers
// `access-control-allow-origin: https://whale-alert.io`, so the browser blocks it.
// Whale flows, realized/potential profit, HODL and news therefore live only in the
// `bitcoinAnalizer` CLI, not here.

// Gamma exposure: the RAW options chain (deribit + okx + bybit + binance) served by
// basischarts. It returns no aggregated metrics — netGamma, levels and the rest are
// computed in gex.ts from the ~3,000 quotes. No token, unlike the cryptogamma
// snapshot it replaces.
//
// This is the ONLY intraday source that does not go straight to its upstream: the
// basischarts host sends no `Access-Control-Allow-Origin` header (same situation as
// Whale Alert above), so the browser blocks reading the response even though the
// request itself succeeds. The server relays it same-origin — see /api/options/btc in
// server/index.ts — and the GEX is still aggregated here in the browser.
export const GAMMA_URL = '/api/options/btc';

// Spot session CVD (Binance). 5m candles instead of raw trades: each kline already
// carries the taker-buy volume (buy aggressor) broken out, so the per-candle delta
// is reconstructed without downloading millions of trades.
//
// The host is the market-data mirror, NOT api.binance.com: the spot API restricts US
// IPs, and the server renders from a US region, so every server pull came back 418 and
// the whole spot side of the report — session CVD, the divergence, the daily table —
// silently read "no data" in production while the perp side worked. fapi (below) is not
// restricted the same way and still points at the main host. The mirror serves the same
// path with a byte-identical payload and needs no key; it carries market data only, so
// it cannot absorb fapi too.
export const BINANCE_KLINES_BASE =
  'https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=5m';

// Perpetual futures CVD (Binance USDT-M, BTCUSDT). Same kline shape as spot
// (takerBuyBase at index 9), so the same parser is reused. Reading spot and perp
// together shows divergences between leverage (perp) and cash (spot).
export const BINANCE_FAPI_KLINES_BASE =
  'https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=5m';

const TIMEOUT_MS = 12_000;

// The full options chain weighs ~1.3 MB, far more than the aggregated snapshot the
// previous endpoint served: it gets its own headroom over the default timeout.
const GAMMA_TIMEOUT_MS = 30_000;

export type FetchResult =
  | { ok: true; data: unknown; stale?: string }
  | { ok: false; error: string };

/** `force` skips the 15 min cache and always goes to the network. */
export interface FetchOpts {
  force?: boolean;
  /** Per-request override, for responses too large for the default budget. */
  timeoutMs?: number;
}

// Requests currently on the wire, keyed by URL. Concurrent callers for the same
// URL share one response instead of stampeding the API — which happens on every
// mount under React StrictMode, and would otherwise let two pulls read candle data
// microseconds apart and store them as two distinct history records.
const inFlight = new Map<string, Promise<FetchResult>>();

const fetchJson = (
  url: string,
  name: string,
  { force = false, timeoutMs = TIMEOUT_MS }: FetchOpts = {}
): Promise<FetchResult> => {
  if (!force) {
    const cached = readCache(url);
    if (cached) return Promise.resolve({ ok: true, data: cached.data });
  }
  const pending = inFlight.get(url);
  if (pending) return pending;

  const promise = requestJson(url, name, timeoutMs).finally(() => inFlight.delete(url));
  inFlight.set(url, promise);
  return promise;
};

const requestJson = async (url: string, name: string, timeoutMs: number): Promise<FetchResult> => {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
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
  fetchJson(GAMMA_URL, 'Gamma Exposure', { timeoutMs: GAMMA_TIMEOUT_MS, ...opts });

/** URLs a single pull touches — used to report how stale the cached data is. */
export const pullUrls = (now: Date = new Date()): string[] => [
  GAMMA_URL,
  `${BINANCE_KLINES_BASE}&startTime=${midnightUtcMs(now)}&limit=1000`,
  `${BINANCE_FAPI_KLINES_BASE}&startTime=${midnightUtcMs(now)}&limit=1000`,
  `${BINANCE_KLINES_BASE.replace('interval=5m', 'interval=1d')}&limit=8`,
  `${BINANCE_FAPI_KLINES_BASE.replace('interval=5m', 'interval=1d')}&limit=8`,
];
