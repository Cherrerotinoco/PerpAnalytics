import type {
  Capitulation,
  CapitulationCheck,
  CvdAnalysis,
  CvdDaily,
  CvdSignal,
  DailyCvd,
  Divergence,
  FlowClassification,
  GammaRegime,
  GammaResult,
  HistoryRecord,
  KlineBucket,
  ParsedCvd,
  PriceSwings,
  TimeframeWindow,
  Timeframes,
} from './types';

// Net session aggression threshold (|CVD| / total volume) to raise a signal.
// Below it the day's aggressor flow is balanced and the read is NEUTRAL.
export const CVD_RATIO_THRESHOLD = 0.05;

// Trailing candles that summarise "recent" pressure (3 × 5m = 15 min).
const CVD_RECENT_BARS = 3;

// Windows aligned to Binance's clock cut (in ms). "Aligned" = the aggressor delta
// accumulated inside the CURRENT TF candle, from its open until now (4H starts at
// 00/04/08/12/16/20 UTC, 1H on the hour, 15m at :00/:15/:30/:45). It matches what
// a candlestick chart shows — it is not a rolling window.
const CVD_TIMEFRAMES = [
  { key: 'm15' as const, label: '15m', ms: 15 * 60 * 1000 },
  { key: 'h1' as const, label: '1H', ms: 60 * 60 * 1000 },
  { key: 'h4' as const, label: '4H', ms: 4 * 60 * 60 * 1000 },
];

// Minimum price return (fraction) for the price to be considered "following" a
// window's aggressor pressure. Below it the price does not respond: if the CVD is
// strong, that's absorption (someone passive eats the aggression without moving price).
const PRICE_FOLLOW_THRESHOLD = 0.0005; // 0.05%

// Candles on each side required to confirm a price pivot (local low/high). With
// 5m candles a window of 3 demands ~15 min of confirmation per side.
const SWING_WINDOW = 3;

/** Midnight UTC (ms) of the given day — where the session CVD starts accruing. */
export const midnightUtcMs = (now: Date = new Date()): number => {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
};

// ─── CVD ──────────────────────────────────────────────────────────────────────

// Classifies a window's flow by crossing the CVD (aggression) with the price move
// INSIDE that same window:
//  - weak CVD (|ratio| < threshold) → NEUTRAL.
//  - strong CVD and price follows (same sign, move ≥ threshold) → AGGRESSION
//    (healthy, with follow-through).
//  - strong CVD but price does NOT follow (flat or opposite) → ABSORPTION: someone
//    passive is absorbing it. Aggressive buying without rising = ABSORBED_BUYING
//    (distribution, bearish); aggressive selling without falling = ABSORBED_SELLING
//    (accumulation, bullish).
const classifyFlow = (w: {
  delta: number;
  buy: number;
  sell: number;
  priceFrom: number | null;
  priceTo: number | null;
}): FlowClassification | null => {
  if (w.priceFrom == null || w.priceTo == null) return null;
  const vol = w.buy + w.sell;
  if (vol <= 0) return { kind: 'NEUTRAL', ratio: 0, priceReturn: 0 };
  const ratio = w.delta / vol;
  const priceReturn = w.priceFrom !== 0 ? (w.priceTo - w.priceFrom) / w.priceFrom : 0;
  if (Math.abs(ratio) < CVD_RATIO_THRESHOLD) return { kind: 'NEUTRAL', ratio, priceReturn };
  const cvdUp = w.delta > 0;
  const priceFollows = cvdUp
    ? priceReturn >= PRICE_FOLLOW_THRESHOLD
    : priceReturn <= -PRICE_FOLLOW_THRESHOLD;
  if (priceFollows) {
    return { kind: cvdUp ? 'BULLISH_AGGRESSION' : 'BEARISH_AGGRESSION', ratio, priceReturn };
  }
  return { kind: cvdUp ? 'ABSORBED_BUYING' : 'ABSORBED_SELLING', ratio, priceReturn };
};

