import type { ReactNode } from 'react';

// ─── Tab row ──────────────────────────────────────────────────────────────────
// Flex row holding one or more panels. Panels stretch to equal height; on narrow
// viewports they wrap and stack automatically (no per-panel media queries).
export const Row = ({ children }: { children: ReactNode }) => (
  <div className="tc-row">{children}</div>
);

// ─── Section heading ──────────────────────────────────────────────────────────
// Full-width subheading used to group related rows within a tab.
//
// h2, directly under the page h1: these head the data itself. The explanatory
// boxes on the intraday page are also h2 but are supporting material, so leaving
// the data at h3 put the page's actual content a level below its own footnotes.
export const SectionHeading = ({ children }: { children: ReactNode }) => (
  <h2 className="tc-section-heading">{children}</h2>
);

// ─── Static panel card ────────────────────────────────────────────────────────
// `grow` is the flex-grow weight relative to siblings in the same Row (e.g. 8 + 4
// → a 2:1 split). `centered` vertically centres the body when the card is taller
// than its content (because a sibling in the row is taller).
interface PanelProps {
  title?: string;
  /** Rendered at the far end of the header — freshness marks, counts, controls. */
  badge?: ReactNode;
  grow?: number;
  minWidth?: number;
  centered?: boolean;
  children: ReactNode;
}

const Panel = ({
  title,
  badge,
  grow = 1,
  minWidth = 280,
  centered = false,
  children,
}: PanelProps) => (
  // min(…, 100%) so the floor never exceeds the space available: a bare 280-320px
  // minimum cannot shrink, and on a 320px phone it pushed the page sideways.
  <div
    className="tc-panel-card"
    style={{ flex: `${grow} 1 0`, minWidth: `min(${minWidth}px, 100%)` }}
  >
    {title && (
      <div className="tc-panel-header">
        <span className="tc-panel-title">{title}</span>
        {badge}
      </div>
    )}
    <div className={`tc-panel-body${centered ? ' tc-panel-body--centered' : ''}`}>{children}</div>
  </div>
);

export default Panel;
