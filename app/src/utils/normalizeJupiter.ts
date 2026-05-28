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

    for (const e of list) {
      const ts = new Date(e.createdTime * 1000);
      const action = e.action.toLowerCase();
      const orderType = e.orderType.toLowerCase();
      const size = parseFloat(e.size);
      const fee = parseFloat(e.fee);
      const pnl = e.pnl === null ? null : parseFloat(e.pnl);

      const isIncrease = action.includes('increase') || action.includes('open');
      const isDecrease = action.includes('decrease') || action.includes('close');
      const isLiquidate = action.includes('liquid');

      if (isIncrease) {
        if (liveSize === 0 || !openedAt) {
          openedAt = ts;
        }
        liveSize += size;
        continue;
      }

      if (isDecrease || isLiquidate) {
        if (pnl === null) {
          continue;
        }
        if (!openedAt) {
          openedAt = ts;
        }

        let closeType: CloseType;
        if (isLiquidate) {
          closeType = 'Liquidation';
        } else if (orderType.includes('trigger')) {
          closeType = pnl > 0 ? 'TP' : 'SL';
        } else {
          closeType = 'Manual';
        }

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
        });

        liveSize = Math.max(0, liveSize - size);

        if (liveSize < 1e-6) {
          liveSize = 0;
          openedAt = null;
        }
      }
    }
  }

  return trades;
};
