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
 * It exists for one reason: the fomoapi key is metered and billed, so it cannot
 * ship to a browser. Everything else the app needs — Jupiter, Pacifica and
 * Hyperliquid — is public and is called directly from the client, so none of it
 * is proxied here.
 */

const DIST = path.resolve(process.cwd(), 'dist');

const app = new Hono();

// connect-src lists every host the browser itself calls. Jupiter, Pacifica and
// Hyperliquid are public APIs hit directly from the page; only the FOMO handle
// lookup goes through 'self'.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' https://www.googletagmanager.com 'unsafe-inline'",
  "style-src 'self' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
  [
    "connect-src 'self' https://perps-api.jup.ag https://api.pacifica.fi",
    'https://api.hyperliquid.xyz',
    'https://api.binance.com https://fapi.binance.com https://api.bybit.com',
    'https://cryptogamma.io https://www.google-analytics.com https://analytics.google.com',
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
    const [budget, usage] = await Promise.all([
      getBudget(),
      getDailyUsage(clientHashOf(c)),
    ]);
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
        { error: 'rate_limited', scope: err.scope, message: err.message, retryAfterSeconds: err.retryAfterSeconds },
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

app.all('/api/*', (c) => c.json({ error: 'not_found' }, 404));

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
};

void start();

export { app };
