import { lazy } from 'react';

// ─── Lazy-loaded chart panels (shared across dashboard tabs) ──────────────────
export const EquityCurveChart = lazy(() => import('./panels/equityCurveChart'));
export const PnlCalendar = lazy(() => import('./panels/pnlCalendar'));
export const PnlBySymbolChart = lazy(() => import('./panels/pnlBySymbolChart'));
export const PnlBySessionChart = lazy(() => import('./panels/pnlBySessionChart'));
export const WinRateBySessionChart = lazy(() => import('./panels/winRateBySessionChart'));
export const WinRateByHourChart = lazy(() => import('./panels/winRateByHourChart'));
export const PnlByWeekdayChart = lazy(() => import('./panels/pnlByWeekdayChart'));
export const WinRateByWeekdayChart = lazy(() => import('./panels/winRateByWeekdayChart'));
export const PnlByHourChart = lazy(() => import('./panels/pnlByHourChart'));
export const PnlByDurationChart = lazy(() => import('./panels/pnlByDurationChart'));
export const WinRateByDurationChart = lazy(() => import('./panels/winRateByDurationChart'));
export const TradeList = lazy(() => import('./panels/tradeList'));
