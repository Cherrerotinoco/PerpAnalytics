import type {
  Capitulation,
  CapitulationCheck,
  ClassifiedAlert,
  CvdAnalysis,
  CvdDaily,
  CvdSignal,
  DailyCvd,
  Divergence,
  FlowAnalysis,
  FlowClass,
  FlowClassification,
  FlowSignal,
  GammaRegime,
  GammaResult,
  HistoryRecord,
  KlineBucket,
  ParsedCvd,
  PriceSwings,
  SkewBias,
  SkewRead,
  SkewResult,
  TimeframeWindow,
  Timeframes,
  VolLabRead,
  VolLabResult,
  WhaleAlert,
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

  // PIN: the magnet only rules when the dominant strike sits RIGHT ON spot and also
  // concentrates real gamma. It used to be derived from (support === resistance),
  // impossible by construction now that the levels are computed in gex.ts (support is
  // always < spot < resistance), so that branch was dead.
  const PIN_PROXIMITY = 0.005; // 0.5% of spot
  const PIN_MIN_SHARE = 0.12;
  const pinDistance =
    g.pinLevel != null && g.currentPrice != null && g.currentPrice > 0
      ? Math.abs(g.pinLevel - g.currentPrice) / g.currentPrice
      : null;
  const isPin =
    pinDistance != null && pinDistance <= PIN_PROXIMITY && (g.pinShare ?? 0) >= PIN_MIN_SHARE;

  return {
    regime,
    regimeLabel:
      regime === 'AMPLIFIED_VOL'
        ? '⚡ Amplified volatility (dealers short gamma)'
        : regime === 'MEAN_REVERSION'
          ? '🧲 Mean reversion (dealers long, pin)'
          : '⚪ Neutral',
    isPin,
    pinLevel: isPin ? g.pinLevel : null,
    // Tri-state: null = missing input. See GammaRegime in types.ts.
    defensive: g.putCallRatio == null ? null : g.putCallRatio > 1,
    volPremiumNegative: g.volPremium == null ? null : g.volPremium < 0,
    realizedGtImplied:
      g.realizedVol == null || g.impliedVol == null ? null : g.realizedVol > g.impliedVol,
  };
};

// ─── Capitulation checklist ───────────────────────────────────────────────────

/**
 * Deterministic "end of capitulation" checklist: how many exhaustion conditions
 * hold on this pull. Not a verdict (a bottom is only confirmed in hindsight) but a
 * convergence marker. Each condition returns met=true/false, or null when the data
 * to evaluate it is missing (counts neither for nor against).
 *
 * Four conditions rather than the CLI's six: the two that depend on a source this
 * edition cannot reach (see fetchers.ts) are dropped, and the CLI's realized-profit
 * sequence is stood in for by the session-CVD sequence across consecutive pulls —
 * the closest signal a browser can accumulate on its own.
 */
