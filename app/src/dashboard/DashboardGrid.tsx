import { useState, useEffect, useMemo, useCallback, useRef, Suspense, lazy } from 'react';
import { createPortal } from 'react-dom';
import { GridStack } from 'gridstack';
import type { GridStackOptions, GridStackWidget, GridItemHTMLElement } from 'gridstack';
import 'gridstack/dist/gridstack.min.css';

import { Trade } from '../types/tradeTypes';
import { computeTradeStats } from './panels/statistics';
import { METRIC_PANEL_CONFIGS, MetricPanel } from './panels/metricPanel';
import type { PanelSection } from './panels/metricPanel';
import { FilterBar } from './FilterBar';
import type { FilterPanelDef } from './FilterBar';
import { PanelPlaceholder } from './PanelPlaceholder';

const EquityCurveChart = lazy(() => import('./panels/equityCurveChart'));
const PnlCalendar = lazy(() => import('./panels/pnlCalendar'));
const PnlBySymbolChart = lazy(() => import('./panels/pnlBySymbolChart'));
const PnlBySessionChart = lazy(() => import('./panels/pnlBySessionChart'));
const WinRateByHourChart = lazy(() => import('./panels/winRateByHourChart'));
const PnlByWeekdayChart = lazy(() => import('./panels/pnlByWeekdayChart'));
const WinRateByWeekdayChart = lazy(() => import('./panels/winRateByWeekdayChart'));
const PnlByHourChart = lazy(() => import('./panels/pnlByHourChart'));
const TradeList = lazy(() => import('./panels/tradeList'));

// ─── Panel registry ───────────────────────────────────────────────────────────
interface PanelDef {
  id: string;
  title: string;
  section: PanelSection;
  defaultVisible: boolean;
  w: number;
  h: number;
  /** Fixed column start; omit → autoPosition */
  x?: number;
  /** Fixed row start; omit → autoPosition */
  y?: number;
  scroll?: boolean;
  sizeToContent?: boolean;
}

const CHART_PANELS: PanelDef[] = [
  {
    id: 'equity',
    title: 'Equity Curve',
    section: 'charts',
    defaultVisible: true,
    w: 8,
    h: 6,
    x: 0,
    y: 0,
    sizeToContent: true,
  },
  {
    id: 'pnl-by-hour',
    title: 'PnL by Hour',
    section: 'charts',
    defaultVisible: false,
    w: 6,
    h: 6,
    sizeToContent: true,
  },
  {
    id: 'session',
    title: 'PnL by Session',
    section: 'charts',
    defaultVisible: false,
    w: 5,
    h: 6,
    sizeToContent: true,
  },
  {
    id: 'symbol',
    title: 'PnL by Symbol',
    section: 'charts',
    defaultVisible: false,
    w: 4,
    h: 6,
    x: 8,
    y: 0,
    sizeToContent: true,
  },
  {
    id: 'pnl-by-weekday',
    title: 'PnL by Weekday',
    section: 'charts',
    defaultVisible: false,
    w: 6,
    h: 6,
    sizeToContent: true,
  },
  {
    id: 'calendar',
    title: 'PnL Calendar',
    section: 'charts',
    defaultVisible: false,
    w: 5,
    h: 6,
    sizeToContent: true,
  },
  {
    id: 'history',
    title: 'Trade History',
    section: 'charts',
    defaultVisible: true,
    w: 12,
    h: 6,
    x: 0,
    y: 6,
    sizeToContent: true,
  },
  {
    id: 'winrate-by-hour',
    title: 'Win Rate by Hour',
    section: 'charts',
    defaultVisible: false,
    w: 6,
    h: 6,
    sizeToContent: true,
  },
  {
    id: 'winrate-by-weekday',
    title: 'Win Rate by Weekday',
    section: 'charts',
    defaultVisible: false,
    w: 6,
    h: 6,
    sizeToContent: true,
  },
];

// Default positions for the metric panels visible on first load (Overview layout).
// Non-visible panels use autoPosition when the user enables them.
const METRIC_DEFAULT_POSITIONS: Record<string, { x: number; y: number; w: number }> = {
  'metric-total-pnl': { x: 8, y: 0, w: 2 },
  'metric-total-trades': { x: 10, y: 0, w: 2 },
  'metric-win-rate': { x: 8, y: 3, w: 2 },
  'metric-streaks': { x: 10, y: 3, w: 2 },
};

