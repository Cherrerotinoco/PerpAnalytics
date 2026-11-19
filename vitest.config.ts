import { defineConfig } from 'vitest/config';

// Without an explicit include, `vitest run app/src` also matches the repo copies
// inside .claude/worktrees/, running stale duplicates of every suite — a test can
// pass there while the real file is broken. Pin the roots instead.
export default defineConfig({
  test: {
    include: ['app/src/**/*.test.{ts,tsx}', 'server/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '.claude/**'],
  },
});
