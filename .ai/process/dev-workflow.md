# Development Workflow

Follow these steps for every code change, regardless of size.

---

## 1. Orient

- Read `.ai/index.md`
- Identify which context files are relevant to the task
- Read those files before touching any code

---

## 2. Understand before writing

- Locate the files involved using the architecture context
- Read the relevant source files fully — don't assume from filenames
- Identify side effects: does this change affect types, tests, presets, persistence keys, or CSS?

---

## 3. Implement

- Make the smallest change that solves the problem
- Follow `process/code-standards.md` at all times
- Keep changes focused — one concern per commit

---

## 4. Type-check

Run after every change — no exceptions:

```bash
pnpm typecheck
```

Fix all errors before proceeding. Never leave type errors with `// @ts-ignore` unless there is a documented reason.

---

## 5. Consider unit tests

For any **complex function** introduced or modified, evaluate whether a unit test is warranted.

A function is considered complex if it:
- Transforms data with branching logic (e.g. normalizers, `computeTradeStats`)
- Handles edge cases that are non-obvious (empty arrays, division by zero, date parsing)
- Is pure and deterministic — making it straightforward to test
- Would be hard to catch visually if it regressed

If a test is warranted:
- Add it in a `*.test.ts` file alongside the source file
- Use **Vitest** (already configured)
- Cover the happy path + at least one edge case
- Run `pnpm test` to verify all tests pass

If a test is not warranted (simple UI wiring, config changes, CSS), note why briefly.

---

## 6. Lint

```bash
pnpm lint
```

Fix all warnings and errors. Do not disable lint rules without a documented reason.

---

## 7. Run the checklist

Go through every item in `process/checklist.md` before marking the task done.

---

## 8. Update context files

If the change affects something documented in `.ai/context/`:
- Update the relevant file to reflect the new behaviour
- If a new pattern or subsystem was introduced, add it to `index.md`
