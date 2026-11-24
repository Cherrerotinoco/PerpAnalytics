import { computeGex } from './gex';
import type {
  GammaResult,
  KlineBucket,
  OptionsChain,
  ParsedCvd,
  PricedMetric,
  SkewByExpiry,
  SkewResult,
  SkewSnapshot,
  ValuedMetric,
  VolLabResult,
  VolLabSnapshot,
  WhaleAlert,
  WhaleMetrics,
} from './types';

/** "60,270", "-7.55e+08", "1,685" → Number. null when unparseable. */
export const toNum = (raw: unknown): number | null => {
  if (raw == null) return null;
  const n = Number(String(raw).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
};

// ─── CVD from Binance klines ──────────────────────────────────────────────────

// A Binance kline is a positional array:
//   [0]openTime [1]open [2]high [3]low [4]close [5]volume(base) [6]closeTime
//   [7]quoteVolume [8]numTrades [9]takerBuyBase [10]takerBuyQuote [11]ignore
// takerBuyBase is the volume whose AGGRESSOR (taker) was a buyer, so the candle
// delta comes straight out without classifying trades one by one.
const parseKlineBucket = (k: unknown): KlineBucket | null => {
  if (!Array.isArray(k)) return null;
  const volume = toNum(k[5]);
  const takerBuyBase = toNum(k[9]);
  if (volume == null || takerBuyBase == null) return null;
  const sellBtc = volume - takerBuyBase;
  const quoteVolume = toNum(k[7]);
  const takerBuyQuote = toNum(k[10]);
  // USD delta from quote volume — truer than aggregating price · amount.
  const deltaUsd =
    quoteVolume != null && takerBuyQuote != null
      ? takerBuyQuote - (quoteVolume - takerBuyQuote)
      : null;
  return {
    openTime: toNum(k[0]),
    price: toNum(k[4]),
    volume,
    buyBtc: takerBuyBase,
    sellBtc,
    deltaBtc: takerBuyBase - sellBtc,
    deltaUsd,
  };
};

/** `data` = array of Binance klines, ascending by openTime. */
export const parseCvd = (data: unknown): ParsedCvd => {
  if (!Array.isArray(data)) return { ok: false, buckets: [] };
  const buckets = data.map(parseKlineBucket).filter((b): b is KlineBucket => b !== null);
  return { ok: buckets.length > 0, buckets };
};

// ─── Gamma exposure from the options chain (basischarts) ──────────────────────

/**
 * The endpoint returns the RAW options chain, not aggregated metrics, so the whole
 * computation lives in gex.ts and this only validates the response shape and applies
 * the same degradation rule the previous provider had.
 */
export const parseGamma = (data: unknown): GammaResult => {
  const chain = data as OptionsChain | null;
  if (!chain || !Array.isArray(chain.quotes)) {
    return { ok: false };
  }

  const parsed = computeGex(chain);

  // Well-formed response with nothing usable in it: empty chain, all open interest
  // at zero, or no index price. Without real call/put gamma the snapshot is useless:
  // flag it unavailable instead of propagating misleading levels into the analysis.
  if (!parsed || (!parsed.callGamma && !parsed.putGamma)) {
    return { ok: false, degraded: true };
  }

  return parsed;
};

// ─── Whale Alert ──────────────────────────────────────────────────────────────

/**
 * One CSV line, respecting double quotes.
 *
 * Whale Alert serves each alert as a single CSV string, and the value fields
 * contain commas inside quotes, so splitting on commas alone tears them apart.
 */
const parseCsvLine = (line: string): string[] => {
  const fields: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === ',' && !inQuotes) {
      fields.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  fields.push(cur);
  return fields;
};

/** Format: timestamp,emojis,"amount #SYMBOL","value USD","description",url */
export const parseAlert = (raw: unknown): WhaleAlert | null => {
  if (typeof raw !== 'string') return null;
  const f = parseCsvLine(raw);
  if (f.length < 6) return null;

  const timestamp = toNum(f[0]);
  const emojis = f[1] || '';
  const amountField = (f[2] || '').trim();
  const valueUsd = toNum((f[3] || '').replace(/USD/i, ''));
  const description = (f[4] || '').trim();

  const amtMatch = /^([\d.,]+)\s*#?([A-Za-z0-9]+)/.exec(amountField);
  const amount = amtMatch ? toNum(amtMatch[1]) : null;
  const symbol = amtMatch ? amtMatch[2].toUpperCase() : null;

  const burstCount = (emojis.match(/🚨/gu) ?? []).length;
  const isMint = /💵/u.test(emojis) || /minted/i.test(description);
  const isBurn = /🔥/u.test(emojis) || /burn(ed|t)?/i.test(description);

  // source → destination
  let from: string | null = null;
  let to: string | null = null;
  const flowMatch = /from\s+(.+?)\s+to\s+(.+)$/i.exec(description);
  if (flowMatch) {
    from = flowMatch[1].trim();
    to = flowMatch[2].trim();
  } else {
    // A mint or a burn has only one side.
    const atMatch = /\b(?:minted|burned|burnt)\s+at\s+(.+)$/i.exec(description);
    if (atMatch) to = atMatch[1].trim();
  }

  return {
    timestamp,
    isoTime: timestamp != null ? new Date(timestamp * 1000).toISOString() : null,
    emojis,
    burstCount,
    isMint,
    isBurn,
    amount,
    symbol,
    valueUsd,
    description,
    from,
    to,
  };
};

interface RawMetric {
  s?: unknown;
  p?: unknown;
  v?: unknown;
  c?: unknown;
  d?: unknown;
}

const asRecord = (v: unknown): Record<string, unknown> | null =>
  typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null;

const metricPriced = (obj: unknown): PricedMetric | null => {
  const o = asRecord(obj) as RawMetric | null;
  if (!o) return null;
  return { symbol: typeof o.s === 'string' ? o.s : null, price: toNum(o.p), changePct: toNum(o.c) };
};

const metricValued = (obj: unknown): ValuedMetric | null => {
  const o = asRecord(obj) as RawMetric | null;
  if (!o) return null;
  return { symbol: typeof o.s === 'string' ? o.s : null, value: toNum(o.v), changePct: toNum(o.c) };
};

/** HODL reports its figure under `d`, not `v`. */
const metricHodl = (obj: unknown): ValuedMetric | null => {
  const o = asRecord(obj) as RawMetric | null;
  if (!o) return null;
  return { symbol: typeof o.s === 'string' ? o.s : null, value: toNum(o.d), changePct: toNum(o.c) };
};

export const parseWhaleAlert = (data: unknown): WhaleMetrics => {
  const d = asRecord(data);
  const rawAlerts = Array.isArray(d?.alerts) ? d.alerts : [];
  const alerts = rawAlerts.map(parseAlert).filter((a): a is WhaleAlert => a !== null);
  // Most recent first.
  alerts.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));

  return {
    alerts,
    prices: metricPriced(d?.prices),
    averageBuyPrice: metricPriced(d?.average_buy_price),
    realizedProfit: metricValued(d?.realized_profit),
    potentialProfit: metricValued(d?.potential_profit),
    volume: metricValued(d?.volume),
    hodl: metricHodl(d?.hodl),
    // `news` is intentionally dropped — see WhaleMetrics in types.ts.
  };
};

