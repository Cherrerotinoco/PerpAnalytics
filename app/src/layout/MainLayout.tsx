import Header from './header/header';
import { ReactNode } from 'react';

export default function MainLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-vh-100 d-flex flex-column bg-light">
      <Header />
      <main className="flex-fill py-4">{children}</main>
      <footer className="bg-dark text-white py-4 mt-auto">
        <div className="container text-center">
          <h5 className="mb-2">TradesConverter</h5>
          <p className="mb-2 text-secondary" style={{ fontSize: '0.85rem' }}>
            Trade analytics for Jupiter Perpetuals and Pacifica Finance on Solana.
          </p>
          <div className="mb-2">
            <a href="#" className="text-white me-3">
              Twitter
            </a>
            <a href="#" className="text-white">
              GitHub
            </a>
          </div>
          <p className="mb-0 small">
            &copy; {new Date().getFullYear()} TradesConverter. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
