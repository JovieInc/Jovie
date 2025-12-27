# Discography Release Planning Feature

## Overview

A comprehensive release management system that supports future releases with editable data until release, automatic locking post-release with ISRC sync from DSPs (Spotify, Apple Music, etc.), production status tracking (mixed/mastered/scheduled/released), Session Studio import, AI assistance, and future-proofing for becoming a distributor.

---

## Core Concepts

### Release Lifecycle States

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          RELEASE LIFECYCLE                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────┐    ┌──────────┐    ┌───────────┐    ┌───────────┐            │
│   │  DRAFT  │───▶│  MIXED   │───▶│ MASTERED  │───▶│ SCHEDULED │            │
│   └─────────┘    └──────────┘    └───────────┘    └───────────┘            │
│        │                                                 │                  │
│        │         ┌─────────────────────────────────────┘                   │
│        │         ▼                                                          │
│        │    ┌──────────┐    ┌────────────┐                                 │
│        └───▶│ RELEASED │───▶│   LOCKED   │  ← Syncs with ISRC/DSP data    │
│             └──────────┘    └────────────┘                                 │
│                                    │                                        │
│                                    ▼                                        │
│                          (Immutable - DSP is source of truth)              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Data Ownership Model

| State | Owner | Editable | ISRC Source |
|-------|-------|----------|-------------|
| `draft` | Creator | ✅ Full edit | Manual/None |
| `mixed` | Creator | ✅ Full edit | Manual/None |
| `mastered` | Creator | ✅ Full edit | Manual/None |
| `scheduled` | Creator | ⚠️ Limited (no tracks) | Pending DSP |
| `released` | Creator | ⚠️ Limited (metadata only) | DSP Sync |
| `locked` | DSP | ❌ Read-only | DSP Authoritative |

---

## Database Schema Changes

### 1. New Enum: `release_production_status`

```sql
CREATE TYPE release_production_status AS ENUM (
  'draft',
  'recording',
  'mixed',
  'mastered',
  'scheduled',
  'released',
  'locked'
);
```

### 2. New Enum: `release_lock_status`

```sql
CREATE TYPE release_lock_status AS ENUM (
  'unlocked',        -- Full edit access
  'partial_lock',    -- Limited edits (post-schedule)
  'locked'           -- Read-only (DSP synced)
);
```

### 3. Enhanced `discog_releases` Table

Add columns to existing table:

```typescript
// lib/db/schema.ts additions
export const releaseProductionStatus = pgEnum('release_production_status', [
  'draft',
  'recording',
  'mixed',
  'mastered',
  'scheduled',
  'released',
  'locked'
]);

export const releaseLockStatus = pgEnum('release_lock_status', [
  'unlocked',
  'partial_lock',
  'locked'
]);

// Add to discogReleases table
productionStatus: releaseProductionStatus('production_status').default('draft').notNull(),
lockStatus: releaseLockStatus('lock_status').default('unlocked').notNull(),
scheduledReleaseDate: timestamp('scheduled_release_date', { withTimezone: true }),
actualReleaseDate: timestamp('actual_release_date', { withTimezone: true }),
lockedAt: timestamp('locked_at', { withTimezone: true }),
lockedBySync: boolean('locked_by_sync').default(false),
distributorId: text('distributor_id'), // For future distribution
distributionStatus: text('distribution_status'), // pending, submitted, live, rejected
lastDspSyncAt: timestamp('last_dsp_sync_at', { withTimezone: true }),
dspConflicts: jsonb('dsp_conflicts'), // Track differences between local and DSP data
```

### 4. New Table: `release_production_history`

Track state transitions for audit and timeline:

```typescript
export const releaseProductionHistory = pgTable('release_production_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  releaseId: uuid('release_id').notNull().references(() => discogReleases.id, { onDelete: 'cascade' }),
  fromStatus: releaseProductionStatus('from_status'),
  toStatus: releaseProductionStatus('to_status').notNull(),
  changedBy: text('changed_by').notNull(), // clerkUserId or 'system'
  changedAt: timestamp('changed_at', { withTimezone: true }).defaultNow().notNull(),
  reason: text('reason'),
  metadata: jsonb('metadata'), // AI suggestions, sync details, etc.
});
```

### 5. New Table: `release_collaborators`

For production team tracking:

