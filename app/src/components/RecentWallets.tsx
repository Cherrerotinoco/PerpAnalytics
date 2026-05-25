import React from 'react';

type RecentWalletsProps = {
  wallets: string[];
  onSelect: (wallet: string) => void;
};

export default function RecentWallets({ wallets, onSelect }: RecentWalletsProps) {
  if (!wallets.length) {
    return null;
  }
  return (
    <div className="card mb-3">
      <div className="card-body py-3">
        <h6 className="card-title mb-2 text-uppercase text-secondary fw-semibold small">
          Recent Wallets
        </h6>
        <div className="d-flex flex-wrap gap-2">
          {wallets.map((wallet, idx) => (
            <button
              key={wallet + idx}
              className="btn btn-outline-primary btn-sm rounded-pill px-3"
              onClick={() => onSelect(wallet)}
              type="button"
            >
              {`${wallet.slice(0, 4)}...${wallet.slice(-4)}`}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
