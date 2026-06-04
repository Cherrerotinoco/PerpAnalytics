import { memo, useState, useEffect, useCallback, useRef } from 'react';
import { CgFilters, CgChevronDown, CgCheck, CgClose } from 'react-icons/cg';
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
  onToggleSection: (panelIds: string[], checkAll: boolean) => void;
  onApplyPreset: (presetId: string | null) => void;
}

// ─── Section metadata ─────────────────────────────────────────────────────────
const SECTIONS: { id: PanelSection; label: string }[] = [
  { id: 'charts',      label: 'Charts' },
  { id: 'performance', label: 'Performance' },
  { id: 'risk',        label: 'Risk & Drawdown' },
  { id: 'trades',      label: 'Trades' },
];

// ─── Desktop dropdown ─────────────────────────────────────────────────────────
const SectionDropdown = memo(({
  section, panels, visible, isOpen, onToggleOpen, onToggle, onToggleSection,
}: {
  section: typeof SECTIONS[number];
  panels: FilterPanelDef[];
  visible: Set<string>;
  isOpen: boolean;
  onToggleOpen: () => void;
  onToggle: (id: string) => void;
  onToggleSection: (ids: string[], checkAll: boolean) => void;
}) => {
  const visibleCount = panels.filter((p) => visible.has(p.id)).length;
  const allChecked   = visibleCount === panels.length;
  const isFiltered   = visibleCount < panels.length;

  return (
    <div className="tc-filter-dropdown">
      <button
        type="button"
        className={`tc-filter-btn${isFiltered ? ' tc-filter-btn--filtered' : ''}`}
        onClick={onToggleOpen}
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <span>{section.label}</span>
        <span className="tc-filter-count" title={`${visibleCount} of ${panels.length} shown`}>
          {visibleCount}/{panels.length}
        </span>
        <CgChevronDown
          aria-hidden="true"
          className={`tc-filter-chevron${isOpen ? ' tc-filter-chevron--open' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="tc-filter-menu" role="listbox" aria-multiselectable="true" aria-label={section.label}>
          <button
            type="button"
            className="tc-filter-menu-item tc-filter-menu-item--check-all"
            onClick={() => onToggleSection(panels.map((p) => p.id), !allChecked)}
          >
            <span className="tc-filter-menu-check" aria-hidden="true">
              {allChecked && <CgCheck />}
            </span>
            {allChecked ? 'Uncheck all' : 'Check all'}
          </button>
          <div className="tc-filter-menu-divider" />
          {panels.map((panel) => {
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
});

// ─── Off-canvas (mobile) ──────────────────────────────────────────────────────
const OffCanvas = memo(({
  panels, visible, onToggle, onToggleSection, onApplyPreset, onClose,
}: {
  panels: FilterPanelDef[];
  visible: Set<string>;
  onToggle: (id: string) => void;
  onToggleSection: (ids: string[], checkAll: boolean) => void;
  onApplyPreset: (id: string | null) => void;
  onClose: () => void;
}) => {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    // Prevent body scroll while open
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <div className="tc-offcanvas-backdrop" onClick={onClose} aria-hidden="true" />

      {/* Drawer */}
      <div className="tc-offcanvas" role="dialog" aria-modal="true" aria-label="Dashboard filters">
        {/* Header */}
        <div className="tc-offcanvas-header">
          <span className="tc-offcanvas-title">Filter &amp; Layout</span>
          <button type="button" className="tc-offcanvas-close" onClick={onClose} aria-label="Close">
            <CgClose />
          </button>
        </div>

        {/* Body */}
        <div className="tc-offcanvas-body">
          {SECTIONS.map((section) => {
            const sectionPanels = panels.filter((p) => p.section === section.id);
            if (!sectionPanels.length) return null;
            const visibleCount = sectionPanels.filter((p) => visible.has(p.id)).length;
            const allChecked   = visibleCount === sectionPanels.length;

            return (
              <div key={section.id} className="tc-offcanvas-section">
                <div className="tc-offcanvas-section-header">
                  <span className="tc-offcanvas-section-title">{section.label}</span>
                  <button
                    type="button"
                    className="tc-offcanvas-check-all"
                    onClick={() => onToggleSection(sectionPanels.map((p) => p.id), !allChecked)}
                  >
                    {allChecked ? 'Uncheck all' : 'Check all'}
                  </button>
                </div>
                <div className="tc-offcanvas-items">
                  {sectionPanels.map((panel) => {
                    const checked = visible.has(panel.id);
                    return (
                      <button
                        key={panel.id}
                        type="button"
                        className={`tc-offcanvas-item${checked ? ' tc-offcanvas-item--checked' : ''}`}
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
              </div>
            );
          })}

          {/* Layout presets */}
          <div className="tc-offcanvas-section">
            <div className="tc-offcanvas-section-header">
              <span className="tc-offcanvas-section-title">Layout</span>
            </div>
            <div className="tc-offcanvas-items">
              {LAYOUT_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className="tc-offcanvas-item"
                  onClick={() => { onApplyPreset(preset.id); onClose(); }}
                >
                  {preset.label}
                </button>
              ))}
              <div className="tc-filter-menu-divider" style={{ margin: '4px 0' }} />
              <button
                type="button"
                className="tc-offcanvas-item tc-offcanvas-item--muted"
                onClick={() => { onApplyPreset(null); onClose(); }}
              >
                ↺ Reset to default
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
});

// ─── Main component ───────────────────────────────────────────────────────────
export const FilterBar = memo(({ panels, visible, onToggle, onToggleSection, onApplyPreset }: FilterBarProps) => {
  const [openSection, setOpenSection] = useState<PanelSection | null>(null);
  const [presetOpen,  setPresetOpen]  = useState(false);
  const [canvasOpen,  setCanvasOpen]  = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  // Close desktop dropdowns on outside click
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

  // Count of hidden panels across all sections (for the mobile badge)
  const hiddenCount = panels.filter((p) => !visible.has(p.id)).length;

  return (
    <>
      {/* ── Desktop filter bar ── */}
      <div className="tc-filter-bar" ref={barRef} role="toolbar" aria-label="Dashboard filters">
        <span className="tc-filter-icon">
          <CgFilters aria-hidden="true" />
        </span>

        <div className="tc-filter-sections">
          {SECTIONS.map((section) => {
            const sectionPanels = panels.filter((p) => p.section === section.id);
            if (!sectionPanels.length) return null;
            return (
              <SectionDropdown
                key={section.id}
                section={section}
                panels={sectionPanels}
                visible={visible}
                isOpen={openSection === section.id}
                onToggleOpen={() => toggleSection(section.id)}
                onToggle={onToggle}
                onToggleSection={onToggleSection}
              />
            );
          })}
        </div>

        {/* Layout preset dropdown */}
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

      {/* ── Mobile trigger button ── */}
      <button
        type="button"
        className="tc-filter-mobile-btn"
        onClick={() => setCanvasOpen(true)}
        aria-label="Open filters"
      >
        <CgFilters aria-hidden="true" />
        <span>Filters &amp; Layout</span>
        {hiddenCount > 0 && (
          <span className="tc-filter-mobile-badge">{hiddenCount} hidden</span>
        )}
      </button>

      {/* ── Off-canvas ── */}
      {canvasOpen && (
        <OffCanvas
          panels={panels}
          visible={visible}
          onToggle={onToggle}
          onToggleSection={onToggleSection}
          onApplyPreset={onApplyPreset}
          onClose={() => setCanvasOpen(false)}
        />
      )}
    </>
  );
});
