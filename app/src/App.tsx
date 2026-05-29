import { useState, useEffect, useCallback } from 'react';
import { Routes, Route } from 'react-router-dom';
import WalletForm from './components/walletForm';
import MainLayout from './layout/MainLayout';
import RecentWallets from './components/RecentWallets';
import CookiePolicyPage from './pages/CookiePolicyPage';
import { ThemeProvider } from './context/ThemeContext';
import { useCookieConsent } from './hooks/useCookieConsent';

const SOLANA_ADDRESS_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const MAX_RECENT = 5;

// ─── localStorage helpers ──────────────────────────────────────────────────────
/** Safely load recent wallets, rejecting any entry that isn't a valid Base58 address. */
const loadRecentWallets = (): string[] => {
  if (typeof window === 'undefined') {
    return [];
  }
  try {
    const raw = localStorage.getItem('recentWallets');
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter((w): w is string => typeof w === 'string' && SOLANA_ADDRESS_REGEX.test(w))
      .slice(0, MAX_RECENT);
  } catch {
    return [];
  }
};

// ─── App ───────────────────────────────────────────────────────────────────────
const App = () => {
  useCookieConsent();

  const [wallet, setWallet] = useState('');
  const [recentWallets, setRecentWallets] = useState<string[]>(loadRecentWallets);

  // Re-sync on storage events so multiple tabs stay consistent
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'recentWallets') {
        setRecentWallets(loadRecentWallets());
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const addRecentWallet = useCallback((w: string) => {
    if (!w || !SOLANA_ADDRESS_REGEX.test(w)) {
      return;
    }
    setRecentWallets((prev) => {
      const next = [w, ...prev.filter((x) => x !== w)].slice(0, MAX_RECENT);
      localStorage.setItem('recentWallets', JSON.stringify(next));
      return next;
    });
  }, []);

  return (
    <ThemeProvider>
      <MainLayout>
        <Routes>
          <Route
            path="/"
            element={
              <>
                {/* ── Page intro + recent wallets (shrink-only above dashboard) ─────── */}
                <div className="tc-page-top">
                  <div className="tc-page-intro">
                    <h1 className="tc-page-title">Analyze your Solana trades</h1>
                    <p className="tc-page-subtitle">
                      Quantitative statistics for your positions on{' '}
                      <span className="tc-page-highlight">Jupiter Perpetuals</span> and{' '}
                      <span className="tc-page-highlight">Pacifica Finance</span>.
                    </p>
                  </div>
                </div>

                {/* WalletForm fills remaining height and contains the FlexLayout dashboard */}
                <WalletForm
                  recentWallets={recentWallets}
                  wallet={wallet}
                  setWallet={setWallet}
                  addRecentWallet={addRecentWallet}
                />
              </>
            }
          />
          <Route path="/cookie-policy" element={<CookiePolicyPage />} />
        </Routes>
      </MainLayout>
    </ThemeProvider>
  );
};

export default App;