// ─── Skew and Vol Lab ─────────────────────────────────────────────────────────

const isDataset = (data: unknown): Record<string, unknown> | null => {
  const d = asRecord(data);
  return d && d['@type'] === 'Dataset' ? d : null;
};

/**
 * 25-delta skew: how much more the downside put costs than the upside call, its
 * historical percentile and its term structure.
 */
export const parseSkew = (data: unknown): SkewResult => {
  const d = isDataset(data);
  if (!d) return { ok: false };

  const s = asRecord(d.skew) ?? {};
  const p = asRecord(d.percentiles) ?? {};
  const a = asRecord(d.anomaly) ?? {};
  const se = asRecord(d.sentiment) ?? {};
  const rawByExpiry = Array.isArray(d.skew25ByExpiry) ? d.skew25ByExpiry : [];

  const byExpiry = rawByExpiry
    .map((e) => {
      const o = asRecord(e);
      return { expiry: typeof o?.expiry === 'string' ? o.expiry : null, skew25: toNum(o?.skew25) };
    })
    .filter((e): e is SkewByExpiry => e.expiry !== null && e.skew25 !== null);

  const parsed: SkewSnapshot = {
    ok: true,
    asset: typeof d.asset === 'string' ? d.asset : null,
    source: typeof d.source === 'string' ? d.source : null,
    generatedAt:
      typeof d.generatedAt === 'string'
        ? d.generatedAt
        : typeof d.dateModified === 'string'
          ? d.dateModified
          : null,
    putSkew: toNum(s.putSkew),
    callSkew: toNum(s.callSkew),
    historicalAverage: toNum(s.historicalAverage),
    marketSentiment: typeof se.marketSentiment === 'string' ? se.marketSentiment : null,
    p30: toNum(p.thirtyDay),
    p90: toNum(p.ninetyDay),
    p1y: toNum(p.oneYear),
    anomalyDetected: a.detected === true,
    anomalyMessage: typeof a.message === 'string' ? a.message : null,
    anomalySeverity: typeof a.severity === 'string' ? a.severity : null,
    byExpiry,
  };

  // Same rule as gamma: a Dataset with neither a skew value nor a curve is a
  // placeholder, not a usable snapshot.
  if (parsed.putSkew === null && parsed.byExpiry.length === 0) return { ok: false, degraded: true };
  return parsed;
};

/**
 * Vol Lab (Ravagli 2024): surface parameters and the skew risk-premium signal.
 *
 * Only the length of `surfaces` is kept: the analysis works off the `summary`
 * aggregates, which already condense that window.
 */
export const parseVolLab = (data: unknown): VolLabResult => {
  const d = isDataset(data);
  if (!d) return { ok: false };

  const r = asRecord(d.realized) ?? {};
  const su = asRecord(d.summary) ?? {};
  const surfaces = Array.isArray(d.surfaces) ? d.surfaces : [];

  const parsed: VolLabSnapshot = {
    ok: true,
    asset: typeof d.asset === 'string' ? d.asset : null,
    source: typeof d.source === 'string' ? d.source : null,
    generatedAt:
      typeof d.generatedAt === 'string'
        ? d.generatedAt
        : typeof d.dateModified === 'string'
          ? d.dateModified
          : null,
    expiry: typeof d.expiry === 'string' ? d.expiry : null,
    tauDays: toNum(d.tauDays),
    signal: typeof su.signal === 'string' ? su.signal : null,
    skewRpZ: toNum(su.skew_rp_z),
    avgSkewRp: toNum(su.avg_skew_rp),
    avgRr: toNum(su.avg_rr),
    avgFly: toNum(su.avg_fly),
    hedgeN: toNum(su.hedge_n),
    nuImp: toNum(su.avg_nu_imp),
    rhoImp: toNum(su.avg_rho_imp),
    nuR: toNum(r.nu_R),
    rhoR: toNum(r.rho_R),
    days: surfaces.length,
  };

  if (parsed.signal === null && parsed.skewRpZ === null) return { ok: false, degraded: true };
  return parsed;
};
