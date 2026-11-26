// ─── Intraday, public surface ─────────────────────────────────────────────────
// A barrel, not a pipeline. The pull itself lives in serverPull.ts and runs on
// the server: /intraday is server-rendered and its refresh button reads
// /api/intraday, so nothing fetches market data from the browser any more.
//
// What used to be here was the browser edition of the pull. It could only ever
// reach two of the five sources — Whale Alert, the 25-delta skew and Vol Lab are
// CORS-blocked, and the latter two need a token that cannot ship to a client —
// so "refresh" meant updating two panels and carrying three forward. The page
// now asks the server, which can see all five.

export * from './types';
export { clearHistory } from './history';
export { buildIntradayReport } from './report';
