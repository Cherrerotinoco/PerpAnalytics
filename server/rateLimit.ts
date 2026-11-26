import { createHash } from 'node:crypto';

/**
 * Abuse protection for the one endpoint that spends money.
 *
 * Resolving a *new* handle costs 2,500 fomoapi credits; serving a cached one
 * costs nothing. So the limits are asymmetric on purpose: cached reads get a
 * generous ceiling that only stops hammering, while each new resolution is
 * rationed per client and globally. Without that, roughly 80 anonymous requests
 * for distinct handles would drain a month's budget.
 */

// ─── Client identity ──────────────────────────────────────────────────────────
/**
 * The client address, read from `x-forwarded-for` when running behind a trusted
 * proxy (Render sets it) and from the socket otherwise.
 *
 * `x-forwarded-for` is attacker-controlled unless a proxy is known to overwrite
 * it, which is why this is opt-in via TRUST_PROXY: trusting it on a directly
 * exposed server would let anyone reset their own quota per request.
 */
export const clientAddress = (
  headers: { get: (name: string) => string | null },
  socketAddress: string | null
): string => {
  if (process.env.TRUST_PROXY === '1') {
    const forwarded = headers.get('x-forwarded-for');
    if (forwarded) {
      const first = forwarded.split(',')[0]?.trim();
      if (first) {
        return first;
      }
    }
  }
  return socketAddress ?? 'unknown';
};

/**
 * Salted hash of a client address.
 *
 * Rate limiting needs to recognise a repeat caller, not to know who they are, so
 * the raw address is never stored. The salt stops the stored values from being
 * reversible by enumerating the (small) IPv4 space.
 */
export const hashClient = (address: string): string => {
  const salt = process.env.CLIENT_HASH_SALT ?? 'perpanalytics-dev-salt';
  return createHash('sha256').update(`${salt}:${address}`).digest('hex').slice(0, 32);
};

// ─── In-memory sliding window ─────────────────────────────────────────────────
/**
 * Process-local request counter. Deliberately not durable: it guards against
 * hammering within a single process, and the expensive path has DB-backed
 * limits on top that survive restarts and span instances.
 */
export class SlidingWindow {
  private hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number
  ) {}

  /** Records a hit. Returns false when the caller is over the limit. */
  take(key: string, now = Date.now()): boolean {
    const cutoff = now - this.windowMs;
    const times = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
    if (times.length >= this.limit) {
      this.hits.set(key, times);
      return false;
    }
    times.push(now);
    this.hits.set(key, times);
    return true;
  }

  /** Seconds until the caller's oldest hit falls out of the window. */
  retryAfter(key: string, now = Date.now()): number {
    const times = this.hits.get(key);
    if (!times || times.length === 0) {
      return 0;
    }
    return Math.max(1, Math.ceil((times[0] + this.windowMs - now) / 1000));
  }

  /** Drops keys whose hits have all aged out, so the map cannot grow forever. */
  sweep(now = Date.now()): void {
    const cutoff = now - this.windowMs;
    for (const [key, times] of this.hits) {
      const live = times.filter((t) => t > cutoff);
      if (live.length === 0) {
        this.hits.delete(key);
      } else {
        this.hits.set(key, live);
      }
    }
  }

  get size(): number {
    return this.hits.size;
  }
}

// ─── Configured limiters ──────────────────────────────────────────────────────
const envInt = (name: string, fallback: number): number => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/** Cheap path: cached reads and everything else under /api. */
export const requestLimiter = new SlidingWindow(envInt('RATE_REQUESTS_PER_MINUTE', 60), 60_000);

export const LIMITS = {
  /** New resolutions one client may trigger per day. */
  perClientDaily: envInt('RATE_NEW_RESOLUTIONS_PER_CLIENT_DAILY', 3),
  /**
   * New resolutions across every client per day.
   *
   * The monthly credit cap is the hard stop. This sets the pace: at 3/day the
   * ~80 resolutions a month's budget buys are spread across the month rather
   * than being spent in the first few days.
   */
  globalDaily: envInt('RATE_NEW_RESOLUTIONS_GLOBAL_DAILY', 3),
};

export class RateLimitedError extends Error {
  constructor(
    readonly scope: 'client' | 'global',
    readonly retryAfterSeconds: number
  ) {
    super(
      scope === 'client'
        ? 'You have looked up too many new handles today.'
        : 'This app has reached its daily limit of new handle lookups.'
    );
    this.name = 'RateLimitedError';
  }
}

/** Seconds until the next UTC midnight, when the daily counters reset. */
export const secondsUntilUtcMidnight = (now = new Date()): number => {
  const midnight = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0,
    0,
    0,
    0
  );
  return Math.max(1, Math.ceil((midnight - now.getTime()) / 1000));
};

// Keep the in-memory map bounded on a long-running process.
const sweepTimer = setInterval(() => requestLimiter.sweep(), 5 * 60_000);
sweepTimer.unref?.();