export const assessCapitulation = ({
  history = [],
  cvdFlows = null,
  cvdDaily = null,
  flows = null,
}: {
  history?: HistoryRecord[];
  cvdFlows?: CvdAnalysis | null;
  cvdDaily?: CvdDaily | null;
  flows?: FlowAnalysis | null;
} = {}): Capitulation => {
  const checks: CapitulationCheck[] = [];
  const add = (label: string, met: boolean | null, detail: string) =>
    checks.push({ label, met, detail });

  // 1. Rule 7: realised profit recovering towards zero across 2 consecutive pulls.
  //
  // This used to stand in with session CVD, because realised profit comes from
  // Whale Alert and that was unreachable from the browser. Now that the pull runs
  // server-side it reads the real figure — but only for records written since,
  // hence the fallback below for a sequence that predates it.
  const realizedSeq = history.map((r) => r?.realized).filter((v): v is number => v != null);
  let realizedRecovering: boolean | null = null;
  let realizedDetail = 'not enough history with realised profit (<3 pulls)';
  if (realizedSeq.length >= 3) {
    const [a, b, c] = realizedSeq.slice(-3);
    realizedRecovering = c > b && b > a;
    realizedDetail = `sequence ${[a, b, c].map((v) => `${(v / 1e6).toFixed(0)}M`).join(' → ')}`;
  }
  add(
    'Realised profit recovering across 2 consecutive pulls (Rule 7)',
    realizedRecovering,
    realizedDetail
  );

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

  // 5. Net whale flow buying. Null on a browser-side pull: Whale Alert is
  // CORS-blocked, so only the server-rendered page can evaluate this one.
  let whalesNetBuy: boolean | null = null;
  let whalesDetail = 'no whale flow data';
  if (flows?.netBtc != null) {
    whalesNetBuy = flows.netBtc > 0;
    whalesDetail = `net ${flows.netBtc > 0 ? '+' : ''}${flows.netBtc.toFixed(0)} BTC`;
  }
  add('Net whale flow buying', whalesNetBuy, whalesDetail);

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

// ─── Whale flows ──────────────────────────────────────────────────────────────

/** Centralised exchange keywords (lowercase, no leading #). */
const EXCHANGE_KEYWORDS = [
  'binance',
  'coinbase',
  'kraken',
  'okx',
  'bybit',
  'bitfinex',
  'huobi',
  'htx',
  'gemini',
  'kucoin',
  'bitstamp',
  'gate.io',
  'crypto.com',
  'upbit',
  'bithumb',
  'mexc',
  'bitget',
  'deribit',
  'bitmex',
  'bitso',
  'whitebit',
  'poloniex',
  'robinhood',
];

/**
 * DeFi protocol keywords (lending / DEX / liquid staking).
 *
 * Several are ordinary English words — "maker", "compound", "spark", "curve",
 * "drift" — so they are matched on a word boundary. A substring match would
 * classify any entity merely containing them as DeFi.
 */
const DEFI_KEYWORDS = [
  'aave',
  'morpho',
  'kamino',
  'jupiter',
  'drift',
  'maker',
  'compound',
  'spark',
  'curve',
  'uniswap',
  'lido',
  'pendle',
  'sky',
];

const STABLES = new Set(['USDT', 'USDC', 'DAI', 'BUSD', 'TUSD', 'FDUSD', 'PYUSD']);

const clean = (entity: string | null): string =>
  (entity ?? '').replace(/^#/, '').toLowerCase().trim();

const isExchange = (entity: string | null): boolean => {
  const e = clean(entity);
  if (!e || e.includes('unknown')) return false;
  return EXCHANGE_KEYWORDS.some((kw) => e.includes(kw));
};

const isDefi = (entity: string | null): boolean => {
  const e = clean(entity);
  if (!e || e.includes('unknown')) return false;
  // "Market Maker" is a common OTC-desk label on Whale Alert, not the Maker/Sky
  // protocol: the word matches exactly but means something else, so it is
  // excluded explicitly.
  if (e.includes('market maker')) return false;
  return DEFI_KEYWORDS.some((kw) => new RegExp(`\\b${kw}\\b`).test(e));
};

const isTreasury = (entity: string | null): boolean => /treasury/i.test(entity ?? '');

/**
 * Materiality thresholds (large whales / institutional events).
 * BTC: 1k notable · 5k institutional · 10k very relevant.
 * Stables: 50M notable · 100M very relevant · 250M institutional · 500M extraordinary.
 */
export const materialityTag = (a: WhaleAlert): string | null => {
  if (a.symbol === 'BTC' && a.amount != null) {
    if (a.amount >= 10000) return '🔥🔥 VERY RELEVANT';
    if (a.amount >= 5000) return '🏦 INSTITUTIONAL';
    if (a.amount >= 1000) return '⭐ NOTABLE';
    return null;
  }
  if (a.symbol != null && STABLES.has(a.symbol) && a.valueUsd != null) {
    if (a.valueUsd >= 500_000_000) return '🌋 EXTRAORDINARY';
    if (a.valueUsd >= 250_000_000) return '🏦 INSTITUTIONAL';
    if (a.valueUsd >= 100_000_000) return '🔥 VERY RELEVANT';
    if (a.valueUsd >= 50_000_000) return '⭐ NOTABLE';
    return null;
  }
  return null;
};

/** Sorts one transfer into a directional category. */
export const classifyAlert = (a: WhaleAlert): FlowClass => {
  const isStable = a.symbol != null && STABLES.has(a.symbol);

  if (a.symbol === 'BTC') {
    const srcEx = isExchange(a.from);
    const dstEx = isExchange(a.to);
    if (dstEx && !srcEx)
      return {
        category: 'INFLOW',
        bias: 'bearish',
        emoji: '🔴',
        note: 'BTC to an exchange (possible sale)',
      };
    if (srcEx && !dstEx)
      return {
        category: 'OUTFLOW',
        bias: 'bullish',
        emoji: '🟢',
        note: 'BTC off an exchange (accumulation/withdrawal)',
      };
    if (srcEx && dstEx)
      return {
        category: 'INTER_EXCHANGE',
        bias: 'neutral',
        emoji: '🔵',
        note: 'Exchange → exchange',
      };

    const srcDefi = isDefi(a.from);
    const dstDefi = isDefi(a.to);
    if (dstDefi && !srcDefi)
      return {
        category: 'DEFI_DEPOSIT',
        bias: 'neutral',
        emoji: '🟣',
        note: 'BTC into a DeFi protocol (collateral/yield, not a sale)',
      };
    if (srcDefi && !dstDefi)
      return {
        category: 'DEFI_WITHDRAWAL',
        bias: 'neutral',
        emoji: '🟣',
        note: 'BTC out of a DeFi protocol (watch where it goes next)',
      };

    return { category: 'OTC', bias: 'neutral', emoji: '🟡', note: 'Private/OTC transfer' };
  }

  if (isStable) {
    if (a.isBurn)
      return {
        category: 'STABLE_BURN',
        bias: 'bearish',
        emoji: '⚫',
        note: 'Stablecoin burn (removes liquidity)',
      };
    if (a.isMint)
      return {
        category: 'STABLE_MINT',
        bias: 'bullish_latent',
        emoji: '💵',
        note: 'Stablecoin mint (potential dry powder)',
      };
    if (isTreasury(a.to))
      return {
        category: 'STABLE_REDEMPTION',
        bias: 'bearish',
        emoji: '⚫',
        note: 'Stable to Treasury (redemption, removes liquidity)',
      };
    if (isExchange(a.to))
      return {
        category: 'STABLE_TO_EXCHANGE',
        bias: 'bullish',
        emoji: '💵',
        note: 'Stable to an exchange (buying powder)',
      };
    if (isDefi(a.to) && !isDefi(a.from))
      return {
        category: 'STABLE_TO_DEFI',
        bias: 'neutral',
        emoji: '🟣',
        note: 'Stable into a DeFi protocol (collateral/yield, not a purchase)',
      };
    if (isDefi(a.from) && !isDefi(a.to))
      return {
        category: 'STABLE_FROM_DEFI',
        bias: 'neutral',
        emoji: '🟣',
        note: 'Stable out of a DeFi protocol (watch where it goes next)',
      };

    return {
      category: 'STABLE_OTHER',
      bias: 'neutral',
      emoji: '⚪',
      note: 'Neutral stable movement',
    };
  }

  return { category: 'OTHER', bias: 'neutral', emoji: '⚪', note: 'Other asset' };
};

export const analyzeFlows = (alerts: WhaleAlert[]): FlowAnalysis => {
  const classified: ClassifiedAlert[] = alerts.map((a) => ({
    ...a,
    flow: classifyAlert(a),
    materiality: materialityTag(a),
  }));

  let netBtc = 0;
  let inflowBtc = 0;
  let outflowBtc = 0;
  let inflowUsd = 0;
  let outflowUsd = 0;
  const stable = { mint: 0, burn: 0, redemption: 0, toExchange: 0 };

  for (const a of classified) {
    if (a.symbol === 'BTC' && a.amount != null) {
      if (a.flow.category === 'INFLOW') {
        inflowBtc += a.amount;
        inflowUsd += a.valueUsd ?? 0;
        netBtc -= a.amount;
      } else if (a.flow.category === 'OUTFLOW') {
        outflowBtc += a.amount;
        outflowUsd += a.valueUsd ?? 0;
        netBtc += a.amount;
      }
    }
    if (a.symbol != null && STABLES.has(a.symbol) && a.valueUsd != null) {
      if (a.flow.category === 'STABLE_MINT') stable.mint += a.valueUsd;
      else if (a.flow.category === 'STABLE_BURN') stable.burn += a.valueUsd;
      else if (a.flow.category === 'STABLE_REDEMPTION') stable.redemption += a.valueUsd;
      else if (a.flow.category === 'STABLE_TO_EXCHANGE') stable.toExchange += a.valueUsd;
    }
  }

  const signalOf = (net: number): FlowSignal =>
    net > 0 ? 'BULLISH' : net < 0 ? 'BEARISH' : 'NEUTRAL';

  const netSignal = signalOf(outflowBtc - inflowBtc);
  // By USD magnitude, independent of the BTC-count signal. When the two differ
  // (three small outflows against one huge inflow) the USD one is the real one:
  // both are reported so the conflict is explicit rather than averaged away.
  const netUsd = outflowUsd - inflowUsd;
  const netSignalUsd = signalOf(netUsd);

  const times = alerts.map((a) => a.timestamp).filter((t): t is number => t != null);

  return {
    classified,
    netBtc,
    inflowBtc,
    outflowBtc,
    inflowUsd,
    outflowUsd,
    netUsd,
    netSignal,
    netSignalUsd,
    signalConflict:
      netSignal !== netSignalUsd && (netSignal !== 'NEUTRAL' || netSignalUsd !== 'NEUTRAL'),
    stable,
    window: times.length
      ? { from: Math.min(...times), to: Math.max(...times) }
      : { from: null, to: null },
  };
};

// ─── Skew and Vol Lab ─────────────────────────────────────────────────────────

/** Percentile bands for the 30-day skew percentile. */
const SKEW_PCTL_LOW = 20;
const SKEW_PCTL_HIGH = 80;
/** Minimum distance from the historical mean before calling a bias. */
const SKEW_VS_HIST_MIN = 1;
/** Minimum front-vs-back gap before calling the curve sloped. */
const SKEW_SLOPE_MIN = 1;

const mean = (xs: number[]): number | null =>
  xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length;

/** "7D" → 7. Skew expiries arrive as labels, not dates. */
const expiryDays = (label: string): number | null => {
  const m = /^(\d+)D$/.exec(label);
  return m ? Number(m[1]) : null;
};

/**
 * 25-delta skew: how much downside protection costs against its own history, and
 * whether that fear is concentrated in the front of the curve.
 */
export const analyzeSkew = (s: SkewResult | null): SkewRead | null => {
  if (!s?.ok) return null;

  // Positive = put skew LESS negative than its mean = hedging costs less.
  const vsHistorical =
    s.putSkew != null && s.historicalAverage != null ? s.putSkew - s.historicalAverage : null;

  let percentileRegime: SkewRead['percentileRegime'] = 'NORMAL';
  if (s.p30 != null) {
    if (s.p30 <= SKEW_PCTL_LOW) percentileRegime = 'LOW';
    else if (s.p30 >= SKEW_PCTL_HIGH) percentileRegime = 'HIGH';
  }

  // Term structure: front (≤7D) vs back (≥90D). A front more negative than the
  // back means the fear sits on the near expiry (event hedging) rather than
  // being structural.
  const front = mean(
    s.byExpiry.filter((e) => (expiryDays(e.expiry) ?? 999) <= 7).map((e) => e.skew25)
  );
  const back = mean(
    s.byExpiry.filter((e) => (expiryDays(e.expiry) ?? 0) >= 90).map((e) => e.skew25)
  );
  let termStructure: SkewRead['termStructure'] = 'FLAT';
  if (front != null && back != null) {
    if (front < back - SKEW_SLOPE_MIN) termStructure = 'FRONT_FEAR';
    else if (front > back + SKEW_SLOPE_MIN) termStructure = 'BACK_FEAR';
  }

  // The bias comes from the distance to the historical mean, not the percentile:
  // the sign of `putSkew − historicalAverage` is unambiguous (more negative =
  // hedging costs more), while the percentile scale the API publishes does not
  // document whether it ranks the signed value or the magnitude of the fear.
  let bias: SkewBias = 'NEUTRAL';
  if (vsHistorical != null) {
    if (vsHistorical <= -SKEW_VS_HIST_MIN) bias = 'EXPENSIVE_HEDGING';
    else if (vsHistorical >= SKEW_VS_HIST_MIN) bias = 'COMPLACENCY';
  }

  // The percentile is corroboration only. If it points the opposite way to the
  // historical mean, the scale is not the convention assumed here — which has to
  // be said rather than propagated as a reading that may be inverted.
  const percentileDisagrees =
    (bias === 'EXPENSIVE_HEDGING' && percentileRegime === 'LOW') ||
    (bias === 'COMPLACENCY' && percentileRegime === 'HIGH');

  return {
    vsHistorical,
    percentileRegime,
    termStructure,
    termStructureLabel:
      termStructure === 'FRONT_FEAR'
        ? 'fear concentrated in the front of the curve (event hedging)'
        : termStructure === 'BACK_FEAR'
          ? 'structural long-dated fear, quiet front end'
          : 'flat across expiries',
    front,
    back,
    bias,
    biasLabel:
      bias === 'EXPENSIVE_HEDGING'
        ? '🔴 Protection EXPENSIVE vs its historical mean (fear; contrarian bullish at extremes)'
        : bias === 'COMPLACENCY'
          ? '🟠 Protection CHEAP vs its historical mean (complacency; risk underpriced)'
          : '⚪ Skew in its normal range',
    percentileDisagrees,
  };
};

/** |z| at which the skew risk premium counts as stretched against its own window. */
const SKEW_RP_Z_EXTREME = 1.5;
const SKEW_RP_Z_HIGH = 1.0;

/**
 * Vol Lab: how stretched the skew risk premium is, and whether what is implied
 * contradicts what has actually been realised.
 */
export const analyzeVolLab = (v: VolLabResult | null): VolLabRead | null => {
  if (!v?.ok) return null;

  const z = v.skewRpZ;
  let stretch: VolLabRead['stretch'] = 'NORMAL';
  if (z != null) {
    if (Math.abs(z) >= SKEW_RP_Z_EXTREME) stretch = 'EXTREME';
    else if (Math.abs(z) >= SKEW_RP_Z_HIGH) stretch = 'ELEVATED';
  }

  // Implied and realised ρ with opposite signs: the market is paying for a
  // spot-vol correlation that recent reality is NOT confirming.
  const rhoDivergence =
    v.rhoImp != null &&
    v.rhoR != null &&
    Math.sign(v.rhoImp) !== 0 &&
    Math.sign(v.rhoR) !== 0 &&
    Math.sign(v.rhoImp) !== Math.sign(v.rhoR);

  // Realised vol-of-vol far above implied = the market is underpricing how much
  // volatility itself is moving.
  const vvolGap = v.nuR != null && v.nuImp != null ? v.nuR - v.nuImp : null;

  return {
    signal: v.signal,
    signalLabel:
      v.signal === 'BUY_SKEW'
        ? '🟢 BUY_SKEW (the skew premium trades cheap: buy protection/skew)'
        : v.signal === 'SELL_SKEW'
          ? '🔴 SELL_SKEW (the skew premium trades rich: sell skew)'
          : '⚪ WAIT (no actionable signal)',
    stretch,
    rhoDivergence,
    vvolGap,
    vvolUnderpriced: vvolGap != null && vvolGap > 0,
  };
};
