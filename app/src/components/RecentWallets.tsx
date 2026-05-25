type RecentWalletsProps = {
  wallets: string[];
  onSelect: (wallet: string) => void;
};

export default function RecentWallets({ wallets, onSelect }: RecentWalletsProps) {
  if (!wallets.length) {
    return null;
  }
  return (
    <div
      className="d-flex align-items-center gap-2 flex-wrap mb-2"
    >
      <span className="tc-label">Recent</span>
      {wallets.map((wallet, idx) => (
        <button
          key={wallet + idx}
          type="button"
          onClick={() => onSelect(wallet)}
          style={{
            background: 'var(--tc-surface-2)',
            border: '1px solid var(--tc-border)',
            borderRadius: 4,
            color: 'var(--tc-muted)',
            fontSize: '0.72rem',
            padding: '0.15rem 0.6rem',
            cursor: 'pointer',
            fontFamily: 'monospace',
            transition: 'border-color 0.12s, color 0.12s',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--tc-muted)';
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--tc-text)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--tc-border)';
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--tc-muted)';
          }}
        >
          {`${wallet.slice(0, 4)}…${wallet.slice(-4)}`}
        </button>
      ))}
    </div>
  );
}
