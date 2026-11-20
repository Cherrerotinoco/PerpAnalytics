import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  loadRecentFomoUsers,
  addRecentFomoUser,
  RECENT_FOMO_USERS_KEY,
  type RecentFomoUser,
} from './recentFomoUsers';

const user = (handle: string, evm: string | null = '0xabc'): RecentFomoUser => ({
  handle,
  evm,
  solana: null,
});

// The suite runs in Node, where there is no localStorage. A small in-memory
// stand-in keeps this file dependency-free rather than pulling in jsdom for it.
const createLocalStorage = () => {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
};

beforeEach(() => {
  vi.stubGlobal('localStorage', createLocalStorage());
  vi.stubGlobal('window', { localStorage });
});

describe('addRecentFomoUser', () => {
  it('puts the newest entry first', () => {
    const list = addRecentFomoUser(addRecentFomoUser([], user('tjr')), user('rasmr'));
    expect(list.map((u) => u.handle)).toEqual(['rasmr', 'tjr']);
  });

  it('de-duplicates case-insensitively, so one person appears once', () => {
    const list = addRecentFomoUser(addRecentFomoUser([], user('TJR')), user('tjr'));
    expect(list).toHaveLength(1);
    expect(list[0].handle).toBe('tjr');
  });

  it('caps the list at five', () => {
    let list: RecentFomoUser[] = [];
    for (const h of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) {
      list = addRecentFomoUser(list, user(h));
    }
    expect(list).toHaveLength(5);
    expect(list.map((u) => u.handle)).toEqual(['g', 'f', 'e', 'd', 'c']);
  });

  it('refuses an entry with no address, which would force a paid lookup', () => {
    const list = addRecentFomoUser([], { handle: 'nowallet', evm: null, solana: null });
    expect(list).toEqual([]);
  });

  it('refuses a malformed handle', () => {
    expect(addRecentFomoUser([], user('has space'))).toEqual([]);
    expect(addRecentFomoUser([], user(''))).toEqual([]);
  });

  it('persists to localStorage', () => {
    addRecentFomoUser([], user('tjr'));
    expect(JSON.parse(localStorage.getItem(RECENT_FOMO_USERS_KEY) ?? '[]')).toHaveLength(1);
  });
});

describe('loadRecentFomoUsers', () => {
  it('round-trips what was stored, wallets included', () => {
    addRecentFomoUser([], { handle: 'christianti96', evm: '0xdbb8', solana: '4pjW' });
    const [loaded] = loadRecentFomoUsers();
    expect(loaded).toEqual({ handle: 'christianti96', evm: '0xdbb8', solana: '4pjW' });
  });

  it('returns nothing when the key is absent', () => {
    expect(loadRecentFomoUsers()).toEqual([]);
  });

  it('survives corrupt JSON rather than throwing', () => {
    localStorage.setItem(RECENT_FOMO_USERS_KEY, '{not json');
    expect(loadRecentFomoUsers()).toEqual([]);
  });

  it('drops entries that fail validation', () => {
    localStorage.setItem(
      RECENT_FOMO_USERS_KEY,
      JSON.stringify([
        { handle: 'ok', evm: '0xabc', solana: null },
        { handle: 'bad handle!', evm: '0xabc', solana: null },
        { handle: 'nowallet', evm: null, solana: null },
        'not an object',
        null,
      ])
    );
    expect(loadRecentFomoUsers().map((u) => u.handle)).toEqual(['ok']);
  });

  it('ignores a non-array payload', () => {
    localStorage.setItem(RECENT_FOMO_USERS_KEY, JSON.stringify({ handle: 'tjr' }));
    expect(loadRecentFomoUsers()).toEqual([]);
  });
});