```typescript
export const releaseCollaborators = pgTable('release_collaborators', {
  id: uuid('id').primaryKey().defaultRandom(),
  releaseId: uuid('release_id').notNull().references(() => discogReleases.id, { onDelete: 'cascade' }),
  role: text('role').notNull(), // producer, mixer, master_engineer, featured_artist, writer
  name: text('name').notNull(),
  isrcPartyId: text('isrc_party_id'), // For distribution credits
  split: decimal('split', { precision: 5, scale: 2 }), // Royalty split percentage
  creatorProfileId: uuid('creator_profile_id').references(() => creatorProfiles.id), // If Jovie user
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
```

### 6. New Table: `session_studio_imports`

Track imports from Session Studio:

```typescript
export const sessionStudioImports = pgTable('session_studio_imports', {
  id: uuid('id').primaryKey().defaultRandom(),
  creatorProfileId: uuid('creator_profile_id').notNull().references(() => creatorProfiles.id),
  releaseId: uuid('release_id').references(() => discogReleases.id),
  importedAt: timestamp('imported_at', { withTimezone: true }).defaultNow().notNull(),
  sourceFormat: text('source_format').notNull(), // 'session_studio_v1', 'session_studio_v2', etc.
  rawPayload: jsonb('raw_payload').notNull(),
  mappingResult: jsonb('mapping_result'), // How fields were mapped
  status: text('status').notNull(), // pending, processing, completed, failed
  error: text('error'),
});
```

### 7. New Table: `distribution_submissions` (Future-Proofing)

```typescript
export const distributionSubmissions = pgTable('distribution_submissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  releaseId: uuid('release_id').notNull().references(() => discogReleases.id, { onDelete: 'cascade' }),
  distributorId: text('distributor_id').notNull(), // 'jovie', 'distrokid', 'tunecore', etc.
  submittedAt: timestamp('submitted_at', { withTimezone: true }).defaultNow().notNull(),
  status: text('status').notNull(), // draft, submitted, processing, approved, rejected, live
  submissionPayload: jsonb('submission_payload'), // What was sent
  distributorResponse: jsonb('distributor_response'), // What came back
  upc: text('upc'), // Assigned UPC
  isrcAssignments: jsonb('isrc_assignments'), // {trackId: isrc} for assigned ISRCs
  rejectionReason: text('rejection_reason'),
  liveAt: timestamp('live_at', { withTimezone: true }),
});
```

---

## Core Library Architecture

### 1. Release State Machine (`lib/discography/release-state-machine.ts`)

```typescript
interface ReleaseStateTransition {
  from: ReleaseProductionStatus[];
  to: ReleaseProductionStatus;
  guard?: (release: DiscogRelease) => { allowed: boolean; reason?: string };
  sideEffects?: (release: DiscogRelease, tx: Transaction) => Promise<void>;
}

const transitions: Record<string, ReleaseStateTransition> = {
  startRecording: {
    from: ['draft'],
    to: 'recording',
  },
  completeMixing: {
    from: ['draft', 'recording'],
    to: 'mixed',
    guard: (release) => ({
      allowed: release.tracks.length > 0,
      reason: 'Release must have at least one track',
    }),
  },
  completeMastering: {
    from: ['mixed'],
    to: 'mastered',
  },
  schedule: {
    from: ['mastered'],
    to: 'scheduled',
    guard: (release) => ({
      allowed: !!release.scheduledReleaseDate && release.scheduledReleaseDate > new Date(),
      reason: 'Scheduled release date must be in the future',
    }),
    sideEffects: async (release, tx) => {
      // Apply partial lock
      await tx.update(discogReleases)
        .set({ lockStatus: 'partial_lock' })
        .where(eq(discogReleases.id, release.id));
    },
  },
  release: {
    from: ['scheduled', 'mastered'],
    to: 'released',
    sideEffects: async (release, tx) => {
      // Set actual release date
      await tx.update(discogReleases)
        .set({
          actualReleaseDate: new Date(),
          lockStatus: 'partial_lock'
        })
        .where(eq(discogReleases.id, release.id));
      // Queue DSP sync job
      await queueDspSync(release.id);
    },
  },
  lock: {
    from: ['released'],
    to: 'locked',
    guard: (release) => ({
      allowed: release.lockStatus !== 'unlocked',
      reason: 'Release must be partially locked first',
    }),
    sideEffects: async (release, tx) => {
      await tx.update(discogReleases)
        .set({
          lockStatus: 'locked',
          lockedAt: new Date(),
          lockedBySync: true
        })
        .where(eq(discogReleases.id, release.id));
    },
  },
};
```

