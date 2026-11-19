/**
 * FOMO handle → wallet, via our own backend.
 *
 * The lookup upstream is metered and billed, so the key lives on the server and
 * the browser only ever sees this endpoint. The server also caches results, so
 * a handle somebody already looked up comes back instantly and for free.
 */

export interface FomoWallet {
  handle: string;
  /** The address the trader's perps settle to on Hyperliquid. */
  evm: string | null;
  solana: string | null;
  verifiedEvm: boolean | null;
  verifiedSolana: boolean | null;
  /** True when the answer came from our cache rather than from upstream. */
  cached: boolean;
}

export type FomoLookupFailure =
  | 'not_found'
  | 'rate_limited'
  | 'budget_exceeded'
  | 'invalid_handle'
  | 'unavailable';

export class FomoLookupError extends Error {
  constructor(
    readonly reason: FomoLookupFailure,
    message: string,
    readonly retryAfterSeconds?: number
  ) {
    super(message);
    this.name = 'FomoLookupError';
  }
}

interface ErrorBody {
  error?: string;
  message?: string;
  retryAfterSeconds?: number;
}

const FAILURE_MESSAGES: Record<FomoLookupFailure, string> = {
  not_found: 'No FOMO user with that handle.',
  rate_limited: 'Too many new lookups right now. Try again later.',
  budget_exceeded: 'Handle lookups are temporarily unavailable.',
  invalid_handle: 'That does not look like a FOMO handle.',
  unavailable: 'Could not reach the lookup service.',
};

const failureFor = (status: number, body: ErrorBody): FomoLookupFailure => {
  if (status === 404) {
    return 'not_found';
  }
  if (status === 429) {
    return body.error === 'budget_exceeded' ? 'budget_exceeded' : 'rate_limited';
  }
  if (status === 400) {
    return 'invalid_handle';
  }
  return 'unavailable';
};

export const fetchFomoWallet = async (
  handle: string,
  opts: { signal?: AbortSignal } = {}
): Promise<FomoWallet> => {
  const trimmed = handle.trim().replace(/^@/, '');
  if (!trimmed) {
    throw new FomoLookupError('invalid_handle', FAILURE_MESSAGES.invalid_handle);
  }

  let res: Response;
  try {
    res = await fetch(`/api/fomo/wallet?handle=${encodeURIComponent(trimmed)}`, {
      signal: opts.signal,
      headers: { Accept: 'application/json' },
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err;
    }
    throw new FomoLookupError('unavailable', FAILURE_MESSAGES.unavailable);
  }

  if (!res.ok) {
    let body: ErrorBody = {};
    try {
      body = (await res.json()) as ErrorBody;
    } catch {
      // Non-JSON error page; the status alone decides the reason.
    }
    const reason = failureFor(res.status, body);
    // Prefer the server's own wording when it sent one: it knows whether the
    // caller hit their personal daily allowance or the app-wide one.
    throw new FomoLookupError(
      reason,
      body.message ?? FAILURE_MESSAGES[reason],
      body.retryAfterSeconds
    );
  }

  const data = (await res.json()) as {
    handle?: string;
    evm?: string | null;
    solana?: string | null;
    verifiedEvm?: boolean | null;
    verifiedSolana?: boolean | null;
    cached?: boolean;
  };

  return {
    handle: data.handle ?? trimmed,
    evm: data.evm ?? null,
    solana: data.solana ?? null,
    verifiedEvm: data.verifiedEvm ?? null,
    verifiedSolana: data.verifiedSolana ?? null,
    cached: !!data.cached,
  };
};
