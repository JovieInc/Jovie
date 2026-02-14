# Profile Monitoring & Impersonation Detection — Feature Plan

> **Status**: Draft — awaiting review
> **Author**: Claude (AI-assisted planning)
> **Date**: 2026-02-14
> **Branch**: `claude/plan-profile-monitoring-feature-wOALT`
> **Plan tier**: Pro ($99/mo) — exclusive feature

---

## 1. Problem Statement

Artists on streaming platforms face a growing threat: **unauthorized music appearing on their profiles**. This happens when bad actors distribute music using another artist's name, exploiting distributor verification gaps. The result is fraudulent streams, brand damage, and listener confusion — and most artists don't discover it until fans point it out.

**Jovie already knows who an artist is on Spotify** (via `spotifyId`) and already polls the Spotify API for enrichment. We're uniquely positioned to turn that data into a **continuous catalog watchdog** that alerts artists the moment something unexpected appears.

> **Scope note**: V1 is **Spotify-only**. The schema and provider interface support multiple DSPs by design, but Apple Music and other providers will only be added if users request it. No speculative multi-provider work.

### Who is this for?

- **Primary**: **Pro plan ($99/mo) artists** with a linked Spotify profile
- **Secondary**: Free/Basic/Premium users see the feature as a locked upsell in their dashboard — "Upgrade to Pro to monitor your streaming profiles for unauthorized releases"
- **Tertiary**: Unclaimed profiles (Jovie can auto-detect and use it as a claim + upgrade incentive — "We found suspicious activity on your Spotify, claim your Jovie Pro to investigate")

### What does "success" look like?

1. An artist links their Spotify → Jovie scans their catalog within minutes
2. Every 6-12 hours, Jovie re-checks their DSP catalogs for new releases
3. When a new release appears that the artist hasn't told us about, they get an email/in-app alert
4. The artist confirms ("that's mine") or disputes ("that's NOT mine")
5. Disputed releases get flagged, with guidance on how to report to the DSP

---

## 2. User Experience

### 2.1 Activation (Pro Plan Only — $99/mo)

**Eligibility**: Only users where `isPro === true` (on the Pro plan at $99/mo) are eligible. This is enforced at three levels:

1. **Cron scanner**: Skips profiles where the associated user is not on Pro
2. **API routes**: All `/api/catalog-monitor/*` endpoints check `isPro` via `getSessionContext()` and return 403 with an upgrade prompt for non-Pro users
3. **Dashboard UI**: Non-Pro users see a locked preview of the feature with an upgrade CTA

**For Pro users**: Artists who already have a `spotifyId` on their `creatorProfiles` row are automatically enrolled when they upgrade to Pro. No toggle required — monitoring starts on the next cron cycle. A notification preference (`catalogMonitoring: true`) defaults to `true` and can be turned off in settings.

**For non-Pro users**: The catalog monitor page is visible in the sidebar but shows a locked state:
```
┌─────────────────────────────────────────────────┐
│  🔒 Catalog Monitor — Pro Feature               │
│                                                 │
│  Monitor your streaming profiles for            │
│  unauthorized releases and impersonation.       │
│                                                 │
│  Get alerted the moment new music appears       │
│  on your Spotify profile.                       │
│                                                 │
│  [Upgrade to Pro — $99/mo]                      │
└─────────────────────────────────────────────────┘
```

**On downgrade from Pro**: Monitoring is paused (cron skips), existing data is retained for 90 days (in case they re-subscribe), alerts stop sending. If they re-upgrade, monitoring resumes from where it left off.

For new Pro users, monitoring begins after DSP discovery completes (existing `dsp-artist-discovery` job).

### 2.2 The Alert

When an unrecognized release is detected:

**Email** (via existing Resend infrastructure):
```
Subject: "New release detected on your Spotify — is this yours?"

Body:
  [Album artwork thumbnail]
  "Midnight Dreams" (Single)
  Appeared on your Spotify profile on Feb 14, 2026

  [✅ Yes, this is mine]  [🚫 This isn't mine]

  We monitor your streaming profiles so you're always
  the first to know when new music appears.
```

**In-app dashboard** (new section on creator dashboard):
```
┌─────────────────────────────────────────────────┐
│  🔍 Catalog Monitor                             │
│                                                 │
│  3 releases detected across 2 platforms         │
│  Last scan: 2 hours ago                         │
│                                                 │
│  ⚠️ 1 unconfirmed release                       │
│  ┌───────────────────────────────────────────┐  │
│  │ "Midnight Dreams" — Single                │  │
│  │ Spotify · Appeared Feb 14, 2026           │  │
│  │ [Confirm mine] [Not mine] [View on DSP]   │  │
│  └───────────────────────────────────────────┘  │
│                                                 │
│  ✅ 2 confirmed releases                        │
│  └ "Stay With Me" — Album · Apple Music      │  │
│  └ "Echoes" — Single · Spotify               │  │
└─────────────────────────────────────────────────┘
```

### 2.3 Dispute Flow

When an artist clicks "This isn't mine":

1. Release is flagged as `disputed` in our system
2. Artist sees a confirmation screen with guidance:
   - Link to Spotify's "Report Infringement" form
   - Template text they can copy/paste for their distributor
   - Option to add notes ("I think this is from a distributor I used to work with")
3. Jovie stores the dispute with timestamps for the artist's records
4. (Future) Jovie can auto-generate and submit DMCA-style takedowns

### 2.4 Confirmation Flow

When an artist clicks "Yes, this is mine":

1. Release moves to `confirmed` status
2. If the release isn't already in their Jovie discography (`discogReleases`), we offer to import it
3. No further alerts for this release

---

## 3. Architecture

### 3.1 High-Level Data Flow

```
                    ┌──────────────┐
                    │  Cron Job    │
                    │  (6-12 hrs)  │
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │  Catalog     │  Polls Spotify
                    │  Scanner     │  using existing Spotify client
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │  Diff Engine │  Compares DSP catalog vs. known releases
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
        No changes    New release   Release removed
              │            │            │
           (noop)          │         (log event)
                           │
                    ┌──────▼───────┐
                    │  Alert       │  Creates notification + email
                    │  Dispatcher  │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              │                         │
        Email alert              In-app alert
        (Resend)                 (dashboard)
```

