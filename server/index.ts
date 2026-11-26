import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { getConnInfo } from '@hono/node-server/conninfo';
import fs from 'node:fs';
import path from 'node:path';
import { migrate } from './db/index.js';
import {
  resolveWallets,
  getBudget,
  getDailyUsage,
  isValidHandle,
  BudgetExceededError,
  UpstreamError,
} from './fomoapi/wallets.js';
import { suggestHandles, isValidQuery } from './fomoapi/suggest.js';
import { getIntradayPage, getIntradaySnapshot, warmUp as warmIntraday } from './intraday/page.js';
import {
  clientAddress,
  hashClient,
  requestLimiter,
  RateLimitedError,
  LIMITS,
} from './rateLimit.js';

/**
 * The whole server.
 *
 * It exists for two reasons:
 *   1. the fomoapi key is metered and billed, so it cannot ship to a browser;
 *   2. /intraday is rendered here, because several of its sources cannot be read
 *      from a browser at all — basischarts and Whale Alert send no CORS header,
 *      and the skew and Vol Lab need a token that cannot ship to a client. The
 *      page and its refresh endpoint are both served from the snapshot this
 *      server pulls (intraday/page.ts).
 *
 * Everything else the app needs — Jupiter, Pacifica, Hyperliquid and Binance —
 * is public AND CORS-enabled, so it is called directly from the client and is
 * not proxied here.
 */

const DIST = path.resolve(process.cwd(), 'dist');

const app = new Hono();

// connect-src lists every host the browser itself calls. Jupiter, Pacifica and
// Hyperliquid are public APIs hit directly from the page; only the FOMO handle
// lookup goes through 'self'.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' https://www.googletagmanager.com 'unsafe-inline'",
  // 'unsafe-inline' is required, not lazy: React writes every `style={{…}}` as a
  // style ATTRIBUTE, and CSP blocks those wholesale without it. Dropping it does
  // not fail loudly — the attributes are silently ignored and the element falls
  // back to its stylesheet rule, which is how every Panel lost its grow/minWidth
  // and every gamma-by-expiry bar collapsed to its 1px min-width. Nonces and
  // hashes are not an option here: they do not apply to style attributes.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
  [
    "connect-src 'self' https://perps-api.jup.ag https://api.pacifica.fi",
    'https://api.hyperliquid.xyz',
    // Both are the dashboard's trade chart (TradeModal), called from the
    // visitor's own browser. /intraday's own Binance hosts used to be listed
    // here too; they came out when the page stopped pulling from the browser,
    // because every source it reads is now fetched server-side and reaches the
    // page through 'self'.
    'https://api.binance.com https://api.bybit.com',
    'https://www.google-analytics.com https://analytics.google.com',
  ].join(' '),
  "img-src 'self' data: https://www.google-analytics.com https://www.googletagmanager.com",
  'frame-src https://www.googletagmanager.com',
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': CONTENT_SECURITY_POLICY,
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

/** Render only applies render.yaml headers to static sites, so a web service sets its own. */
app.use('*', async (c, next) => {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    c.header(name, value);
  }
  await next();
});

/** The caller's salted hash, used for quotas without storing any address. */
const clientHashOf = (c: { req: { raw: Request } }): string => {
  let socket: string | null = null;
  try {
    socket = getConnInfo(c as never).remote.address ?? null;
  } catch {
    // No connection info (some adapters); the header path still applies.
  }
  return hashClient(clientAddress(c.req.raw.headers, socket));
};

/**
 * Coarse per-caller ceiling over the whole API. This only stops hammering —
 * the expensive path has its own daily quotas in the resolver.
 */
app.use('/api/*', async (c, next) => {
  const key = clientHashOf(c);
  if (!requestLimiter.take(key)) {
    const retryAfter = requestLimiter.retryAfter(key);
    return c.json({ error: 'rate_limited', retryAfterSeconds: retryAfter }, 429, {
      'Retry-After': String(retryAfter),
    });
  }
  await next();
});

app.get('/api/health', (c) => c.json({ ok: true }));

/**
 * Autocomplete over handles already in the cache.
 *
 * Reads our own table only, so it is free and quota-free — which is what makes
 * it safe to call on every keystroke behind a debounce. It also means the list
 * can only ever contain handles that are free to open.
 */
app.get('/api/fomo/suggest', async (c) => {
  const q = (c.req.query('q') ?? '').trim();
  if (!q) {
    return c.json({ items: [] });
  }
  if (!isValidQuery(q.replace(/^@/, ''))) {
    // Not an error: a half-typed handle should quietly yield nothing.
    return c.json({ items: [] });
  }
  try {
    return c.json({ items: await suggestHandles(q) });
  } catch (err) {
    console.error('[api] suggest failed:', err);
    // Autocomplete is a convenience; never let it break the search box.
    return c.json({ items: [] });
  }
});

/** Operational view of spend and of the caller's remaining daily allowance. */
app.get('/api/fomo/budget', async (c) => {
  try {
    const [budget, usage] = await Promise.all([getBudget(), getDailyUsage(clientHashOf(c))]);
    return c.json({
      ...budget,
      today: {
        global: usage.global,
        globalLimit: LIMITS.globalDaily,
        client: usage.client,
        clientLimit: LIMITS.perClientDaily,
      },
    });
  } catch (err) {
    console.error('[api] budget failed:', err);
    return c.json({ error: 'budget_unavailable' }, 500);
  }
});

