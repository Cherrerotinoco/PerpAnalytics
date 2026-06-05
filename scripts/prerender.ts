/**
 * Prerender script — runs after both Vite builds complete.
 *
 * For each route it:
 *   1. Calls the SSR render() function (built into dist/server/)
 *   2. Injects the resulting HTML into the <!--app-html--> placeholder in dist/index.html
 *   3. Writes the final file to the correct path in dist/
 *
 * Invoked by the `build` npm script via `tsx scripts/prerender.ts`.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distPath = path.resolve(__dirname, '..', 'dist');
const serverEntry = path.join(distPath, 'server', 'entry-server.js');

// The SSR bundle is built by `vite build --config app/vite.ssr.config.ts`
const { render } = (await import(serverEntry)) as { render: (url: string) => string };

const template = fs.readFileSync(path.join(distPath, 'index.html'), 'utf-8');

interface RouteMeta {
  title: string;
  description: string;
}

const routes: Record<string, RouteMeta> = {
  '/': {
    title: 'PerpsAnalytics — Free Solana Perps Trading Dashboard',
    description:
      'Free analytics dashboard for Solana perpetuals traders. Paste your wallet to instantly see your equity curve, PnL by symbol, win rate, and full trade history across Jupiter Perpetuals and Pacifica Finance. No sign-up required.',
  },
  '/dashboard': {
    title: 'Dashboard — PerpsAnalytics',
    description:
      'Analyze your Solana perpetuals trading history. Enter any public wallet address to see your equity curve, win rate, PnL breakdown and full trade list across Jupiter Perpetuals and Pacifica Finance.',
  },
  '/calculator': {
    title: 'Account Growth Calculator — PerpsAnalytics',
    description:
      'Interactive BTC futures account projection calculator. Model compound growth trade-by-trade with your real win rate, risk/reward, leverage and stop-loss parameters. See how long it takes to reach your target.',
  },
  '/cookie-policy': {
    title: 'Cookie Policy — PerpsAnalytics',
    description: 'Cookie policy for PerpsAnalytics.',
  },
};

for (const [url, meta] of Object.entries(routes)) {
  const appHtml = render(url);
  const html = template
    .replace('<!--app-html-->', appHtml)
    .replace(/<!--app-title-->.*?<!--\/app-title-->/s, meta.title)
    .replace(/<!--app-description-->.*?<!--\/app-description-->/s, meta.description);

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

// The server bundle is only needed during build — remove it so it isn't
// accidentally served as a public asset on the static host.
fs.rmSync(path.join(distPath, 'server'), { recursive: true });
console.log('✓  Cleaned up server bundle');
