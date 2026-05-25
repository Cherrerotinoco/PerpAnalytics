import React, { useState, useEffect } from 'react';
import RecentWallets from './components/RecentWallets';
import WalletForm from './components/walletForm';
import MainLayout from './layout/MainLayout';

export default function App() {
  const [wallet, setWallet] = useState('');
  const [recentWallets, setRecentWallets] = useState<string[]>([]);

  // Cargar wallets recientes de localStorage al montar
  useEffect(() => {
    const stored = localStorage.getItem('recentWallets');
    if (stored) {
      try {
        setRecentWallets(JSON.parse(stored));
      } catch {}
    }
  }, []);

  // Añadir wallet a recientes y guardar en localStorage
  const addRecentWallet = (w: string) => {
    if (!w) {
      return;
    }
    setRecentWallets((prev) => {
      const next = [w, ...prev.filter((x) => x !== w)].slice(0, 3);
      localStorage.setItem('recentWallets', JSON.stringify(next));
      return next;
    });
  };

  return (
    <MainLayout>
      <div className="row justify-content-center mb-4">
        <div className="col-12 col-md-8 text-center">
          <h1 className="display-5 fw-bold mb-2">Trades Terminal</h1>
          <p className="lead">
            Visualize and analyze your <span className="text-primary fw-bold">Jupiter</span> and{' '}
            <span className="text-info fw-bold">Pacifica</span> trades in one place.
          </p>
        </div>
      </div>
      <div className="row justify-content-center">
        <div className="col-12 col-md-8">
          <RecentWallets wallets={recentWallets} onSelect={(w) => setWallet(w)} />
          <WalletForm wallet={wallet} setWallet={setWallet} addRecentWallet={addRecentWallet} />
        </div>
      </div>
    </MainLayout>
  );
}
