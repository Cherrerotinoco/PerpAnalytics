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
        {/* ── Page intro ─────────────────────────────────────────────────── */}
        <div style={{ marginBottom: '1.25rem' }}>
          <h1
            style={{
              fontSize: '1.35rem',
              fontWeight: 700,
              letterSpacing: '-0.03em',
              color: 'var(--tc-text)',
              margin: '0 0 0.3rem',
            }}
          >
            Analyze your Solana trades
          </h1>
          <p style={{ fontSize: '0.82rem', color: 'var(--tc-muted)', margin: 0 }}>
            Quantitative statistics for your positions on{' '}
            <span style={{ color: 'var(--tc-text)', fontWeight: 500 }}>Jupiter Perpetuals</span>
            {' '}y{' '}
            <span style={{ color: 'var(--tc-text)', fontWeight: 500 }}>Pacifica Finance</span>.
          </p>
        </div>

        <RecentWallets wallets={recentWallets} onSelect={(w) => setWallet(w)} />
        <WalletForm wallet={wallet} setWallet={setWallet} addRecentWallet={addRecentWallet} />
      </MainLayout>
    </ThemeProvider>
  );
}
