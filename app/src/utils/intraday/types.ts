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

// ─── Raw options chain (basischarts) ──────────────────────────────────────────
// The endpoint serves the chain itself, not aggregated metrics, so every GEX
// figure below is derived in gex.ts. Fields are optional on purpose: the response
// is third-party JSON and gex.ts guards every read with a finiteness check rather
// than trusting the shape.

/** One option quote as the endpoint serves it. */
export interface OptionQuote {
  instrument?: string;
  /** Expiry in ms since epoch. */
  expiry?: number;
  strike?: number;
  /** 'call' | 'put' — anything else is treated as a put. */
  kind?: string;
  /** Forward price for that expiry; Black-76 works off this, not spot. */
  forward?: number;
  /** Mark IV as a FRACTION (0.55 = 55%), already normalised by the endpoint. */
  markIv?: number;
  /** Open interest in BTC — already base-currency, NOT in contracts. */
  openInterest?: number;
  /** 24h gross aggressor volume in BTC. */
  volume24h?: number;
  /**
   * Contract multiplier. Present in the payload but deliberately UNUSED: openInterest
   * and volume24h are already normalised to BTC, so applying it sinks OKX/Bybit 100×.
   */
  contractSize?: number;
  venue?: string;
}

/** One point of the `dvol` / `realizedVol` series, in percent, ascending by time. */
export interface VolPoint {
  time: number;
  value: number;
}

/** Per-venue fetch outcome the endpoint reports; `ok: false` = that venue is down. */
export interface VenueSource {
  venue?: string;
  ok?: boolean;
}

export interface OptionsChain {
  venue?: string;
  underlying?: string;
  /** Index (spot) price, the reference every level is measured against. */
  indexPrice?: number;
  /** Server-side fetch timestamp in ms; used as "now" for residual life. */
  fetchedAt?: number;
  quotes: OptionQuote[];
  dvol?: VolPoint[];
  realizedVol?: VolPoint[];
  sources?: VenueSource[];
  reference?: string;
}

/** One expiry bucket of the gamma term structure. */
export interface GammaByExpiry {
  /** Expiry timestamp in ms. */
  expiry: number;
  /** YYYY-MM-DD, for the axis. */
  label: string;
  daysOut: number;
  /** Signed gamma in millions of USD of delta per 1% move. */
  gamma: number;
}

/** One expiry column of the gamma grid. */
export interface GammaGridExpiry {
  /** Expiry timestamp in ms. */
  expiry: number;
  /** YYYY-MM-DD, for the tooltip. */
  label: string;
  /** Whole days to expiry — the axis label. */
  daysOut: number;
}

/**
 * Signed gamma over price × expiry.
 *
 * Both axes are windowed to spot ±15%, so a column sums to the gamma that expiry
 * carries INSIDE the price window, not its all-strikes total — `gammaByExpiry`
 * keeps the latter.
 */
export interface GammaGrid {
  /** Price bucket lower edges, highest first — the Y axis. */
  strikes: number[];
  /** Expiries, nearest first — the X axis. */
  expiries: GammaGridExpiry[];
  /** `cells[row][col]` in M$ of delta per 1% move; row indexes `strikes`. */
  cells: number[][];
  /** Index into `strikes` of the bucket holding spot; -1 if outside the window. */
  spotRow: number;
  /** Bucket width in USD. */
  bucket: number;
}

/**
 * Aggregated gamma exposure, computed in gex.ts from the chain above.
 *
 * ⚠️ Units: `netGamma`, `callGamma` and `putGamma` are MILLIONS OF USD of delta per
 * 1% move in spot. They are NOT comparable with the scale the old cryptogamma
 * endpoint served — read the sign and the trend between pulls, never the absolute
 * level against older readings.
 */
