import { Trade, CloseType, Side } from '../types/tradeTypes';

// Tipos de la API Jupiter
export type JupiterTrade = {
  mint: string;
  positionName: string;
  side: Side;
  action: 'Increase' | 'Decrease' | string;
  orderType: 'Market' | 'Trigger' | 'Limit' | string;
  collateralUsdDelta: string;
  price: string;
  size: string;
  baseFee: string;
  borrowFee: string;
  liquidationFee: string;
  priceImpactFee: string;
  fee: string;
  integratorFeeTokenMint: string | null;
  integratorFeeTokenAmount: string | null;
  pnl: string | null;
  pnlPercentage: string | null;
  txHash: string;
  createdTime: number;
  updatedTime: number;
  positionPubkey: string;
  owner: string;
  transactionFeeLamports: string | null;
  priorityFeeLamports: string | null;
  swapFeeBps: string | null;
  swapFeeUsd: string | null;
  swapFeeTokenAmount: string | null;
  swapFeeTokenMint: string | null;
};

export const normalizeJupiterTrades = (events: JupiterTrade[]): Trade[] => {
  const byPos = new Map<string, JupiterTrade[]>();
  for (const e of events) {
    const k = e.positionPubkey || `${e.positionName}|${e.side}`;
    if (!byPos.has(k)) {
      byPos.set(k, []);
    }
    byPos.get(k)!.push(e);
  }

  const trades: Trade[] = [];

  for (const list of byPos.values()) {
    list.sort((a, b) => a.createdTime - b.createdTime);

    let openedAt: Date | null = null;
    let liveSize = 0;
    // Weighted-average entry: track total cost and total size across all increases.
    let totalEntryCost = 0;
    let totalEntrySize = 0;

    for (const e of list) {
      const ts = new Date(e.createdTime * 1000);
      const action = e.action.toLowerCase();
      const orderType = e.orderType.toLowerCase();
      const size = parseFloat(e.size);
      const fee = parseFloat(e.fee);
      const pnl = e.pnl === null ? null : parseFloat(e.pnl);
      const price = parseFloat(e.price) || undefined;

      const isIncrease = action.includes('increase') || action.includes('open');
      const isDecrease = action.includes('decrease') || action.includes('close');
      const isLiquidate = action.includes('liquid');

      if (isIncrease) {
        if (liveSize === 0 || !openedAt) {
          openedAt = ts;
        }
        liveSize += size;
        // Accumulate weighted entry price across DCA fills
        if (price) {
          totalEntryCost += price * size;
          totalEntrySize += size;
        }
        continue;
      }

      if (isDecrease || isLiquidate) {
        if (!openedAt) openedAt = ts;

        // Always track position size, even if PnL is missing (partial close)
        liveSize = Math.max(0, liveSize - size);
        const positionClosed = liveSize < 1e-6;

        // Skip creating a trade record when PnL is unavailable (e.g. partial fills
        // that the API has not yet settled), but keep position state consistent.
        if (pnl !== null) {
          let closeType: CloseType;
          if (isLiquidate) {
            closeType = 'Liquidation';
          } else if (orderType.includes('trigger')) {
            closeType = pnl > 0 ? 'TP' : 'SL';
          } else {
            closeType = 'Manual';
          }

          const entryPrice = totalEntrySize > 0 ? totalEntryCost / totalEntrySize : undefined;

          trades.push({
            symbol: e.positionName.replace(/-PERP$/i, ''),
            opened: openedAt,
            closed: ts,
            side: e.side,
            pnl: pnl - fee,
            fee,
            sizeUsd: size,
            closeType,
            source: 'Jupiter',
            entryPrice,
            exitPrice: price,
          });
        }

        if (positionClosed) {
          liveSize = 0;
          openedAt = null;
          totalEntryCost = 0;
          totalEntrySize = 0;
        }
      }
    }
  }

  return trades;
};