// Sums the aggressor delta (and buy/sell) of the 5m candles whose openTime falls
// inside the current TF candle. `refMs` is the openTime of the last available 5m
// candle: floor(refMs / tfMs) gives the start of the current TF candle, aligned to
// the epoch (which coincides with Binance's 00:00/04:00/... cuts).
const alignedWindow = (
  buckets: KlineBucket[],
  tfMs: number,
  refMs: number
): Omit<TimeframeWindow, 'label' | 'flow'> => {
  const boundary = Math.floor(refMs / tfMs) * tfMs;
  let buy = 0;
  let sell = 0;
  let delta = 0;
  let bars = 0;
  let priceFrom: number | null = null;
  let priceTo: number | null = null;
  for (const b of buckets) {
    if (b.openTime == null || b.openTime < boundary) continue;
    if (priceFrom == null) priceFrom = b.price;
    priceTo = b.price;
    buy += b.buyBtc;
    sell += b.sellBtc;
    delta += b.deltaBtc;
    bars += 1;
  }
  return { boundary, delta, buy, sell, bars, priceFrom, priceTo };
};

const computeTimeframes = (buckets: KlineBucket[]): Timeframes => {
  const refMs = buckets[buckets.length - 1].openTime ?? Date.now();
  const out = {} as Timeframes;
  for (const tf of CVD_TIMEFRAMES) {
    const w = alignedWindow(buckets, tf.ms, refMs);
    out[tf.key] = { label: tf.label, ...w, flow: classifyFlow(w) };
  }
  return out;
};

// Detects price pivots (local lows and highs) over the CVD candle series, and
// whether the last pivot breaks or holds the previous one's structure. It qualifies
// the price↔CVD divergence: a negative CVD with rising price lows is passive
// absorption, not a plain "hollow rally".
const findPriceSwings = (buckets: KlineBucket[], window = SWING_WINDOW): PriceSwings => {
  const lows: PriceSwings['lows'] = [];
  const highs: PriceSwings['highs'] = [];
  for (let i = window; i < buckets.length - window; i++) {
    const price = buckets[i].price;
    if (price == null) continue;
    let isLow = true;
    let isHigh = true;
    for (let j = i - window; j <= i + window; j++) {
      if (j === i) continue;
      const p = buckets[j].price;
      if (p == null) continue;
      if (p > price) isHigh = false;
      if (p < price) isLow = false;
      if (!isLow && !isHigh) break;
    }
    if (isLow) lows.push({ time: buckets[i].openTime, price });
    if (isHigh) highs.push({ time: buckets[i].openTime, price });
  }
  // "Ascending/descending" = the last pivot does not break the previous one (>=),
  // so only a lower low (or higher high) invalidates the structure.
  // null = insufficient sample (<2 pivots).
  const lowsAscending =
    lows.length >= 2
      ? (lows[lows.length - 1].price ?? 0) >= (lows[lows.length - 2].price ?? 0)
      : null;
  const highsDescending =
    highs.length >= 2
      ? (highs[highs.length - 1].price ?? 0) <= (highs[highs.length - 2].price ?? 0)
      : null;
  return { lows, highs, lowsAscending, highsDescending };
};

/**
 * Session CVD (Binance): aggressor delta accumulated since 00:00 UTC. Positive CVD
 * = net buying pressure; divergence against price = possible exhaustion/absorption.
 */
