import { useState } from 'react';
import { Trade } from '../types/tradeTypes';

// ─── Formatters ───────────────────────────────────────────────────────────────
function fmtDate(d: Date | null | undefined): string {
  if (!d) {
    return '—';
  }
  return d.toLocaleDateString('en-US', { year: '2-digit', month: '2-digit', day: '2-digit' });
}

function fmtTime(d: Date | null | undefined): string {
  if (!d) {
    return '—';
  }
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function fmtNum(n: number | null | undefined): string {
  if (n == null) {
    return '—';
  }
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Constants ────────────────────────────────────────────────────────────────
const PAGE_SIZE = 20;

type SortCol =
  | 'opened'
  | 'closed'
  | 'symbol'
  | 'side'
  | 'closeType'
  | 'pnl'
  | 'fee'
  | 'sizeUsd'
  | 'source';
type SortDir = 'asc' | 'desc';

// ─── Component ────────────────────────────────────────────────────────────────
export default function TradeList({ trades }: { trades: Trade[] }) {
  const [sort, setSort] = useState<{ col: SortCol; dir: SortDir }>({ col: 'opened', dir: 'desc' });
  const [page, setPage] = useState(1);

  if (!trades.length) {
    return null;
  }

  // ── Sort ──
  const getValue = (t: Trade, col: SortCol) => {
    switch (col) {
      case 'opened':
        return t.opened;
      case 'closed':
        return t.closed;
      case 'symbol':
        return t.symbol;
      case 'side':
        return t.side;
      case 'closeType':
        return t.closeType;
      case 'pnl':
        return t.pnl;
      case 'fee':
        return t.fee;
      case 'sizeUsd':
        return t.sizeUsd;
      case 'source':
        return t.source;
      default:
        return '';
    }
  };

  const sorted = [...trades].sort((a, b) => {
    const vA = getValue(a, sort.col);
    const vB = getValue(b, sort.col);
    if (vA === vB) {
      return 0;
    }
    if (vA == null) {
      return 1;
    }
    if (vB == null) {
      return -1;
    }
    if (typeof vA === 'number' && typeof vB === 'number') {
      return sort.dir === 'asc' ? vA - vB : vB - vA;
    }
    if (vA instanceof Date && vB instanceof Date) {
      return sort.dir === 'asc' ? vA.getTime() - vB.getTime() : vB.getTime() - vA.getTime();
    }
    return sort.dir === 'asc'
      ? String(vA).localeCompare(String(vB))
      : String(vB).localeCompare(String(vA));
  });

  // ── Pagination ──
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const paginated = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleSort = (col: SortCol) => {
    setPage(1);
    setSort((prev) =>
      prev.col === col ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' }
    );
  };

  // ── Header cell ──
  const Th = ({ label, col }: { label: string; col: SortCol }) => {
    const isActive = sort.col === col;
    return (
      <th onClick={() => handleSort(col)}>
        {label}
        {isActive && (
          <span style={{ marginLeft: 4, fontSize: '0.6rem' }}>
            {sort.dir === 'asc' ? '▲' : '▼'}
          </span>
        )}
      </th>
    );
  };

  const startRow = (page - 1) * PAGE_SIZE + 1;
  const endRow = Math.min(page * PAGE_SIZE, sorted.length);

  // Pagination window: up to 5 pages centred on current
  let winStart = Math.max(1, page - 2);
  const winEnd = Math.min(totalPages, winStart + 4);
  winStart = Math.max(1, winEnd - 4);

  return (
    <div>
      {/* ── Table ── */}
      <div className="table-responsive">
        <table className="tc-table w-100">
          <thead>
            <tr>
              <Th label="Date" col="opened" />
              <Th label="Open" col="opened" />
              <Th label="Close" col="closed" />
              <Th label="Symbol" col="symbol" />
              <Th label="Side" col="side" />
              <Th label="Close Type" col="closeType" />
              <Th label="PnL" col="pnl" />
              <Th label="Fee" col="fee" />
              <Th label="Size" col="sizeUsd" />
              <Th label="Source" col="source" />
            </tr>
          </thead>
          <tbody>
            {paginated.map((t) => (
              <tr
                key={`${t.source}-${t.symbol}-${t.side}-${t.opened?.getTime()}-${t.closed?.getTime()}`}
              >
                <td style={{ color: 'var(--tc-muted)' }}>{fmtDate(t.opened)}</td>
                <td style={{ color: 'var(--tc-muted)' }}>{fmtTime(t.opened)}</td>
                <td style={{ color: 'var(--tc-muted)' }}>{fmtTime(t.closed)}</td>
                <td style={{ fontFamily: 'monospace' }}>{t.symbol}</td>
                <td>
                  <span
                    style={{
                      fontSize: '0.65rem',
                      fontWeight: 600,
                      letterSpacing: '0.04em',
                      padding: '0.15rem 0.5rem',
                      borderRadius: 3,
                      color:
                        t.side?.toLowerCase() === 'long'
                          ? 'var(--tc-green)'
                          : 'var(--tc-red)',
                      background:
                        t.side?.toLowerCase() === 'long'
                          ? 'rgba(34,197,94,0.1)'
                          : 'rgba(220,38,38,0.1)',
                    }}
                  >
                    {t.side}
                  </span>
                </td>
                <td style={{ color: 'var(--tc-muted)' }}>{t.closeType ?? '—'}</td>
                <td
                  style={{
                    fontWeight: 600,
                    color: t.pnl >= 0 ? 'var(--tc-green)' : 'var(--tc-red)',
                  }}
                >
                  {t.pnl >= 0 ? '+' : ''}
                  {fmtNum(t.pnl)}
                </td>
                <td style={{ color: 'var(--tc-muted)' }}>{fmtNum(t.fee)}</td>
                <td>{fmtNum(t.sizeUsd)}</td>
                <td style={{ color: 'var(--tc-muted)' }}>{t.source ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.6rem 0.75rem',
            borderTop: '1px solid var(--tc-border)',
          }}
        >
          <span style={{ fontSize: '0.72rem', color: 'var(--tc-muted)' }}>
            {startRow}–{endRow} of {sorted.length}
          </span>
          <div style={{ display: 'flex', gap: 4 }}>
            <PagBtn onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
              ←
            </PagBtn>
            {Array.from({ length: winEnd - winStart + 1 }, (_, i) => {
              const pageNum = winStart + i;
              return (
                <PagBtn
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  active={pageNum === page}
                >
                  {pageNum}
                </PagBtn>
              );
            })}
            <PagBtn
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              →
            </PagBtn>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Pagination button ────────────────────────────────────────────────────────
function PagBtn({
  children,
  onClick,
  disabled,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        minWidth: 28,
        height: 28,
        padding: '0 0.4rem',
        background: active ? 'var(--tc-accent)' : 'transparent',
        border: `1px solid ${active ? 'var(--tc-accent)' : 'var(--tc-border)'}`,
        borderRadius: 4,
        color: active ? '#fff' : disabled ? 'var(--tc-border)' : 'var(--tc-muted)',
        fontSize: '0.75rem',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'border-color 0.1s, color 0.1s',
      }}
    >
      {children}
    </button>
  );
}
