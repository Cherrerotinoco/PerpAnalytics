import { useState, useMemo, useCallback, lazy, Suspense } from 'react';
import { Layout, Model } from 'flexlayout-react';
import type { TabNode, IJsonModel } from 'flexlayout-react';
import 'flexlayout-react/style/dark.css';

import { Trade } from '../../types/tradeTypes';
import { computeTradeStats, PerformanceSection, RiskSection, TradesSection } from './panels/statistics';
import { PanelPlaceholder } from './PanelPlaceholder';

const EquityCurveChart = lazy(() => import('./panels/equityCurveChart'));
const PnlCalendar = lazy(() => import('./panels/pnlCalendar'));
const PnlBySymbolChart = lazy(() => import('./panels/pnlBySymbolChart'));
const TradeList = lazy(() => import('./panels/tradeList'));

// ─── Persistence ──────────────────────────────────────────────────────────────
const LAYOUT_KEY = 'tc:flexlayout-v4';

// ┌────────────────────────┬──────────┬─────────────┬──────────────────┐
// │ Equity Curve  (w:40)   │ Trades   │ Performance │ Risk & Drawdown  │
// │ PnL Calendar           │ (w:20)   │ (w:20)      │ (w:20)           │
// │ PnL by Symbol          │          │             │                  │
// ├────────────────────────┴──────────┴─────────────┴──────────────────┤
// │                      Trade History  (w:40)                         │
// └────────────────────────────────────────────────────────────────────┘
const DEFAULT_LAYOUT: IJsonModel = {
  global: {
    tabEnableClose: false,
    tabEnablePopout: false,
    tabSetMinHeight: 80,
    tabSetMinWidth: 80,
    rootOrientationVertical: true,
  },
  borders: [],
  layout: {
    type: 'column',
    children: [
      {
        type: 'row',
        weight: 60,
        children: [
          {
            type: 'tabset',
            weight: 40,
            children: [
              { type: 'tab', name: 'Equity Curve', component: 'equity' },
              { type: 'tab', name: 'PnL Calendar', component: 'calendar' },
              { type: 'tab', name: 'PnL by Symbol', component: 'symbol' },
            ],
          },
          {
            type: 'tabset',
            weight: 20,
            children: [{ type: 'tab', name: 'Trades', component: 'trades' }],
          },
          {
            type: 'tabset',
            weight: 20,
            children: [{ type: 'tab', name: 'Performance', component: 'performance' }],
          },
          {
            type: 'tabset',
            weight: 20,
            children: [{ type: 'tab', name: 'Risk & Drawdown', component: 'risk' }],
          },
        ],
      },
      {
        type: 'tabset',
        weight: 40,
        children: [{ type: 'tab', name: 'Trade History', component: 'history' }],
      },
    ],
  },
};

const loadModel = (): Model => {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (raw) {
      const m = Model.fromJson(JSON.parse(raw));
      m.setSplitterSize(4);
      return m;
    }
  } catch { /* ignore corrupt data */ }
  const m = Model.fromJson(DEFAULT_LAYOUT);
  m.setSplitterSize(4);
  return m;
};

const saveModel = (model: Model): void => {
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(model.toJson()));
  } catch { /* quota exceeded */ }
};

// ─── Shared panel shell ────────────────────────────────────────────────────────
// FlexLayout provides the tab header — panels only render their body content.
const PanelShell = ({ children, scroll = false }: { children: React.ReactNode; scroll?: boolean }) => (
  <div className={scroll ? 'tc-fl-panel tc-fl-panel--scroll' : 'tc-fl-panel'}>
    {children}
  </div>
);

// ─── Individual panel components ───────────────────────────────────────────────
interface CommonProps { hasData: boolean; hasQueried: boolean }
interface TradeProps extends CommonProps { trades: Trade[] }
interface StatsProps extends CommonProps { stats: ReturnType<typeof computeTradeStats> }