export const analyzeCvd = (c: ParsedCvd | null): CvdAnalysis | null => {
  if (!c || !c.ok || c.buckets.length === 0) return null;
  const buckets = c.buckets;

  // Cumulative CVD curve + session extremes (low/high of the excursion).
  let cvd = 0;
  let minCvd = Infinity;
  let maxCvd = -Infinity;
  const curve: CvdAnalysis['curve'] = [];
  for (const b of buckets) {
    cvd += b.deltaBtc;
    if (cvd < minCvd) minCvd = cvd;
    if (cvd > maxCvd) maxCvd = cvd;
    curve.push({ time: b.openTime, cvd, price: b.price });
  }
  const totalCvd = cvd; // = sum of every candle delta

  const buyBtc = buckets.reduce((s, b) => s + b.buyBtc, 0);
  const sellBtc = buckets.reduce((s, b) => s + b.sellBtc, 0);
  const totalBtc = buyBtc + sellBtc;
  const ratio = totalBtc > 0 ? totalCvd / totalBtc : null;

  let signal: CvdSignal = 'NEUTRAL';
  if (ratio != null) {
    if (ratio > CVD_RATIO_THRESHOLD) signal = 'BULLISH';
    else if (ratio < -CVD_RATIO_THRESHOLD) signal = 'BEARISH';
  }

  const last = buckets[buckets.length - 1];
  const recent = buckets.slice(-CVD_RECENT_BARS);
  const recentDelta = recent.reduce((s, b) => s + b.deltaBtc, 0);
  const deltaUsd = buckets.reduce((s, b) => s + (b.deltaUsd ?? 0), 0);

  // Session price↔CVD divergence. Price down + CVD up = buy-side absorption
  // (bullish); price up + CVD down = rally without aggressor volume (bearish);
  // aligned = confirms.
  const priceFrom = buckets[0].price;
  const priceTo = last.price;
  let divergence: Divergence = 'N/A';
  if (priceFrom != null && priceTo != null && totalCvd !== 0) {
    if (priceTo < priceFrom && totalCvd > 0) divergence = 'BULLISH';
    else if (priceTo > priceFrom && totalCvd < 0) divergence = 'BEARISH';
    else divergence = 'CONFIRMS';
  }

  return {
    signal,
    totalCvd,
    ratio,
    buyBtc,
    sellBtc,
    deltaUsd,
    lastDelta: last.deltaBtc,
    recentDelta,
    recentBars: recent.length,
    minCvd: minCvd === Infinity ? null : minCvd,
    maxCvd: maxCvd === -Infinity ? null : maxCvd,
    divergence,
    priceSwings: findPriceSwings(buckets),
    timeframes: computeTimeframes(buckets),
    priceFrom,
    priceTo,
    bars: buckets.length,
    sessionStart: buckets[0].openTime,
    lastBarTime: last.openTime,
    curve,
  };
};

/**
 * Previous-day CVD from 1d candles: each candle already is a whole day's aggressor
 * delta. Drops the in-progress day (partial, openTime >= beforeMs) and returns the
 * last `days` complete ones, oldest → newest.
 */
export const summarizeDailyCvd = (
  parsed: ParsedCvd | null,
  { days = 5, beforeMs = null }: { days?: number; beforeMs?: number | null } = {}
): DailyCvd[] | null => {
  if (!parsed || !parsed.ok || parsed.buckets.length === 0) return null;
  let buckets = parsed.buckets;
  if (beforeMs != null)
    buckets = buckets.filter((b) => b.openTime != null && b.openTime < beforeMs);
  return buckets.slice(-days).map((b) => ({
    dayMs: b.openTime,
    delta: b.deltaBtc,
    buy: b.buyBtc,
    sell: b.sellBtc,
    deltaUsd: b.deltaUsd,
  }));
};

// ─── Gamma ────────────────────────────────────────────────────────────────────

/** Deterministically derived gamma regime. */
export const analyzeGamma = (g: GammaResult | null): GammaRegime | null => {
  if (!g || !g.ok) return null;

  let regime: GammaRegime['regime'] = 'NEUTRAL';
  if (g.netGamma != null) {
    if (g.netGamma < 0) regime = 'AMPLIFIED_VOL';
    else if (g.netGamma > 0) regime = 'MEAN_REVERSION';
  }

  const isPin = g.support != null && g.resistance != null && g.support === g.resistance;

  return {
    regime,
    regimeLabel:
      regime === 'AMPLIFIED_VOL'
        ? '⚡ Amplified volatility (dealers short gamma)'
        : regime === 'MEAN_REVERSION'
          ? '🧲 Mean reversion (dealers long, pin)'
          : '⚪ Neutral',
    isPin,
    pinLevel: isPin ? g.support : null,
    defensive: g.putCallRatio != null && g.putCallRatio > 1,
    volPremiumNegative: g.volPremium != null && g.volPremium < 0,
    realizedGtImplied:
      g.realizedVol != null && g.impliedVol != null && g.realizedVol > g.impliedVol,
  };
};

// ─── Capitulation checklist ───────────────────────────────────────────────────

/**
 * Deterministic "end of capitulation" checklist: how many exhaustion conditions
 * hold on this pull. Not a verdict (a bottom is only confirmed in hindsight) but a
 * convergence marker. Each condition returns met=true/false, or null when the data
 * to evaluate it is missing (counts neither for nor against).
 *
 * Two rules from the CLI version are absent here because they need Whale Alert,
 * which blocks CORS: the realized-profit sequence (Rule 7) and net whale flow. The
 * first is stood in for by the session-CVD sequence across consecutive pulls, which
 * is the closest signal a browser can accumulate on its own.
 */
