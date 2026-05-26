import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { BrowserRouter } from 'react-router-dom';

import './index.css';

// Canonical URL — set once at startup using the real deployed origin so the
// Content-Security-Policy can stay tight (no 'unsafe-inline' needed).
const _canonical = document.createElement('link');
_canonical.rel = 'canonical';
_canonical.href = window.location.origin + '/';
document.head.appendChild(_canonical);

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
