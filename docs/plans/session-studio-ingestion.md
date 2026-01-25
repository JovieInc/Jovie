# Session Studio Song Ingestion - Implementation Plan

> **Status:** Planning
> **Author:** Claude
> **Date:** 2025-01-25

## Overview

This document outlines the implementation plan for ingesting songs from Session Studio into Jovie's discography system. The integration will follow established patterns from the existing Spotify import and DSP enrichment systems.

---

## 1. Research & Discovery Phase

### 1.1 Session Studio API Investigation

Before implementation, we need to determine:

- [ ] **Authentication method** - OAuth 2.0, API keys, or JWT tokens
- [ ] **API documentation** - Endpoints for fetching user tracks/projects
- [ ] **Rate limits** - Requests per minute/hour constraints
- [ ] **Data model** - How Session Studio structures songs, projects, collaborators
- [ ] **Available metadata** - ISRC, UPC, artwork, credits, stems, etc.
- [ ] **Webhook support** - Real-time notifications for new releases

### 1.2 Key Questions to Answer

1. Does Session Studio expose a public API or require partnership?
2. Can we fetch a user's complete catalog or only individual tracks?
3. Are there collaboration/credit structures we can leverage?
4. Does Session Studio provide ISRC codes for released tracks?
5. What file formats and quality levels are available?

---

## 2. Database Schema Changes

### 2.1 Add Session Studio to Providers Table

```sql
-- Migration: Add Session Studio provider
INSERT INTO providers (id, display_name, kind, base_url, is_active, metadata)
VALUES (
  'session-studio',
  'Session Studio',
  'music_streaming',
  'https://session.studio',
  true,
  '{"supportsImport": true, "supportsWebhooks": false}'::jsonb
);
```

### 2.2 Extend Artist External IDs (if needed)

Add `sessionStudioId` to the `artists` table if Session Studio provides unique artist identifiers:

```typescript
// In lib/db/schema/content.ts - extend artists table
sessionStudioId: varchar('session_studio_id', { length: 255 }),
```

### 2.3 Session Studio Sync Status

Extend or create sync tracking for Session Studio imports:

```typescript
// Option A: Use existing releaseSyncStatus table with Session Studio provider
// Option B: Create dedicated sessionStudioSyncStatus if unique fields needed
```

---

## 3. Core Implementation

### 3.1 Directory Structure

```
apps/web/lib/
├── session-studio/
│   ├── client.ts           # API client with auth & rate limiting
│   ├── types.ts            # TypeScript types for API responses
│   ├── auth.ts             # OAuth/token management
│   └── transforms.ts       # Convert Session Studio → Jovie models
├── discography/
│   └── session-studio-import.ts  # Import orchestration (like spotify-import.ts)
└── dsp-enrichment/
    └── providers/
        └── session-studio.ts     # DSP enrichment provider
```

### 3.2 Session Studio Client (`lib/session-studio/client.ts`)

Follow the pattern from `lib/spotify/client.ts`:

```typescript
// Core client responsibilities:
export class SessionStudioClient {
  // Authentication
  async getAccessToken(): Promise<string>;
  async refreshToken(): Promise<void>;

  // User data
  async getCurrentUser(): Promise<SessionStudioUser>;
  async getUserProjects(userId: string): Promise<SessionStudioProject[]>;

  // Track/song data
  async getProject(projectId: string): Promise<SessionStudioProject>;
  async getProjectTracks(projectId: string): Promise<SessionStudioTrack[]>;
  async getTrack(trackId: string): Promise<SessionStudioTrack>;

  // Search (for matching)
  async searchArtists(query: string): Promise<SessionStudioArtist[]>;
  async searchTracks(query: string): Promise<SessionStudioTrack[]>;

  // Rate limiting & circuit breaker
  private rateLimiter: RateLimiter;
  private circuitBreaker: CircuitBreaker;
}
```

