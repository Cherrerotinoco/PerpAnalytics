import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// SSR build — produces a Node-compatible bundle used only during `pnpm build`
// to pre-render the static HTML shell for each route.
export default defineConfig({
  root: __dirname,
  plugins: [react()],
  build: {
    // 'src/entry-server.tsx' is the SSR entry (relative to root)
    ssr: 'src/entry-server.tsx',
    outDir: '../dist/server',
    emptyOutDir: true,
  },
  ssr: {
    // Bundle all dependencies so Vite handles CSS imports from browser-only
    // packages (recharts, flexlayout-react, vanilla-cookieconsent) as empty
    // modules rather than letting Node try to require them directly.
    noExternal: true,
  },
});
