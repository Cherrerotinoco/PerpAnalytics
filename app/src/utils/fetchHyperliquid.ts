import { HyperliquidFill } from './normalizeHyperliquid';

/**
 * Hyperliquid's public `info` endpoint.
 *
 * Called straight from the browser, like Jupiter and Pacifica: it needs no key,
 * costs nothing and has no per-account quota, so proxying it through our own
 * server would only add a hop and a bill.
 */

const INFO_URL = 'https://api.hyperliquid.xyz/info';

/** The venue returns at most this many fills per call. */
const PAGE_SIZE = 2000;
/** Stop runaway paging if the endpoint ever stops advancing. */
const MAX_PAGES = 50;

export class HyperliquidError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = 'HyperliquidError';
  }
}

const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export const isEvmAddress = (value: string): boolean => EVM_ADDRESS_RE.test(value.trim());

const postInfo = async <T>(body: unknown, signal?: AbortSignal): Promise<T> => {
  const res = await fetch(INFO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    throw new HyperliquidError(
      res.status === 429
        ? 'Hyperliquid is rate limiting this IP. Try again in a moment.'
        : `Hyperliquid request failed (${res.status}).`,
      res.status
    );
  }
  return (await res.json()) as T;
};

/**
 * Every fill for an address, oldest first.
 *
 * `userFillsByTime` caps each answer at 2,000 rows, so pages walk forward in
 * time. The cursor is moved to the newest row seen rather than past it, because
 * several fills can share a millisecond and stepping over the boundary would
 * drop the rest of them — duplicates from the overlap are removed by `tid`.
 */
export const fetchHyperliquidFills = async (
  address: string,
  opts: { signal?: AbortSignal; startTime?: number } = {}
): Promise<HyperliquidFill[]> => {
  const user = address.trim();
  if (!isEvmAddress(user)) {
    throw new HyperliquidError('Not a valid EVM address.');
  }

  const seen = new Set<number>();
  const all: HyperliquidFill[] = [];
  let startTime = opts.startTime ?? 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    const batch = await postInfo<HyperliquidFill[]>(
      { type: 'userFillsByTime', user, startTime },
      opts.signal
    );
    if (!Array.isArray(batch) || batch.length === 0) {
      break;
    }

    let newest = startTime;
    let added = 0;
    for (const fill of batch) {
      if (!seen.has(fill.tid)) {
        seen.add(fill.tid);
        all.push(fill);
        added++;
      }
      if (fill.time > newest) {
        newest = fill.time;
      }
    }

    // A short page means we reached the end of the history.
    if (batch.length < PAGE_SIZE) {
      break;
    }
    // A full page that advanced neither the clock nor the set would loop for
    // ever: more than PAGE_SIZE fills share one millisecond.
    if (newest <= startTime && added === 0) {
      break;
    }
    startTime = newest;
  }

  return all.sort((a, b) => a.time - b.time || a.tid - b.tid);
};

// ─── Open positions ───────────────────────────────────────────────────────────
export interface HyperliquidOpenPosition {
  coin: string;
  /** Signed size: negative is short. */
  size: number;
  entryPrice: number | null;
  unrealizedPnl: number;
  leverage: number | null;
}

interface ClearinghouseState {
  marginSummary?: { accountValue?: string };
  assetPositions?: Array<{
    position?: {
      coin?: string;
      szi?: string;
      entryPx?: string | null;
      unrealizedPnl?: string;
      leverage?: { value?: number };
    };
  }>;
}

/**
 * Current account value and open positions.
 *
 * Separate from fills on purpose: an open position has no realized PnL and so
 * is not a `Trade`, but the dashboard still wants to show what is live.
 */
export const fetchHyperliquidAccount = async (
  address: string,
  opts: { signal?: AbortSignal } = {}
): Promise<{ accountValueUsd: number; positions: HyperliquidOpenPosition[] }> => {
  const user = address.trim();
  if (!isEvmAddress(user)) {
    throw new HyperliquidError('Not a valid EVM address.');
  }

  const state = await postInfo<ClearinghouseState>(
    { type: 'clearinghouseState', user },
    opts.signal
  );

  const toNum = (s: string | null | undefined): number => {
    const n = Number.parseFloat(s ?? '');
    return Number.isFinite(n) ? n : 0;
  };

  return {
    accountValueUsd: toNum(state.marginSummary?.accountValue),
    positions: (state.assetPositions ?? [])
      .map((entry) => entry.position)
      .filter((p): p is NonNullable<typeof p> => !!p && !!p.coin)
      .map((p) => ({
        coin: p.coin as string,
        size: toNum(p.szi),
        entryPrice: p.entryPx != null ? toNum(p.entryPx) : null,
        unrealizedPnl: toNum(p.unrealizedPnl),
        leverage: p.leverage?.value ?? null,
      }))
      .filter((p) => p.size !== 0),
  };
};
