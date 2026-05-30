# Dashboard

## GridStack integration

`DashboardGrid.tsx` uses **GridStack v12** for drag/resize and **React portals** to render panel content into GridStack-managed DOM nodes.

### Three effects

1. **Init** (`[]`) — creates GridStack instance, sets `gsReady = true`
2. **Sync panels** (`[gsReady, visiblePanelIds]`) — `addWidget` / `removeWidget` per diff, wrapped in `batchUpdate(true/false)` to prevent intermediate compaction. Rebuilds `mounts` state map.
3. **Auto-size** (`[gsReady, hasData, mounts]`) — rAF → `gs.resizeToContent(el)` on metric panels only (`[gs-id^="metric-"]`). Chart panels keep their fixed `h`.

### Portal pattern

```
addWidget({ content: panelHTML(id, title) })  // injects <div id="gsmount-{id}">
→ collect DOM mount elements into mounts Map
→ createPortal(<PanelBody>…</PanelBody>, mountEl, id)
```

### Critical CSS rule

`.tc-gs-panel` must have `height: auto` (NOT `height: 100%`). If `100%`, `getBoundingClientRect()` always returns the container height and `sizeToContent` never works.

## Panel registry

- `CHART_PANELS` — equity, symbol, calendar, history. Charts have fixed `h`, `sizeToContent: false`.
- `METRIC_PANELS` — built from `METRIC_PANEL_CONFIGS`. All have `sizeToContent: true`, `h: 3`.
- `ALL_PANELS = [...CHART_PANELS, ...METRIC_PANELS]`

## sizeToContent rule

Only metric panels (`id` starts with `metric-`) get `sizeToContent: true`. Charts always keep their fixed grid height. The `resizeToContent` effect only runs on `[gs-id^="metric-"]` elements.

## Visibility & layout persistence

| Key | Value |
|---|---|
| `tc:panel-visibility-v1` | `JSON.stringify([...visiblePanelIds])` |
| `tc:gs-layout-v1` | `JSON.stringify([{ id, x, y, w, h }])` |

"Reset to default" clears both keys and reloads. Layout presets write both keys before reloading.

## Default layout (Overview)

```
y=0  [ Equity Curve (x:0, w:8, h:6) ] [ Total PnL (x:8, w:2) ] [ Total Trades (x:10, w:2) ]
                                        [ Win Rate  (x:8, w:2) ] [ Max Streaks  (x:10, w:2) ]
y=6  [ Trade History (x:0, w:12, h:6) ]
```

Default-visible panels: `equity`, `history`, `metric-total-pnl`, `metric-total-trades`, `metric-win-rate`, `metric-streaks`.

## Layout presets

Defined in `LAYOUT_PRESETS` (exported from `DashboardGrid.tsx`). Each preset has:
- `id` — unique string
- `label` — shown in the FilterBar dropdown
- `visible` — array of panel IDs to show
- `positions` — `Record<id, { x, y, w, h }>` written to `tc:gs-layout-v1`

Current presets: **Overview**, **Performance**, **Risk**, **Trade Stats**, **Minimal**.

## FilterBar

- Left: section dropdowns (Charts / Performance / Risk & Drawdown / Trades) — each shows `visible/total` count badge always.
- Right: "Layout" dropdown — lists all presets + "↺ Reset to default". Opens right-aligned (`tc-filter-menu--right`).
- Single open at a time; closes on outside click.

## MetricLabelContext

A React context (`createContext(false)`) exported from `statistics.tsx`. When `true`, the `Metric` component renders a label inside the card (used on the landing page only). The dashboard never sets this context.
