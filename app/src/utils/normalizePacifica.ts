import { Trade, CloseType, Side } from '../types/tradeTypes';

// Tipos de la API Pacifica
export type PacificaFill = {
  history_id: number;
  order_id: number;
  client_order_id: number | null;
  symbol: string;
  amount: string;
  price: string;
  entry_price: string;
  fee: string;
  spot_fee: string | null;
  pnl: string;
  event_type: string;
  side: 'open_long' | 'open_short' | 'close_long' | 'close_short';
  created_at: number;
  cause: string | null;
};

export const normalizePacificaTrades = (fills: PacificaFill[]): Trade[] => {
  const sorted = [...fills].sort((a, b) => a.created_at - b.created_at);

  const positions = new Map<
    string,
    { openedAt: Date; netSize: number; openFee: number; openPnl: number }
  >();
  const closeGroups = new Map<string, { fills: PacificaFill[]; openedAt: Date }>();
  // Open-side fee/pnl attributed to each close fill. Pacifica books the open
  // fee on a separate open fill (the close fill's pnl only nets the *close*
  // fee), so without this the round-trip would omit the open fee entirely.
  const openCosts = new Map<PacificaFill, { fee: number; pnl: number }>();

  for (const fill of sorted) {
    const direction = fill.side.endsWith('_long') ? 'long' : 'short';
    const posKey = `${fill.symbol}|${direction}`;
    const amount = parseFloat(fill.amount);
    const fee = Math.abs(parseFloat(fill.fee));
    const pnl = parseFloat(fill.pnl) || 0;

    if (fill.side.startsWith('open_')) {
      const existing = positions.get(posKey);
      if (!existing) {
        positions.set(posKey, {
          openedAt: new Date(fill.created_at),
          netSize: amount,
          openFee: fee,
          openPnl: pnl,
        });
      } else {
        existing.netSize += amount;
        existing.openFee += fee;
        existing.openPnl += pnl;
      }
    } else if (fill.side.startsWith('close_')) {
      const pos = positions.get(posKey);
      const openedAt = pos?.openedAt ?? new Date(fill.created_at);

      // Attribute a proportional share of the still-unattributed open-side
      // fee/pnl based on the fraction of the open position this fill closes.
      let openFee = 0;
      let openPnl = 0;
      if (pos && pos.netSize > 1e-8) {
        const fraction = Math.min(1, amount / pos.netSize);
        openFee = pos.openFee * fraction;
        openPnl = pos.openPnl * fraction;
        pos.openFee -= openFee;
        pos.openPnl -= openPnl;
      }
      openCosts.set(fill, { fee: openFee, pnl: openPnl });

      const groupKey = `${posKey}|${fill.created_at}`;
      if (!closeGroups.has(groupKey)) {
        closeGroups.set(groupKey, { fills: [], openedAt });
      }
      closeGroups.get(groupKey)!.fills.push(fill);

      if (pos) {
        pos.netSize = Math.max(0, pos.netSize - amount);
        if (pos.netSize < 1e-8) {
          positions.delete(posKey);
        }
      }
    }
  }

  const trades: Trade[] = [];

  for (const group of closeGroups.values()) {
    const { fills: closeFills, openedAt: opened } = group;
    const first = closeFills[0];
    const direction: Side = first.side.endsWith('_long') ? 'long' : 'short';
    const closed = new Date(first.created_at);
    const openCostTotal = closeFills.reduce(
      (s, f) => {
        const c = openCosts.get(f);
        return { fee: s.fee + (c?.fee ?? 0), pnl: s.pnl + (c?.pnl ?? 0) };
      },
      { fee: 0, pnl: 0 }
    );
    // Net PnL = close-fill pnl (already net of close fee) + open-fill pnl
    // (which carries the open fee as a negative).
    const totalPnl = closeFills.reduce((s, f) => s + parseFloat(f.pnl), 0) + openCostTotal.pnl;
    // Full round-trip fee = close fees + open fees. Math.abs so that rebates
    // (negative fee values) don't produce a negative cost displayed as income.
    const totalFee =
      closeFills.reduce((s, f) => s + Math.abs(parseFloat(f.fee)), 0) + openCostTotal.fee;
    const totalSize = closeFills.reduce(
      (s, f) => s + parseFloat(f.amount) * parseFloat(f.entry_price),
      0
    );

    const cause = (first.cause ?? 'normal').toLowerCase();
    const closeType: CloseType = cause.includes('liquidation') ? 'Liquidation' : 'Manual';

    // Weighted-average entry price from the open fills we aggregated earlier,
    // and the close price from the first close fill.
    const entryPrice = parseFloat(first.entry_price) || undefined;
    const exitPrice = parseFloat(first.price) || undefined;

    trades.push({
      symbol: first.symbol,
      opened,
      closed,
      side: direction,
      pnl: totalPnl,
      fee: totalFee,
      sizeUsd: totalSize,
      closeType,
      source: 'Pacifica',
      entryPrice,
      exitPrice,
    });
  }

  return trades;
};
