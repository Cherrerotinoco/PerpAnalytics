import { describe, expect, it } from 'vitest';
import {
  analyzeCvd,
  analyzeGamma,
  assessCapitulation,
  midnightUtcMs,
  summarizeDailyCvd,
} from './analyze';
import { parseCvd } from './parse';
import type { FlowAnalysis, GammaSnapshot, HistoryRecord } from './types';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const FIVE_MIN = 5 * 60 * 1000;

/**
 * Builds a raw Binance kline. `buy` is the taker-buy base volume and `sell` the
 * rest, so deltaBtc = buy - sell.
 */
const kline = (openTime: number, close: number, buy: number, sell: number) => [
  openTime,
  '0',
  '0',
  '0',
  String(close),
  String(buy + sell), // [5] volume
  openTime + FIVE_MIN - 1,
  String((buy + sell) * close), // [7] quote volume
  10,
  String(buy), // [9] takerBuyBase
  String(buy * close), // [10] takerBuyQuote
  '0',
];

/** `n` candles starting at midnight, each with the given (close, buy, sell). */
const series = (bars: [close: number, buy: number, sell: number][], start = 0) =>
  bars.map(([c, b, s], i) => kline(start + i * FIVE_MIN, c, b, s));

// ─── midnightUtcMs ────────────────────────────────────────────────────────────
describe('midnightUtcMs', () => {
  it('truncates to 00:00 UTC of the same day', () => {
    const ms = midnightUtcMs(new Date('2026-07-28T17:43:12.500Z'));
    expect(new Date(ms).toISOString()).toBe('2026-07-28T00:00:00.000Z');
  });
});

// ─── parseCvd ─────────────────────────────────────────────────────────────────
describe('parseCvd', () => {
  it('derives the aggressor delta from takerBuyBase', () => {
    const { ok, buckets } = parseCvd(series([[100, 70, 30]]));
    expect(ok).toBe(true);
    expect(buckets[0].buyBtc).toBe(70);
    expect(buckets[0].sellBtc).toBe(30);
    expect(buckets[0].deltaBtc).toBe(40);
  });

  it('reports not-ok for a non-array payload', () => {
    expect(parseCvd({ code: -1121 }).ok).toBe(false);
    expect(parseCvd(null).ok).toBe(false);
  });

  it('skips malformed candles instead of failing the whole pull', () => {
    const { buckets } = parseCvd([kline(0, 100, 70, 30), 'nonsense', [1, 2]]);
    expect(buckets).toHaveLength(1);
  });
});

// ─── analyzeCvd ───────────────────────────────────────────────────────────────
describe('analyzeCvd', () => {
  it('returns null when there are no candles', () => {
    expect(analyzeCvd(parseCvd([]))).toBeNull();
    expect(analyzeCvd(null)).toBeNull();
  });

  it('sums the session delta and flags a buying session', () => {
    // ratio = 120 / 400 = 0.30 → well over the 0.05 threshold
    const cvd = analyzeCvd(
      parseCvd(
        series([
          [100, 80, 20],
          [101, 80, 20],
          [102, 100, 100],
        ])
      )
    )!;
    expect(cvd.totalCvd).toBe(120);
    expect(cvd.buyBtc).toBe(260);
    expect(cvd.sellBtc).toBe(140);
    expect(cvd.signal).toBe('BULLISH');
  });

  it('stays NEUTRAL when net aggression is under the 5% threshold', () => {
    const cvd = analyzeCvd(
      parseCvd(
        series([
          [100, 51, 49],
          [100, 51, 49],
        ])
      )
    )!;
    expect(cvd.signal).toBe('NEUTRAL');
  });

  it('tracks the min/max of the cumulative excursion, not just the endpoints', () => {
    const cvd = analyzeCvd(
      parseCvd(
        series([
          [100, 10, 60], // cvd = -50
          [100, 60, 10], // cvd = 0
          [100, 60, 10], // cvd = +50
        ])
      )
    )!;
    expect(cvd.minCvd).toBe(-50);
    expect(cvd.maxCvd).toBe(50);
    expect(cvd.totalCvd).toBe(50);
  });

  it('marks a bullish divergence when price falls but CVD rises', () => {
    const cvd = analyzeCvd(
      parseCvd(
        series([
          [110, 80, 20],
          [100, 80, 20],
        ])
      )
    )!;
    expect(cvd.divergence).toBe('BULLISH');
  });

  it('marks a bearish divergence when price rises but CVD falls', () => {
    const cvd = analyzeCvd(
      parseCvd(
        series([
          [100, 20, 80],
          [110, 20, 80],
        ])
      )
    )!;
    expect(cvd.divergence).toBe('BEARISH');
  });

  it('confirms when price and CVD move together', () => {
    const cvd = analyzeCvd(
      parseCvd(
        series([
          [100, 80, 20],
          [110, 80, 20],
        ])
      )
    )!;
    expect(cvd.divergence).toBe('CONFIRMS');
  });

  it('classifies strong buying without price follow-through as absorbed', () => {
    // 12 flat-price candles → the whole 1H window is buy-aggressive but price
    // does not move, so it is distribution rather than a real bid.
    const cvd = analyzeCvd(
      parseCvd(series(Array.from({ length: 12 }, () => [100, 90, 10] as [number, number, number])))
    )!;
    expect(cvd.timeframes.h1.flow?.kind).toBe('ABSORBED_BUYING');
  });

  it('classifies buying with price follow-through as healthy aggression', () => {
    const cvd = analyzeCvd(
      parseCvd(
        series(Array.from({ length: 12 }, (_, i) => [100 + i, 90, 10] as [number, number, number]))
      )
    )!;
    expect(cvd.timeframes.h1.flow?.kind).toBe('BULLISH_AGGRESSION');
  });

  it('aligns timeframe windows to the Binance clock, not to a rolling window', () => {
    // Candles spanning 00:00 → 01:15 UTC. The current 1H candle opened at 01:00,
    // so only the 01:00 and 01:05 bars belong to it.
    const start = Date.parse('2026-07-28T00:00:00Z');
    const bars: [number, number, number][] = Array.from({ length: 14 }, () => [100, 60, 10]);
    const cvd = analyzeCvd(parseCvd(series(bars, start)))!;
    expect(cvd.timeframes.h1.boundary).toBe(Date.parse('2026-07-28T01:00:00Z'));
    expect(cvd.timeframes.h1.bars).toBe(2);
    expect(cvd.timeframes.h4.bars).toBe(14); // 4H candle opened at 00:00
  });
});