### 2. Lock Manager (`lib/discography/release-lock-manager.ts`)

```typescript
export class ReleaseLockManager {
  // Check if field is editable given current lock status
  isFieldEditable(release: DiscogRelease, field: string): boolean {
    const lockStatus = release.lockStatus;

    if (lockStatus === 'locked') return false;

    if (lockStatus === 'partial_lock') {
      // Only allow metadata edits, not track changes
      const allowedFields = ['label', 'artworkUrl', 'metadata.description'];
      return allowedFields.includes(field);
    }

    return true; // unlocked
  }

  // Get all editable fields for current state
  getEditableFields(release: DiscogRelease): string[] { ... }

  // Validate edit attempt
  validateEdit(release: DiscogRelease, changes: Partial<DiscogRelease>): ValidationResult { ... }

  // Force unlock (admin only, with audit trail)
  async forceUnlock(releaseId: string, adminId: string, reason: string): Promise<void> { ... }
}
```

### 3. DSP Sync Service (`lib/discography/dsp-sync-service.ts`)

```typescript
export class DspSyncService {
  // Sync release with DSP data (Spotify, Apple Music, etc.)
  async syncWithDsp(releaseId: string): Promise<SyncResult> {
    const release = await this.getRelease(releaseId);
    const dspData = await this.fetchDspData(release);

    // Compare and detect conflicts
    const conflicts = this.detectConflicts(release, dspData);

    if (conflicts.length > 0) {
      // Store conflicts for review
      await this.storeConflicts(releaseId, conflicts);
      return { status: 'conflicts', conflicts };
    }

    // Apply DSP data (ISRC, duration, etc.)
    await this.applyDspData(releaseId, dspData);

    // Lock the release
    await this.stateMachine.transition(release, 'lock');

    return { status: 'synced' };
  }

  // Fetch data from all connected DSPs
  async fetchDspData(release: DiscogRelease): Promise<DspData> {
    const providers = await this.getConnectedProviders(release.id);
    const results = await Promise.all(
      providers.map(p => this.fetchFromProvider(p, release))
    );
    return this.mergeProviderData(results);
  }

  // ISRC matching logic
  matchIsrc(localTrack: DiscogTrack, dspTracks: DspTrack[]): MatchResult { ... }

  // Handle conflicts between local and DSP data
  async resolveConflict(
    releaseId: string,
    conflictId: string,
    resolution: 'keep_local' | 'accept_dsp' | 'merge'
  ): Promise<void> { ... }
}
```

### 4. Session Studio Importer (`lib/discography/session-studio-import.ts`)

```typescript
interface SessionStudioProject {
  projectName: string;
  artist: string;
  tracks: SessionStudioTrack[];
  collaborators: SessionStudioCollaborator[];
  exportDate: string;
  version: string;
}

interface SessionStudioTrack {
  title: string;
  duration: number;
  bpm?: number;
  key?: string;
  stems?: SessionStudioStem[];
  notes?: string;
  status?: 'rough' | 'mixed' | 'mastered';
}

export class SessionStudioImporter {
  // Parse Session Studio export format
  parse(payload: unknown): SessionStudioProject { ... }

  // Map to Jovie release structure
  async mapToRelease(
    project: SessionStudioProject,
    creatorProfileId: string
  ): Promise<MappedRelease> {
    return {
      release: {
        title: project.projectName,
        releaseType: this.inferReleaseType(project.tracks.length),
        productionStatus: this.inferProductionStatus(project.tracks),
        metadata: {
          sessionStudio: {
            importedAt: new Date().toISOString(),
            version: project.version,
          }
        }
      },
      tracks: project.tracks.map((t, i) => ({
        title: t.title,
        trackNumber: i + 1,
        durationMs: t.duration * 1000,
        metadata: {
          bpm: t.bpm,
          key: t.key,
          productionNotes: t.notes,
        }
      })),
      collaborators: project.collaborators.map(c => ({
        name: c.name,
        role: this.mapRole(c.role),
      })),
    };
  }

  // Full import flow
  async import(
    payload: unknown,
    creatorProfileId: string,
    options: ImportOptions
  ): Promise<ImportResult> {
    const parsed = this.parse(payload);
    const mapped = await this.mapToRelease(parsed, creatorProfileId);

    // AI assistance: suggest improvements
    if (options.useAiSuggestions) {
      mapped.aiSuggestions = await this.getAiSuggestions(mapped);
    }

    // Create or merge with existing release
    if (options.mergeWithExisting && options.existingReleaseId) {
      return this.mergeWithExisting(mapped, options.existingReleaseId);
    }

    return this.createNewRelease(mapped, creatorProfileId);
  }
}
```

