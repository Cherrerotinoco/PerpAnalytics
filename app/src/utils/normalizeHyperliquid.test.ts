import { describe, it, expect } from 'vitest';
import { normalizeHyperliquidFills, HyperliquidFill } from './normalizeHyperliquid';

/**
 * Fixtures are verbatim fills from a real FOMO account's Hyperliquid address.
 * The expected PnL figures were cross-checked against what the FOMO app itself
 * displayed for the same positions.
 */

let tid = 0;
const fill = (
  f: Partial<HyperliquidFill> & Pick<HyperliquidFill, 'coin' | 'dir' | 'px' | 'sz' | 'time' | 'oid'>
): HyperliquidFill => ({
  side: /long/i.test(f.dir) === /^open/i.test(f.dir) ? 'B' : 'A',
  startPosition: '0.0',
  closedPnl: '0.0',
  hash: '0x',
  crossed: true,
  fee: '0',
  feeToken: 'USDC',
  tid: tid++,
  ...f,
});

describe('normalizeHyperliquidFills', () => {
  it('pairs a simple open/close round trip and nets both fee legs', () => {
    const trades = normalizeHyperliquidFills([
      fill({
        coin: 'GRASS',
        dir: 'Open Long',
        px: '0.40404',
        sz: '250.1',
        time: 1794733629617,
        oid: 1,
        fee: '0.094178',
        builderFee: '0.050525',
      }),
      fill({
        coin: 'GRASS',
        dir: 'Close Long',
        px: '0.39489',
        sz: '250.1',
        time: 1795029788727,
        oid: 2,
        closedPnl: '-2.288415',
        fee: '0.092045',
        builderFee: '0.04938',
      }),
    ]);

    expect(trades).toHaveLength(1);
    const t = trades[0];
    expect(t.symbol).toBe('GRASS');
    expect(t.side).toBe('long');
    expect(t.source).toBe('Hyperliquid');
    // Round-trip fee is both legs, not just the exit.
    expect(t.fee).toBeCloseTo(0.186223, 6);
    // Gross -2.288415 less 0.186223 of fees.
    expect(t.pnl).toBeCloseTo(-2.474638, 6);
    expect(t.builderFee).toBeCloseTo(0.099905, 6);
    expect(t.opened.getTime()).toBe(1794733629617);
    expect(t.closed.getTime()).toBe(1795029788727);
  });

  it('collapses the five fills of one close order into a single trade', () => {
    // The FOMO app shows this VVV exit as one position; Hyperliquid reports it
    // as five fills across price levels, all sharing one order id.
    const opens: HyperliquidFill[] = [
      fill({
        coin: 'VVV',
        dir: 'Open Long',
        px: '19.852',
        sz: '7.75',
        time: 1794733309940,
        oid: 605941134802,
        fee: '0.14339',
        builderFee: '0.076926',
      }),
      fill({
        coin: 'VVV',
        dir: 'Open Long',
        px: '19.858',
        sz: '10.75',
        time: 1794733309940,
        oid: 605941134802,
        fee: '0.198956',
        builderFee: '0.106736',
      }),
    ];
    const closes: HyperliquidFill[] = [
      fill({
        coin: 'VVV',
        dir: 'Close Long',
        px: '20.911',
        sz: '4.16',
        time: 1795030427226,
        oid: 609523279408,
        closedPnl: '4.391296',
        fee: '0.0811',
      }),
      fill({
        coin: 'VVV',
        dir: 'Close Long',
        px: '20.911',
        sz: '0.68',
        time: 1795030427226,
        oid: 609523279408,
        closedPnl: '0.717808',
        fee: '0.0133',
      }),
      fill({
        coin: 'VVV',
        dir: 'Close Long',
        px: '20.907',
        sz: '6.46',
        time: 1795030427226,
        oid: 609523279408,
        closedPnl: '6.793336',
        fee: '0.1259',
      }),
      fill({
        coin: 'VVV',
        dir: 'Close Long',
        px: '20.904',
        sz: '7.18',
        time: 1795030427226,
        oid: 609523279408,
        closedPnl: '7.528948',
        fee: '0.1399',
      }),
      fill({
        coin: 'VVV',
        dir: 'Close Long',
        px: '20.897',
        sz: '0.02',
        time: 1795030427226,
        oid: 609523279408,
        closedPnl: '0.020832',
        fee: '0.0004',
      }),
    ];

    const trades = normalizeHyperliquidFills([...opens, ...closes]);
    expect(trades).toHaveLength(1);
    const t = trades[0];
    // Gross across the five fills, as the app's +$18.94 is derived from.
    expect(t.closed.getTime()).toBe(1795030427226);
    expect(t.sizeUsd).toBeCloseTo(386.77712, 5);
    expect(t.pnl + t.fee).toBeCloseTo(19.45222, 4);
    // Both prices are size-weighted averages across the fills of each order.
    expect(t.entryPrice).toBeCloseTo(19.85549, 4);
    expect(t.exitPrice).toBeCloseTo(20.906871, 5);
  });

  it('keeps long and short positions in the same coin apart', () => {
    const trades = normalizeHyperliquidFills([
      fill({
        coin: 'BTC',
        dir: 'Open Long',
        px: '63502.0',
        sz: '0.00774',
        time: 1795013561091,
        oid: 10,
        fee: '0.4582',
      }),
      fill({
        coin: 'BTC',
        dir: 'Close Long',
        px: '63518.0',
        sz: '0.00774',
        time: 1795014635893,
        oid: 11,
        closedPnl: '0.109134',
        fee: '0.458197',
      }),
      fill({
        coin: 'BTC',
        dir: 'Open Short',
        px: '63574.0',
        sz: '0.00375',
        time: 1795014822319,
        oid: 12,
        fee: '0.2222',
      }),
      fill({
        coin: 'BTC',
        dir: 'Close Short',
        px: '63040.0',
        sz: '0.00375',
        time: 1795018187462,
        oid: 13,
        closedPnl: '2.00025',
        fee: '0.220324',
      }),
    ]);

    expect(trades).toHaveLength(2);
    expect(trades.map((t) => t.side)).toEqual(['long', 'short']);
    // Gross PnL per leg matches what the app displayed: +$0.11 and +$2.00.
    expect(trades[0].pnl + trades[0].fee).toBeCloseTo(0.109134, 6);
    expect(trades[1].pnl + trades[1].fee).toBeCloseTo(2.00025, 6);
  });

  it('splits fees by liquidity role from the crossed flag', () => {
    const trades = normalizeHyperliquidFills([
      fill({
        coin: 'HYPE',
        dir: 'Open Long',
        px: '66.0',
        sz: '2.72',
        time: 1,
        oid: 1,
        fee: '0.17',
        crossed: false,
      }),
      fill({
        coin: 'HYPE',
        dir: 'Close Long',
        px: '68.139',
        sz: '2.72',
        time: 2,
        oid: 2,
        closedPnl: '3.8434',
        fee: '0.1727',
        crossed: true,
      }),
    ]);
    const t = trades[0];
    expect(t.takerFee).toBeCloseTo(0.1727, 4);
    expect(t.makerFee).toBeCloseTo(0.17, 4);
    expect(t.takerFee! + t.makerFee!).toBeCloseTo(t.fee, 6);
  });

  it('attributes the open fee proportionally on a partial close', () => {
    const trades = normalizeHyperliquidFills([
      fill({
        coin: 'SOL',
        dir: 'Open Short',
        px: '100',
        sz: '10',
        time: 1,
        oid: 1,
        fee: '1.0',
        builderFee: '0.5',
      }),
      fill({
        coin: 'SOL',
        dir: 'Close Short',
        px: '90',
        sz: '4',
        time: 2,
        oid: 2,
        closedPnl: '40',
        fee: '0.4',
      }),
      fill({
        coin: 'SOL',
        dir: 'Close Short',
        px: '80',
        sz: '6',
        time: 3,
        oid: 3,
        closedPnl: '120',
        fee: '0.6',
      }),
    ]);

    expect(trades).toHaveLength(2);
    // 40% of the 1.0 entry fee rides with the first close, 60% with the second.
    expect(trades[0].fee).toBeCloseTo(0.4 + 0.4, 6);
    expect(trades[1].fee).toBeCloseTo(0.6 + 0.6, 6);
    expect(trades[0].builderFee).toBeCloseTo(0.2, 6);
    expect(trades[1].builderFee).toBeCloseTo(0.3, 6);
  });

  it('handles an equity perp market id', () => {
    const trades = normalizeHyperliquidFills([
      fill({
        coin: 'xyz:ANT',
        dir: 'Open Long',
        px: '96.325',
        sz: '3.0',
        time: 1,
        oid: 1,
        fee: '0.07',
      }),
      fill({
        coin: 'xyz:ANT',
        dir: 'Close Long',
        px: '99.51',
        sz: '3.0',
        time: 2,
        oid: 2,
        closedPnl: '7.3569',
        fee: '0.1751',
      }),
    ]);
    expect(trades[0].symbol).toBe('xyz:ANT');
    expect(trades[0].pnl + trades[0].fee).toBeCloseTo(7.3569, 4);
  });

  it('flags a liquidation from the fill direction', () => {
    const trades = normalizeHyperliquidFills([
      fill({ coin: 'BTC', dir: 'Open Long', px: '100', sz: '1', time: 1, oid: 1 }),
      fill({
        coin: 'BTC',
        dir: 'Close Long Liquidated',
        px: '50',
        sz: '1',
        time: 2,
        oid: 2,
        closedPnl: '-50',
      }),
    ]);
    expect(trades[0].closeType).toBe('Liquidation');
  });

  it('ignores non-perp rows and an unmatched close without throwing', () => {
    const trades = normalizeHyperliquidFills([
      fill({
        coin: '@272',
        dir: 'Spot Dust Conversion',
        px: '1338.4',
        sz: '0.000000002',
        time: 1,
        oid: 1,
      }),
      // A close with no preceding open — history that starts mid-position.
      fill({
        coin: 'ZEC',
        dir: 'Close Short',
        px: '900',
        sz: '0.15',
        time: 2,
        oid: 2,
        closedPnl: '6.27',
        fee: '0.1',
      }),
    ]);
    expect(trades).toHaveLength(1);
    expect(trades[0].symbol).toBe('ZEC');
    expect(trades[0].fee).toBeCloseTo(0.1, 6);
    expect(trades[0].entryPrice).toBeUndefined();
  });

  it('leaves still-open positions out of the result', () => {
    const trades = normalizeHyperliquidFills([
      fill({
        coin: 'BTC',
        dir: 'Open Short',
        px: '63610.0',
        sz: '0.00479',
        time: 1,
        oid: 1,
        fee: '0.3',
      }),
    ]);
    expect(trades).toEqual([]);
  });

  it('returns trades ordered by close time', () => {
    const trades = normalizeHyperliquidFills([
      fill({ coin: 'A', dir: 'Open Long', px: '1', sz: '1', time: 10, oid: 1 }),
      fill({ coin: 'A', dir: 'Close Long', px: '2', sz: '1', time: 300, oid: 2, closedPnl: '1' }),
      fill({ coin: 'B', dir: 'Open Long', px: '1', sz: '1', time: 20, oid: 3 }),
      fill({ coin: 'B', dir: 'Close Long', px: '2', sz: '1', time: 100, oid: 4, closedPnl: '1' }),
    ]);
    expect(trades.map((t) => t.symbol)).toEqual(['B', 'A']);
  });

  it('handles an empty fill list', () => {
    expect(normalizeHyperliquidFills([])).toEqual([]);
  });
});
