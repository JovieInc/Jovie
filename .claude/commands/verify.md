---
description: Self-verification checklist before completing tasks
tags: [quality, verification, testing]
---

# /verify - Self-Verification Command

Verify your own work before completing the task. This 2-3x's code quality by catching issues before human review.

## 1. Build & Type Check

Run validation commands:

```bash
pnpm turbo typecheck --filter=@jovie/web
pnpm biome check .
```

If errors exist, fix them before proceeding.

## 2. Server/Client Boundary Check

**CRITICAL: This catches the most common bugs.** Run:

```bash
pnpm --filter web lint:server-boundaries
```

### Manual Verification (for modified files):

**Client components using server imports (FORBIDDEN):**
- [ ] Files with `'use client'` do NOT import from:
  - `@/lib/db/*` (database access)
  - `@clerk/nextjs/server` (server-side auth)
  - `stripe`, `resend` (API clients with secrets)
  - `drizzle-orm` directly
  - Any `*.server.ts` files

**Server components using client hooks (FORBIDDEN):**
- [ ] Files WITHOUT `'use client'` do NOT use React hooks:
  - `useState`, `useEffect`, `useCallback`, `useMemo`
  - `useRef`, `useContext`, `useReducer`
  - Custom hooks (`use*` prefix)

**Quick grep checks:**
```bash
# Find 'use client' files importing db (SHOULD BE EMPTY)
grep -l "'use client'" apps/web --include="*.tsx" --include="*.ts" -r | xargs grep -l "@/lib/db" 2>/dev/null

# Find server files using hooks (SHOULD BE EMPTY - check manually)
grep -rn "useState\|useEffect\|useCallback" apps/web/app --include="*.tsx" | grep -v "'use client'"
```

## 3. Similar Bug Scan

**When you fixed a bug, check for the same pattern elsewhere.**

### Process:

1. **Identify what you fixed** - What was the root cause? (e.g., missing null check, wrong import path, incorrect hook usage)

2. **Search for siblings** - Use grep to find the same pattern:
   ```bash
   # Replace PATTERN with the code pattern you fixed
   grep -rn "PATTERN" apps/web --include="*.tsx" --include="*.ts"
   ```

3. **Check related files** - Look in:
   - [ ] Files in the same directory
   - [ ] Files with similar names (e.g., other `*Button.tsx`, other `*Modal.tsx`)
   - [ ] Files that import/export the same modules
   - [ ] Files created around the same time (similar age = similar patterns)

4. **Fix all instances** - Don't leave the same bug elsewhere

### Common sibling patterns:

| If you fixed... | Also check... |
|-----------------|---------------|
| Missing `'use client'` | Other components using hooks |
| Incorrect import path | Other files importing same module |
| Missing null/undefined check | Other usages of same data source |
| Incorrect type annotation | Other usages of same type |
| Missing error handling | Other API calls in same feature |
| React hook issue | Other hooks in same component family |

### Quick grep examples:

```bash
# Find files with similar import patterns
grep -rn "from '@/components/SIMILAR'" apps/web --include="*.tsx"

# Find files using the same hook
grep -rn "useYOUR_HOOK" apps/web --include="*.tsx"

# Find files in the same feature area
ls -la apps/web/components/FEATURE_AREA/
```

- [ ] Searched for similar patterns in related files
- [ ] Fixed all identified instances (or documented why not)

## 4. Database Driver Consistency

**Use ONLY `@/lib/db` (index.ts) - Never mix drivers.**

- [ ] All DB imports use `import { db } from '@/lib/db'`
- [ ] No direct imports from `@/lib/db/client` (legacy HTTP client)
- [ ] No direct `@neondatabase/serverless` imports outside lib/db
- [ ] No raw `pg` or `postgres` package imports

```bash
# Check for mixed driver usage (SHOULD BE EMPTY except lib/db itself)
grep -rn "from '@/lib/db/client'" apps/web --include="*.ts" --include="*.tsx" | grep -v "lib/db/"
grep -rn "from '@neondatabase" apps/web --include="*.ts" --include="*.tsx" | grep -v "lib/db/"
```

## 5. React Hook Best Practices

**Prevent render loops and memory leaks:**

- [ ] `useEffect` dependencies are correct and complete
- [ ] No objects/arrays created inline in dependency arrays
- [ ] `useCallback`/`useMemo` used for expensive operations passed as props
- [ ] Cleanup functions in `useEffect` for subscriptions/timers
- [ ] No state updates in render body (outside useEffect)

**Common anti-patterns to check:**
```tsx
// BAD: Object in deps causes infinite loop
useEffect(() => {...}, [{ foo: bar }])

// BAD: Function recreated each render
useEffect(() => {...}, [() => doSomething()])

// BAD: Missing cleanup
useEffect(() => {
  const interval = setInterval(...);
  // Missing: return () => clearInterval(interval)
}, [])

// BAD: State update during render
const [x, setX] = useState(0);
if (condition) setX(1); // This causes loop!
```

## 6. Run Affected Tests

```bash
pnpm vitest --run --changed
```

All tests must pass. If tests fail:
1. Analyze the failure
2. Fix the root cause (not the test)
3. Re-run until green

## 7. Visual Verification (for UI changes)

If you modified UI components:

- [ ] Start dev server: `pnpm dev`
- [ ] Navigate to affected pages
- [ ] Verify functionality works as expected
- [ ] Check browser console for errors (no React warnings!)
- [ ] Test in both light and dark modes
- [ ] Test responsive breakpoints (mobile, tablet, desktop)

## 8. Security Check

If you touched auth/payments/admin code:

- [ ] No SQL injection vulnerabilities (use parameterized queries)
- [ ] No XSS vulnerabilities (sanitize user input)
- [ ] Rate limiting is applied to sensitive endpoints
- [ ] Sentry logging is present (no console.* in production)
- [ ] Secrets are not hardcoded or logged
- [ ] CORS headers are appropriate for endpoint type

## 9. Documentation Check

- [ ] API changes documented in relevant files
- [ ] Breaking changes noted in PR description
- [ ] Complex logic has inline comments explaining "why"
- [ ] Types are accurate and exported where needed

## 10. Performance Check (for data-heavy changes)

If you modified queries or data fetching:

- [ ] N+1 queries avoided (use joins or batch loading)
- [ ] Pagination implemented for large datasets
- [ ] Caching strategy considered (Redis or TanStack Query)
- [ ] Loading states handle slow networks

## 11. Report Results

Create a verification summary in your response:

```markdown
## Verification Results

### Passed
- TypeScript: no errors
- Server/Client Boundaries: clean
- Database Drivers: consistent
- Hook Usage: no issues detected
- Tests: X/X passing
- [Other checks that passed]

### Fixed During Verification
- [Issues you found and fixed]

### Requires Human Review
- [Complex decisions or tradeoffs]
- [Areas you're uncertain about]
```

---

**CRITICAL:** Only mark the task as complete after ALL applicable checks pass.

If you cannot pass a check:
1. Document what failed and why
2. Explain what you tried
3. Ask the user for guidance before proceeding
