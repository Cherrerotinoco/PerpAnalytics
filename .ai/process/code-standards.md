# Code Standards

## TypeScript

- Strict mode is enabled — no `any`, no implicit types
- Always provide explicit return types on exported functions and components
- Prefer `interface` for object shapes, `type` for unions and aliases
- Never use `// @ts-ignore` or `// @ts-expect-error` without a comment explaining why

## Naming

- **Files:** PascalCase for components (`WalletForm.tsx`), camelCase for utils/hooks (`normalizeJupiter.ts`, `useCookieConsent.ts`)
- **Components:** PascalCase (`DashboardGrid`, `FilterBar`)
- **Hooks:** camelCase prefixed with `use` (`useTheme`, `useCookieConsent`)
- **Constants:** SCREAMING_SNAKE_CASE (`LAYOUT_KEY`, `METRIC_PANEL_CONFIGS`)
- **CSS classes:** kebab-case prefixed with `tc-` (`tc-card`, `tc-filter-bar`)

## Components

- One component per file (small helper components in the same file are acceptable)
- Wrap expensive components with `memo`
- Use `useMemo` for derived data, `useCallback` for stable callbacks passed as props
- Prefer composition over prop-drilling — use React context for cross-cutting concerns
- Lazy-load heavy components with `lazy()` + `Suspense`

## CSS

- All styles go in `app/src/index.css` — no new CSS files
- Always use design tokens (`--tc-*`) — never hardcode colours, font sizes, or radii
- Add new rules under a relevant section comment; add a new section comment if needed
- Bootstrap utility class names (`d-flex`, `mb-2`, etc.) are custom-defined — add missing ones to `index.css`
- Do not introduce a CSS framework or CSS-in-JS library

## Imports

- No unused imports — remove them immediately
- Group imports: React → third-party → internal (types → utils → components)
- Use relative imports within `app/src/`

## Dead code

- Never leave commented-out code
- Never leave `console.log` statements
- Remove unused exports — they add surface area for confusion

## SSR safety

- Never access `window`, `document`, or `localStorage` at module evaluation time
- Guard browser APIs: `typeof window !== 'undefined' ? ... : fallback`
- This is critical — module-level browser globals crash the prerender step

## Git

- File renames that change only capitalisation **must** use `git mv` — macOS is case-insensitive and will not track the rename otherwise, breaking the Linux CI pipeline
