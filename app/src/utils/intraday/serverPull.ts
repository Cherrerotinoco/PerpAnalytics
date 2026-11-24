import {
  analyzeCvd,
  analyzeGamma,
  assessCapitulation,
  midnightUtcMs,
  summarizeDailyCvd,
} from './analyze';
import { BINANCE_FAPI_KLINES_BASE, BINANCE_KLINES_BASE } from './fetchers';
import { appendRecord, buildRecord } from './history';
import { parseCvd, parseGamma } from './parse';
import type { HistoryRecord, IntradaySnapshot } from './types';

/**
 * One full pull of the intraday pipeline, SERVER edition.
 *
 * The browser version (index.ts) exists alongside it and still powers the manual
 * refresh button. The two differ in three ways, all of them forced by where they
 * run:
 *
 *   1. Gamma goes straight to its upstream. The browser has to route it through
 *      /api/options/btc because basischarts sends no CORS header; the server has
 *      no such problem, so the passthrough would only add a hop.
 *   2. No response cache. The browser caches each response for 15 min in
 *      localStorage; here the whole rendered page is cached instead, so caching
 *      the parts underneath it as well would only add a second staleness clock.
 *   3. History is passed IN and the new record handed back out, instead of being
 *      read from and written to localStorage. Persistence belongs to the server
 *      (Postgres, see server/intraday/history.ts) and this module stays pure, so
 *      it can live in the SSR bundle without dragging the database in.
 *
 * Everything else — parse, gex, analyze — is the exact same code path as the
 * browser, so the two cannot drift.
 */

/** No CORS constraint on this side, so the chain comes from its own host. */
const GAMMA_UPSTREAM = 'https://www.basischarts.com/api/options?venue=all&underlying=BTC';

/** The chain is ~1.3 MB; the klines are small. One budget covers both. */
const TIMEOUT_MS = 30_000;

type SourceResult = { ok: true; data: unknown } | { ok: false; error: string };

const getJson = async (url: string, name: string): Promise<SourceResult> => {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { ok: true, data: (await res.json()) as unknown };
  } catch (err) {
    return { ok: false, error: `${name}: ${err instanceof Error ? err.message : String(err)}` };
  }
};

export interface ServerPullResult {
  snapshot: IntradaySnapshot;
  /** The pull to persist — the caller skips it when `deduped`. */
  record: HistoryRecord;
  deduped: boolean;
}

export const runIntradayServer = async ({
  now = new Date(),
  history,
}: {
  now?: Date;
  history: HistoryRecord[];
}): Promise<ServerPullResult> => {
  const generatedAt = now.toISOString();
  const errors: string[] = [];
  const midnight = midnightUtcMs(now);

  // Every source in parallel, and each degrades on its own: a failing API adds a
  // line to `errors` and leaves its section empty rather than sinking the page.
  const [gammaRes, cvdRes, cvdPerpRes, cvdDailySpotRes, cvdDailyPerpRes] = await Promise.all([
    getJson(GAMMA_UPSTREAM, 'Gamma Exposure'),
    getJson(`${BINANCE_KLINES_BASE}&startTime=${midnight}&limit=1000`, 'Spot CVD'),
    getJson(`${BINANCE_FAPI_KLINES_BASE}&startTime=${midnight}&limit=1000`, 'Perp CVD'),
    getJson(
      `${BINANCE_KLINES_BASE.replace('interval=5m', 'interval=1d')}&limit=8`,
      'Daily spot CVD'
    ),
    getJson(
      `${BINANCE_FAPI_KLINES_BASE.replace('interval=5m', 'interval=1d')}&limit=8`,
      'Daily perp CVD'
    ),
  ]);

  const gamma = gammaRes.ok ? parseGamma(gammaRes.data) : null;
  if (!gammaRes.ok) {
    errors.push(`Gamma Exposure unavailable (${gammaRes.error})`);
  } else if (gamma && !gamma.ok) {
    errors.push('Gamma Exposure unavailable (degraded snapshot: no usable open interest)');
  }
  const gammaRegime = analyzeGamma(gamma);

  const cvdFlows = cvdRes.ok ? analyzeCvd(parseCvd(cvdRes.data)) : null;
  if (!cvdRes.ok) errors.push(`Spot CVD unavailable (${cvdRes.error})`);

  const cvdPerpFlows = cvdPerpRes.ok ? analyzeCvd(parseCvd(cvdPerpRes.data)) : null;
  if (!cvdPerpRes.ok) errors.push(`Perp CVD unavailable (${cvdPerpRes.error})`);

  const cvdDaily = {
    spot: cvdDailySpotRes.ok
      ? summarizeDailyCvd(parseCvd(cvdDailySpotRes.data), { days: 5, beforeMs: midnight })
      : null,
    perp: cvdDailyPerpRes.ok
      ? summarizeDailyCvd(parseCvd(cvdDailyPerpRes.data), { days: 5, beforeMs: midnight })
      : null,
  };

  // The capitulation checklist reads the sequence *including* this pull, so the
  // record is appended before assessing. `appendRecord` is the browser helper
  // reused for its dedupe rule only: its localStorage write is a no-op here.
  const record = buildRecord({ generatedAt, cvdFlows, cvdPerpFlows, gamma, gammaRegime });
  const { history: nextHistory, deduped } = appendRecord(history, record);
  if (deduped) {
    errors.push('Data identical to the previous pull (likely cached): not appended to history.');
  }

  return {
    snapshot: {
      generatedAt,
      errors,
      gamma,
      gammaRegime,
      cvdFlows,
      cvdPerpFlows,
      cvdDaily,
      capitulation: assessCapitulation({ history: nextHistory, cvdFlows, cvdDaily }),
      history: nextHistory,
      // Nothing underneath this pull is cached — the page above it is. How stale
      // the page itself is, is the server's to report.
      cacheAgeMs: null,
    },
    record,
    deduped,
  };
};
