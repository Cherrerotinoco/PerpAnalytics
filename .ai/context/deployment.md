# Deployment

## Build steps

```bash
pnpm build
# Runs in sequence:
# 1. vite build --config app/vite.config.ts      → dist/ (client bundle)
# 2. vite build --config app/vite.ssr.config.ts  → dist/server/ (SSR bundle)
# 3. tsx scripts/prerender.ts                    → prerendered HTML files + cleans up server bundle
```

**Node requirement:** Vite 8 requires Node ≥ 20. Always run `nvm use 20` before building.

## SSR / prerender

- `entry-server.tsx` exports a `render()` function used by the prerender script.
- The prerender script generates static HTML for `/` and `/cookie-policy`.
- The `/dashboard` route is NOT prerendered (requires wallet input).

### SSR gotcha — `window` at module level

Any module-level access to `window` / `document` will crash the prerender step. Guard with:
```ts
typeof window !== 'undefined' ? window.location.search : ''
```
This pattern is already used in `WalletForm.tsx` for `_initParams`.

## Hosting — Render.com

Config: `render.yaml` (static site service).

- **Publish path:** `./dist`
- **Catch-all rewrite:** `/* → /index.html` (SPA routing)
- **Content-Type:** `/*.html` explicitly set to `text/html; charset=utf-8` — required because `X-Content-Type-Options: nosniff` is set globally, which prevents browser MIME sniffing.

## Headers

Set in two places (both must be kept in sync):
- `render.yaml` — applied by Render's CDN
- `app/public/_headers` — fallback / used during local preview

Key headers:
| Header | Value |
|---|---|
| `Content-Type` (html) | `text/html; charset=utf-8` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Content-Security-Policy` | Allows GTM, Google Fonts, Jupiter + Pacifica APIs |

## CI pipeline

The pipeline runs on Linux (case-sensitive filesystem). File renames that only change capitalisation must be done with `git mv` — macOS silently ignores case-only renames and the old filename stays in git.
