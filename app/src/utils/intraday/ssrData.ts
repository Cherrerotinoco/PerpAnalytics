import { createContext, useContext } from 'react';
import type { IntradaySnapshot } from './types';

/**
 * The snapshot the server rendered the page with.
 *
 * `/intraday` is server-rendered with data and cached for 15 minutes (see
 * server/intraday/page.ts), so the page arrives complete instead of empty with a
 * spinner. The same snapshot is serialised into the HTML and read back here on
 * hydration, which is what stops the client from immediately re-fetching
 * everything the server just fetched — and what keeps the hydrated tree matching
 * the server's markup.
 *
 * `null` means no SSR data: the dev server (no SSR) and the SPA fallback both hit
 * that path, and the page then fetches on mount exactly as it used to.
 */
export const SsrSnapshotContext = createContext<IntradaySnapshot | null>(null);

export const useSsrSnapshot = (): IntradaySnapshot | null => useContext(SsrSnapshotContext);

/** Global the server writes the snapshot to, and the client reads once on boot. */
export const SSR_SNAPSHOT_GLOBAL = '__INTRADAY_SNAPSHOT__';

interface SnapshotWindow {
  [SSR_SNAPSHOT_GLOBAL]?: IntradaySnapshot;
}

/**
 * Reads the serialised snapshot, then deletes the global.
 *
 * Deleting it matters: it is a point-in-time reading, and leaving it around would
 * let a later navigation back to /intraday pick up an arbitrarily old snapshot as
 * if it were fresh.
 */
export const takeSsrSnapshot = (): IntradaySnapshot | null => {
  if (typeof window === 'undefined') return null;
  const w = window as SnapshotWindow;
  const snapshot = w[SSR_SNAPSHOT_GLOBAL] ?? null;
  delete w[SSR_SNAPSHOT_GLOBAL];
  return snapshot;
};
