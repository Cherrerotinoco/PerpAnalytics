import React from 'react';
import { hydrateRoot, createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { SsrSnapshotContext, takeSsrSnapshot } from './utils/intraday/ssrData';
import './index.css';

// Read before the first render: the hydrated tree has to see the same snapshot the
// server rendered or /intraday mismatches its own markup.
const ssrSnapshot = takeSsrSnapshot();

// No canonical is injected here on purpose.
//
// This used to append one pointing at `origin + '/'`, from before the build
// prerendered a page per route. Every served page now ships its own correct
// canonical — the prerender writes it, and scripts/prerender.ts asserts it — so
// appending another only added a SECOND, wrong one declaring every route to be
// the homepage, which invites search engines to collapse the site onto one URL.
//
// Client-side navigation does not need to maintain it: a crawler requests each
// URL directly and gets that route's prerendered HTML, canonical included.

const rootEl = document.getElementById('root') as HTMLElement;
const app = (
  <React.StrictMode>
    <SsrSnapshotContext.Provider value={ssrSnapshot}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </SsrSnapshotContext.Provider>
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