const METRIC_PANELS: PanelDef[] = METRIC_PANEL_CONFIGS.map((c) => {
  const pos = METRIC_DEFAULT_POSITIONS[c.id];
  return {
    id: c.id,
    title: c.title,
    section: c.section,
    defaultVisible: c.defaultVisible,
    w: pos?.w ?? c.w,
    h: 3,
    x: pos?.x,
    y: pos?.y,
    sizeToContent: true,
  };
});

const ALL_PANELS: PanelDef[] = [...CHART_PANELS, ...METRIC_PANELS];

const DEFAULT_VISIBLE = new Set(ALL_PANELS.filter((p) => p.defaultVisible).map((p) => p.id));

// ─── Layout presets ───────────────────────────────────────────────────────────
export interface LayoutPreset {
  id: string;
  label: string;
  visible: string[];
  positions: Record<string, { x: number; y: number; w: number; h: number }>;
}

export const LAYOUT_PRESETS: LayoutPreset[] = [
  {
    id: 'overview',
    label: 'Overview',
    visible: [
      'equity',
      'history',
      'metric-total-pnl',
      'metric-total-trades',
      'metric-win-rate',
      'metric-streaks',
    ],
    positions: {
      equity: { x: 0, y: 0, w: 8, h: 6 },
      'metric-total-pnl': { x: 8, y: 0, w: 2, h: 3 },
      'metric-total-trades': { x: 10, y: 0, w: 2, h: 3 },
      'metric-win-rate': { x: 8, y: 3, w: 2, h: 3 },
      'metric-streaks': { x: 10, y: 3, w: 2, h: 3 },
      history: { x: 0, y: 6, w: 12, h: 6 },
    },
  },
  {
    id: 'performance',
    label: 'Performance',
    visible: [
      'equity',
      'metric-total-pnl',
      'metric-profit-factor',
      'metric-expectancy',
      'metric-risk-reward',
      'metric-max-profit',
      'metric-max-loss',
      'pnl-by-hour',
      'pnl-by-weekday',
      'winrate-by-hour',
      'winrate-by-weekday',
    ],
    positions: {
      equity: { x: 0, y: 0, w: 12, h: 6 },
      'metric-total-pnl': { x: 0, y: 6, w: 4, h: 3 },
      'metric-profit-factor': { x: 4, y: 6, w: 4, h: 3 },
      'metric-expectancy': { x: 8, y: 6, w: 4, h: 3 },
      'metric-risk-reward': { x: 0, y: 9, w: 4, h: 3 },
      'metric-max-profit': { x: 4, y: 9, w: 4, h: 3 },
      'metric-max-loss': { x: 8, y: 9, w: 4, h: 3 },
      'pnl-by-hour': { x: 0, y: 15, w: 6, h: 6 },
      'pnl-by-weekday': { x: 6, y: 15, w: 6, h: 6 },
      'winrate-by-hour': { x: 0, y: 21, w: 6, h: 6 },
      'winrate-by-weekday': { x: 6, y: 21, w: 6, h: 6 },
    },
  },
  {
    id: 'risk',
    label: 'Risk',
    visible: [
      'equity',
      'metric-max-drawdown',
      'metric-calmar',
      'metric-sharpe',
      'metric-sortino',
      'metric-recovery-factor',
      'metric-var95',
    ],
    positions: {
      equity: { x: 0, y: 0, w: 12, h: 6 },
      'metric-max-drawdown': { x: 0, y: 6, w: 4, h: 3 },
      'metric-calmar': { x: 4, y: 6, w: 4, h: 3 },
      'metric-sharpe': { x: 8, y: 6, w: 4, h: 3 },
      'metric-sortino': { x: 0, y: 9, w: 4, h: 3 },
      'metric-recovery-factor': { x: 4, y: 9, w: 4, h: 3 },
      'metric-var95': { x: 8, y: 9, w: 4, h: 3 },
    },
  },
  {
    id: 'trade-stats',
    label: 'Trade Stats',
    visible: [
      'symbol',
      'calendar',
      'metric-win-rate',
      'metric-loss-rate',
      'metric-total-trades',
      'metric-streaks',
      'history',
    ],
    positions: {
      symbol: { x: 0, y: 0, w: 6, h: 6 },
      calendar: { x: 6, y: 0, w: 6, h: 6 },
      'metric-win-rate': { x: 0, y: 6, w: 3, h: 3 },
      'metric-loss-rate': { x: 3, y: 6, w: 3, h: 3 },
      'metric-total-trades': { x: 6, y: 6, w: 3, h: 3 },
      'metric-streaks': { x: 9, y: 6, w: 3, h: 3 },
      history: { x: 0, y: 9, w: 12, h: 6 },
    },
  },
  {
    id: 'minimal',
    label: 'Minimal',
    visible: ['metric-total-pnl', 'metric-win-rate', 'metric-max-drawdown', 'metric-profit-factor'],
    positions: {
      'metric-total-pnl': { x: 0, y: 0, w: 3, h: 3 },
      'metric-win-rate': { x: 3, y: 0, w: 3, h: 3 },
      'metric-max-drawdown': { x: 6, y: 0, w: 3, h: 3 },
      'metric-profit-factor': { x: 9, y: 0, w: 3, h: 3 },
    },
  },
];

