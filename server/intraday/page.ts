import fs from 'node:fs';
import path from 'node:path';
import { appendRecord, loadHistory, type PullRecord } from './history.js';

/**
 * Server-rendered /intraday, cached for 15 minutes.
 *
 * The caching rule, in full:
 *
 *   - A cached page is served immediately, always. No request ever waits on a
 *     refresh, not even the one that triggers it.
 *   - When the entry turns 15 minutes old it is NOT dropped. It is marked stale
 *     and keeps being served while the data refreshes behind it.
 *   - The first request to find it stale starts that refresh. Requests arriving
 *     concurrently see one already in flight and do not start a second — they are
 *     served the stale page like everyone else.
 *   - If the refresh fails, the stale entry stays and the next request retries. A
 *     failing upstream costs freshness, never availability.
 *
 * The only request that waits is the first one after boot, when there is nothing
 * to serve at all. `warmUp()` exists so that request is usually not a visitor's.
 */

const TTL_MS = 15 * 60 * 1000;

/** The placeholder both the Vite template and the prerender script leave behind. */
const APP_HTML_PLACEHOLDER = '<!--app-html-->';

interface SsrBundle {
  render: (url: string, snapshot: unknown) => string;
  runIntradayServer: (opts: {
    now?: Date;
    history: PullRecord[];
    cryptogammaToken?: string | null;
  }) => Promise<{
    snapshot: unknown;
    record: PullRecord;
    deduped: boolean;
  }>;
  SSR_SNAPSHOT_GLOBAL: string;
}

interface CacheEntry {
  html: string;
  /** The same data the HTML was built from, served to the refresh button. */
  snapshot: unknown;
  renderedAt: number;
}

let cache: CacheEntry | null = null;
let refreshing: Promise<void> | null = null;

/**
 * Reads the cache through a call rather than touching the variable.
 *
 * `cache` is only ever assigned inside a promise callback, so TypeScript's
 * control-flow analysis cannot see that an awaited refresh filled it: after a
 * `if (!cache)` branch it narrows the variable to `never` for the rest of the
 * function. Going through a function returns the declared type instead.
 */
const readCache = (): CacheEntry | null => cache;

const SSR_DIR = path.resolve(process.cwd(), 'dist-ssr');

let bundle: SsrBundle | null = null;
const loadBundle = async (): Promise<SsrBundle> => {
  // Imported once and kept: it is the whole app, so re-importing per refresh
  // would re-pay the module cost every 15 minutes for nothing.
  bundle ??= (await import(path.join(SSR_DIR, 'entry-server.js'))) as SsrBundle;
  return bundle;
};

let template: string | null = null;
const loadTemplate = (): string => {
  if (template !== null) return template;
  const file = path.join(SSR_DIR, 'intraday-template.html');
  const html = fs.readFileSync(file, 'utf8');
  if (!html.includes(APP_HTML_PLACEHOLDER)) {
    // Fail loudly. A template missing its placeholder would serve a blank page
    // with a 200, which reads as a data problem and is really a build problem.
    throw new Error(`${file} has no ${APP_HTML_PLACEHOLDER} placeholder`);
  }
  template = html;
  return template;
};

/**
 * Serialises the snapshot into the page so hydration reuses it instead of
 * re-fetching everything the server just fetched.
 *
 * `<` and `>` are escaped because `</script>` would break out of the element and
 * `<!--` would open a comment that swallows the rest of the page. The snapshot is
 * machine-built from numeric market data, but it carries upstream strings (venue
 * names, error messages), so it is not treated as trusted input.
 */
const snapshotScript = (globalName: string, snapshot: unknown): string => {
  const json = JSON.stringify(snapshot)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
  return `<script>window.${globalName}=${json}</script>`;
};

