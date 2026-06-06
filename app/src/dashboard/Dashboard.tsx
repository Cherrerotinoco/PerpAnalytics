import { useState, useMemo, useCallback, useEffect } from 'react';
import { Trade } from '../types/tradeTypes';
import { computeTradeStats, MetricLabelContext } from './panels/statistics';
import { PanelPlaceholder } from './PanelPlaceholder';
import { TabNav, DASHBOARD_TABS } from './TabNav';
import type { DashboardTab } from './TabNav';
import { TimeframeSelector, DATE_RANGES, presetRange } from './TimeframeSelector';
import type { DateRange } from './TimeframeSelector';
import OverviewTab from './tabs/OverviewTab';
import PerformanceTab from './tabs/PerformanceTab';
import RiskTab from './tabs/RiskTab';
import TradesTab from './tabs/TradesTab';

// ─── URL state helpers ────────────────────────────────────────────────────────
const readTab = (): DashboardTab => {
  if (typeof window === 'undefined') return 'overview';
  const t = new URLSearchParams(window.location.search).get('tab');
  return DASHBOARD_TABS.some((d) => d.id === t) ? (t as DashboardTab) : 'overview';
};

const writeParam = (key: string, value: string, isDefault: boolean): void => {
  const params = new URLSearchParams(window.location.search);
  if (isDefault) params.delete(key);
  else params.set(key, value);
  const qs = params.toString();
  window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
};

// ─── Props ────────────────────────────────────────────────────────────────────
interface DashboardProps {
  filteredTrades: Trade[];
  hasData: boolean;
  hasQueried: boolean;
  startDate: string;
  endDate: string;
  setStartDate: (v: string) => void;
  setEndDate: (v: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────
const Dashboard = ({
  filteredTrades,
  hasData,
  hasQueried,
  startDate,
  endDate,
  setStartDate,
  setEndDate,
}: DashboardProps) => {
  const [activeTab, setActiveTab] = useState<DashboardTab>(readTab);

  // Date-range mode. Read once from URL, falling back to CUSTOM when a date is
  // already present (e.g. shared link) or ALL otherwise.
  const [range, setRange] = useState<DateRange>(() => {
    if (typeof window === 'undefined') return 'ALL';
    const r = new URLSearchParams(window.location.search).get('range');
    if (DATE_RANGES.includes(r as DateRange)) return r as DateRange;
    return startDate || endDate ? 'CUSTOM' : 'ALL';
  });

  const stats = useMemo(() => computeTradeStats(filteredTrades), [filteredTrades]);

  // ── Persist tab + range to URL ────────────────────────────────────────────
  useEffect(() => {
    writeParam('tab', activeTab, activeTab === 'overview');
  }, [activeTab]);

  useEffect(() => {
    writeParam('range', range, range === 'ALL');
  }, [range]);

  const onChangeTab = useCallback((tab: DashboardTab) => setActiveTab(tab), []);

  // Selecting a range preset rewrites the single date filter (WalletForm state).
  const onChangeRange = useCallback(
    (r: DateRange) => {
      setRange(r);
      if (r === 'CUSTOM') return; // keep existing dates, just reveal inputs
      const { start, end } = presetRange(r); // ALL → empty strings (clears filter)
      setStartDate(start);
      setEndDate(end);
    },
    [setStartDate, setEndDate]
  );

  const renderTab = () => {
    if (!hasData) return <PanelPlaceholder searched={hasQueried} />;
    switch (activeTab) {
      case 'performance':
        return <PerformanceTab stats={stats} trades={filteredTrades} />;
      case 'risk':
        return <RiskTab stats={stats} trades={filteredTrades} />;
      case 'trades':
        return <TradesTab stats={stats} trades={filteredTrades} />;
      default:
        return <OverviewTab stats={stats} trades={filteredTrades} />;
    }
  };

  return (
    <div className="tc-dash">
      <div className="tc-dash-toolbar">
        <TabNav active={activeTab} onChange={onChangeTab} />
        <div className="tc-dash-daterange">
          <TimeframeSelector value={range} onChange={onChangeRange} />
          {range === 'CUSTOM' && (
            <div className="tc-dash-custom-dates">
              <input
                type="date"
                aria-label="From"
                className="tc-input tc-date-input"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
              <span className="tc-dash-date-sep">—</span>
              <input
                type="date"
                aria-label="To"
                className="tc-input tc-date-input"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          )}
        </div>
      </div>

      <MetricLabelContext.Provider value={true}>{renderTab()}</MetricLabelContext.Provider>
    </div>
  );
};

export default Dashboard;
