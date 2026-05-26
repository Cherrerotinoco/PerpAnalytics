import Header from './header/header';
import { ReactNode } from 'react';

export default function MainLayout({ children }: { children: ReactNode }) {
  return (
    <div className="tc-app-root min-vh-100 d-flex flex-column">
      <Header />
      <main className="flex-fill p-3 position-relative">{children}</main>
      <footer className="tc-footer">
        <p className="tc-footer-brand mb-1">PerpsAnalytics</p>
        <p className="tc-footer-sub mb-2">Quantitative trade analytics for Solana perpetuals.</p>
        <p className="tc-footer-sub mb-1">☕ Donations in SOL are welcome</p>
        <code
          className="tc-footer-address"
          title="Click to copy"
          onClick={() =>
            navigator.clipboard
              .writeText('BzPG6Mwpgbh9AGLUuJkqUA2HBmLQhe3mHxR5B4tfv42U')
              .catch(() => {
                // Clipboard API unavailable in non-HTTPS contexts or blocked by browser policy
              })
          }
        >
          BzPG6Mwpgbh9AGLUuJkqUA2HBmLQhe3mHxR5B4tfv42U
        </code>
        <p className="tc-footer-sub mt-2 mb-0">
          © {new Date().getFullYear()} PerpsAnalytics. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
