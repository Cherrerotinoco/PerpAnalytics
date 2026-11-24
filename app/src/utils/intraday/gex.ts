// ─── Gamma exposure from the raw options chain ────────────────────────────────
// Ported from the `bitcoinAnalizer` CLI crawler (src/intraday/gex.js).
//
// The basischarts endpoint does NOT return aggregated metrics (unlike the old
// cryptogamma one, which served netGamma/support/resistance already computed):
// it delivers ~3,000 quotes with strike, expiry, mark IV, open interest and
// volume per instrument. The whole GEX is derived here.
//
// Sign convention (dealer-adjusted, the same one the previous endpoint used): we
// assume dealers are LONG calls and SHORT puts against retail flow, so calls add
// positive and puts add negative. Negative netGamma = dealers short gamma =
// amplified volatility. NOTE: this is an ASSUMPTION about positioning, not a
// figure the endpoint reports.

import type { GammaSnapshot, OptionQuote, OptionsChain, VolPoint } from './types';

const MS_PER_YEAR = 365 * 24 * 60 * 60 * 1000;
const INV_SQRT_2PI = 0.3989422804014327;

// Residual-life floor: 10 minutes. Γ ∝ 1/√T, so an ATM strike seconds away from
// expiry would tend to infinity and dominate the whole profile (netGamma, pin
// and pinShare) on any pull taken on an expiry day.
const MIN_YEARS = 10 / (365 * 24 * 60);

// Mark IV arrives as a FRACTION on all four venues (observed range 0.44–1.64:
// the endpoint normalises the `mark_iv` percentage Deribit publishes). A value
// above this ceiling means some venue switched to percentages; drop the quote
// instead of feeding in a GEX sunk 100×.
const MAX_PLAUSIBLE_IV = 5;

/** Standard normal density. Gamma only needs the PDF, not the CDF. */
const normPdf = (x: number): number => INV_SQRT_2PI * Math.exp(-0.5 * x * x);

interface GammaInput {
  forward: number;
  strike: number;
  iv: number;
  years: number;
}

/**
 * Black-76 gamma (on the forward, which is what the endpoint publishes).
 * Γ = φ(d1) / (F · σ · √T), d1 = [ln(F/K) + σ²T/2] / (σ√T)
 *
 * The e^{-rT} discount factor is omitted because the endpoint does not publish
 * the rate. It is irrelevant on the weekly expiry; on the longest tenor (~10
 * months) it overstates gamma by 3-4%, and that tenor is under 10% of the total,
 * so the aggregate bias stays below 0.5%. A deliberate omission.
 */
export const black76Gamma = ({ forward, strike, iv, years }: GammaInput): number | null => {
  if (!(forward > 0) || !(strike > 0) || !(iv > 0) || !(years > 0)) return null;
  const sqrtT = Math.sqrt(years);
  const d1 = (Math.log(forward / strike) + 0.5 * iv * iv * years) / (iv * sqrtT);
  return normPdf(d1) / (forward * iv * sqrtT);
};

/**
 * One contract's GEX, in USD of delta per 1% move in the underlying:
 * Γ · OI · F² · 1%.
 *
 * The F² factor is exact, not an approximation: delta in BTC against spot is
 * ∂V/∂F·(F/S), its change per ΔS is Γ_F·(F/S)²·ΔS, and converting to USD of
 * delta (×S) with ΔS = 1%·S cancels the (F/S)² and S² factors.
 *
 * `openInterest` is in BTC, NOT in contracts: the endpoint already normalises it
 * to the base currency (verified against `oiCcy` on OKX's own API, which matches
 * this endpoint to the cent, while its `oi` in contracts is 100× larger). That is
 * why it is NOT multiplied by `contractSize`: doing so sank OKX and Bybit by a
 * factor of 100 and left 20% of the market weighing 0.2% of the aggregate.
 */
const contractGex = ({
  gamma,
  openInterest,
  forward,
}: {
  gamma: number;
  openInterest: number;
  forward: number;
}): number => gamma * openInterest * forward * forward * 0.01;

/** Residual life with the floor applied, or null when the contract already expired. */
const yearsToExpiry = (expiry: number | undefined, now: number): number | null => {
  if (!Number.isFinite(expiry)) return null;
  const years = ((expiry as number) - now) / MS_PER_YEAR;
  if (!(years > 0)) return null;
  return Math.max(years, MIN_YEARS);
};

