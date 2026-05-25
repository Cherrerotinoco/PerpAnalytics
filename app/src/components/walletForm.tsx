import React, { useState, useRef, useEffect } from 'react';
import { Trade } from '../types/tradeTypes';
import { buildJupiterTrades, JupiterTrade } from '../utils/normalizeJupiter';
import { buildPacificaTrades, PacificaFill } from '../utils/normalizePacifica';
import StatisticsTable from './statistics';
import TradeList from './tradeList';
import EquityCurveChart from './equityCurveChart';

const SOLANA_ADDRESS_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const MAX_CACHE_ENTRIES = 10;
const STORAGE_PREFIX = 'tc:';

function loadCachedTrades(key: string): Trade[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) {
      return null;
    }
    return (
      JSON.parse(raw) as Array<
        Omit<Trade, 'opened' | 'closed'> & { opened: string; closed: string }
      >
    ).map((t) => ({
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
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(trades));
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
  const [platforms, setPlatforms] = useState<Platform[]>(['jupiter']);
  const cacheRef = useRef<{ [key: string]: Trade[] }>({});
  const resultsRef = useRef<HTMLDetailsElement>(null);

  const toTimestamp = (date: string): string | undefined =>
    date ? String(Math.floor(new Date(date).getTime() / 1000)) : undefined;

  const shouldScrollRef = useRef(false);

  useEffect(() => {
    if (shouldScrollRef.current && filteredTrades.length > 0 && resultsRef.current) {
      shouldScrollRef.current = false;
      resultsRef.current.open = true;
      resultsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [filteredTrades]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

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

    setLoading(true);
    setError('');
    setTrades([]);
    setHasQueried(false);

    const cacheKey = JSON.stringify({
      wallet,
      startDate,
      endDate,
      platforms: [...platforms].sort(),
    });

    if (cacheRef.current[cacheKey]) {
      setTrades(cacheRef.current[cacheKey]);
      setHasQueried(true);
      setLoading(false);
      shouldScrollRef.current = true;
      return;
    }

    const stored = loadCachedTrades(cacheKey);
    if (stored) {
      cacheRef.current[cacheKey] = stored;
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
    setPlatforms(['jupiter']);
    setError('');
    setTrades([]);
    setHasQueried(false);
  };

  useEffect(() => {
    const startTs = toTimestamp(startDate);
    const endTs = toTimestamp(endDate);
    const filteredTrades = trades.filter((trade) => {
      const tradeTime = new Date(trade.closed).getTime();
      return (
        (!startTs || tradeTime >= parseInt(startTs) * 1000) &&
        (!endTs || tradeTime <= parseInt(endTs) * 1000)
      );
    });

    setFilteredTrades(filteredTrades);
  }, [trades, startDate, endDate]);

  const isDisabled = loading || !wallet || !startDate || platforms.length === 0;

  return (
    <div>
      {/* ── Form card ── */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-body p-4">
          <form onSubmit={handleSubmit} autoComplete="off">
            {/* Header */}
            <h2 className="fw-bold mb-1" style={{ fontSize: '1.1rem' }}>
              Trade Query
            </h2>
            <p className="text-secondary mb-4" style={{ fontSize: '0.85rem' }}>
              Analyze your Jupiter and Pacifica trades on Solana
            </p>

            {/* Wallet */}
            <div className="mb-3">
              <label
                htmlFor="wallet"
                className="form-label text-uppercase fw-semibold text-secondary"
                style={{ fontSize: '0.65rem', letterSpacing: '0.06em' }}
              >
                Wallet Address
              </label>
              <input
                id="wallet"
                type="text"
                name="wallet"
                className="form-control bg-light border"
                placeholder="e.g. 4Nd1mWq3C7kE..."
                value={wallet}
                onChange={(e) => setWallet(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
            </div>

            {/* Date range */}
            <div className="row g-3 mb-3">
              <div className="col-12 col-sm-6">
                <label
                  htmlFor="start-date"
                  className="form-label text-uppercase fw-semibold text-secondary"
                  style={{ fontSize: '0.65rem', letterSpacing: '0.06em' }}
                >
                  Start Date
                </label>
                <input
                  id="start-date"
                  type="date"
                  name="start-date"
                  className="form-control bg-light border"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="col-12 col-sm-6">
                <label
                  htmlFor="end-date"
                  className="form-label text-uppercase fw-semibold text-secondary"
                  style={{ fontSize: '0.65rem', letterSpacing: '0.06em' }}
                >
                  End Date
                </label>
                <input
                  id="end-date"
                  type="date"
                  name="end-date"
                  className="form-control bg-light border"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>

            <hr className="text-secondary opacity-25" />

            {/* Platforms */}
            <h2 className="fw-semibold mb-1" style={{ fontSize: '0.95rem' }}>
              Platforms
            </h2>
            <p className="text-secondary mb-3" style={{ fontSize: '0.85rem' }}>
              Select the platforms to query trades from
            </p>

            <fieldset className="border-0 p-0 m-0">
              <legend className="visually-hidden">Platforms</legend>
              {(['jupiter', 'pacifica'] as Platform[]).map((p) => {
                const isActive = platforms.includes(p);
                return (
                  <label
                    key={p}
                    htmlFor={p}
                    className={`d-flex align-items-start gap-3 p-3 rounded-3 mb-2 cursor-pointer border ${
                      isActive ? 'border-primary bg-primary bg-opacity-10' : 'border-light bg-light'
                    }`}
                    style={{ cursor: 'pointer' }}
                  >
                    <input
                      id={p}
                      name={p}
                      type="checkbox"
                      className="form-check-input mt-1 flex-shrink-0"
                      checked={isActive}
                      onChange={(e) => {
                        setPlatforms((prev) =>
                          e.target.checked ? [...prev, p] : prev.filter((x) => x !== p)
                        );
                      }}
                    />
                    <div>
                      <p className="fw-semibold mb-0" style={{ fontSize: '0.9rem' }}>
                        {p === 'jupiter' ? 'Jupiter' : 'Pacifica'}
                      </p>
                      <p className="text-secondary mb-0" style={{ fontSize: '0.8rem' }}>
                        {p === 'jupiter'
                          ? 'Query Jupiter Perpetuals trades'
                          : 'Query Pacifica Finance trades'}
                      </p>
                    </div>
                  </label>
                );
              })}
            </fieldset>

            {/* Error */}
            {error && (
              <div
                className="alert alert-danger d-flex align-items-center gap-2 mt-3 py-2 px-3"
                role="alert"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                  className="flex-shrink-0"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
                    clipRule="evenodd"
                  />
                </svg>
                <span style={{ fontSize: '0.85rem' }}>{error}</span>
                <button
                  type="button"
                  className="btn-close btn-close-sm ms-auto"
                  onClick={() => setError('')}
                  aria-label="Close"
                />
              </div>
            )}

            {/* Actions */}
            <div className="d-flex justify-content-end align-items-center gap-3 mt-4">
              <button
                type="button"
                className="btn btn-link text-secondary text-decoration-none"
                onClick={handleClear}
              >
                Clear
              </button>
              <button type="submit" disabled={isDisabled} className="btn btn-primary px-4">
                {loading ? (
                  <>
                    <span
                      className="spinner-border spinner-border-sm me-2"
                      role="status"
                      aria-hidden="true"
                    />
                    Loading...
                  </>
                ) : (
                  'Search'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* ── Loading ── */}
      {loading && (
        <div className="d-flex justify-content-center align-items-center gap-3 py-5 text-secondary">
          <div
            className="spinner-border spinner-border-sm text-primary"
            role="status"
            aria-hidden="true"
          />
          <span style={{ fontSize: '0.9rem' }}>Fetching trades...</span>
        </div>
      )}

      {/* ── Empty state ── */}
      {!loading && hasQueried && trades.length === 0 && (
        <div className="card border-0 shadow-sm text-center py-5">
          <div className="card-body">
            <svg
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#adb5bd"
              strokeWidth="1.5"
              className="mb-3"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <p className="text-secondary mb-0" style={{ fontSize: '0.9rem' }}>
              No trades found for this period and selected platforms.
            </p>
          </div>
        </div>
      )}

      {/* ── Results ── */}
      {!loading && filteredTrades.length > 0 && (
        <div className="card border-0 shadow-sm mt-2 overflow-hidden">
          <details open ref={resultsRef}>
            <summary
              className="panel-summary px-4 py-3 border-bottom fw-semibold"
              style={{ fontSize: '0.9rem' }}
            >
              Statistics
              <svg
                className="panel-chevron"
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                fill="currentColor"
                viewBox="0 0 16 16"
              >
                <path
                  fillRule="evenodd"
                  d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z"
                />
              </svg>
            </summary>
            <StatisticsTable trades={filteredTrades} />
          </details>

          <details>
            <summary
              className="panel-summary px-4 py-3 border-bottom fw-semibold"
              style={{ fontSize: '0.9rem' }}
            >
              Equity Curve
              <svg
                className="panel-chevron"
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                fill="currentColor"
                viewBox="0 0 16 16"
              >
                <path
                  fillRule="evenodd"
                  d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z"
                />
              </svg>
            </summary>
            <div className="p-4">
              <EquityCurveChart trades={filteredTrades} />
            </div>
          </details>

          <details>
            <summary className="panel-summary px-4 py-3 fw-semibold" style={{ fontSize: '0.9rem' }}>
              Trade History
              <svg
                className="panel-chevron"
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                fill="currentColor"
                viewBox="0 0 16 16"
              >
                <path
                  fillRule="evenodd"
                  d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z"
                />
              </svg>
            </summary>
            <TradeList trades={filteredTrades} />
          </details>
        </div>
      )}
    </div>
  );
}
