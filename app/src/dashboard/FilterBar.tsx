import { memo, useState, useEffect, useCallback, useRef } from 'react';
import { CgFilters, CgChevronDown, CgCheck } from 'react-icons/cg';
import type { PanelSection } from './panels/metricPanel';
import { LAYOUT_PRESETS } from './DashboardGrid';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface FilterPanelDef {
  id: string;
  title: string;
  section: PanelSection;
}

interface FilterBarProps {
  panels: FilterPanelDef[];
  visible: Set<string>;
  onToggle: (id: string) => void;
  onApplyPreset: (presetId: string | null) => void;
}

// ─── Section metadata ─────────────────────────────────────────────────────────
const SECTIONS: { id: PanelSection; label: string }[] = [
  { id: 'charts', label: 'Charts' },
  { id: 'performance', label: 'Performance' },
  { id: 'risk', label: 'Risk & Drawdown' },
  { id: 'trades', label: 'Trades' },
];

// ─── Component ────────────────────────────────────────────────────────────────
export const FilterBar = memo(({ panels, visible, onToggle, onApplyPreset }: FilterBarProps) => {
  const [openSection, setOpenSection] = useState<PanelSection | null>(null);
  const [presetOpen, setPresetOpen] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  // Close any open dropdown on outside click
  useEffect(() => {
    if (!openSection && !presetOpen) return;
    const handler = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setOpenSection(null);
        setPresetOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openSection, presetOpen]);

  const toggleSection = useCallback((id: PanelSection) => {
    setOpenSection((prev) => (prev === id ? null : id));
    setPresetOpen(false);
  }, []);

  return (
    <div className="tc-filter-bar" ref={barRef} role="toolbar" aria-label="Dashboard filters">

      {/* Left icon */}
      <span className="tc-filter-icon">
        <CgFilters aria-hidden="true" />
      </span>

      {/* Section dropdowns */}
      <div className="tc-filter-sections">
        {SECTIONS.map((section) => {
          const sectionPanels = panels.filter((p) => p.section === section.id);
          if (sectionPanels.length === 0) return null;

          const visibleCount = sectionPanels.filter((p) => visible.has(p.id)).length;
          const isOpen = openSection === section.id;
          const isFiltered = visibleCount < sectionPanels.length;

          return (
            <div key={section.id} className="tc-filter-dropdown">
              <button
                type="button"
                className={`tc-filter-btn${isFiltered ? ' tc-filter-btn--filtered' : ''}`}
                onClick={() => toggleSection(section.id)}
                aria-expanded={isOpen}
                aria-haspopup="true"
              >
                <span>{section.label}</span>
                <span className="tc-filter-count" title={`${visibleCount} of ${sectionPanels.length} shown`}>
                  {visibleCount}/{sectionPanels.length}
                </span>
                <CgChevronDown
                  aria-hidden="true"
                  className={`tc-filter-chevron${isOpen ? ' tc-filter-chevron--open' : ''}`}
                />
              </button>

              {isOpen && (
                <div className="tc-filter-menu" role="listbox" aria-multiselectable="true" aria-label={section.label}>
                  {sectionPanels.map((panel) => {
                    const checked = visible.has(panel.id);
                    return (
                      <button
                        key={panel.id}
                        type="button"
                        role="option"
                        aria-selected={checked}
                        className={`tc-filter-menu-item${checked ? ' tc-filter-menu-item--checked' : ''}`}
                        onClick={() => onToggle(panel.id)}
                      >
                        <span className="tc-filter-menu-check" aria-hidden="true">
                          {checked && <CgCheck />}
                        </span>
                        {panel.title}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Preset selector — right side, separated by a divider */}
      <div className="tc-filter-reset tc-filter-dropdown">
        <button
          type="button"
          className="tc-filter-btn"
          onClick={() => { setPresetOpen((p) => !p); setOpenSection(null); }}
          aria-expanded={presetOpen}
          aria-haspopup="true"
        >
          <span>Layout</span>
          <CgChevronDown
            aria-hidden="true"
            className={`tc-filter-chevron${presetOpen ? ' tc-filter-chevron--open' : ''}`}
          />
        </button>

        {presetOpen && (
          <div className="tc-filter-menu tc-filter-menu--right" role="listbox" aria-label="Layout presets">
            {LAYOUT_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                role="option"
                aria-selected={false}
                className="tc-filter-menu-item"
                onClick={() => { setPresetOpen(false); onApplyPreset(preset.id); }}
              >
                {preset.label}
              </button>
            ))}
            <div className="tc-filter-menu-divider" />
            <button
              type="button"
              role="option"
              aria-selected={false}
              className="tc-filter-menu-item tc-filter-menu-item--muted"
              onClick={() => { setPresetOpen(false); onApplyPreset(null); }}
            >
              ↺ Reset to default
            </button>
          </div>
        )}
      </div>
    </div>
  );
});
