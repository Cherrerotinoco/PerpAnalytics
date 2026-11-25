/**
 * Prerender script — runs after both Vite builds complete.
 *
 * For each route it:
 *   1. Calls the SSR render() function (built into dist/server/)
 *   2. Rewrites the <title>, <meta name="description">, the og:/twitter: social tags
 *      and the JSON-LD description with that route's copy from `routes` below
 *   3. Injects the resulting HTML into the <!--app-html--> placeholder in dist/index.html
 *   4. Writes the final file to the correct path in dist/
 *
 * Invoked by the `build` npm script via `tsx scripts/prerender.ts`.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distPath = path.resolve(__dirname, '..', 'dist');
const serverEntry = path.resolve(__dirname, '..', 'dist-ssr', 'entry-server.js');

// The SSR bundle is built by `vite build --config app/vite.ssr.config.ts`. It is no
// longer deleted once this script finishes: the Node server imports the very same
// bundle at runtime to render /intraday per request. That is why it now lives in
// dist-ssr/ instead of inside the publicly served dist/.
const { render } = (await import(serverEntry)) as { render: (url: string) => string };

const template = fs.readFileSync(path.join(distPath, 'index.html'), 'utf-8');

interface RouteMeta {
  title: string;
  description: string;
}

const SITE_ORIGIN = 'https://perpanalytics.app';

/**
 * Per-route metadata. Titles are kept under ~60 characters and descriptions under ~160
 * so neither gets truncated in search results — `assertMetaFits` below enforces that.
 * Copy is deliberately front-loaded with the terms each page actually ranks for.
 */
const routes: Record<string, RouteMeta> = {
  '/': {
    title: 'Free Solana Perps Trading Analytics — Jupiter & Pacifica',
    description:
      'Paste a public Solana wallet to see your perps equity curve, win rate, PnL by symbol and full trade history from Jupiter and Pacifica. No sign-up.',
  },
  '/dashboard': {
    title: 'Perps Trading Dashboard — Equity Curve, Win Rate & PnL',
    description:
      'Track Solana perps performance across Jupiter and Pacifica: equity curve, win rate, profit factor, Sharpe, max drawdown and a sortable trade log.',
  },
  '/calculator': {
    title: 'Futures Account Growth Calculator — Compounding & Risk',
    description:
      'Project account growth from your win rate, risk/reward, leverage and stop loss. See expectancy per trade, trades to target, days needed and liquidation risk.',
  },
  // NOTE: /intraday is deliberately absent. It is rendered per request by the Node
  // server with live data and cached for 15 min (server/intraday/page.ts), so a
  // build-time snapshot of it would be frozen market data served as if it were
  // current. Its metadata lives in INTRADAY_META below, which the server reuses so
  // the <head> copy stays in one place.
  '/cookie-policy': {
    title: 'Cookie Policy — PerpAnalytics',
    description:
      'How PerpAnalytics uses cookies: strictly necessary storage, optional analytics, and how to change your consent choices at any time.',
  },
};

/** Escape a string for use inside a double-quoted HTML attribute value. */
const attrValue = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

/** Escape a string for use as HTML text content. */
const textContent = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * `String.replace` with a non-matching pattern is a silent no-op, which is exactly how
 * every route ended up shipping the homepage metadata. Throw instead, so a template
 * change that breaks one of these rewrites fails the build rather than the SEO.
 */
function replaceOrThrow(
  html: string,
  pattern: RegExp,
  replacer: (...args: string[]) => string,
  what: string,
): string {
  if (!pattern.test(html)) {
    throw new Error(`prerender: no ${what} found in dist/index.html — metadata rewrite would silently do nothing`);
  }
  return html.replace(pattern, replacer);
}

/** Rewrite the `content` attribute of the <meta> tag identified by name="…" / property="…". */
function setMetaContent(html: string, kind: 'name' | 'property', key: string, value: string): string {
  return replaceOrThrow(
    html,
    new RegExp(`(<meta\\b[^>]*\\b${kind}="${key}"[^>]*\\bcontent=")[^"]*(")`),
    (_match, before, after) => `${before}${attrValue(value)}${after}`,
    `<meta ${kind}="${key}">`,
  );
}

/**
 * Warn when copy would be truncated in search results. Not fatal — a slightly long
 * description still renders, it just gets cut off.
 */
function assertMetaFits(url: string, meta: RouteMeta): void {
  if (meta.title.length > 60) {
    console.warn(`⚠  ${url}: title is ${meta.title.length} chars (>60, may be truncated in search results)`);
  }
  if (meta.description.length > 160) {
    console.warn(`⚠  ${url}: description is ${meta.description.length} chars (>160, may be truncated in search results)`);
  }
}

/**
 * A page must carry EXACTLY ONE canonical, and it must be its own.
 *
 * This is checked rather than assumed because it has already gone wrong twice.
 * `applyRouteMeta` rewrites the template's canonical, but nothing stopped the app
 * from appending a second one at runtime — entry-client.tsx used to do precisely
 * that, pointing every route at the homepage and undoing the rewrite below. A
 * duplicate or wrong canonical is invisible in the browser and only shows up as
 * pages quietly dropping out of search results, so it fails the build instead.
 */
