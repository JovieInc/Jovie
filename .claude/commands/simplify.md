---
description: Simplify recently modified code for clarity and maintainability
tags: [refactoring, code-quality, cleanup]
---

# /simplify - Code Simplification Command

You are an expert code simplification specialist. Analyze and refine recently modified code for clarity, consistency, and maintainability while preserving exact functionality.

## Core Principles

1. **Never change behavior** - Only change HOW code works, not WHAT it does
2. **Clarity over brevity** - Readable code beats clever/compact code
3. **Follow project standards** - Use patterns from agents.md Section 8
4. **Avoid nested ternaries** - Use if/else or switch statements
5. **Remove dead code** - Delete unused variables, imports, functions

## Process

1. Run `git diff --name-only HEAD~5` to identify recently modified files
2. For each modified TypeScript/React file:
   - Look for unnecessary complexity
   - Simplify nested conditionals
   - Improve variable/function names
   - Remove redundant code
   - Consolidate related logic
3. Apply changes while preserving functionality
4. Run `pnpm turbo typecheck --filter=@jovie/web` to verify no breakage

## Anti-patterns to Fix

| Anti-pattern | Fix |
|--------------|-----|
| Nested ternaries | if/else chains or switch statements |
| Callback hell | async/await |
| Magic numbers | Named constants |
| Repeated code (3+) | Extract to function |
| Complex conditionals | Early returns |
| Unused imports/variables | Delete them |
| Overly generic names | Specific, descriptive names |
| Deep nesting (4+ levels) | Extract to helper functions |

## Jovie-Specific Patterns

Follow these project conventions (from agents.md):

- Use `cn()` from `@/lib/utils` for class merging
- Use TanStack Query for data fetching (not custom hooks)
- Use Sentry for logging (never `console.*` in production)
- Use Zod for validation
- Use `function` keyword over arrow functions for top-level
- Explicit return types for exported functions

## What NOT to Change

- Working functionality
- Test files (unless specifically requested)
- Generated files (migrations, lock files)
- External API contracts
- Performance-critical hot paths (without measurement)

## Output Format

After simplification, report:

```markdown
## Simplification Results

### Files Simplified
- `path/to/file.ts` - [brief description of changes]

### Key Changes
- [Change 1]
- [Change 2]

### Metrics
- Lines removed: X
- Complexity reduced: [files with reduced nesting]

### Verification
- TypeScript: [pass/fail]
- Tests: [pass/fail if run]
```

## Example Simplifications

**Before:**
```typescript
const result = condition1 ? (condition2 ? 'a' : 'b') : (condition3 ? 'c' : 'd');
```

**After:**
```typescript
function getResult(): string {
  if (condition1) {
    return condition2 ? 'a' : 'b';
  }
  return condition3 ? 'c' : 'd';
}
const result = getResult();
```

---

**Before:**
```typescript
const items = data?.items?.filter(x => x)?.map(x => x.name) || [];
```

**After:**
```typescript
const items = data?.items
  ?.filter((item): item is NonNullable<typeof item> => item != null)
  .map((item) => item.name) ?? [];
```

---

**CRITICAL:** Always run typecheck after simplification to ensure no breakage.
