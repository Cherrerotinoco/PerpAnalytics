// ─── Intraday report types ────────────────────────────────────────────────────
// Ported from the `bitcoinAnalizer` CLI crawler (src/intraday/). Only the parts a
// browser can compute are here — see fetchers.ts for which sources are reachable
// and why.

/** One Binance 5m/1d kline reduced to its aggressor-flow figures. */
export interface KlineBucket {
  openTime: number | null;
  /** Candle close price. */
  price: number | null;
  volume: number;
  buyBtc: number;
  sellBtc: number;
  deltaBtc: number;
  deltaUsd: number | null;
}

export interface ParsedCvd {
  ok: boolean;
  buckets: KlineBucket[];
}

export type CvdSignal = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

export type FlowKind =
  | 'NEUTRAL'
  | 'BULLISH_AGGRESSION'
  | 'BEARISH_AGGRESSION'
  | 'ABSORBED_BUYING'
  | 'ABSORBED_SELLING';

export interface FlowClassification {
  kind: FlowKind;
  ratio: number;
  priceReturn: number;
}

/** Aggressor delta accumulated inside the *current* 15m/1H/4H candle. */
export interface TimeframeWindow {
  label: string;
  boundary: number;
  delta: number;
  buy: number;
  sell: number;
  bars: number;
  priceFrom: number | null;
  priceTo: number | null;
  flow: FlowClassification | null;
}

export type TimeframeKey = 'm15' | 'h1' | 'h4';

export type Timeframes = Record<TimeframeKey, TimeframeWindow>;

export interface PriceSwings {
  lows: { time: number | null; price: number | null }[];
  highs: { time: number | null; price: number | null }[];
  /** null = fewer than 2 pivots, not enough sample. */
  lowsAscending: boolean | null;
  highsDescending: boolean | null;
}

export type Divergence = 'BULLISH' | 'BEARISH' | 'CONFIRMS' | 'N/A';

export interface CvdAnalysis {
  signal: CvdSignal;
  totalCvd: number;
  ratio: number | null;
  buyBtc: number;
  sellBtc: number;
  deltaUsd: number;
  lastDelta: number;
  recentDelta: number;
  recentBars: number;
  minCvd: number | null;
  maxCvd: number | null;
  divergence: Divergence;
  priceSwings: PriceSwings;
  timeframes: Timeframes;
  priceFrom: number | null;
  priceTo: number | null;
  bars: number;
  sessionStart: number | null;
  lastBarTime: number | null;
  /** Cumulative CVD curve, for charting. */
  curve: { time: number | null; cvd: number; price: number | null }[];
}

/** One completed previous day of aggressor flow (1d candle). */
export interface DailyCvd {
  dayMs: number | null;
  delta: number;
  buy: number;
  sell: number;
  deltaUsd: number | null;
}

export interface CvdDaily {
  spot: DailyCvd[] | null;
  perp: DailyCvd[] | null;
}

export interface GammaSnapshot {
  ok: true;
  asset: string | null;
  source: string | null;
  generatedAt: string | null;
  netGamma: number | null;
  callGamma: number | null;
  putGamma: number | null;
  bias: string | null;
  putCallRatio: number | null;
  callWeighted: number | null;
  currentPrice: number | null;
  support: number | null;
  resistance: number | null;
  breakout: number | null;
  realizedVol: number | null;
  impliedVol: number | null;
  volPremium: number | null;
  callFlow: number | null;
  putFlow: number | null;
  flowCpRatio: number | null;
  deltaHedging: string | null;
  squeezeRisk: string | null;
  pinRisk: string | null;
}

/** `degraded` = well-formed Dataset but filled with placeholder zeroes. */
export interface GammaUnavailable {
  ok: false;
  degraded?: boolean;
}

export type GammaResult = GammaSnapshot | GammaUnavailable;

export type GammaRegimeKind = 'AMPLIFIED_VOL' | 'MEAN_REVERSION' | 'NEUTRAL';

export interface GammaRegime {
  regime: GammaRegimeKind;
  regimeLabel: string;
  isPin: boolean;
  pinLevel: number | null;
  defensive: boolean;
  volPremiumNegative: boolean;
  realizedGtImplied: boolean;
}

export interface CapitulationCheck {
  label: string;
  /** null = missing data, doesn't count for or against. */
  met: boolean | null;
  detail: string;
}

export interface Capitulation {
  checks: CapitulationCheck[];
  met: number;
  total: number;
  verdict: string;
}

/** One persisted pull, kept in localStorage so the sequence survives reloads. */
export interface HistoryRecord {
  t: string;
  price: number | null;
  cvdSpot: number | null;
  cvdPerp: number | null;
  gammaRegime: GammaRegimeKind | null;
  netGamma: number | null;
}

/** Everything one run of the intraday pipeline produces. */
export interface IntradaySnapshot {
  generatedAt: string;
  errors: string[];
  gamma: GammaResult | null;
  gammaRegime: GammaRegime | null;
  cvdFlows: CvdAnalysis | null;
  cvdPerpFlows: CvdAnalysis | null;
  cvdDaily: CvdDaily;
  capitulation: Capitulation;
  history: HistoryRecord[];
  /** Age of the oldest cached response backing this pull; null = all fresh. */
  cacheAgeMs: number | null;
}