function assertSingleCanonical(html: string, expected: string, label: string): void {
  const found = [...html.matchAll(/<link\b[^>]*\brel="canonical"[^>]*>/g)];
  if (found.length !== 1) {
    throw new Error(
      `prerender: ${label} has ${found.length} canonical link(s), expected exactly 1`,
    );
  }
  const href = /\bhref="([^"]*)"/.exec(found[0][0])?.[1];
  if (href !== expected) {
    throw new Error(`prerender: ${label} canonical is "${href ?? ''}", expected "${expected}"`);
  }
}

/** Apply one route's title/description to every place the template repeats them. */
function applyRouteMeta(html: string, meta: RouteMeta, canonical: string): string {
  let out = replaceOrThrow(
    html,
    /<title>[\s\S]*?<\/title>/,
    () => `<title>${textContent(meta.title)}</title>`,
    '<title>',
  );

  out = setMetaContent(out, 'name', 'description', meta.description);
  out = setMetaContent(out, 'property', 'og:title', meta.title);
  out = setMetaContent(out, 'property', 'og:description', meta.description);
  out = setMetaContent(out, 'name', 'twitter:title', meta.title);
  out = setMetaContent(out, 'name', 'twitter:description', meta.description);

  // Without this every prerendered page declares itself as the homepage, which invites
  // search engines to collapse the whole site onto a single URL.
  out = setMetaContent(out, 'property', 'og:url', canonical);
  out = replaceOrThrow(
    out,
    /(<link\b[^>]*\brel="canonical"[^>]*\bhref=")[^"]*(")/,
    (_match, before, after) => `${before}${attrValue(canonical)}${after}`,
    '<link rel="canonical">',
  );

  // JSON-LD "description" and "url" — JSON string literals, so escape them as such.
  out = replaceOrThrow(
    out,
    /("description":\s*)"(?:[^"\\]|\\.)*"/,
    (_match, before) => `${before}${JSON.stringify(meta.description)}`,
    'JSON-LD "description"',
  );
  return replaceOrThrow(
    out,
    /("url":\s*)"(?:[^"\\]|\\.)*"/,
    (_match, before) => `${before}${JSON.stringify(canonical)}`,
    'JSON-LD "url"',
  );
}

for (const [url, meta] of Object.entries(routes)) {
  const appHtml = render(url);
  // Metadata is rewritten before the app HTML goes in, so the rewrites can only ever
  // match the template's own <head> and never something the rendered page happens to
  // contain. The replacer function also stops `$&`-style sequences in appHtml from
  // being treated as replacement patterns.
  assertMetaFits(url, meta);
  const canonical = url === '/' ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}${url}`;
  const html = applyRouteMeta(template, meta, canonical).replace('<!--app-html-->', () => appHtml);
  // Checked on the FINAL html, with the rendered app already in it, so a canonical
  // emitted by a component would be caught too.
  assertSingleCanonical(html, canonical, url);

  let outPath: string;
  if (url === '/') {
    outPath = path.join(distPath, 'index.html');
  } else {
    // /cookie-policy → dist/cookie-policy/index.html
    const routeDir = path.join(distPath, url.slice(1));
    fs.mkdirSync(routeDir, { recursive: true });
    outPath = path.join(routeDir, 'index.html');
  }

  fs.writeFileSync(outPath, html);
  console.log(`✓  Prerendered ${url}  →  ${path.relative(distPath, outPath)}`);
}

/**
 * /intraday is rendered per request, so instead of a finished page it gets a
 * TEMPLATE: the same HTML with its own <head> already applied and the
 * <!--app-html--> placeholder left intact for the server to fill with the live
 * render.
 *
 * Doing it here rather than in the server keeps all the <head> rewriting — and
 * the `replaceOrThrow` guards that make a template change fail the build instead
 * of silently shipping the homepage's metadata — in this one file.
 */
const INTRADAY_META: RouteMeta = {
  title: 'BTC Intraday Order Flow — CVD, Absorption & Gamma',
  description:
    'Live BTC order flow: spot and perp CVD by session, absorption and price-vs-CVD divergence, daily aggressor trend and options gamma across four venues.',
};

assertMetaFits('/intraday', INTRADAY_META);
const intradayCanonical = `${SITE_ORIGIN}/intraday`;
const intradayTemplate = applyRouteMeta(template, INTRADAY_META, intradayCanonical);
assertSingleCanonical(intradayTemplate, intradayCanonical, '/intraday template');
const ssrDir = path.resolve(__dirname, '..', 'dist-ssr');
fs.mkdirSync(ssrDir, { recursive: true });
fs.writeFileSync(path.join(ssrDir, 'intraday-template.html'), intradayTemplate);
console.log('✓  Wrote /intraday SSR template  →  dist-ssr/intraday-template.html');

// The SSR bundle is NOT deleted any more: the Node server imports it at runtime to
// render /intraday. It lives in dist-ssr/, outside the tree serveStatic hands out,
// so it is not publicly reachable — which is what the deletion used to guarantee.
