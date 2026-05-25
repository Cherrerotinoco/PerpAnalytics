import { Trade, CloseType, Side } from '../types/tradeTypes';

// Tipos de la API Pacifica
interface PacificaFill {
    history_id: number;
    order_id: number;
    symbol: string;
    amount: string;
    price: string;
    entry_price: string;
    fee: string;
    pnl: string;
    event_type: string;
    side: 'open_long' | 'open_short' | 'close_long' | 'close_short';
    created_at: number;
    cause: string;
}

export function buildPacificaTrades(fills: PacificaFill[]): Trade[] {
    fills.sort((a, b) => a.created_at - b.created_at);
    const openedAt = new Map<string, Date>();
    const closeGroups = new Map<string, { fills: PacificaFill[]; openedAt: Date }>();

    for (const fill of fills) {
        const isOpen = fill.side.startsWith('open_');
        const isClose = fill.side.startsWith('close_');
        const baseSymbol = fill.symbol;
        const direction = fill.side.endsWith('_long') ? 'long' : 'short';
        const posKey = `${baseSymbol}|${direction}`;

        if (isOpen) {
            if (!openedAt.has(posKey)) {
                openedAt.set(posKey, new Date(fill.created_at));
            }
        } else if (isClose) {
            const openTime = openedAt.get(posKey) ?? new Date(fill.created_at);
            const groupKey = `${posKey}|${fill.created_at}`;
            if (!closeGroups.has(groupKey)) {
                closeGroups.set(groupKey, { fills: [], openedAt: openTime });
            }
            closeGroups.get(groupKey)!.fills.push(fill);
            openedAt.delete(posKey);
        }
    }

    const trades: Trade[] = [];

    for (const [, group] of closeGroups) {
        const { fills: closeFills, openedAt: opened } = group;
        const first = closeFills[0];
        const direction = first.side.endsWith('_long') ? 'long' : 'short';
        const closed = new Date(first.created_at);
        const totalPnl = closeFills.reduce((s, f) => s + parseFloat(f.pnl), 0);
        const totalFee = closeFills.reduce((s, f) => s + parseFloat(f.fee), 0);
        const totalSize = closeFills.reduce((s, f) => s + parseFloat(f.amount) * parseFloat(f.price), 0);
        const cause = (first.cause ?? 'normal').toLowerCase();
        let closeType: CloseType;
        if (cause.includes('liquidation')) closeType = 'Liquidation';
        else closeType = totalPnl > 0 ? 'TP' : 'SL';

        trades.push({
            symbol: first.symbol,
            opened,
            closed,
            side: direction as Side,
            pnl: totalPnl,
            fee: totalFee,
            sizeUsd: totalSize,
            closeType,
            source: 'Pacifica',
        });
    }

    return trades;
}
