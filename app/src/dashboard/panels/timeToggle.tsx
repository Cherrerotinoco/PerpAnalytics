// ─── Shared Open / Close toggle for time-based charts ─────────────────────────
interface TimeToggleProps {
  useOpen: boolean;
  onChange: (v: boolean) => void;
  axisColor: string;
}

export const TimeToggle = ({ useOpen, onChange, axisColor }: TimeToggleProps) => (
  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
    <div
      style={{
        display: 'flex',
        gap: 2,
        background: 'rgba(255,255,255,0.04)',
        borderRadius: 5,
        padding: 2,
      }}
    >
      {(['Open', 'Close'] as const).map((label) => {
        const active = label === 'Open' ? useOpen : !useOpen;
        return (
          <button
            key={label}
            type="button"
            onClick={() => onChange(label === 'Open')}
            style={{
              background: active ? 'rgba(255,255,255,0.1)' : 'transparent',
              border: 'none',
              borderRadius: 4,
              color: active ? '#e0e0e0' : axisColor,
              fontSize: '0.68rem',
              fontWeight: active ? 600 : 400,
              padding: '2px 8px',
              cursor: 'pointer',
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  </div>
);