const usableIv = (iv: number | undefined): number | null =>
  Number.isFinite(iv) && (iv as number) > 0 && (iv as number) <= MAX_PLAUSIBLE_IV
    ? (iv as number)
    : null;

/** Rounds to 2 decimals, dodging float noise. */
const round2 = (n: number | null): number | null =>
  n == null || !Number.isFinite(n) ? null : Math.round(n * 100) / 100;

/** Last value of an ascending [{ time, value }] series. */
const lastValue = (series: VolPoint[] | undefined): number | null => {
  if (!Array.isArray(series) || series.length === 0) return null;
  const last = series[series.length - 1];
  return Number.isFinite(last?.value) ? last.value : null;
};

const finiteOrZero = (n: number | undefined): number => (Number.isFinite(n) ? (n as number) : 0);

interface Aggregate {
  signedByStrike: Map<number, number>;
  absByStrike: Map<number, number>;
  byVenue: Map<string, number>;
  callGex: number;
  putGex: number;
  callOi: number;
  putOi: number;
  callVol: number;
  putVol: number;
  used: number;
  skipped: number;
}

/**
 * Aggregates GEX per strike and returns the per-type totals as well.
 *
 * Two maps per strike, on purpose:
 *   signedByStrike → signed gamma, for support/resistance (measures imbalance)
 *   absByStrike    → |gamma|, for the pin (measures CONCENTRATION)
 * With a single signed map, a strike holding both calls and puts cancels out and
 * the pin ends up collapsing onto the largest put wall, duplicating `support`.
 */
const aggregate = (quotes: OptionQuote[], now: number): Aggregate => {
  const signedByStrike = new Map<number, number>();
  const absByStrike = new Map<number, number>();
  const byVenue = new Map<string, number>();
  let callGex = 0;
  let putGex = 0;
  let callOi = 0;
  let putOi = 0;
  let callVol = 0;
  let putVol = 0;
  let used = 0;
  let skipped = 0;

  for (const q of quotes) {
    const isCall = q.kind === 'call';
    const oi = finiteOrZero(q.openInterest);
    const vol = finiteOrZero(q.volume24h);

    // OI and volume accumulate BEFORE the gamma filter: an expired contract, or
    // one without IV, has no definable gamma, but its open interest and its 24h
    // volume are still valid inputs for the put/call ratio and for the flow.
    if (isCall) {
      callOi += oi;
      callVol += vol;
    } else {
      putOi += oi;
      putVol += vol;
    }

    const years = yearsToExpiry(q.expiry, now);
    const iv = usableIv(q.markIv);
    const strike = q.strike;
    const forward = q.forward;
    const gamma =
      years != null && iv != null && strike != null && forward != null
        ? black76Gamma({ forward, strike, iv, years })
        : null;
    if (gamma == null || strike == null || forward == null) {
      if (oi > 0) skipped++;
      continue;
    }
    if (oi <= 0) continue;

    // Dealer-adjusted sign: calls +, puts −.
    const gex = contractGex({ gamma, openInterest: oi, forward });
    const signed = isCall ? gex : -gex;
    if (isCall) callGex += gex;
    else putGex -= gex;

    signedByStrike.set(strike, (signedByStrike.get(strike) ?? 0) + signed);
    absByStrike.set(strike, (absByStrike.get(strike) ?? 0) + gex);
    const venue = q.venue ?? 'unknown';
    byVenue.set(venue, (byVenue.get(venue) ?? 0) + signed);
    used++;
  }

  return {
    signedByStrike,
    absByStrike,
    byVenue,
    callGex,
    putGex,
    callOi,
    putOi,
    callVol,
    putVol,
    used,
    skipped,
  };
};

interface Levels {
  support: number | null;
  resistance: number | null;
  pin: number | null;
  pinShare: number | null;
}

/**
 * Gamma levels, derived from the per-strike profile:
 *   resistance → largest call wall (positive gamma) above spot
 *   support    → largest put wall (negative gamma) below spot
 *   pin        → strike with the largest RAW |gamma| (the profile's strongest magnet)
 */
const levels = (
  signedByStrike: Map<number, number>,
  absByStrike: Map<number, number>,
  spot: number
): Levels => {
  let resistance: number | null = null;
  let resistanceGex = 0;
  let support: number | null = null;
  let supportGex = 0;

  for (const [strike, gex] of signedByStrike) {
    if (strike > spot && gex > resistanceGex) {
      resistanceGex = gex;
      resistance = strike;
    }
    if (strike < spot && gex < supportGex) {
      supportGex = gex;
      support = strike;
    }
  }

  let pin: number | null = null;
  let pinAbs = 0;
  let total = 0;
  for (const [strike, abs] of absByStrike) {
    total += abs;
    if (abs > pinAbs) {
      pinAbs = abs;
      pin = strike;
    }
  }

  return { support, resistance, pin, pinShare: total > 0 ? pinAbs / total : null };
};

