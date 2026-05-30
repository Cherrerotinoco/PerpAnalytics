# Styling

## Single-file rule

All styles live in `app/src/index.css`. No external CSS frameworks, no CSS modules, no additional files.
When adding styles, always add them to `index.css` under the appropriate section comment.

## Design tokens

```css
/* Backgrounds */
--tc-bg, --tc-surface, --tc-surface-2, --tc-surface-3

/* Text */
--tc-text, --tc-muted

/* Borders */
--tc-border

/* Brand colours */
--tc-green, --tc-red, --tc-amber
--tc-accent   /* amber — primary brand colour */

/* Shape */
--tc-radius   /* 6px */
```

Dark mode is the default (`:root`). Light mode via `[data-theme='light']` on `<html>`.

## Bootstrap utility classes

Some older components use Bootstrap class names (`d-flex`, `gap-2`, `mb-1`, etc.) — these are **custom-defined** in `index.css`, not imported from Bootstrap. Never add the Bootstrap library; add missing utilities to `index.css` instead.

## Key component classes

| Class | Component |
|---|---|
| `.tc-card` | Base card surface — has `position: relative` for absolute children |
| `.tc-flip-card` | Metric card with flip tooltip |
| `.tc-flip-trigger` | The `?` button (absolute top-right) |
| `.tc-metric-header` | Flex row for label + `?` on landing page |
| `.tc-gs-panel` | GridStack panel shell — must have `height: auto` |
| `.tc-gs-body` | Panel body wrapper |
| `.tc-filter-bar` | FilterBar container |
| `.tc-filter-btn--filtered` | Active state when some panels in a section are hidden |

## Theme toggle

`ThemeContext.tsx` manages dark/light. The theme is persisted to `localStorage` and applied as `data-theme` on `<html>`. Use `useTheme()` to read or toggle it.

## Landing page pattern

The landing page wraps metric panels in `<MetricLabelContext value={true}>` to render labels inside cards. This is the only place this context is set. Never use it in the dashboard.
