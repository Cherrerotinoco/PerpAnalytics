import { Trade, CloseType, Side } from '../types/tradeTypes';

/**
 * Hyperliquid `userFills` → Trade[].
 *
 * FOMO's perps execute on Hyperliquid, so a FOMO trader's positions are readable
 * from Hyperliquid's public `info` endpoint — no key, no cost. Fills arrive one
 * per price level, so they are paired into round trips the same way
 * `normalizePacifica` pairs Pacifica fills.
 */

/** One fill from `POST /info {"type":"userFillsByTime"}`. */
export type HyperliquidFill = {
  coin: string;
  px: string;
  sz: string;
  /** `B` = bought, `A` = sold. `dir` is the clearer signal; this is a tiebreak. */
  side: 'A' | 'B';
  time: number;
  startPosition: string;
  /** `Open Long`, `Close Short`, … — the authoritative direction + intent. */
  dir: string;
  closedPnl: string;
  hash: string;
  /** Order id. Every fill of one order shares it, which is what the app shows as a position. */
  oid: number;
  /** `true` when the fill removed liquidity (taker). */
  crossed: boolean;
  /** Total fee charged, in `feeToken`. Includes `builderFee`. */
  fee: string;
  feeToken: string;
  /**
   * The front-end's cut inside `fee`. Measured at exactly 5.000 bps of notional
   * on every FOMO fill sampled, against 4.320 bps for Hyperliquid itself — so
   * most of what a FOMO user pays in fees is the app's, not the venue's.
   */
  builderFee?: string;
  tid: number;
};

const num = (s: string | undefined | null): number => {
  const n = Number.parseFloat(s ?? '');
  return Number.isFinite(n) ? n : 0;
};

/** `Open Long` / `Close Short` → the side the position is held in. */
const sideOf = (dir: string): Side | null => {
  if (/long/i.test(dir)) {
    return 'long';
  }
  if (/short/i.test(dir)) {
    return 'short';
  }
  return null;
};

const isOpen = (dir: string): boolean => /^open/i.test(dir);
const isClose = (dir: string): boolean => /^close/i.test(dir);

/**
 * Hyperliquid marks forced exits in `dir`. Everything else is a normal exit —
 * the venue reports no take-profit / stop-loss distinction on a fill.
 */
const closeTypeOf = (dir: string): CloseType => (/liquidat/i.test(dir) ? 'Liquidation' : 'Manual');

interface OpenPosition {
  openedAt: number;
  /** Remaining contracts, always positive. */
  size: number;
  /** Notional still attributable to the remaining size, for the entry price. */
  notional: number;
  fee: number;
  builderFee: number;
  takerFee: number;
}

interface CloseGroup {
  coin: string;
  side: Side;
  openedAt: number;
  closedAt: number;
  dir: string;
  size: number;
  notional: number;
  closedPnl: number;
  fee: number;
  builderFee: number;
  takerFee: number;
  /** Cost basis of the closed portion, carried over from the open fills. */
  entryNotional: number;
  entryFee: number;
  entryBuilderFee: number;
  entryTakerFee: number;
}

export const normalizeHyperliquidFills = (fills: HyperliquidFill[]): Trade[] => {
  // Ascending by time; `tid` breaks ties so same-millisecond fills stay ordered.
  const sorted = [...fills].sort((a, b) => a.time - b.time || a.tid - b.tid);

  const positions = new Map<string, OpenPosition>();
  const groups = new Map<string, CloseGroup>();

  for (const fill of sorted) {
    const side = sideOf(fill.dir);
    if (!side) {
      // `Spot Dust Conversion` and similar non-perp rows carry no position.
      continue;
    }

    const size = Math.abs(num(fill.sz));
    const price = num(fill.px);
    const fee = num(fill.fee);
    const builderFee = num(fill.builderFee);
    const takerFee = fill.crossed ? fee : 0;
    const posKey = `${fill.coin}|${side}`;

    if (isOpen(fill.dir)) {
      const existing = positions.get(posKey);
      if (existing) {
        existing.size += size;
        existing.notional += size * price;
        existing.fee += fee;
        existing.builderFee += builderFee;
        existing.takerFee += takerFee;
      } else {
        positions.set(posKey, {
          openedAt: fill.time,
          size,
          notional: size * price,
          fee,
          builderFee,
          takerFee,
        });
      }
      continue;
    }

    if (!isClose(fill.dir)) {
      continue;
    }

    // Take this fill's share of the open side: its cost basis and the fee paid
    // getting in. Without this the round trip would report only the exit fee.
    const pos = positions.get(posKey);
    let entryNotional = 0;
    let entryFee = 0;
    let entryBuilderFee = 0;
    let entryTakerFee = 0;
    if (pos && pos.size > 1e-12) {
      const fraction = Math.min(1, size / pos.size);
      entryNotional = pos.notional * fraction;
      entryFee = pos.fee * fraction;
      entryBuilderFee = pos.builderFee * fraction;
      entryTakerFee = pos.takerFee * fraction;
      pos.notional -= entryNotional;
      pos.fee -= entryFee;
      pos.builderFee -= entryBuilderFee;
      pos.takerFee -= entryTakerFee;
      pos.size -= size;
      if (pos.size <= 1e-12) {
        positions.delete(posKey);
      }
    }

    // One order id is one user action, however many price levels it crossed.
    // The app shows that as a single position, so group on it.
    const key = String(fill.oid);
    const group = groups.get(key);
    if (group) {
      group.size += size;
      group.notional += size * price;
      group.closedPnl += num(fill.closedPnl);
      group.fee += fee;
      group.builderFee += builderFee;
      group.takerFee += takerFee;
      group.entryNotional += entryNotional;
      group.entryFee += entryFee;
      group.entryBuilderFee += entryBuilderFee;
      group.entryTakerFee += entryTakerFee;
      group.closedAt = Math.max(group.closedAt, fill.time);
    } else {
      groups.set(key, {
        coin: fill.coin,
        side,
        openedAt: pos?.openedAt ?? fill.time,
        closedAt: fill.time,
        dir: fill.dir,
        size,
        notional: size * price,
        closedPnl: num(fill.closedPnl),
        fee,
        builderFee,
        takerFee,
        entryNotional,
        entryFee,
        entryBuilderFee,
        entryTakerFee,
      });
    }
  }

  const trades: Trade[] = [];
  for (const g of groups.values()) {
    const totalFee = g.fee + g.entryFee;
    const totalTakerFee = g.takerFee + g.entryTakerFee;
    trades.push({
      symbol: g.coin,
      opened: new Date(g.openedAt),
      closed: new Date(g.closedAt),
      side: g.side,
      // Net of the whole round trip, matching how Pacifica trades are reported.
      // Hyperliquid's `closedPnl` is gross, so both fee legs come off here.
      pnl: g.closedPnl - totalFee,
      fee: totalFee,
      // Exit notional, as for Pacifica.
      sizeUsd: g.notional,
      closeType: closeTypeOf(g.dir),
      source: 'Hyperliquid',
      entryPrice: g.size > 0 && g.entryNotional > 0 ? g.entryNotional / g.size : undefined,
      exitPrice: g.size > 0 ? g.notional / g.size : undefined,
      takerFee: totalTakerFee,
      makerFee: Math.max(0, totalFee - totalTakerFee),
      builderFee: g.builderFee + g.entryBuilderFee,
    });
  }

  return trades.sort((a, b) => a.closed.getTime() - b.closed.getTime());
};
