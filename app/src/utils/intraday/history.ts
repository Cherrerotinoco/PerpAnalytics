import type { CvdAnalysis, GammaRegime, GammaResult, HistoryRecord } from './types';

// The CLI crawler persists every pull to output/history.jsonl so the assistant can
// read how the numbers evolve between runs. A static site has no disk, so the
// sequence lives in localStorage instead — it is per-browser and starts empty for
// a first-time visitor.
const LS_KEY = 'tc:intraday-history-v1';

/** Pulls kept. Mirrors the 6 the CLI reads, with headroom for the chart. */
export const MAX_HISTORY = 12;

export const loadHistory = (): HistoryRecord[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((r): r is HistoryRecord => !!r && typeof (r as HistoryRecord).t === 'string')
      .slice(-MAX_HISTORY);
  } catch {
    return [];
  }
};

export const buildRecord = ({
  generatedAt,
  cvdFlows,
  cvdPerpFlows,
  gamma,
  gammaRegime,
}: {
  generatedAt: string;
  cvdFlows: CvdAnalysis | null;
  cvdPerpFlows: CvdAnalysis | null;
  gamma: GammaResult | null;
  gammaRegime: GammaRegime | null;
}): HistoryRecord => ({
  t: generatedAt,
  price: cvdFlows?.priceTo ?? null,
  cvdSpot: cvdFlows?.totalCvd ?? null,
  cvdPerp: cvdPerpFlows?.totalCvd ?? null,
  gammaRegime: gammaRegime?.regime ?? null,
  netGamma: gamma?.ok ? gamma.netGamma : null,
});

/** Two pulls are the same reading when price and both CVDs are unchanged. */
const isDuplicate = (a: HistoryRecord, b: HistoryRecord): boolean =>
  a.price === b.price && a.cvdSpot === b.cvdSpot && a.cvdPerp === b.cvdPerp;

/**
 * Appends a pull unless it repeats the previous one (Binance can serve a cached
 * candle between refreshes; a duplicate would fake a flat sequence). Returns the
 * resulting history so callers don't re-read localStorage.
 */
export const appendRecord = (
  history: HistoryRecord[],
  record: HistoryRecord
): { history: HistoryRecord[]; deduped: boolean } => {
  const last = history[history.length - 1];
  if (last && isDuplicate(last, record)) return { history, deduped: true };

  const next = [...history, record].slice(-MAX_HISTORY);
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(next));
    } catch {
      // Quota or private mode — the sequence degrades but the pull still renders.
    }
  }
  return { history: next, deduped: false };
};

export const clearHistory = (): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    // Nothing to do — the caller resets its own state either way.
  }
};
