import type { GammaResult, KlineBucket, ParsedCvd } from './types';

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

// ─── Gamma exposure snapshot (cryptogamma.io) ─────────────────────────────────

export const parseGamma = (data: unknown): GammaResult => {
  const d = data as Record<string, never> | null;
  if (!d || d['@type'] !== ('Dataset' as never)) {
    return { ok: false };
  }
  const obj = data as Record<string, Record<string, unknown> | string | undefined>;
  const m = (obj.metrics ?? {}) as Record<string, unknown>;
  const s = (obj.squeezeLevels ?? {}) as Record<string, unknown>;
  const v = (obj.volatilityData ?? {}) as Record<string, unknown>;
  const fd = (obj.flowData ?? {}) as Record<string, unknown>;
  const r = (obj.riskMetrics ?? {}) as Record<string, unknown>;

  const callGamma = toNum(m.callGamma);
  const putGamma = toNum(m.putGamma);

  // The API sometimes returns a well-formed Dataset stuffed with placeholders
  // (net/call/put gamma at zero + fixed ~$48-52K levels that don't match spot).
  // Without real call/put gamma the snapshot is unusable: flag it unavailable
  // instead of propagating misleading levels into the analysis.
  if (!callGamma && !putGamma) {
    return { ok: false, degraded: true };
  }

  return {
    ok: true,
    asset: (obj.asset as string | undefined) ?? null,
    source: (obj.source as string | undefined) ?? null,
    generatedAt:
      (obj.generatedAt as string | undefined) ?? (obj.dateModified as string | undefined) ?? null,
    netGamma: toNum(m.netGamma),
    callGamma,
    putGamma,
    bias: (m.bias as string | undefined) ?? null,
    putCallRatio: toNum(m.putCallRatio),
    callWeighted: toNum(m.callWeighted),
    currentPrice: toNum(s.currentPrice),
    support: toNum(s.support),
    resistance: toNum(s.resistance),
    breakout: toNum(s.breakout),
    realizedVol: toNum(v.realizedVol),
    impliedVol: toNum(v.impliedVol),
    volPremium: toNum(v.volPremium),
    callFlow: toNum(fd.callFlow),
    putFlow: toNum(fd.putFlow),
    flowCpRatio: toNum(fd.cpRatio),
    deltaHedging: (r.deltaHedging as string | undefined) ?? null,
    squeezeRisk: (r.squeezeRisk as string | undefined) ?? null,
    pinRisk: (r.pinRisk as string | undefined) ?? null,
  };
};