### 3.3 Type Definitions (`lib/session-studio/types.ts`)

```typescript
export interface SessionStudioTrack {
  id: string;
  title: string;
  artistId: string;
  artistName: string;
  collaborators?: SessionStudioCollaborator[];
  durationMs: number;
  isrc?: string;
  releaseDate?: string;
  artworkUrl?: string;
  previewUrl?: string;
  isExplicit: boolean;
  genre?: string;
  bpm?: number;
  key?: string;
  stems?: SessionStudioStem[];
  metadata?: Record<string, unknown>;
}

export interface SessionStudioProject {
  id: string;
  title: string;
  type: 'single' | 'ep' | 'album' | 'compilation';
  tracks: SessionStudioTrack[];
  releaseDate?: string;
  artworkUrl?: string;
  upc?: string;
}

export interface SessionStudioCollaborator {
  id: string;
  name: string;
  role: 'main_artist' | 'featured' | 'producer' | 'writer' | 'engineer';
}

export interface SessionStudioStem {
  id: string;
  name: string;
  type: 'vocals' | 'drums' | 'bass' | 'melody' | 'other';
  url: string;
}
```

### 3.4 Import Orchestration (`lib/discography/session-studio-import.ts`)

Follow the established pattern from `spotify-import.ts`:

```typescript
export interface SessionStudioImportOptions {
  creatorProfileId: string;
  sessionStudioUserId: string;
  includeUnreleased?: boolean;
  includeCollaborations?: boolean;
  discoverCrossLinks?: boolean;
}

export interface SessionStudioImportResult {
  releasesImported: number;
  tracksImported: number;
  artistsCreated: number;
  providerLinksCreated: number;
  errors: ImportError[];
}

export async function importFromSessionStudio(
  options: SessionStudioImportOptions
): Promise<SessionStudioImportResult> {
  // 1. Fetch user's projects from Session Studio
  // 2. Transform to Jovie release/track models
  // 3. Upsert releases to discog_releases table
  // 4. Upsert tracks to discog_tracks table
  // 5. Create/update artist credits (trackArtists, releaseArtists)
  // 6. Create provider links for Session Studio
  // 7. Optionally trigger cross-platform link discovery
  // 8. Return import summary
}
```

### 3.5 Data Transformation (`lib/session-studio/transforms.ts`)

```typescript
import { SessionStudioProject, SessionStudioTrack } from './types';
import { InsertRelease, InsertTrack } from '@/lib/db/schema/content';

export function transformProject(
  project: SessionStudioProject,
  creatorProfileId: string
): InsertRelease {
  return {
    creatorProfileId,
    title: project.title,
    slug: generateSlug(project.title),
    releaseType: mapReleaseType(project.type),
    releaseDate: project.releaseDate,
    artworkUrl: project.artworkUrl,
    upc: project.upc,
    totalTracks: project.tracks.length,
    sourceType: 'ingested',
    metadata: { sessionStudioId: project.id },
  };
}

export function transformTrack(
  track: SessionStudioTrack,
  releaseId: string,
  creatorProfileId: string,
  trackNumber: number
): InsertTrack {
  return {
    releaseId,
    creatorProfileId,
    title: track.title,
    slug: generateSlug(track.title),
    durationMs: track.durationMs,
    trackNumber,
    isExplicit: track.isExplicit,
    isrc: track.isrc,
    previewUrl: track.previewUrl,
    sourceType: 'ingested',
    metadata: {
      sessionStudioId: track.id,
      bpm: track.bpm,
      key: track.key,
      hasStems: !!track.stems?.length,
    },
  };
}
```

---

## 4. User Authentication Flow

### 4.1 OAuth Integration (if Session Studio uses OAuth)