/**
 * Resolve a FOMO handle to its wallets. The EVM address is the one that matters
 * downstream: it is the account the trader's perps settle to on Hyperliquid.
 */
app.get('/api/fomo/wallet', async (c) => {
  const handle = (c.req.query('handle') ?? '').trim();
  if (!handle) {
    return c.json({ error: 'missing_handle' }, 400);
  }
  if (!isValidHandle(handle.replace(/^@/, ''))) {
    return c.json({ error: 'invalid_handle' }, 400);
  }

  try {
    const result = await resolveWallets(handle, { clientHash: clientHashOf(c) });
    if (!result.found) {
      return c.json({ error: 'handle_not_found', handle: result.handle }, 404);
    }
    return c.json(result);
  } catch (err) {
    if (err instanceof RateLimitedError) {
      return c.json(
        {
          error: 'rate_limited',
          scope: err.scope,
          message: err.message,
          retryAfterSeconds: err.retryAfterSeconds,
        },
        429,
        { 'Retry-After': String(err.retryAfterSeconds) }
      );
    }
    if (err instanceof BudgetExceededError) {
      console.warn('[api]', err.message);
      return c.json({ error: 'budget_exceeded' }, 429);
    }
    if (err instanceof UpstreamError) {
      // 402 upstream means the fomoapi key itself is out of credits.
      const status = err.status === 402 ? 429 : 502;
      console.error('[api] upstream error:', err.status, err.message);
      return c.json({ error: 'upstream_error', status: err.status }, status);
    }
    console.error('[api] wallet resolve failed:', err);
    return c.json({ error: 'internal_error' }, 500);
  }
});

/**
 * The snapshot behind /intraday, for the page's own refresh button.
 *
 * `?wait=1` is what the manual button sends: when the entry has gone stale it
 * waits for the refresh instead of being handed the stale one, so a click that
 * says "refresh" returns refreshed data. The auto tick omits it and takes
 * whatever is cached.
 *
 * No rate limit here: there is no `force`, so the heaviest thing a caller can
 * cause is the one render the next page view would have triggered anyway, and
 * `refresh()` dedupes concurrent ones into a single pull.
 */
app.get('/api/intraday', async (c) => {
  try {
    const result = await getIntradaySnapshot({ wait: c.req.query('wait') === '1' });
    return c.json(
      { snapshot: result.snapshot, renderedAt: result.renderedAt, stale: result.stale },
      200,
      {
        // The caller is asking what the data is right now, and that changes on
        // the server's schedule, so a browser copy would only ever mislead.
        'Cache-Control': 'no-store',
        'X-Page-Age-Ms': String(result.ageMs),
        'X-Page-Stale': String(result.stale),
      }
    );
  } catch (err) {
    console.error('[intraday] snapshot request failed:', err);
    return c.json({ error: 'snapshot unavailable' }, 503);
  }
});

app.all('/api/*', (c) => c.json({ error: 'not_found' }, 404));

/**
 * /intraday is server-rendered with live data and cached for 15 minutes.
 *
 * It must be registered BEFORE serveStatic: the build no longer prerenders an
 * intraday/index.html, but if it ever did again, the static handler would win and
 * quietly serve frozen market data.
 */
app.get('/intraday', async (c) => {
  try {
    const page = await getIntradayPage();
    return c.html(page.html, 200, {
      // The page is identical for every visitor, so a shared cache may hold it.
      // `stale-while-revalidate` mirrors server-side what this does internally.
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=900',
      'X-Page-Age-Ms': String(page.ageMs),
      'X-Page-Stale': String(page.stale),
    });
  } catch (err) {
    // Only reachable on a cold cache whose very first render failed. Falling
    // through to the SPA shell means the page still loads and fetches
    // client-side, which is exactly how it behaved before SSR.
    console.error('[intraday] falling back to the SPA shell:', err);
    const shell = path.join(DIST, 'index.html');
    if (!fs.existsSync(shell)) return c.text('Build output missing.', 500);
    return c.html(fs.readFileSync(shell, 'utf8'));
  }
});

// ─── Static site ──────────────────────────────────────────────────────────────
// `pnpm build` prerenders one index.html per route, so a directory-index lookup
// serves the right prerendered page and only unknown paths fall back to the SPA
// shell — which keeps each route's own <title> and meta tags intact.
app.use('/*', serveStatic({ root: path.relative(process.cwd(), DIST) || './dist' }));

app.notFound((c) => {
  const routeIndex = path.join(DIST, c.req.path.replace(/^\/+/, ''), 'index.html');
  const file = fs.existsSync(routeIndex) ? routeIndex : path.join(DIST, 'index.html');
  if (!fs.existsSync(file)) {
    return c.text('Build output missing. Run `pnpm build` first.', 500);
  }
  return c.html(fs.readFileSync(file, 'utf8'));
});

const port = Number(process.env.PORT ?? 3000);

const start = async (): Promise<void> => {
  try {
    await migrate();
    console.log('[db] schema applied');
  } catch (err) {
    // The static site and the public APIs still work without the cache; only
    // handle resolution degrades. Better to serve the app than to refuse boot.
    console.error('[db] migration failed, handle search will be unavailable:', err);
  }
  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`[server] listening on http://localhost:${info.port}`);
  });

  // After `serve`, not before: the warm-up does five upstream fetches and the
  // health check should not wait on them. Deliberately not awaited — a cold
  // cache is slower for one request, never broken.
  void warmIntraday().catch((err: unknown) => {
    console.error('[intraday] warm-up failed, first request will render cold:', err);
  });
};

void start();

export { app };
