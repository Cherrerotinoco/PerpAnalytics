import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Trade } from '../types/tradeTypes';
import { buildJupiterTrades, JupiterTrade } from '../utils/normalizeJupiter';
import { buildPacificaTrades, PacificaFill } from '../utils/normalizePacifica';
import { computeTradeStats } from './dashboard/panels/statistics';
import DashboardGrid from './dashboard/DashboardGrid';

const SOLANA_ADDRESS_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const MAX_CACHE_ENTRIES = 10;
const STORAGE_PREFIX = 'tc:';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  cachedAt: number;
  data: Array<Omit<Trade, 'opened' | 'closed'> & { opened: string; closed: string }>;
}

function loadCachedTrades(key: string): Trade[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) {
      return null;
    }
    const entry = JSON.parse(raw) as CacheEntry;
    if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
      localStorage.removeItem(STORAGE_PREFIX + key);
      return null;
    }
    return entry.data.map((t) => ({
      ...t,
      opened: new Date(t.opened),
      closed: new Date(t.closed),
    }));
  } catch {
    return null;
  }
}

function saveCachedTrades(key: string, trades: Trade[]): void {
  try {
    localStorage.setItem(
      STORAGE_PREFIX + key,
      JSON.stringify({ cachedAt: Date.now(), data: trades })
    );
  } catch {
    // Storage quota exceeded, silently skip
  }
}

// ─── URL param helpers ────────────────────────────────────────────────────────
/** Parse DD.MM.YYYY (URL format) → YYYY-MM-DD (HTML date input value) */
function parseDateParam(s: string | null): string {
  if (!s) return '';
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return '';
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

/** Format YYYY-MM-DD (HTML date input value) → DD.MM.YYYY (URL-friendly) */
function formatDateParam(s: string): string {
  if (!s) return '';
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const [, y, mo, d] = m;
  return `${d}.${mo}.${y}`;
}

const _initParams = new URLSearchParams(window.location.search);

type Platform = 'jupiter' | 'pacifica';

interface WalletFormProps {
  wallet: string;
  setWallet: (w: string) => void;
  addRecentWallet: (w: string) => void;
}

export const WalletForm = ({ wallet, setWallet, addRecentWallet }: WalletFormProps) => {
  const [startDate, setStartDate] = useState(() => parseDateParam(_initParams.get('start_date')));
  const [endDate, setEndDate] = useState(() => parseDateParam(_initParams.get('end_date')));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [trades, setTrades] = useState<Trade[]>([]);
  const [filteredTrades, setFilteredTrades] = useState<Trade[]>([]);
  const [hasQueried, setHasQueried] = useState(false);
  const [platforms, setPlatforms] = useState<Platform[]>(() => {
    const p = _initParams.get('platforms');
    if (!p) return ['jupiter', 'pacifica'];
    const valid = p.split(',').filter((x): x is Platform => x === 'jupiter' || x === 'pacifica');
    return valid.length ? valid : ['jupiter', 'pacifica'];
  });
  const cacheRef = useRef<{ [key: string]: Trade[] }>({});
  const cacheTsRef = useRef<{ [key: string]: number }>({});
  const didAutoSubmit = useRef(false);

  const stats = useMemo(() => computeTradeStats(filteredTrades), [filteredTrades]);

  const toTimestamp = (date: string): string | undefined =>
    date ? String(Math.floor(new Date(date).getTime() / 1000)) : undefined;

  // ── Pre-fill wallet from URL on mount ──
  useEffect(() => {
    const urlWallet = _initParams.get('wallet');
    if (urlWallet) setWallet(urlWallet);
  }, []);

  const handleSubmit = async (e: React.FormEvent | null, forceRefresh = false) => {
    if (e) {
      e.preventDefault();
    }

    if (!wallet || !SOLANA_ADDRESS_REGEX.test(wallet)) {
      setError('Enter a valid Solana wallet address (32–44 Base58 characters).');
      return;
    }
    if (!startDate) {
      setError('Start date is required.');
      return;
    }
    if (platforms.length === 0) {
      setError('Select at least one platform.');
      return;
    }

    // Sync current form values to URL so the user can bookmark / share
    const urlParams = new URLSearchParams();
    urlParams.set('wallet', wallet);
    urlParams.set('start_date', formatDateParam(startDate));
    if (endDate) urlParams.set('end_date', formatDateParam(endDate));
    urlParams.set('platforms', platforms.join(','));
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
            return buildJupiterTrades(allEvents);
          }
          if (platform === 'pacifica') {
            const allFills: PacificaFill[] = [];
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
              allFills.push(...(json.data ?? []));
              if (json.has_more) {
                await fetchPage(json.next_cursor);
              }
            };
            await fetchPage();
            return buildPacificaTrades(allFills);
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
  };

  useEffect(() => {
    if (didAutoSubmit.current) return;
    if (!_initParams.get('wallet') || !_initParams.get('start_date')) return;
    if (!wallet || !startDate) return;
    didAutoSubmit.current = true;
    handleSubmit(null);
  }, [wallet, startDate]);

  useEffect(() => {
    const startTs = toTimestamp(startDate);
    const endTs = toTimestamp(endDate);
    setFilteredTrades(
      trades.filter((trade) => {
        const t = new Date(trade.closed).getTime();
        return (
          (!startTs || t >= parseInt(startTs) * 1000) && (!endTs || t <= parseInt(endTs) * 1000)
        );
      })
    );
  }, [trades, startDate, endDate]);

  const isDisabled = loading || !wallet || !startDate || platforms.length === 0;
  const hasData = !loading && filteredTrades.length > 0;

  return (
    <div className="tc-wallet-root">
      {/* ── Above-fold: form, status ────────────────────────────────────────── */}
      <div className="tc-wallet-top">
        {/* ── Search bar ─────────────────────────────────────────────────────── */}
        <div className="tc-panel tc-search-pad mb-3">
          <form onSubmit={handleSubmit} autoComplete="off">
            <div className="d-flex align-items-center gap-2 flex-wrap">
              {/* Wallet address */}
              <div className="tc-wallet-input-wrap">
                <input
                  id="wallet"
                  type="text"
                  name="wallet"
                  className="tc-input font-monospace"
                  placeholder="Wallet address…"
                  value={wallet}
                  onChange={(e) => setWallet(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>

              {/* Date range */}
              <span className="tc-label">From</span>
              <input
                id="start-date"
                type="date"
                name="start-date"
                className="tc-input tc-date-input"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
              <span className="tc-label">To</span>
              <input
                id="end-date"
                type="date"
                name="end-date"
                className="tc-input tc-date-input"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />

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
                        {isActive && (
                          <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                            <polyline
                              points="1,3.5 3.2,5.8 8,1"
                              stroke="#111"
                              strokeWidth="1.6"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
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
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="23 4 23 10 17 10" />
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                  </svg>
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
      </div>{/* end tc-wallet-top */}

      {/* ── Dashboard ──────────────────────────────────────────────────────── */}
      <DashboardGrid
        filteredTrades={filteredTrades}
        hasData={hasData}
        hasQueried={hasQueried}
      />
    </div>
  );
};

export default WalletForm;