```typescript
// lib/session-studio/auth.ts

export async function initiateSessionStudioAuth(
  creatorProfileId: string,
  redirectUri: string
): Promise<string> {
  // Generate state token
  // Store in session/database
  // Return authorization URL
}

export async function handleSessionStudioCallback(
  code: string,
  state: string
): Promise<SessionStudioTokens> {
  // Validate state
  // Exchange code for tokens
  // Store tokens securely
  // Return tokens
}

export async function getStoredTokens(
  creatorProfileId: string
): Promise<SessionStudioTokens | null> {
  // Retrieve from database
  // Check expiration
  // Refresh if needed
}
```

### 4.2 Token Storage

Add to database schema if needed:

```typescript
// lib/db/schema/integrations.ts (new file or extend existing)

export const sessionStudioTokens = pgTable('session_studio_tokens', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  creatorProfileId: text('creator_profile_id')
    .notNull()
    .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token'),
  expiresAt: timestamp('expires_at'),
  scope: text('scope'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```

---

## 5. API Routes

### 5.1 OAuth Callback Route

```typescript
// app/api/integrations/session-studio/callback/route.ts

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');

  // Validate and exchange tokens
  // Store tokens
  // Redirect to dashboard with success message
}
```

### 5.2 Import Trigger Route

```typescript
// app/api/admin/session-studio-ingest/route.ts

export async function POST(request: Request) {
  const { creatorProfileId, options } = await request.json();

  // Validate admin permissions
  // Queue ingestion job
  // Return job ID for tracking
}
```

### 5.3 Sync Status Route

```typescript
// app/api/integrations/session-studio/status/route.ts

export async function GET(request: Request) {
  // Return current sync status
  // Last sync time
  // Tracks/releases synced
  // Any errors
}
```

---

## 6. Background Job Processing

### 6.1 Ingestion Job Handler

Extend existing ingestion job system:

```typescript
// lib/jobs/session-studio-import.ts

export async function processSessionStudioImportJob(
  job: IngestionJob
): Promise<void> {
  const { creatorProfileId, sessionStudioUserId, options } = job.payload;

  try {
    // Update job status to processing
    await updateJobStatus(job.id, 'processing');

    // Run import
    const result = await importFromSessionStudio({
      creatorProfileId,
      sessionStudioUserId,
      ...options,
    });

    // Update job with results
    await updateJobStatus(job.id, 'succeeded', { result });

  } catch (error) {
    // Handle failure
    await updateJobStatus(job.id, 'failed', { error: error.message });
    throw error;
  }
}
```

### 6.2 Webhook Handler (if supported)

```typescript
// app/api/webhooks/session-studio/route.ts

export async function POST(request: Request) {
  // Verify webhook signature
  const signature = request.headers.get('x-session-studio-signature');

  const payload = await request.json();

  switch (payload.event) {
    case 'track.published':
      // Queue import for new track
      break;
    case 'project.released':
      // Queue import for new release
      break;
    case 'collaborator.added':
      // Update artist credits
      break;
  }

  return new Response('OK', { status: 200 });
}
```

---

## 7. UI Components

### 7.1 Connection Settings

```typescript
// app/app/dashboard/settings/integrations/session-studio/page.tsx

export default function SessionStudioIntegrationPage() {
  // Show connection status
  // Connect/disconnect button
  // Last sync info
  // Manual sync trigger
  // Import preferences
}
```

### 7.2 Import Progress

```typescript
// components/integrations/session-studio-import-progress.tsx

export function SessionStudioImportProgress({ jobId }: { jobId: string }) {
  // Poll job status
  // Show progress bar
  // Display imported tracks/releases
  // Show any errors
}
```

---

## 8. Cross-Platform Link Discovery

After importing from Session Studio, leverage existing infrastructure:

```typescript
// Extend lib/discography/discovery.ts

export async function discoverLinksForSessionStudioImport(
  releaseIds: string[]
): Promise<void> {
  for (const releaseId of releaseIds) {
    // Get release with ISRC/UPC
    const release = await getRelease(releaseId);

    // Use existing DSP enrichment to find on other platforms
    await enrichReleaseWithCrossLinks(release);
  }
}
```

