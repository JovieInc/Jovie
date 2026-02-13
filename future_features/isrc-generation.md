# ISRC Auto-Generation

## Overview

Auto-generate ISRC (International Standard Recording Code) codes for new releases during the creation process. Artists with their own ISRC registrant prefix can generate valid, unique ISRCs with a single click, eliminating manual entry errors and duplicate codes.

---

## Problem Statement

Currently:
1. Artists manually enter ISRC codes or rely on distributors to assign them
2. Manual entry leads to typos, duplicates, and formatting errors
3. No validation against existing ISRCs in the system
4. Artists who own their own ISRC prefix (a paid registration with their national ISRC agency) have no tooling to manage sequential assignment
5. Duplicate ISRCs across non-duplicate releases go undetected, causing royalty attribution issues

**Goal:** A "Generate ISRC" button during release creation that auto-assigns valid, unique, sequential ISRC codes for artists who have registered their own prefix.

---

## ISRC Format Reference

```
CC-XXX-YY-NNNNN

CC      = Country code (2 alpha chars, e.g., US, GB, DE)
XXX     = Registrant code (3 alphanumeric chars, assigned by national agency)
YY      = Year of reference (2 digits, year the ISRC is assigned)
NNNNN   = Designation code (5 digits, sequential per registrant per year)
```

Example: `USRC12500001` = US registrant RC1, year 2025, designation 00001

Full format with dashes: `US-RC1-25-00001` (stored without dashes, displayed with)

---

## User Stories

- As an artist with my own ISRC prefix, I want to auto-generate ISRCs for my tracks so I don't have to manually manage sequential numbering
- As an artist without a prefix, I want to understand what ISRC is and how to get my own prefix
- As any artist, I want the system to prevent duplicate ISRCs so my royalties are correctly attributed
- As an admin, I want to detect and flag duplicate ISRCs across different releases to resolve conflicts

---

## Feature Requirements

### 1. ISRC Prefix Settings (Paid Feature)

**Gating:** Only available to users who have configured their own ISRC prefix in settings. The setting is available to all plan tiers, but having a prefix is itself a real-world paid item (registration with national ISRC agency costs ~$95 USD one-time via USISRC).

**Settings UI:**
- New section in Dashboard > Settings: "ISRC Configuration"
- Fields:
  - `Country Code` (2-char, dropdown of ISO 3166-1 alpha-2 codes)
  - `Registrant Code` (3-char alphanumeric, validated format)
- Tooltip/education link: "Don't have an ISRC prefix? [Learn how to register →](https://usisrc.org)" with brief explainer:
  > "An ISRC prefix lets you assign your own recording codes. Registration costs ~$95 (one-time) through your national ISRC agency. Once registered, Jovie can auto-generate codes for all your releases."
- Validation: prefix format must match `[A-Z]{2}[A-Z0-9]{3}`
- Save triggers a verification that the prefix isn't already claimed by another Jovie user

### 2. ISRC Generation During Release Creation

**UI: "Generate ISRC" button** on the track detail view during release creation/editing:

```
┌─────────────────────────────────────────────┐
│ Track 1: "Midnight Drive"                   │
│                                             │
│ ISRC: [________________]  [Generate ISRC]   │
│                                             │
│   ℹ️ Auto-generates: US-RC1-25-XXXXX       │
│                                             │
│ Track 2: "Neon Lights"                      │
│                                             │
│ ISRC: [________________]  [Generate ISRC]   │
│                                             │
│ ─────────────────────────────────────────── │
│ [Generate All Missing ISRCs]                │
└─────────────────────────────────────────────┘
```

**Behavior:**
- Button only appears if user has configured their ISRC prefix in settings
- If no prefix configured, show disabled state with tooltip: "Set up your ISRC prefix in Settings to auto-generate codes"
- "Generate ISRC" assigns the next available sequential designation code for the current year
- "Generate All Missing ISRCs" batch-generates for all tracks without an ISRC in the current release
- Generated codes appear in the input field and can be manually overridden
- Codes are not committed to DB until the release is saved (allows undo)

### 3. Duplicate Protection

**Three layers of duplicate prevention:**

