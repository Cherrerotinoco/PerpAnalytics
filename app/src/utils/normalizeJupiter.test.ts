import { describe, it, expect } from 'vitest';
import { normalizeJupiterTrades, JupiterTrade } from './normalizeJupiter';

// ─── Factory ──────────────────────────────────────────────────────────────────
const BASE: JupiterTrade = {
  mint: 'mint',
  positionName: 'SOL-PERP',
  side: 'long',
  action: 'Increase',
  orderType: 'Market',
  collateralUsdDelta: '0',
  price: '100',
  size: '1000',
  baseFee: '0',
  borrowFee: '0',
  liquidationFee: '0',
  priceImpactFee: '0',
  fee: '0.50',
  integratorFeeTokenMint: null,
  integratorFeeTokenAmount: null,
  pnl: null,
  pnlPercentage: null,
  txHash: 'tx1',
  createdTime: 1_000_000,
  updatedTime: 1_000_000,
  positionPubkey: 'pos1',
  owner: 'owner1',
  transactionFeeLamports: null,
  priorityFeeLamports: null,
  swapFeeBps: null,
  swapFeeUsd: null,
  swapFeeTokenAmount: null,
  swapFeeTokenMint: null,
};

const event = (overrides: Partial<JupiterTrade>): JupiterTrade => ({
  ...BASE,
  ...overrides,
});

const open = (overrides: Partial<JupiterTrade> = {}): JupiterTrade =>
  event({ action: 'Increase', pnl: null, ...overrides });

const close = (overrides: Partial<JupiterTrade> = {}): JupiterTrade =>
  event({ action: 'Decrease', pnl: '5.00', fee: '0.50', createdTime: 1_001_000, ...overrides });

// ─── Tests ────────────────────────────────────────────────────────────────────
describe('buildJupiterTrades', () => {
  it('returns empty array for empty input', () => {
    expect(normalizeJupiterTrades([])).toEqual([]);
  });

  it('ignores decrease events with null pnl', () => {
    const trades = normalizeJupiterTrades([open(), close({ pnl: null })]);
    expect(trades).toHaveLength(0);
  });

  it('computes net PnL as pnl - fee for a winning trade', () => {
    const trades = normalizeJupiterTrades([open(), close({ pnl: '5.00', fee: '0.50' })]);
    expect(trades).toHaveLength(1);
    expect(trades[0].pnl).toBeCloseTo(4.5);
  });

  it('computes net PnL as pnl - fee for a losing trade', () => {
    const trades = normalizeJupiterTrades([open(), close({ pnl: '-2.00', fee: '0.34' })]);
    expect(trades).toHaveLength(1);
    expect(trades[0].pnl).toBeCloseTo(-2.34);
  });

  it('strips -PERP suffix from symbol', () => {
    const trades = normalizeJupiterTrades([open({ positionName: 'SOL-PERP' }), close()]);
    expect(trades[0].symbol).toBe('SOL');
  });

  it('preserves symbol when no -PERP suffix', () => {
    const trades = normalizeJupiterTrades([
      open({ positionName: 'BTC' }),
      close({ positionName: 'BTC' }),
    ]);
    expect(trades[0].symbol).toBe('BTC');
  });

  it('sets closeType to Manual for market close', () => {
    const trades = normalizeJupiterTrades([open(), close({ orderType: 'Market' })]);
    expect(trades[0].closeType).toBe('Manual');
  });

  it('sets closeType to TP for trigger close with positive pnl', () => {
    const trades = normalizeJupiterTrades([open(), close({ orderType: 'Trigger', pnl: '3.00' })]);
    expect(trades[0].closeType).toBe('TP');
  });

  it('sets closeType to SL for trigger close with negative pnl', () => {
    const trades = normalizeJupiterTrades([open(), close({ orderType: 'Trigger', pnl: '-1.00' })]);
    expect(trades[0].closeType).toBe('SL');
  });

  it('sets closeType to Liquidation for liquidation event', () => {
    const trades = normalizeJupiterTrades([open(), close({ action: 'Liquidation', pnl: '-500' })]);
    expect(trades[0].closeType).toBe('Liquidation');
  });

  it('sets correct side for long trade', () => {
    const trades = normalizeJupiterTrades([open({ side: 'long' }), close({ side: 'long' })]);
    expect(trades[0].side).toBe('long');
  });

  it('sets correct side for short trade', () => {
    const trades = normalizeJupiterTrades([open({ side: 'short' }), close({ side: 'short' })]);
    expect(trades[0].side).toBe('short');
  });

  it('sets source to Jupiter', () => {
    const trades = normalizeJupiterTrades([open(), close()]);
    expect(trades[0].source).toBe('Jupiter');
  });

  it('stores opened/closed timestamps correctly', () => {
    const openTime = 1_000_000;
    const closeTime = 1_001_000;
    const trades = normalizeJupiterTrades([
      open({ createdTime: openTime }),
      close({ createdTime: closeTime }),
    ]);
    expect(trades[0].opened).toEqual(new Date(openTime * 1000));
    expect(trades[0].closed).toEqual(new Date(closeTime * 1000));
  });

  it('produces two trades from two separate partial closes', () => {
    const trades = normalizeJupiterTrades([
      open({ size: '1000', createdTime: 1_000_000 }),
      close({ size: '500', pnl: '2.00', fee: '0.20', createdTime: 1_001_000 }),
      close({ size: '500', pnl: '3.00', fee: '0.30', createdTime: 1_002_000, txHash: 'tx2' }),
    ]);
    expect(trades).toHaveLength(2);
    expect(trades[0].pnl).toBeCloseTo(1.8);
    expect(trades[1].pnl).toBeCloseTo(2.7);
  });

  it('groups events by positionPubkey, producing one trade per position', () => {
    const trades = normalizeJupiterTrades([
      open({ positionPubkey: 'pos1', positionName: 'SOL-PERP' }),
      close({ positionPubkey: 'pos1', positionName: 'SOL-PERP' }),
      open({ positionPubkey: 'pos2', positionName: 'BTC-PERP', createdTime: 1_000_500 }),
      close({
        positionPubkey: 'pos2',
        positionName: 'BTC-PERP',
        createdTime: 1_001_500,
        txHash: 'tx2',
      }),
    ]);
    expect(trades).toHaveLength(2);
    expect(trades.map((t) => t.symbol).sort()).toEqual(['BTC', 'SOL']);
  });

  it('sorts events by createdTime before processing', () => {
    // Deliver events out of order — open arrives after close in the array
    const trades = normalizeJupiterTrades([
      close({ createdTime: 1_001_000 }),
      open({ createdTime: 1_000_000 }),
    ]);
    expect(trades).toHaveLength(1);
    expect(trades[0].opened).toEqual(new Date(1_000_000 * 1000));
    expect(trades[0].closed).toEqual(new Date(1_001_000 * 1000));
  });
});
