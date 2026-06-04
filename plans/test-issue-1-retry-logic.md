---
type: plan
title: Test Issue 1 Implementation Plan - Retry Logic for Cache Tag Sanitization
status: draft
ingested_via: 'mcp:put_page'
ingested_at: '2026-05-29T02:06:06.293Z'
source_kind: 'mcp:put_page'
tags:
  - cache
  - implementation
  - jovie-v1
  - retry
---

# Implementation Plan: Test Issue 1 - Add Retry Logic to Cache Tag Sanitization

## Summary

Add exponential backoff retry logic to the `sanitizeCacheTag` and `sanitizeCacheTags` functions in `apps/web/lib/cache/tags.ts`. These functions run on every API response before setting HTTP cache headers. The retry handles transient failures from upstream header validation services.

## Worktree

- **Name**: `test/retry-logic-cache-tags`
- **Location**: `~/conductor/repos/jovie-v1/.claude/worktrees/test-retry-logic-cache-tags`
- **Base branch**: `fix/sentry-7506404179-invalid-header-cache-tags` (current HEAD: `9ea9d8af3`)
- **Create command**: `git worktree add .claude/worktrees/test-retry-logic-cache-tags fix/sentry-7506404179-invalid-header-cache-tags`

## Current Code Analysis

### Target file: `apps/web/lib/cache/tags.ts`

The current sanitizer is a synchronous string replacement (lines 109-111):

```typescript
export function sanitizeCacheTag(tag: string): string {
  return tag.replace(INVALID_HEADER_CHARS, '');
}
```

And the batch version (lines 116-127):

```typescript
export function sanitizeCacheTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const tag of tags) {
    const sanitized = sanitizeCacheTag(tag);
    if (sanitized && !seen.has(sanitized)) {
      seen.add(sanitized);
      result.push(sanitized);
    }
  }
  return result;
}
```

### Current test file: `apps/web/tests/unit/lib/cache/tags.test.ts`

Uses Vitest with `describe`/`it` pattern. Currently has ~20 test cases covering tag constants, TTL values, helper functions, and type safety. No tests exist yet for retry behavior.

### Callers

- `apps/web/app/[username]/[slug]/_lib/data.ts` (lines 104, 267) - uses `sanitizeCacheTags` in `unstable_cache` options

## Changes Required

### File 1: `apps/web/lib/cache/logs.ts` (NEW FILE)

Create a minimal logger utility for the cache module. This avoids adding a dependency on the main app logger and keeps the cache module self-contained.

**Path**: `apps/web/lib/cache/logs.ts`

Content:
- Export a `logger` object with `warn` and `error` methods
- Use `console.warn` and `console.error` internally
- Prefix all messages with `[cache]` for easy grep/filter

### File 2: `apps/web/lib/cache/tags.ts` (MODIFY)

#### Change 2a: Add imports and retry constants

Import the new logger, add after existing error code comment block.

Add retry constants after the `INVALID_HEADER_CHARS` regex (after line 100):

```
const SANITIZE_MAX_RETRIES = 3;
const SANITIZE_BASE_DELAY_MS = 100;
```

#### Change 2b: Add private `sleep` helper

```typescript
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

#### Change 2c: Rewrite `sanitizeCacheTag` with retry logic (replace lines 109-111)

The replacement is async with a for loop (3 attempts). Each catch logs with `logger.warn` including attempt number and error. On final failure, throws with the original tag value in the error message.

Key design decisions:
- `tag.replace()` rarely throws in practice, so the try/catch captures truly unexpected errors
- Exponential backoff: attempt 1 = 100ms, attempt 2 = 200ms, attempt 3 = no delay (final attempt)
- The final error message includes the original tag value for debugging
- Each retry is logged with `logger.warn` including the specific error message

#### Change 2d: Update `sanitizeCacheTags` to be async

The function body stays the same except `sanitizeCache(tag)` becomes `await sanitizeCacheTag(tag)`. Return type changes to `Promise<string[]>`.

### File 3: `apps/web/app/[username]/[slug]/_lib/data.ts` (MODIFY)

Two call sites need `await` since `sanitizeCacheTags` is now async:

#### Change 3a: Line ~104 (`getCreatorByUsername`)

Before `unstable_cache`, compute tags via `await sanitizeCacheTags([...])` then pass the resolved array.

#### Change 3b: Line ~267 (content fetch function)

Same pattern - compute tags before `unstable_cache` call.

### File 4: `apps/web/tests/unit/lib/cache/tags.test.ts` (MODIFY)

#### Change 4a: Add imports and mocks

- Import `sanitizeCacheTag`, `sanitizeCacheTags`, `vi`
- Mock `@/lib/cache/logs` with `vi.mock` using `vi.hoisted` fns for `logger.warn` and `logger.error`

#### Change 4b: Test cases to add

1. **Success on first try (clean tag)**: Input `'profile:johndoe'` returns `'profile:johndoe'`, no warn logged
2. **Success on first try (with sanitization)**: Input with null bytes returns cleaned string, no warn logged
3. **Success on retry**: Mock `String.prototype.replace` to throw on first call only, verify it succeeds on second attempt, verify warn was called once
4. **Failure after all retries**: Mock `String.prototype.replace` to always throw, verify `rejects.toThrow` with message containing the original tag value, verify warn called twice (for attempts 1 and 2), verify 3 total replace calls
5. **Dedup after sanitization**: Mixed valid/invalid tags still deduplicate correctly
6. **Empty result**: All-invalid tags return empty array

Full "all retries fail" test implementation:
- Use `vi.spyOn(String.prototype, 'replace')` to force throws
- Inside try/finally to restore original
- Assert error message format includes original tag value
- Use `vi.useRealTimers()` to avoid fake timer interference
- Assert mockLoggerWarn call count (2 = retries 1 and 2, not final)

#### Change 4c: Vitest config note

Test timeout is 5000ms in `vitest.config.fast.mts`. With 100ms + 200ms = 300ms total retry delay, tests will complete well within the timeout. No config changes needed.

## Risk Assessment

- **Low risk**: `sanitizeCacheTags` is only called in two places, both already inside async functions
- **Breaking change**: Both functions change from sync to async - all callers must be updated (2 sites identified)
- **No logger dependency**: New `logs.ts` module avoids pulling in heavy logging frameworks
- **No test config changes**: Default 5000ms timeout sufficient for 300ms total retry delay

## File Change Summary

| File | Action | Description |
|------|--------|-------------|
| `apps/web/lib/cache/logs.ts` | CREATE | Minimal logger for cache module |
| `apps/web/lib/cache/tags.ts` | MODIFY | Add retry logic to `sanitizeCacheTag` and `sanitizeCacheTags`; make both async |
| `apps/web/app/[username]/[slug]/_lib/data.ts` | MODIFY | Await `sanitizeCacheTags` at both call sites |
| `apps/web/tests/unit/lib/cache/tags.test.ts` | MODIFY | Add retry behavior tests |

## Verification Steps

1. `npx vitest run apps/web/tests/unit/lib/cache/tags.test.ts` - all existing + new tests pass
2. `npx vitest run apps/web/tests/unit/profile/cache-invalidation.test.ts` - existing profile tests still pass (they mock `@/lib/cache/tags`)
3. `cd apps/web && npx tsc --noEmit` - no type errors from the async signature change
4. Full test suite: `cd ~/conductor/repos/jovie-v1 && npx turbo test --filter=web`
