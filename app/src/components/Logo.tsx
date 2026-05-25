/**
 * PerpsAnalytics logo — inline SVG icon + wordmark.
 * Uses CSS custom properties so it adapts to both dark and light themes.
 */
export default function Logo() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
      {/* ── Icon ──────────────────────────────────────────────────────────── */}
      <svg
        width="26"
        height="26"
        viewBox="0 0 26 26"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* Terminal window frame */}
        <rect
          x="1"
          y="1"
          width="24"
          height="24"
          rx="4.5"
          stroke="var(--tc-accent)"
          strokeWidth="1.5"
        />

        {/* Title-bar separator */}
        <line
          x1="1"
          y1="8"
          x2="25"
          y2="8"
          stroke="var(--tc-accent)"
          strokeWidth="1"
          opacity="0.35"
        />

        {/* Three window-control dots */}
        <circle cx="4.8" cy="4.5" r="1.05" fill="var(--tc-accent)" />
        <circle cx="8.2" cy="4.5" r="1.05" fill="var(--tc-accent)" opacity="0.5" />
        <circle cx="11.6" cy="4.5" r="1.05" fill="var(--tc-accent)" opacity="0.25" />

        {/* Rising chart line */}
        <polyline
          points="4,20 8.5,15.5 13.5,17 22,10"
          stroke="var(--tc-accent)"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Start & end node dots */}
        <circle cx="4" cy="20" r="1.5" fill="var(--tc-accent)" />
        <circle cx="22" cy="10" r="1.5" fill="var(--tc-accent)" />
      </svg>

      {/* ── Wordmark ──────────────────────────────────────────────────────── */}
      <span
        style={{
          fontSize: '0.92rem',
          fontWeight: 400,
          letterSpacing: '-0.02em',
          color: 'var(--tc-text)',
          userSelect: 'none',
        }}
      >
        Perps
        <span
          style={{
            fontWeight: 800,
            color: 'var(--tc-accent)',
          }}
        >
          Analytics
        </span>
      </span>
    </div>
  );
}
