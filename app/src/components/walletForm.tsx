import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Trade } from '../types/tradeTypes';
import { buildJupiterTrades, JupiterTrade } from '../utils/normalizeJupiter';
import { buildPacificaTrades, PacificaFill } from '../utils/normalizePacifica';
import {
  computeTradeStats,
  PerformanceSection,
  RiskSection,
  TradesSection,
} from './statistics';
import TradeList from './tradeList';
import EquityCurveChart from './equityCurveChart';
import PnlCalendar from './PnlCalendar';
import PnlBySymbolChart from './PnlBySymbolChart';

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
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify({ cachedAt: Date.now(), data: trades }));
  } catch {
    // Storage quota exceeded, silently skip
  }
}

type Platform = 'jupiter' | 'pacifica';

interface WalletFormProps {
  wallet: string;
  setWallet: (w: string) => void;
  addRecentWallet: (w: string) => void;
}

export default function WalletForm({ wallet, setWallet, addRecentWallet }: WalletFormProps) {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [trades, setTrades] = useState<Trade[]>([]);
  const [filteredTrades, setFilteredTrades] = useState<Trade[]>([]);
  const [hasQueried, setHasQueried] = useState(false);
  const [platforms, setPlatforms] = useState<Platform[]>(['jupiter', 'pacifica']);
  const cacheRef = useRef<{ [key: string]: Trade[] }>({});
  const cacheTsRef = useRef<{ [key: string]: number }>({});
  const resultsRef = useRef<HTMLDivElement>(null);
  const shouldScrollRef = useRef(false);

  const stats = useMemo(() => computeTradeStats(filteredTrades), [filteredTrades]);

  const toTimestamp = (date: string): string | undefined =>
    date ? String(Math.floor(new Date(date).getTime() / 1000)) : undefined;

  useEffect(() => {
    if (shouldScrollRef.current && filteredTrades.length > 0 && resultsRef.current) {
      shouldScrollRef.current = false;
      resultsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [filteredTrades]);

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
      shouldScrollRef.current = true;
      return;
    }

    const stored = loadCachedTrades(cacheKey);
    if (stored) {
      cacheRef.current[cacheKey] = stored;
      cacheTsRef.current[cacheKey] = Date.now();
      setTrades(stored);
      setHasQueried(true);
      setLoading(false);
      shouldScrollRef.current = true;
      return;
    }

    try {
      const results = await Promise.all(
        platforms.map(async (platform) => {
          if (platform === 'jupiter') {
            const allEvents: JupiterTrade[] = [];
            const fetchPage = async (start: number, end: number): Promise<void> => {
              const url = `https://perps-api.jup.ag/v1/trades?walletAddress=${wallet}&start=${start}&end=${end}`;
              const res = await fetch(url);
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
              const res = await fetch(
                `https://api.pacifica.fi/api/v1/trades/history?account=${wallet}&limit=1000${cursor ? `&cursor=${cursor}` : ''}`
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
      shouldScrollRef.current = true;
    } catch (err) {
      console.error('Failed to fetch trades:', err);
      setError('Failed to fetch trades. Check the console for details.');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setWallet('');
    setStartDate('');
    setEndDate('');
    setPlatforms(['jupiter', 'pacifica']);
    setError('');
    setTrades([]);
    setHasQueried(false);
  };

  useEffect(() => {
    const startTs = toTimestamp(startDate);
    const endTs = toTimestamp(endDate);
    setFilteredTrades(
      trades.filter((trade) => {
        const t = new Date(trade.closed).getTime();
        return (
          (!startTs || t >= parseInt(startTs) * 1000) &&
          (!endTs || t <= parseInt(endTs) * 1000)
        );
      })
    );
  }, [trades, startDate, endDate]);

  const isDisabled = loading || !wallet || !startDate || platforms.length === 0;

  return (
    <div>
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
                className="tc-input form-control form-control-sm font-monospace"
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
              className="tc-input form-control form-control-sm tc-date-input"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <span className="tc-label">To</span>
            <input
              id="end-date"
              type="date"
              name="end-date"
              className="tc-input form-control form-control-sm tc-date-input"
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
                    className="tc-platform-label"
                    style={{ color: isActive ? 'var(--tc-text)' : 'var(--tc-muted)' }}
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
                      className="tc-checkbox-box"
                      style={{
                        border: `1.5px solid ${isActive ? 'var(--tc-accent)' : 'var(--tc-border)'}`,
                        background: isActive ? 'var(--tc-accent)' : 'transparent',
                      }}
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
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
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

      {/* ── Loading ────────────────────────────────────────────────────────── */}
      {loading && (
        <div className="tc-loading-state">
          <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
          Fetching trades…
        </div>
      )}

      {/* ── Empty state ────────────────────────────────────────────────────── */}
      {!loading && hasQueried && trades.length === 0 && (
        <div className="tc-panel tc-empty-state">
          <svg
            width="36"
            height="36"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="tc-empty-icon"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <p>No trades found for this period and selected platforms.</p>
        </div>
      )}

      {/* ── Dashboard ──────────────────────────────────────────────────────── */}
      {!loading && filteredTrades.length > 0 && (
        <div ref={resultsRef}>
          {/* Row 1: Equity Curve | Performance | Risk & Drawdown */}
          <div className="mb-3 d-flex align-items-stretch gap-3 flex-wrap">
            {/* Equity Curve */}
            <div className="tc-panel tc-panel-equity">
              <div className="tc-panel-header">
                <span className="tc-panel-title">Equity Curve</span>
              </div>
              <div className="tc-panel-body">
                <EquityCurveChart trades={filteredTrades} />
              </div>
            </div>

            {/* Performance */}
            <div className="tc-panel tc-panel-stat">
              <div className="tc-panel-header">
                <span className="tc-panel-title">Performance</span>
              </div>
              <PerformanceSection stats={stats} />
            </div>

            {/* Risk & Drawdown */}
            <div className="tc-panel tc-panel-stat">
              <div className="tc-panel-header">
                <span className="tc-panel-title">Risk &amp; Drawdown</span>
              </div>
              <RiskSection stats={stats} />
            </div>
          </div>

          {/* Row 2: Trades | PnL Calendar | PnL by Symbol */}
          <div className="mb-3 d-flex align-items-stretch gap-3 flex-wrap">
            {/* Trades */}
            <div className="tc-panel tc-panel-stat">
              <div className="tc-panel-header">
                <span className="tc-panel-title">Trades</span>
              </div>
              <TradesSection stats={stats} />
            </div>

            {/* PnL Calendar */}
            <div className="tc-panel tc-panel-calendar">
              <div className="tc-panel-header">
                <span className="tc-panel-title">PnL Calendar</span>
              </div>
              <div className="tc-panel-body">
                <PnlCalendar trades={filteredTrades} />
              </div>
            </div>

            {/* PnL by Symbol */}
            <div className="tc-panel tc-panel-symbol">
              <div className="tc-panel-header">
                <span className="tc-panel-title">PnL by Symbol</span>
              </div>
              <div className="tc-panel-body">
                <PnlBySymbolChart trades={filteredTrades} />
              </div>
            </div>
          </div>

          {/* Trade History */}
          <div className="tc-panel tc-panel-overflow">
            <div className="tc-panel-header">
              <span className="tc-panel-title">Trade History</span>
              <span className="tc-small-muted">{filteredTrades.length} trades</span>
            </div>
            <TradeList trades={filteredTrades} />
          </div>
        </div>
      )}
    </div>
  );
}
