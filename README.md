# Perps Analytics

A client-side dashboard for analysing your perpetual futures trading history on Solana. Enter any wallet address to fetch positions from **Jupiter Perpetuals** and **Pacifica Finance** and explore interactive statistics — no backend required.

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)

## Features

- **Equity curve** — cumulative PnL over time
- **PnL by symbol** — breakdown per traded asset
- **PnL calendar** — daily performance heatmap
- **Statistics panel** — win rate, average trade, expectancy, and more
- **Trade list** — searchable and sortable full history
- **Recent wallets** — quick access to previously analysed addresses
- **Dark / light theme**

## Getting started

**Requirements:** Node.js ≥ 18, [pnpm](https://pnpm.io)

```bash
# Install dependencies
pnpm install

# Start the dev server
pnpm dev:app

# Type-check
pnpm typecheck

# Lint
pnpm lint

# Production build
pnpm build
```

The app is entirely client-side. The production build outputs to `dist/` and can be served from any static host.

## Project structure

```
app/
└── src/
    ├── components/
    │   └── dashboard/
    │       └── panels/      # equityCurveChart, pnlBySymbolChart, pnlCalendar, statistics, tradeList
    ├── context/             # ThemeContext
    ├── layout/              # MainLayout
    ├── types/               # Shared TypeScript types
    └── utils/               # normalizeJupiter, normalizePacifica
```

## Deployment

The project ships a [`render.yaml`](render.yaml) for one-click deployment to [Render](https://render.com) as a static site.

## Contributing

Contributions are welcome. Please follow the guidelines below.

### Pull request guidelines

1. **One concern per PR.** Keep changes focused — a bug fix, a new panel, a refactor. Mixed PRs are hard to review and harder to revert.

2. **Branch naming.** Use a short, descriptive slug:
   - `feat/pnl-calendar-tooltips`
   - `fix/jupiter-normalization-edge-case`
   - `chore/upgrade-vite`

3. **Commit messages.** Write in the imperative mood, summarise *why* not just *what*:
   > `fix: handle missing realizedPnl field in Jupiter response`

4. **Pass CI locally before opening.** Run `pnpm typecheck && pnpm lint` before pushing. PRs that fail these checks will not be reviewed.

5. **Keep the PR description short but complete.** Include:
   - What changed and why
   - How to test it manually (wallet address, steps, expected result)
   - Screenshots for any UI change

6. **No unrelated changes.** Avoid reformatting untouched files, bumping unrelated deps, or mixing refactors into feature PRs.

7. **Small is better.** A 200-line PR gets reviewed the same day. A 1 000-line PR waits. If a feature is large, split it into logical, individually mergeable steps.

8. **Discuss big changes first.** For significant new features or architecture changes, open an issue to align on the approach before writing code.

## License

MIT
