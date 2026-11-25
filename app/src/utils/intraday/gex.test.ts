import { describe, expect, it } from 'vitest';

import { parseGamma } from './parse';
import type { GammaSnapshot, OptionQuote, OptionsChain } from './types';

// Minimal chain in the endpoint's real shape: a call wall above spot and a put wall
// below, both carrying open interest.
const NOW = 1795536388946;
const EXPIRY_30D = NOW + 30 * 24 * 60 * 60 * 1000;

const quote = (over: Partial<OptionQuote> = {}): OptionQuote => {
  const kind = over.kind ?? 'call';
  return {
    instrument: `BTC-TEST-${over.strike ?? 60000}-${kind === 'call' ? 'C' : 'P'}`,
    expiry: EXPIRY_30D,
    strike: 60000,
    kind,
    forward: 60000,
    markIv: 0.55,
    openInterest: 100,
    volume24h: kind === 'call' ? 10 : 4,
    contractSize: 1,
    venue: 'deribit',
    ...over,
  };
};

const chain = (overrides: Partial<OptionsChain> = {}): OptionsChain => ({
  venue: 'all',
  underlying: 'BTC',
  indexPrice: 60000,
  fetchedAt: NOW,
  quotes: [
    quote({ strike: 65000, kind: 'call', openInterest: 500 }),
    quote({ strike: 55000, kind: 'put', openInterest: 300 }),
    quote({ strike: 60000, kind: 'call', openInterest: 100 }),
  ],
  dvol: [{ time: 1, value: 54.56 }],
  realizedVol: [{ time: 1, value: 67.64 }],
  ...overrides,
});

/** parseGamma with the usable-snapshot branch narrowed, so assertions stay readable. */
const gex = (data: OptionsChain): GammaSnapshot => {
  const res = parseGamma(data);
  if (!res.ok) throw new Error('expected a usable gamma snapshot');
  return res;
};

