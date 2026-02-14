# Performance & Stability Audit

**Date:** 2026-02-06
**Scope:** Full codebase audit of `apps/web/` — API routes, database layer, React components, middleware, and infrastructure code.

---

## Finding 1: `withTransaction` does NOT create transactions (Critical — Correctness)

**File:** `apps/web/lib/db/client/session.ts:64-88`

```ts
export async function withTransaction<T>(
  operation: (tx: TransactionType) => Promise<T>,
  context = DB_CONTEXTS.transaction
): Promise<{ data?: T; error?: Error }> {
  // ...
  return await operation(db as unknown as TransactionType);
```

The function signature and name promise ACID transactional guarantees, but it casts the raw `db` connection to `TransactionType` via `as unknown as`. Callers expecting atomicity get none — if any operation within throws, previous writes are already committed. The `as unknown as` double-cast is a type-system escape hatch hiding a fundamental behavioral lie. The same pattern appears in `withDbSessionTx` in `lib/auth/session.ts:91-100`.

---

## Finding 2: `SET LOCAL` session variables are no-ops (Critical — Security)

**File:** `apps/web/lib/db/client/session.ts:38-57`

```ts
await db.execute(drizzleSql`SET LOCAL app.user_id = ${userId}`);
await db.execute(drizzleSql`SET LOCAL app.clerk_user_id = ${userId}`);
```

`SET LOCAL` only persists within the current transaction. The Neon HTTP driver is stateless — each `db.execute()` is a separate HTTP request on potentially different connections. These `SET LOCAL` statements expire immediately. Any RLS policies depending on `app.user_id` will not see these values in subsequent queries. The same issue exists in `lib/ingestion/session.ts:13-24` where `set_config(..., true)` (transaction-scoped) is used before a non-transactional operation.

---

## ~~Finding 3: Unbounded chat messages query — no LIMIT~~ (RESOLVED)

**File:** `apps/web/app/api/chat/conversations/[id]/route.ts:85-88`

**Status:** Fixed. The query now uses cursor-based pagination with `.limit(limit + 1)` and returns a `hasMore` flag for the client. Verified 2026-02-09.

```ts
.orderBy(desc(chatMessages.createdAt))
.limit(limit + 1);
const hasMore = rows.length > limit;
if (hasMore) rows.pop();
```

---

## Finding 4: Middleware DB query on every authenticated page navigation (High — Performance) — MITIGATED

**File:** `apps/web/proxy.ts:340-349` → `lib/auth/proxy-state.ts:240-280`

```ts
if (needsUserState) {
  userState = await getUserState(userId);
}
```

**Update (2026-02-09):** `getUserState` uses a 3-layer caching strategy that mitigates the concern:
1. **In-memory cache** — 5-10s TTL, serves most requests without any I/O
2. **Redis cache** — 2-5 minute TTL (not 30s as originally reported), avoids DB in cross-instance scenarios
3. **DB fallback** — only hit when both memory and Redis miss

The Redis TTL for transitional users is **2 minutes** (120s), not 30s. Most requests are served from the in-memory layer. The Neon cold-start concern remains valid but is mitigated by the multi-layer cache.

---

## Finding 5: Non-atomic job dedup — SELECT-then-INSERT race condition (High — Stability) — MITIGATED

**File:** `apps/web/lib/ingestion/jobs.ts` (repeated ~7 times, e.g., lines 57-94)

**Update (2026-02-09):** The code already includes race condition mitigation:
1. `INSERT ... ON CONFLICT DO NOTHING` via `onConflictDoNothing({ target: ingestionJobs.dedupKey })` — prevents actual duplicate rows
2. Fallback SELECT after a conflict — retrieves the winner's ID

The SELECT-then-INSERT pattern is still used for the fast path (skip the INSERT entirely if job already exists), but the `onConflictDoNothing` ensures correctness under concurrency. No duplicate jobs are created. Could be simplified to INSERT-first but the current approach is functionally correct.

---

## Finding 6: `batchUpdateInTransaction` is not transactional (High — Correctness)

