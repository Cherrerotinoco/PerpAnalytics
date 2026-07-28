import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  CACHE_TTL_MS,
  clearCache,
  oldestCacheAge,
  readCache,
  readExpiredCache,
  writeCache,
} from './cache';

// The suite runs in Node (no jsdom), but cache.ts deliberately has a localStorage
// branch guarded by `typeof window`. Data lives in own enumerable properties and
// the API on the prototype, so `Object.keys` sees only the entries — which is what
// clearCache() iterates over.
class MemoryStorage {
  getItem(key: string): string | null {
    return Object.prototype.hasOwnProperty.call(this, key)
      ? (this as unknown as Record<string, string>)[key]
      : null;
  }
  setItem(key: string, value: string): void {
    (this as unknown as Record<string, string>)[key] = String(value);
  }
  removeItem(key: string): void {
    delete (this as unknown as Record<string, string>)[key];
  }
  clear(): void {
    for (const key of Object.keys(this)) this.removeItem(key);
  }
}

const store = new MemoryStorage();
const g = globalThis as unknown as { window?: unknown; localStorage?: unknown };
g.window = {};
g.localStorage = store;

afterAll(() => {
  delete g.window;
  delete g.localStorage;
});

const URL_A = 'https://example.test/a';
const URL_B = 'https://example.test/b';
const key = (url: string) => 'tc:intraday-cache:' + url;

describe('intraday response cache', () => {
  beforeEach(() => {
    clearCache();
    store.clear();
  });

  it('returns a value written within the TTL', () => {
    const now = 1_000_000;
    writeCache(URL_A, { hello: 'world' }, now);
    expect(readCache(URL_A, now + 60_000)?.data).toEqual({ hello: 'world' });
  });

  it('misses once the TTL has elapsed', () => {
    const now = 1_000_000;
    writeCache(URL_A, [1, 2, 3], now);
    expect(readCache(URL_A, now + CACHE_TTL_MS)).not.toBeNull(); // exactly at TTL still counts
    expect(readCache(URL_A, now + CACHE_TTL_MS + 1)).toBeNull();
  });

  it('keeps expired entries reachable for the API-down fallback', () => {
    const now = 1_000_000;
    writeCache(URL_A, 'stale payload', now);
    expect(readCache(URL_A, now + CACHE_TTL_MS + 1)).toBeNull();
    expect(readExpiredCache(URL_A)?.data).toBe('stale payload');
  });

  it('mirrors writes to storage so a reload reuses them', () => {
    const now = Date.now();
    writeCache(URL_A, { n: 42 }, now);
    expect(JSON.parse(store.getItem(key(URL_A))!)).toEqual({ cachedAt: now, data: { n: 42 } });
  });

  it('rehydrates from storage when the memory cache is cold', () => {
    const now = Date.now();
    clearCache();
    store.setItem(key(URL_A), JSON.stringify({ cachedAt: now, data: { n: 42 } }));
    expect(readCache(URL_A, now + 1000)?.data).toEqual({ n: 42 });
  });

  it('wipes both layers on clearCache', () => {
    writeCache(URL_A, 1);
    writeCache(URL_B, 2);
    clearCache();
    expect(store.getItem(key(URL_A))).toBeNull();
    expect(readExpiredCache(URL_A)).toBeNull();
  });

  it('ignores corrupt storage entries instead of throwing', () => {
    store.setItem(key(URL_A), 'not json');
    expect(readCache(URL_A)).toBeNull();

    store.setItem(key(URL_B), JSON.stringify({ data: 1 })); // no cachedAt
    expect(readCache(URL_B)).toBeNull();
  });

  it('reports the age of the oldest fresh entry backing a pull', () => {
    const now = 1_000_000;
    writeCache(URL_A, 1, now - 60_000);
    writeCache(URL_B, 2, now - 300_000);
    expect(oldestCacheAge([URL_A, URL_B], now)).toBe(300_000);
  });

  it('reports null when nothing usable is cached', () => {
    expect(oldestCacheAge([URL_A, URL_B], 1_000_000)).toBeNull();
  });

  it('ignores expired entries when reporting age', () => {
    const now = 1_000_000;
    writeCache(URL_A, 1, now - 60_000);
    writeCache(URL_B, 2, now - CACHE_TTL_MS - 1);
    expect(oldestCacheAge([URL_A, URL_B], now)).toBe(60_000);
  });
});
