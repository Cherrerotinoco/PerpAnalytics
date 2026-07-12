import { describe, it, expect } from 'vitest';
import { normalizePacificaTrades, PacificaFill } from './normalizePacifica';

// ─── Factory ──────────────────────────────────────────────────────────────────
const BASE: PacificaFill = {
  history_id: 1,
  order_id: 100,
  client_order_id: null,
  symbol: 'SOL',
  amount: '10',
  price: '150',
  entry_price: '150',
  fee: '0.50',
  spot_fee: null,
  pnl: '0',
  event_type: 'fulfill_taker',
  side: 'open_long',
  created_at: 1_000_000,
  cause: 'normal',
};

const fill = (overrides: Partial<PacificaFill>): PacificaFill => ({ ...BASE, ...overrides });

const openLong = (overrides: Partial<PacificaFill> = {}): PacificaFill =>
  fill({ side: 'open_long', pnl: '0', created_at: 1_000_000, ...overrides });

const openShort = (overrides: Partial<PacificaFill> = {}): PacificaFill =>
  fill({ side: 'open_short', pnl: '0', created_at: 1_000_000, ...overrides });

const closeLong = (overrides: Partial<PacificaFill> = {}): PacificaFill =>
  fill({ side: 'close_long', pnl: '5.00', fee: '0.50', created_at: 2_000_000, ...overrides });

const closeShort = (overrides: Partial<PacificaFill> = {}): PacificaFill =>
  fill({ side: 'close_short', pnl: '5.00', fee: '0.50', created_at: 2_000_000, ...overrides });

