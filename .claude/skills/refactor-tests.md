---
description: Audit and refactor test files for size, complexity, and convention compliance. Default mode is audit (read-only report). Pass "enforce" to apply changes.
---

# Refactor Tests

Audit test files against project conventions, then optionally refactor oversized or poorly structured tests. Anchored to **Vitest** with `vi.mock()`, `describe`/`it` syntax.

## Modes

- **`/refactor-tests`** or **`/refactor-tests audit`** — Read-only report. No files changed.
- **`/refactor-tests enforce`** — Apply refactors, then verify.
- **`/refactor-tests <path>`** — Scope to a specific directory or file.

## Thresholds (calibrated to this codebase)

| Metric | OK | Review | Must Fix |
|--------|----|--------|----------|
| File LOC | < 300 | 300–500 | > 500 |
| Tests per file | < 25 | 25–35 | > 35 |
| Nesting depth | ≤ 3 (`describe > describe > it`) | — | > 3 levels |
| Setup duplication | Shared `beforeEach` | — | Copy-pasted setup in every `it` |

## Process

### Phase 1: Inventory

Use Glob + Grep to find all test files:

```
**/*.test.ts, **/*.test.tsx
```

For each file, record:
- Path, LOC, number of `it()`/`test()` calls
- Max nesting depth (count nested `describe` levels)
- Number of `vi.mock()` calls
- Whether setup is shared (`beforeEach`) or duplicated per test

### Phase 2: Analysis

Produce a markdown table sorted by severity:

```markdown
| File | LOC | Tests | Depth | Mocks | Verdict |
|------|-----|-------|-------|-------|---------|
| path/to/big.test.ts | 612 | 38 | 4 | 6 | SPLIT |
| path/to/medium.test.ts | 410 | 22 | 3 | 3 | REVIEW |
| path/to/ok.test.ts | 180 | 12 | 2 | 1 | OK |
```

Verdicts:
- **OK** — All metrics within thresholds
- **REVIEW** — One or more metrics in the review zone
- **SPLIT** — One or more metrics exceed must-fix threshold
- **CLEANUP** — Depth or duplication issue, file size is fine

### Phase 3: Refactor (enforce mode only)

Apply changes in this order:

1. **Extract duplicated setup** into `beforeEach` or shared `const defaultProps`
2. **Flatten excessive nesting** — collapse `describe` blocks that add no meaningful grouping
3. **Split oversized files** by domain/module (NOT by success/failure):
   - `user-service.test.ts` → `user-service.test.ts` + `user-service-permissions.test.ts`
   - Name splits after the sub-domain, not behavioral outcome
4. **Extract shared mocks** — when splitting, if multiple files need the same `vi.mock()`:
   - Create a shared setup file (e.g., `__tests__/helpers/mock-user-service.ts`)
   - Or use `vi.hoisted()` + shared factory in a common file
   - Never duplicate identical `vi.mock()` blocks across split files
5. **Remove dead tests** — commented-out tests, `.skip` with no TODO, empty `describe` blocks

### Phase 4: Verify (enforce mode only)

Run in sequence — all must pass:

```bash
# 1. Run affected tests
pnpm test -- --run <changed-test-files>

# 2. Type check
pnpm --filter web exec tsc --noEmit

# 3. Confirm no test count regression
# Compare total it()/test() count before vs after — must be equal or higher
```

If any step fails, fix before continuing. Do not leave broken tests.

## Conventions (this codebase)

| Convention | Rule |
|-----------|------|
| File extension | `.test.ts` / `.test.tsx` (never `.spec.ts`) |
| Framework | Vitest — `vi.mock()`, `vi.fn()`, `vi.spyOn()` |
| Test runner | `describe` / `it` (not `test`) for consistency |
| Naming | File mirrors source: `user-service.ts` → `user-service.test.ts` |
| Split strategy | By domain/module, not by success/failure/edge |
| Setup | `beforeEach` + shared `const` over factory files |
| Assertions | `expect()` with Vitest matchers |
| CI constraint | Fewer files is better — don't split unless a threshold is exceeded |

## Anti-patterns

| Don't | Do |
|-------|------|
| Split into `feature.success.test.ts` / `feature.error.test.ts` | Split by sub-domain: `feature.test.ts` + `feature-permissions.test.ts` |
| Create factory files for simple props | Use `const defaultProps = { ... }` in the test file |
| Nest `describe > describe > describe > describe > it` | Max 3 levels — flatten or split |
| Copy-paste `vi.mock()` across split files | Extract to shared helper or `__mocks__/` |
| Leave `.skip` tests without a TODO comment | Remove or add `// TODO(ticket): reason` |
| Add tests just to hit a count target | Every test should assert meaningful behavior |

## Output Format

### Audit mode

```markdown
## Test Audit Report

### Summary
- X files scanned, Y flagged for review, Z require splitting

### Flagged Files
| File | LOC | Tests | Depth | Mocks | Verdict | Suggestion |
|------|-----|-------|-------|-------|---------|------------|

### Recommendations
- [Prioritized list of suggested changes]
```

### Enforce mode

```markdown
## Test Refactor Results

### Changes Applied
- [What was changed and why]

### Files Modified
- X files modified, Y files created, Z files deleted
- Net test count: before → after (must not decrease)

### Verification
- Tests: PASS / FAIL
- Types: PASS / FAIL
```
