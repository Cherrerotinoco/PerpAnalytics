import { computeGex } from './gex';
import type { GammaResult, KlineBucket, OptionsChain, ParsedCvd } from './types';

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
