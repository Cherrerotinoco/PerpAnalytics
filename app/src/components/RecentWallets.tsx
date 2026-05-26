type RecentWalletsProps = {
  wallets: string[];
  onSelect: (wallet: string) => void;
};

const RecentWallets = ({ wallets, onSelect }: RecentWalletsProps) => {
  if (!wallets.length) return null;

  return (
    <div className="d-flex align-items-center gap-2 flex-wrap mb-2">
      <span className="tc-label">Recent</span>
      {wallets.map((wallet, idx) => (
        <button
          key={wallet + idx}
          type="button"
          className="tc-recent-btn"
          onClick={() => onSelect(wallet)}
        >
          {`${wallet.slice(0, 4)}…${wallet.slice(-4)}`}
        </button>
      ))}
    </div>
  );
};

export default RecentWallets;
