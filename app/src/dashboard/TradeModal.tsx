import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  createChart,
  CandlestickSeries,
  createSeriesMarkers,
  ColorType,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type Time,
  type SeriesMarker,
} from 'lightweight-charts';
import { Trade } from '../types/tradeTypes';
import { useTheme } from '../context/ThemeContext';

// ─── Formatters ───────────────────────────────────────────────────────────────
const fmtDateTime = (d: Date): string =>
  d.toLocaleString('en-US', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });

const fmtMoney = (n: number, decimals = 2): string =>
  n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

const fmtDuration = (from: Date, to: Date): string => {
  const ms  = to.getTime() - from.getTime();
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  const hr  = Math.floor(min / 60);
  const day = Math.floor(hr  / 24);
  if (day > 0) return `${day}d ${hr % 24}h ${min % 60}m`;
  if (hr  > 0) return `${hr}h ${min % 60}m`;
  if (min > 0) return `${min}m ${sec % 60}s`;
  return `${sec}s`;
};

// ─── OHLCV fetching ───────────────────────────────────────────────────────────
const BYBIT_SYMBOLS = new Set([
  'WIF', 'JTO', 'BONK', 'PYTH', 'JUP', 'RNDR', 'TIA', 'SEI', 'SUI', 'APT',
]);

interface Candle { time: number; open: number; high: number; low: number; close: number }

const pickInterval = (ms: number): { interval: string; paddingMs: number } => {
  const h = 3_600_000, d = 86_400_000;
  if (ms < h)       return { interval: '1m',  paddingMs: 30 * 60_000 };
  if (ms < 4 * h)   return { interval: '5m',  paddingMs: 2 * h };
  if (ms < 12 * h)  return { interval: '15m', paddingMs: 4 * h };
  if (ms < 3 * d)   return { interval: '1h',  paddingMs: 12 * h };
  if (ms < 14 * d)  return { interval: '4h',  paddingMs: 3 * d };
  return                   { interval: '1d',  paddingMs: 7 * d };
};

const toBinanceInterval = (i: string) =>
  ({ '1m':'1m','5m':'5m','15m':'15m','1h':'1h','4h':'4h','1d':'1d' })[i] ?? '1h';
const toBybitInterval = (i: string) =>
  ({ '1m':'1','5m':'5','15m':'15','1h':'60','4h':'240','1d':'D' })[i] ?? '60';

const fetchBinanceCandles = async (sym: string, iv: string, s: number, e: number, signal: AbortSignal): Promise<Candle[]> => {
  const res = await fetch(
    `https://api.binance.com/api/v3/klines?symbol=${sym}USDT&interval=${toBinanceInterval(iv)}&startTime=${s}&endTime=${e}&limit=1000`,
    { signal }
  );
  if (!res.ok) throw new Error(`Binance ${res.status}`);
  const data: [number, string, string, string, string, ...unknown[]][] = await res.json();
  return data.map(([t, o, h, l, c]) => ({ time: t, open: +o, high: +h, low: +l, close: +c }));
};

const fetchBybitCandles = async (sym: string, iv: string, s: number, e: number, signal: AbortSignal): Promise<Candle[]> => {
  const res = await fetch(
    `https://api.bybit.com/v5/market/kline?category=linear&symbol=${sym}USDT&interval=${toBybitInterval(iv)}&start=${s}&end=${e}&limit=1000`,
    { signal }
  );
  if (!res.ok) throw new Error(`Bybit ${res.status}`);
  const json = await res.json();
  const rows: string[][] = json.result?.list ?? [];
  return rows.map(([t, o, h, l, c]) => ({ time: +t, open: +o, high: +h, low: +l, close: +c })).reverse();
};

const fetchCandles = async (trade: Trade, signal: AbortSignal): Promise<Candle[]> => {
  const sym = trade.symbol.toUpperCase();
  const dur = trade.closed.getTime() - trade.opened.getTime();
  const { interval, paddingMs } = pickInterval(dur);
  const s = trade.opened.getTime() - paddingMs;
  const e = trade.closed.getTime()  + paddingMs;
  if (BYBIT_SYMBOLS.has(sym)) return fetchBybitCandles(sym, interval, s, e, signal);
  try { return await fetchBinanceCandles(sym, interval, s, e, signal); }
  catch { return fetchBybitCandles(sym, interval, s, e, signal); }
};

// ─── Chart ────────────────────────────────────────────────────────────────────
type ChartStatus = 'loading' | 'ok' | 'error';

