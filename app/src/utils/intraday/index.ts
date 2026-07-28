import {
  analyzeCvd,
  analyzeGamma,
  assessCapitulation,
  midnightUtcMs,
  summarizeDailyCvd,
} from './analyze';
import { oldestCacheAge } from './cache';
import {
  fetchCvd,
  fetchCvdDailyFutures,
  fetchCvdDailySpot,
  fetchCvdFutures,
  fetchGamma,
  pullUrls,
} from './fetchers';
import { appendRecord, buildRecord, loadHistory } from './history';
import { parseCvd, parseGamma } from './parse';
import type { IntradaySnapshot } from './types';

export * from './types';
export { CACHE_TTL_MS, clearCache } from './cache';
export { clearHistory, loadHistory } from './history';
export { buildIntradayReport } from './report';

/**
 * One full pull of the intraday pipeline, browser edition. Every source is fetched
 * in parallel and each one degrades on its own: a failing API adds a line to
 * `errors` and leaves its section empty rather than sinking the whole report.
 *
 * Responses are served from a 15 min cache (see cache.ts) unless `force` is set,
 * which is what the manual "Actualizar" button uses.
 */
export const runIntraday = async (
  now: Date = new Date(),
  { force = false }: { force?: boolean } = {}
): Promise<IntradaySnapshot> => {
  const generatedAt = now.toISOString();
  const errors: string[] = [];
  const opts = { force };

  const [gammaRes, cvdRes, cvdPerpRes, cvdDailySpotRes, cvdDailyPerpRes] = await Promise.all([
    fetchGamma(opts),
    fetchCvd(now, opts),
    fetchCvdFutures(now, opts),
    fetchCvdDailySpot(8, opts),
    fetchCvdDailyFutures(8, opts),
  ]);

  // Sources that fell back to an expired entry announce themselves, so the page
  // never presents a stale reading as a live one.
  for (const res of [gammaRes, cvdRes, cvdPerpRes, cvdDailySpotRes, cvdDailyPerpRes]) {
    if (res.ok && res.stale) errors.push(res.stale);
  }

  const gamma = gammaRes.ok ? parseGamma(gammaRes.data) : null;
  if (!gammaRes.ok) {
    errors.push(`Gamma Exposure unavailable (${gammaRes.error})`);
  } else if (gamma && !gamma.ok) {
    errors.push('Gamma Exposure unavailable (degraded snapshot: metrics are zeroed)');
  }
  const gammaRegime = analyzeGamma(gamma);

  const cvdFlows = cvdRes.ok ? analyzeCvd(parseCvd(cvdRes.data)) : null;
  if (!cvdRes.ok) errors.push(`Spot CVD unavailable (${cvdRes.error})`);

  const cvdPerpFlows = cvdPerpRes.ok ? analyzeCvd(parseCvd(cvdPerpRes.data)) : null;
  if (!cvdPerpRes.ok) errors.push(`Perp CVD unavailable (${cvdPerpRes.error})`);

  // Previous-day CVD (1d candles). Drops the in-progress day (partial) using today's
  // UTC midnight as the cut, leaving the last 5 complete sessions.
  const todayMidnight = midnightUtcMs(now);
  const cvdDaily = {
    spot: cvdDailySpotRes.ok
      ? summarizeDailyCvd(parseCvd(cvdDailySpotRes.data), { days: 5, beforeMs: todayMidnight })
      : null,
    perp: cvdDailyPerpRes.ok
      ? summarizeDailyCvd(parseCvd(cvdDailyPerpRes.data), { days: 5, beforeMs: todayMidnight })
      : null,
  };

  // The capitulation checklist reads the sequence *including* this pull, so persist
  // before assessing (the CLI does the same with a stand-in record).
  const record = buildRecord({ generatedAt, cvdFlows, cvdPerpFlows, gamma, gammaRegime });
  const { history, deduped } = appendRecord(loadHistory(), record);
  if (deduped) {
    errors.push('Data identical to the previous pull (likely cached): not appended to history.');
  }

  return {
    generatedAt,
    errors,
    gamma,
    gammaRegime,
    cvdFlows,
    cvdPerpFlows,
    cvdDaily,
    capitulation: assessCapitulation({ history, cvdFlows, cvdDaily }),
    history,
    cacheAgeMs: oldestCacheAge(pullUrls(now), now.getTime()),
  };
};
