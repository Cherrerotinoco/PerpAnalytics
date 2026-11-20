/**
 * Recently searched FOMO users, kept in localStorage.
 *
 * The wallets are stored alongside the handle, not just the handle itself: a
 * handle↔wallet link never changes, so re-opening a recent user can skip the
 * resolve step entirely. That keeps the row free to click — no request, no
 * credit, no daily quota — which is the whole point of showing it.
 */

const STORAGE_KEY = 'recentFomoUsers';
const MAX_RECENT = 5;

/** Same character set the server accepts for a handle. */
const HANDLE_RE = /^[A-Za-z0-9_.-]{1,64}$/;

export interface RecentFomoUser {
  handle: string;
  evm: string | null;
  solana: string | null;
}

const isRecentUser = (value: unknown): value is RecentFomoUser => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const u = value as Record<string, unknown>;
  return (
    typeof u.handle === 'string' &&
    HANDLE_RE.test(u.handle) &&
    (u.evm === null || typeof u.evm === 'string') &&
    (u.solana === null || typeof u.solana === 'string') &&
    // Useless without an address: it would just force a lookup anyway.
    (typeof u.evm === 'string' || typeof u.solana === 'string')
  );
};

export const loadRecentFomoUsers = (): RecentFomoUser[] => {
  if (typeof window === 'undefined') {
    return [];
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter(isRecentUser)
      .map((u) => ({ handle: u.handle, evm: u.evm ?? null, solana: u.solana ?? null }))
      .slice(0, MAX_RECENT);
  } catch {
    return [];
  }
};

/**
 * Put a user at the front of the list, de-duplicating case-insensitively so
 * `@TJR` and `@tjr` do not both appear.
 */
export const addRecentFomoUser = (
  current: RecentFomoUser[],
  user: RecentFomoUser
): RecentFomoUser[] => {
  if (!isRecentUser(user)) {
    return current;
  }
  const key = user.handle.toLowerCase();
  const next = [user, ...current.filter((u) => u.handle.toLowerCase() !== key)].slice(
    0,
    MAX_RECENT
  );
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage full or blocked; the list still works for this session.
  }
  return next;
};

export const RECENT_FOMO_USERS_KEY = STORAGE_KEY;
