# Core Logic Refactoring Recommendations

This document identifies core logic in the Jovie codebase that would benefit from refactoring or restructuring. Each recommendation includes the current state, issues identified, and suggested improvements.

---

## 1. Ingestion Processor - High Priority

**File:** `apps/web/lib/ingestion/processor.ts` (1104 lines)

### Issues Identified

**Severe Code Duplication in Job Processing Functions:**

The functions `processLinktreeJob`, `processLayloJob`, `processYouTubeJob`, and `processBeaconsJob` (lines 602-1103) follow an identical pattern:

```typescript
// Each function does:
1. Parse payload with schema
2. Fetch profile from database
3. Update ingestionStatus to 'processing'
4. Try-catch around:
   - Fetch document
   - Extract data
   - Normalize and merge
   - Enqueue followup jobs
   - Update status to 'idle'
5. On error: update status to 'failed' with error message
```

This pattern is repeated **4 times** with only the following variations:
- Payload schema
- Document fetch function
- Extraction function
- Error message prefix

### Recommended Refactoring

**Extract a Generic Job Processing Template:**

```typescript
// Suggested: lib/ingestion/job-executor.ts

interface JobExecutorConfig<TPayload> {
  payloadSchema: z.ZodSchema<TPayload>;
  fetchDocument: (payload: TPayload) => Promise<string | object>;
  extractData: (document: string | object) => ExtractionResult;
  platformName: string;
}

async function executeIngestionJob<TPayload>(
  tx: DbType,
  jobPayload: unknown,
  config: JobExecutorConfig<TPayload>
): Promise<JobResult> {
  const parsed = config.payloadSchema.parse(jobPayload);
  const profile = await fetchProfileForJob(tx, parsed.creatorProfileId);

  await setIngestionStatus(tx, profile.id, 'processing');

  try {
    const document = await config.fetchDocument(parsed);
    const extraction = config.extractData(document);
    const result = await normalizeAndMergeExtraction(tx, profile, extraction);

    await enqueueFollowupIngestionJobs({
      tx,
      creatorProfileId: profile.id,
      currentDepth: parsed.depth,
      extraction,
    });

    await setIngestionStatus(tx, profile.id, 'idle');
    return { ...result, sourceUrl: parsed.sourceUrl, extractedLinks: extraction.links.length };
  } catch (error) {
    await handleJobError(tx, profile.id, error, config.platformName);
    throw error;
  }
}
```

**Impact:** Reduces ~400 lines of duplicated code to ~100 lines + configuration objects.

---

## 2. Platform Detection Service - High Priority

**File:** `apps/web/lib/utils/platform-detection.ts` (1002 lines)

### Issues Identified

1. **Single Responsibility Violation:** The file handles multiple concerns:
   - Platform metadata/configuration (lines 1-241)
   - Domain pattern matching (lines 243-314)
   - Typo corrections (lines 316-382)
   - URL normalization (lines 384-558)
   - Platform detection (lines 560-628)
   - URL validation (lines 700-834)
   - Canonical identity computation (lines 876-929)
   - Environment detection (lines 931-1002)

2. **Hardcoded Configuration:** Platform configurations are embedded directly in code rather than being data-driven.

3. **Complex URL Normalization:** The `normalizeUrl` function (lines 387-558) has grown to handle many edge cases inline with regex patterns scattered throughout.

### Recommended Refactoring

**Split into Focused Modules:**

```
lib/platforms/
├── index.ts              # Re-exports
├── registry.ts           # Platform configurations (data-driven)
├── patterns.ts           # Domain patterns and detection rules
├── normalizer.ts         # URL normalization logic
├── validator.ts          # Platform-specific validation
├── detector.ts           # Main detection service
└── canonical.ts          # Canonical identity computation
```

**Move Environment Detection:**
The `getBaseUrl`, `isDevelopment`, `isPreview`, `isProduction` functions (lines 931-1002) belong in a separate `lib/utils/environment.ts` module.

**Impact:** Improves testability, reduces cognitive load, and makes platform additions easier.

---

## 3. Notifications Domain - Medium Priority

**File:** `apps/web/lib/notifications/domain.ts` (675 lines)

### Issues Identified

1. **Repetitive Response Building:**
   - `buildErrorResponse` and `buildSubscribeErrorResponse` are called with similar patterns throughout
   - Multiple places construct similar error tracking calls

2. **Scattered Analytics:**
   Every operation has `await trackServerEvent(...)` calls with similar payload structures:
   ```typescript
   await trackServerEvent('notifications_subscribe_attempt', { ... });
   await trackServerEvent('notifications_subscribe_error', { ... });
   await trackServerEvent('notifications_subscribe_success', { ... });
   ```

3. **Validation Schemas Mixed with Business Logic:**
   Zod schemas (lines 100-173) are defined alongside domain functions.

### Recommended Refactoring

**Extract Validation Schemas:**
```typescript
// lib/notifications/schemas.ts
export const subscribeSchema = z.object({ ... });
export const unsubscribeSchema = z.object({ ... });
export const statusSchema = z.object({ ... });
```

**Create a Response Builder:**
```typescript
// lib/notifications/responses.ts
export class NotificationResponseBuilder {
  static error(status: number, error: string, code: NotificationErrorCode) { ... }
  static success<T>(data: T, options?: { audienceIdentified?: boolean }) { ... }
}
```

**Wrap Analytics in a Decorator/Helper:**
```typescript
// lib/notifications/tracking.ts
export const withNotificationTracking = <T>(
  operation: string,
  fn: () => Promise<T>,
  context: Record<string, unknown>
) => { ... }
```