interface FlipQuote {
  forward: number;
  strike: number;
  iv: number;
  years: number;
  oi: number;
  sign: 1 | -1;
}

/**
 * Gamma flip: the SPOT PRICE at which the dealers' aggregate gamma changes sign.
 * The whole profile has to be re-evaluated at different spot levels (shifting
 * each quote's forward), because accumulating signed gamma along the strike axis
 * — which is what many dashboards do — has no equilibrium-price interpretation:
 * it yields the strike where the put tail stops weighing, which with BTC at $59k
 * can land at $20,000.
 *
 * It sweeps ±25% of spot in 0.5% steps and returns the sign crossing CLOSEST to
 * spot, linearly interpolated. If gamma does not change sign anywhere in the
 * band it returns null: there is no reachable flip and the analysis must not
 * invent a pivot level.
 */
const gammaFlip = (quotes: OptionQuote[], now: number, spot: number): number | null => {
  const SPAN = 0.25;
  const STEP = 0.005;
  const steps = Math.round(SPAN / STEP);

  // Pre-filter once: the sweep walks the chain ~100 times.
  const usable: FlipQuote[] = [];
  for (const q of quotes) {
    const years = yearsToExpiry(q.expiry, now);
    const iv = usableIv(q.markIv);
    const oi = finiteOrZero(q.openInterest);
    const forward = q.forward;
    const strike = q.strike;
    if (years == null || iv == null || oi <= 0 || !(forward! > 0) || !(strike! > 0)) continue;
    usable.push({
      forward: forward as number,
      strike: strike as number,
      iv,
      years,
      oi,
      sign: q.kind === 'call' ? 1 : -1,
    });
  }
  if (usable.length === 0) return null;

  const netAt = (ratio: number): number => {
    let net = 0;
    for (const u of usable) {
      const forward = u.forward * ratio;
      const gamma = black76Gamma({ forward, strike: u.strike, iv: u.iv, years: u.years });
      if (gamma == null) continue;
      net += u.sign * contractGex({ gamma, openInterest: u.oi, forward });
    }
    return net;
  };

  // Both directions are stepped away from spot at once, so the first crossing
  // found is by construction the nearest one.
  let prevUp = netAt(1);
  let prevDown = prevUp;
  const interp = (r0: number, n0: number, r1: number, n1: number): number => {
    const t = n0 / (n0 - n1);
    return spot * (r0 + t * (r1 - r0));
  };

  for (let i = 1; i <= steps; i++) {
    const rUp = 1 + i * STEP;
    const nUp = netAt(rUp);
    if (prevUp !== 0 && Math.sign(nUp) !== Math.sign(prevUp)) {
      return Math.round(interp(1 + (i - 1) * STEP, prevUp, rUp, nUp) / 50) * 50;
    }
    const rDown = 1 - i * STEP;
    const nDown = netAt(rDown);
    if (prevDown !== 0 && Math.sign(nDown) !== Math.sign(prevDown)) {
      return Math.round(interp(1 - (i - 1) * STEP, prevDown, rDown, nDown) / 50) * 50;
    }
    prevUp = nUp;
    prevDown = nDown;
  }

  return null;
};

/**
 * Qualitative pin-risk label from how much gamma the dominant strike concentrates.
 * The previous endpoint served this label ready-made; here it is derived
 * explicitly so the threshold is auditable.
 */
const pinRiskLabel = (pin: number | null, pinShare: number | null): string | null => {
  if (pin == null || pinShare == null) return null;
  const level = pinShare >= 0.25 ? 'High' : pinShare >= 0.12 ? 'Medium' : 'Low';
  return `${level} (near $${pin.toLocaleString('en-US')})`;
};

/**
 * Venues the endpoint reports as down in `sources[]`. If one is missing the
 * aggregate loses its gamma and the regime can flip sign: it has to be stated.
 */
const downVenues = (sources: OptionsChain['sources']): string[] => {
  if (!Array.isArray(sources)) return [];
  return sources.filter((s) => s && s.ok === false && s.venue).map((s) => s.venue as string);
};

