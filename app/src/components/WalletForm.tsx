import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { CgSync, CgCheck } from 'react-icons/cg';
import { Trade } from '../types/tradeTypes';
import { normalizeJupiterTrades, JupiterTrade } from '../utils/normalizeJupiter';
import { normalizePacificaTrades, PacificaFill } from '../utils/normalizePacifica';
import DashboardGrid from '../dashboard/DashboardGrid';
import RecentWallets from './RecentWallets';

const SOLANA_ADDRESS_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
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
    (o.source === 'Jupiter' || o.source === 'Pacifica') &&
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

const _initParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');

type Platform = 'jupiter' | 'pacifica';

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
  const [startDate, setStartDate] = useState(() => parseDateParam(_initParams.get('start_date')));
  const [endDate, setEndDate] = useState(() => parseDateParam(_initParams.get('end_date')));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [trades, setTrades] = useState<Trade[]>([]);
  const [hasQueried, setHasQueried] = useState(false);
  const [platforms, setPlatforms] = useState<Platform[]>(() => {
    const p = _initParams.get('platforms');
    if (!p) {
      return ['jupiter', 'pacifica'];
    }
    const valid = p.split(',').filter((x): x is Platform => x === 'jupiter' || x === 'pacifica');
    return valid.length ? valid : ['jupiter', 'pacifica'];
  });
  const cacheRef = useRef<{ [key: string]: Trade[] }>({});
  const cacheTsRef = useRef<{ [key: string]: number }>({});
  const didAutoSubmit = useRef(false);
  const dashboardRef = useRef<HTMLDivElement>(null);

  const scrollToDashboard = useCallback(() => {
    dashboardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  // ── Pre-fill wallet from URL on mount ──
  useEffect(() => {
    const urlWallet = _initParams.get('wallet');
    if (urlWallet) {
      setWallet(urlWallet);
    }
  }, []);

  // ── Live-sync filter changes to URL ──────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (startDate) {
      params.set('start_date', formatDateParam(startDate));
    } else {
      params.delete('start_date');
    }
    if (endDate) {
      params.set('end_date', formatDateParam(endDate));
    } else {
      params.delete('end_date');
    }
    if (platforms.length > 0) {
      params.set('platforms', platforms.join(','));
    } else {
      params.delete('platforms');
    }
    const qs = params.toString();
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
  }, [startDate, endDate, platforms]);

  const handleSubmit = useCallback(async (e: React.FormEvent | null, forceRefresh = false) => {
    if (e) {
      e.preventDefault();
    }

    if (!wallet || !SOLANA_ADDRESS_REGEX.test(wallet)) {
      setError('Enter a valid Solana wallet address (32–44 Base58 characters).');
      return;
    }

    if (platforms.length === 0) {
      setError('Select at least one platform.');
      return;
    }

    // Write wallet to URL — filters are already kept in sync by the live-sync effect
    const urlParams = new URLSearchParams(window.location.search);
    urlParams.set('wallet', wallet);
    window.history.replaceState(null, '', `?${urlParams.toString()}`);

    const cacheKey = JSON.stringify({ wallet, platforms: [...platforms].sort() });

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

    const controller = new AbortController();
    const fetchTimeout = setTimeout(() => controller.abort(), 30_000);

    try {
      const results = await Promise.all(
        platforms.map(async (platform) => {
          if (platform === 'jupiter') {
            const allEvents: JupiterTrade[] = [];
            // Jupiter returns a stable `count` (total items) so the recursion is
            // naturally bounded — no extra guard needed.
            const fetchPage = async (start: number, end: number): Promise<void> => {
              const url = `https://perps-api.jup.ag/v1/trades?walletAddress=${wallet}&start=${start}&end=${end}`;
              const res = await fetch(url, { signal: controller.signal });
              if (!res.ok) {
                throw new Error(`Error fetching Jupiter data: ${res.statusText}`);
              }
              const data = await res.json();
              allEvents.push(...(data.dataList ?? []));
              if (data.count > end) {
                await fetchPage(end, end + 1000);
              }
            };
            await fetchPage(0, 1000);
            return normalizeJupiterTrades(allEvents);
          }
          if (platform === 'pacifica') {
            const allFills: PacificaFill[] = [];
            // Guard: only continue if the server actually returned items.
            // This stops infinite loops when has_more is true but data is empty
            // (e.g. a misbehaving or compromised endpoint).
            const fetchPage = async (cursor?: string): Promise<void> => {
              const cursorParam = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
              const res = await fetch(
                `https://api.pacifica.fi/api/v1/trades/history?account=${wallet}&limit=1000${cursorParam}`,
                { signal: controller.signal }
              );
              if (!res.ok) {
                throw new Error(`Error fetching Pacifica data: ${res.statusText}`);
              }
              const json = await res.json();
              const page: PacificaFill[] = json.data ?? [];
              allFills.push(...page);
              if (json.has_more && page.length > 0) {
                await fetchPage(json.next_cursor);
              }
            };
            await fetchPage();
            return normalizePacificaTrades(allFills);
          }
          return [];
        })
      );

      const allTrades = results.flat();
      const cacheKeys = Object.keys(cacheRef.current);
      if (cacheKeys.length >= MAX_CACHE_ENTRIES) {
        delete cacheRef.current[cacheKeys[0]];
      }
      cacheRef.current[cacheKey] = allTrades;
      cacheTsRef.current[cacheKey] = Date.now();
      saveCachedTrades(cacheKey, allTrades);
      setTrades(allTrades);
      setHasQueried(true);
      addRecentWallet(wallet);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setError('Request timed out after 30 s. Please check your connection and try again.');
      } else {
        console.error('Failed to fetch trades:', err);
        setError('Failed to fetch trades. Check the console for details.');
      }
    } finally {
      clearTimeout(fetchTimeout);
      setLoading(false);
    }
  }, [wallet, platforms, startDate, endDate, addRecentWallet, scrollToDashboard]);

  useEffect(() => {
    if (didAutoSubmit.current) return;
    if (!_initParams.get('wallet') || !_initParams.get('start_date')) return;
    if (!wallet || !startDate) return;
    didAutoSubmit.current = true;
    handleSubmit(null);
  }, [wallet, startDate]);

  const filteredTrades = useMemo(() => {
    const startMs = startDate ? new Date(startDate).getTime() : 0;
    const endMs = endDate ? new Date(endDate).getTime() : 0;
    return trades.filter((trade) => {
      const t = trade.closed.getTime();
      const sourceKey = trade.source.toLowerCase() as Platform;
      return platforms.includes(sourceKey) && (!startMs || t >= startMs) && (!endMs || t <= endMs);
    });
  }, [trades, startDate, endDate, platforms]);

  const isDisabled = loading || !wallet || platforms.length === 0;
  const hasData = !loading && filteredTrades.length > 0;

  return (
    <div className="tc-wallet-root">
      {/* ── Above-fold: form, status ────────────────────────────────────────── */}
      <div className="tc-wallet-top">
        <RecentWallets wallets={recentWallets} onSelect={(w) => setWallet(w)} />

        {/* ── Search bar ─────────────────────────────────────────────────────── */}
        <div className="tc-panel tc-search-pad">
          <form onSubmit={handleSubmit} autoComplete="off">
            <div className="d-flex align-items-center gap-2 flex-wrap">
              {/* Wallet address */}
              <div className="tc-wallet-input-wrap">
                <label className="tc-label" htmlFor="wallet">
                  Wallet Address *
                </label>
                <input
                  id="wallet"
                  type="text"
                  name="wallet"
                  className="tc-input font-monospace"
                  placeholder="Wallet address…"
                  required
                  value={wallet}
                  onChange={(e) => setWallet(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>

              {/* Date range */}
              <div>
                <label className="tc-label" htmlFor="start-date">
                  From
                </label>
                <input
                  id="start-date"
                  type="date"
                  name="start-date"
                  className="tc-input tc-date-input"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div>
                <label className="tc-label" htmlFor="end-date">
                  To
                </label>
                <input
                  id="end-date"
                  type="date"
                  name="end-date"
                  className="tc-input tc-date-input"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
              {/* Platform checkboxes */}
              <div className="tc-platform-group">
                {(['jupiter', 'pacifica'] as Platform[]).map((p) => {
                  const isActive = platforms.includes(p);
                  const label = p === 'jupiter' ? 'Jupiter' : 'Pacifica';
                  return (
                    <label
                      key={p}
                      htmlFor={`plat-${p}`}
                      className={`tc-platform-label ${isActive ? 'tc-platform-label--active' : 'tc-platform-label--inactive'}`}
                    >
                      <input
                        id={`plat-${p}`}
                        type="checkbox"
                        checked={isActive}
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
              <button type="submit" disabled={isDisabled} className="tc-btn-primary">
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

            {/* Error */}
            {error && (
              <div className="tc-error-msg">
                <span className="flex-fill">{error}</span>
                <button type="button" onClick={() => setError('')} className="tc-error-dismiss">
                  ×
                </button>
              </div>
            )}
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
        <DashboardGrid filteredTrades={filteredTrades} hasData={hasData} hasQueried={hasQueried} />
      </div>
    </div>
  );
};

export default WalletForm;