---

## 9. Environment Variables

Add to `lib/env.ts`:

```typescript
// Session Studio Integration
SESSION_STUDIO_CLIENT_ID: z.string().optional(),
SESSION_STUDIO_CLIENT_SECRET: z.string().optional(),
SESSION_STUDIO_WEBHOOK_SECRET: z.string().optional(),
SESSION_STUDIO_API_BASE_URL: z.string().url().optional()
  .default('https://api.session.studio/v1'),
```

---

## 10. Testing Strategy

### 10.1 Unit Tests

```typescript
// tests/unit/session-studio-transforms.test.ts
describe('Session Studio Transforms', () => {
  it('transforms project to release correctly');
  it('transforms track with all metadata');
  it('handles missing optional fields');
  it('maps collaborator roles correctly');
});

// tests/unit/session-studio-client.test.ts
describe('Session Studio Client', () => {
  it('handles rate limiting gracefully');
  it('refreshes expired tokens');
  it('retries on transient failures');
});
```

### 10.2 Integration Tests

```typescript
// tests/integration/session-studio-import.test.ts
describe('Session Studio Import', () => {
  it('imports complete discography');
  it('creates artist credits for collaborators');
  it('generates provider links');
  it('handles partial failures gracefully');
});
```

---

## 11. Implementation Phases

### Phase 1: Foundation
1. Research Session Studio API capabilities
2. Create database migrations (provider, tokens)
3. Implement Session Studio client with auth
4. Write type definitions

### Phase 2: Core Import
1. Implement data transformations
2. Build import orchestration
3. Create API routes for OAuth and import
4. Add background job processing

### Phase 3: UI & Polish
1. Build settings/integration UI
2. Add import progress tracking
3. Implement manual sync triggers
4. Add error handling and retry UI

### Phase 4: Advanced Features
1. Webhook support for real-time updates
2. Cross-platform link discovery
3. Collaboration tracking
4. Stem/project file handling (if applicable)

---

## 12. Security Considerations

1. **Token Storage**: Encrypt access/refresh tokens at rest
2. **Webhook Verification**: Validate all incoming webhooks with signatures
3. **Rate Limiting**: Respect Session Studio's limits, implement backoff
4. **Scope Minimization**: Request only necessary OAuth scopes
5. **Audit Logging**: Log all import activities for debugging

---

## 13. Monitoring & Observability

1. **Metrics to Track**:
   - Import success/failure rates
   - Average import duration
   - API response times
   - Rate limit hits

2. **Alerts**:
   - Consecutive import failures
   - Token refresh failures
   - Webhook delivery failures

3. **Dashboards**:
   - Import volume over time
   - Error breakdown by type
   - API health status

---

## 14. Open Questions

1. Does Session Studio provide public API access or require partnership?
2. What authentication method does Session Studio use?
3. Are there specific metadata fields unique to Session Studio we should capture?
4. Should we support importing unreleased/draft projects?
5. How should we handle stem files if available?

---

## 15. Dependencies

| Package | Purpose | Notes |
|---------|---------|-------|
| Existing `drizzle-orm` | Database operations | Already installed |
| Existing rate limiter | API throttling | Reuse from Spotify client |
| Existing circuit breaker | Fault tolerance | Reuse from DSP enrichment |
| New OAuth library? | Token management | May need `arctic` or similar |

---

## Appendix: Related Files

| File | Purpose |
|------|---------|
| `lib/discography/spotify-import.ts` | Reference implementation |
| `lib/spotify/client.ts` | Client pattern reference |
| `lib/dsp-enrichment/providers/apple-music.ts` | DSP provider pattern |
| `lib/db/schema/content.ts` | Core content schema |
| `lib/db/schema/ingestion.ts` | Job queue schema |

---

*This plan should be reviewed and updated as Session Studio API details become available.*
