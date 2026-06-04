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
};