/** One full render: pull the data, persist the record, build the HTML. */
const renderPage = async (): Promise<{ html: string; snapshot: unknown }> => {
  const { render, runIntradayServer, SSR_SNAPSHOT_GLOBAL } = await loadBundle();

  let history: PullRecord[] = [];
  try {
    history = await loadHistory();
  } catch (err) {
    // Without history, Rule 7 and the capitulation checklist have nothing to read.
    // That is a degraded page, and still a much better one than no page.
    console.error('[intraday] history read failed, rendering without it:', err);
  }

  // Read here rather than inside the SSR bundle, which must stay free of
  // environment access so the build-time prerender can import it too. Absent
  // token = skew and Vol Lab degrade on their own; the rest of the page is fine.
  const { snapshot, record, deduped } = await runIntradayServer({
    history,
    cryptogammaToken: process.env.CRYPTOGAMMA_TOKEN ?? null,
  });

  if (!deduped) {
    try {
      await appendRecord(history, record);
    } catch (err) {
      // The page is already computed; losing one row of the sequence is not worth
      // failing the request over.
      console.error('[intraday] history write failed:', err);
    }
  }

  const appHtml = render('/intraday', snapshot);
  // Replacer function, not a string: `$&` sequences in the rendered markup would
  // otherwise be treated as replacement patterns.
  const html = loadTemplate().replace(
    APP_HTML_PLACEHOLDER,
    () => appHtml + snapshotScript(SSR_SNAPSHOT_GLOBAL, snapshot)
  );
  return { html, snapshot };
};

/**
 * Starts a refresh unless one is already in flight, and never rejects.
 *
 * Request handlers deliberately ignore the returned promise — the whole point is
 * that nobody waits on it. It is awaited only by `warmUp` and by the cold first
 * request, which have nothing to serve instead.
 */
const refresh = (): Promise<void> => {
  refreshing ??= renderPage()
    .then(({ html, snapshot }) => {
      cache = { html, snapshot, renderedAt: Date.now() };
    })
    .catch((err: unknown) => {
      // The stale entry survives on purpose. The next request retries.
      console.error('[intraday] refresh failed, keeping the cached page:', err);
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
};

export interface PageResult {
  html: string;
  /** Age of the served page in ms. Surfaced as a response header for debugging. */
  ageMs: number;
  stale: boolean;
}

export const getIntradayPage = async (): Promise<PageResult> => {
  const hit = readCache();
  if (hit) {
    const ageMs = Date.now() - hit.renderedAt;
    const stale = ageMs >= TTL_MS;
    // Serve now, refresh behind. Not awaited: that is what keeps it instant.
    if (stale) void refresh();
    return { html: hit.html, ageMs, stale };
  }

  // Cold cache: nothing to serve, so this one request does have to wait.
  await refresh();
  const warm = readCache();
  if (!warm) throw new Error('intraday page could not be rendered');
  return { html: warm.html, ageMs: Date.now() - warm.renderedAt, stale: false };
};

export interface SnapshotResult {
  snapshot: unknown;
  /** When the served data was pulled, as an epoch ms — the page's real "as of". */
  renderedAt: number;
  ageMs: number;
  stale: boolean;
}

/**
 * The data behind the page, for the client's refresh button.
 *
 * The button used to re-pull from the browser, where Whale Alert, the skew and
 * Vol Lab are unreachable (CORS, and a token that cannot ship to a client), so
 * "refresh" quietly meant "update two panels and leave three behind". Reading
 * the server's own snapshot refreshes all of them or none.
 *
 * `wait` makes a caller that finds the entry stale await the refresh rather than
 * take the stale one. That costs nothing upstream: `refresh()` dedupes, so
 * concurrent callers share the single render the page would have triggered
 * anyway.
 *
 * There is deliberately no `force`. Bypassing the 15 min cache on demand would
 * put Whale Alert's quota and a paid cryptogamma token behind a button any
 * anonymous visitor can hold down.
 */
export const getIntradaySnapshot = async ({ wait = false } = {}): Promise<SnapshotResult> => {
  const hit = readCache();
  if (hit) {
    if (Date.now() - hit.renderedAt >= TTL_MS) {
      const inFlight = refresh();
      if (wait) await inFlight;
    }
    // Re-read: an awaited refresh has replaced the entry by now.
    const entry = readCache() ?? hit;
    const ageMs = Date.now() - entry.renderedAt;
    return {
      snapshot: entry.snapshot,
      renderedAt: entry.renderedAt,
      ageMs,
      stale: ageMs >= TTL_MS,
    };
  }

  await refresh();
  const warm = readCache();
  if (!warm) throw new Error('intraday snapshot could not be rendered');
  return {
    snapshot: warm.snapshot,
    renderedAt: warm.renderedAt,
    ageMs: Date.now() - warm.renderedAt,
    stale: false,
  };
};

/**
 * Renders the page once at boot, so the first visitor after a deploy gets a cache
 * hit instead of paying for five upstream fetches. Failures are logged and
 * swallowed: a cold cache still works, it is just slower for one request.
 */
export const warmUp = async (): Promise<void> => {
  await refresh();
  if (readCache()) console.log('[intraday] page cache warm');
};
