import React from 'react';
import { hydrateRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

// Canonical URL — set once at startup using the real deployed origin
const canonical = document.createElement('link');
canonical.rel = 'canonical';
canonical.href = window.location.origin + '/';
document.head.appendChild(canonical);

hydrateRoot(
  document.getElementById('root') as HTMLElement,
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
