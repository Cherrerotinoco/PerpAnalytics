import { useState, useEffect } from 'react';
import WalletForm from './components/walletForm';
import MainLayout from './layout/MainLayout';
import RecentWallets from './components/RecentWallets';
import { ThemeProvider } from './context/ThemeContext';

export default function App() {
  const [wallet, setWallet] = useState('');
  const [recentWallets, setRecentWallets] = useState<string[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem('recentWallets');
    if (stored) {
      try {
        setRecentWallets(JSON.parse(stored));
      } catch {}
    }
  }, []);

  const addRecentWallet = (w: string) => {
    if (!w) {
      return;
    }
    setRecentWallets((prev) => {
      const next = [w, ...prev.filter((x) => x !== w)].slice(0, 5);
      localStorage.setItem('recentWallets', JSON.stringify(next));
      return next;
    });
  };

  return (
    <ThemeProvider>
      <MainLayout>
        {/* ── Page intro + recent wallets (shrink-only above dashboard) ─────── */}
        <div className="tc-page-top">
          <div className="tc-page-intro">
            <h1 className="tc-page-title">Analyze your Solana trades</h1>
            <p className="tc-page-subtitle">
              Quantitative statistics for your positions on{' '}
              <span className="tc-page-highlight">Jupiter Perpetuals</span>{' '}
              and{' '}
              <span className="tc-page-highlight">Pacifica Finance</span>.
            </p>
          </div>
          <RecentWallets wallets={recentWallets} onSelect={(w) => setWallet(w)} />
        </div>

        {/* WalletForm fills remaining height and contains the FlexLayout dashboard */}
        <WalletForm wallet={wallet} setWallet={setWallet} addRecentWallet={addRecentWallet} />
      </MainLayout>
    </ThemeProvider>
  );
}