### 5. AI Assistant (`lib/discography/ai-assistant.ts`)

```typescript
export class DiscographyAiAssistant {
  // Suggest production status based on track data
  async suggestProductionStatus(release: DiscogRelease): Promise<StatusSuggestion> { ... }

  // Analyze track metadata for completeness
  async analyzeMetadataCompleteness(release: DiscogRelease): Promise<CompletenessReport> {
    return {
      score: 0.85,
      missing: ['genre', 'mood tags'],
      suggestions: [
        { field: 'genre', value: 'Electronic', confidence: 0.92 },
        { field: 'moodTags', value: ['energetic', 'uplifting'], confidence: 0.78 },
      ]
    };
  }

  // Suggest release date based on market data
  async suggestReleaseDate(release: DiscogRelease): Promise<ReleaseDateSuggestion> {
    // Analyze:
    // - Day of week patterns (Friday releases)
    // - Avoid major release conflicts
    // - Artist's historical release patterns
    // - Seasonal trends
  }

  // Generate release description/bio
  async generateDescription(release: DiscogRelease): Promise<string> { ... }

  // Validate release for distribution readiness
  async validateForDistribution(release: DiscogRelease): Promise<ValidationResult> {
    const checks = [
      this.checkArtworkSpecs(),      // Min 3000x3000, no logos
      this.checkMetadataComplete(),   // All required fields
      this.checkTrackDurations(),     // Min 30s for streaming
      this.checkExplicitContent(),    // Explicit flags set correctly
      this.checkIsrcAssigned(),       // ISRCs present or will be assigned
    ];
    return Promise.all(checks);
  }
}
```

---

## API Routes

### Release Management

```
POST   /api/releases                    # Create new release (draft)
GET    /api/releases                    # List creator's releases
GET    /api/releases/:id                # Get release details
PATCH  /api/releases/:id                # Update release (respects lock)
DELETE /api/releases/:id                # Delete release (only if unlocked)

POST   /api/releases/:id/transition     # Transition production status
POST   /api/releases/:id/schedule       # Schedule release date
POST   /api/releases/:id/release-now    # Release immediately
POST   /api/releases/:id/lock           # Manually lock release
POST   /api/releases/:id/unlock         # Admin unlock (requires reason)
```

### DSP Sync

```
POST   /api/releases/:id/sync           # Trigger DSP sync
GET    /api/releases/:id/sync/status    # Get sync status
GET    /api/releases/:id/conflicts      # Get DSP conflicts
POST   /api/releases/:id/conflicts/:cid/resolve  # Resolve conflict
```

### Session Studio Import

```
POST   /api/imports/session-studio      # Import from Session Studio
GET    /api/imports/session-studio/:id  # Get import status
POST   /api/imports/session-studio/:id/apply  # Apply import to release
```

### AI Assistant

```
POST   /api/releases/:id/ai/suggest-status       # Get status suggestion
POST   /api/releases/:id/ai/analyze-completeness # Metadata analysis
POST   /api/releases/:id/ai/suggest-release-date # Date suggestion
POST   /api/releases/:id/ai/generate-description # Generate bio
POST   /api/releases/:id/ai/validate-distribution # Distribution check
```

### Distribution (Future)

```
POST   /api/releases/:id/distribute     # Submit for distribution
GET    /api/releases/:id/distribution   # Get distribution status
POST   /api/releases/:id/distribution/retry # Retry failed submission
```

---

## UI Components

### 1. Release Timeline View

Visual timeline showing production stages with current position:

```
[Draft] ──→ [Recording] ──→ [Mixed] ──→ [Mastered] ──→ [Scheduled] ──→ [Released] ──→ [Locked]
                               ▲
                               │ You are here
```

