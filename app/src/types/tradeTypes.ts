export type Side = 'long' | 'short';
export type CloseType = 'TP' | 'SL' | 'Manual' | 'Liquidation';

export type Trade = {
  symbol: string;
  opened: Date;
  closed: Date;
  side: Side;
  pnl: number;
  fee: number;
  sizeUsd: number;
  closeType: CloseType;
  source: 'Jupiter' | 'Pacifica';
  entryPrice?: number;
  exitPrice?: number;
  // Round-trip fee split by liquidity role. Only populated where the venue
  // reports it (Pacifica). Jupiter uses a pool model with no maker/taker
  // distinction, so these stay undefined for Jupiter trades.
  takerFee?: number;
  makerFee?: number;
};
