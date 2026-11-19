import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CgSync, CgCheck } from 'react-icons/cg';
import { Trade } from '../types/tradeTypes';
import { normalizeJupiterTrades, JupiterTrade } from '../utils/normalizeJupiter';
import { normalizePacificaTrades, PacificaFill } from '../utils/normalizePacifica';
import { normalizeHyperliquidFills } from '../utils/normalizeHyperliquid';
import { fetchHyperliquidFills, HyperliquidError } from '../utils/fetchHyperliquid';
import { fetchFomoWallet, FomoLookupError } from '../utils/fetchFomoWallet';
import {
  ALL_PLATFORMS,
  PLATFORM_CHAIN,
  PLATFORM_LABEL,
  Platform,
  chainOfAddress,
  isValidWalletAddress,
  parsePlatformsParam,
  pickAddressForPlatforms,
  resolvePlatformsForAddress,
} from '../utils/platforms';
import Dashboard from '../dashboard/Dashboard';
import RecentWallets from './RecentWallets';

const MAX_CACHE_ENTRIES = 10;
const STORAGE_PREFIX = 'tc:';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  cachedAt: number;
  data: Array<Omit<Trade, 'opened' | 'closed'> & { opened: string; closed: string }>;
}

/** Reject obviously malformed entries that could corrupt calculations. */
const isValidCachedTrade = (t: unknown): boolean => {
  if (!t || typeof t !== 'object') return false;
  const o = t as Record<string, unknown>;
  return (
    typeof o.symbol === 'string' &&
    o.symbol.length > 0 &&
    o.symbol.length <= 32 &&
    (o.side === 'long' || o.side === 'short') &&
    typeof o.pnl === 'number' &&
    isFinite(o.pnl) &&
    typeof o.fee === 'number' &&
    isFinite(o.fee) &&
    typeof o.sizeUsd === 'number' &&
    isFinite(o.sizeUsd) &&
    (o.source === 'Jupiter' || o.source === 'Pacifica' || o.source === 'Hyperliquid') &&
    typeof o.opened === 'string' &&
    !isNaN(Date.parse(o.opened)) &&
    typeof o.closed === 'string' &&
    !isNaN(Date.parse(o.closed))
  );
};

const loadCachedTrades = (key: string): Trade[] | null => {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry;
    if (
      !entry ||
      typeof entry.cachedAt !== 'number' ||
      !Array.isArray(entry.data) ||
      Date.now() - entry.cachedAt > CACHE_TTL_MS
    ) {
      localStorage.removeItem(STORAGE_PREFIX + key);
      return null;
    }
    const valid = entry.data.filter(isValidCachedTrade);
    // If more than 5% of entries are corrupt, discard the whole cache entry.
    if (valid.length < entry.data.length * 0.95) {
      localStorage.removeItem(STORAGE_PREFIX + key);
      return null;
    }
    return valid.map((t) => ({
      ...t,
      opened: new Date(t.opened),
      closed: new Date(t.closed),
    }));
  } catch {
    return null;
  }
};

const saveCachedTrades = (key: string, trades: Trade[]): void => {
  try {
    localStorage.setItem(
      STORAGE_PREFIX + key,
      JSON.stringify({ cachedAt: Date.now(), data: trades })
    );
  } catch {
    // Storage quota exceeded, silently skip
  }
};

// ─── URL param helpers ────────────────────────────────────────────────────────
/** Parse DD.MM.YYYY (URL format) → YYYY-MM-DD (HTML date input value) */
const parseDateParam = (s: string | null): string => {
  if (!s) return '';
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return '';
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
};

/** Format YYYY-MM-DD (HTML date input value) → DD.MM.YYYY (URL-friendly) */
const formatDateParam = (s: string): string => {
  if (!s) return '';
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const [, y, mo, d] = m;
  return `${d}.${mo}.${y}`;
};

type SearchMode = 'wallet' | 'user';

const HANDLE_REGEX = /^@?[A-Za-z0-9_.-]{1,64}$/;
const normalizeHandle = (h: string): string => h.trim().replace(/^@/, '');
const shortAddress = (a: string): string => `${a.slice(0, 6)}…${a.slice(-4)}`;

interface WalletFormProps {
  recentWallets: string[];
  wallet: string;
  setWallet: (w: string) => void;
  addRecentWallet: (w: string) => void;
}

