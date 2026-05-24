import React, { useState, useRef } from 'react';
import { Trade } from '../../types/tradeTypes';
import { buildJupiterTrades } from '../../utils/normalizeJupiter';
import { buildPacificaTrades } from '../../utils/normalizePacifica';
import StatisticsTable from './statistics';
import TradeList from './tradeList';
import EquityCurveChart from './equityCurveChart';

const SOLANA_ADDRESS_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const MAX_CACHE_ENTRIES = 10;

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
  const [hasQueried, setHasQueried] = useState(false);
  const [platforms, setPlatforms] = useState<Platform[]>(['jupiter']);
  const cacheRef = useRef<{ [key: string]: Trade[] }>({});

  const toTimestamp = (date: string): string | undefined =>
    date ? String(Math.floor(new Date(date).getTime() / 1000)) : undefined;

  const buildUrl = (source: Platform): string => {
    const params: Record<string, string> = {};
    const startTs = toTimestamp(startDate);
    const endTs = toTimestamp(endDate);

    console.log('buildUrl', { wallet, startTs, endTs, source });

    if (startTs) params.startTime = startTs;
    if (endTs) params.endTime = endTs;
    if (source === 'jupiter') {
      params.walletAddress = wallet;
      return `https://perps-api.jup.ag/v1/trades?` + new URLSearchParams(params).toString();
    } else {
      params.account = wallet;
      return `https://api.pacifica.fi/api/v1/positions/history?` + new URLSearchParams(params).toString();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!wallet || !SOLANA_ADDRESS_REGEX.test(wallet)) {
      setError('Introduce una wallet de Solana válida (32–44 caracteres Base58).');
      return;
    }

    console.log('startDate', startDate, 'endDate', endDate);
    if (!startDate) {
      setError('Debes ingresar la fecha de inicio.');
      return;
    }
    if (platforms.length === 0) {
      setError('Selecciona al menos una plataforma.');
      return;
    }

    setLoading(true);
    setError('');
    setTrades([]);
    setHasQueried(false);

    const cacheKey = JSON.stringify({ wallet, startDate, endDate, platforms: [...platforms].sort() });

    if (cacheRef.current[cacheKey]) {
      setTrades(cacheRef.current[cacheKey]);
      setHasQueried(true);
      setLoading(false);
      return;
    }

    try {
      const results = await Promise.all(
        platforms.map(async (platform) => {
          const res = await fetch(buildUrl(platform));
          const data = await res.json();
          return platform === 'jupiter'
            ? buildJupiterTrades(data.dataList || [])
            : buildPacificaTrades(data.data || []);
        })
      );

      const allTrades = results.flat();
      const cacheKeys = Object.keys(cacheRef.current);
      if (cacheKeys.length >= MAX_CACHE_ENTRIES) {
        delete cacheRef.current[cacheKeys[0]];
      }
      cacheRef.current[cacheKey] = allTrades;
      setTrades(allTrades);
      setHasQueried(true);
      addRecentWallet(wallet);
    } catch (err) {
      console.error('Error al consultar la API:', err);
      setError('Error al consultar la API. Revisa la consola para más detalles.');
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

  const isDisabled = loading || !wallet || !startDate || platforms.length === 0;

  return (
    <div>
      {/* ── Form card ── */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-body p-4">
          <form onSubmit={handleSubmit} autoComplete="off">

            {/* Header */}
            <h2 className="fw-bold mb-1" style={{ fontSize: '1.1rem' }}>Consulta de Trades</h2>
            <p className="text-secondary mb-4" style={{ fontSize: '0.85rem' }}>
              Analiza tus operaciones de Jupiter y Pacifica en Solana
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
                placeholder="Ej: 4Nd1mWq3C7kE..."
                value={wallet}
                onChange={e => setWallet(e.target.value)}
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
                  Fecha inicio
                </label>
                <input
                  id="start-date"
                  type="date"
                  name="start-date"
                  className="form-control bg-light border"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                />
              </div>
              <div className="col-12 col-sm-6">
                <label
                  htmlFor="end-date"
                  className="form-label text-uppercase fw-semibold text-secondary"
                  style={{ fontSize: '0.65rem', letterSpacing: '0.06em' }}
                >
                  Fecha fin
                </label>
                <input
                  id="end-date"
                  type="date"
                  name="end-date"
                  className="form-control bg-light border"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                />
              </div>
            </div>

            <hr className="text-secondary opacity-25" />

            {/* Platforms */}
            <h2 className="fw-semibold mb-1" style={{ fontSize: '0.95rem' }}>Plataformas</h2>
            <p className="text-secondary mb-3" style={{ fontSize: '0.85rem' }}>
              Selecciona las plataformas de las que deseas consultar trades
            </p>

            <fieldset className="border-0 p-0 m-0">
              <legend className="visually-hidden">Plataformas</legend>
              {(['jupiter', 'pacifica'] as Platform[]).map((p) => {
                const isActive = platforms.includes(p);
                return (
                  <label
                    key={p}
                    htmlFor={p}
                    className={`d-flex align-items-start gap-3 p-3 rounded-3 mb-2 cursor-pointer border ${isActive ? 'border-primary bg-primary bg-opacity-10' : 'border-light bg-light'
                      }`}
                    style={{ cursor: 'pointer' }}
                  >
                    <input
                      id={p}
                      name={p}
                      type="checkbox"
                      className="form-check-input mt-1 flex-shrink-0"
                      checked={isActive}
                      onChange={e => {
                        setPlatforms(prev =>
                          e.target.checked ? [...prev, p] : prev.filter(x => x !== p)
                        );
                      }}
                    />
                    <div>
                      <p className="fw-semibold mb-0" style={{ fontSize: '0.9rem' }}>
                        {p === 'jupiter' ? 'Jupiter' : 'Pacifica'}
                      </p>
                      <p className="text-secondary mb-0" style={{ fontSize: '0.8rem' }}>
                        {p === 'jupiter'
                          ? 'Consultar trades de Jupiter Perpetuals'
                          : 'Consultar trades de Pacifica Finance'}
                      </p>
                    </div>
                  </label>
                );
              })}
            </fieldset>

            {/* Error */}
            {error && (
              <div className="alert alert-danger d-flex align-items-center gap-2 mt-3 py-2 px-3" role="alert">
                <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="flex-shrink-0">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                </svg>
                <span style={{ fontSize: '0.85rem' }}>{error}</span>
              </div>
            )}

            {/* Actions */}
            <div className="d-flex justify-content-end align-items-center gap-3 mt-4">
              <button
                type="button"
                className="btn btn-link text-secondary text-decoration-none"
                onClick={handleClear}
              >
                Limpiar
              </button>
              <button
                type="submit"
                disabled={isDisabled}
                className="btn btn-primary px-4"
              >
                {loading ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
                    Consultando...
                  </>
                ) : 'Consultar'}
              </button>
            </div>

          </form>
        </div>
      </div>

      {/* ── Loading ── */}
      {loading && (
        <div className="d-flex justify-content-center align-items-center gap-3 py-5 text-secondary">
          <div className="spinner-border spinner-border-sm text-primary" role="status" aria-hidden="true" />
          <span style={{ fontSize: '0.9rem' }}>Consultando plataformas...</span>
        </div>
      )}

      {/* ── Empty state ── */}
      {!loading && hasQueried && trades.length === 0 && (
        <div className="card border-0 shadow-sm text-center py-5">
          <div className="card-body">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#adb5bd" strokeWidth="1.5" className="mb-3" aria-hidden="true">
              <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
            </svg>
            <p className="text-secondary mb-0" style={{ fontSize: '0.9rem' }}>
              No se encontraron trades para este período y plataformas seleccionadas.
            </p>
          </div>
        </div>
      )}

      {/* ── Results ── */}
      {!loading && trades.length > 0 && (
        <div className="d-flex flex-column gap-4 mt-2">
          <StatisticsTable trades={trades} />
          <EquityCurveChart trades={trades} />
          <TradeList trades={trades} />
        </div>
      )}

    </div>
  );
}