### 3.2 Component Breakdown

| Component | Location | Responsibility |
|-----------|----------|---------------|
| **Schema** | `lib/db/schema/catalog-monitoring.ts` | Tables for scan state, detected releases, alerts |
| **Scanner** | `lib/catalog-monitoring/scanner.ts` | Orchestrates DSP polling per provider |
| **Providers** | `lib/catalog-monitoring/providers/` | Platform-specific catalog fetch logic |
| **Diff Engine** | `lib/catalog-monitoring/diff.ts` | Compares snapshots, identifies new/removed releases |
| **Alert Service** | `lib/catalog-monitoring/alerts.ts` | Creates alert records, triggers notifications |
| **Cron: Scan** | `app/api/cron/catalog-scan/route.ts` | Periodic catalog scanning |
| **Cron: Alerts** | `app/api/cron/catalog-alerts/route.ts` | Sends pending alert emails |
| **API: Actions** | `app/api/catalog-monitor/` | Confirm/dispute/dismiss endpoints |
| **UI: Dashboard** | `app/(dashboard)/catalog-monitor/` | In-app monitoring view |
| **Email Template** | `lib/email/templates/catalog-alert.ts` | Alert email template |

---

## 4. Database Schema

### 4.1 New Enums

```typescript
// Scan status for the overall monitoring job
export const catalogScanStatusEnum = pgEnum('catalog_scan_status', [
  'pending',
  'scanning',
  'completed',
  'failed',
]);

// Status of a detected release from the artist's perspective
export const detectedReleaseStatusEnum = pgEnum('detected_release_status', [
  'unconfirmed',   // Just detected, artist hasn't responded
  'confirmed',     // Artist confirmed this is theirs
  'disputed',      // Artist says this is NOT theirs
  'dismissed',     // Artist dismissed the alert (don't care / known issue)
  'auto_confirmed' // Matched to existing discogRelease automatically
]);

// Alert delivery status
export const catalogAlertStatusEnum = pgEnum('catalog_alert_status', [
  'pending',
  'sending',
  'sent',
  'failed',
  'cancelled',
]);
```

### 4.2 New Tables

#### `catalogScanState` — Per-creator, per-provider sync tracking

Follows the same pattern as `releaseSyncStatus`.

```typescript
export const catalogScanState = pgTable(
  'catalog_scan_state',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    providerId: text('provider_id').notNull(), // 'spotify', 'apple_music', etc.

    // Scan scheduling
    lastScanAt: timestamp('last_scan_at'),
    nextScanAt: timestamp('next_scan_at'),
    scanIntervalHours: integer('scan_interval_hours').default(12).notNull(),

    // Catalog snapshot — the "known state" as of lastScanAt
    // Array of { externalId, title, releaseType, releaseDate, artworkUrl }
    lastSnapshot: jsonb('last_snapshot')
      .$type<CatalogSnapshotEntry[]>()
      .default([]),
    lastSnapshotHash: text('last_snapshot_hash'), // SHA-256 of sorted snapshot for fast change detection

    // Stats
    totalReleasesKnown: integer('total_releases_known').default(0).notNull(),
    totalNewDetected: integer('total_new_detected').default(0).notNull(),

    // Error tracking (same pattern as releaseSyncStatus)
    status: catalogScanStatusEnum('status').default('pending').notNull(),
    consecutiveFailures: integer('consecutive_failures').default(0).notNull(),
    lastError: text('last_error'),
    lastErrorAt: timestamp('last_error_at'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    uniqueCreatorProvider: uniqueIndex('idx_catalog_scan_state_unique')
      .on(table.creatorProfileId, table.providerId),
    nextScanIdx: index('idx_catalog_scan_state_next_scan')
      .on(table.nextScanAt, table.status)
      .where(drizzleSql`status != 'failed' OR consecutive_failures < 5`),
  })
);
```

#### `detectedReleases` — Every release we've seen on a DSP profile

```typescript
export const detectedReleases = pgTable(
  'detected_releases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    providerId: text('provider_id').notNull(), // 'spotify', 'apple_music'

    // External identifiers
    externalReleaseId: text('external_release_id').notNull(), // Spotify album ID, Apple Music album ID
    externalUrl: text('external_url'), // Direct link to the release on the DSP

    // Release metadata (as reported by DSP)
    title: text('title').notNull(),
    releaseType: text('release_type'), // 'album', 'single', 'ep', 'compilation'
    releaseDate: timestamp('release_date'),
    artworkUrl: text('artwork_url'),
    trackCount: integer('track_count'),
    label: text('label'), // Record label as reported by DSP

    // Matching to existing Jovie data
    matchedDiscogReleaseId: uuid('matched_discog_release_id'), // FK to discogReleases if matched
    matchConfidence: text('match_confidence'), // 'exact_id', 'upc', 'isrc', 'title_date', 'none'

    // Artist response
    status: detectedReleaseStatusEnum('status').default('unconfirmed').notNull(),
    statusChangedAt: timestamp('status_changed_at'),
    statusChangedBy: text('status_changed_by'), // 'artist', 'system', 'admin'
    disputeNotes: text('dispute_notes'), // Artist's notes when disputing
    disputeReportedToDsp: boolean('dispute_reported_to_dsp').default(false),

    // Detection metadata
    firstDetectedAt: timestamp('first_detected_at').defaultNow().notNull(),
    lastSeenAt: timestamp('last_seen_at').defaultNow().notNull(),
    wasRemoved: boolean('was_removed').default(false), // Disappeared from DSP catalog

    // Raw data for auditing
    rawMetadata: jsonb('raw_metadata').$type<Record<string, unknown>>().default({}),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    uniqueProviderRelease: uniqueIndex('idx_detected_releases_unique')
      .on(table.creatorProfileId, table.providerId, table.externalReleaseId),
    statusIdx: index('idx_detected_releases_status')
      .on(table.creatorProfileId, table.status),
    firstDetectedIdx: index('idx_detected_releases_first_detected')
      .on(table.creatorProfileId, table.firstDetectedAt),
    unconfirmedIdx: index('idx_detected_releases_unconfirmed')
      .on(table.status, table.firstDetectedAt)
      .where(drizzleSql`status = 'unconfirmed'`),
  })
);
```

