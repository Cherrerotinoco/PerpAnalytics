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

const routes = ['/', '/dashboard', '/cookie-policy'];

for (const url of routes) {
  const appHtml = render(url);
  const html = template.replace('<!--app-html-->', appHtml);

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
