import { query } from '../db/index.js';
import { LIMITS, RateLimitedError, secondsUntilUtcMidnight } from '../rateLimit.js';

/**
 * Handle → wallet resolution, the one paid step in the FOMO pipeline.
 *
 * fomoapi.io is an unofficial third-party API for fomo.family data. It is the
 * only piece that costs anything: 2,500 credits per hit against a 250,000/month
 * free tier, so roughly 100 new handles a month. Everything downstream
 * (Hyperliquid) is public and free.
 *
 * A handle's wallets do not change, so a hit is cached effectively forever and
 * a repeat visitor costs nothing. Misses are cached briefly too, so a typo
 * cannot be replayed for credits — but not for long, since the handle may
 * simply not exist *yet*.
 */

const BASE_URL = 'https://api.fomoapi.io';
const CREDITS_HIT = 2_500;
const CREDITS_MISS = 250;

/** A resolved handle stays valid until something tells us otherwise. */
const HIT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** A handle that did not exist might exist tomorrow. */
const MISS_TTL_MS = 60 * 60 * 1000;

export interface WalletResolution {
  handle: string;
  found: boolean;
  userId: string | null;
  solana: string | null;
  evm: string | null;
  verifiedSolana: boolean | null;
  verifiedEvm: boolean | null;
  /** Where the answer came from, so the UI can show whether it cost anything. */
  cached: boolean;
  resolvedAt: string;
}

export class BudgetExceededError extends Error {
  constructor(
    readonly spent: number,
    readonly cap: number
  ) {
    super(`fomoapi credit cap reached: ${spent}/${cap} this month`);
    this.name = 'BudgetExceededError';
  }
}

export class UpstreamError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'UpstreamError';
  }
}

/**
 * FOMO handles are a bounded character set; reject anything else before it
 * reaches the upstream or the database.
 */
const HANDLE_RE = /^[A-Za-z0-9_.-]{1,64}$/;

export const isValidHandle = (handle: string): boolean => HANDLE_RE.test(handle);

// ─── Budget ───────────────────────────────────────────────────────────────────
const creditCap = (): number => Number(process.env.FOMOAPI_MONTHLY_CREDIT_CAP ?? 200_000);

export const getSpentThisMonth = async (): Promise<number> => {
  const rows = await query<{ total: string | null }>(
    `select coalesce(sum(credits), 0)::text as total
       from fomoapi_credit_ledger
      where ts >= date_trunc('month', now())`
  );
  return Number(rows[0]?.total ?? 0);
};

export const getBudget = async (): Promise<{ spent: number; cap: number; remaining: number }> => {
  const spent = await getSpentThisMonth();
  const cap = creditCap();
  return { spent, cap, remaining: Math.max(0, cap - spent) };
};

const recordSpend = async (
  operation: string,
  credits: number,
  httpStatus: number,
  handle: string,
  clientHash: string | null
): Promise<void> => {
  try {
    await query(
      `insert into fomoapi_credit_ledger (operation, credits, http_status, handle, client_hash)
       values ($1, $2, $3, $4, $5)`,
      [operation, credits, httpStatus, handle, clientHash]
    );
  } catch (err) {
    // A lost ledger row means the budget guard starts under-counting, so make
    // it loud — but never fail the user's request over bookkeeping.
    console.error('[fomoapi] failed to write ledger row:', err);
  }
};

// ─── Daily quotas ─────────────────────────────────────────────────────────────
/**
 * How many paid resolutions happened today, in total and for one client.
 *
 * Counted from the ledger rather than from process memory, so the quota holds
 * across restarts and across instances — the whole point is that it cannot be
 * reset by redeploying or by landing on another container.
 */
export const getDailyUsage = async (
  clientHash: string | null
): Promise<{ global: number; client: number }> => {
  const rows = await query<{ global: string; client: string }>(
    `select
       count(*) filter (where credits > 0)::text as global,
       count(*) filter (where credits > 0 and client_hash is not distinct from $1)::text as client
     from fomoapi_credit_ledger
     where ts >= date_trunc('day', now() at time zone 'utc')`,
    [clientHash]
  );
  return {
    global: Number(rows[0]?.global ?? 0),
    client: Number(rows[0]?.client ?? 0),
  };
};

/** Throws when a *new* resolution would exceed a daily quota. */
const assertWithinDailyQuota = async (clientHash: string | null): Promise<void> => {
  const usage = await getDailyUsage(clientHash);
  if (usage.global >= LIMITS.globalDaily) {
    throw new RateLimitedError('global', secondsUntilUtcMidnight());
  }
  if (clientHash && usage.client >= LIMITS.perClientDaily) {
    throw new RateLimitedError('client', secondsUntilUtcMidnight());
  }
};

// ─── Cache ────────────────────────────────────────────────────────────────────
interface WalletRow {
  handle: string;
  handle_lower: string;
  user_id: string | null;
  solana_address: string | null;
  evm_address: string | null;
  verified_solana: boolean | null;
  verified_evm: boolean | null;
  found: boolean;
  resolved_at: string;
}

