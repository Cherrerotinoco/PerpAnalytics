import { useState, useEffect, useCallback } from 'react';
import { Routes, Route } from 'react-router-dom';
import WalletForm from './components/WalletForm';
import MainLayout from './layout/MainLayout';
import CookiePolicyPage from './pages/CookiePolicyPage';
import HomePage from './pages/HomePage';
import CalculatorPage from './pages/CalculatorPage';
import IntradayPage from './pages/IntradayPage';
import { ThemeProvider } from './context/ThemeContext';
import { useCookieConsent } from './hooks/useCookieConsent';
import { isValidWalletAddress } from './utils/platforms';
import {
  loadRecentFomoUsers,
  addRecentFomoUser,
  RECENT_FOMO_USERS_KEY,
  type RecentFomoUser,
} from './utils/recentFomoUsers';

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
      .filter((w): w is string => typeof w === 'string' && isValidWalletAddress(w))
      .slice(0, MAX_RECENT);
  } catch {
    return [];
  }
};

// ─── App ───────────────────────────────────────────────────────────────────────
const App = () => {
  useCookieConsent();

  const [wallet, setWallet] = useState('');
  const [recentWallets, setRecentWallets] = useState<string[]>([]);
  const [recentUsers, setRecentUsers] = useState<RecentFomoUser[]>([]);

  // Load from localStorage after hydration, then keep in sync across tabs
  useEffect(() => {
    setRecentWallets(loadRecentWallets());
    setRecentUsers(loadRecentFomoUsers());
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'recentWallets') {
        setRecentWallets(loadRecentWallets());
      }
      if (e.key === RECENT_FOMO_USERS_KEY) {
        setRecentUsers(loadRecentFomoUsers());
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const addRecentWallet = useCallback((w: string) => {
    if (!w || !isValidWalletAddress(w)) {
      return;
    }
    setRecentWallets((prev) => {
      const next = [w, ...prev.filter((x) => x !== w)].slice(0, MAX_RECENT);
      localStorage.setItem('recentWallets', JSON.stringify(next));
      return next;
    });
  }, []);

  const addRecentUser = useCallback((user: RecentFomoUser) => {
    setRecentUsers((prev) => addRecentFomoUser(prev, user));
  }, []);

  return (
    <ThemeProvider>
      <MainLayout>
        <Routes>
          {/* Landing page */}
          <Route path="/" element={<HomePage />} />

          {/* App — wallet search + dashboard */}
          <Route
            path="/dashboard"
            element={
              <>
                <div className="tc-page-top">
                  <div className="tc-page-intro">
                    <h1 className="tc-page-title">Analyze your perps trades</h1>
                    <p className="tc-page-subtitle">
                      Quantitative statistics for your positions on{' '}
                      <span className="tc-page-highlight">Jupiter Perpetuals</span>,{' '}
                      <span className="tc-page-highlight">Pacifica Finance</span> and{' '}
                      <span className="tc-page-highlight">Hyperliquid</span>.
                    </p>
                  </div>
                </div>
                <WalletForm
                  recentWallets={recentWallets}
                  recentUsers={recentUsers}
                  wallet={wallet}
                  setWallet={setWallet}
                  addRecentWallet={addRecentWallet}
                  addRecentUser={addRecentUser}
                />
              </>
            }
          />

          <Route path="/calculator" element={<CalculatorPage />} />

          <Route path="/intraday" element={<IntradayPage />} />

          <Route path="/cookie-policy" element={<CookiePolicyPage />} />
        </Routes>
      </MainLayout>
    </ThemeProvider>
  );
};

export default App;
