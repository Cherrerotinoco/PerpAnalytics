import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// SSR build — produces a Node-compatible bundle with two consumers:
//   1. `pnpm build` prerenders the static HTML shell for most routes;
//   2. the Node server imports it AT RUNTIME to render /intraday per request
//      with live data (see server/intraday/page.ts).
//
// Consumer (2) is why it lands in dist-ssr/ and not dist/. dist/ is the tree
// serveStatic hands out, so a bundle in there would be publicly downloadable —
// which is exactly why the prerender script used to delete it once the build was
// done. It cannot be deleted any more, so it has to live outside the served tree.
export default defineConfig({
  root: __dirname,
  plugins: [react()],
  build: {
    // 'src/entry-server.tsx' is the SSR entry (relative to root)
    ssr: 'src/entry-server.tsx',
    outDir: '../dist-ssr',
    emptyOutDir: true,
  },
  ssr: {
    // Bundle all dependencies so Vite handles CSS imports from browser-only
    // packages (recharts, flexlayout-react, vanilla-cookieconsent) as empty
    // modules rather than letting Node try to require them directly.
    noExternal: true,
  },
});