const TradeChart = ({ trade }: { trade: Trade }) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef     = useRef<IChartApi | null>(null);
  const seriesRef    = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const [status, setStatus] = useState<ChartStatus>('loading');
  const [errMsg, setErrMsg] = useState('');

  const bg     = isDark ? '#141414' : '#ffffff';
  const border = isDark ? '#2a2a2a' : '#e5e7eb';
  const text   = isDark ? '#e0e0e0' : '#111827';
  const green  = isDark ? '#22c55e' : '#16a34a';
  const red    = isDark ? '#ef4444' : '#dc2626';

  // Create chart once
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const chart = createChart(el, {
      layout:          { background: { type: ColorType.Solid, color: bg }, textColor: text },
      grid:            { vertLines: { color: border }, horzLines: { color: border } },
      crosshair:       { mode: CrosshairMode.Normal },
      handleScroll:    false,
      handleScale:     false,
      rightPriceScale: { borderColor: border },
      timeScale:       { borderColor: border, timeVisible: true, secondsVisible: false },
      width:  el.clientWidth,
      height: el.clientHeight,
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: green, downColor: red,
      borderUpColor: green, borderDownColor: red,
      wickUpColor: green, wickDownColor: red,
    });
    chartRef.current  = chart;
    seriesRef.current = series;
    const ro = new ResizeObserver(() =>
      chart.applyOptions({ width: el.clientWidth, height: el.clientHeight })
    );
    ro.observe(el);
    return () => { ro.disconnect(); chart.remove(); chartRef.current = null; seriesRef.current = null; };
  }, []);

  // Re-theme
  useEffect(() => {
    chartRef.current?.applyOptions({
      layout:          { background: { type: ColorType.Solid, color: bg }, textColor: text },
      grid:            { vertLines: { color: border }, horzLines: { color: border } },
      rightPriceScale: { borderColor: border },
      timeScale:       { borderColor: border },
    });
    seriesRef.current?.applyOptions({
      upColor: green, downColor: red,
      borderUpColor: green, borderDownColor: red,
      wickUpColor: green, wickDownColor: red,
    });
  }, [isDark]);

  // Fetch & render data
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setStatus('loading');
    fetchCandles(trade, controller.signal).then((candles) => {
      if (cancelled || !seriesRef.current || !chartRef.current) return;
      if (!candles.length) { setStatus('error'); setErrMsg('No market data found.'); return; }

      const lwData: CandlestickData[] = candles.map((c) => ({
        time: Math.floor(c.time / 1000) as Time,
        open: c.open, high: c.high, low: c.low, close: c.close,
      }));
      seriesRef.current.setData(lwData);

      const openSec  = Math.floor(trade.opened.getTime() / 1000) as Time;
      const closeSec = Math.floor(trade.closed.getTime() / 1000) as Time;
      const isLong   = trade.side === 'long';

      // Use a color that contrasts on both light and dark chart backgrounds
      const markerColor = isDark ? '#ffffff' : '#1e293b';

      const markers: SeriesMarker<Time>[] = [
        {
          time:     openSec,
          position: isLong ? 'belowBar' : 'aboveBar',
          color:    markerColor,
          shape:    isLong ? 'arrowUp' : 'arrowDown',
          text:     trade.entryPrice ? `Open @ ${fmtMoney(trade.entryPrice, 2)}` : 'Open',
          size:     2,
        },
        {
          time:     closeSec,
          position: isLong ? 'aboveBar' : 'belowBar',
          color:    markerColor,
          shape:    'circle',
          text:     trade.exitPrice
            ? `Close @ ${fmtMoney(trade.exitPrice, 2)} (${trade.pnl >= 0 ? '+' : ''}${fmtMoney(trade.pnl, 2)} $)`
            : `Close (${trade.pnl >= 0 ? '+' : ''}${fmtMoney(trade.pnl, 2)} $)`,
          size:     2,
        },
      ];
      createSeriesMarkers(seriesRef.current, markers);

      const dur = trade.closed.getTime() - trade.opened.getTime();
      const { paddingMs } = pickInterval(dur);
      const pad = Math.floor(paddingMs / 1000);
      chartRef.current.timeScale().setVisibleRange({
        from: ((openSec as number) - pad) as Time,
        to:   ((closeSec as number) + pad) as Time,
      });
      setStatus('ok');
    }).catch((e) => {
      if (cancelled) return;
      setStatus('error');
      setErrMsg(e instanceof Error ? e.message : 'Failed to load market data.');
    });
    return () => { cancelled = true; controller.abort(); };
  }, [trade]);

  return (
    <div className="tc-trade-chart-wrap">
      <div ref={containerRef} className="tc-trade-lw-container" />
      {status === 'loading' && (
        <div className="tc-trade-chart-overlay">
          <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
          <span>Loading market data…</span>
        </div>
      )}
      {status === 'error' && (
        <div className="tc-trade-chart-overlay tc-trade-chart-overlay--error">⚠ {errMsg}</div>
      )}
      {status === 'ok' && (
        <div className="tc-trade-chart-legend">
          <span className="tc-trade-legend-item" style={{ color: isDark ? '#ffffff' : '#1e293b' }}>
            ▲ Open{trade.entryPrice ? ` @ ${fmtMoney(trade.entryPrice, 2)} $` : ''}
          </span>
          <span className="tc-trade-legend-item" style={{ color: trade.pnl >= 0 ? green : red }}>
            ● Close{trade.exitPrice ? ` @ ${fmtMoney(trade.exitPrice, 2)} $` : ''}{' '}
            ({trade.pnl >= 0 ? '+' : ''}{fmtMoney(trade.pnl, 2)} $)
          </span>
        </div>
      )}
    </div>
  );
};

