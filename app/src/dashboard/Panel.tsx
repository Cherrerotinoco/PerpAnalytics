import type { ReactNode } from 'react';

// ─── Tab row ──────────────────────────────────────────────────────────────────
// Flex row holding one or more panels. Panels stretch to equal height; on narrow
// viewports they wrap and stack automatically (no per-panel media queries).
export const Row = ({ children }: { children: ReactNode }) => (
  <div className="tc-row">{children}</div>
);

// ─── Section heading ──────────────────────────────────────────────────────────
// Full-width subheading used to group related rows within a tab.
export const SectionHeading = ({ children }: { children: ReactNode }) => (
  <h3 className="tc-section-heading">{children}</h3>
);

// ─── Static panel card ────────────────────────────────────────────────────────
// `grow` is the flex-grow weight relative to siblings in the same Row (e.g. 8 + 4
// → a 2:1 split). `centered` vertically centres the body when the card is taller
// than its content (because a sibling in the row is taller).
interface PanelProps {
  title?: string;
  grow?: number;
  minWidth?: number;
  centered?: boolean;
  children: ReactNode;
}

const Panel = ({ title, grow = 1, minWidth = 280, centered = false, children }: PanelProps) => (
  <div className="tc-panel-card" style={{ flex: `${grow} 1 0`, minWidth }}>
    {title && (
      <div className="tc-panel-header">
        <span className="tc-panel-title">{title}</span>
      </div>
    )}
    <div className={`tc-panel-body${centered ? ' tc-panel-body--centered' : ''}`}>{children}</div>
  </div>
);

export default Panel;