export const WalletForm = ({
  recentWallets,
  wallet,
  setWallet,
  addRecentWallet,
}: WalletFormProps) => {
  const [searchParams] = useSearchParams();

  const [startDate, setStartDate] = useState(() => parseDateParam(searchParams.get('start_date')));
  const [endDate, setEndDate] = useState(() => parseDateParam(searchParams.get('end_date')));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [trades, setTrades] = useState<Trade[]>([]);
  const [hasQueried, setHasQueried] = useState(false);
  const [platforms, setPlatforms] = useState<Platform[]>(() =>
    parsePlatformsParam(searchParams.get('platforms'))
  );
  const [searchMode, setSearchMode] = useState<SearchMode>(() =>
    searchParams.get('user') ? 'user' : 'wallet'
  );
  const [handle, setHandle] = useState(() => searchParams.get('user') ?? '');
  // The handle whose wallet is currently loaded, so a refresh doesn't re-resolve it
  const [resolved, setResolved] = useState<{
    handle: string;
    evm: string | null;
    solana: string | null;
  } | null>(null);
  const cacheRef = useRef<{ [key: string]: Trade[] }>({});
  const cacheTsRef = useRef<{ [key: string]: number }>({});
  const lastAutoKey = useRef('');
  const abortRef = useRef<AbortController | null>(null);
  const dashboardRef = useRef<HTMLDivElement>(null);

  const scrollToDashboard = useCallback(() => {
    dashboardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  // ── Live-sync filter changes to URL (replaceState — does NOT trigger useSearchParams) ──
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (startDate) params.set('start_date', formatDateParam(startDate));
    else params.delete('start_date');
    if (endDate) params.set('end_date', formatDateParam(endDate));
    else params.delete('end_date');
    if (platforms.length > 0) params.set('platforms', platforms.join(','));
    else params.delete('platforms');
    const qs = params.toString();
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
  }, [startDate, endDate, platforms]);

  // ── Core fetch logic (wallet + platforms passed explicitly so callers don't wait for state) ──
  const fetchTradesFor = useCallback(
    async (
      rawWallet: string,
      selectedPlats: Platform[],
      forceRefresh = false,
      fomoHandle: string | null = null
    ) => {
      const w = rawWallet.trim();
      if (!w || !isValidWalletAddress(w)) {
        setError(
          'Enter a valid Solana address (Jupiter, Pacifica) or EVM 0x address (Hyperliquid).'
        );
        return;
      }
      if (selectedPlats.length === 0) {
        setError('Select at least one platform.');
        return;
      }

      // Only query venues on the address's chain, and reflect that in the selection
      const plats = resolvePlatformsForAddress(selectedPlats, w);
      if (plats.join(',') !== selectedPlats.join(',')) setPlatforms(plats);

      // Write wallet (and the FOMO handle it came from, if any) to URL — filters are kept in sync by the live-sync effect
      const urlParams = new URLSearchParams(window.location.search);
      urlParams.set('wallet', w);
      if (fomoHandle) urlParams.set('user', fomoHandle);
      else urlParams.delete('user');
      window.history.replaceState(null, '', `?${urlParams.toString()}`);

      const cacheKey = JSON.stringify({ wallet: w, platforms: [...plats].sort() });

      if (forceRefresh) {
        delete cacheRef.current[cacheKey];
        delete cacheTsRef.current[cacheKey];
        localStorage.removeItem(STORAGE_PREFIX + cacheKey);
      }

      setLoading(true);
      setError('');
      setTrades([]);
      setHasQueried(false);
      scrollToDashboard();

      const cachedTrades = cacheRef.current[cacheKey];
      const cachedAt = cacheTsRef.current[cacheKey] ?? 0;
      if (cachedTrades && Date.now() - cachedAt <= CACHE_TTL_MS) {
        setTrades(cachedTrades);
        setHasQueried(true);
        setLoading(false);
        return;
      }

      const stored = loadCachedTrades(cacheKey);
      if (stored) {
        cacheRef.current[cacheKey] = stored;
        cacheTsRef.current[cacheKey] = Date.now();
        setTrades(stored);
        setHasQueried(true);
        setLoading(false);
        return;
      }

      // Cancel any in-flight request from a previous call
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const fetchTimeout = setTimeout(() => controller.abort(), 30_000);

      try {
        const results = await Promise.all(
          plats.map(async (platform) => {
            if (platform === 'jupiter') {
              const allEvents: JupiterTrade[] = [];
              const fetchPage = async (start: number, end: number): Promise<void> => {
                const url = `https://perps-api.jup.ag/v1/trades?walletAddress=${w}&start=${start}&end=${end}`;
                const res = await fetch(url, { signal: controller.signal });
                if (!res.ok) throw new Error(`Error fetching Jupiter data: ${res.statusText}`);
                const data = await res.json();
                allEvents.push(...(data.dataList ?? []));
                if (data.count > end) await fetchPage(end, end + 1000);
              };
              await fetchPage(0, 1000);
              return normalizeJupiterTrades(allEvents);
            }
            if (platform === 'pacifica') {
              const allFills: PacificaFill[] = [];
              const fetchPage = async (cursor?: string): Promise<void> => {
                const cursorParam = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
                const res = await fetch(
                  `https://api.pacifica.fi/api/v1/trades/history?account=${w}&limit=1000${cursorParam}`,
                  { signal: controller.signal }
                );
                if (!res.ok) throw new Error(`Error fetching Pacifica data: ${res.statusText}`);
                const json = await res.json();
                const page: PacificaFill[] = json.data ?? [];
                allFills.push(...page);
                if (json.has_more && page.length > 0) await fetchPage(json.next_cursor);
              };
              await fetchPage();
              return normalizePacificaTrades(allFills);
            }
            if (platform === 'hyperliquid') {
              const fills = await fetchHyperliquidFills(w, { signal: controller.signal });
              return normalizeHyperliquidFills(fills);
            }
            return [];
          })
        );

        const allTrades = results.flat();
        const cacheKeys = Object.keys(cacheRef.current);
        if (cacheKeys.length >= MAX_CACHE_ENTRIES) delete cacheRef.current[cacheKeys[0]];
        cacheRef.current[cacheKey] = allTrades;
        cacheTsRef.current[cacheKey] = Date.now();
        saveCachedTrades(cacheKey, allTrades);
        setTrades(allTrades);
        setHasQueried(true);
        addRecentWallet(w);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          setError('Request timed out after 30 s. Please check your connection and try again.');
        } else if (err instanceof HyperliquidError) {
          setError(err.message);
        } else {
          console.error('Failed to fetch trades:', err);
          setError('Failed to fetch trades. Check the console for details.');
        }
      } finally {
        clearTimeout(fetchTimeout);
        setLoading(false);
      }
    },
    [addRecentWallet, scrollToDashboard]
  );

  // ── FOMO handle → wallet, then the normal wallet fetch ──
  const fetchTradesForHandle = useCallback(
    async (rawHandle: string, plats: Platform[], forceRefresh = false) => {
      const h = normalizeHandle(rawHandle);
      if (!HANDLE_REGEX.test(h)) {
        setError('Enter a FOMO username (letters, numbers, _ . -).');
        return;
      }
      if (plats.length === 0) {
        setError('Select at least one platform.');
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      setError('');

      try {
        const fomo = await fetchFomoWallet(h, { signal: controller.signal });
        const address = pickAddressForPlatforms(fomo, plats);
        if (!address) {
          setError(`@${fomo.handle} has no linked wallet.`);
          setLoading(false);
          return;
        }
        setResolved({ handle: fomo.handle, evm: fomo.evm, solana: fomo.solana });
        setWallet(address);
        await fetchTradesFor(address, plats, forceRefresh, fomo.handle);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(
          err instanceof FomoLookupError ? err.message : 'Could not look up that FOMO username.'
        );
        setLoading(false);
      }
    },
    [fetchTradesFor, setWallet]
  );

  // ── Form submit (reads from component state) ──
  const handleSubmit = useCallback(
    async (e: React.FormEvent | null, forceRefresh = false) => {
      if (e) e.preventDefault();
      if (searchMode === 'user') {
        // Already resolved this handle — refresh/re-search its trades without another lookup
        if (resolved && resolved.handle.toLowerCase() === normalizeHandle(handle).toLowerCase()) {
          const address = pickAddressForPlatforms(resolved, platforms);
          if (address) return fetchTradesFor(address, platforms, forceRefresh, resolved.handle);
        }
        return fetchTradesForHandle(handle, platforms, forceRefresh);
      }
      setResolved(null);
      return fetchTradesFor(wallet, platforms, forceRefresh);
    },
    [searchMode, resolved, handle, wallet, platforms, fetchTradesFor, fetchTradesForHandle]
  );

  // ── Recent wallet selection — update wallet, URL, and fetch immediately ──
  const handleSelectRecentWallet = useCallback(
    (w: string) => {
      setSearchMode('wallet');
      setResolved(null);
      setWallet(w);
      // Keep existing filter params, just swap the wallet
      const params = new URLSearchParams(window.location.search);
      params.set('wallet', w);
      window.history.replaceState(null, '', `?${params.toString()}`);
      // Clear dedup key so same wallet can be re-fetched if reselected
      lastAutoKey.current = '';
      fetchTradesFor(w, platforms);
    },
    [platforms, fetchTradesFor, setWallet]
  );

  // ── URL navigation listener — fires on back/forward/direct URL, NOT on replaceState ──
  useEffect(() => {
    const urlWallet = searchParams.get('wallet');
    const urlUser = searchParams.get('user');
    const hasWallet = !!urlWallet && isValidWalletAddress(urlWallet);
    const hasUser = !!urlUser && HANDLE_REGEX.test(urlUser);
    if (!hasWallet && !hasUser) return;

    const urlPlats = parsePlatformsParam(searchParams.get('platforms'));
    const plats = hasWallet ? resolvePlatformsForAddress(urlPlats, urlWallet) : urlPlats;

    // Deduplicate: don't re-fetch if we already submitted for this exact user+wallet+platforms combo
    const autoKey = `${hasUser ? urlUser : ''}|${hasWallet ? urlWallet : ''}|${[...plats].sort().join(',')}`;
    if (autoKey === lastAutoKey.current) return;
    lastAutoKey.current = autoKey;

    // Sync all form fields from URL params
    setStartDate(parseDateParam(searchParams.get('start_date')));
    setEndDate(parseDateParam(searchParams.get('end_date')));
    setPlatforms(plats);
    setSearchMode(hasUser ? 'user' : 'wallet');
    if (hasUser) setHandle(urlUser);

    // Fetch directly with URL params (don't wait for state to settle)
    if (hasWallet) {
      setWallet(urlWallet);
      // A shared ?user=…&wallet=… link already carries the resolved address: skip the lookup
      if (hasUser) {
        const evm = chainOfAddress(urlWallet) === 'evm';
        setResolved({
          handle: normalizeHandle(urlUser),
          evm: evm ? urlWallet : null,
          solana: evm ? null : urlWallet,
        });
      } else {
        setResolved(null);
      }
      fetchTradesFor(urlWallet, plats, false, hasUser ? normalizeHandle(urlUser) : null);
    } else if (hasUser) {
      fetchTradesForHandle(urlUser, plats);
    }
  }, [searchParams, fetchTradesFor, fetchTradesForHandle, setWallet]);

  const filteredTrades = useMemo(() => {
    const startMs = startDate ? new Date(startDate).getTime() : 0;
    // Add 86 399 999 ms (23:59:59.999) so the end date is fully inclusive.
    const endMs = endDate ? new Date(endDate).getTime() + 86_399_999 : 0;
    return trades.filter((trade) => {
      const t = trade.closed.getTime();
      const sourceKey = trade.source.toLowerCase() as Platform;
      return platforms.includes(sourceKey) && (!startMs || t >= startMs) && (!endMs || t <= endMs);
    });
  }, [trades, startDate, endDate, platforms]);

  // In user mode the address is picked from the handle, so no platform is off-limits up front
  const walletChain = searchMode === 'wallet' ? chainOfAddress(wallet) : null;
  const shownPlatforms = walletChain ? resolvePlatformsForAddress(platforms, wallet) : platforms;
  const isDisabled =
    loading || (searchMode === 'wallet' ? !wallet : !handle.trim()) || platforms.length === 0;
  const resolvedAddress =
    searchMode === 'user' &&
    resolved &&
    resolved.handle.toLowerCase() === normalizeHandle(handle).toLowerCase() &&
    isValidWalletAddress(wallet)
      ? wallet
      : null;
  const hasData = !loading && filteredTrades.length > 0;

  return (
    <div className="tc-wallet-root">
      {/* ── Above-fold: form, status ────────────────────────────────────────── */}
      <div className="tc-wallet-top">
        <RecentWallets wallets={recentWallets} onSelect={handleSelectRecentWallet} />

        {/* ── Search bar ─────────────────────────────────────────────────────── */}
        <div className="tc-panel tc-search-pad">
          <form onSubmit={handleSubmit} autoComplete="off">
            <div className="d-flex align-items-center gap-2 flex-wrap">
              {/* Wallet address or FOMO username */}
              <div className="tc-wallet-input-wrap">
                <div className="tc-search-mode-row">
                  <label className="tc-label" htmlFor="wallet">
                    {searchMode === 'wallet' ? 'Wallet Address *' : 'FOMO Username *'}
                  </label>
                  <div className="tc-search-mode" role="group" aria-label="Search by">
                    {(['wallet', 'user'] as SearchMode[]).map((m) => (
                      <button
                        key={m}
                        type="button"
                        aria-pressed={searchMode === m}
                        className={`tc-search-mode-btn${searchMode === m ? ' tc-search-mode-btn--active' : ''}`}
                        onClick={() => {
                          setSearchMode(m);
                          setError('');
                        }}
                      >
                        {m === 'wallet' ? 'Wallet' : 'FOMO user'}
                      </button>
                    ))}
                  </div>
                </div>
                {searchMode === 'wallet' ? (
                  <input
                    id="wallet"
                    type="text"
                    name="wallet"
                    className="tc-input font-monospace"
                    placeholder="Solana or EVM (0x…) address…"
                    required
                    value={wallet}
                    onChange={(e) => setWallet(e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                  />
                ) : (
                  <div className="tc-handle-input-wrap">
                    <span className="tc-handle-prefix" aria-hidden="true">
                      @
                    </span>
                    <input
                      id="wallet"
                      type="text"
                      name="fomo-user"
                      className="tc-input tc-handle-input"
                      placeholder="FOMO username…"
                      required
                      value={handle}
                      onChange={(e) => setHandle(e.target.value)}
                      autoComplete="off"
                      autoCapitalize="off"
                      spellCheck={false}
                    />
                  </div>
                )}
              </div>

              {/* Platform checkboxes */}
              <div className="tc-platform-group">
                {ALL_PLATFORMS.map((p) => {
                  // Venues on another chain can't hold trades for this address
                  const isUnavailable = walletChain !== null && PLATFORM_CHAIN[p] !== walletChain;
                  const isActive = shownPlatforms.includes(p);
                  const label = PLATFORM_LABEL[p];
                  return (
                    <label
                      key={p}
                      htmlFor={`plat-${p}`}
                      title={
                        isUnavailable
                          ? `${label} needs ${PLATFORM_CHAIN[p] === 'evm' ? 'an EVM (0x…)' : 'a Solana'} address`
                          : undefined
                      }
                      className={`tc-platform-label ${isActive ? 'tc-platform-label--active' : 'tc-platform-label--inactive'}${isUnavailable ? ' tc-platform-label--disabled' : ''}`}
                    >
                      <input
                        id={`plat-${p}`}
                        type="checkbox"
                        checked={isActive}
                        disabled={isUnavailable}
                        onChange={(e) => {
                          setPlatforms((prev) =>
                            e.target.checked ? [...prev, p] : prev.filter((x) => x !== p)
                          );
                        }}
                      />
                      {/* Custom checkbox box */}
                      <span
                        className={`tc-checkbox-box ${isActive ? 'tc-checkbox-box--active' : 'tc-checkbox-box--inactive'}`}
                      >
                        {isActive && <CgCheck aria-hidden="true" />}
                      </span>
                      {label}
                    </label>
                  );
                })}
              </div>

              {/* Actions */}
              <button
                type="submit"
                disabled={isDisabled}
                aria-busy={loading}
                className="tc-btn-primary"
              >
                {loading && (
                  <span
                    className="spinner-border spinner-border-sm"
                    role="status"
                    aria-hidden="true"
                  />
                )}
                {loading ? 'Loading…' : 'Search'}
              </button>
              {hasQueried && !loading && (
                <button
                  type="button"
                  title="Refresh — fetch latest trades bypassing cache"
                  onClick={() => handleSubmit(null, true)}
                  className="tc-btn-icon"
                >
                  <CgSync aria-hidden="true" />
                </button>
              )}
            </div>

            {resolvedAddress && (
              <p className="tc-handle-resolved">
                @{resolved?.handle} →{' '}
                <span className="font-monospace" title={resolvedAddress}>
                  {shortAddress(resolvedAddress)}
                </span>
              </p>
            )}

            {/* Error — aria-live so screen readers announce it immediately */}
            <div aria-live="polite" aria-atomic="true">
              {error && (
                <div className="tc-error-msg">
                  <span className="flex-fill">{error}</span>
                  <button type="button" onClick={() => setError('')} className="tc-error-dismiss">
                    ×
                  </button>
                </div>
              )}
            </div>
          </form>
        </div>

        {/* ── No-results notice ──────────────────────────────────────────────── */}
        {!loading && hasQueried && trades.length === 0 && (
          <p className="tc-notice-empty">
            No trades found for this wallet and selected platforms in the chosen period.
          </p>
        )}
      </div>
      {/* end tc-wallet-top */}

      {/* ── Dashboard ──────────────────────────────────────────────────────── */}
      <div ref={dashboardRef}>
        <Dashboard
          filteredTrades={filteredTrades}
          hasData={hasData}
          hasQueried={hasQueried}
          startDate={startDate}
          endDate={endDate}
          setStartDate={setStartDate}
          setEndDate={setEndDate}
          wallet={wallet}
          platforms={platforms}
        />
      </div>
    </div>
  );
};

export default WalletForm;