#### `catalogAlerts` — Notification queue for catalog events

Follows the `fanReleaseNotifications` pattern exactly.

```typescript
export const catalogAlerts = pgTable(
  'catalog_alerts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    detectedReleaseId: uuid('detected_release_id')
      .notNull()
      .references(() => detectedReleases.id, { onDelete: 'cascade' }),

    // Alert type
    alertType: text('alert_type').notNull(), // 'new_release', 'release_removed', 'metadata_changed'

    // Delivery
    channel: text('channel').notNull().default('email'), // 'email', 'in_app', 'push' (future)
    status: catalogAlertStatusEnum('status').default('pending').notNull(),
    scheduledFor: timestamp('scheduled_for').defaultNow().notNull(),
    sentAt: timestamp('sent_at'),
    error: text('error'),

    // Dedup (same pattern as fanReleaseNotifications)
    dedupKey: text('dedup_key').notNull(),

    // Action tracking
    actionToken: text('action_token'), // HMAC-signed token for email confirm/dispute links
    actionTakenAt: timestamp('action_taken_at'),
    actionType: text('action_type'), // 'confirmed', 'disputed', 'dismissed'

    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    dedupUnique: uniqueIndex('idx_catalog_alerts_dedup').on(table.dedupKey),
    pendingIdx: index('idx_catalog_alerts_pending')
      .on(table.status, table.scheduledFor)
      .where(drizzleSql`status = 'pending'`),
    creatorIdx: index('idx_catalog_alerts_creator')
      .on(table.creatorProfileId, table.createdAt),
  })
);
```

### 4.3 Schema Modifications to Existing Tables

#### `creatorProfiles.notificationPreferences` — Add monitoring prefs

```typescript
export interface NotificationPreferences {
  // ... existing fields ...

  // Catalog monitoring
  catalogMonitoring?: boolean;       // Master toggle (default: true)
  catalogMonitoringEmail?: boolean;  // Email alerts (default: true)
  catalogMonitoringInApp?: boolean;  // In-app alerts (default: true)
}
```

#### `creatorProfiles` — Add monitoring metadata

```typescript
// Add to creatorProfiles table:
catalogMonitoringEnabled: boolean('catalog_monitoring_enabled')
  .default(true).notNull(),
catalogMonitoringActivatedAt: timestamp('catalog_monitoring_activated_at'),
```

---

## 5. Catalog Scanner Implementation

### 5.1 Provider Interface

Each DSP provider implements a common interface:

```typescript
interface CatalogProviderResult {
  releases: CatalogRelease[];
  fetchedAt: Date;
  rateLimitRemaining?: number;
}

interface CatalogRelease {
  externalId: string;           // Platform-specific album/release ID
  title: string;
  releaseType: string;          // 'album' | 'single' | 'ep' | 'compilation'
  releaseDate: string | null;   // ISO date
  artworkUrl: string | null;
  trackCount: number;
  label: string | null;
  externalUrl: string;          // Direct link
  isrcs?: string[];             // For cross-referencing
  upc?: string;                 // For cross-referencing
}
```

### 5.2 Spotify Provider

Uses the existing `getSpotifyArtistAlbums` function (already paginated, max 500):

```typescript
async function fetchSpotifyCatalog(spotifyId: string): Promise<CatalogProviderResult> {
  // 1. Fetch all album types: album, single, compilation
  //    Uses existing Spotify client with token caching + retry logic
  const albums = await getSpotifyArtistAlbums(spotifyId, {
    include_groups: 'album,single,compilation',
  });

  // 2. Map to CatalogRelease format
  return {
    releases: albums.map(album => ({
      externalId: album.id,
      title: album.name,
      releaseType: album.album_type,
      releaseDate: album.release_date,
      artworkUrl: album.images?.[0]?.url ?? null,
      trackCount: album.total_tracks,
      label: album.label ?? null,
      externalUrl: album.external_urls?.spotify,
      upc: album.external_ids?.upc,
    })),
    fetchedAt: new Date(),
  };
}
```

### 5.3 Diff Engine

The diff engine compares the current DSP catalog against the last known snapshot:

```typescript
interface CatalogDiffResult {
  newReleases: CatalogRelease[];     // On DSP but not in snapshot
  removedReleases: string[];          // In snapshot but not on DSP (by externalId)
  unchangedCount: number;
  snapshotHash: string;               // For fast "no change" detection next time
}

function diffCatalog(
  currentReleases: CatalogRelease[],
  lastSnapshot: CatalogSnapshotEntry[]
): CatalogDiffResult {
  const knownIds = new Set(lastSnapshot.map(s => s.externalId));
  const currentIds = new Set(currentReleases.map(r => r.externalId));

  const newReleases = currentReleases.filter(r => !knownIds.has(r.externalId));
  const removedReleases = lastSnapshot
    .filter(s => !currentIds.has(s.externalId))
    .map(s => s.externalId);

  // Hash for fast change detection
  const sortedIds = [...currentIds].sort();
  const snapshotHash = createHash('sha256')
    .update(sortedIds.join(','))
    .digest('hex');

  return { newReleases, removedReleases, unchangedCount: currentIds.size - newReleases.length, snapshotHash };
}
```

### 5.4 Auto-Confirmation Logic

Before alerting the artist, we try to automatically match new detections against their existing Jovie discography:

```typescript
async function tryAutoConfirm(
  detected: CatalogRelease,
  creatorProfileId: string
): Promise<{ matched: boolean; matchedReleaseId?: string; confidence: string }> {
  // Strategy 1: UPC match (highest confidence)
  if (detected.upc) {
    const match = await db.select().from(discogReleases)
      .where(and(
        eq(discogReleases.creatorProfileId, creatorProfileId),
        eq(discogReleases.upc, detected.upc)
      )).limit(1);
    if (match.length > 0) return { matched: true, matchedReleaseId: match[0].id, confidence: 'upc' };
  }

  // Strategy 2: ISRC match (check first track)
  // ...similar to existing release-enrichment.ts pattern

  // Strategy 3: Title + release date fuzzy match
  // ...Jaro-Winkler on title + date within 7 days

  return { matched: false, confidence: 'none' };
}
```

---

## 6. Cron Jobs

### 6.1 `catalog-scan` — Main Scanning Cron

**Schedule**: Every 6 hours (`0 */6 * * *`)
**Runtime**: 120 seconds max
**Concurrency**: 5 profiles scanned in parallel per batch

```
Algorithm:
1. RECOVERY: Reset stuck "scanning" rows older than 15 minutes → "pending"

2. SELECT profiles due for scanning:
   JOIN creator_profiles ON creator_profile_id
   JOIN users ON creator_profiles.user_id = users.id
   WHERE nextScanAt <= NOW()
     AND (status != 'failed' OR consecutiveFailures < 5)
     AND users.is_pro = true              ← Pro gate
     AND creator_profiles.is_claimed = true
   ORDER BY nextScanAt ASC
   LIMIT 50

3. For each profile (5 concurrent):
   a. CLAIM: Atomically set status = 'scanning' (only if still 'pending'/'completed')
   b. FETCH: Call provider's catalog fetch function
   c. DIFF: Compare against lastSnapshot
   d. For each new release:
      - Try auto-confirm against discogReleases
      - If auto-confirmed → insert detectedRelease with status='auto_confirmed'
      - If NOT matched → insert detectedRelease with status='unconfirmed'
      - Create catalogAlert with status='pending'
   e. For each removed release:
      - Update detectedRelease.wasRemoved = true
      - (Don't alert yet — releases get temporarily removed sometimes)
   f. UPDATE catalogScanState:
      - lastSnapshot = current catalog
      - lastSnapshotHash = new hash
      - nextScanAt = NOW() + scanIntervalHours
      - status = 'completed'
      - consecutiveFailures = 0
   g. On ERROR:
      - consecutiveFailures += 1
      - Apply exponential backoff to nextScanAt
      - Log to Sentry

4. Return summary: { scanned, newDetected, autoConfirmed, errors }
```

### 6.2 `catalog-alerts` — Alert Sending Cron

**Schedule**: Every hour (`0 * * * *`)
**Runtime**: 60 seconds max
**Concurrency**: 10 alerts sent in parallel

Follows the exact `send-release-notifications` pattern:

```
Algorithm:
1. RECOVERY: Reset stuck "sending" alerts older than 10 minutes → "pending"

2. FETCH pending alerts:
   WHERE status = 'pending' AND scheduledFor <= NOW()
   LIMIT 100
   ORDER BY scheduledFor, createdAt

3. BATCH PREFETCH:
   - All detectedReleases by ID
   - All creatorProfiles by ID
   - All users (for email addresses) by profile's userId

4. For each alert (10 concurrent):
   a. CLAIM: Atomically set status = 'sending'
   b. CHECK: Is user still on Pro plan? Is catalogMonitoring still enabled? Is email still valid?
      - If user downgraded from Pro → cancel alert, skip
   c. GENERATE action token: HMAC-SHA256 signed token encoding:
      - alertId, detectedReleaseId, creatorProfileId
      - Used for one-click confirm/dispute from email
   d. SEND: Email via Resend using catalog-alert template
   e. UPDATE: status = 'sent' or 'failed'

5. Return summary: { sent, failed, skipped }
```

### 6.3 Vercel Cron Configuration

Add to `vercel.json`:

```json
{ "path": "/api/cron/catalog-scan", "schedule": "0 */6 * * *" },
{ "path": "/api/cron/catalog-alerts", "schedule": "0 * * * *" }
```

---

## 7. API Routes

All catalog monitor API routes enforce Pro plan access using the existing `getSessionContext()` helper:

```typescript
// Shared guard used by all /api/catalog-monitor/* routes
const { user, profile } = await getSessionContext({ requireUser: true, requireProfile: true });
if (!user.isPro) {
  return NextResponse.json(
    { error: 'Pro plan required', upgradeUrl: '/pricing' },
    { status: 403 }
  );
}
```

### 7.1 `POST /api/catalog-monitor/confirm`

Artist confirms a detected release is theirs.

```
Request: { detectedReleaseId: string }
Auth: Clerk session required, must own the creator profile, must be Pro plan

Response: 200 { success: true, importable: boolean }

Side effects:
  - Updates detectedRelease.status → 'confirmed'
  - Cancels any pending catalogAlerts for this release
  - If release isn't in discogReleases, returns importable: true
```

### 7.2 `POST /api/catalog-monitor/dispute`

Artist disputes a detected release — it's not theirs.

```
Request: {
  detectedReleaseId: string,
  notes?: string,          // Optional artist notes
}
Auth: Clerk session required, must own the creator profile

Response: 200 {
  success: true,
  guidance: {
    spotifyReportUrl?: string,
    appleMusicReportUrl?: string,
    templateText: string,
  }
}

Side effects:
  - Updates detectedRelease.status → 'disputed'
  - Stores disputeNotes
  - Returns DSP-specific takedown guidance
```

### 7.3 `POST /api/catalog-monitor/dismiss`

