import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CgGitFork } from 'react-icons/cg';

const SOL_ADDRESS = 'BzPG6Mwpgbh9AGLUuJkqUA2HBmLQhe3mHxR5B4tfv42U';

const Footer = () => {
  const [copied, setCopied] = useState(false);

  const copyAddress = () => {
    navigator.clipboard.writeText(SOL_ADDRESS).catch(() => {
      // Clipboard API unavailable in non-HTTPS contexts
    });
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <footer className="tc-footer">
      <div className="tc-footer-inner">

        {/* ── Three-column body ───────────────────────────────────────────── */}
        <div className="tc-footer-body">

          {/* Brand */}
          <div className="tc-footer-col">
            <Link to="/" className="tc-footer-brand">PerpAnalytics</Link>
            <p className="tc-footer-tagline">
              Quantitative trade analytics<br />for Solana perpetuals.
            </p>
            <a
              href="https://github.com/Cherrerotinoco/PerpAnalytics"
              target="_blank"
              rel="noopener noreferrer"
              className="tc-footer-gh"
            >
              <CgGitFork aria-hidden="true" />
              GitHub
            </a>
          </div>

          {/* Product */}
          <div className="tc-footer-col">
            <p className="tc-footer-col-title">Product</p>
            <nav className="tc-footer-nav">
              <Link to="/dashboard" className="tc-footer-nav-link">Dashboard</Link>
              <Link to="/cookie-policy" className="tc-footer-nav-link">Cookie Policy</Link>
            </nav>
          </div>

          {/* Support */}
          <div className="tc-footer-col">
            <p className="tc-footer-col-title">Support the project</p>
            <p className="tc-footer-donation-text">
              Enjoying the tool? Donations in SOL are welcome.
            </p>
            <button
              type="button"
              className="tc-footer-address"
              onClick={copyAddress}
              title="Click to copy wallet address"
              aria-label="Copy donation wallet address"
            >
              <code className="tc-footer-address-code">{SOL_ADDRESS}</code>
              <span className="tc-footer-copy-badge">
                {copied ? '✓ Copied' : 'Copy'}
              </span>
            </button>
          </div>

        </div>

        {/* ── Bottom bar ──────────────────────────────────────────────────── */}
        <div className="tc-footer-bottom">
          <p className="tc-footer-copyright">
            © {new Date().getFullYear()} PerpAnalytics. All rights reserved.
          </p>
        </div>

      </div>
    </footer>
  );
};

export default Footer;
