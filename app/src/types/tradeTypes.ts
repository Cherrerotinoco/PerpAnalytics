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
  source: TradeSource;
  entryPrice?: number;
  exitPrice?: number;
  // Round-trip fee split by liquidity role. Only populated where the venue
  // reports it (Pacifica, Hyperliquid). Jupiter uses a pool model with no
  // maker/taker distinction, so these stay undefined for Jupiter trades.
  takerFee?: number;
  makerFee?: number;
  // The front-end's share of `fee`, where the venue reports one. Hyperliquid
  // exposes it as `builderFee`: trades placed through FOMO carry the app's cut
  // (5 bps) on top of the venue's own (4.32 bps), inside the same `fee` total.
  builderFee?: number;
};

export type TradeSource = 'Jupiter' | 'Pacifica' | 'Hyperliquid';