### 2. Release Editor

- Full edit mode when unlocked
- Restricted edit mode when partially locked (visual indicators)
- Read-only mode when locked
- DSP conflict resolution UI
- AI suggestion chips

### 3. Import Wizard

- Drag & drop Session Studio file
- Preview mapped data
- Review AI suggestions
- Merge or create options

### 4. Distribution Dashboard (Future)

- Submission status per DSP
- Rejection reasons
- Re-submission options
- ISRC/UPC assignment display

---

## Implementation Phases

### Phase 1: Core State Machine & Lock System
1. Add new database columns and enums via migration
2. Implement `ReleaseStateMachine` with all transitions
3. Implement `ReleaseLockManager` with field-level controls
4. Add `release_production_history` table and audit logging
5. Create API routes for state transitions
6. Add UI for release timeline and status changes

### Phase 2: DSP Sync & ISRC Locking
1. Implement `DspSyncService` with Spotify integration
2. Add conflict detection and storage
3. Create conflict resolution UI
4. Implement automatic locking after sync
5. Add sync scheduling (periodic re-sync for released content)

### Phase 3: Session Studio Import & AI
1. Define Session Studio format specification
2. Implement `SessionStudioImporter`
3. Create import wizard UI
4. Integrate AI assistant for suggestions
5. Add metadata completeness analysis

### Phase 4: Distribution Foundation
1. Create `distribution_submissions` table
2. Implement distributor adapter interface
3. Build distribution validation checks
4. Create submission workflow
5. Future: Implement Jovie as a distributor

---

## Data Model Relationships

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  creator_profiles                                                            │
│       │                                                                      │
│       │ 1:N                                                                  │
│       ▼                                                                      │
│  discog_releases ─────────────────┬─────────────────────────────────────┐   │
│       │                           │                                     │   │
│       │ 1:N                       │ 1:N                                 │   │
│       ▼                           ▼                                     ▼   │
│  discog_tracks              release_collaborators        distribution_     │
│       │                                                   submissions       │
│       │ 1:N                                                                 │
│       ▼                                                                      │
│  provider_links                                                              │
│                                                                              │
│                                                                              │
│  release_production_history (audit log for all releases)                    │
│  session_studio_imports (import tracking)                                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Future-Proofing Considerations

### For Becoming a Distributor

1. **ISRC Assignment**: Build infrastructure to assign ISRCs from Jovie's own prefix
2. **UPC Generation**: Implement UPC assignment for releases
3. **Delivery Formats**: Support industry-standard delivery (DDEX, etc.)
4. **Royalty Tracking**: Schema supports split percentages on collaborators
5. **Multi-Territory**: Provider links already support country-specific URLs
6. **Rights Management**: Collaborator roles can expand to include rights holders

### For Scale

1. **Job Queue**: Use existing ingestion job pattern for sync/import tasks
2. **Idempotency**: All imports use upsert patterns
3. **Conflict Resolution**: Store conflicts in JSONB for flexible schema evolution
4. **Audit Trail**: Full history tracking for compliance

---

## Questions for Clarification

1. **Session Studio Format**: Do you have a sample export file or documentation for the Session Studio format? This will help define the exact parsing logic.

2. **Lock Override**: Should there be a way for creators to request unlock (with admin approval), or is locked truly permanent?

3. **DSP Priority**: Which DSPs should be prioritized for sync? Currently Spotify is most integrated.

4. **AI Features**: Should AI suggestions require explicit opt-in, or be shown by default with dismiss option?

5. **Distribution Timeline**: Is becoming a distributor a near-term goal (3-6 months) or longer-term (12+ months)? This affects how much infrastructure to build now.

---

## Summary

This plan creates a robust release management system that:

- ✅ Supports full editing during production phases
- ✅ Automatically locks after release with DSP sync
- ✅ Tracks ISRC data from authoritative sources (Spotify, etc.)
- ✅ Manages production states (draft → mixed → mastered → scheduled → released)
- ✅ Imports from Session Studio format
- ✅ Provides AI assistance for metadata and scheduling
- ✅ Future-proofs for Jovie becoming a distributor
- ✅ Maintains full audit trail of all changes
- ✅ Follows existing codebase patterns (ingestion jobs, state managers, etc.)
