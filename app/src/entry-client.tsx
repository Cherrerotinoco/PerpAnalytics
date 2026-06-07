import React from 'react';
import { hydrateRoot, createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

// Canonical URL — set once at startup using the real deployed origin
const canonical = document.createElement('link');
canonical.rel = 'canonical';
canonical.href = window.location.origin + '/';
document.head.appendChild(canonical);

const rootEl = document.getElementById('root') as HTMLElement;
const app = (
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

// Only hydrate if the server actually rendered HTML into #root.
// In dev mode Vite serves the raw template with no SSR content,
// so hydrateRoot would throw on an empty div.
const hasSSR =
  rootEl.childNodes.length > 0 &&
  Array.from(rootEl.childNodes).some((n) => n.nodeType === Node.ELEMENT_NODE);

if (hasSSR) {
  hydrateRoot(rootEl, app);
} else {
  createRoot(rootEl).render(app);
}