describe('parseGamma / computeGex', () => {
  it('computes metrics from a healthy chain', () => {
    const r = gex(chain());
    // Calls positive, puts negative (dealer-adjusted convention).
    expect(r.callGamma).toBeGreaterThan(0);
    expect(r.putGamma).toBeLessThan(0);
    // Levels derived from the per-strike profile.
    expect(r.resistance).toBe(65000);
    expect(r.support).toBe(55000);
    expect(r.currentPrice).toBe(60000);
    // Vol: implied (dvol) minus realized.
    expect(r.impliedVol).toBe(54.56);
    expect(r.realizedVol).toBe(67.64);
    expect(r.volPremium).toBe(-13.08);
  });

  // Golden values: anchors the MAGNITUDE of the GEX, not just its sign. Worked out by
  // hand with Γ=φ(d1)/(F·σ·√T) and GEX=Γ·OI·F²·1%, in millions of USD, for σ=0.55,
  // T=30/365, F=60,000: call 65k (OI 500) = 0.692357, call 60k (OI 100) = 0.151333,
  // put 55k (OI 300) = 0.373283. Without these figures an extra or missing factor of F
  // — or losing the 1% — would slip through: `callGamma > 0` holds either way.
  it('matches the Black-76 GEX magnitude computed by hand', () => {
    const r = gex(chain());
    expect(r.callGamma).toBe(0.84);
    expect(r.putGamma).toBe(-0.37);
    expect(r.netGamma).toBe(0.47);
    expect(r.callWeighted).toBe(69.33);
  });

  it('takes P/C from open interest in BTC (already normalised by the endpoint)', () => {
    const r = gex(chain());
    // 300 BTC of puts / 600 BTC of calls = 0.5
    expect(r.putCallRatio).toBe(0.5);
    // volume24h is in BTC too: 2 calls × 10 + 1 put × 4
    expect(r.callFlow).toBe(20);
    expect(r.putFlow).toBe(4);
  });

  // Regression for the refactor's main bug: the endpoint serves openInterest and
  // volume24h ALREADY converted to BTC (verified against OKX's `oiCcy`), so multiplying
  // by `contractSize` sank OKX and Bybit 100×. Two quotes identical except for
  // venue/contractSize must contribute EXACTLY the same.
  it('does not rescale by contractSize — equal OI weighs equally across venues', () => {
    const base = { strike: 65000, kind: 'call', openInterest: 500, volume24h: 10 };
    const r = gex(
      chain({
        quotes: [
          quote({ ...base, venue: 'deribit', contractSize: 1 }),
          quote({ ...base, venue: 'okx', contractSize: 0.01 }),
          quote({ ...base, venue: 'bybit', contractSize: undefined }),
        ],
      })
    );
    const g = r.gammaByVenue;
    expect(g.okx).toBe(g.deribit);
    expect(g.bybit).toBe(g.deribit);
    expect(r.callFlow).toBe(30);
  });

  it('cannot reproduce squeezeRisk or deltaHedging from the chain', () => {
    const r = gex(chain());
    expect(r.squeezeRisk).toBeNull();
    expect(r.deltaHedging).toBeNull();
  });

  // pinRisk comes from the dominant strike's share of RAW |gamma| (thresholds
  // 0.25 / 0.12), not from per-strike nets.
  it('picks the pin as the strike with the most raw |gamma|, with its label', () => {
    const r = gex(chain());
    // call 65k (0.692) dominates over put 55k (0.373) and call 60k (0.151).
    expect(r.pinLevel).toBe(65000);
    expect(r.pinRisk).toBe('High (near $65,000)');
  });

  // The pin must not collapse onto the put wall: on a strike holding both calls and
  // puts the signed gamma cancels, but the real concentration is the sum of both legs.
  it('does not let calls and puts on one strike cancel when choosing the pin', () => {
    const r = gex(
      chain({
        quotes: [
          quote({ strike: 60000, kind: 'call', openInterest: 400 }),
          quote({ strike: 60000, kind: 'put', openInterest: 400 }),
        ],
      })
    );
    expect(r.netGamma).toBe(0);
    expect(r.pinLevel).toBe(60000);
    expect(r.pinShare).toBe(1);
  });

  it('keeps a puts-only chain usable, with resistance null', () => {
    const r = gex(chain({ quotes: [quote({ strike: 55000, kind: 'put', openInterest: 300 })] }));
    expect(r.callGamma).toBe(0);
    expect(r.resistance).toBeNull();
    expect(r.support).toBe(55000);
    // Without calls the ratio is undefined.
    expect(r.putCallRatio).toBeNull();
  });

  it('leaves volPremium null, not 0, when the vol series are missing', () => {
    const r = gex(chain({ dvol: [], realizedVol: undefined }));
    expect(r.impliedVol).toBeNull();
    expect(r.realizedVol).toBeNull();
    expect(r.volPremium).toBeNull();
  });

  // An expired contract, or one without IV, has no definable gamma, but its open
  // interest and volume are still valid for the P/C and the flow.
  it('drops expired or IV-less contracts from the GEX but counts their OI and flow', () => {
    const r = gex(
      chain({
        quotes: [
          quote({ strike: 65000, kind: 'call', openInterest: 500 }),
          quote({ strike: 58000, kind: 'put', openInterest: 200, expiry: NOW - 1000 }),
          quote({ strike: 57000, kind: 'put', openInterest: 100, markIv: 0 }),
        ],
      })
    );
    expect(r.contractsUsed).toBe(1);
    expect(r.contractsSkipped).toBe(2);
    // 300 BTC of puts / 500 of calls
    expect(r.putCallRatio).toBe(0.6);
    expect(r.putFlow).toBe(8);
  });

  // The endpoint publishes markIv as a fraction on all four venues. If one switched to
  // percentages, the GEX would silently be divided by ~100.
  it('discards markIv served as a percentage instead of sinking the GEX', () => {
    const r = gex(
      chain({
        quotes: [
          quote({ strike: 65000, kind: 'call', openInterest: 500 }),
          quote({ strike: 55000, kind: 'put', openInterest: 300, markIv: 55 }),
        ],
      })
    );
    // An IV of 5500% is not plausible: out.
    expect(r.contractsSkipped).toBe(1);
    expect(r.putGamma).toBe(0);
  });

  // The gamma flip is the SPOT PRICE where aggregate gamma changes sign, not a strike:
  // it comes from re-evaluating the profile at different spot levels.
  it('reads the gamma flip as the spot where the net changes sign', () => {
    // Put wall right at spot and a call wall well above: with BTC at 60,000 the put
    // gamma dominates and as spot approaches the call wall the net turns positive. The
    // crossing must land between the two walls.
    const r = gex(
      chain({
        quotes: [
          quote({ strike: 59000, kind: 'put', openInterest: 900 }),
          quote({ strike: 70000, kind: 'call', openInterest: 700 }),
        ],
      })
    );
    expect(r.netGamma).toBeLessThan(0);
    expect(r.breakout).not.toBeNull();
    expect(r.breakout!).toBeGreaterThan(60000);
    expect(r.breakout!).toBeLessThan(70000);
  });

  it('returns a null gamma flip when no sign change is reachable', () => {
    // Puts only: signed gamma is negative at any spot level, so there is no flip. It
    // must come back null, never an invented level.
    const r = gex(
      chain({
        quotes: [
          quote({ strike: 55000, kind: 'put', openInterest: 300 }),
          quote({ strike: 50000, kind: 'put', openInterest: 200 }),
        ],
      })
    );
    expect(r.breakout).toBeNull();
  });

  it('degrades a chain with no open interest to ok=false', () => {
    const data = chain();
    for (const q of data.quotes) q.openInterest = 0;
    const res = parseGamma(data);
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.degraded).toBe(true);
  });

  // If a venue is down the aggregate loses its gamma: it has to show up in the output
  // instead of publishing a netGamma that looks normal.
  it('propagates down venues from sources[]', () => {
    const r = gex(
      chain({
        reference: 'deribit',
        sources: [
          { venue: 'deribit', ok: true },
          { venue: 'okx', ok: false },
          { venue: 'bybit', ok: false },
        ],
      })
    );
    expect(r.venuesDown).toEqual(['okx', 'bybit']);
    expect(r.partial).toBe(true);
  });

  it('reports no down venues on a complete chain', () => {
    const r = gex(chain({ sources: [{ venue: 'deribit', ok: true }] }));
    expect(r.venuesDown).toEqual([]);
    expect(r.partial).toBe(false);
  });

  it('rejects a response without quotes', () => {
    expect(parseGamma(null).ok).toBe(false);
    expect(parseGamma({ foo: 'bar' }).ok).toBe(false);
  });
});