**File:** `apps/web/lib/db/batch.ts:140-154`

```ts
export async function batchUpdateInTransaction<T>(updates, updateFn) {
  for (const update of updates) {
    await updateFn(db, update.id, update.data); // No transaction!
  }
  return updates.length;
}
```

Despite the function name, there is no transaction. Each update is independently committed. If update 5 of 10 fails, updates 1-4 are permanent. Callers choosing this function for atomicity get none. Also, each `await` is a separate Neon HTTP round-trip — N updates = N sequential HTTP requests with network latency.

---

## Finding 7: Cache invalidation by prefix skips Redis entirely (High — Staleness)

**File:** `apps/web/lib/db/cache.ts:221-237`

```ts
export async function invalidateCacheByPrefix(prefix: string): Promise<void> {
  const deleted = memoryCache.deleteByPrefix(fullPrefix);
  // For Redis, we'd need SCAN which isn't ideal for Upstash REST API
  // For now, rely on TTL expiration for Redis prefix invalidation
}
```

After mutations, only the local process's in-memory cache is cleared. All other server instances continue serving stale data from Redis for up to 60 seconds (`DEFAULT_TTL_SECONDS`). In multi-instance deployments, writes appear to not take effect for up to a minute on other instances.

---

## Finding 8: Null query results are never cached — cache stampede on 404 paths (High — Performance)

**File:** `apps/web/lib/db/cache.ts:160-176`

```ts
const memoryResult = memoryCache.get(cacheKey) as T | null;
if (memoryResult !== null) return memoryResult; // null = cache miss

const redisResult = await tryReadFromRedis<T>(cacheKey);
if (redisResult !== null) { ... } // null = cache miss
```

Legitimate `null` results (e.g., "user not found") are treated as cache misses and re-execute the query every time. For non-existent usernames or IDs (bots probing URLs, 404 paths), every request hits the database. Should use a sentinel wrapper like `{ hit: true, value: null }`.

---

## ~~Finding 9: No rate limiting on expensive endpoints~~ (RESOLVED)

**Update (2026-02-09):** All four endpoints now have proper rate limiting with 429 responses and `Retry-After` headers:

- **`api/dsp/discover/route.ts`** — `checkDspDiscoveryRateLimit(userId)` with rate limit headers
- **`api/admin/fit-scores/route.ts`** — `checkAdminFitScoresRateLimit(adminUserId)`
- **`api/chat/conversations/route.ts`** — `checkAiChatRateLimit(userId)` (also applies to chat route)
- **`api/admin/creator-ingest/route.ts`** — `checkAdminCreatorIngestRateLimit(adminUserId)`

All verified 2026-02-09.

---

## Finding 10: Sequential Stripe API calls that should be parallelized (High — Performance) — PARTIALLY RESOLVED

**File:** `apps/web/app/api/stripe/plan-change/route.ts:126-175`

```ts
const customerResult = await ensureStripeCustomer();
const planOptions = await getAvailablePlanChanges(customerResult.customerId);
const subscription = await getActiveSubscription(customerResult.customerId);
```

**Update (2026-02-09):**
- `ensureStripeCustomer()` must run first (the other calls depend on `customerId`), so the POST handler is sequential by necessity.
- The GET handler already uses `Promise.all()` for parallel fetches.
- `api/admin/overview/route.ts` — `getStripeMrr()` and `getWaitlistCount()` already run in parallel via `Promise.all()`. Verified 2026-02-09.

---

## Finding 11: HeaderActionsProvider causes cascading re-renders across the shell (High — Performance)

**File:** `apps/web/contexts/HeaderActionsContext.tsx:52-68`

```tsx
const value = useMemo(
  () => ({ headerActions, setHeaderActions, headerBadge, setHeaderBadge }),
  [headerActions, setHeaderActions, headerBadge, setHeaderBadge]
);
```

`headerActions` and `headerBadge` are `ReactNode` values in the `useMemo` deps. When any child calls `setHeaderActions(<SomeJSX />)`, the context value changes, re-rendering **all** consumers. Multiple components (ReleaseProviderMatrix, ContactsTable) call `setHeaderActions` inside `useEffect`, triggering re-renders of the entire shell layout. Should be split into separate state/setter contexts.