const rowToResolution = (row: WalletRow, cached: boolean): WalletResolution => ({
  handle: row.handle,
  found: row.found,
  userId: row.user_id,
  solana: row.solana_address,
  evm: row.evm_address,
  verifiedSolana: row.verified_solana,
  verifiedEvm: row.verified_evm,
  cached,
  resolvedAt: new Date(row.resolved_at).toISOString(),
});

const readCache = async (handleLower: string): Promise<WalletRow | null> => {
  const rows = await query<WalletRow>(`select * from fomo_wallet where handle_lower = $1`, [
    handleLower,
  ]);
  return rows[0] ?? null;
};

const isFresh = (row: WalletRow): boolean => {
  const age = Date.now() - new Date(row.resolved_at).getTime();
  return age < (row.found ? HIT_TTL_MS : MISS_TTL_MS);
};

const writeCache = async (
  r: Omit<WalletResolution, 'cached' | 'resolvedAt'>
): Promise<WalletRow> => {
  const rows = await query<WalletRow>(
    `insert into fomo_wallet
       (handle_lower, handle, user_id, solana_address, evm_address,
        verified_solana, verified_evm, found, resolved_at)
     values (lower($1), $1, $2, $3, $4, $5, $6, $7, now())
     on conflict (handle_lower) do update set
       handle = excluded.handle,
       user_id = excluded.user_id,
       solana_address = excluded.solana_address,
       evm_address = excluded.evm_address,
       verified_solana = excluded.verified_solana,
       verified_evm = excluded.verified_evm,
       found = excluded.found,
       resolved_at = now()
     returning *`,
    [r.handle, r.userId, r.solana, r.evm, r.verifiedSolana, r.verifiedEvm, r.found]
  );
  return rows[0];
};

// ─── Upstream ─────────────────────────────────────────────────────────────────
interface FomoapiWalletsResponse {
  handle?: string;
  found?: boolean;
  userId?: string;
  wallets?: { solana?: string | null; evm?: string | null };
  verified?: { solana?: boolean; evm?: boolean };
}

/**
 * Resolve a handle, preferring the cache.
 *
 * `forceRefresh` re-reads upstream even on a fresh hit — it spends credits, so
 * it is never the default and is not reachable from an anonymous request.
 */
export const resolveWallets = async (
  rawHandle: string,
  opts: { forceRefresh?: boolean; clientHash?: string | null } = {}
): Promise<WalletResolution> => {
  const handle = rawHandle.trim().replace(/^@/, '');
  if (!isValidHandle(handle)) {
    throw new UpstreamError(400, 'Invalid FOMO handle');
  }
  const handleLower = handle.toLowerCase();
  const clientHash = opts.clientHash ?? null;

  // The cache is free to serve, so it is checked before any quota: a handle
  // someone already paid for stays available to everyone, always.
  if (!opts.forceRefresh) {
    const cached = await readCache(handleLower);
    if (cached && isFresh(cached)) {
      return rowToResolution(cached, true);
    }
  }

  const { spent, cap } = await getBudget();
  if (spent + CREDITS_HIT > cap) {
    // Out of budget: serve a stale hit rather than nothing, if we have one.
    const stale = await readCache(handleLower);
    if (stale?.found) {
      return rowToResolution(stale, true);
    }
    throw new BudgetExceededError(spent, cap);
  }

  // Past here the call costs money, so the daily quotas apply. Checked after
  // the budget so an exhausted month reports itself as such rather than as a
  // rate limit, and after the cache so quotas never block a free answer.
  await assertWithinDailyQuota(clientHash);

  const key = process.env.FOMOAPI_KEY;
  if (!key) {
    throw new Error('FOMOAPI_KEY is not set');
  }

  const res = await fetch(`${BASE_URL}/v2/wallets/${encodeURIComponent(handle)}`, {
    headers: { authorization: `Bearer ${key}`, accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });

  if (res.status === 404) {
    await recordSpend('wallets.miss', CREDITS_MISS, 404, handleLower, clientHash);
    const row = await writeCache({
      handle,
      found: false,
      userId: null,
      solana: null,
      evm: null,
      verifiedSolana: null,
      verifiedEvm: null,
    });
    return rowToResolution(row, false);
  }

  if (!res.ok) {
    // 401/402/429/503 and friends: do not poison the cache with a transient
    // failure, and do not bill for an answer we did not get.
    throw new UpstreamError(res.status, `fomoapi wallets failed with ${res.status}`);
  }

  const body = (await res.json()) as FomoapiWalletsResponse;
  const found = body.found !== false && !!(body.wallets?.solana || body.wallets?.evm);
  await recordSpend(
    'wallets.hit',
    found ? CREDITS_HIT : CREDITS_MISS,
    res.status,
    handleLower,
    clientHash
  );

  const row = await writeCache({
    handle: body.handle ?? handle,
    found,
    userId: body.userId ?? null,
    solana: body.wallets?.solana ?? null,
    evm: body.wallets?.evm ?? null,
    verifiedSolana: body.verified?.solana ?? null,
    verifiedEvm: body.verified?.evm ?? null,
  });
  return rowToResolution(row, false);
};
