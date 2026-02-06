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

## Finding 3: Unbounded chat messages query — no LIMIT (High — Performance)

**File:** `apps/web/app/api/chat/conversations/[id]/route.ts:55-65`

```ts
const messages = await db
  .select({ id, role, content, toolCalls, createdAt })
  .from(chatMessages)
  .where(eq(chatMessages.conversationId, id))
  .orderBy(asc(chatMessages.createdAt));
```

No `.limit()` clause. A long conversation with hundreds or thousands of messages loads the entire history into memory. With `toolCalls` (JSONB blobs), this can produce multi-megabyte payloads, causing memory pressure and slow responses. This is a user-facing endpoint vulnerable to organic growth.

---

## Finding 4: Middleware DB query on every authenticated page navigation (High — Performance)

**File:** `apps/web/proxy.ts:340-349` → `lib/auth/proxy-state.ts:240-280`

```ts
if (needsUserState) {
  userState = await getUserState(userId);
}
```

`needsUserState` is true for every authenticated non-API request. `getUserState` hits Redis first, then falls back to a Postgres JOIN query with a 5-second timeout. Redis cache TTL is only 30 seconds for transitional users, meaning a DB round-trip from middleware every 30 seconds. During Neon cold starts, the 5-second timeout means pages can hang for 5 seconds before fallback.

---

## Finding 5: Non-atomic job dedup — SELECT-then-INSERT race condition (High — Stability)

**File:** `apps/web/lib/ingestion/jobs.ts` (repeated ~7 times, e.g., lines 57-94)

```ts
const existing = await db.select({ id }).from(ingestionJobs).where(...).limit(1);
if (existing.length > 0) return existing[0].id;
const [inserted] = await db.insert(ingestionJobs).values({...}).returning({ id });
```

Two concurrent calls with the same dedup key can both see no existing row and both insert, creating duplicate jobs. Since the Neon HTTP driver doesn't support transactions, an `INSERT ... ON CONFLICT DO NOTHING` with a unique constraint on `(jobType, dedupKey)` is the correct fix.

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

## Finding 9: No rate limiting on expensive endpoints (High — Stability)

Multiple endpoints with expensive operations have no rate limiting:

- **`api/dsp/discover/route.ts:38`** — Each call enqueues external API discovery jobs (Spotify, Apple Music, Deezer). Spam-clickable.
- **`api/admin/fit-scores/route.ts:171`** — `recalculate_all` can process 500 profiles with Spotify enrichment.
- **`api/chat/conversations/route.ts:71`** — No rate limit on conversation creation.
- **`api/admin/creator-ingest/route.ts:252`** — Fetches external Linktree/Laylo profiles.

A user rapidly clicking "discover" floods the job queue. Admin endpoints without rate limits are vulnerable to accidental or malicious overload.

---

## Finding 10: Sequential Stripe API calls that should be parallelized (High — Performance)

**File:** `apps/web/app/api/stripe/plan-change/route.ts:126-175`

```ts
const customerResult = await ensureStripeCustomer();
const planOptions = await getAvailablePlanChanges(customerResult.customerId);
const subscription = await getActiveSubscription(customerResult.customerId);
```

Three sequential Stripe API calls with no timeout. `getAvailablePlanChanges` and `getActiveSubscription` are independent and could be parallelized with `Promise.all`. Same issue in `api/admin/overview/route.ts:41-43` where `getStripeMrr()` and `getWaitlistCount()` run sequentially.

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

## Finding 14: Spotify token fetch has no timeout (Medium — Stability)

**File:** `apps/web/lib/dsp-enrichment/providers/spotify.ts:115-124`

```ts
const response = await fetch('https://accounts.spotify.com/api/token', { ... });
```

Actual Spotify API requests have a 10-second timeout via `AbortController`, but the token acquisition request has none. If `accounts.spotify.com` is slow or unreachable, this hangs indefinitely, blocking all downstream Spotify operations.

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

## Finding 16: `useKeyboardShortcuts` re-subscribes global listener on every render (Medium — Performance)

**File:** `apps/web/hooks/useKeyboardShortcuts.ts:41-67`

```ts
useEffect(() => {
  const handler = (e: KeyboardEvent) => { ... };
  globalThis.addEventListener('keydown', handler);
  return () => globalThis.removeEventListener('keydown', handler);
}, [shortcuts]); // shortcuts is inline array = new ref every render
```

