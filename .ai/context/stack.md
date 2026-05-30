# Tech Stack

## Core

| Layer | Choice | Version |
|---|---|---|
| UI framework | React | 19 |
| Language | TypeScript | 5.9 (strict mode) |
| Bundler | Vite | 8 |
| Package manager | pnpm | workspace, single `package.json` |
| Routing | react-router-dom | v7 |

## UI & visualisation

| Library | Purpose |
|---|---|
| GridStack | Drag/resize dashboard grid (v12.6) |
| Recharts | Charts (equity curve, PnL by symbol) |
| react-icons/cg | Icons throughout the UI |
| vanilla-cookieconsent | Cookie consent banner (v3) |

## Rendering

| Mode | Entry point |
|---|---|
| Client | `app/src/entry-client.tsx` |
| SSR | `app/src/entry-server.tsx` |
| Prerender | `scripts/prerender.ts` |

## Node requirement

Vite 8 requires **Node ≥ 20**. The `engines` field says `>=18` but `pnpm build` will fail on Node 18.
Always run `nvm use 20` before build commands.

## Scripts

```bash
pnpm typecheck        # tsc --noEmit — run after every change
pnpm dev:app          # Vite dev server
pnpm build:client     # Client bundle only (skips SSR + prerender)
pnpm build            # Full build: client + SSR + prerender
pnpm lint             # ESLint
pnpm format           # Prettier
pnpm test             # Vitest (run once)
```
