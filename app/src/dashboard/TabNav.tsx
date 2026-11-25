// ─── Tab navigation ───────────────────────────────────────────────────────────
// Presentational only: the owner holds the active id and decides what a change
// means (URL state, scroll position, nothing at all).

export interface TabDef<T extends string> {
  id: T;
  label: string;
}

export type DashboardTab = 'overview' | 'performance' | 'risk' | 'trades' | 'calendar';

export const DASHBOARD_TABS: TabDef<DashboardTab>[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'performance', label: 'Performance' },
  { id: 'risk', label: 'Risk' },
  { id: 'trades', label: 'Trades' },
  { id: 'calendar', label: 'Calendar' },
];

/** `${idPrefix}-tab-${id}` / `${idPrefix}-panel-${id}` tie a tab to its panel. */
export const tabId = (prefix: string, id: string): string => `${prefix}-tab-${id}`;
export const panelId = (prefix: string, id: string): string => `${prefix}-panel-${id}`;

interface TabNavProps<T extends string> {
  tabs: TabDef<T>[];
  active: T;
  onChange: (tab: T) => void;
  /** Namespaces the tab/panel ids so two tablists can share a page. */
  idPrefix: string;
  /** What the tablist is for, since the labels alone do not say. */
  label: string;
}

export const TabNav = <T extends string>({
  tabs,
  active,
  onChange,
  idPrefix,
  label,
}: TabNavProps<T>) => {
  // Arrow keys move between tabs, which is what the tablist role promises. Only
  // the selected tab is tabbable, so Tab leaves the list for the panel instead
  // of walking every tab in it.
  const onKeyDown = (e: React.KeyboardEvent): void => {
    const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const i = tabs.findIndex((t) => t.id === active);
    const next = tabs[(i + delta + tabs.length) % tabs.length];
    onChange(next.id);
    document.getElementById(tabId(idPrefix, next.id))?.focus();
  };

  return (
    <div className="tc-tabs" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
      {tabs.map(({ id, label: text }) => (
        <button
          key={id}
          id={tabId(idPrefix, id)}
          type="button"
          role="tab"
          aria-selected={active === id}
          aria-controls={panelId(idPrefix, id)}
          tabIndex={active === id ? 0 : -1}
          className={`tc-tab${active === id ? ' tc-tab--active' : ''}`}
          onClick={() => onChange(id)}
        >
          {text}
        </button>
      ))}
    </div>
  );
};
