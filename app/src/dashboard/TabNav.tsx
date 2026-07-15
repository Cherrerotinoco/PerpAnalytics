// ─── Dashboard tab navigation ─────────────────────────────────────────────────
export type DashboardTab = 'overview' | 'performance' | 'risk' | 'trades' | 'calendar';

export const DASHBOARD_TABS: { id: DashboardTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'performance', label: 'Performance' },
  { id: 'risk', label: 'Risk' },
  { id: 'trades', label: 'Trades' },
  { id: 'calendar', label: 'Calendar' },
];

interface TabNavProps {
  active: DashboardTab;
  onChange: (tab: DashboardTab) => void;
}

export const TabNav = ({ active, onChange }: TabNavProps) => (
  <div className="tc-tabs" role="tablist">
    {DASHBOARD_TABS.map(({ id, label }) => (
      <button
        key={id}
        type="button"
        role="tab"
        aria-selected={active === id}
        className={`tc-tab${active === id ? ' tc-tab--active' : ''}`}
        onClick={() => onChange(id)}
      >
        {label}
      </button>
    ))}
  </div>
);