#### Layer 1: Unique DB Constraint (existing)
- `discog_tracks.isrc` already has a unique partial index (`discog_tracks_isrc_unique` where `isrc IS NOT NULL`)
- Prevents the same ISRC from being saved on two different tracks

#### Layer 2: Pre-save Validation
- Before saving, query all ISRCs being assigned in the current release against existing ISRCs in the DB
- If any collision found, show inline error: "ISRC {code} is already assigned to '{track title}' on '{release title}'"
- Block save until resolved

#### Layer 3: Cross-Release Duplicate Detection (Background)
- Periodic scan (cron or on-demand) to detect ISRCs shared across non-duplicate releases
- Flag in the AI chat as an issue needing resolution:
  > "Duplicate ISRC detected: `USRC12500003` appears on both 'Midnight Drive' (Single, 2025) and 'Best Hits Vol. 2' (Compilation, 2025). This may cause royalty attribution issues. [Resolve →]"
- Dashboard notification for flagged duplicates
- Resolution actions:
  - "This is correct (compilation/re-release)" - mark as intentional duplicate
  - "Generate new ISRC for [track]" - reassign
  - "Dismiss" - acknowledge and suppress

### 4. Sequential Designation Tracking

**New table: `isrc_registrant_sequences`**

Tracks the next available designation code per registrant prefix per year:

```sql
CREATE TABLE isrc_registrant_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_profile_id UUID NOT NULL REFERENCES creator_profiles(id) ON DELETE CASCADE,
  country_code CHAR(2) NOT NULL,
  registrant_code CHAR(3) NOT NULL,
  year SMALLINT NOT NULL,                    -- 2-digit reference year (e.g., 25 for 2025)
  next_designation INTEGER NOT NULL DEFAULT 1, -- Next available designation (1-99999)
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL,

  UNIQUE (creator_profile_id, country_code, registrant_code, year),
  CHECK (next_designation >= 1 AND next_designation <= 99999),
  CHECK (year >= 0 AND year <= 99)
);
```

**Generation logic:**
1. Look up the user's prefix from `creator_profiles.settings` (or a dedicated field)
2. Get current 2-digit year
3. Atomically increment `next_designation` for that prefix+year (use `UPDATE ... RETURNING` for concurrency safety)
4. If `next_designation > 99999`, return error: "ISRC designation limit reached for this year. Contact support."
5. Format: `{country_code}{registrant_code}{year}{designation:05d}`
6. Verify the generated ISRC doesn't already exist in `discog_tracks` (belt and suspenders)

**Concurrency:** Use a database-level atomic increment to prevent race conditions when multiple tracks are being created simultaneously:

```sql
UPDATE isrc_registrant_sequences
SET next_designation = next_designation + 1, updated_at = NOW()
WHERE creator_profile_id = $1
  AND country_code = $2
  AND registrant_code = $3
  AND year = $4
RETURNING next_designation - 1 AS assigned_designation;
```

If no row exists, insert with `next_designation = 2` and return 1.

---

## Technical Design

### Database Changes

#### 1. New fields on `creator_profiles.settings` JSONB:

```typescript
// In creator_profiles.settings JSONB
interface CreatorProfileSettings {
  // ... existing fields ...
  isrcCountryCode?: string;      // 2-char ISO country code
  isrcRegistrantCode?: string;   // 3-char registrant code
}
```

#### 2. New table: `isrc_registrant_sequences`

```typescript
// apps/web/lib/db/schema/content.ts

export const isrcRegistrantSequences = pgTable(
  'isrc_registrant_sequences',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    countryCode: text('country_code').notNull(),   // 2-char
    registrantCode: text('registrant_code').notNull(), // 3-char
    year: integer('year').notNull(),               // 2-digit year
    nextDesignation: integer('next_designation').notNull().default(1),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    prefixYearUnique: uniqueIndex('isrc_sequences_prefix_year_unique').on(
      table.creatorProfileId,
      table.countryCode,
      table.registrantCode,
      table.year
    ),
    nextDesignationRange: check(
      'isrc_sequences_designation_range',
      drizzleSql`next_designation >= 1 AND next_designation <= 99999`
    ),
    yearRange: check(
      'isrc_sequences_year_range',
      drizzleSql`year >= 0 AND year <= 99`
    ),
  })
);
```

