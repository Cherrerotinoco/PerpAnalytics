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
      <th
        className={`text-uppercase fw-semibold cursor-pointer user-select-none ${isActive ? 'text-primary' : 'text-secondary'}`}
        style={{ fontSize: '0.65rem', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}
        onClick={() => handleSort(col)}
      >
        {label}
        {isActive && (
          <span className="ms-1" style={{ fontSize: '0.6rem' }}>
            {sort.dir === 'asc' ? '▲' : '▼'}
          </span>
        )}
      </th>
    );
  };

  const startRow = (page - 1) * PAGE_SIZE + 1;
  const endRow = Math.min(page * PAGE_SIZE, sorted.length);

  return (
    <div className="overflow-hidden">
      {/* ── Table ── */}
      <div className="table-responsive">
        <table className="table table-hover table-sm align-middle mb-0">
          <thead className="table-light">
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
            {paginated.map((t, i) => (
              <tr
                key={`${t.source}-${t.symbol}-${t.side}-${t.opened?.getTime()}-${t.closed?.getTime()}`}
              >
                <td className="text-secondary" style={{ fontSize: '0.8rem' }}>
                  {fmtDate(t.opened)}
                </td>
                <td className="text-secondary" style={{ fontSize: '0.8rem' }}>
                  {fmtTime(t.opened)}
                </td>
                <td className="text-secondary" style={{ fontSize: '0.8rem' }}>
                  {fmtTime(t.closed)}
                </td>
                <td className="font-monospace" style={{ fontSize: '0.8rem' }}>
                  {t.symbol}
                </td>
                <td>
                  <span
                    className={`badge fw-semibold ${t.side?.toLowerCase() === 'long' ? 'text-success bg-success-subtle' : 'text-danger bg-danger-subtle'}`}
                    style={{ fontSize: '0.65rem', letterSpacing: '0.04em' }}
                  >
                    {t.side}
                  </span>
                </td>
                <td className="text-secondary" style={{ fontSize: '0.8rem' }}>
                  {t.closeType ?? '—'}
                </td>
                <td className={`fw-semibold ${t.pnl >= 0 ? 'text-success' : 'text-danger'}`}>
                  {t.pnl >= 0 ? '+' : ''}
                  {fmtNum(t.pnl)}
                </td>
                <td className="text-secondary" style={{ fontSize: '0.8rem' }}>
                  {fmtNum(t.fee)}
                </td>
                <td>{fmtNum(t.sizeUsd)}</td>
                <td className="text-secondary" style={{ fontSize: '0.8rem' }}>
                  {t.source ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="d-flex align-items-center justify-content-between px-4 py-3 border-top">
          <small className="text-secondary">
            Showing {startRow}–{endRow} of {sorted.length} trades
          </small>
          <nav aria-label="Trade pagination">
            <ul className="pagination pagination-sm mb-0">
              <li className={`page-item ${page === 1 ? 'disabled' : ''}`}>
                <button className="page-link" onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  ← Prev
                </button>
              </li>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                let start = Math.max(1, page - 2);
                const end = Math.min(totalPages, start + 4);
                start = Math.max(1, end - 4);
                const pageNum = start + i;
                if (pageNum > totalPages) {
                  return null;
                }
                return (
                  <li key={pageNum} className={`page-item ${pageNum === page ? 'active' : ''}`}>
                    <button className="page-link" onClick={() => setPage(pageNum)}>
                      {pageNum}
                    </button>
                  </li>
                );
              })}
              <li className={`page-item ${page === totalPages ? 'disabled' : ''}`}>
                <button
                  className="page-link"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next →
                </button>
              </li>
            </ul>
          </nav>
        </div>
      )}
    </div>
  );
}
