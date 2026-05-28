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

  const positions = new Map<string, { openedAt: Date; netSize: number }>();
  const closeGroups = new Map<string, { fills: PacificaFill[]; openedAt: Date }>();

  for (const fill of sorted) {
    const direction = fill.side.endsWith('_long') ? 'long' : 'short';
    const posKey = `${fill.symbol}|${direction}`;
    const amount = parseFloat(fill.amount);

    if (fill.side.startsWith('open_')) {
      const existing = positions.get(posKey);
      if (!existing) {
        positions.set(posKey, { openedAt: new Date(fill.created_at), netSize: amount });
      } else {
        existing.netSize += amount;
      }
    } else if (fill.side.startsWith('close_')) {
      const pos = positions.get(posKey);
      const openedAt = pos?.openedAt ?? new Date(fill.created_at);

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
    const totalPnl = closeFills.reduce((s, f) => s + parseFloat(f.pnl), 0);
    const totalFee = closeFills.reduce((s, f) => s + parseFloat(f.fee), 0);
    const totalSize = closeFills.reduce(
      (s, f) => s + parseFloat(f.amount) * parseFloat(f.entry_price),
      0
    );

    const cause = (first.cause ?? 'normal').toLowerCase();
    const closeType: CloseType = cause.includes('liquidation') ? 'Liquidation' : 'Manual';

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
    });
  }

  return trades;
};
