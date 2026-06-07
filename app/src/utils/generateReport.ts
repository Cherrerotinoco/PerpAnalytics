import jsPDF from 'jspdf';
import type { TradeStats } from '../dashboard/panels/statistics';
import type { Trade } from '../types/tradeTypes';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number, decimals = 2): string =>
  n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

const fmtDate = (d: Date | null | undefined): string => {
  if (!d) return '—';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
};

const fmtDateTime = (d: Date | null | undefined): string => {
  if (!d) return '—';
  return `${fmtDate(d)} ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
};

// ─── Colour tokens ────────────────────────────────────────────────────────────
const C = {
  bg: [15, 15, 20] as [number, number, number],
  surface: [24, 24, 32] as [number, number, number],
  surface2: [32, 32, 44] as [number, number, number],
  accent: [245, 158, 11] as [number, number, number],
  text: [240, 240, 248] as [number, number, number],
  muted: [120, 120, 140] as [number, number, number],
  green: [34, 197, 94] as [number, number, number],
  red: [239, 68, 68] as [number, number, number],
  border: [50, 50, 68] as [number, number, number],
};

// ─── Layout ───────────────────────────────────────────────────────────────────
const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 14;
const CONTENT_W = PAGE_W - MARGIN * 2;

// ─── Page helpers ─────────────────────────────────────────────────────────────
const fillPageBg = (doc: jsPDF): void => {
  doc.setFillColor(...C.bg);
  doc.rect(0, 0, PAGE_W, PAGE_H, 'F');
};

const addPage = (doc: jsPDF): number => {
  doc.addPage();
  fillPageBg(doc);
  return MARGIN;
};

const checkY = (doc: jsPDF, y: number, needed: number): number => {
  if (y + needed > PAGE_H - MARGIN) return addPage(doc);
  return y;
};

// ─── Section header ───────────────────────────────────────────────────────────
const sectionHeader = (doc: jsPDF, y: number, title: string): number => {
  doc.setFillColor(...C.surface2);
  doc.roundedRect(MARGIN, y, CONTENT_W, 8, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...C.accent);
  doc.text(title.toUpperCase(), MARGIN + 4, y + 5.5);
  return y + 12;
};

// ─── Metric 2-column grid ─────────────────────────────────────────────────────
const metricGrid = (
  doc: jsPDF,
  y: number,
  items: { label: string; value: string; positive?: boolean | null }[]
): number => {
  const cellW = CONTENT_W / 2;
  const cellH = 10;
  let row = 0;
  let col = 0;

  items.forEach((item, i) => {
    const x = MARGIN + col * cellW;
    const cy = y + row * cellH;

    doc.setFillColor(...(i % 2 === 0 ? C.surface : C.surface2));
    doc.rect(x, cy, cellW, cellH, 'F');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...C.muted);
    doc.text(item.label, x + 4, cy + 3.8);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    if (item.positive === true) doc.setTextColor(...C.green);
    else if (item.positive === false) doc.setTextColor(...C.red);
    else doc.setTextColor(...C.text);
    doc.text(item.value, x + 4, cy + 8.2);

    col++;
    if (col === 2) {
      col = 0;
      row++;
    }
  });

  if (col !== 0) row++;
  return y + row * cellH + 6;
};

// ─── Generic table ────────────────────────────────────────────────────────────
interface ColDef {
  header: string;
  width: number; // fraction of CONTENT_W, must sum to 1
  align?: 'left' | 'right' | 'center';
  color?: (val: string) => [number, number, number] | null;
}

const drawTable = (doc: jsPDF, startY: number, cols: ColDef[], rows: string[][]): number => {
  const ROW_H = 6.5;
  const HEAD_H = 7.5;
  const PAD_L = 2;
  const PAD_BASELINE = 4.5; // text baseline inside row

  let y = startY;

  // widths in mm
  const widths = cols.map((c) => c.width * CONTENT_W);

  const drawRow = (cells: string[], rowY: number, isHead: boolean, altRow: boolean) => {
    const rH = isHead ? HEAD_H : ROW_H;
    let x = MARGIN;
    cells.forEach((cell, ci) => {
      const w = widths[ci];
      const bg = isHead ? C.surface2 : altRow ? C.surface2 : C.surface;
      doc.setFillColor(...bg);
      doc.rect(x, rowY, w, rH, 'F');

      // border bottom
      doc.setDrawColor(...C.border);
      doc.setLineWidth(0.1);
      doc.line(x, rowY + rH, x + w, rowY + rH);

      // text
      const col = cols[ci];
      if (isHead) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(...C.accent);
      } else {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        const customColor = col.color?.(cell);
        doc.setTextColor(...(customColor ?? C.text));
      }

      const align = col.align ?? 'left';
      const textX = align === 'right' ? x + w - PAD_L : align === 'center' ? x + w / 2 : x + PAD_L;
      doc.text(cell, textX, rowY + PAD_BASELINE + (isHead ? 0.5 : 0), { align });
      x += w;
    });
  };

  const drawHeader = (headerY: number) => {
    drawRow(
      cols.map((c) => c.header),
      headerY,
      true,
      false
    );
  };

  drawHeader(y);
  y += HEAD_H;

  rows.forEach((row, ri) => {
    // New page if needed — redraw header
    if (y + ROW_H > PAGE_H - MARGIN) {
      doc.addPage();
      fillPageBg(doc);
      y = MARGIN;
      drawHeader(y);
      y += HEAD_H;
    }
    drawRow(row, y, false, ri % 2 === 1);
    y += ROW_H;
  });

  return y + 4;
};

const pnlColor = (val: string): [number, number, number] | null => {
  const n = parseFloat(val.replace(/[$,]/g, ''));
  if (isNaN(n)) return null;
  return n >= 0 ? C.green : C.red;
};

// ─── Main export ──────────────────────────────────────────────────────────────
export const generateReport = (
  wallet: string,
  trades: Trade[],
  stats: TradeStats,
  startDate: string,
  endDate: string,
  platforms: string[]
): void => {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });

  // ── Page 1: header ──────────────────────────────────────────────────────────
  fillPageBg(doc);

  doc.setFillColor(...C.accent);
  doc.roundedRect(MARGIN, 14, 5, 14, 1, 1, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(...C.text);
  doc.text('PerpAnalytics', MARGIN + 9, 24);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...C.muted);
  doc.text('Trade Report', MARGIN + 9, 29);

  const dateLabel = startDate || endDate ? `${startDate || '—'} → ${endDate || '—'}` : 'All time';
  const meta = [
    { label: 'Wallet', value: wallet },
    { label: 'Period', value: dateLabel },
    { label: 'Platforms', value: platforms.join(', ') || 'All' },
    { label: 'Generated', value: new Date().toLocaleDateString('en-US') },
  ];

  let y = 42;
  doc.setFillColor(...C.surface);
  doc.roundedRect(MARGIN, y, CONTENT_W, 14, 2, 2, 'F');
  meta.forEach((m, i) => {
    const x = MARGIN + 4 + i * (CONTENT_W / 4);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...C.muted);
    doc.text(m.label, x, y + 5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...C.text);
    doc.text(m.value, x, y + 10.5, { maxWidth: CONTENT_W / 4 - 6 });
  });

  y = 64;

  // ── Performance Summary ──────────────────────────────────────────────────────
  y = sectionHeader(doc, y, 'Performance Summary');
  y = metricGrid(doc, y, [
    {
      label: 'Net PnL',
      value: `$${fmt(stats.totalPnl)}`,
      positive: stats.totalPnl > 0 ? true : stats.totalPnl < 0 ? false : null,
    },
    { label: 'Total Trades', value: String(stats.totalTrades), positive: null },
    {
      label: 'Win Rate',
      value: `${fmt(stats.winRate)}%`,
      positive: stats.winRate >= 50 ? true : false,
    },
    {
      label: 'Profit Factor',
      value: fmt(stats.profitFactor),
      positive: stats.profitFactor >= 1 ? true : false,
    },
    { label: 'Avg Win', value: `$${fmt(stats.avgWin)}`, positive: true },
    { label: 'Avg Loss', value: `$${fmt(stats.avgLoss)}`, positive: false },
    { label: 'Total Fees', value: `$${fmt(stats.totalFees)}`, positive: null },
    {
      label: 'Expectancy',
      value: `$${fmt(stats.expectancy)}`,
      positive: stats.expectancy > 0 ? true : false,
    },
  ]);

  // ── Risk & Drawdown ──────────────────────────────────────────────────────────
  y = checkY(doc, y, 80);
  y = sectionHeader(doc, y, 'Risk & Drawdown');
  y = metricGrid(doc, y, [
    { label: 'Max Drawdown', value: `$${fmt(stats.maxDrawdown)}`, positive: false },
    { label: 'Max Drawdown %', value: `${fmt(stats.maxDrawdownPct)}%`, positive: false },
    {
      label: 'Sharpe Ratio',
      value: fmt(stats.sharpeRatio),
      positive: stats.sharpeRatio > 1 ? true : null,
    },
    {
      label: 'Sortino Ratio',
      value: fmt(stats.sortino),
      positive: stats.sortino > 1 ? true : null,
    },
    {
      label: 'Calmar Ratio',
      value: fmt(stats.calmarRatio),
      positive: stats.calmarRatio > 0 ? true : null,
    },
    {
      label: 'Recovery Factor',
      value: fmt(stats.recoveryFactor),
      positive: stats.recoveryFactor > 1 ? true : null,
    },
    { label: 'VaR 95%', value: `$${fmt(stats.var95)}`, positive: false },
    {
      label: 'Risk / Reward',
      value: fmt(stats.riskReward),
      positive: stats.riskReward >= 1 ? true : null,
    },
  ]);

  // ── Consistency ──────────────────────────────────────────────────────────────
  y = checkY(doc, y, 80);
  y = sectionHeader(doc, y, 'Consistency');
  y = metricGrid(doc, y, [
    { label: 'Wins', value: String(stats.winTrades), positive: true },
    { label: 'Losses', value: String(stats.lossTrades), positive: false },
    { label: 'Loss Rate', value: `${fmt(stats.lossRate)}%`, positive: false },
    { label: 'Max Consec. Wins', value: String(stats.maxConsecWins), positive: true },
    { label: 'Max Consec. Losses', value: String(stats.maxConsecLosses), positive: false },
    { label: 'Median Win', value: `$${fmt(stats.medianWin)}`, positive: true },
    { label: 'Median Loss', value: `$${fmt(stats.medianLoss)}`, positive: false },
    { label: 'Best Trade', value: `$${fmt(stats.maxWin)}`, positive: true },
    { label: 'Worst Trade', value: `$${fmt(stats.maxLoss)}`, positive: false },
    { label: 'P90 Win', value: `$${fmt(stats.p90Win)}`, positive: true },
    { label: 'P90 Loss', value: `$${fmt(stats.p90Loss)}`, positive: false },
  ]);

  // ── PnL by Symbol ────────────────────────────────────────────────────────────
  const pnlBySymbol = trades.reduce<Record<string, number>>((acc, t) => {
    acc[t.symbol] = (acc[t.symbol] ?? 0) + t.pnl;
    return acc;
  }, {});
  const symbolRows = Object.entries(pnlBySymbol)
    .sort((a, b) => b[1] - a[1])
    .map(([sym, pnl]) => [sym, `$${fmt(pnl)}`]);

  if (symbolRows.length > 0) {
    y = checkY(doc, y, 40);
    y = sectionHeader(doc, y, 'PnL by Symbol');
    y = drawTable(
      doc,
      y,
      [
        { header: 'Symbol', width: 0.5 },
        { header: 'Net PnL', width: 0.5, align: 'right', color: pnlColor },
      ],
      symbolRows
    );
  }

  // ── Session Breakdown ────────────────────────────────────────────────────────
  if (stats.bySession.length > 0) {
    y = checkY(doc, y, 40);
    y = sectionHeader(doc, y, 'Performance by Session');
    y = drawTable(
      doc,
      y,
      [
        { header: 'Session', width: 0.25 },
        { header: 'Trades', width: 0.15, align: 'right' },
        { header: 'Win Rate', width: 0.2, align: 'right' },
        { header: 'Net PnL', width: 0.2, align: 'right', color: pnlColor },
        { header: 'Avg PnL', width: 0.2, align: 'right', color: pnlColor },
      ],
      stats.bySession.map((s) => [
        s.name,
        String(s.trades),
        `${fmt(s.winRate)}%`,
        `$${fmt(s.totalPnl)}`,
        `$${fmt(s.avgPnl)}`,
      ])
    );
  }

  // ── Equity Curve ─────────────────────────────────────────────────────────────
  if (stats.equityCurve.length > 0) {
    y = checkY(doc, y, 40);
    y = sectionHeader(doc, y, 'Equity Curve');
    y = drawTable(
      doc,
      y,
      [
        { header: 'Trade', width: 0.5 },
        { header: 'Cumulative PnL', width: 0.5, align: 'right', color: pnlColor },
      ],
      stats.equityCurve.map((val, i) => [
        stats.equityCurveLabels[i] ?? `Trade ${i + 1}`,
        `$${fmt(val)}`,
      ])
    );
  }

  // ── Trade History ─────────────────────────────────────────────────────────────
  const sortedTrades = [...trades].sort(
    (a, b) => (b.closed?.getTime() ?? 0) - (a.closed?.getTime() ?? 0)
  );
  if (sortedTrades.length > 0) {
    doc.addPage();
    fillPageBg(doc);
    y = MARGIN;
    y = sectionHeader(doc, y, `Trade History (${sortedTrades.length} trades)`);
    y = drawTable(
      doc,
      y,
      [
        { header: 'Opened', width: 0.16 },
        { header: 'Closed', width: 0.16 },
        { header: 'Symbol', width: 0.09 },
        {
          header: 'Side',
          width: 0.07,
          align: 'center',
          color: (v) => (v === 'LONG' ? C.green : C.red),
        },
        { header: 'Close', width: 0.08, align: 'center' },
        { header: 'Source', width: 0.09 },
        { header: 'Size', width: 0.1, align: 'right' },
        { header: 'Entry', width: 0.08, align: 'right' },
        { header: 'Exit', width: 0.08, align: 'right' },
        { header: 'PnL', width: 0.09, align: 'right', color: pnlColor },
      ],
      sortedTrades.map((t) => [
        fmtDateTime(t.opened),
        fmtDateTime(t.closed),
        t.symbol,
        t.side.toUpperCase(),
        t.closeType,
        t.source,
        `$${fmt(t.sizeUsd, 0)}`,
        t.entryPrice != null ? fmt(t.entryPrice) : '—',
        t.exitPrice != null ? fmt(t.exitPrice) : '—',
        `$${fmt(t.pnl)}`,
      ])
    );
  }

  // ── Page numbers ──────────────────────────────────────────────────────────────
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...C.muted);
    doc.text(`${i} / ${total}`, PAGE_W - MARGIN, PAGE_H - 6, { align: 'right' });
    doc.text('perpAnalytics.app', MARGIN, PAGE_H - 6);
  }

  // ── Download ──────────────────────────────────────────────────────────────────
  const filename = `perp-report-${wallet.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.pdf`;
  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 100);
};
