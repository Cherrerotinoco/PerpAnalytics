import { query } from '../db/index.js';

/**
 * Handle autocomplete, served entirely from our own cache.
 *
 * This never calls fomoapi: it only offers handles somebody already resolved,
 * so it costs no credits and consumes no daily quota. A suggestion is therefore
 * always free to act on too — picking one hits the cache, not the upstream.
 */

export interface HandleSuggestion {
  handle: string;
  /** Present for every suggestion: a handle is only offered once resolved. */
  evm: string | null;
  solana: string | null;
}

const MAX_RESULTS = 8;
/** Matches the handle rule the resolver enforces. */
const QUERY_RE = /^[A-Za-z0-9_.-]{1,64}$/;

export const isValidQuery = (q: string): boolean => QUERY_RE.test(q);

/**
 * Escape the LIKE metacharacters so they match literally.
 *
 * `_` and `%` are both legal in a FOMO handle *and* wildcards in LIKE, so a
 * query like `zzz_no` would otherwise match `zzzXno` as well. The backslash is
 * escaped first, since it is the escape character itself.
 */
export const escapeLike = (q: string): string =>
  q.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');

/**
 * Handles beginning with `prefix`, case-insensitively.
 *
 * Prefix-only, not substring: it matches how people type a name they already
 * know, and it is the shape a lower(handle) index can serve.
 */
export const suggestHandles = async (prefix: string): Promise<HandleSuggestion[]> => {
  const q = prefix.trim().replace(/^@/, '');
  if (!q || !isValidQuery(q)) {
    return [];
  }

  const rows = await query<{
    handle: string;
    evm_address: string | null;
    solana_address: string | null;
  }>(
    `select handle, evm_address, solana_address
       from fomo_wallet
      where found = true
        and lower(handle) like $1 escape '\\'
      order by lower(handle)
      limit $2`,
    [`${escapeLike(q.toLowerCase())}%`, MAX_RESULTS]
  );

  return rows.map((r) => ({
    handle: r.handle,
    evm: r.evm_address,
    solana: r.solana_address,
  }));
};