// ─── summarizeDailyCvd ────────────────────────────────────────────────────────
describe('summarizeDailyCvd', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const today = Date.parse('2026-07-28T00:00:00Z');

  it('drops the in-progress day and keeps the last N complete ones', () => {
    const daily = [
      kline(today - 3 * DAY, 100, 60, 40),
      kline(today - 2 * DAY, 100, 30, 70),
      kline(today - DAY, 100, 80, 20),
      kline(today, 100, 55, 45), // partial, must be dropped
    ];
    const out = summarizeDailyCvd(parseCvd(daily), { days: 2, beforeMs: today })!;
    expect(out).toHaveLength(2);
    expect(out.map((d) => d.delta)).toEqual([-40, 60]);
    expect(out[out.length - 1].dayMs).toBe(today - DAY);
  });

  it('returns null when there is nothing to summarise', () => {
    expect(summarizeDailyCvd(parseCvd([]), {})).toBeNull();
    expect(summarizeDailyCvd(null, {})).toBeNull();
  });
});

// ─── analyzeGamma ─────────────────────────────────────────────────────────────
// The chain → metrics side is covered in gex.test.ts; this only covers the regime
// read on top of a snapshot.
describe('analyzeGamma', () => {
  const snapshot = (over: Partial<GammaSnapshot> = {}): GammaSnapshot => ({
    ok: true,
    asset: 'BTC',
    source: 'all',
    generatedAt: '2026-07-28T10:00:00.000Z',
    netGamma: -100,
    callGamma: 50,
    putGamma: -150,
    bias: 'BEARISH',
    gammaAbovePct: 40,
    putCallRatio: 1.2,
    callWeighted: 25,
    currentPrice: 60000,
    support: 55000,
    resistance: 65000,
    breakout: 62000,
    realizedVol: null,
    impliedVol: null,
    volPremium: null,
    callFlow: 10,
    putFlow: 20,
    flowCpRatio: 0.5,
    deltaHedging: null,
    squeezeRisk: null,
    pinRisk: 'Low (near $65,000)',
    pinLevel: 65000,
    pinShare: 0.4,
    contractsUsed: 3,
    contractsSkipped: 0,
    venuesDown: [],
    partial: false,
    venues: ['deribit'],
    gammaByVenue: { deribit: -100 },
    gammaByExpiry: [],
    ...over,
  });

  it('returns null without a usable snapshot', () => {
    expect(analyzeGamma(null)).toBeNull();
    expect(analyzeGamma({ ok: false })).toBeNull();
  });

  it('reads negative net gamma as amplified volatility', () => {
    expect(analyzeGamma(snapshot())!.regime).toBe('AMPLIFIED_VOL');
  });

  it('reads positive net gamma as mean reversion', () => {
    expect(analyzeGamma(snapshot({ netGamma: 250 }))!.regime).toBe('MEAN_REVERSION');
  });

  // The pin needs BOTH conditions: within 0.5% of spot and ≥12% of total gamma.
  it('detects a pin only when it sits on spot and concentrates gamma', () => {
    const g = analyzeGamma(snapshot({ pinLevel: 60100, pinShare: 0.3 }))!;
    expect(g.isPin).toBe(true);
    expect(g.pinLevel).toBe(60100);
  });

  it('does not call a distant dominant strike a pin', () => {
    const g = analyzeGamma(snapshot({ pinLevel: 65000, pinShare: 0.9 }))!;
    expect(g.isPin).toBe(false);
    expect(g.pinLevel).toBeNull();
  });

  it('does not call a near but thin strike a pin', () => {
    expect(analyzeGamma(snapshot({ pinLevel: 60100, pinShare: 0.05 }))!.isPin).toBe(false);
  });

  it('flags realized vol above implied', () => {
    const g = analyzeGamma(snapshot({ realizedVol: 60, impliedVol: 45, volPremium: -15 }))!;
    expect(g.realizedGtImplied).toBe(true);
    expect(g.volPremiumNegative).toBe(true);
  });

  // Tri-state: a missing input must not read as the negative interpretation.
  it('leaves flags null when the input is missing', () => {
    const g = analyzeGamma(snapshot({ putCallRatio: null }))!;
    expect(g.defensive).toBeNull();
    expect(g.realizedGtImplied).toBeNull();
    expect(g.volPremiumNegative).toBeNull();
  });
});

