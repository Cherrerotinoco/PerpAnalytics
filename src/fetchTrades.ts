#!/usr/bin/env node
/**
 * Fetch trades desde Jupiter Perps, filtra desde 1 de Mayo
 * y genera un CSV listo para pegar en Excel.
 *
 * Uso: npm start
 */

import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────

const WALLET = 'BzPG6Mwpgbh9AGLUuJkqUA2HBmLQhe3mHxR5B4tfv42U';
const JUPITER_URL = `https://perps-api.jup.ag/v1/trades?walletAddress=${WALLET}&start=0&end=20`;
const PACIFICA_URL = `https://api.pacifica.fi/api/v1/positions/history?account=${WALLET}&limit=20`;

const YEAR = new Date().getFullYear();
const START_DATE = new Date(Date.UTC(YEAR, 4, 1, 0, 0, 0)); // 1 mayo UTC
const END_DATE = new Date();

const DAYS_ES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'] as const;
const MONTHS_ES = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────────────────────

type Side = 'long' | 'short';
type CloseType = 'TP' | 'SL' | 'Manual' | 'Liquidation';

interface Trade {
    symbol: string;
    opened: Date;
    closed: Date;
    side: Side;
    pnl: number;
    fee: number;
    sizeUsd: number;
    closeType: CloseType;
    source: 'Jupiter' | 'Pacifica';
}

// Esquema Pacifica
interface PacificaFill {
    history_id: number;
    order_id: number;
    symbol: string;
    amount: string;
    price: string;
    entry_price: string;
    fee: string;
    pnl: string;
    event_type: string; // 'fulfill_maker' (TP/SL) | 'fulfill_taker' (market/manual)
    side: 'open_long' | 'open_short' | 'close_long' | 'close_short';
    created_at: number; // ms
    cause: string; // 'normal' | 'market_liquidation' | 'backstop_liquidation' | 'settlement'
}

interface PacificaResponse {
    success: boolean;
    data: PacificaFill[];
    has_more: boolean;
}

// Esquema Jupiter
interface JupiterTrade {
    mint: string;
    positionName: string;
    side: 'long' | 'short';
    action: 'Increase' | 'Decrease' | string;
    orderType: 'Market' | 'Trigger' | 'Limit' | string;
    collateralUsdDelta: string;
    price: string;
    size: string;
    fee: string;
    pnl: string | null;
    pnlPercentage: string | null;
    txHash: string;
    createdTime: number;
    updatedTime: number;
    positionPubkey: string;
    owner: string;
}

