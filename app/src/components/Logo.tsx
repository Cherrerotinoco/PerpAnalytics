/**
 * PerpAnalytics logo — three ascending bars (rising bar chart) + wordmark.
 * Uses CSS custom properties so it adapts to both dark and light themes.
 */
export default function Logo() {
  return (
    <div className="tc-logo-wrap">
      {/* ── Icon ──────────────────────────────────────────────────────────── */}
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* Three ascending bars — opacity steps create a depth effect */}
        <rect x="1"  y="15" width="6" height="8"  rx="1.5" fill="var(--tc-accent)" opacity="0.35" />
        <rect x="9"  y="8"  width="6" height="15" rx="1.5" fill="var(--tc-accent)" opacity="0.65" />
        <rect x="17" y="2"  width="6" height="21" rx="1.5" fill="var(--tc-accent)" />
      </svg>

      {/* ── Wordmark ──────────────────────────────────────────────────────── */}
      <span className="tc-logo-text">
        Perp<span className="tc-logo-accent">Analytics</span>
      </span>
    </div>
  );
}
