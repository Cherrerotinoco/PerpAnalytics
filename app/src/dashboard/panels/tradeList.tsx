import { useState, useMemo, useCallback, memo } from 'react';
import { Trade } from '../../types/tradeTypes';
import { TradeModal } from '../TradeModal';

// ─── Formatters ───────────────────────────────────────────────────────────────
const fmtDateTime = (d: Date | null | undefined): string => {
  if (!d) {
    return '—';
  }
  const date = d.toLocaleDateString('en-US', { year: '2-digit', month: '2-digit', day: '2-digit' });
  const time = d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  return `${date} ${time}`;
};

const fmtNum = (n: number | null | undefined): string => {
  if (n == null) {
    return '—';
  }
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

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

// ─── Sort helper (module-level — no closure over component state) ─────────────
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

// ─── Header cell ──────────────────────────────────────────────────────────────
// Defined at module level so React sees a stable component type across renders.
const Th = ({
  label,
  col,
  sort,
  onSort,
}: {
  label: string;
  col: SortCol;
  sort: { col: SortCol; dir: SortDir };
  onSort: (col: SortCol) => void;
}) => {
  const isActive = sort.col === col;
  return (
    <th onClick={() => onSort(col)}>
      {label}
      {isActive && <span className="tc-sort-arrow">{sort.dir === 'asc' ? '▲' : '▼'}</span>}
    </th>
  );
};

// ─── Component ────────────────────────────────────────────────────────────────
const TradeList = memo(({ trades }: { trades: Trade[] }) => {
  const [sort, setSort] = useState<{ col: SortCol; dir: SortDir }>({ col: 'opened', dir: 'desc' });
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Trade | null>(null);

  // ── Sort (memoised — only recomputes when trades array or sort config changes) ──
  const sorted = useMemo(
    () =>
      [...trades].sort((a, b) => {
        const vA = getValue(a, sort.col);
        const vB = getValue(b, sort.col);
        if (vA === vB) return 0;
        if (vA == null) return 1;
        if (vB == null) return -1;
        if (typeof vA === 'number' && typeof vB === 'number') {
          return sort.dir === 'asc' ? vA - vB : vB - vA;
        }
        if (vA instanceof Date && vB instanceof Date) {
          return sort.dir === 'asc' ? vA.getTime() - vB.getTime() : vB.getTime() - vA.getTime();
        }
        return sort.dir === 'asc'
          ? String(vA).localeCompare(String(vB))
          : String(vB).localeCompare(String(vA));
      }),
    [trades, sort]
  );

  // ── All hooks must be declared before any conditional return ──
  const handleSort = useCallback((col: SortCol) => {
    setPage(1);
    setSort((prev) =>
      prev.col === col ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' }
    );
  }, []);

  if (!trades.length) {
    return null;
  }

  // ── Pagination ──
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const paginated = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

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
              <Th label="Open" col="opened" sort={sort} onSort={handleSort} />
              <Th label="Close" col="closed" sort={sort} onSort={handleSort} />
              <Th label="Symbol" col="symbol" sort={sort} onSort={handleSort} />
              <Th label="Side" col="side" sort={sort} onSort={handleSort} />
              <Th label="PnL" col="pnl" sort={sort} onSort={handleSort} />
              <Th label="Fee" col="fee" sort={sort} onSort={handleSort} />
              <Th label="Size" col="sizeUsd" sort={sort} onSort={handleSort} />
              <Th label="Source" col="source" sort={sort} onSort={handleSort} />
            </tr>
          </thead>
          <tbody>
            {paginated.map((t, i) => (
              <tr
                key={`${t.source}-${t.symbol}-${t.side}-${t.opened?.getTime()}-${t.closed?.getTime()}-${i}`}
                className="tc-trade-row--clickable"
                onClick={() => setSelected(t)}
                title="View trade details"
              >
                <td className="tc-muted-text text-nowrap">{fmtDateTime(t.opened)}</td>
                <td className="tc-muted-text text-nowrap">{fmtDateTime(t.closed)}</td>
                <td className="font-monospace">{t.symbol}</td>
                <td>
                  <span
                    className={`tc-side-badge ${t.side?.toLowerCase() === 'long' ? 'tc-badge--positive' : 'tc-badge--negative'}`}
                  >
                    {t.side}
                  </span>
                </td>
                <td className={`fw-semibold ${t.pnl >= 0 ? 'tc-green' : 'tc-red'}`}>
                  {t.pnl >= 0 ? '+' : ''}
                  {fmtNum(t.pnl)}
                </td>
                <td className="tc-muted-text">{fmtNum(t.fee)}</td>
                <td>{fmtNum(t.sizeUsd)}</td>
                <td className="tc-muted-text">{t.source ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="tc-pagination">
          <span className="tc-small-muted">
            {startRow}–{endRow} of {sorted.length}
          </span>
          <div className="d-flex gap-1">
            <PagBtn onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
              ←
            </PagBtn>
            {Array.from({ length: winEnd - winStart + 1 }, (_, i) => {
              const pageNum = winStart + i;
              return (
                <PagBtn key={pageNum} onClick={() => setPage(pageNum)} active={pageNum === page}>
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

      {selected && <TradeModal trade={selected} onClose={() => setSelected(null)} />}
    </div>
  );
});

export default TradeList;

// ─── Pagination button ────────────────────────────────────────────────────────
const PagBtn = ({
  children,
  onClick,
  disabled,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={`tc-page-btn${active ? ' active' : ''}`}
  >
    {children}
  </button>
);