/**
 * Turns the raw basischarts response into the same metrics analyze/report/history
 * consume.
 *
 * Units: net/call/put gamma in MILLIONS OF USD of delta per 1% move. They are NOT
 * comparable with the previous endpoint's scale.
 */
export const computeGex = (data: OptionsChain): GammaSnapshot | null => {
  if (!data || !Array.isArray(data.quotes) || data.quotes.length === 0) return null;

  const spot = Number.isFinite(data.indexPrice) ? (data.indexPrice as number) : null;
  const now = Number.isFinite(data.fetchedAt) ? (data.fetchedAt as number) : Date.now();
  const agg = aggregate(data.quotes, now);
  if (agg.used === 0 || spot == null) return null;

  const MM = 1e6;
  const callGamma = agg.callGex / MM;
  const putGamma = agg.putGex / MM;
  const netGamma = callGamma + putGamma;
  const absTotal = Math.abs(callGamma) + Math.abs(putGamma);

  const lvl = levels(agg.signedByStrike, agg.absByStrike, spot);
  const impliedVol = lastValue(data.dvol);
  const realizedVol = lastValue(data.realizedVol);

  // P/C by open interest (the standard convention), not by gamma.
  const putCallRatio = agg.callOi > 0 ? agg.putOi / agg.callOi : null;
  // Share of gamma contributed by calls over the absolute total, in %.
  const callWeighted = absTotal > 0 ? (Math.abs(callGamma) / absTotal) * 100 : null;

  // Profile asymmetry: how much |gamma| sits above spot versus below. This is
  // information the SIGN of netGamma does NOT carry (that one says whether dealers
  // amplify or dampen; this one, which way the profile leans). The bias used to be
  // derived from netGamma and was a duplicate of the regime.
  let absAbove = 0;
  let absBelow = 0;
  for (const [strike, abs] of agg.absByStrike) {
    if (strike > spot) absAbove += abs;
    else if (strike < spot) absBelow += abs;
  }
  const skewTotal = absAbove + absBelow;
  const gammaAbovePct = skewTotal > 0 ? (absAbove / skewTotal) * 100 : null;
  // 55/45 dead band: below that imbalance the profile is evenly spread and there
  // is no bias worth reporting.
  const bias: GammaSnapshot['bias'] =
    gammaAbovePct == null
      ? null
      : gammaAbovePct >= 55
        ? 'BULLISH'
        : gammaAbovePct <= 45
          ? 'BEARISH'
          : 'NEUTRAL';

  const venuesDown = downVenues(data.sources);

  return {
    ok: true,
    asset: data.underlying ?? null,
    source: data.venue ?? null,
    generatedAt: new Date(now).toISOString(),
    netGamma: round2(netGamma),
    callGamma: round2(callGamma),
    putGamma: round2(putGamma),
    bias,
    gammaAbovePct: round2(gammaAbovePct),
    putCallRatio: round2(putCallRatio),
    callWeighted: round2(callWeighted),
    currentPrice: round2(spot),
    support: lvl.support,
    resistance: lvl.resistance,
    breakout: gammaFlip(data.quotes, now, spot),
    realizedVol: round2(realizedVol),
    impliedVol: round2(impliedVol),
    volPremium: impliedVol != null && realizedVol != null ? round2(impliedVol - realizedVol) : null,
    // 24h aggressor volume by type, in BTC (the endpoint already normalises it to
    // the base currency). NOTE: this is GROSS volume, not the NET flow the previous
    // endpoint served (that one could be negative).
    callFlow: round2(agg.callVol),
    putFlow: round2(agg.putVol),
    flowCpRatio: agg.putVol > 0 ? round2(agg.callVol / agg.putVol) : null,
    // The previous endpoint served these two labels ready-made and they are not
    // reproducible from the chain: they are reported as unavailable instead of
    // inventing a value with the same appearance.
    deltaHedging: null,
    squeezeRisk: null,
    pinRisk: pinRiskLabel(lvl.pin, lvl.pinShare),
    pinLevel: lvl.pin,
    pinShare: round2(lvl.pinShare),
    // Traceability of the aggregate: how many contracts went in, how many were
    // dropped for expiry or unusable IV, and which venues are missing.
    contractsUsed: agg.used,
    contractsSkipped: agg.skipped,
    venuesDown,
    partial: venuesDown.length > 0,
    venues: [...agg.byVenue.keys()],
    gammaByVenue: Object.fromEntries([...agg.byVenue].map(([v, g]) => [v, round2(g / MM)])),
  };
};
