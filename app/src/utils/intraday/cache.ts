// ─── Response cache for the intraday APIs ─────────────────────────────────────
// Same shape as the trade cache in WalletForm: an in-memory map for the current
// session plus a localStorage mirror so a reload (or a second tab) reuses the same
// responses instead of re-hitting Binance and cryptogamma.
//
// Cache keys are the request URLs, which are stable: the session CVD URLs embed
// today's UTC midnight (constant within a day) and the rest have no time param.

export const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

const STORAGE_PREFIX = 'tc:intraday-cache:';

interface CacheEntry {
  cachedAt: number;
  data: unknown;
}

const memory = new Map<string, CacheEntry>();

const storageKey = (url: string): string => STORAGE_PREFIX + url;

const isFresh = (entry: CacheEntry, now: number): boolean => now - entry.cachedAt <= CACHE_TTL_MS;

/**
 * Cached response for `url`, or null when absent/expired. Expired entries are kept
 * rather than evicted: readExpiredCache falls back to them when the API is down,
 * and the next successful fetch overwrites them anyway.
 */
export const readCache = (url: string, now: number = Date.now()): CacheEntry | null => {
  const hit = memory.get(url);
  if (hit) return isFresh(hit, now) ? hit : null;

  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(storageKey(url));
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry;
    if (typeof entry?.cachedAt !== 'number') return null;
    memory.set(url, entry);
    return isFresh(entry, now) ? entry : null;
  } catch {
    return null;
  }
};

/**
 * Cached response ignoring the TTL — only for the "the API just failed" path, so
 * callers can show the last known reading instead of an empty panel. Never use it
 * on the happy path: the entry may be arbitrarily old.
 */
export const readExpiredCache = (url: string): CacheEntry | null => {
  const hit = memory.get(url);
  if (hit) return hit;
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(storageKey(url));
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry;
    return typeof entry?.cachedAt === 'number' ? entry : null;
  } catch {
    return null;
  }
};

export const writeCache = (url: string, data: unknown, now: number = Date.now()): void => {
  const entry: CacheEntry = { cachedAt: now, data };
  memory.set(url, entry);
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(storageKey(url), JSON.stringify(entry));
  } catch {
    // Quota exceeded or private mode — the in-memory copy still serves this session.
  }
};

/** Drops every cached intraday response, so the next pull goes to the network. */
export const clearCache = (): void => {
  memory.clear();
  if (typeof window === 'undefined') return;
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(STORAGE_PREFIX)) localStorage.removeItem(key);
    }
  } catch {
    // Nothing to do — the memory cache is already gone.
  }
};

/**
 * Age (ms) of the oldest still-valid cached response backing a pull, or null when
 * everything came fresh from the network. Lets the UI admit how stale it is.
 */
export const oldestCacheAge = (urls: string[], now: number = Date.now()): number | null => {
  let oldest: number | null = null;
  for (const url of urls) {
    const entry = memory.get(url);
    if (!entry || !isFresh(entry, now)) continue;
    const age = now - entry.cachedAt;
    if (oldest == null || age > oldest) oldest = age;
  }
  return oldest;
};