// ─── assessCapitulation ───────────────────────────────────────────────────────
describe('assessCapitulation', () => {
  // Check 1 is Rule 7 and reads the `realized` sequence, which is the figure the
  // rule is actually defined on. It became readable once the pull moved
  // server-side and could reach Whale Alert; before that it stood in with CVD.
  const rec = (realized: number | null): HistoryRecord => ({
    t: '2026-07-28T10:00:00.000Z',
    price: 100,
    cvdSpot: null,
    cvdPerp: null,
    gammaRegime: null,
    netGammaM: null,
    realized,
    potential: null,
  });

  it('leaves checks unevaluated (null) when the data is missing', () => {
    const cap = assessCapitulation({});
    expect(cap.total).toBe(0);
    expect(cap.met).toBe(0);
    expect(cap.checks.every((c) => c.met === null)).toBe(true);
    expect(cap.verdict).toContain('NO CLEAR SIGNS');
  });

  it('needs 3 pulls before it can read the realised sequence', () => {
    const two = assessCapitulation({ history: [rec(-100e6), rec(-50e6)] });
    expect(two.checks[0].met).toBeNull();

    const three = assessCapitulation({ history: [rec(-100e6), rec(-50e6), rec(-10e6)] });
    expect(three.checks[0].met).toBe(true);
  });

  it('does not count a non-monotonic realised sequence as recovering', () => {
    const cap = assessCapitulation({ history: [rec(-100e6), rec(-10e6), rec(-50e6)] });
    expect(cap.checks[0].met).toBe(false);
  });

  // Records written before Whale Alert was reachable carry no realised figure, so
  // Rule 7 has to report that rather than silently passing or failing.
  it('cannot evaluate Rule 7 on records with no realised profit', () => {
    const cap = assessCapitulation({ history: [rec(null), rec(null), rec(null)] });
    expect(cap.checks[0].met).toBeNull();
    expect(cap.checks[0].detail).toContain('not enough history');
  });

  it('counts net whale flow as buying only when the net is positive', () => {
    const flowsWith = (netBtc: number) => ({ netBtc }) as unknown as FlowAnalysis;
    expect(assessCapitulation({ flows: flowsWith(5917) }).checks[4].met).toBe(true);
    expect(assessCapitulation({ flows: flowsWith(-2000) }).checks[4].met).toBe(false);
    // Absent on a browser pull: Whale Alert is CORS-blocked there.
    expect(assessCapitulation({}).checks[4].met).toBeNull();
  });

  it('counts the session CVD as off its low only when above the excursion floor', () => {
    const falling = analyzeCvd(
      parseCvd(
        series([
          [100, 10, 60],
          [100, 10, 60],
        ])
      )
    )!;
    expect(assessCapitulation({ cvdFlows: falling }).checks[1].met).toBe(false);

    const bounced = analyzeCvd(
      parseCvd(
        series([
          [100, 10, 60],
          [100, 60, 10],
        ])
      )
    )!;
    expect(assessCapitulation({ cvdFlows: bounced }).checks[1].met).toBe(true);
  });

  it('refuses to count absorbed buying on 15m and 1H as a turn', () => {
    const absorbed = analyzeCvd(
      parseCvd(series(Array.from({ length: 12 }, () => [100, 90, 10] as [number, number, number])))
    )!;
    const check = assessCapitulation({ cvdFlows: absorbed }).checks[2];
    expect(check.met).toBe(false);
    expect(check.detail).toContain('absorbed');
  });

  it('reads the last complete daily session', () => {
    const cvdDaily = {
      spot: [
        { dayMs: 1, delta: -20, buy: 1, sell: 1, deltaUsd: null },
        { dayMs: 2, delta: 30, buy: 1, sell: 1, deltaUsd: null },
      ],
      perp: null,
    };
    expect(assessCapitulation({ cvdDaily }).checks[3].met).toBe(true);
  });

  it('scores the verdict over evaluable checks only', () => {
    const cvdDaily = {
      spot: [{ dayMs: 1, delta: 30, buy: 1, sell: 1, deltaUsd: null }],
      perp: null,
    };
    const cap = assessCapitulation({ cvdDaily });
    expect(cap.total).toBe(1);
    expect(cap.met).toBe(1);
    // 1/1 clears the 75% bar, so it must not be reported as "no signals".
    expect(cap.verdict).toContain('LIKELY OVER');
  });
});
