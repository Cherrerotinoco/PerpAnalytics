import Header from './header/header';
import { Link } from 'react-router-dom';
import { ReactNode } from 'react';

const MainLayout = ({ children }: { children: ReactNode }) => (
  <div className="tc-app-root d-flex flex-column">
    <Header />
    <main>{children}</main>
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
        © {new Date().getFullYear()} PerpAnalytics. All rights reserved.
      </p>
      <p className="tc-footer-links mt-1 mb-0">
        <a
          href="https://github.com/Cherrerotinoco/PerpAnalytics"
          target="_blank"
          rel="noopener noreferrer"
          className="tc-footer-link"
        >
          GitHub
        </a>
        <span className="tc-footer-link-sep">·</span>
        <Link to="/cookie-policy" className="tc-footer-link">Cookie Policy</Link>
      </p>
    </footer>
  </div>
);

export default MainLayout;