// ─── gammaByStrike ────────────────────────────────────────────────────────────
describe('gamma profile by price level', () => {
  it('buckets the chain onto a round step and runs highest strike first', () => {
    const r = gex(chain());
    expect(r.strikeBucket).toBe(1000);
    // Window is spot ±15% → 51,000…69,000 on a $1,000 grid.
    expect(r.gammaByStrike[0].strike).toBe(69000);
    expect(r.gammaByStrike[r.gammaByStrike.length - 1].strike).toBe(51000);
    const strikes = r.gammaByStrike.map((b) => b.strike);
    expect(strikes).toEqual([...strikes].sort((a, b) => b - a));
  });

  it('carries the call wall positive and the put wall negative', () => {
    const r = gex(chain());
    const at = (k: number) => r.gammaByStrike.find((b) => b.strike === k)!;
    expect(at(65000).gamma).toBeGreaterThan(0);
    expect(at(55000).gamma).toBeLessThan(0);
  });

  it('flags exactly one bucket as holding spot', () => {
    const r = gex(chain());
    const atSpot = r.gammaByStrike.filter((b) => b.atSpot);
    expect(atSpot).toHaveLength(1);
    expect(atSpot[0].strike).toBe(60000);
  });

  it('emits empty buckets rather than leaving gaps in the price axis', () => {
    const r = gex(chain());
    const step = r.strikeBucket;
    for (let i = 1; i < r.gammaByStrike.length; i++) {
      expect(r.gammaByStrike[i - 1].strike - r.gammaByStrike[i].strike).toBe(step);
    }
    expect(r.gammaByStrike.some((b) => b.gamma === 0)).toBe(true);
  });

  it('drops strikes outside the window instead of flattening the profile', () => {
    const r = gex(
      chain({
        quotes: [
          quote({ strike: 65000, kind: 'call', openInterest: 500 }),
          // Far OTM: real in the chain, but 2× spot carries no intraday gamma.
          quote({ strike: 120000, kind: 'call', openInterest: 9000, forward: 60000 }),
        ],
      })
    );
    expect(r.gammaByStrike.some((b) => b.strike === 120000)).toBe(false);
    expect(r.gammaByStrike.find((b) => b.strike === 65000)!.gamma).toBeGreaterThan(0);
  });

  it('widens the bucket with spot so the row count stays readable', () => {
    const cheap = gex(
      chain({ indexPrice: 6000, quotes: [quote({ strike: 6000, forward: 6000 })] })
    );
    const rich = gex(
      chain({ indexPrice: 600000, quotes: [quote({ strike: 600000, forward: 600000 })] })
    );
    expect(cheap.strikeBucket).toBeLessThan(rich.strikeBucket);
    for (const r of [cheap, rich]) expect(r.gammaByStrike.length).toBeLessThanOrEqual(32);
  });
});
