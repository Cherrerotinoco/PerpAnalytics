/**
 * FOMO handle autocomplete.
 *
 * Suggestions come from our own cache, so the list only ever contains handles
 * that are already paid for — picking one never spends a credit or a daily
 * lookup. That is what makes it safe to query on every keystroke.
 */

export interface HandleSuggestion {
  handle: string;
  evm: string | null;
  solana: string | null;
}

export const fetchFomoSuggestions = async (
  prefix: string,
  opts: { signal?: AbortSignal } = {}
): Promise<HandleSuggestion[]> => {
  const q = prefix.trim().replace(/^@/, '');
  if (!q) {
    return [];
  }
  const res = await fetch(`/api/fomo/suggest?q=${encodeURIComponent(q)}`, {
    signal: opts.signal,
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    return [];
  }
  const data = (await res.json()) as { items?: HandleSuggestion[] };
  return Array.isArray(data.items) ? data.items : [];
};

// ─── Generated avatar ─────────────────────────────────────────────────────────
/**
 * FOMO profile pictures are not available through the API this app uses, so the
 * icon is derived from the handle instead: the same handle always gets the same
 * colour. No network request, nothing to allow through the CSP, and no third
 * party learning which profiles get looked at.
 */
const AVATAR_COLORS = [
  '#e8a33d',
  '#3da5e8',
  '#5fc27e',
  '#e8623d',
  '#9b6fe8',
  '#e83d8f',
  '#3de8d4',
  '#c9a227',
];

/** Stable 32-bit hash (FNV-1a), so colours do not shift between sessions. */
const hashHandle = (handle: string): number => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < handle.length; i++) {
    hash ^= handle.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
};

export const avatarColor = (handle: string): string =>
  AVATAR_COLORS[hashHandle(handle.toLowerCase()) % AVATAR_COLORS.length];

/**
 * The glyph shown inside the avatar: the first alphanumeric character, so a
 * handle like `_foo` shows `F` rather than an underscore.
 */
export const avatarInitial = (handle: string): string => {
  const match = handle.match(/[a-z0-9]/i);
  return (match ? match[0] : '?').toUpperCase();
};