export interface GammaSnapshot {
  ok: true;
  asset: string | null;
  source: string | null;
  generatedAt: string | null;
  netGamma: number | null;
  callGamma: number | null;
  putGamma: number | null;
  /** Profile asymmetry (|gamma| above vs below spot), NOT the sign of netGamma. */
  bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | null;
  /** % of |gamma| sitting above spot — the raw figure `bias` buckets. */
  gammaAbovePct: number | null;
  /** Puts/calls by open interest in BTC. */
  putCallRatio: number | null;
  /** % of total |gamma| contributed by calls. */
  callWeighted: number | null;
  currentPrice: number | null;
  support: number | null;
  resistance: number | null;
  /** Gamma flip: the SPOT price where aggregate gamma changes sign. null = no crossing. */
  breakout: number | null;
  realizedVol: number | null;
  impliedVol: number | null;
  volPremium: number | null;
  /** GROSS 24h call volume in BTC (never negative — not a net flow). */
  callFlow: number | null;
  /** GROSS 24h put volume in BTC. */
  putFlow: number | null;
  flowCpRatio: number | null;
  /** Always null: a proprietary label of the old provider, not derivable from the chain. */
  deltaHedging: null;
  /** Always null: same reason as deltaHedging. */
  squeezeRisk: null;
  pinRisk: string | null;
  /** Strike holding the most raw |gamma|. */
  pinLevel: number | null;
  /** Share of total |gamma| that strike holds, 0–1. */
  pinShare: number | null;
  contractsUsed: number;
  /** Contracts with open interest dropped for expiry or unusable IV. */
  contractsSkipped: number;
  venuesDown: string[];
  /** true = at least one venue is down, so the aggregate is understated. */
  partial: boolean;
  venues: string[];
  gammaByVenue: Record<string, number | null>;
  /**
   * Signed gamma per expiry across EVERY strike, nearest first — the term
   * structure. `gammaGrid` splits the same exposure by price as well, but only
   * within its window, so this stays the full-book figure.
   */
  gammaByExpiry: GammaByExpiry[];
  /** Signed gamma over price × expiry. */
  gammaGrid: GammaGrid;
}

/** `degraded` = well-formed chain but nothing usable in it (no OI, no index price). */
export interface GammaUnavailable {
  ok: false;
  degraded?: boolean;
}

export type GammaResult = GammaSnapshot | GammaUnavailable;

export type GammaRegimeKind = 'AMPLIFIED_VOL' | 'MEAN_REVERSION' | 'NEUTRAL';

/**
 * Flags are tri-state: `null` means the input was missing. Collapsing absence and
 * a negative reading into `false` made the UI print the negative read ("offensive",
 * "options cover the move") when there was simply no data.
 */