// ─── Stat row ─────────────────────────────────────────────────────────────────
const StatRow = ({ label, value, colorClass }: { label: string; value: string; colorClass?: string }) => (
  <div className="tc-trade-stat-row">
    <span className="tc-trade-stat-label">{label}</span>
    <span className={`tc-trade-stat-value ${colorClass ?? ''}`}>{value}</span>
  </div>
);

// ─── Modal ────────────────────────────────────────────────────────────────────
interface TradeModalProps {
  trade: Trade;
  onClose: () => void;
}

export const TradeModal = ({ trade, onClose }: TradeModalProps) => {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Escape to close
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      // Focus trap — cycle Tab/Shift+Tab within the modal
      if (e.key === 'Tab' && modalRef.current) {
        const focusable = Array.from(
          modalRef.current.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => !(el as HTMLButtonElement).disabled);
        if (!focusable.length) return;
        const first = focusable[0];
        const last  = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);

    // Move focus to the close button on open
    const closeBtn = modalRef.current?.querySelector<HTMLElement>('.tc-modal-close');
    closeBtn?.focus();

    // Body scroll lock (ref-counted so it coexists with the off-canvas drawer)
    const locks = parseInt(document.body.dataset.overflowLocks ?? '0', 10);
    document.body.dataset.overflowLocks = String(locks + 1);
    if (locks === 0) document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      const next = Math.max(0, parseInt(document.body.dataset.overflowLocks ?? '0', 10) - 1);
      document.body.dataset.overflowLocks = String(next);
      if (next === 0) document.body.style.overflow = '';
    };
  }, [onClose]);

  const pnlNet   = trade.pnl;
  const pnlGross = trade.pnl + trade.fee;
  const duration = fmtDuration(trade.opened, trade.closed);
  const closeColors: Record<string, string> = {
    TP: 'tc-green', SL: 'tc-red', Manual: '', Liquidation: 'tc-red',
  };

  return createPortal(
    <>
      <div className="tc-modal-backdrop" onClick={onClose} aria-hidden="true" />

      <div ref={modalRef} className="tc-modal" role="dialog" aria-modal="true" aria-labelledby="tc-modal-title">
        {/* Header */}
        <div className="tc-modal-header">
          <div className="tc-trade-title-group">
            <h2 id="tc-modal-title" className="tc-trade-title">
              {trade.symbol}
              <span className={`tc-side-badge ${trade.side === 'long' ? 'tc-badge--positive' : 'tc-badge--negative'}`}>
                {trade.side}
              </span>
            </h2>
            <span className="tc-trade-source">{trade.source}</span>
          </div>
          <span className={`tc-trade-pnl-hero ${pnlNet >= 0 ? 'tc-green' : 'tc-red'}`}>
            {pnlNet >= 0 ? '+' : ''}{fmtMoney(pnlNet)} $
          </span>
          <button type="button" className="tc-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Body */}
        <div className="tc-modal-body">
          <div className="tc-trade-stats-card">
            <p className="tc-trade-stats-title">Trade Details</p>
            <div className="tc-trade-stats-grid">
              <div className="tc-trade-stats-col">
                <StatRow
                  label="Direction"
                  value={trade.side.charAt(0).toUpperCase() + trade.side.slice(1)}
                  colorClass={trade.side === 'long' ? 'tc-green' : 'tc-red'}
                />
                <StatRow label="Opened"     value={fmtDateTime(trade.opened)} />
                <StatRow label="Closed"     value={fmtDateTime(trade.closed)} />
                <StatRow label="Duration"   value={duration} />
                <StatRow label="Close type" value={trade.closeType} colorClass={closeColors[trade.closeType]} />
                <StatRow label="Source"     value={trade.source} />
              </div>
              <div className="tc-trade-stats-col">
                <StatRow
                  label="PnL (net)"
                  value={`${pnlNet >= 0 ? '+' : ''}${fmtMoney(pnlNet)} $`}
                  colorClass={pnlNet >= 0 ? 'tc-green' : 'tc-red'}
                />
                <StatRow
                  label="PnL (gross)"
                  value={`${pnlGross >= 0 ? '+' : ''}${fmtMoney(pnlGross)} $`}
                  colorClass={pnlGross >= 0 ? 'tc-green' : 'tc-red'}
                />
                <StatRow label="Fee"  value={`-${fmtMoney(trade.fee)} $`} colorClass="tc-red" />
                <StatRow label="Size" value={`${fmtMoney(trade.sizeUsd)} $`} />
                {trade.entryPrice !== undefined && (
                  <StatRow label="Entry price" value={`${fmtMoney(trade.entryPrice, 4)} $`} />
                )}
                {trade.exitPrice !== undefined && (
                  <StatRow label="Exit price" value={`${fmtMoney(trade.exitPrice, 4)} $`} />
                )}
              </div>
            </div>
          </div>

          <div className="tc-trade-chart-card">
            <p className="tc-trade-stats-title">Market Chart — {trade.symbol}/USDT</p>
            <TradeChart trade={trade} />
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
};
