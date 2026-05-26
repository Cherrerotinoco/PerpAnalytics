import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    root: __dirname,
    plugins: [react()],
    build: {
        outDir: '../dist',
        emptyOutDir: true,
        rollupOptions: {
            output: {
                manualChunks(id: string) {
                    if (!id.includes('node_modules')) return;
                    // React runtime — very stable, cache long-term
                    if (
                        id.includes('/react/') ||
                        id.includes('/react-dom/') ||
                        id.includes('/react-router') ||
                        id.includes('/scheduler/')
                    ) {
                        return 'vendor-react';
                    }
                    // Recharts + its d3 / victory-vendor deps
                    if (
                        id.includes('/recharts/') ||
                        id.includes('/d3-') ||
                        id.includes('/victory-vendor/')
                    ) {
                        return 'vendor-recharts';
                    }
                },
            },
        },
    },
});