export interface GammaRegime {
  regime: GammaRegimeKind;
  regimeLabel: string;
  isPin: boolean;
  pinLevel: number | null;
  defensive: boolean | null;
  volPremiumNegative: boolean | null;
  realizedGtImplied: boolean | null;
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

// ─── Whale Alert ──────────────────────────────────────────────────────────────

/** The directional category one transfer falls into. */
export type FlowCategory =
  | 'INFLOW'
  | 'OUTFLOW'
  | 'INTER_EXCHANGE'
  | 'DEFI_DEPOSIT'
  | 'DEFI_WITHDRAWAL'
  | 'OTC'
  | 'STABLE_MINT'
  | 'STABLE_BURN'
  | 'STABLE_REDEMPTION'
  | 'STABLE_TO_EXCHANGE'
  | 'STABLE_TO_DEFI'
  | 'STABLE_FROM_DEFI'
  | 'STABLE_OTHER'
  | 'OTHER';

export type FlowBias = 'bullish' | 'bearish' | 'neutral' | 'bullish_latent';

export interface FlowClass {
  category: FlowCategory;
  bias: FlowBias;
  emoji: string;
  note: string;
}

/** One Whale Alert transfer, parsed from its CSV line. */
export interface WhaleAlert {
  timestamp: number | null;
  isoTime: string | null;
  emojis: string;
  /** How many 🚨 the alert carries — Whale Alert's own size emphasis. */
  burstCount: number;
  isMint: boolean;
  isBurn: boolean;
  amount: number | null;
  symbol: string | null;
  valueUsd: number | null;
  description: string;
  from: string | null;
  to: string | null;
}

export interface ClassifiedAlert extends WhaleAlert {
  flow: FlowClass;
  /** Size label, or null when the transfer is under every threshold. */
  materiality: string | null;
}

export type FlowSignal = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

export interface FlowAnalysis {
  classified: ClassifiedAlert[];
  netBtc: number;
  inflowBtc: number;
  outflowBtc: number;
  inflowUsd: number;
  outflowUsd: number;
  netUsd: number;
  netSignal: FlowSignal;
  /** By USD magnitude rather than by BTC count — the two can disagree. */
  netSignalUsd: FlowSignal;
  signalConflict: boolean;
  stable: { mint: number; burn: number; redemption: number; toExchange: number };
  window: { from: number | null; to: number | null };
}

export interface PricedMetric {
  symbol: string | null;
  price: number | null;
  changePct: number | null;
}

export interface ValuedMetric {
  symbol: string | null;
  value: number | null;
  changePct: number | null;
}

/**
 * Whale Alert's market metrics.
 *
 * News is deliberately not parsed even though the endpoint returns it: headlines
 * lag price, so they are excluded from this analysis.
 */
export interface WhaleMetrics {
  alerts: WhaleAlert[];
  prices: PricedMetric | null;
  averageBuyPrice: PricedMetric | null;
  realizedProfit: ValuedMetric | null;
  potentialProfit: ValuedMetric | null;
  volume: ValuedMetric | null;
  hodl: ValuedMetric | null;
}

// ─── Options: skew and risk premium ───────────────────────────────────────────

export interface SkewByExpiry {
  expiry: string;
  skew25: number;
}

export interface SkewSnapshot {
  ok: true;
  asset: string | null;
  source: string | null;
  generatedAt: string | null;
  putSkew: number | null;
  callSkew: number | null;
  historicalAverage: number | null;
  marketSentiment: string | null;
  p30: number | null;
  p90: number | null;
  p1y: number | null;
  anomalyDetected: boolean;
  anomalyMessage: string | null;
  anomalySeverity: string | null;
  byExpiry: SkewByExpiry[];
}

export type SkewResult = SkewSnapshot | { ok: false; degraded?: boolean };

export type SkewBias = 'EXPENSIVE_HEDGING' | 'COMPLACENCY' | 'NEUTRAL';

export interface SkewRead {
  /** putSkew − historicalAverage. Positive = hedging costs less than usual. */
  vsHistorical: number | null;
  percentileRegime: 'LOW' | 'HIGH' | 'NORMAL';
  termStructure: 'FRONT_FEAR' | 'BACK_FEAR' | 'FLAT';
  termStructureLabel: string;
  front: number | null;
  back: number | null;
  bias: SkewBias;
  biasLabel: string;
  /** The percentile points the other way than the historical mean does. */
  percentileDisagrees: boolean;
}

export interface VolLabSnapshot {
  ok: true;
  asset: string | null;
  source: string | null;
  generatedAt: string | null;
  expiry: string | null;
  tauDays: number | null;
  signal: string | null;
  skewRpZ: number | null;
  avgSkewRp: number | null;
  avgRr: number | null;
  avgFly: number | null;
  hedgeN: number | null;
  nuImp: number | null;
  rhoImp: number | null;
  nuR: number | null;
  rhoR: number | null;
  days: number;
}

export type VolLabResult = VolLabSnapshot | { ok: false; degraded?: boolean };

export interface VolLabRead {
  signal: string | null;
  signalLabel: string;
  stretch: 'EXTREME' | 'ELEVATED' | 'NORMAL';
  /** Implied and realised spot-vol correlation carry opposite signs. */
  rhoDivergence: boolean;
  vvolGap: number | null;
  vvolUnderpriced: boolean;
}

/** One persisted pull, kept so the sequence survives across refreshes. */
export interface HistoryRecord {
  t: string;
  price: number | null;
  cvdSpot: number | null;
  cvdPerp: number | null;
  gammaRegime: GammaRegimeKind | null;
  /**
   * Net gamma in MILLIONS of USD of delta per 1%. Renamed from `netGamma` when the
   * endpoint changed: the old provider's scale (|values| up to ~438,000) and this one
   * (|values| ~100) are incomparable, and under the same name a reader would conclude
   * gamma had collapsed 99%.
   */
  netGammaM: number | null;
  /**
   * Realised and potential profit, in USD.
   *
   * Rule 7 reads the `realized` sequence: capitulation only counts as spent after
   * two consecutive pulls recovering towards zero. Null on every record written
   * before Whale Alert was reachable, which is why that check reports "not enough
   * history" rather than a verdict for those.
   */
  realized: number | null;
  potential: number | null;
  /**
   * Legacy: records already sitting in users' localStorage from before the endpoint
   * change. Read-only — never written again, and never charted alongside netGammaM.
   */
  netGamma?: number | null;
}

/** Everything one run of the intraday pipeline produces. */
export interface IntradaySnapshot {
  generatedAt: string;
  errors: string[];
  /**
   * Whale Alert, skew and Vol Lab are null on any pull that ran in the browser:
   * all three are CORS-blocked, so only the server-side pull (serverPull.ts) can
   * reach them. A client-side manual refresh therefore keeps whatever the server
   * rendered for these three rather than blanking them.
   */
  whale: WhaleMetrics | null;
  flows: FlowAnalysis | null;
  skew: SkewResult | null;
  skewRead: SkewRead | null;
  volLab: VolLabResult | null;
  volLabRead: VolLabRead | null;
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
