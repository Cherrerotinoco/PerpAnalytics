import { useState, useEffect } from 'react';
import WalletForm from './components/walletForm';
import MainLayout from './layout/MainLayout';
import RecentWallets from './components/recentWallets';
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
        <RecentWallets wallets={recentWallets} onSelect={(w) => setWallet(w)} />
        <WalletForm wallet={wallet} setWallet={setWallet} addRecentWallet={addRecentWallet} />
      </MainLayout>
    </ThemeProvider>
  );
}