#### 3. New table: `isrc_duplicate_flags`

```typescript
export const isrcDuplicateFlags = pgTable(
  'isrc_duplicate_flags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    isrc: text('isrc').notNull(),
    trackIdA: uuid('track_id_a')
      .notNull()
      .references(() => discogTracks.id, { onDelete: 'cascade' }),
    trackIdB: uuid('track_id_b')
      .notNull()
      .references(() => discogTracks.id, { onDelete: 'cascade' }),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('open'), // 'open' | 'intentional' | 'resolved' | 'dismissed'
    resolvedAt: timestamp('resolved_at'),
    resolvedAction: text('resolved_action'), // 'marked_intentional' | 'reassigned' | 'dismissed'
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    isrcIndex: index('isrc_duplicate_flags_isrc_idx').on(table.isrc),
    creatorIndex: index('isrc_duplicate_flags_creator_idx').on(table.creatorProfileId),
    statusIndex: index('isrc_duplicate_flags_status_idx').on(table.status),
    pairUnique: uniqueIndex('isrc_duplicate_flags_pair_unique').on(
      table.isrc,
      table.trackIdA,
      table.trackIdB
    ),
  })
);
```

### Server Actions

```typescript
// apps/web/app/app/(shell)/dashboard/releases/isrc-actions.ts

'use server';

import { db } from '@/lib/db';
import { isrcRegistrantSequences, discogTracks } from '@/lib/db/schema/content';
import { creatorProfiles } from '@/lib/db/schema/profiles';

/**
 * Generate the next ISRC for a given creator's prefix.
 * Uses atomic DB increment for concurrency safety.
 */
export async function generateIsrc(
  creatorProfileId: string
): Promise<{ isrc: string } | { error: string }> {
  // 1. Get the user's ISRC prefix from settings
  const [profile] = await db
    .select({ settings: creatorProfiles.settings })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.id, creatorProfileId))
    .limit(1);

  const countryCode = profile?.settings?.isrcCountryCode;
  const registrantCode = profile?.settings?.isrcRegistrantCode;

  if (!countryCode || !registrantCode) {
    return { error: 'ISRC prefix not configured. Set it up in Settings.' };
  }

  const currentYear = new Date().getFullYear() % 100; // 2-digit year

  // 2. Atomically get and increment the next designation
  const result = await db.transaction(async (tx) => {
    // Try to increment existing row
    const [updated] = await tx
      .update(isrcRegistrantSequences)
      .set({
        nextDesignation: drizzleSql`next_designation + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(isrcRegistrantSequences.creatorProfileId, creatorProfileId),
          eq(isrcRegistrantSequences.countryCode, countryCode),
          eq(isrcRegistrantSequences.registrantCode, registrantCode),
          eq(isrcRegistrantSequences.year, currentYear)
        )
      )
      .returning({ assigned: drizzleSql`next_designation - 1` });

    if (updated) {
      return updated.assigned as number;
    }

    // No row exists yet — insert with next_designation = 2, return 1
    await tx.insert(isrcRegistrantSequences).values({
      creatorProfileId,
      countryCode,
      registrantCode,
      year: currentYear,
      nextDesignation: 2,
    });

    return 1;
  });

  if (result > 99999) {
    return { error: 'ISRC designation limit (99999) reached for this year.' };
  }

  // 3. Format the ISRC
  const designation = String(result).padStart(5, '0');
  const yearStr = String(currentYear).padStart(2, '0');
  const isrc = `${countryCode}${registrantCode}${yearStr}${designation}`;

  // 4. Verify uniqueness (belt and suspenders)
  const [existing] = await db
    .select({ id: discogTracks.id })
    .from(discogTracks)
    .where(eq(discogTracks.isrc, isrc))
    .limit(1);

  if (existing) {
    // Extremely unlikely with sequential assignment, but handle it
    return { error: `Generated ISRC ${isrc} already exists. Try again.` };
  }

  return { isrc };
}

/**
 * Batch generate ISRCs for all tracks without one in a release.
 */