Callers pass inline arrays, so `shortcuts` reference changes every render. The effect unsubscribes and resubscribes the global `keydown` listener on every render cycle. Should use a ref for the shortcuts and keep the effect dependency-free.

---

## Finding 17: SentryDashboardProvider polls at 500ms with no stop condition (Medium — Performance)

**File:** `apps/web/components/providers/SentryDashboardProvider.tsx:244-249`

```tsx
const interval = setInterval(() => { checkState(); }, 500);
```

Polls every 500ms indefinitely with no condition to stop once upgrade completes or fails. Each poll does a dynamic import and two function calls. Creates a permanent 500ms timer for the lifetime of any component using this hook.

---

## Finding 18: Analytics CTE materializes entire unbounded event history (Medium — Performance)

**File:** `apps/web/lib/db/queries/analytics.ts:108-113`

```sql
with base_events as (
  select * from click_events
  where creator_profile_id = $1
    and (is_bot = false or is_bot is null)
)
```

The `base_events` CTE selects every non-bot click event for a profile with no LIMIT or time filter. For high-traffic profiles, this materializes millions of rows. `SELECT *` fetches all columns (including `metadata` JSONB, `userAgent`, `ipAddress`) when only a few are needed downstream. The `top_links` sub-CTE groups on full history rather than the selected date range.

---

## Finding 19: DSP matches query has no LIMIT (Medium — Performance)

**File:** `apps/web/app/api/dsp/matches/route.ts:82-101`

```ts
const matches = await db
  .select({ id, providerId, ... /* 10+ columns */ })
  .from(dspArtistMatches)
  .where(and(...conditions))
  .orderBy(dspArtistMatches.createdAt);
```

No `.limit()` clause. If a profile accumulates many match records from repeated discovery runs across multiple providers, this returns all of them unbounded. Should have pagination or a reasonable limit.

---

## Finding 20: Sequential notification processing in cron (one await per notification) (Medium — Performance)

**File:** `apps/web/app/api/cron/send-release-notifications/route.ts:669-680`

```ts
for (const notification of pendingNotifications) {
  const result = await processNotificationWithBatchedData(
    { now, notification }, releasesMap, creatorsMap, subscribersMap, linksMap
  );
  if (result === 'sent') totalSent++;
  if (result === 'failed') totalFailed++;
}
```

Each notification processed sequentially (one await per iteration), involving a `claimNotification` DB write, `updateNotificationStatus` DB write, and `sendNotification` external API call. With 100 notifications (BATCH_SIZE), this runs serially. Should use controlled-concurrency batches (like the ingestion scheduler already does with `MAX_CONCURRENT_JOBS = 3`).

---

## Summary

| #  | Finding | Severity | Category |
|----|---------|----------|----------|
| 1  | `withTransaction` doesn't create transactions | Critical | Correctness |
| 2  | `SET LOCAL` session vars are no-ops | Critical | Security |
| 3  | Unbounded chat messages query | High | Performance |
| 4  | Middleware DB query on every auth page load | High | Performance |
| 5  | Non-atomic job dedup race condition | High | Stability |
| 6  | `batchUpdateInTransaction` is not transactional | High | Correctness |
| 7  | Cache prefix invalidation skips Redis | High | Staleness |
| 8  | Null results never cached (stampede) | High | Performance |
| 9  | No rate limiting on expensive endpoints | High | Stability |
| 10 | Sequential Stripe calls (should be parallel) | High | Performance |
| 11 | HeaderActionsProvider cascading re-renders | High | Performance |
| 12 | Audience table columns recreated on every click | High | Performance |
| 13 | `useDedupedFetchAll` infinite re-fetch risk | Medium | Stability |
| 14 | Spotify token fetch has no timeout | Medium | Stability |
| 15 | Cron auth bypass in non-production | Medium | Security |
| 16 | `useKeyboardShortcuts` re-subscribes every render | Medium | Performance |
| 17 | SentryDashboardProvider polls forever at 500ms | Medium | Performance |
| 18 | Analytics CTE materializes unbounded history | Medium | Performance |
| 19 | DSP matches query has no LIMIT | Medium | Performance |
| 20 | Sequential notification cron processing | Medium | Performance |