---

## Finding 12: Audience table column definitions recreated on every interaction (High — Performance)

**File:** `apps/web/components/dashboard/organisms/dashboard-audience-table/DashboardAudienceTableUnified.tsx:139-227`

```tsx
const memberColumns = useMemo<ColumnDef<AudienceMember, any>[]>(
  () => [...],
  [page, pageSize, selectedIds, toggleSelect, openMenuRowId, setOpenMenuRowId, getContextMenuItems]
);
```

`selectedIds` is a `Set` (new reference on each selection), `openMenuRowId` changes on menu open. Columns are recreated on nearly every user interaction, triggering TanStack Table's full column recalculation pipeline. `ReleaseTable` handles this correctly with stable refs — this component should follow the same pattern.

---

## Finding 13: `useDedupedFetchAll` creates unstable dependency causing infinite re-fetches (Medium — Stability)

**File:** `apps/web/lib/fetch/use-deduped-fetch.ts:320-369`

```ts
const { skip = false, ...fetchOptions } = options;
const fetchAll = useCallback(async (forceRefresh = false) => { ... },
  [urls, skip, fetchOptions] // fetchOptions is a new object every render
);
```

The spread `...fetchOptions` creates a new object reference each render. It's in the `useCallback` deps, so `fetchAll` is recreated every render, which triggers the `useEffect` to re-fire, causing a potential infinite fetch loop.

---

## ~~Finding 14: Spotify token fetch has no timeout~~ (RESOLVED)

**File:** `apps/web/lib/spotify/client.ts`

**Update (2026-02-09):** The Spotify token fetch now uses `AbortSignal.timeout(SPOTIFY_DEFAULT_TIMEOUT_MS)`. All Spotify API requests (including token acquisition) have proper timeouts via `createAbortWithTimeout()`. Verified 2026-02-09.

---

## Finding 15: Cron auth bypass in non-production environments (Medium — Security)

**File:** `apps/web/app/api/cron/process-campaigns/route.ts:22-31`

```ts
if (process.env.NODE_ENV === 'production') {
  // auth check only in production
}
```

Auth check only runs in production. In staging/preview, anyone can trigger campaign processing and email sending. Compare to `send-release-notifications` which correctly checks in all environments.

---

## ~~Finding 16: `useKeyboardShortcuts` re-subscribes global listener on every render~~ (RESOLVED)

**File:** `apps/web/hooks/useKeyboardShortcuts.ts:41-75`

**Update (2026-02-09):** The hook now uses the ref pattern correctly:
1. `shortcutsRef` stores the current shortcuts array (updated via effect on each render)
2. The event listener effect uses `[]` empty deps — listener attached **once** and never resubscribed
3. The handler reads from `shortcutsRef.current` to always have latest shortcuts

```ts
const shortcutsRef = useRef(shortcuts);
useEffect(() => { shortcutsRef.current = shortcuts; });  // Sync ref
useEffect(() => {
  const handler = (e: KeyboardEvent) => { /* reads shortcutsRef.current */ };
  globalThis.addEventListener('keydown', handler);
  return () => globalThis.removeEventListener('keydown', handler);
}, []);  // Empty deps — attached once
```

Verified 2026-02-09.

---

## Finding 17: SentryDashboardProvider polls at 500ms with no stop condition (Medium — Performance)

**File:** `apps/web/components/providers/SentryDashboardProvider.tsx:244-249`

```tsx
const interval = setInterval(() => { checkState(); }, 500);
```

Polls every 500ms indefinitely with no condition to stop once upgrade completes or fails. Each poll does a dynamic import and two function calls. Creates a permanent 500ms timer for the lifetime of any component using this hook.

---

## Finding 18: Analytics CTE materializes entire unbounded event history (Medium — Performance) — PARTIALLY VALID

**File:** `apps/web/lib/db/queries/analytics.ts:108-113`