// ─── Persistence ──────────────────────────────────────────────────────────────
const LAYOUT_KEY = 'tc:gs-layout-v1';
const VISIBILITY_KEY = 'tc:panel-visibility-v1';

type SavedItem = { id: string; x: number; y: number; w: number; h: number };

const loadSavedPositions = (): Record<string, SavedItem> => {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (!raw) return {};
    const items = JSON.parse(raw) as SavedItem[];
    return Object.fromEntries(items.filter((i) => i.id).map((i) => [i.id, i]));
  } catch {
    return {};
  }
};

const saveLayout = (gs: GridStack): void => {
  try {
    const items = (gs.save(false) as GridStackWidget[]).map(({ id, x, y, w, h }) => ({
      id,
      x: x ?? 0,
      y: y ?? 0,
      w: w ?? 1,
      h: h ?? 1,
    }));
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(items));
  } catch {
    /* quota exceeded */
  }
};

const loadVisiblePanels = (): Set<string> => {
  try {
    const raw = localStorage.getItem(VISIBILITY_KEY);
    if (!raw) return new Set(DEFAULT_VISIBLE);
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set(DEFAULT_VISIBLE);
  }
};

const saveVisiblePanels = (ids: Set<string>): void => {
  try {
    localStorage.setItem(VISIBILITY_KEY, JSON.stringify([...ids]));
  } catch {
    /* quota exceeded */
  }
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
/** Escape user-supplied strings before injecting into innerHTML. */
const escapeHTML = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ─── Panel shell ──────────────────────────────────────────────────────────────
const panelHTML = (id: string, title: string, scroll = false): string => `
  <div class="tc-gs-panel${scroll ? ' tc-gs-panel--scroll' : ''}">
    <div class="tc-panel-header">
      <span class="tc-panel-title">${escapeHTML(title)}</span>
      <div class="tc-panel-header-actions">
        <button class="tc-gs-remove-btn" data-panel-id="${id}" title="Remove panel" aria-label="Remove panel">
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
          </svg>
        </button>
        <span class="tc-gs-grip" title="Drag to move" aria-hidden="true">⠿</span>
      </div>
    </div>
    <div class="tc-gs-body" id="gsmount-${id}"></div>
  </div>
`;

// ─── Panel body wrapper ───────────────────────────────────────────────────────
const PanelBody = ({
  children,
  scroll = false,
}: {
  children: React.ReactNode;
  scroll?: boolean;
}) => <div className={`tc-gs-content${scroll ? ' tc-gs-content--scroll' : ''}`}>{children}</div>;

// ─── GridStack options ────────────────────────────────────────────────────────
const GS_OPTS: GridStackOptions = {
  cellHeight: 70,
  margin: 6,
  column: 12,
  minRow: 1,
  animate: true,
  draggable: { handle: '.tc-panel-header' },
  resizable: { handles: 'se' },
  columnOpts: {
    breakpoints: [{ w: 768, c: 1 }],
    layout: 'list',
  },
};

// ─── Props ────────────────────────────────────────────────────────────────────
interface DashboardGridProps {
  filteredTrades: Trade[];
  hasData: boolean;
  hasQueried: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────
const DashboardGrid = ({ filteredTrades, hasData, hasQueried }: DashboardGridProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const gsRef = useRef<GridStack | null>(null);

  const [gsKey, setGsKey] = useState(0);
  const [gsReady, setGsReady] = useState(false);
  const [mounts, setMounts] = useState<Map<string, HTMLElement>>(new Map());
  const [visiblePanelIds, setVisiblePanelIds] = useState<Set<string>>(loadVisiblePanels);
  const onRemovePanelRef = useRef<(id: string) => void>(() => {});
  // Loaded once per GridStack init (gsKey change) so sync effect doesn't hit localStorage repeatedly.
  const savedPositionsRef = useRef<Record<string, SavedItem>>({});

  const stats = useMemo(() => computeTradeStats(filteredTrades), [filteredTrades]);

  // ── 1. Initialise GridStack once ──────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    el.innerHTML = '';

    GridStack.renderCB = (mountEl, w) => {
      if (mountEl && w?.content) mountEl.innerHTML = w.content;
    };

    const gs = GridStack.init(GS_OPTS, el);
    gs.on('change', () => saveLayout(gs));

    // Event delegation for the bin button inside each panel header
    const onRemoveClick = (e: MouseEvent) => {
      const btn = (e.target as Element).closest<HTMLElement>('.tc-gs-remove-btn');
      if (btn?.dataset.panelId) onRemovePanelRef.current(btn.dataset.panelId);
    };
    el.addEventListener('click', onRemoveClick);

    const checkMobile = () => gs.setStatic(window.innerWidth < 768);
    window.addEventListener('resize', checkMobile, { passive: true });
    checkMobile();

    savedPositionsRef.current = loadSavedPositions();
    gsRef.current = gs;
    setGsReady(true);

    return () => {
      el.removeEventListener('click', onRemoveClick);
      window.removeEventListener('resize', checkMobile);
      gs.destroy(false);
      gsRef.current = null;
      setGsReady(false);
      setMounts(new Map());
    };
  }, [gsKey]);

  // ── 2. Sync visible panels into GridStack ──────────────────────────────────
  useEffect(() => {
    if (!gsReady || !gsRef.current || !containerRef.current) return;
    const gs = gsRef.current;
    const container = containerRef.current;
    const saved = savedPositionsRef.current;

    gs.batchUpdate(true);
    for (const panel of ALL_PANELS) {
      const exists = !!container.querySelector(`[gs-id="${panel.id}"]`);
      const shouldExist = visiblePanelIds.has(panel.id);

      if (shouldExist && !exists) {
        const sp = saved[panel.id];
        gs.addWidget({
          id: panel.id,
          w: sp?.w ?? panel.w,
          h: sp?.h ?? panel.h,
          x: sp?.x ?? panel.x,
          y: sp?.y ?? panel.y,
          autoPosition: !sp && panel.x === undefined,
          sizeToContent: panel.sizeToContent ?? false,
          content: panelHTML(panel.id, panel.title, panel.scroll),
        });
      } else if (!shouldExist && exists) {
        const itemEl = container.querySelector<GridItemHTMLElement>(`[gs-id="${panel.id}"]`);
        if (itemEl) gs.removeWidget(itemEl, true);
      }
    }
    gs.batchUpdate(false);

    // Rebuild mount map from current DOM state
    const newMounts = new Map<string, HTMLElement>();
    for (const panel of ALL_PANELS) {
      if (visiblePanelIds.has(panel.id)) {
        const mountEl = container.querySelector<HTMLElement>(`#gsmount-${panel.id}`);
        if (mountEl) newMounts.set(panel.id, mountEl);
      }
    }
    setMounts(newMounts);
  }, [gsReady, visiblePanelIds]);

  // ── 3. Auto-size heights after portals paint ───────────────────────────────
  useEffect(() => {
    if (!gsReady || !gsRef.current || !containerRef.current) return;
    const gs = gsRef.current;
    const container = containerRef.current;

    const CHART_IDS = CHART_PANELS.map((p) => p.id);

    const resize = () => {
      container
        .querySelectorAll<GridItemHTMLElement>('[gs-id^="metric-"]')
        .forEach((el) => gs.resizeToContent(el));
      CHART_IDS.forEach((id) => {
        const el = container.querySelector<GridItemHTMLElement>(`[gs-id="${id}"]`);
        if (el) gs.resizeToContent(el);
      });
    };

    const rafId = requestAnimationFrame(resize);

    // Re-size chart panels whenever their content changes height (e.g. pagination, data load).
    const ros: ResizeObserver[] = [];
    CHART_IDS.forEach((id) => {
      const mountEl = container.querySelector<HTMLElement>(`#gsmount-${id}`);
      if (!mountEl) return;
      const ro = new ResizeObserver(() => {
        const itemEl = container.querySelector<GridItemHTMLElement>(`[gs-id="${id}"]`);
        if (itemEl) gs.resizeToContent(itemEl);
      });
      ro.observe(mountEl);
      ros.push(ro);
    });

    return () => {
      cancelAnimationFrame(rafId);
      ros.forEach((ro) => ro.disconnect());
    };
  }, [gsReady, hasData, mounts]);

  // ── Toggle handler ─────────────────────────────────────────────────────────
  const handleToggle = useCallback((panelId: string) => {
    setVisiblePanelIds((prev) => {
      const next = new Set(prev);
      if (next.has(panelId)) next.delete(panelId);
      else next.add(panelId);
      saveVisiblePanels(next);
      return next;
    });
  }, []);

  // Keep the ref in sync so the event delegation in the init effect can call it
  // without creating a stale closure over the original handleToggle.
  onRemovePanelRef.current = handleToggle;

  const handleToggleSection = useCallback((panelIds: string[], checkAll: boolean) => {
    setVisiblePanelIds((prev) => {
      const next = new Set(prev);
      if (checkAll) panelIds.forEach((id) => next.add(id));
      else panelIds.forEach((id) => next.delete(id));
      saveVisiblePanels(next);
      return next;
    });
  }, []);

  // ── Apply preset or reset ──────────────────────────────────────────────────
  const onApplyPreset = useCallback((presetId: string | null) => {
    localStorage.removeItem(LAYOUT_KEY);
    localStorage.removeItem(VISIBILITY_KEY);
    if (presetId) {
      const preset = LAYOUT_PRESETS.find((p) => p.id === presetId);
      if (preset) {
        const positions = Object.entries(preset.positions).map(([id, pos]) => ({ id, ...pos }));
        localStorage.setItem(LAYOUT_KEY, JSON.stringify(positions));
        localStorage.setItem(VISIBILITY_KEY, JSON.stringify(preset.visible));
        setVisiblePanelIds(new Set(preset.visible));
      } else {
        setVisiblePanelIds(new Set(DEFAULT_VISIBLE));
      }
    } else {
      setVisiblePanelIds(new Set(DEFAULT_VISIBLE));
    }
    setGsKey((k) => k + 1);
  }, []);

  // ── Panel content renderer ─────────────────────────────────────────────────
  const renderContent = (panelId: string): React.ReactNode => {
    if (!hasData) return <PanelPlaceholder searched={hasQueried} />;

    switch (panelId) {
      case 'equity':
        return (
          <Suspense fallback={<PanelPlaceholder />}>
            <EquityCurveChart stats={stats} />
          </Suspense>
        );
      case 'symbol':
        return (
          <Suspense fallback={<PanelPlaceholder />}>
            <PnlBySymbolChart trades={filteredTrades} />
          </Suspense>
        );
      case 'calendar':
        return (
          <Suspense fallback={<PanelPlaceholder />}>
            <PnlCalendar trades={filteredTrades} />
          </Suspense>
        );
      case 'session':
        return (
          <Suspense fallback={<PanelPlaceholder />}>
            <PnlBySessionChart stats={stats} />
          </Suspense>
        );
      case 'winrate-by-hour':
        return (
          <Suspense fallback={<PanelPlaceholder />}>
            <WinRateByHourChart trades={filteredTrades} />
          </Suspense>
        );
      case 'pnl-by-weekday':
        return (
          <Suspense fallback={<PanelPlaceholder />}>
            <PnlByWeekdayChart trades={filteredTrades} />
          </Suspense>
        );
      case 'winrate-by-weekday':
        return (
          <Suspense fallback={<PanelPlaceholder />}>
            <WinRateByWeekdayChart trades={filteredTrades} />
          </Suspense>
        );
      case 'pnl-by-hour':
        return (
          <Suspense fallback={<PanelPlaceholder />}>
            <PnlByHourChart trades={filteredTrades} />
          </Suspense>
        );
      case 'history':
        return (
          <Suspense fallback={<PanelPlaceholder />}>
            <TradeList trades={filteredTrades} />
          </Suspense>
        );
      default:
        return <MetricPanel panelId={panelId} stats={stats} />;
    }
  };

  // ── Filter bar data ────────────────────────────────────────────────────────
  const filterPanels = useMemo<FilterPanelDef[]>(
    () => ALL_PANELS.map(({ id, title, section }) => ({ id, title, section })),
    []
  );

  return (
    <div className="tc-gs-wrapper">
      <FilterBar
        panels={filterPanels}
        visible={visiblePanelIds}
        onToggle={handleToggle}
        onToggleSection={handleToggleSection}
        onApplyPreset={onApplyPreset}
      />

      {/* GridStack manages this div — React must not render children here directly */}
      <div ref={containerRef} className="grid-stack" />

      {/* Portals render React content into GridStack-managed mount points */}
      {Array.from(mounts.entries()).map(([panelId, mountEl]) => {
        const def = ALL_PANELS.find((p) => p.id === panelId);
        return createPortal(
          <PanelBody scroll={def?.scroll}>{renderContent(panelId)}</PanelBody>,
          mountEl,
          panelId
        );
      })}
    </div>
  );
};

export default DashboardGrid;
