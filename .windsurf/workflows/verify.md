---
description: Self-verification checklist before completing tasks
---

# Verify Workflow

Verify your own work before completing the task. This 2-3x's code quality by catching issues before human review.

## 1. Build & Type Check

Run validation commands:

```bash
pnpm turbo typecheck --filter=@jovie/web
pnpm biome check .
```

If errors exist, fix them before proceeding.

## 2. Run Affected Tests

```bash
pnpm vitest --run --changed
```

All tests must pass. If tests fail:
1. Analyze the failure
2. Fix the root cause (not the test)
3. Re-run until green

## 3. Visual Verification (for UI changes)

If you modified UI components:

- [ ] Start dev server: `pnpm dev`
- [ ] Navigate to affected pages
- [ ] Verify functionality works as expected
- [ ] Check browser console for errors
- [ ] Test in both light and dark modes
- [ ] Test responsive breakpoints (mobile, tablet, desktop)

## 4. Security Check

If you touched auth/payments/admin code:

- [ ] No SQL injection vulnerabilities (use parameterized queries)
- [ ] No XSS vulnerabilities (sanitize user input)
- [ ] Rate limiting is applied to sensitive endpoints
- [ ] Sentry logging is present (no console.* in production)
- [ ] Secrets are not hardcoded or logged
- [ ] CORS headers are appropriate for endpoint type

## 5. Documentation Check

- [ ] API changes documented in relevant files
- [ ] Breaking changes noted in PR description
- [ ] Complex logic has inline comments explaining "why"
- [ ] Types are accurate and exported where needed

## 6. Performance Check (for data-heavy changes)

If you modified queries or data fetching:

- [ ] N+1 queries avoided (use joins or batch loading)
- [ ] Pagination implemented for large datasets
- [ ] Caching strategy considered (Redis or TanStack Query)
- [ ] Loading states handle slow networks

## 7. Report Results

Create a verification summary in your response:

```markdown
## Verification Results

### Passed
- TypeScript: no errors
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