**Update (2026-02-09):** The CTE structure is intentional:
- `base_events` is unwindowed **by design** — it provides all-time total counts (a dashboard feature)
- `ranged_events` and `recent_events` CTEs **do** have proper time filters (`created_at >= startDate`)
- The query uses explicit column selection, NOT `SELECT *` — only needed columns are fetched

The `base_events` CTE could still benefit from a time floor for very old profiles with millions of events, but the current architecture is intentional for all-time stats. The `SELECT *` and missing-time-filter claims were inaccurate.

---

## ~~Finding 19: DSP matches query has no LIMIT~~ (RESOLVED)

**File:** `apps/web/app/api/dsp/matches/route.ts:82-101`

**Update (2026-02-09):** The query now has `limit(MAX_MATCHES)` with `MAX_MATCHES = 200`. It also uses explicit column selection (not `SELECT *`). Verified 2026-02-09.

---

## ~~Finding 20: Sequential notification processing in cron~~ (RESOLVED)

**File:** `apps/web/app/api/cron/send-release-notifications/route.ts`

**Update (2026-02-09):** The cron now uses parallel batch processing:
- `CONCURRENCY_BATCH_SIZE = 10` — processes 10 notifications concurrently per batch
- `MAX_NOTIFICATIONS_PER_RUN = 100` — caps total per invocation
- Uses `Promise.allSettled()` for concurrent processing within each batch
- Pre-fetches related data (releases, creators, subscribers, links) in bulk maps to avoid N+1 queries

Verified 2026-02-09.

---

## Summary

| #  | Finding | Severity | Category | Status |
|----|---------|----------|----------|--------|
| 1  | `withTransaction` doesn't create transactions | Critical | Correctness | Open |
| 2  | `SET LOCAL` session vars are no-ops | Critical | Security | Open |
| 3  | ~~Unbounded chat messages query~~ | ~~High~~ | ~~Performance~~ | **RESOLVED** — has cursor pagination with LIMIT |
| 4  | Middleware DB query on every auth page load | High | Performance | **MITIGATED** — 3-layer cache (memory/Redis/DB) |
| 5  | Non-atomic job dedup race condition | High | Stability | **MITIGATED** — `onConflictDoNothing` + fallback |
| 6  | `batchUpdateInTransaction` is not transactional | High | Correctness | Open |
| 7  | Cache prefix invalidation skips Redis | High | Staleness | Open |
| 8  | Null results never cached (stampede) | High | Performance | Open |
| 9  | ~~No rate limiting on expensive endpoints~~ | ~~High~~ | ~~Stability~~ | **RESOLVED** — all 4 endpoints rate-limited |
| 10 | Sequential Stripe calls (should be parallel) | High | Performance | **PARTIALLY RESOLVED** — GET parallel, POST sequential by necessity |
| 11 | HeaderActionsProvider cascading re-renders | High | Performance | Open |
| 12 | Audience table columns recreated on every click | High | Performance | Open |
| 13 | `useDedupedFetchAll` infinite re-fetch risk | Medium | Stability | Open |
| 14 | ~~Spotify token fetch has no timeout~~ | ~~Medium~~ | ~~Stability~~ | **RESOLVED** — has `AbortSignal.timeout()` |
| 15 | Cron auth bypass in non-production | Medium | Security | Open |
| 16 | ~~`useKeyboardShortcuts` re-subscribes every render~~ | ~~Medium~~ | ~~Performance~~ | **RESOLVED** — uses ref pattern + empty deps |
| 17 | SentryDashboardProvider polls forever at 500ms | Medium | Performance | Open |
| 18 | Analytics CTE materializes unbounded history | Medium | Performance | **PARTIALLY VALID** — intentional for all-time stats |
| 19 | ~~DSP matches query has no LIMIT~~ | ~~Medium~~ | ~~Performance~~ | **RESOLVED** — `limit(200)` |
| 20 | ~~Sequential notification cron processing~~ | ~~Medium~~ | ~~Performance~~ | **RESOLVED** — parallel batches of 10 |