export async function generateIsrcsForRelease(
  creatorProfileId: string,
  releaseId: string
): Promise<{ isrcs: Record<string, string> } | { error: string }> {
  // Get tracks without ISRCs
  const tracks = await db
    .select({ id: discogTracks.id, trackNumber: discogTracks.trackNumber })
    .from(discogTracks)
    .where(
      and(
        eq(discogTracks.releaseId, releaseId),
        isNull(discogTracks.isrc)
      )
    )
    .orderBy(asc(discogTracks.discNumber), asc(discogTracks.trackNumber));

  if (tracks.length === 0) {
    return { isrcs: {} };
  }

  const isrcs: Record<string, string> = {};
  for (const track of tracks) {
    const result = await generateIsrc(creatorProfileId);
    if ('error' in result) return result;
    isrcs[track.id] = result.isrc;
  }

  return { isrcs };
}
```

### Duplicate Detection Cron

```typescript
// apps/web/lib/cron/detect-isrc-duplicates.ts

/**
 * Scans for ISRC codes that appear on tracks belonging to different releases
 * where the duplication hasn't been flagged or resolved.
 * Run daily via cron.
 */
export async function detectIsrcDuplicates() {
  // Find ISRCs that appear on multiple tracks across different releases
  const duplicates = await db.execute(drizzleSql`
    SELECT
      t1.isrc,
      t1.id AS track_id_a,
      t2.id AS track_id_b,
      t1.creator_profile_id
    FROM discog_tracks t1
    JOIN discog_tracks t2 ON t1.isrc = t2.isrc AND t1.id < t2.id
    WHERE t1.isrc IS NOT NULL
      AND t1.release_id != t2.release_id
      AND NOT EXISTS (
        SELECT 1 FROM isrc_duplicate_flags f
        WHERE f.isrc = t1.isrc
          AND f.track_id_a = t1.id
          AND f.track_id_b = t2.id
      )
  `);

  for (const dup of duplicates.rows) {
    // Insert flag
    await db.insert(isrcDuplicateFlags).values({
      isrc: dup.isrc,
      trackIdA: dup.track_id_a,
      trackIdB: dup.track_id_b,
      creatorProfileId: dup.creator_profile_id,
      status: 'open',
    });

    // Queue chat notification for the artist
    // (integrate with existing AI chat notification system)
  }
}
```

---

## UI Components

### Settings Page: ISRC Configuration

```
┌─────────────────────────────────────────────────────┐
│ ⚙️ ISRC Configuration                               │
│                                                     │
│ Auto-generate ISRC codes for your releases.         │
│                                                     │
│ Country Code:     [US ▼]                            │
│ Registrant Code:  [RC1    ]                         │
│                                                     │
│ Your prefix: US-RC1                                 │
│                                                     │
│ ┌─────────────────────────────────────────────────┐ │
│ │ ℹ️  Don't have an ISRC prefix?                  │ │
│ │                                                 │ │
│ │ An ISRC prefix lets you assign your own         │ │
│ │ recording codes to tracks. Registration is      │ │
│ │ ~$95 (one-time) through your national ISRC      │ │
│ │ agency.                                         │ │
│ │                                                 │ │
│ │ [Learn more at usisrc.org →]                    │ │
│ └─────────────────────────────────────────────────┘ │
│                                                     │
│                              [Save ISRC Settings]   │
└─────────────────────────────────────────────────────┘
```

### Duplicate Alert (in AI Chat)

```
┌─────────────────────────────────────────────────────┐
│ ⚠️ Duplicate ISRC Detected                          │
│                                                     │
│ ISRC USRC12500003 appears on two different tracks:  │
│                                                     │
│ 1. "Midnight Drive" — Midnight Drive (Single, 2025) │
│ 2. "Midnight Drive" — Best Hits Vol. 2 (Comp, 2025) │
│                                                     │
│ This may cause royalty attribution issues.           │
│                                                     │
│ [This is correct ✓]  [Reassign ISRC]  [Dismiss]    │
└─────────────────────────────────────────────────────┘
```

---

## Gating & Access Control

| Condition | Behavior |
|-----------|----------|
| No ISRC prefix in settings | "Generate" button disabled, tooltip links to settings |
| ISRC prefix configured | "Generate" button active on all track forms |
| Free plan | Can use ISRC generation (it's the prefix that's the gate) |
| Pro/Growth plan | Same access — gating is by prefix ownership, not plan |

The ISRC prefix itself is the real-world paid gate (~$95 one-time through national agency). Jovie doesn't charge extra for the generation feature — it's a value-add for artists who already have a prefix.

---

## Edge Cases

### Year Rollover
- When generating on Jan 1 2026, year becomes `26`, designation resets to `00001`
- Automatic: new year = new sequence row

### Multiple Prefixes
- Some labels/artists may have multiple registrant codes
- Settings supports one prefix per profile initially
- Future: multi-prefix support with a selector during generation

### Imported Tracks with Existing ISRCs
- Spotify-imported tracks come with ISRCs already assigned
- "Generate" button should be hidden/disabled for tracks that already have ISRCs
- Manual override still possible via direct field edit

### Prefix Collision Between Users
- Two Jovie users should not configure the same prefix (they'd generate overlapping ISRCs)
- On save, check if any other `creator_profiles` has the same prefix
- If collision, show error: "This ISRC prefix is already registered by another Jovie user"

### Deleted Tracks
- If a track with a generated ISRC is deleted, that ISRC designation number is "burned" (standard practice — ISRCs are never reused)
- The sequence counter does not decrement

---

## Implementation Phases

### Phase 1: Settings & Prefix Storage
1. Add ISRC config section to Settings page
2. Store prefix in `creator_profiles.settings` JSONB
3. Validate prefix format and uniqueness across users
4. Education tooltip with link to national ISRC agency

### Phase 2: ISRC Generation
1. Create `isrc_registrant_sequences` table + migration
2. Implement `generateIsrc()` server action with atomic increment
3. Add "Generate ISRC" button to track detail form
4. Add "Generate All Missing ISRCs" batch button on release form

### Phase 3: Duplicate Detection
1. Create `isrc_duplicate_flags` table + migration
2. Pre-save validation (inline error on collision)
3. Background duplicate detection cron job
4. AI chat notification integration for flagged duplicates

### Phase 4: Resolution UI
1. Duplicate flag dashboard view
2. Resolution actions (mark intentional, reassign, dismiss)
3. Audit trail for ISRC changes

---

## Analytics Events

| Event | Properties | Trigger |
|-------|------------|---------|
| `isrc_prefix_configured` | `countryCode`, `registrantCode` | User saves ISRC prefix in settings |
| `isrc_generated` | `isrc`, `trackId`, `releaseId`, `method` (single/batch) | ISRC generated |
| `isrc_batch_generated` | `releaseId`, `count` | Batch generation completed |
| `isrc_duplicate_detected` | `isrc`, `trackIdA`, `trackIdB` | Background scan finds duplicate |
| `isrc_duplicate_resolved` | `isrc`, `action` | User resolves duplicate flag |
| `isrc_collision_prevented` | `isrc`, `trackId` | Pre-save validation catches collision |

---

## Files to Create/Modify

### New Files
```
apps/web/lib/db/schema/isrc.ts                     - Schema for sequences + flags tables
drizzle/migrations/XXXX_add_isrc_generation.ts      - Migration
apps/web/app/app/(shell)/dashboard/releases/isrc-actions.ts - Server actions
apps/web/components/dashboard/molecules/IsrcGenerator.tsx   - Generate button component
apps/web/components/dashboard/molecules/IsrcDuplicateAlert.tsx - Chat alert component
apps/web/components/dashboard/organisms/IsrcSettings.tsx    - Settings section
apps/web/lib/cron/detect-isrc-duplicates.ts         - Background duplicate scanner
```

### Modified Files
```
apps/web/lib/db/schema/content.ts    - Import/re-export ISRC schema
apps/web/lib/db/schema/index.ts      - Export new tables
apps/web/components/organisms/release-sidebar/TrackDetailPanel.tsx - Add Generate button
apps/web/app/app/(shell)/dashboard/settings/ - Add ISRC config section
```

---

## Success Metrics

| Metric | Target |
|--------|--------|
| ISRC prefix adoption (% of active artists) | 10%+ within 3 months |
| ISRCs generated via Jovie (monthly) | 500+ |
| Duplicate ISRCs detected & resolved | 95%+ resolution rate |
| Manual ISRC entry errors (post-launch) | -80% vs. pre-launch |