// ─── Tests ────────────────────────────────────────────────────────────────────
describe('normalizePacificaTrades', () => {
  it('returns empty array for empty input', () => {
    expect(normalizePacificaTrades([])).toEqual([]);
  });

  it('returns empty array when there are only open fills', () => {
    expect(normalizePacificaTrades([openLong()])).toHaveLength(0);
  });

  it('produces one trade from a simple open + close_long', () => {
    const trades = normalizePacificaTrades([openLong(), closeLong()]);
    expect(trades).toHaveLength(1);
  });

  it('sets side to long for close_long', () => {
    const trades = normalizePacificaTrades([openLong(), closeLong()]);
    expect(trades[0].side).toBe('long');
  });

  it('sets side to short for close_short', () => {
    const trades = normalizePacificaTrades([openShort(), closeShort()]);
    expect(trades[0].side).toBe('short');
  });

  it('uses pnl as-is for a winning trade', () => {
    const trades = normalizePacificaTrades([openLong(), closeLong({ pnl: '8.00' })]);
    expect(trades[0].pnl).toBeCloseTo(8.0);
  });

  it('uses pnl as-is for a losing trade', () => {
    const trades = normalizePacificaTrades([openLong(), closeLong({ pnl: '-3.50' })]);
    expect(trades[0].pnl).toBeCloseTo(-3.5);
  });

  it('sums open and close fees into the round-trip fee', () => {
    // openLong fee 0.50 (from BASE) + close fee 0.75 = 1.25
    const trades = normalizePacificaTrades([openLong({ fee: '0.50' }), closeLong({ fee: '0.75' })]);
    expect(trades[0].fee).toBeCloseTo(1.25);
  });

  it('subtracts the open fee from the net pnl', () => {
    // Pacifica books the open fee as a negative pnl on the open fill; the
    // close fill pnl (5.00) is already net of the close fee only.
    const trades = normalizePacificaTrades([
      openLong({ fee: '0.50', pnl: '-0.50' }),
      closeLong({ pnl: '5.00' }),
    ]);
    expect(trades[0].pnl).toBeCloseTo(4.5); // 5.00 + (-0.50)
  });

  it('aggregates fees across multiple open fills of one position', () => {
    const trades = normalizePacificaTrades([
      openLong({ amount: '6', fee: '0.30', pnl: '-0.30', created_at: 1_000_000 }),
      openLong({ amount: '4', fee: '0.20', pnl: '-0.20', created_at: 1_000_100 }),
      closeLong({ amount: '10', fee: '0.50', pnl: '5.00', created_at: 2_000_000 }),
    ]);
    expect(trades).toHaveLength(1);
    expect(trades[0].fee).toBeCloseTo(1.0); // 0.30 + 0.20 + 0.50
    expect(trades[0].pnl).toBeCloseTo(4.5); // 5.00 - 0.30 - 0.20
  });

  // Classification is by effective fee rate (fee / notional), not event_type.
  // Factory notional = amount(10) * price(150) = 1500.
  //   taker ~0.04% → 1500 * 0.0004 = 0.60
  //   maker ~0.01% → 1500 * 0.0001 = 0.15
  const TAKER_FEE = '0.60';
  const MAKER_FEE = '0.15';

  it('classifies a fully-taker round-trip fee as taker', () => {
    const trades = normalizePacificaTrades([
      openLong({ fee: TAKER_FEE, pnl: '-0.60' }),
      closeLong({ fee: TAKER_FEE, pnl: '5.00' }),
    ]);
    expect(trades[0].takerFee).toBeCloseTo(1.2);
    expect(trades[0].makerFee).toBeCloseTo(0);
  });

  it('classifies a fully-maker round-trip fee as maker', () => {
    const trades = normalizePacificaTrades([
      openLong({ fee: MAKER_FEE, pnl: '-0.15' }),
      closeLong({ fee: MAKER_FEE, pnl: '5.00' }),
    ]);
    expect(trades[0].makerFee).toBeCloseTo(0.3);
    expect(trades[0].takerFee).toBeCloseTo(0);
  });

  it('splits maker open and taker close into the right buckets', () => {
    const trades = normalizePacificaTrades([
      openLong({ fee: MAKER_FEE, pnl: '-0.15' }),
      closeLong({ fee: TAKER_FEE, pnl: '5.00' }),
    ]);
    expect(trades[0].takerFee).toBeCloseTo(0.6);
    expect(trades[0].makerFee).toBeCloseTo(0.15);
    expect(trades[0].fee).toBeCloseTo(0.75);
  });

  it('classifies by fee rate, not the (unreliable) event_type', () => {
    // Pacifica stamps maker fills as "fulfill_taker"; a maker-rate fee must
    // still be counted as maker.
    const trades = normalizePacificaTrades([
      openLong({ fee: MAKER_FEE, pnl: '-0.15', event_type: 'fulfill_taker' }),
      closeLong({ fee: MAKER_FEE, pnl: '5.00', event_type: 'fulfill_taker' }),
    ]);
    expect(trades[0].makerFee).toBeCloseTo(0.3);
    expect(trades[0].takerFee).toBeCloseTo(0);
  });

  it('splits open fees proportionally across partial closes', () => {
    const trades = normalizePacificaTrades([
      openLong({ amount: '10', fee: '1.00', pnl: '-1.00', created_at: 1_000_000 }),
      closeLong({ history_id: 1, amount: '5', fee: '0.25', pnl: '2.00', created_at: 2_000_000 }),
      closeLong({ history_id: 2, amount: '5', fee: '0.25', pnl: '3.00', created_at: 3_000_000 }),
    ]);
    expect(trades).toHaveLength(2);
    // Each partial close gets half of the 1.00 open fee.
    expect(trades[0].fee).toBeCloseTo(0.75); // 0.25 close + 0.50 open share
    expect(trades[1].fee).toBeCloseTo(0.75);
    expect(trades[0].pnl).toBeCloseTo(1.5); // 2.00 - 0.50
    expect(trades[1].pnl).toBeCloseTo(2.5); // 3.00 - 0.50
  });

  it('sets closeType to Manual for cause normal', () => {
    const trades = normalizePacificaTrades([openLong(), closeLong({ cause: 'normal' })]);
    expect(trades[0].closeType).toBe('Manual');
  });

  it('sets closeType to Manual for null cause', () => {
    const trades = normalizePacificaTrades([openLong(), closeLong({ cause: null })]);
    expect(trades[0].closeType).toBe('Manual');
  });

  it('sets closeType to Liquidation for liquidation cause', () => {
    const trades = normalizePacificaTrades([openLong(), closeLong({ cause: 'liquidation' })]);
    expect(trades[0].closeType).toBe('Liquidation');
  });

  it('sets closeType to Liquidation case-insensitively', () => {
    const trades = normalizePacificaTrades([openLong(), closeLong({ cause: 'LIQUIDATION' })]);
    expect(trades[0].closeType).toBe('Liquidation');
  });

  it('sets source to Pacifica', () => {
    const trades = normalizePacificaTrades([openLong(), closeLong()]);
    expect(trades[0].source).toBe('Pacifica');
  });

  it('preserves symbol as-is', () => {
    const trades = normalizePacificaTrades([
      openLong({ symbol: 'BTC' }),
      closeLong({ symbol: 'BTC' }),
    ]);
    expect(trades[0].symbol).toBe('BTC');
  });

  it('sets opened from the open fill timestamp and closed from the close fill timestamp', () => {
    const openTime = 1_000_000;
    const closeTime = 2_000_000;
    const trades = normalizePacificaTrades([
      openLong({ created_at: openTime }),
      closeLong({ created_at: closeTime }),
    ]);
    expect(trades[0].opened).toEqual(new Date(openTime));
    expect(trades[0].closed).toEqual(new Date(closeTime));
  });

  it('uses close timestamp as opened when there is no prior open fill', () => {
    const closeTime = 2_000_000;
    const trades = normalizePacificaTrades([closeLong({ created_at: closeTime })]);
    expect(trades[0].opened).toEqual(new Date(closeTime));
    expect(trades[0].closed).toEqual(new Date(closeTime));
  });

  it('computes sizeUsd as amount * close price (exit notional)', () => {
    const trades = normalizePacificaTrades([
      openLong(),
      // price (exit) 160 ≠ entry_price 150 → size must use the exit price
      closeLong({ amount: '10', price: '160', entry_price: '150' }), // 10 * 160 = 1600
    ]);
    expect(trades[0].sizeUsd).toBeCloseTo(1600);
  });

  it('aggregates multiple fills at the same timestamp into one trade', () => {
    const closeTime = 2_000_000;
    const trades = normalizePacificaTrades([
      openLong({ amount: '10' }),
      closeLong({
        history_id: 1,
        created_at: closeTime,
        amount: '6',
        pnl: '3.00',
        fee: '0.30',
        entry_price: '150',
      }),
      closeLong({
        history_id: 2,
        created_at: closeTime,
        amount: '4',
        pnl: '2.00',
        fee: '0.20',
        entry_price: '150',
      }),
    ]);
    expect(trades).toHaveLength(1);
    expect(trades[0].pnl).toBeCloseTo(5.0); // 3.00 + 2.00 (open pnl is 0 here)
    expect(trades[0].fee).toBeCloseTo(1.0); // 0.30 + 0.20 close + 0.50 open (BASE)
    expect(trades[0].sizeUsd).toBeCloseTo(1500); // (6 + 4) * 150
  });

  it('produces two trades from two partial closes at different timestamps', () => {
    const trades = normalizePacificaTrades([
      openLong({ amount: '10', created_at: 1_000_000 }),
      closeLong({ history_id: 1, amount: '5', pnl: '2.00', fee: '0.20', created_at: 2_000_000 }),
      closeLong({ history_id: 2, amount: '5', pnl: '3.00', fee: '0.30', created_at: 3_000_000 }),
    ]);
    expect(trades).toHaveLength(2);
    expect(trades[0].pnl).toBeCloseTo(2.0);
    expect(trades[1].pnl).toBeCloseTo(3.0);
  });

  it('uses the original open timestamp for both partial closes', () => {
    const openTime = 1_000_000;
    const trades = normalizePacificaTrades([
      openLong({ amount: '10', created_at: openTime }),
      closeLong({ history_id: 1, amount: '5', created_at: 2_000_000 }),
      closeLong({ history_id: 2, amount: '5', created_at: 3_000_000 }),
    ]);
    expect(trades[0].opened).toEqual(new Date(openTime));
    expect(trades[1].opened).toEqual(new Date(openTime));
  });

  it('groups fills by symbol and direction, producing one trade per position', () => {
    const trades = normalizePacificaTrades([
      openLong({ symbol: 'SOL', created_at: 1_000_000 }),
      openShort({ symbol: 'BTC', created_at: 1_000_100 }),
      closeLong({ symbol: 'SOL', created_at: 2_000_000 }),
      closeShort({ symbol: 'BTC', created_at: 2_000_100, history_id: 2 }),
    ]);
    expect(trades).toHaveLength(2);
    expect(trades.map((t) => t.symbol).sort()).toEqual(['BTC', 'SOL']);
  });

  it('sorts fills by created_at before processing', () => {
    // Deliver close before open in the array
    const trades = normalizePacificaTrades([
      closeLong({ created_at: 2_000_000 }),
      openLong({ created_at: 1_000_000 }),
    ]);
    expect(trades).toHaveLength(1);
    expect(trades[0].opened).toEqual(new Date(1_000_000));
    expect(trades[0].closed).toEqual(new Date(2_000_000));
  });
});