const EquityPanel = ({ hasData, hasQueried, trades }: TradeProps) => (
  <PanelShell>
    {hasData
      ? <Suspense fallback={<PanelPlaceholder />}><EquityCurveChart trades={trades} /></Suspense>
      : <PanelPlaceholder searched={hasQueried} />}
  </PanelShell>
);

const PerformancePanel = ({ hasData, hasQueried, stats }: StatsProps) => (
  <PanelShell scroll>
    {hasData ? <PerformanceSection stats={stats} /> : <PanelPlaceholder searched={hasQueried} />}
  </PanelShell>
);

const RiskPanel = ({ hasData, hasQueried, stats }: StatsProps) => (
  <PanelShell scroll>
    {hasData ? <RiskSection stats={stats} /> : <PanelPlaceholder searched={hasQueried} />}
  </PanelShell>
);

const TradesPanel = ({ hasData, hasQueried, stats }: StatsProps) => (
  <PanelShell scroll>
    {hasData ? <TradesSection stats={stats} /> : <PanelPlaceholder searched={hasQueried} />}
  </PanelShell>
);

const CalendarPanel = ({ hasData, hasQueried, trades }: TradeProps) => (
  <PanelShell scroll>
    {hasData
      ? <Suspense fallback={<PanelPlaceholder />}><PnlCalendar trades={trades} /></Suspense>
      : <PanelPlaceholder searched={hasQueried} />}
  </PanelShell>
);

const SymbolPanel = ({ hasData, hasQueried, trades }: TradeProps) => (
  <PanelShell>
    {hasData
      ? <Suspense fallback={<PanelPlaceholder />}><PnlBySymbolChart trades={trades} /></Suspense>
      : <PanelPlaceholder searched={hasQueried} />}
  </PanelShell>
);

const HistoryPanel = ({ hasData, hasQueried, trades }: TradeProps) => (
  <PanelShell scroll>
    {hasData
      ? <Suspense fallback={<PanelPlaceholder />}><TradeList trades={trades} /></Suspense>
      : <PanelPlaceholder searched={hasQueried} />}
  </PanelShell>
);

// ─── Dashboard ─────────────────────────────────────────────────────────────────
interface DashboardGridProps {
  filteredTrades: Trade[];
  hasData: boolean;
  hasQueried: boolean;
}

const DashboardGrid = ({ filteredTrades, hasData, hasQueried }: DashboardGridProps) => {
  const [model] = useState<Model>(loadModel);
  const stats = useMemo(() => computeTradeStats(filteredTrades), [filteredTrades]);

  const onModelChange = useCallback(() => saveModel(model), [model]);

  const factory = useCallback((node: TabNode): React.ReactNode => {
    const c = node.getComponent() ?? '';
    const common: CommonProps = { hasData, hasQueried };
    switch (c) {
      case 'equity': return <EquityPanel      {...common} trades={filteredTrades} />;
      case 'performance': return <PerformancePanel {...common} stats={stats} />;
      case 'risk': return <RiskPanel        {...common} stats={stats} />;
      case 'trades': return <TradesPanel      {...common} stats={stats} />;
      case 'calendar': return <CalendarPanel    {...common} trades={filteredTrades} />;
      case 'symbol': return <SymbolPanel      {...common} trades={filteredTrades} />;
      case 'history': return <HistoryPanel     {...common} trades={filteredTrades} />;
      default: return null;
    }
  }, [hasData, hasQueried, filteredTrades, stats]);

  const onReset = useCallback(() => {
    localStorage.removeItem(LAYOUT_KEY);
    window.location.reload();
  }, []);

  return (
    <div className="tc-dashboard-grid">
      {/* FlexLayout container — must be position:relative with explicit dimensions */}
      <div className="tc-fl-wrap">
        <Layout model={model} factory={factory} onModelChange={onModelChange} />
      </div>

      {/* Toolbar */}
      <div className="tc-dashboard-toolbar">
        <button type="button" className="tc-btn-ghost" onClick={onReset}
          title="Reset panel layout to default">
          ↺ Reset layout
        </button>
      </div>
    </div>
  );
};

export default DashboardGrid;
