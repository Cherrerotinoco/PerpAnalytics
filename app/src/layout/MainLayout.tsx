import Header from './header/header';
import { ReactNode } from 'react';

export default function MainLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className="min-vh-100 d-flex flex-column"
      style={{ backgroundColor: 'var(--tc-bg)', color: 'var(--tc-text)' }}
    >
      <Header />
      <main className="flex-fill p-3" style={{ position: 'relative' }}>
        {children}
      </main>
      <footer
        style={{
          backgroundColor: 'var(--tc-surface)',
          borderTop: '1px solid var(--tc-border)',
          padding: '1.5rem 0',
          textAlign: 'center',
        }}
      >
        <p className="mb-1" style={{ fontSize: '0.82rem', color: 'var(--tc-text)', fontWeight: 600 }}>
          PerpsAnalytics
        </p>
        <p className="mb-2" style={{ fontSize: '0.75rem', color: 'var(--tc-muted)' }}>
          Quantitative trade analytics for Solana perpetuals.
        </p>
        <p className="mb-1" style={{ fontSize: '0.72rem', color: 'var(--tc-muted)' }}>
          ☕ Donations in SOL are welcome
        </p>
        <code
          style={{
            fontSize: '0.7rem',
            color: 'var(--tc-amber)',
            wordBreak: 'break-all',
            cursor: 'pointer',
          }}
          title="Click to copy"
          onClick={() => navigator.clipboard.writeText('BzPG6Mwpgbh9AGLUuJkqUA2HBmLQhe3mHxR5B4tfv42U')}
        >
          BzPG6Mwpgbh9AGLUuJkqUA2HBmLQhe3mHxR5B4tfv42U
        </code>
        <p className="mt-2 mb-0" style={{ fontSize: '0.7rem', color: 'var(--tc-muted)' }}>
          © {new Date().getFullYear()} PerpsAnalytics. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
