import React from 'react';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom';
import App from './App';
import { SsrSnapshotContext } from './utils/intraday/ssrData';
import type { IntradaySnapshot } from './utils/intraday/types';

/**
 * `initialSnapshot` is only used by /intraday, which the Node server renders per
 * request with live data (see server/intraday/page.ts). Every other route is
 * prerendered at build time and passes nothing, rendering the same empty shell as
 * before.
 */
export const render = (url: string, initialSnapshot: IntradaySnapshot | null = null): string => {
  return renderToString(
    <React.StrictMode>
      <SsrSnapshotContext.Provider value={initialSnapshot}>
        <StaticRouter location={url}>
          <App />
        </StaticRouter>
      </SsrSnapshotContext.Provider>
    </React.StrictMode>
  );
};

// Re-exported so the Node server can run the pipeline from this one bundle
// instead of compiling app code into the server build. The server owns
// persistence and the page cache; this bundle owns fetching and computing.
export { runIntradayServer } from './utils/intraday/serverPull';
export { SSR_SNAPSHOT_GLOBAL } from './utils/intraday/ssrData';
export type { IntradaySnapshot, HistoryRecord } from './utils/intraday/types';