---

## 4. Database Schema Organization - Medium Priority

**File:** `apps/web/lib/db/schema.ts` (1059 lines)

### Issues Identified

1. **Monolithic File:** All 25+ tables are in a single file, making navigation difficult.

2. **Type Exports Scattered:** Insert/Select schemas and types are defined after all table definitions, requiring scrolling to find related types.

3. **Cross-Cutting Concerns:** Enums used across multiple domains are mixed with table definitions.

### Recommended Refactoring

**Organize by Domain:**
```
lib/db/schema/
├── index.ts           # Re-exports all
├── enums.ts           # All pgEnum definitions
├── users.ts           # users, userSettings
├── creators.ts        # creatorProfiles, creatorContacts
├── content.ts         # socialLinks, socialAccounts
├── discography.ts     # discogReleases, discogTracks, providerLinks
├── audience.ts        # audienceMembers, clickEvents, notificationSubscriptions
├── payments.ts        # tips, billingAuditLog, stripeWebhookEvents
├── ingestion.ts       # ingestionJobs, scraperConfigs
├── waitlist.ts        # waitlistEntries, waitlistInvites
└── utility.ts         # wrappedLinks, signedLinkAccess, dashboardIdempotencyKeys, profilePhotos
```

**Co-locate Types with Tables:**
```typescript
// lib/db/schema/users.ts
export const users = pgTable('users', { ... });
export const insertUserSchema = createInsertSchema(users);
export const selectUserSchema = createSelectSchema(users);
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
```

---

## 5. Ingestion Status Management - Medium Priority

**Pattern Found:** `grep` shows 8 instances of `ingestionStatus: 'processing'` updates across the codebase.

### Issues Identified

The ingestion status state machine (`idle` -> `pending` -> `processing` -> `idle`/`failed`) is managed ad-hoc across multiple files:

- `lib/ingestion/processor.ts` (5 instances)
- `lib/admin/creator-profiles.ts` (1 instance)
- `app/api/admin/creator-ingest/route.ts` (2 instances)

### Recommended Refactoring

**Create a State Machine Service:**
```typescript
// lib/ingestion/status-manager.ts
export class IngestionStatusManager {
  constructor(private tx: DbType) {}

  async startProcessing(profileId: string): Promise<void> { ... }
  async markIdle(profileId: string): Promise<void> { ... }
  async markFailed(profileId: string, error: string): Promise<void> { ... }
  async isStuck(profileId: string, thresholdMs: number): Promise<boolean> { ... }
}
```

This centralizes status transitions and ensures consistency.

---

## 6. API Route Error Handling - Low Priority

**Pattern Found:** API routes follow similar error handling patterns.

### Issues Identified

Most dashboard API routes (e.g., `app/api/dashboard/analytics/route.ts`) have:
1. Try-catch wrapper
2. Sentry.captureException for unexpected errors
3. Similar response formatting
4. Similar caching patterns (in-memory cache with TTL)

### Recommended Refactoring

**Create Shared API Utilities:**
```typescript
// lib/api/with-error-handling.ts
export function withApiErrorHandling<T>(
  handler: () => Promise<T>,
  options: { route: string; tags?: Record<string, string> }
): Promise<NextResponse<T | ApiError>> { ... }

// lib/api/cache.ts
export class RequestCache<T> {
  constructor(private ttlMs: number) {}
  async getOrFetch(key: string, fetcher: () => Promise<T>): Promise<T> { ... }
}
```

---

## 7. Ingestion Strategies Base Pattern - Low Priority

**Files:** `apps/web/lib/ingestion/strategies/*.ts`

### Issues Identified

While there's already a `base.ts` with shared utilities, each strategy still has:
- Similar URL validation patterns
- Similar config structures
- Similar handle extraction logic

### Recommended Refactoring

**Strengthen the Strategy Interface:**
```typescript
// lib/ingestion/strategies/base.ts
export abstract class IngestionStrategy<TConfig extends StrategyConfig> {
  abstract readonly config: TConfig;

  isValidUrl(url: string): boolean { ... }  // Use config.validHosts
  validateUrl(url: string): string | null { ... }
  extractHandle(url: string): string | null { ... }
  abstract fetchDocument(url: string): Promise<string>;
  abstract extract(document: string): ExtractionResult;
}
```

Each strategy becomes a class extending this base, reducing boilerplate.

---

## Summary Table

| Priority | Area | Current Lines | Est. Reduction | Complexity |
|----------|------|---------------|----------------|------------|
| High | Ingestion Processor | 1,104 | ~40% | Medium |
| High | Platform Detection | 1,002 | N/A (split) | Medium |
| Medium | Notifications Domain | 675 | ~20% | Low |
| Medium | Database Schema | 1,059 | N/A (split) | Low |
| Medium | Ingestion Status | Scattered | Centralized | Low |
| Low | API Error Handling | Scattered | ~15% each | Low |
| Low | Ingestion Strategies | ~400/each | ~30% | Medium |

---

## Implementation Notes

1. **Incremental Approach:** These refactorings can be done incrementally without disrupting active development.

2. **Testing First:** Before any refactoring, ensure adequate test coverage exists for the affected code paths.

3. **Type Safety:** Leverage TypeScript's type system to catch regressions during refactoring.

4. **Backward Compatibility:** Maintain existing public API signatures where possible, deprecating old patterns gradually.

---

*Generated: December 26, 2025*
