import {
  analyzeCvd,
  analyzeFlows,
  analyzeGamma,
  analyzeSkew,
  analyzeVolLab,
  assessCapitulation,
  midnightUtcMs,
  summarizeDailyCvd,
} from './analyze';
import { appendRecord, buildRecord } from './history';
import { parseCvd, parseGamma, parseSkew, parseVolLab, parseWhaleAlert } from './parse';
import type { HistoryRecord, IntradaySnapshot } from './types';

/**
 * The intraday pull. Runs on the server, and only there.
 *
 * It used to have a browser twin in index.ts that powered the refresh button,
 * but that one could reach two of the five sources at best: Whale Alert and
 * basischarts send no CORS header, and the skew and Vol Lab need a token that
 * cannot ship to a client. The button now reads /api/intraday instead, so this
 * is the single pull and there is no second code path to drift from.
 *
 * It caches nothing of its own: the rendered page is cached around it (see
 * server/intraday/page.ts), and a second staleness clock underneath that one
 * would only make "how old is this" harder to answer.
 *
 * History is passed IN and the new record handed back out rather than persisted
 * here. Persistence belongs to the server (Postgres, server/intraday/history.ts)
 * and this module stays pure, so it can live in the SSR bundle without dragging
 * the database in.
 */

const GAMMA_UPSTREAM = 'https://www.basischarts.com/api/options?venue=all&underlying=BTC';

// Spot CVD (Binance, BTCUSDT, 5m). Each kline carries the taker-buy volume (buy
// aggressor) broken out, so the per-candle delta is reconstructed without
// downloading millions of trades.
//
// The host is the market-data mirror, NOT api.binance.com: the spot API restricts
// US IPs and this renders from a US region, so every pull came back 418 and the
// whole spot side of the report — session CVD, the divergence, the daily table —
// silently read "no data" in production while the perp side worked. The mirror
// serves the same path with a byte-identical payload and needs no key.
export const BINANCE_KLINES_BASE =
  'https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=5m';

// Perpetual futures CVD (Binance USDT-M, BTCUSDT). Same kline shape as spot
// (takerBuyBase at index 9), so the same parser is reused. fapi is not restricted
// the way the spot API is, so it still points at the main host. Reading spot and
// perp together is what shows leverage pulling against cash.
export const BINANCE_FAPI_KLINES_BASE =
  'https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=5m';

/**
 * Three sources that exist ONLY here, because all three are CORS-blocked and the
 * browser could never read them:
 *
 *   - Whale Alert answers `access-control-allow-origin: https://whale-alert.io`.
 *     It carries whale flows, realised/potential profit, volume and HODL — the
 *     heaviest-weighted signals in the model, which the page simply did not have.
 *   - cryptogamma's skew and vol-lab need a Bearer token, which cannot ship to a
 *     browser anyway. Without CRYPTOGAMMA_TOKEN they answer 401 and both blocks
 *     degrade on their own, exactly like any other failing source.
 *
 * The URLs and their query params are copied verbatim from the CLI crawler. Do
 * not edit the params.
 */
const WHALE_ALERT_UPSTREAM =
  'https://whale-alert.io/data.json?alerts=25&prices=BTC&hodl=bitcoin%2CBTC&potential_profit=bitcoin%2CBTC&average_buy_price=bitcoin%2CBTC&realized_profit=bitcoin%2CBTC&volume=bitcoin%2CBTC&news=true';
const SKEW_UPSTREAM = 'https://cryptogamma.io/api/public/skew/?asset=BTC';
const VOL_LAB_UPSTREAM = 'https://cryptogamma.io/api/public/vol-lab/?asset=BTC';

/** The chain is ~1.3 MB; everything else is small. One budget covers them all. */
const TIMEOUT_MS = 30_000;

type SourceResult = { ok: true; data: unknown } | { ok: false; error: string };

const getJson = async (
  url: string,
  name: string,
  headers?: Record<string, string>
): Promise<SourceResult> => {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers });
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
  cryptogammaToken = null,
}: {
  now?: Date;
  history: HistoryRecord[];
  /**
   * Passed in rather than read from `process.env` here: this module ships inside
   * the SSR bundle, and keeping it free of environment access is what lets the
   * same bundle be imported by the build-time prerender.
   */
  cryptogammaToken?: string | null;
}): Promise<ServerPullResult> => {
  const generatedAt = now.toISOString();
  const errors: string[] = [];
  const midnight = midnightUtcMs(now);
  const cgHeaders = cryptogammaToken ? { Authorization: `Bearer ${cryptogammaToken}` } : undefined;

  // Every source in parallel, and each degrades on its own: a failing API adds a
  // line to `errors` and leaves its section empty rather than sinking the page.
  const [
    whaleRes,
    gammaRes,
    skewRes,
    volLabRes,
    cvdRes,
    cvdPerpRes,
    cvdDailySpotRes,
    cvdDailyPerpRes,
  ] = await Promise.all([
    getJson(WHALE_ALERT_UPSTREAM, 'Whale Alert'),
    getJson(GAMMA_UPSTREAM, 'Gamma Exposure'),
    getJson(SKEW_UPSTREAM, '25-delta skew', cgHeaders),
    getJson(VOL_LAB_UPSTREAM, 'Vol Lab', cgHeaders),
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

  const whale = whaleRes.ok ? parseWhaleAlert(whaleRes.data) : null;
  if (!whaleRes.ok) errors.push(`Whale Alert unavailable (${whaleRes.error})`);
  const flows = whale ? analyzeFlows(whale.alerts) : null;

  const skew = skewRes.ok ? parseSkew(skewRes.data) : null;
  if (!skewRes.ok) {
    // 401 here almost always means CRYPTOGAMMA_TOKEN is missing or expired.
    errors.push(`25-delta skew unavailable (${skewRes.error})`);
  } else if (skew && !skew.ok) {
    errors.push('25-delta skew unavailable (degraded snapshot)');
  }
  const skewRead = analyzeSkew(skew);

  const volLab = volLabRes.ok ? parseVolLab(volLabRes.data) : null;
  if (!volLabRes.ok) {
    errors.push(`Vol Lab unavailable (${volLabRes.error})`);
  } else if (volLab && !volLab.ok) {
    errors.push('Vol Lab unavailable (degraded snapshot)');
  }
  const volLabRead = analyzeVolLab(volLab);

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
  const record = buildRecord({ generatedAt, cvdFlows, cvdPerpFlows, gamma, gammaRegime, whale });
  const { history: nextHistory, deduped } = appendRecord(history, record);
  if (deduped) {
    errors.push('Data identical to the previous pull (likely cached): not appended to history.');
  }

  return {
    snapshot: {
      generatedAt,
      errors,
      whale,
      flows,
      skew,
      skewRead,
      volLab,
      volLabRead,
      gamma,
      gammaRegime,
      cvdFlows,
      cvdPerpFlows,
      cvdDaily,
      // `flows` adds the fifth capitulation condition, which the browser-only
      // pull could never evaluate.
      capitulation: assessCapitulation({ history: nextHistory, cvdFlows, cvdDaily, flows }),
      history: nextHistory,
    },
    record,
    deduped,
  };
};