export const assessCapitulation = ({
  history = [],
  cvdFlows = null,
  cvdDaily = null,
}: {
  history?: HistoryRecord[];
  cvdFlows?: CvdAnalysis | null;
  cvdDaily?: CvdDaily | null;
} = {}): Capitulation => {
  const checks: CapitulationCheck[] = [];
  const add = (label: string, met: boolean | null, detail: string) =>
    checks.push({ label, met, detail });

  // 1. Session CVD recovering across 2 consecutive pulls (stand-in for Rule 7).
  const cvdSeq = history.map((r) => r?.cvdSpot).filter((v): v is number => v != null);
  let cvdRecovering: boolean | null = null;
  let cvdSeqDetail = 'not enough history (<3 pulls)';
  if (cvdSeq.length >= 3) {
    const [a, b, c] = cvdSeq.slice(-3);
    cvdRecovering = c > b && b > a;
    cvdSeqDetail = `sequence ${[a, b, c].map((v) => v.toFixed(0)).join(' → ')} BTC`;
  }
  add('Session CVD recovering across 2 consecutive pulls', cvdRecovering, cvdSeqDetail);

  // 2. Session CVD no longer making a new low (it bounced off the excursion floor).
  let cvdOffLow: boolean | null = null;
  let cvdDetail = 'no CVD data';
  if (cvdFlows?.totalCvd != null && cvdFlows?.minCvd != null) {
    cvdOffLow = cvdFlows.totalCvd > cvdFlows.minCvd;
    cvdDetail = `CVD ${cvdFlows.totalCvd.toFixed(0)} vs session low ${cvdFlows.minCvd.toFixed(0)}`;
  }
  add('Session CVD no longer making a new low (bounced off the floor)', cvdOffLow, cvdDetail);

  // 3. Short timeframes (15m and 1H) buying AND price following (not absorbed): if
  // the buying is being absorbed (CVD↑ without price rising) it does NOT count as a
  // turn — that's distribution, not real buying strength.
  let shortTfBuying: boolean | null = null;
  let tfDetail = 'no CVD timeframes';
  const tf = cvdFlows?.timeframes;
  if (tf?.m15 && tf?.h1) {
    const bothBuying = tf.m15.delta > 0 && tf.h1.delta > 0;
    const bothAbsorbed =
      tf.m15.flow?.kind === 'ABSORBED_BUYING' && tf.h1.flow?.kind === 'ABSORBED_BUYING';
    shortTfBuying = bothBuying && !bothAbsorbed;
    tfDetail = `15m ${tf.m15.delta.toFixed(0)} · 1H ${tf.h1.delta.toFixed(0)}`;
    if (bothBuying && bothAbsorbed) tfDetail += ' (⚠️ absorbed buying, price not following)';
  }
  add('15m and 1H CVD buying with price following (not absorbed)', shortTfBuying, tfDetail);

  // 4. Last complete daily session (spot) buying: background distribution breaks.
  let dailyBuying: boolean | null = null;
  let dailyDetail = 'no daily CVD';
  const spotDays = cvdDaily?.spot;
  const lastDay = spotDays && spotDays.length ? spotDays[spotDays.length - 1] : null;
  if (lastDay?.delta != null) {
    dailyBuying = lastDay.delta > 0;
    dailyDetail = `last spot day ${lastDay.delta.toFixed(0)} BTC`;
  }
  add('Last complete daily session (spot) buying', dailyBuying, dailyDetail);

  const evaluated = checks.filter((c) => c.met != null);
  const met = evaluated.filter((c) => c.met).length;
  const total = evaluated.length;
  let verdict: string;
  if (total > 0 && met >= Math.ceil(total * 0.75)) {
    verdict = 'LIKELY OVER — confirm it on the next pull';
  } else if (met >= 2) {
    verdict = 'EARLY SIGNS — unconfirmed';
  } else {
    verdict = 'NO CLEAR SIGNS — capitulation may continue';
  }
  return { checks, met, total, verdict };
};