interface JupiterResponse {
    dataList: JupiterTrade[];
    count: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

async function fetchJson<T>(url: string): Promise<T> {
    const res = await fetch(url, {
        headers: { 'accept': 'application/json', 'user-agent': 'tradesConverter/1.0' },
    });
    if (!res.ok) {
        throw new Error(`Request failed ${res.status} ${res.statusText} -> ${url}`);
    }
    return res.json() as Promise<T>;
}

function num(v: string | number | null | undefined): number {
    if (v === null || v === undefined || v === '') return 0;
    const n = typeof v === 'number' ? v : parseFloat(v);
    return Number.isFinite(n) ? n : 0;
}

function pad(x: number | string): string {
    return String(x).padStart(2, '0');
}

/** DD.MM.YY */
function fmtDateShort(d: Date): string {
    const yy = String(d.getUTCFullYear()).slice(-2);
    return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${yy}`;
}

/** DD.MM.YY HH:MM:SS */
function fmtDateTimeShort(d: Date): string {
    const yy = String(d.getUTCFullYear()).slice(-2);
    return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${yy} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

/** H:MM:SS */
function fmtDuration(ms: number): string {
    if (!Number.isFinite(ms) || ms < 0) return '';
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${h}:${pad(m)}:${pad(s)}`;
}

/** Horas decimales con 2 decimales (coma) */
function fmtHours(ms: number): string {
    if (!Number.isFinite(ms) || ms < 0) return '';
    return (ms / 3_600_000).toFixed(2).replace('.', ',');
}

function csvEscape(v: unknown): string {
    if (v === null || v === undefined) return '';
    const s = String(v);
    if (/[";\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
}

// ─────────────────────────────────────────────────────────────────────────────
// JUPITER → Trades
// ─────────────────────────────────────────────────────────────────────────────

function buildJupiterTrades(events: JupiterTrade[]): Trade[] {
    const byPos = new Map<string, JupiterTrade[]>();
    for (const e of events) {
        const k = e.positionPubkey || `${e.positionName}|${e.side}`;
        if (!byPos.has(k)) byPos.set(k, []);
        byPos.get(k)!.push(e);
    }

    const trades: Trade[] = [];

    for (const list of byPos.values()) {
        list.sort((a, b) => a.createdTime - b.createdTime);

        let openedAt: Date | null = null;
        let openSizeUsd = 0;
        let openFeeAccum = 0;
        let liveSize = 0;

        for (const e of list) {
            const ts = new Date(e.createdTime * 1000);
            const action = String(e.action).toLowerCase();
            const orderType = String(e.orderType).toLowerCase();
            const size = num(e.size);
            const fee = num(e.fee);
            const pnl = e.pnl === null ? null : num(e.pnl);

            const isIncrease = action.includes('increase') || action.includes('open');
            const isDecrease = action.includes('decrease') || action.includes('close');
            const isLiquidate = action.includes('liquid');

            if (isIncrease) {
                if (liveSize === 0 || !openedAt) {
                    openedAt = ts;
                }
                liveSize += size;
                openSizeUsd += size;
                openFeeAccum += fee;
                continue;
            }

            if (isDecrease || isLiquidate) {
                if (pnl === null) continue;
                if (!openedAt) openedAt = ts;

                const proportion = liveSize > 0 ? Math.min(1, size / liveSize) : 1;
                const allocatedOpenFee = openFeeAccum * proportion;
                const closedSizeUsd = openSizeUsd > 0 ? openSizeUsd * proportion : size;
                const netPnl = pnl - fee;

                let closeType: CloseType;
                if (isLiquidate) closeType = 'Liquidation';
                else if (orderType.includes('trigger')) closeType = pnl > 0 ? 'TP' : 'SL';
                else closeType = 'Manual';

                trades.push({
                    symbol: e.positionName.replace(/-PERP$/i, ''),
                    opened: openedAt,
                    closed: ts,
                    side: e.side === 'short' ? 'short' : 'long',
                    pnl: netPnl,
                    fee: fee + allocatedOpenFee,
                    sizeUsd: closedSizeUsd,
                    closeType,
                    source: 'Jupiter',
                });

                liveSize = Math.max(0, liveSize - size);
                openSizeUsd = Math.max(0, openSizeUsd - closedSizeUsd);
                openFeeAccum = Math.max(0, openFeeAccum - allocatedOpenFee);

                if (liveSize < 1e-6) {
                    liveSize = 0;
                    openSizeUsd = 0;
                    openFeeAccum = 0;
                    openedAt = null;
                }
            }
        }
    }

    return trades;
}

// ─────────────────────────────────────────────────────────────────────────────
// PACIFICA → Trades
// ─────────────────────────────────────────────────────────────────────────────

function buildPacificaTrades(fills: PacificaFill[]): Trade[] {
    // Sort ascending by time
    fills.sort((a, b) => a.created_at - b.created_at);

    // Track last open time per symbol+side key
    const openedAt = new Map<string, Date>();

    // Group close fills by symbol+side+timestamp to merge partial fills
    const closeGroups = new Map<string, { fills: PacificaFill[]; openedAt: Date }>();

    for (const fill of fills) {
        const isOpen = fill.side.startsWith('open_');
        const isClose = fill.side.startsWith('close_');
        const baseSymbol = fill.symbol;
        const direction = fill.side.endsWith('_long') ? 'long' : 'short';
        const posKey = `${baseSymbol}|${direction}`;

        if (isOpen) {
            // Record open time (only if not already tracking)
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
            // Clear open tracker after close
            openedAt.delete(posKey);
        }
    }

    const trades: Trade[] = [];

    for (const [, group] of closeGroups) {
        const { fills: closeFills, openedAt: opened } = group;
        const first = closeFills[0];
        const direction = first.side.endsWith('_long') ? 'long' : 'short';
        const closed = new Date(first.created_at);

        // Merge partial fills
        const totalPnl = closeFills.reduce((s, f) => s + num(f.pnl), 0);
        const totalFee = closeFills.reduce((s, f) => s + num(f.fee), 0);
        const totalSize = closeFills.reduce((s, f) => s + num(f.amount) * num(f.price), 0);

        // Determine close type from cause and PnL sign
        // cause: 'normal' | 'market_liquidation' | 'backstop_liquidation' | 'settlement'
        // Pacifica doesn't distinguish TP/SL from manual via event_type reliably,
        // so we use PnL sign: positive = TP, negative = SL
        const cause = (first.cause ?? 'normal').toLowerCase();
        let closeType: CloseType;
        if (cause.includes('liquidation')) closeType = 'Liquidation';
        else closeType = totalPnl > 0 ? 'TP' : 'SL';

        trades.push({
            symbol: first.symbol,
            opened,
            closed,
            side: direction,
            pnl: totalPnl,   // already net in Pacifica
            fee: totalFee,
            sizeUsd: totalSize,
            closeType,
            source: 'Pacifica',
        });
    }

    return trades;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    console.log('→ Descargando Jupiter…');
    console.log('→ Descargando Pacifica…');
    const [jupiter, pacifica] = await Promise.all([
        fetchJson<JupiterResponse>(JUPITER_URL),
        fetchJson<PacificaResponse>(PACIFICA_URL),
    ]);
    writeFileSync(join(PROJECT_ROOT, 'jupiter.json'), JSON.stringify(jupiter, null, 2));
    writeFileSync(join(PROJECT_ROOT, 'pacifica.json'), JSON.stringify(pacifica, null, 2));

    const jupiterTrades = buildJupiterTrades(jupiter?.dataList ?? []);
    const pacificaTrades = buildPacificaTrades(pacifica?.data ?? []);
    const allTrades = [...jupiterTrades, ...pacificaTrades];

    // Filtrar: trades cerrados entre 1 de mayo y hoy
    const filtered = allTrades.filter(t => t.closed >= START_DATE && t.closed <= END_DATE);
    filtered.sort((a, b) => a.closed.getTime() - b.closed.getTime());

    // Columnas Excel:
    // Date | Result | Won | Lost | Days | Month | Side | Opening time | Closing time |
    // Closing Type | Duration | Hours | Size | Fees (USD) | Symbol | Source
    const header = [
        'Date',
        'Result',
        'Cumulative result',
        'Won',
        'Lost',
        'Days',
        'Month',
        'Side',
        'Opening time',
        'Closing time',
        'Closing Type',
        'Duration',
        'Hours',
        'Size',
        'Fees (USD)',
        'Symbol',
    ];

    const rows = filtered.map(t => {
        const durationMs = t.closed.getTime() - t.opened.getTime();

        return [
            fmtDateShort(t.opened),
            t.pnl.toFixed(2).replace('.', ','),
            '',
            '=IF([@Result]>1;1;0)',
            DAYS_ES[t.opened.getUTCDay()],
            MONTHS_ES[t.opened.getUTCMonth()],
            t.side,
            fmtDateTimeShort(t.opened),
            fmtDateTimeShort(t.closed),
            t.closeType,
            '=[@[Closing time]]-[@[Opening time]]',
            '=[@Duration]*24',
            t.sizeUsd.toFixed(2).replace('.', ','),
            t.fee.toFixed(2).replace('.', ','),
            t.symbol,
            '=[@[Cumulative result]]/$B1',
            t.source
        ].map(csvEscape).join(';');
    });

    const csv = [header.join(';'), ...rows].join('\n');
    const outFile = join(PROJECT_ROOT, 'trades.csv');
    writeFileSync(outFile, csv);

    console.log(`\n✅ ${filtered.length} trades escritos en ${outFile}`);

    const totalPnl = filtered.reduce((s, t) => s + t.pnl, 0);
    const wins = filtered.filter(t => t.pnl > 0).length;
    const winRate = filtered.length ? (wins / filtered.length) * 100 : 0;
    console.log(`   PnL neto: ${totalPnl.toFixed(2)} USD | Win rate: ${winRate.toFixed(1)}% (${wins}/${filtered.length})`);
}

main().catch(err => {
    console.error('❌ Error:', err instanceof Error ? err.message : err);
    process.exit(1);
});