Artist dismisses an alert (they know about it but don't care).

```
Request: { detectedReleaseId: string }
Auth: Clerk session required

Response: 200 { success: true }
```

### 7.4 `GET /api/catalog-monitor/status`

Returns the current monitoring state for the artist's dashboard.

```
Auth: Clerk session required

Response: 200 {
  enabled: boolean,
  providers: [
    { providerId: 'spotify', lastScanAt: '...', nextScanAt: '...', releasesKnown: 42, status: 'completed' }
  ],
  unconfirmedCount: 1,
  disputedCount: 0,
  recentDetections: [
    { id: '...', title: 'Midnight Dreams', provider: 'spotify', status: 'unconfirmed', detectedAt: '...' }
  ]
}
```

### 7.5 `PATCH /api/catalog-monitor/settings`

Update monitoring preferences.

```
Request: {
  enabled?: boolean,
  emailAlerts?: boolean,
  scanIntervalHours?: 6 | 12 | 24,
}
Auth: Clerk session required

Response: 200 { success: true }
```

### 7.6 `GET /api/catalog-monitor/history`

Paginated history of all detected releases for audit/review.

```
Query: ?status=confirmed&page=1&limit=20
Auth: Clerk session required

Response: 200 {
  releases: [...],
  total: 42,
  page: 1,
  pages: 3
}
```

### 7.7 `POST /api/catalog-monitor/action` (Email action handler)

Handles one-click actions from alert emails (confirm/dispute via signed token).

```
Request: { token: string, action: 'confirm' | 'dispute' }
Auth: Token-based (HMAC-signed, 7-day expiry)

Response: 302 redirect to dashboard with flash message
```

---

## 8. Email Template

### Template: `catalog-alert.ts`

Follows the existing `release-day-notification.ts` pattern with `escapeHtml()` on all inputs.

```
Subject: "New release detected on your {Provider} — is this yours?"

HTML structure:
  ┌──────────────────────────────────────┐
  │  [Jovie logo]                        │
  │                                      │
  │  We detected a new release on your   │
  │  {Provider} profile:                 │
  │                                      │
  │  [Artwork]  "Release Title"          │
  │             Single · Feb 14, 2026    │
  │             Label: Some Records      │
  │                                      │
  │  [✅ This is mine]  [🚫 Not mine]    │
  │                                      │
  │  [View on {Provider}]                │
  │                                      │
  │  ──────────────────────────────────  │
  │  Jovie monitors your streaming       │
  │  profiles to protect your identity.  │
  │                                      │
  │  [Manage monitoring settings]        │
  │  [Unsubscribe from these alerts]     │
  └──────────────────────────────────────┘

Plain text fallback:
  We detected a new release on your {Provider} profile:
  "{Release Title}" ({Type}) — {Date}

  Is this yours?
  Confirm: {confirm_url}
  Not mine: {dispute_url}

  View on {Provider}: {external_url}
```

Action URLs use HMAC-signed tokens (same pattern as existing `actionToken` in impersonation):
```
https://jov.ie/api/catalog-monitor/action?token={hmac_token}&action=confirm
```

---

## 9. Dashboard UI

### 9.1 Right Drawer: Monitoring Toggles

**Integration point**: The existing `RightDrawer` component (`components/organisms/RightDrawer.tsx`) with `SettingsToggleRow` (`components/dashboard/molecules/SettingsToggleRow.tsx`).

When the artist opens the right drawer (sidebar settings panel), a new **"Catalog Monitor"** section appears below existing settings sections. This uses the existing `SettingsToggleRow` component pattern for consistency.

```
┌─────────────────────────────────────────┐
│  Right Drawer                      [×]  │
│                                         │
│  ... existing settings sections ...     │
│                                         │
│  ─── Catalog Monitor (Pro) ───────────  │
│                                         │
│  Monitor my profiles          [══●]  ON │
│  Scans your DSP profiles for            │
│  unauthorized releases                  │
│                                         │
│  Email alerts                 [══●]  ON │
│  Get notified when new music            │
│  appears on your profiles               │
│                                         │
│  ─── Monitored Platform ──────────────  │
│                                         │
│  ♫ Spotify                    [══●]  ON │
│  Connected as "Artist Name"             │
│  Last scanned: 2h ago                   │
│                                         │
│  [View full monitoring dashboard →]     │
└─────────────────────────────────────────┘
```

**For non-Pro users**, the section appears but all toggles are disabled with a lock icon and the description reads "Upgrade to Pro to enable catalog monitoring":

```
│  ─── Catalog Monitor ─────────────────  │
│                                         │
│  🔒 Monitor my profiles      [○══] OFF │
│  Upgrade to Pro ($99/mo) to scan your   │
│  streaming profiles for unauthorized    │
│  releases. [Upgrade →]                  │
```

**Component**: `CatalogMonitorDrawerSection`
- Renders inside the existing right drawer settings layout
- Uses `SettingsToggleRow` for each toggle (same component as analytics/appearance toggles)
- Master toggle (`catalogMonitoring`) disables all child toggles when off
- Spotify toggle only shows when `spotifyId` is set (V1 is Spotify-only)
- "Last scanned" timestamp updates via the existing `useBillingStatusQuery` pattern or a new lightweight query
- Optimistic toggle updates with rollback on error + toast feedback (existing pattern in `SettingsToggleRow`)
- PATCH to `/api/catalog-monitor/settings` on toggle change

### 9.2 Chat Carousel: Unauthorized Release Cards

**Integration point**: The existing `SuggestedProfilesCarousel` in `JovieChat.tsx` (`components/jovie/JovieChat.tsx`).

The carousel currently shows DSP match suggestions, social link suggestions, and avatar suggestions — each with confirm/reject action buttons ("That's me" / "Not me", "Use photo" / "Skip"). **Catalog monitoring alerts slot directly into this same carousel** as a new card type.

When there are unconfirmed releases detected by the catalog scanner, they appear as cards in the carousel alongside existing suggestions:

```
┌─────────────────────────────────────────────────┐
│                                          1 of 4 │
│                                                 │
│  ⚠️ SPOTIFY · New release detected              │
│                                                 │
│  ┌─────────────────────────────────────────┐    │
│  │         [Album Artwork 200×200]         │    │
│  └─────────────────────────────────────────┘    │
│                                                 │
│  "Midnight Dreams"                              │
│  Single · Feb 14, 2026 · Some Records           │
│                                                 │
│  This appeared on your Spotify profile.         │
│  Is this yours?                                 │
│                                                 │
│  ┌──────────┐  ┌───────────────────────┐        │
│  │  ✕ Not   │  │  ✓ That's mine        │        │
│  │   mine   │  │                       │        │
│  └──────────┘  └───────────────────────┘        │
│                                                 │
│  [View on Spotify ↗]                            │
│                                                 │
│         ● ● ○ ○          [←]  [→]               │
└─────────────────────────────────────────────────┘
```

**How it integrates with `SuggestedProfilesCarousel`**:

The carousel already loads suggestions via an API call in `onContextLoad`. We extend the data source to also fetch unconfirmed catalog detections:

```typescript
// In SuggestedProfilesCarousel data loading:
// Existing: DSP matches, social links, avatar candidates
// New: Unconfirmed detected releases (from /api/catalog-monitor/status)

interface CarouselCard {
  type: 'dsp_match' | 'social_link' | 'avatar' | 'catalog_alert';  // ← new type
  // ... existing fields
}

// For catalog_alert cards specifically:
interface CatalogAlertCard extends CarouselCard {
  type: 'catalog_alert';
  detectedReleaseId: string;
  title: string;
  releaseType: string;         // 'single', 'album', 'ep'
  releaseDate: string;
  artworkUrl: string | null;
  label: string | null;
  provider: string;            // 'spotify', 'apple_music'
  externalUrl: string;
}
```

**Action handling** (follows existing carousel confirm/reject pattern):

| Button | API Call | Card Transition |
|--------|----------|-----------------|
| "That's mine" | `POST /api/catalog-monitor/confirm` | Card slides out, shows "Confirmed ✓" briefly, advances to next |
| "Not mine" | Opens `DisputeDialog` modal | On submit → `POST /api/catalog-monitor/dispute` → card slides out |

**Ordering**: Catalog alert cards are shown **first** in the carousel (before DSP matches and social suggestions) because they're time-sensitive and security-relevant. The carousel dot indicator shows their position among all cards.

**Empty state**: If there are no unconfirmed releases and no other suggestions, the carousel is hidden (existing behavior). If there are only catalog alerts and no other suggestions, the carousel shows only the alert cards.

**Pro gating in carousel**: Catalog alert cards only appear when `isPro === true`. Non-Pro users never see them in the carousel (the scan doesn't run, so there's no data to show). However, if we implement the "teaser" variant (Section 11, future backlog), we could show a locked card:

```
┌─────────────────────────────────────────────────┐
│  🔒 CATALOG MONITOR · Pro Feature               │
│                                                 │
│  You have 47 releases on Spotify.               │
│  Are they all yours?                            │
│                                                 │
│  Catalog Monitor scans your streaming           │
│  profiles and alerts you when unauthorized      │
│  music appears.                                 │
│                                                 │
│  [Upgrade to Pro — $99/mo]                      │
└─────────────────────────────────────────────────┘
```

### 9.3 New Route: `/dashboard/catalog-monitor`

The full dedicated page for in-depth catalog monitoring management, accessible from the sidebar navigation and the "View full monitoring dashboard" link in the right drawer.

### 9.4 Components

#### `CatalogMonitorUpgradeGate` (for non-Pro users)
- Full-page locked state shown to free/basic/premium users
- Explains the feature value prop with visual mockup
- Shows "Upgrade to Pro — $99/mo" CTA button → links to `/pricing` or Stripe checkout
- Optionally shows a teaser: "You have X releases on Spotify — are they all yours?" (uses public DSP data to create urgency)

#### `CatalogMonitorDrawerSection` (right drawer integration)
- Renders inside the existing right drawer settings layout
- Master monitoring toggle + email alerts toggle + per-provider toggles
- Uses `SettingsToggleRow` for consistency with existing settings sections
- Links to full dashboard page

#### `CatalogAlertCarouselCard` (chat carousel integration)
- New card type for `SuggestedProfilesCarousel`
- Shows album art, title, release type, date, label, provider icon
- "That's mine" / "Not mine" action buttons (same pattern as existing DSP match cards)
- "View on {Provider}" external link with arrow icon
- Loading spinner during confirm/dispute API calls
- Slide-out animation on action (existing carousel animation: `animate-slide-out-left`)

#### `CatalogMonitorOverview` (Pro users only)
- Shows monitoring status (enabled/disabled), last scan time, next scan
- Provider badges showing connected platforms being monitored
- Stats: total releases tracked, unconfirmed count, disputed count

#### `UnconfirmedReleaseCard`
- Shows album art, title, type, date, label, provider
- Action buttons: Confirm / Dispute / Dismiss
- "View on {Provider}" link opens DSP in new tab

#### `CatalogMonitorHistory`
- Filterable table/list of all detected releases
- Filter by: status (all, unconfirmed, confirmed, disputed), provider
- Sort by: detection date, release date

#### `CatalogMonitorSettings` (full settings page, linked from drawer)
- Toggle monitoring on/off
- Toggle email alerts on/off
- Scan frequency selector (6h / 12h / 24h)
- Per-provider toggles
- Detailed scan history and error log

#### `DisputeDialog`
- Modal when clicking "Not mine" (from carousel card, release card, or email action)
- Text area for optional notes
- Shows DSP-specific reporting links
- Provides template text for distributor communication
- Confirm button submits dispute

---

## 10. Rate Limiting & API Budget

### Spotify API Limits
- Client Credentials: ~180 requests/minute per app
- `getSpotifyArtistAlbums` is paginated at 50/page, most artists have <100 releases → 2 requests per artist
- **Budget per scan cycle (50 artists max)**: ~100 Spotify API calls
- If we scan 50 artists every 6 hours → 400 calls/day (well within limits)

### Rate Limit Configuration

Add to existing `lib/rate-limit/config.ts`:

```typescript
catalogMonitorAction: {
  max: 30,           // 30 confirm/dispute actions per minute
  windowMs: 60_000,
  prefix: 'catalog-action',
},
catalogMonitorStatus: {
  max: 60,           // 60 status checks per minute
  windowMs: 60_000,
  prefix: 'catalog-status',
},
```

### Backoff for Failed Providers

When a provider returns errors, apply exponential backoff on `nextScanAt`:

| Consecutive Failures | Next Scan Delay |
|---------------------|-----------------|
| 1 | Normal interval (6-12h) |
| 2 | 24 hours |
| 3 | 48 hours |
| 4 | 72 hours |
| 5+ | Disabled (requires manual re-enable) |

---

## 11. Feature Flag, Plan Gating & Rollout

### Access Control: Pro Plan ($99/mo)

This feature is **permanently gated to the Pro plan**. It is not a temporary feature flag — it's a plan differentiator. The gating is enforced at three levels:

| Layer | How | What happens for non-Pro |
|-------|-----|--------------------------|
| **Cron scanner** | JOIN to `users.is_pro` in SELECT query | Profile is skipped entirely |
| **API routes** | `user.isPro` check via `getSessionContext()` | 403 with `{ upgradeUrl: '/pricing' }` |
| **Dashboard UI** | `isPro` from `useBillingStatusQuery()` | Locked preview with upgrade CTA |

### Statsig Feature Gate: `catalog_monitoring`

Used **only for progressive rollout within Pro users** (not for plan gating):

```typescript
// Rollout stages (all within Pro plan only):
// 1. Internal team only (manual list) — validate in production
// 2. 10% of Pro users — monitor error rates and API usage
// 3. 50% of Pro users — verify at scale
// 4. 100% of Pro users — general availability within Pro
//
// This feature does NOT roll out to free/basic/premium tiers.
// Plan gating is separate from the feature gate.
```

### Pricing Page Update

Add to the Pro plan feature list on `/pricing`:
```
Pro — $99/mo
  ✅ Everything in Premium, plus:
  ✅ Catalog Monitoring — Get alerted when new music appears on your streaming profiles
  ✅ Impersonation Detection — Identify and dispute unauthorized releases
  ...existing Pro features...
```

### Downgrade Handling

When a Pro user downgrades:
1. `catalogScanState.status` stays as-is (not deleted)
2. Cron scanner's `users.is_pro = true` filter naturally excludes them
3. Pending `catalogAlerts` are **cancelled** (not sent) — a background check in the alert cron
4. Existing `detectedReleases` data is **retained for 90 days** via the existing `data-retention` cron
5. If the user re-upgrades to Pro, monitoring resumes seamlessly — `nextScanAt` is set to `NOW()` on re-activation

### Re-upgrade Path

When a user returns to Pro:
1. Detect via Stripe webhook (`customer.subscription.updated` where plan = 'pro')
2. Set `catalogScanState.nextScanAt = NOW()` for all their providers
3. Run a fresh baseline scan (to catch anything that appeared while they were off Pro)
4. Resume normal 6-12h scan cycle

### Notification Preference Migration

Existing `notificationPreferences` JSON on `creatorProfiles` gets new fields with defaults:

```typescript
// Default for existing users (non-breaking):
{
  ...existingPreferences,
  catalogMonitoring: true,        // Enabled by default (only active if isPro)
  catalogMonitoringEmail: true,   // Email alerts on
  catalogMonitoringInApp: true,   // In-app alerts on
}
```

No data migration needed — the `.$type<>()` handles missing fields via defaults in application code. The preferences exist for all users but only take effect when `isPro === true`.

---

## 12. Seed Data & Initial Scan

### First-Time Activation

When a profile's monitoring is first activated (either by feature gate rollout or new DSP connection):

1. Run an immediate full catalog scan (not waiting for next cron cycle)
2. **All releases found in the initial scan are auto-confirmed as "baseline"** — we don't want to alert artists about their entire existing catalog
3. `catalogScanState.lastSnapshot` is populated with the full catalog
4. Future scans only alert on *new* additions beyond this baseline
5. If the artist has existing `discogReleases`, we cross-reference to mark matches

This is critical — without it, every artist would get 50+ alerts on day one.

### Trigger

The initial scan should fire as a background job when:
- The user is on the **Pro plan** (`isPro === true`) **AND**
- The `catalog_monitoring` feature gate is enabled for the user **AND**
- They have a `spotifyId` set on their creator profile
- They don't already have a `catalogScanState` row for Spotify

**Upgrade trigger**: When a user upgrades to Pro (detected via Stripe webhook `customer.subscription.updated`), enqueue an initial baseline scan for their Spotify profile. This gives them immediate value the moment they subscribe.

---

## 13. Observability & Monitoring

### Sentry Alerts

- **Error**: Scan job fails for >10% of profiles in a cycle
- **Warning**: Provider returns 429 (rate limit) — trigger early backoff
- **Info**: New unconfirmed release detected (for internal awareness during rollout)

### Statsig Metrics

| Metric | Description |
|--------|-------------|
| `catalog_scan_completed` | Scans completed per cycle |
| `catalog_scan_failed` | Scans failed per cycle |
| `catalog_new_release_detected` | New releases found (unconfirmed) |
| `catalog_auto_confirmed` | Releases matched to existing discography |
| `catalog_artist_confirmed` | Artist manually confirmed |
| `catalog_artist_disputed` | Artist disputed a release |
| `catalog_alert_sent` | Alert emails sent |
| `catalog_alert_click_rate` | % of alert emails with action taken |
| `catalog_time_to_action` | Time from alert to artist response |

### Admin Dashboard

Add a new section to the admin overview:
- Total profiles being monitored
- Scan success/failure rate (24h)
- Unconfirmed releases awaiting response
- Disputed releases (for support awareness)
- Provider health status (API error rates)

---

## 14. Security Considerations

### Email Action Tokens

HMAC-SHA256 signed tokens (same pattern as impersonation tokens):

```typescript
const payload = {
  alertId: string,
  creatorProfileId: string,
  action: 'confirm' | 'dispute',
  exp: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
};

const token = signHmac(payload, env.CATALOG_ALERT_SECRET);
```

Tokens are:
- Single-use (action is recorded, token is invalidated)
- Time-limited (7-day expiry)
- Bound to specific alert + action
- Verified server-side before any mutation

### Data Privacy

- Release metadata from DSPs is public data (not PII)
- Artist email addresses are already in Clerk — no new PII storage
- Dispute notes may contain PII → encrypted at rest, excluded from analytics
- `rawMetadata` stores full API responses for audit → auto-purge after 90 days via existing `data-retention` cron

### Abuse Prevention

- Rate-limited API endpoints
- Feature-gated rollout
- Scan frequency caps (minimum 6 hours between scans)
- Max 5 consecutive failures before disabling

---

## 15. Implementation Phases

### Strategy: Marketing-First, Build Later

**We are NOT building this feature yet.** The Growth plan ($99/mo) is not enabled for purchase. The immediate action is to **advertise catalog monitoring on the pricing table and marketing pages** as a Growth plan feature. This creates demand signal — when users start asking for it, we build it.

### Phase 0: Marketing & Pricing (NOW — ship immediately)

**Goal**: Advertise catalog monitoring as a Growth plan feature on pricing and marketing pages

| Task | Est. Effort | Files |
|------|-------------|-------|
| Add catalog monitoring features to `GROWTH_FEATURES` on pricing page | S | `app/(marketing)/pricing/page.tsx` |
| Update pricing page JSON-LD schema with new feature description | S | `app/(marketing)/pricing/page.tsx` |
| Add catalog monitoring mention to marketing/homepage copy (if applicable) | S | Marketing pages |
| Update SEO metadata for pricing page to mention impersonation detection | S | `app/(marketing)/pricing/page.tsx` |

**Deliverable**: Growth plan ($99/mo, "Soon" badge) lists catalog monitoring and impersonation detection as features. No backend, no schema, no crons. Growth plan remains non-purchasable.

**Signal to build**: When users start asking about the Growth plan specifically because of catalog monitoring, or when we're ready to enable the Growth plan for purchase.

---

### Phase 1–5: Build When Ready (deferred)

The full implementation plan is documented above (Sections 3–14) and remains the blueprint for when we're ready to build. The phases are:

| Phase | Focus | Trigger to Start |
|-------|-------|-----------------|
| **1: Foundation** | Schema, Spotify scanner, diff engine, cron | Growth plan goes live |
| **2: Alerts** | Email alerts, confirm/dispute API, HMAC tokens | Immediately after Phase 1 |
| **3: Drawer + Carousel** | Right drawer toggles, chat carousel alert cards | After Phase 2 |
| **4: Full Dashboard** | Dedicated `/dashboard/catalog-monitor` page | After Phase 3 |
| **5: Additional Providers** | Apple Music (only if users request it), admin tools | Demand-driven |

### Future Phases (Backlog — only if requested)

- **Apple Music, YouTube Music, Tidal, SoundCloud** providers
- **Push notifications** (mobile app)
- **Auto-dispute filing** (generate and submit takedown requests)
- **Distributor integration** (alert your distributor directly)
- **Catalog health score** (% of releases that are verified yours)
- **Metadata change detection** (alert when artwork/title/label changes)
- **Collaborative verification** (let managers/labels confirm on behalf)
- **Weekly digest email** (summary of all monitoring activity)
- **Unclaimed profile incentive** ("We found suspicious activity — claim your Jovie")
- **Non-Pro carousel teaser card** (locked card in carousel showing release count to drive upgrades)

---

## 16. Open Questions

1. **Scan frequency default**: Since this is Pro-only, we can afford 6h default. At $99/mo per user, the API cost per scan is negligible. Recommend **6h default** with option to choose 12h or 24h if they want fewer alerts.

2. **"Appears on" releases**: Spotify shows releases where the artist appears as a featured artist. Should we monitor those too? They're a common impersonation vector (bad actor features a real artist without permission). Recommend yes, but flagged differently.

3. **Compilation tracking**: Should we alert on compilations/playlists? These are often legitimate label compilations. Recommend: track but don't alert by default, let artist opt in.

4. **Multiple artists**: If a Jovie user has multiple creator profiles (future), should monitoring be per-profile? Yes — the schema already supports this via `creatorProfileId` FK.

5. **Historical backfill**: Should we let artists review their baseline (initial scan) and flag any existing impersonation? Could be valuable but increases complexity. Recommend: Phase 5 backlog item.

6. **Alert batching**: If 3 new releases appear at once, send 1 email with 3 releases or 3 emails? Recommend: 1 batched email per scan cycle per provider.

---

## 17. Summary

### What ships now

**Just marketing.** Add catalog monitoring and impersonation detection to the Growth plan ($99/mo) feature list on the pricing page. The Growth plan already has a "Soon" badge and is not purchasable. This plants the seed and gauges demand with zero engineering investment.

### What ships later (when Growth plan goes live)

The full feature turns Jovie into an **active guardian of the artist's streaming identity** — Spotify-only at launch, with other providers added only if users ask. It leverages existing infrastructure (Spotify client, Resend email, cron jobs, notification preferences) with minimal new surface area — 3 new tables, 2 cron jobs, 7 API routes, right drawer toggles, chat carousel cards, and a dashboard page.

### Why this justifies $99/mo

No other link-in-bio platform offers continuous catalog monitoring. Distrokid has rudimentary alerts but only for their own distribution. Spotify for Artists notifications are delayed and don't help with impersonation detection. **Jovie becomes the first platform that watches your Spotify identity and helps you fight back** — that's a premium value prop that justifies Growth pricing.

### When built, the approach is designed to be:
- **Growth-exclusive**: Gated at cron, API, and UI layers — non-Growth users see a locked upsell
- **Spotify-only at launch**: Apple Music and other providers only if users request them
- **Zero-config for Growth users**: Automatically enrolled when they upgrade, monitoring starts immediately
- **Low-noise**: Baseline seeding + auto-confirmation prevents alert fatigue
- **Actionable**: One-click confirm/dispute from email and chat carousel, with takedown guidance
- **Safe**: HMAC-signed action tokens, rate limiting, feature-gated rollout
- **Downgrade-safe**: Data retained 90 days, seamless re-activation on re-upgrade
