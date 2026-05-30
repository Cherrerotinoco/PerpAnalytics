# Task Completion Checklist

Run through every item before considering a task done.

---

## Code quality

- [ ] `pnpm typecheck` passes with zero errors
- [ ] `pnpm lint` passes with zero warnings or errors
- [ ] No unused imports or exports introduced
- [ ] No `console.log` statements left in
- [ ] No commented-out code left in
- [ ] No hardcoded colours, sizes, or values that should use `--tc-*` tokens

## Tests

- [ ] If a complex function was added or modified — a unit test exists or a conscious decision not to test was made (and noted)
- [ ] `pnpm test` passes with zero failures

## SSR safety

- [ ] No new module-level access to `window`, `document`, or `localStorage`
- [ ] Any browser API access is guarded with `typeof window !== 'undefined'`

## Dashboard integrity (if dashboard was touched)

- [ ] All default-visible panels have explicit `x`, `y` in `METRIC_DEFAULT_POSITIONS` or `CHART_PANELS`
- [ ] All layout presets in `LAYOUT_PRESETS` still reference valid panel IDs
- [ ] `sizeToContent` is only set to `true` on metric panels, never on chart panels
- [ ] `batchUpdate(true/false)` wraps all `addWidget` / `removeWidget` calls in the sync effect

## Styling (if CSS was touched)

- [ ] Changes are in `index.css` only
- [ ] Design tokens (`--tc-*`) used — no hardcoded values
- [ ] Light mode (`[data-theme='light']`) still looks correct if colours were changed

## File renames

- [ ] Any file rename that changes capitalisation was done with `git mv`, not just a filesystem rename

## Context files

- [ ] If a new pattern, component, or subsystem was introduced → relevant `.ai/context/*.md` file updated
- [ ] If the task introduced something worth documenting → `.ai/index.md` updated
