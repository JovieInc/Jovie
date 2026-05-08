# Testing

E2E patterns, test performance, coverage philosophy, verify-before-done.

## Stack

- Unit tests: Vitest with jsdom
- E2E tests: Playwright
- Focus on user behavior, not implementation details

## New Test File Convention

Co-locate with source: `{name}.test.ts` or `{name}.test.tsx` (not `__tests__/` directories unless shared fixtures are needed).

```typescript
import { describe, expect, it, vi } from 'vitest';
```

Name tests by behavior: `describe('ComponentName')` → `it('shows error when input is empty')`.

## E2E Authentication with Clerk

See `.claude/rules/auth.md` → "E2E Authentication with Clerk" for the canonical helpers, do-not patterns, and golden-path references. Cleanup is mandatory after any session that creates test accounts.

## Next Cache APIs In Shared Test Helpers

- Helpers used by Playwright global setup, `tsx` seed scripts, or any plain Node entrypoint must not call `revalidateTag()` or `revalidatePath()` unguarded.
- Those Next cache APIs require a Next request/static-generation context and will throw `Invariant: static generation store missing` in plain Node.
- If cache invalidation is best-effort in a shared helper, catch only that specific missing-context invariant and continue; rethrow all other errors.

## General E2E Rules (Required)

- Every E2E test must include meaningful assertions on behavior/outcomes (not just render/no-crash checks).
- Music fetch must remain real in integration/E2E coverage: if slow, increase timeout; do not mock the enrichment fetch.
- Stripe flows must run in Stripe test mode and use test card `4242 4242 4242 4242`.
- Do not assert on CSS values, spacing/padding, or brittle copy text.
- Prefer stable `data-testid` selectors over fragile structural selectors.

## Test Performance (CI Runtime Is a First-Class Constraint)

Tests are part of the deploy path. Slow tests slow shipping. Test runtime performance is a functional requirement of the testing system itself.

**Core Rule:** Any test that materially slows CI without proportional risk reduction is considered harmful, even if it is "correct."

### Why This Matters (Pre-PMF Context)

- We're pre product-market fit — iteration speed is critical.
- Gated CI tests must run fast enough to support 2–3 deploys per day.
- Test runtime must not grow unbounded over time.
- Added tests must justify their runtime cost with real risk coverage.

### Gated CI (Deploy-Blocking)

| Allowed | Not Allowed |
|---------|-------------|
| Fast, deterministic tests | Long-running E2E |
| Focused unit/integration tests | Exhaustive fuzzing |
| Minimal fixture setup | Large fixture setup |
| Mocked external calls | Real network, sleep, or polling loops |

### Nightly / Async Jobs

- May be slow and exhaustive.
- May trade speed for coverage.
- Must never block deploys.

### Agent Rules

| Do | Don't |
|----|-------|
| Prefer fewer, stronger assertions over more tests | Add slow tests to gated CI by default |
| Collapse redundant tests | Increase CI runtime without explaining why |
| Move slow or high-cardinality tests to nightly | Justify slow tests with "better coverage" alone |
| Call out expected runtime impact in PRs when adding tests | |

### Signs of a Broken Test Suite

- CI time increases noticeably without corresponding risk reduction.
- Engineers avoid deploys due to slow feedback.
- Tests are skipped locally to save time.

**Default Bias:** When there's a tradeoff between test thoroughness and iteration speed in gated CI, bias toward speed and move thoroughness to nightly runs.

## Test Coverage Guidelines (When to Write Tests)

Tests must be written **at feature creation time**, not retroactively. Apply coverage selectively — don't slow iteration speed.

### Tests REQUIRED for

- Core logic and data processing (parsers, transformers, validators)
- API routes and server actions (contract with frontend)
- Gating systems (waitlist, auth, permissions, entitlements)
- Deterministic workflows (intent router, feedback submission, CRUD operations)
- Backend services and data pipelines (ingestion, enrichment, jobs)
- Database queries and mutations (especially complex joins/filters)

### Tests may be SKIPPED for

- Rapidly changing UI components (layout, styling, copy changes)
- Prototype/experimental features still in flux
- Pure presentation components with no logic
- Marketing page content and static pages

### Coverage philosophy

- No strict coverage % targets — quality over quantity.
- Deterministic workflows must have 100% path coverage.
- AI-dependent workflows should use mocked LLM responses for determinism.
- Focus testing where correctness and reliability are critical.

| Area | Tests Required? | Why |
|------|----------------|-----|
| Intent router patterns | Yes | Deterministic, must be reliable |
| Waitlist/auth gating | Yes | Security-critical gating |
| API route handlers | Yes | Contract with frontend |
| Server actions (CRUD) | Yes | Data integrity |
| Ingestion/enrichment pipelines | Yes | Data correctness |
| Dashboard layout | No | Changes frequently, visual |
| Homepage copy | No | Marketing, iterates fast |
| Feedback submission flow | Yes | Deterministic workflow |

## Verify Before Marking Done

Never mark a task complete without confirming the fix works:

- Run the relevant test file: `pnpm --filter web exec vitest run <test-file>`
- Run typecheck: `pnpm --filter @jovie/web run typecheck -- --pretty false`
- For UI changes: confirm the component renders without errors
- For API changes: confirm the endpoint returns expected shape
- Paste the passing output as evidence in the PR description

## Reference

- Full E2E details: `apps/web/tests/TESTING.md`
- Testing philosophy: `docs/TESTING_GUIDELINES.md`
