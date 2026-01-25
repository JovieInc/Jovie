# Lyrics Ingestion & Management Feature Plan

## Overview

A comprehensive lyrics management system that enables artists to ingest, edit, standardize, and verify lyrics for their tracks. This feature adds a **Lyrics tab** to the existing release sidebar alongside DSP links.

**Key Principles:**
- **Leverage existing infrastructure** - Use the ingestion job system, DSP enrichment patterns, and provider link architecture
- **Auto-sync on import** - When tracks are synced from Spotify, automatically queue lyrics discovery
- **Provider priority** - Official sources (Apple Music, Spotify) are weighted higher than community sources (Genius)
- **Lock to truth** - Once verified against audio transcript, lyrics become "locked" as authoritative

---

## Architecture: Integration with Existing Systems

### How It Fits

```
┌─────────────────────────────────────────────────────────────────────┐
│                     EXISTING INFRASTRUCTURE                         │
├─────────────────────────────────────────────────────────────────────┤
│  Spotify Import (spotify-import.ts)                                 │
│       │                                                             │
│       ▼                                                             │
│  DSP Enrichment (dsp-enrichment/)  ◄─── NEW: Lyrics Discovery Job  │
│       │                                                             │
│       ▼                                                             │
│  Ingestion Job Queue (ingestionJobs table)                          │
│       │                                                             │
│       ▼                                                             │
│  Job Processor (/api/ingestion/jobs)  ◄─── NEW: 'import_lyrics'    │
└─────────────────────────────────────────────────────────────────────┘
```

### Auto-Sync Flow

When `syncReleasesFromSpotify()` completes:
1. For each track with ISRC, enqueue `import_lyrics` job
2. Job processor tries providers in priority order (Apple > Spotify > Musixmatch > Genius)
3. Best available lyrics stored with reliability score
4. Higher-reliability source can overwrite lower (but manual edits preserved)

---

## Phase 1: Data Model & Schema

### New Database Tables

```sql
-- Core lyrics storage with provider reliability tracking
CREATE TABLE track_lyrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id UUID NOT NULL REFERENCES discog_tracks(id) ON DELETE CASCADE,

  -- Version control
  version INTEGER NOT NULL DEFAULT 1,
  is_current BOOLEAN NOT NULL DEFAULT true,

  -- Lyrics content
  plain_text TEXT NOT NULL,                    -- Raw lyrics text
  timed_lyrics JSONB,                          -- LRC/synced format [{time: 0, line: "..."}]
  language VARCHAR(10) DEFAULT 'en',           -- ISO 639-1 code

  -- Standardization
  is_apple_compliant BOOLEAN DEFAULT false,    -- Passes Apple guidelines
  compliance_issues JSONB,                     -- Array of issues found
  standardized_text TEXT,                      -- Apple-formatted version

  -- Source tracking with reliability
  source_provider VARCHAR(50) NOT NULL,        -- 'apple_music', 'spotify', 'musixmatch', 'genius', 'manual'
  source_url TEXT,                             -- Original source URL
  source_id TEXT,                              -- External ID (Apple track ID, Genius ID, etc.)
  reliability_score DECIMAL(5,4) NOT NULL,     -- 0.0000 to 1.0000 - provider-based weight
  is_official BOOLEAN DEFAULT false,           -- From label/artist via DSP

  -- Verification & Locking
  verification_status VARCHAR(50) DEFAULT 'unverified', -- 'unverified', 'pending', 'verified', 'locked'
  is_locked BOOLEAN DEFAULT false,             -- Verified against transcript, cannot be auto-overwritten
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES users(id),
  transcript_match_score DECIMAL(5,4),         -- 0.0000 to 1.0000

  -- Metadata
  contributor_id UUID REFERENCES users(id),   -- Who added/edited
  metadata JSONB,                              -- Additional data (genius annotations, etc.)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(track_id, version)
);

-- Lyrics history for audit trail
CREATE TABLE track_lyrics_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lyrics_id UUID NOT NULL REFERENCES track_lyrics(id) ON DELETE CASCADE,
  changed_by UUID REFERENCES users(id),
  change_type VARCHAR(50) NOT NULL,           -- 'created', 'edited', 'standardized', 'verified'
  previous_text TEXT,
  new_text TEXT,
  change_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Genius sync status (for 2-way sync)
CREATE TABLE genius_sync_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id UUID NOT NULL REFERENCES discog_tracks(id) ON DELETE CASCADE,
  genius_song_id INTEGER NOT NULL,
  genius_url TEXT NOT NULL,
  last_pulled_at TIMESTAMPTZ,
  last_pushed_at TIMESTAMPTZ,
  local_hash VARCHAR(64),                     -- SHA-256 of local lyrics
  remote_hash VARCHAR(64),                    -- SHA-256 of Genius lyrics
  sync_direction VARCHAR(20) DEFAULT 'pull', -- 'pull', 'push', 'bidirectional'
  is_contributor BOOLEAN DEFAULT false,       -- Artist is verified Genius contributor
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(track_id)
);

-- Transcript verification jobs
CREATE TABLE transcript_verification_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id UUID NOT NULL REFERENCES discog_tracks(id),
  lyrics_id UUID NOT NULL REFERENCES track_lyrics(id),

  -- Audio source
  audio_source_type VARCHAR(50) NOT NULL,     -- 'preview_url', 'uploaded', 'youtube'
  audio_source_url TEXT NOT NULL,

  -- Processing
  status VARCHAR(50) DEFAULT 'pending',       -- 'pending', 'processing', 'completed', 'failed'
  transcription_service VARCHAR(50),          -- 'whisper', 'assemblyai', 'deepgram'
  transcript_text TEXT,

  -- Results
  match_score DECIMAL(5,4),
  word_level_alignment JSONB,                 -- Detailed word-by-word comparison
  discrepancies JSONB,                        -- [{position: 0, expected: "...", got: "..."}]

  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Lyrics provider sync tracking (replaces genius-only sync)
CREATE TABLE lyrics_provider_sync (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id UUID NOT NULL REFERENCES discog_tracks(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,               -- 'apple_music', 'spotify', 'musixmatch', 'genius'
  external_id TEXT NOT NULL,                   -- Provider's song/track ID
  external_url TEXT,
  last_fetched_at TIMESTAMPTZ,
  content_hash VARCHAR(64),                    -- SHA-256 of fetched lyrics
  fetch_status VARCHAR(50) DEFAULT 'pending',  -- 'pending', 'success', 'not_found', 'failed'
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(track_id, provider)
);

-- Indexes
CREATE INDEX idx_track_lyrics_track ON track_lyrics(track_id) WHERE is_current = true;
CREATE INDEX idx_track_lyrics_source ON track_lyrics(source_provider);
CREATE INDEX idx_track_lyrics_verification ON track_lyrics(verification_status);
CREATE INDEX idx_track_lyrics_reliability ON track_lyrics(reliability_score DESC) WHERE is_current = true;
CREATE INDEX idx_lyrics_provider_sync_track ON lyrics_provider_sync(track_id);
CREATE INDEX idx_lyrics_provider_sync_status ON lyrics_provider_sync(fetch_status) WHERE fetch_status = 'pending';
CREATE INDEX idx_transcript_jobs_status ON transcript_verification_jobs(status);
```

### TypeScript Types

```typescript
// apps/web/lib/lyrics/types.ts

// Provider priority - higher number = more reliable/authoritative
export type LyricsProvider = 'apple_music' | 'spotify' | 'musixmatch' | 'genius' | 'manual';
export type VerificationStatus = 'unverified' | 'pending' | 'verified' | 'locked';
export type SyncDirection = 'pull' | 'push' | 'bidirectional';

// Provider reliability weights - used to determine which source wins
export const LYRICS_PROVIDER_RELIABILITY: Record<LyricsProvider, number> = {
  apple_music: 0.95,    // Official, label-provided, highest quality
  spotify: 0.90,        // Official via Musixmatch partnership
  musixmatch: 0.75,     // Licensed, curated, synced
  genius: 0.60,         // Community-sourced, can have errors
  manual: 0.50,         // Artist-provided but unverified
};

// When transcript-verified, any source becomes locked at 1.0
export const VERIFIED_RELIABILITY = 1.0;

export interface TimedLyricLine {
  time: number;        // Milliseconds from start
  endTime?: number;    // Optional end time
  line: string;
  isChorus?: boolean;
  isBridge?: boolean;
}

export interface ComplianceIssue {
  type: 'capitalization' | 'punctuation' | 'formatting' | 'explicit' | 'structure';
  line: number;
  description: string;
  suggestion: string;
  autoFixable: boolean;
}

export interface TrackLyrics {
  id: string;
  trackId: string;
  version: number;
  isCurrent: boolean;

  plainText: string;
  timedLyrics?: TimedLyricLine[];
  language: string;

  isAppleCompliant: boolean;
  complianceIssues?: ComplianceIssue[];
  standardizedText?: string;

  sourceType: LyricsSourceType;
  sourceUrl?: string;
  sourceId?: string;

  verificationStatus: VerificationStatus;
  verifiedAt?: string;
  transcriptMatchScore?: number;

  contributorId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface GeniusSyncStatus {
  trackId: string;
  geniusSongId: number;
  geniusUrl: string;
  lastPulledAt?: string;
  lastPushedAt?: string;
  localHash: string;
  remoteHash: string;
  syncDirection: SyncDirection;
  isContributor: boolean;
  hasChanges: boolean; // Computed: localHash !== remoteHash
}

export interface LyricsViewModel {
  lyrics?: TrackLyrics;
  providerSync: ProviderSyncStatus[];
  hasLyrics: boolean;
  isVerified: boolean;
  isLocked: boolean;
  needsStandardization: boolean;
  reliabilityScore: number;
  bestAvailableProvider?: LyricsProvider;
}

export interface ProviderSyncStatus {
  provider: LyricsProvider;
  externalId?: string;
  externalUrl?: string;
  lastFetchedAt?: string;
  fetchStatus: 'pending' | 'success' | 'not_found' | 'failed';
  hasLyrics: boolean;
}
```

---

## Phase 2: Ingestion Job Integration

### Job Type Registration

Add to existing ingestion job system (`lib/ingestion/jobs/`):

```typescript
// apps/web/lib/ingestion/jobs/lyrics.ts

import { z } from 'zod';
import type { JobExecutorConfig } from './types';

export const lyricsIngestionPayloadSchema = z.object({
  creatorProfileId: z.string().uuid(),
  trackId: z.string().uuid(),
  isrc: z.string().optional(),
  title: z.string(),
  artistName: z.string(),
  dedupKey: z.string(),
  // Which providers to try (defaults to all in priority order)
  providers: z.array(z.enum(['apple_music', 'spotify', 'musixmatch', 'genius'])).optional(),
});

export type LyricsIngestionPayload = z.infer<typeof lyricsIngestionPayloadSchema>;

export const lyricsJobConfig: JobExecutorConfig<LyricsIngestionPayload> = {
  payloadSchema: lyricsIngestionPayloadSchema,
  platformName: 'Lyrics Ingestion',

  async fetchAndExtract(payload) {
    const providers = payload.providers ?? ['apple_music', 'spotify', 'musixmatch', 'genius'];

    // Try providers in priority order until we get lyrics
    for (const provider of providers) {
      const result = await tryFetchLyrics(provider, payload);
      if (result.success && result.lyrics) {
        await storeLyrics(payload.trackId, {
          plainText: result.lyrics,
          timedLyrics: result.timedLyrics,
          sourceProvider: provider,
          sourceId: result.externalId,
          sourceUrl: result.url,
          reliabilityScore: LYRICS_PROVIDER_RELIABILITY[provider],
          isOfficial: provider === 'apple_music' || provider === 'spotify',
        });

        // Update sync status
        await updateProviderSync(payload.trackId, provider, {
          externalId: result.externalId,
          externalUrl: result.url,
          fetchStatus: 'success',
          contentHash: hashLyrics(result.lyrics),
        });

        return { links: [], displayName: undefined, avatarUrl: undefined };
      }

      // Mark this provider as checked (not_found or failed)
      await updateProviderSync(payload.trackId, provider, {
        fetchStatus: result.error === 'not_found' ? 'not_found' : 'failed',
        errorMessage: result.error,
      });
    }

    // No lyrics found from any provider
    return { links: [], displayName: undefined, avatarUrl: undefined };
  },
};
```

### Hooking into Spotify Import

Modify `spotify-import.ts` to enqueue lyrics jobs:

```typescript
// In syncReleasesFromSpotify(), after upserting tracks:

// Queue lyrics discovery for each track with ISRC
for (const track of importedTracks) {
  if (track.isrc) {
    await enqueueIngestionJob({
      jobType: 'import_lyrics',
      creatorProfileId,
      payload: {
        creatorProfileId,
        trackId: track.id,
        isrc: track.isrc,
        title: track.title,
        artistName: track.artistName,
        dedupKey: `lyrics:${track.id}`,
      },
      // Lower priority than release sync - lyrics are enhancement
      priority: 10,
    });
  }
}
```

### Provider Fetching Functions

```typescript
// apps/web/lib/lyrics/providers/index.ts

interface LyricsFetchResult {
  success: boolean;
  lyrics?: string;
  timedLyrics?: TimedLyricLine[];
  externalId?: string;
  url?: string;
  error?: string;
}

export async function tryFetchLyrics(
  provider: LyricsProvider,
  track: { isrc?: string; title: string; artistName: string }
): Promise<LyricsFetchResult> {
  switch (provider) {
    case 'apple_music':
      return fetchAppleMusicLyrics(track);
    case 'spotify':
      return fetchSpotifyLyrics(track);
    case 'musixmatch':
      return fetchMusixmatchLyrics(track);
    case 'genius':
      return fetchGeniusLyrics(track);
    default:
      return { success: false, error: 'unknown_provider' };
  }
}
```

### Apple Music Lyrics (Highest Priority)

```typescript
// apps/web/lib/lyrics/providers/apple-music.ts

// Apple Music provides official, synced lyrics via MusicKit API
// Requires Apple Music subscription token for lyrics endpoint

export async function fetchAppleMusicLyrics(
  track: { isrc?: string; title: string; artistName: string }
): Promise<LyricsFetchResult> {
  // 1. First, look up track by ISRC (most reliable)
  if (track.isrc) {
    const appleMusicTrack = await lookupAppleMusicByIsrc(track.isrc);
    if (appleMusicTrack?.trackId) {
      // 2. Fetch lyrics using catalog endpoint
      // GET /v1/catalog/{storefront}/songs/{id}/lyrics
      const lyrics = await fetchAppleMusicSongLyrics(appleMusicTrack.trackId);
      if (lyrics) {
        return {
          success: true,
          lyrics: lyrics.plainText,
          timedLyrics: lyrics.ttml ? parseTTML(lyrics.ttml) : undefined,
          externalId: appleMusicTrack.trackId,
          url: appleMusicTrack.url,
        };
      }
    }
  }

  return { success: false, error: 'not_found' };
}
```

### Spotify Lyrics (via Musixmatch partnership)

```typescript
// apps/web/lib/lyrics/providers/spotify.ts

// Spotify's lyrics come from Musixmatch but are accessed via Spotify API
// Requires authenticated Spotify session

export async function fetchSpotifyLyrics(
  track: { isrc?: string; title: string; artistName: string }
): Promise<LyricsFetchResult> {
  // Spotify doesn't have a public lyrics API
  // Options:
  // 1. Use internal /lyrics endpoint (requires auth, may break)
  // 2. Fall through to Musixmatch directly

  // For now, skip Spotify direct and rely on Musixmatch
  return { success: false, error: 'not_implemented' };
}
```

### Reliability-Based Overwrite Logic

```typescript
// apps/web/lib/lyrics/storage.ts

export async function storeLyrics(
  trackId: string,
  newLyrics: LyricsInput
): Promise<{ stored: boolean; reason?: string }> {
  const existing = await getCurrentLyrics(trackId);

  // If no existing lyrics, always store
  if (!existing) {
    await insertLyrics(trackId, newLyrics);
    return { stored: true };
  }

  // LOCKED lyrics cannot be auto-overwritten (verified against transcript)
  if (existing.isLocked) {
    return { stored: false, reason: 'locked' };
  }

  // Manual edits by artist are preserved unless new source is more reliable
  if (existing.sourceProvider === 'manual' && newLyrics.reliabilityScore <= LYRICS_PROVIDER_RELIABILITY.manual) {
    return { stored: false, reason: 'manual_preserved' };
  }

  // Higher reliability source wins
  if (newLyrics.reliabilityScore > existing.reliabilityScore) {
    await createNewVersion(trackId, newLyrics, existing.version + 1);
    return { stored: true };
  }

  // Same or lower reliability - don't overwrite
  return { stored: false, reason: 'lower_reliability' };
}
```

---

## Phase 3: Provider Implementations

### Musixmatch (Licensed Provider)

```typescript
// apps/web/lib/lyrics/providers/musixmatch.ts

// Musixmatch has the largest licensed lyrics database
// API requires commercial license for full lyrics (free tier = 30% preview)

const MUSIXMATCH_API_BASE = 'https://api.musixmatch.com/ws/1.1';

export async function fetchMusixmatchLyrics(
  track: { isrc?: string; title: string; artistName: string }
): Promise<LyricsFetchResult> {
  // 1. Match track by ISRC (most reliable)
  if (track.isrc) {
    const match = await musixmatchTrackGet({ track_isrc: track.isrc });
    if (match?.track_id) {
      const lyrics = await musixmatchLyricsGet({ track_id: match.track_id });
      if (lyrics?.lyrics_body) {
        return {
          success: true,
          lyrics: lyrics.lyrics_body,
          // Musixmatch provides synced lyrics with premium
          timedLyrics: lyrics.subtitle_body ? parseMusixmatchSubtitle(lyrics.subtitle_body) : undefined,
          externalId: String(match.track_id),
          url: match.track_share_url,
        };
      }
    }
  }

  // 2. Fallback to search
  const searchResult = await musixmatchTrackSearch({
    q_track: track.title,
    q_artist: track.artistName,
  });

  if (searchResult?.track_list?.[0]) {
    const trackId = searchResult.track_list[0].track.track_id;
    const lyrics = await musixmatchLyricsGet({ track_id: trackId });
    if (lyrics?.lyrics_body) {
      return {
        success: true,
        lyrics: lyrics.lyrics_body,
        externalId: String(trackId),
      };
    }
  }

  return { success: false, error: 'not_found' };
}
```

### Genius (Community Fallback)

```typescript
// apps/web/lib/lyrics/providers/genius.ts

const GENIUS_API_BASE = 'https://api.genius.com';

export interface GeniusSearchResult {
  id: number;
  title: string;
  artist: string;
  url: string;
  thumbnailUrl?: string;
  lyricsState: 'complete' | 'incomplete' | 'unreleased';
}

export interface GeniusSong {
  id: number;
  title: string;
  url: string;
  path: string;
  headerImageUrl?: string;
  artistNames: string;
  primaryArtist: {
    id: number;
    name: string;
    url: string;
    imageUrl?: string;
  };
  album?: {
    id: number;
    name: string;
    url: string;
  };
  releaseDate?: string;
  lyrics?: string; // Requires scraping, not in API
  annotations?: GeniusAnnotation[];
}

export interface GeniusAnnotation {
  id: number;
  fragment: string;
  range: { start: number; end: number };
  body: string;
  verified: boolean;
}

// Rate limits: 1000 requests/day with API key
export const GENIUS_RATE_LIMITS = {
  requestsPerMinute: 30,
  requestsPerDay: 1000,
};
```

### Search & Match Algorithm

```typescript
// apps/web/lib/lyrics/genius-matcher.ts

export async function findGeniusMatch(
  track: { title: string; artistName: string; isrc?: string; durationMs?: number }
): Promise<GeniusSearchResult | null> {
  // 1. Search by title + artist
  const searchQuery = `${track.title} ${track.artistName}`;
  const results = await searchGenius(searchQuery);

  if (results.length === 0) return null;

  // 2. Score each result
  const scored = results.map(result => ({
    result,
    score: calculateMatchScore(track, result),
  }));

  // 3. Return best match above threshold
  const best = scored.sort((a, b) => b.score - a.score)[0];
  return best.score >= 0.7 ? best.result : null;
}

function calculateMatchScore(track: TrackDescriptor, result: GeniusSearchResult): number {
  const titleSimilarity = jaroWinkler(
    normalizeTitle(track.title),
    normalizeTitle(result.title)
  );

  const artistSimilarity = jaroWinkler(
    normalizeArtist(track.artistName),
    normalizeArtist(result.artist)
  );

  // Weight: 60% title, 40% artist
  return titleSimilarity * 0.6 + artistSimilarity * 0.4;
}
```

### Lyrics Scraping (Genius doesn't provide lyrics via API)

```typescript
// apps/web/lib/lyrics/genius-scraper.ts

import * as cheerio from 'cheerio';

export async function scrapeGeniusLyrics(songUrl: string): Promise<string> {
  const response = await fetch(songUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; JovieBot/1.0)',
    },
  });

  const html = await response.text();
  const $ = cheerio.load(html);

  // Genius uses data-lyrics-container attribute
  const lyricsContainers = $('[data-lyrics-container="true"]');

  let lyrics = '';
  lyricsContainers.each((_, el) => {
    // Preserve line breaks, remove annotations
    const text = $(el)
      .find('br').replaceWith('\n').end()
      .find('a').each((_, a) => $(a).replaceWith($(a).text())).end()
      .text();
    lyrics += text + '\n\n';
  });

  return lyrics.trim();
}
```

### Two-Way Sync Architecture

```typescript
// apps/web/lib/lyrics/genius-sync.ts

export async function syncWithGenius(
  trackId: string,
  direction: 'pull' | 'push' | 'bidirectional'
): Promise<SyncResult> {
  const syncStatus = await getGeniusSyncStatus(trackId);
  const localLyrics = await getCurrentLyrics(trackId);
  const remoteLyrics = await scrapeGeniusLyrics(syncStatus.geniusUrl);

  const localHash = hashLyrics(localLyrics?.plainText || '');
  const remoteHash = hashLyrics(remoteLyrics);

  if (direction === 'pull' || direction === 'bidirectional') {
    if (remoteHash !== syncStatus.remoteHash) {
      // Genius has changes - pull them
      await updateLocalLyrics(trackId, remoteLyrics, 'genius');
    }
  }

  if (direction === 'push' || direction === 'bidirectional') {
    if (localHash !== syncStatus.localHash && syncStatus.isContributor) {
      // Local has changes - push to Genius (requires contributor access)
      await pushToGenius(syncStatus.geniusSongId, localLyrics);
    }
  }

  return {
    pulled: direction !== 'push',
    pushed: direction !== 'pull' && syncStatus.isContributor,
    localHash,
    remoteHash,
  };
}
```

---

## Phase 4: Sidebar UI - Tabbed Interface

### Component Structure

```
ReleaseSidebar/
├── index.tsx                    # Main container
├── ReleaseSidebarTabs.tsx       # Tab navigation (DSPs | Lyrics)
├── tabs/
│   ├── DspLinksTab.tsx          # Current ReleaseDspLinks, refactored
│   └── LyricsTab.tsx            # New lyrics management tab
├── lyrics/
│   ├── LyricsEditor.tsx         # Text editor with line numbers
│   ├── LyricsSourceBadge.tsx    # Shows source (Genius, Manual, etc.)
│   ├── LyricsCompliancePanel.tsx # Apple guidelines checker
│   ├── LyricsTimingEditor.tsx   # For synced lyrics (future)
│   ├── LyricsVerificationBadge.tsx
│   └── GeniusSyncStatus.tsx     # Sync status and actions
```

### Tab Navigation Component

```tsx
// apps/web/components/organisms/release-sidebar/ReleaseSidebarTabs.tsx

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@jovie/ui';
import { Music, FileText } from 'lucide-react';

type SidebarTab = 'dsps' | 'lyrics';

interface ReleaseSidebarTabsProps {
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  release: ReleaseViewModel;
  selectedTrack?: TrackViewModel; // For lyrics, need track context
}

export function ReleaseSidebarTabs({
  activeTab,
  onTabChange,
  release,
  selectedTrack,
}: ReleaseSidebarTabsProps) {
  return (
    <Tabs value={activeTab} onValueChange={onTabChange}>
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="dsps" className="flex items-center gap-2">
          <Music className="h-4 w-4" />
          DSPs
        </TabsTrigger>
        <TabsTrigger value="lyrics" className="flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Lyrics
          {selectedTrack?.hasLyrics && (
            <span className="ml-1 h-2 w-2 rounded-full bg-green-500" />
          )}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="dsps">
        <DspLinksTab release={release} />
      </TabsContent>

      <TabsContent value="lyrics">
        <LyricsTab
          release={release}
          track={selectedTrack}
        />
      </TabsContent>
    </Tabs>
  );
}
```

### Lyrics Tab Component

```tsx
// apps/web/components/organisms/release-sidebar/tabs/LyricsTab.tsx

interface LyricsTabProps {
  release: ReleaseViewModel;
  track?: TrackViewModel;
}

export function LyricsTab({ release, track }: LyricsTabProps) {
  const [isEditing, setIsEditing] = useState(false);
  const { data: lyrics, isLoading } = useLyrics(track?.id);
  const { data: geniusSync } = useGeniusSyncStatus(track?.id);

  if (!track) {
    return (
      <EmptyState
        icon={FileText}
        title="Select a track"
        description="Choose a track from the release to view or edit lyrics"
      />
    );
  }

  if (isLoading) {
    return <LyricsTabSkeleton />;
  }

  return (
    <div className="space-y-4">
      {/* Track selector for multi-track releases */}
      {release.totalTracks > 1 && (
        <TrackSelector
          tracks={release.tracks}
          selectedId={track.id}
          onSelect={setSelectedTrack}
        />
      )}

      {/* Source & sync status */}
      <div className="flex items-center justify-between">
        <LyricsSourceBadge source={lyrics?.sourceType} />
        {geniusSync && <GeniusSyncStatus sync={geniusSync} />}
      </div>

      {/* Main content */}
      {lyrics ? (
        <>
          {isEditing ? (
            <LyricsEditor
              lyrics={lyrics}
              onSave={handleSave}
              onCancel={() => setIsEditing(false)}
            />
          ) : (
            <LyricsDisplay
              lyrics={lyrics}
              onEdit={() => setIsEditing(true)}
            />
          )}

          {/* Compliance checker */}
          <LyricsCompliancePanel lyrics={lyrics} />

          {/* Verification status */}
          <LyricsVerificationBadge
            status={lyrics.verificationStatus}
            score={lyrics.transcriptMatchScore}
          />
        </>
      ) : (
        <LyricsEmptyState
          onFetchFromGenius={handleFetchGenius}
          onAddManually={() => setIsEditing(true)}
        />
      )}
    </div>
  );
}
```

---

## Phase 5: Apple Music Guidelines Compliance

### Guidelines Reference

Apple's Lyrics Guidelines require:
1. **Capitalization**: Sentence case (only capitalize first word and proper nouns)
2. **Punctuation**: Minimal - no periods at end of lines, commas only where grammatically necessary
3. **Structure**:
   - Blank lines between sections (verse, chorus, bridge)
   - No section labels ([Verse 1], [Chorus])
   - No timestamps in plain lyrics
4. **Content**:
   - Explicit content must match track's explicit flag
   - No URLs or promotional content
   - Translations should be separate, not inline

### Compliance Checker

```typescript
// apps/web/lib/lyrics/apple-compliance.ts

export interface ComplianceResult {
  isCompliant: boolean;
  issues: ComplianceIssue[];
  autoFixedText?: string;
  score: number; // 0-100
}

export function checkAppleCompliance(lyrics: string): ComplianceResult {
  const issues: ComplianceIssue[] = [];
  const lines = lyrics.split('\n');

  lines.forEach((line, index) => {
    // Check for section labels
    if (/^\[.+\]$/.test(line.trim())) {
      issues.push({
        type: 'structure',
        line: index + 1,
        description: 'Section labels not allowed',
        suggestion: 'Remove section labels like [Verse], [Chorus]',
        autoFixable: true,
      });
    }

    // Check for ALL CAPS lines (unless short exclamations)
    if (line.length > 10 && line === line.toUpperCase() && /[a-zA-Z]/.test(line)) {
      issues.push({
        type: 'capitalization',
        line: index + 1,
        description: 'All caps not allowed',
        suggestion: 'Convert to sentence case',
        autoFixable: true,
      });
    }

    // Check for ending punctuation
    if (/[.!]$/.test(line.trim()) && !/[.!]{2,}$/.test(line.trim())) {
      issues.push({
        type: 'punctuation',
        line: index + 1,
        description: 'Lines should not end with periods',
        suggestion: 'Remove ending punctuation',
        autoFixable: true,
      });
    }

    // Check for timestamps
    if (/\[\d{1,2}:\d{2}(:\d{2})?\]/.test(line)) {
      issues.push({
        type: 'formatting',
        line: index + 1,
        description: 'Timestamps not allowed in plain lyrics',
        suggestion: 'Remove timestamps',
        autoFixable: true,
      });
    }

    // Check for URLs
    if (/https?:\/\//.test(line)) {
      issues.push({
        type: 'formatting',
        line: index + 1,
        description: 'URLs not allowed',
        suggestion: 'Remove URLs',
        autoFixable: true,
      });
    }
  });

  const score = Math.max(0, 100 - issues.length * 5);

  return {
    isCompliant: issues.length === 0,
    issues,
    autoFixedText: issues.some(i => i.autoFixable) ? autoFix(lyrics, issues) : undefined,
    score,
  };
}

export function autoFix(lyrics: string, issues: ComplianceIssue[]): string {
  let fixed = lyrics;

  // Remove section labels
  fixed = fixed.replace(/^\[.+\]$/gm, '');

  // Convert ALL CAPS to sentence case
  fixed = fixed.replace(/^([A-Z]{2,}.+)$/gm, (match) => {
    return match.charAt(0) + match.slice(1).toLowerCase();
  });

  // Remove ending periods (but keep ellipsis and multiple punctuation)
  fixed = fixed.replace(/([^.!])\.$/gm, '$1');

  // Remove timestamps
  fixed = fixed.replace(/\[\d{1,2}:\d{2}(:\d{2})?\]/g, '');

  // Clean up multiple blank lines
  fixed = fixed.replace(/\n{3,}/g, '\n\n');

  return fixed.trim();
}
```

### Compliance UI Panel

```tsx
// apps/web/components/organisms/release-sidebar/lyrics/LyricsCompliancePanel.tsx

export function LyricsCompliancePanel({ lyrics }: { lyrics: TrackLyrics }) {
  const compliance = useMemo(
    () => checkAppleCompliance(lyrics.plainText),
    [lyrics.plainText]
  );

  const { mutate: applyFix, isPending } = useApplyComplianceFix();

  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <h4 className="font-medium">Apple Music Compliance</h4>
        <ComplianceScore score={compliance.score} />
      </div>

      {compliance.isCompliant ? (
        <p className="mt-2 text-sm text-green-600">
          Lyrics meet Apple Music guidelines
        </p>
      ) : (
        <>
          <ul className="mt-3 space-y-2">
            {compliance.issues.slice(0, 5).map((issue, i) => (
              <li key={i} className="text-sm">
                <span className="text-muted-foreground">Line {issue.line}:</span>{' '}
                {issue.description}
              </li>
            ))}
            {compliance.issues.length > 5 && (
              <li className="text-sm text-muted-foreground">
                +{compliance.issues.length - 5} more issues
              </li>
            )}
          </ul>

          {compliance.autoFixedText && (
            <Button
              size="sm"
              className="mt-3"
              onClick={() => applyFix({
                lyricsId: lyrics.id,
                fixedText: compliance.autoFixedText
              })}
              disabled={isPending}
            >
              Auto-fix {compliance.issues.filter(i => i.autoFixable).length} issues
            </Button>
          )}
        </>
      )}
    </div>
  );
}
```

---

## Phase 6: Transcript Verification & Locking

### Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Audio Source  │────▶│  Transcription   │────▶│   Comparison    │
│                 │     │     Service      │     │     Engine      │
│ - Preview URL   │     │                  │     │                 │
│ - Uploaded file │     │ - Whisper        │     │ - Diff analysis │
│ - YouTube audio │     │ - AssemblyAI     │     │ - Word alignment│
└─────────────────┘     │ - Deepgram       │     │ - Score calc    │
                        └──────────────────┘     └─────────────────┘
```

### Transcription Job Queue

```typescript
// apps/web/lib/lyrics/transcript-verification.ts

export interface TranscriptVerificationRequest {
  trackId: string;
  lyricsId: string;
  audioSource: {
    type: 'preview_url' | 'uploaded' | 'youtube';
    url: string;
  };
  service?: 'whisper' | 'assemblyai' | 'deepgram';
}

export async function queueTranscriptVerification(
  request: TranscriptVerificationRequest
): Promise<string> {
  const jobId = await db.insert(transcriptVerificationJobs).values({
    trackId: request.trackId,
    lyricsId: request.lyricsId,
    audioSourceType: request.audioSource.type,
    audioSourceUrl: request.audioSource.url,
    transcriptionService: request.service || 'whisper',
    status: 'pending',
  }).returning({ id: transcriptVerificationJobs.id });

  // Queue for processing
  await jobQueue.add('transcript-verification', {
    jobId: jobId[0].id,
    ...request,
  });

  return jobId[0].id;
}
```

### Comparison Algorithm

```typescript
// apps/web/lib/lyrics/transcript-compare.ts

export interface ComparisonResult {
  matchScore: number;           // 0.0 to 1.0
  wordAccuracy: number;         // Percentage of matching words
  lineAccuracy: number;         // Percentage of matching lines
  discrepancies: Discrepancy[];
  alignment: WordAlignment[];
}

export interface Discrepancy {
  position: number;
  lyricsWord: string;
  transcriptWord: string;
  confidence: number;
  type: 'missing' | 'extra' | 'different' | 'order';
}

export function compareLyricsToTranscript(
  lyrics: string,
  transcript: string
): ComparisonResult {
  const lyricsWords = tokenize(lyrics);
  const transcriptWords = tokenize(transcript);

  // Use Levenshtein distance at word level
  const alignment = alignWords(lyricsWords, transcriptWords);

  // Calculate scores
  const matchingWords = alignment.filter(a => a.match).length;
  const wordAccuracy = matchingWords / Math.max(lyricsWords.length, transcriptWords.length);

  // Find discrepancies
  const discrepancies = alignment
    .filter(a => !a.match)
    .map(a => ({
      position: a.lyricsIndex,
      lyricsWord: a.lyricsWord,
      transcriptWord: a.transcriptWord,
      confidence: a.confidence,
      type: determineDiscrepancyType(a),
    }));

  // Overall match score (weighted)
  const matchScore = wordAccuracy * 0.7 + (1 - discrepancies.length / 100) * 0.3;

  return {
    matchScore: Math.max(0, Math.min(1, matchScore)),
    wordAccuracy,
    lineAccuracy: calculateLineAccuracy(lyrics, transcript),
    discrepancies,
    alignment,
  };
}
```

### Verification UI

```tsx
// apps/web/components/organisms/release-sidebar/lyrics/LyricsVerificationBadge.tsx

export function LyricsVerificationBadge({
  status,
  score,
  onVerify
}: {
  status: VerificationStatus;
  score?: number;
  onVerify: () => void;
}) {
  const statusConfig = {
    unverified: { color: 'gray', label: 'Unverified', icon: HelpCircle },
    pending: { color: 'yellow', label: 'Verifying...', icon: Clock },
    verified: { color: 'green', label: 'Verified', icon: CheckCircle },
    disputed: { color: 'red', label: 'Disputed', icon: AlertTriangle },
  };

  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <div className="flex items-center justify-between rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 text-${config.color}-500`} />
        <span className="text-sm font-medium">{config.label}</span>
        {score !== undefined && (
          <span className="text-xs text-muted-foreground">
            ({Math.round(score * 100)}% match)
          </span>
        )}
      </div>

      {status === 'unverified' && (
        <Button size="sm" variant="outline" onClick={onVerify}>
          Verify with Audio
        </Button>
      )}
    </div>
  );
}
```

---

## Phase 7: Additional "Magic" Features

### 1. AI-Powered Lyrics Enhancement

```typescript
// Smart suggestions for improving lyrics
export async function suggestLyricsEnhancements(lyrics: string): Promise<Enhancement[]> {
  // Detect and suggest:
  // - Rhyme scheme improvements
  // - Meter/syllable consistency
  // - Hook/chorus identification
  // - Emotional arc analysis
}
```

### 2. Multi-Language Support

```typescript
// Auto-detect language and provide translations
export interface MultiLanguageLyrics {
  original: { text: string; language: string };
  translations: Array<{
    language: string;
    text: string;
    source: 'manual' | 'ai' | 'genius';
    verified: boolean;
  }>;
}
```

### 3. Karaoke/Sync Mode

```typescript
// Time-synced lyrics with word-level timing
export interface KaraokeLyrics {
  lines: Array<{
    startTime: number;
    endTime: number;
    words: Array<{
      text: string;
      startTime: number;
      endTime: number;
    }>;
  }>;
}

// Generate from audio using forced alignment
export async function generateTimedLyrics(
  audioUrl: string,
  plainLyrics: string
): Promise<KaraokeLyrics>;
```

### 4. Collaborative Editing

```typescript
// Real-time collaborative lyrics editing
export interface LyricsCollaborationSession {
  lyricsId: string;
  participants: string[];
  cursor: { userId: string; position: number }[];
  pendingChanges: Change[];
}
```

### 5. Lyrics Analytics

```typescript
// Analyze lyrics for insights
export interface LyricsAnalytics {
  wordCount: number;
  uniqueWords: number;
  readingLevel: string;       // Flesch-Kincaid
  sentiment: 'positive' | 'negative' | 'neutral';
  themes: string[];           // AI-detected themes
  profanityCount: number;
  repetitionScore: number;    // How "hooky" the song is
}
```

### 6. Copyright/Plagiarism Detection

```typescript
// Check lyrics against database for similarity
export async function checkLyricsSimilarity(
  lyrics: string
): Promise<SimilarityResult[]> {
  // Compare against:
  // - Other tracks by same artist (intentional references)
  // - Popular songs (potential copyright issues)
  // - Public domain works
}
```

### 7. Annotation System (Genius-style)

```typescript
// Allow artists to add context/meaning to lyrics
export interface LyricsAnnotation {
  id: string;
  lyricsId: string;
  startIndex: number;
  endIndex: number;
  fragment: string;
  annotation: string;
  createdBy: string;
  isArtistVerified: boolean;
}
```

### 8. Lyrics Export Formats

```typescript
// Export to various formats
export function exportLyrics(
  lyrics: TrackLyrics,
  format: 'plain' | 'lrc' | 'srt' | 'json' | 'pdf' | 'apple'
): string | Buffer;
```

### 9. Smart Search & Discovery

```typescript
// Search your catalog by lyrics
export async function searchByLyrics(
  query: string,
  creatorProfileId: string
): Promise<TrackWithLyrics[]>;
```

### 10. Version Comparison

```tsx
// Visual diff between lyrics versions
<LyricsDiff
  original={version1}
  modified={version2}
  showLineNumbers
/>
```

---

## Implementation Phases

### Phase 1: Foundation & Infrastructure
- [ ] Database schema and migrations (track_lyrics, lyrics_provider_sync tables)
- [ ] TypeScript types and Zod schemas
- [ ] Register `import_lyrics` job type in ingestion system
- [ ] Add lyrics job processor to `/lib/ingestion/jobs/`
- [ ] Update job dispatcher in `processor.ts`

### Phase 2: Ingestion Job Integration
- [ ] Hook into `syncReleasesFromSpotify()` to auto-enqueue lyrics jobs
- [ ] Implement provider priority ordering
- [ ] Build reliability-based overwrite logic
- [ ] Add deduplication via `dedupKey: lyrics:{trackId}`

### Phase 3: Provider Implementations
- [ ] Apple Music lyrics fetcher (MusicKit API, ISRC lookup)
- [ ] Musixmatch API client (licensed lyrics)
- [ ] Genius scraper (community fallback)
- [ ] Rate limiting per provider (use existing patterns)

### Phase 4: UI Implementation
- [ ] Sidebar tab structure (DSPs | Lyrics)
- [ ] Lyrics display component with source badge
- [ ] Lyrics editor component with line numbers
- [ ] Track selector for multi-track releases
- [ ] Reliability score indicator

### Phase 5: Apple Compliance
- [ ] Compliance checker algorithm
- [ ] Auto-fix functionality
- [ ] Compliance panel UI with one-click fix

### Phase 6: Verification & Locking
- [ ] Transcription service integration (Whisper/AssemblyAI)
- [ ] Word-level comparison algorithm
- [ ] Verification job queue (reuse ingestion pattern)
- [ ] Locking mechanism - verified lyrics become authoritative
- [ ] Verification UI with confidence score

### Phase 7: Polish & Magic
- [ ] Lyrics analytics (word count, themes, sentiment)
- [ ] Export functionality (LRC, SRT, Apple format)
- [ ] Annotation system
- [ ] Search catalog by lyrics

---

## API Endpoints

```typescript
// Server Actions
'use server'

// Lyrics CRUD
export async function getLyrics(trackId: string): Promise<TrackLyrics | null>;
export async function saveLyrics(trackId: string, lyrics: LyricsInput): Promise<TrackLyrics>;
export async function deleteLyrics(lyricsId: string): Promise<void>;

// Genius Integration
export async function searchGenius(query: string): Promise<GeniusSearchResult[]>;
export async function fetchGeniusLyrics(trackId: string, geniusSongId: number): Promise<TrackLyrics>;
export async function syncWithGenius(trackId: string, direction: SyncDirection): Promise<SyncResult>;

// Compliance
export async function checkCompliance(lyricsId: string): Promise<ComplianceResult>;
export async function applyComplianceFix(lyricsId: string): Promise<TrackLyrics>;

// Verification
export async function requestVerification(trackId: string, audioSource: AudioSource): Promise<string>;
export async function getVerificationStatus(jobId: string): Promise<VerificationJob>;
```

---

## Query Keys

```typescript
// apps/web/lib/queries/keys.ts

export const queryKeys = {
  // ... existing keys
  lyrics: {
    all: ['lyrics'] as const,
    byTrack: (trackId: string) => ['lyrics', 'track', trackId] as const,
    history: (lyricsId: string) => ['lyrics', 'history', lyricsId] as const,
    compliance: (lyricsId: string) => ['lyrics', 'compliance', lyricsId] as const,
  },
  geniusSync: {
    all: ['genius-sync'] as const,
    byTrack: (trackId: string) => ['genius-sync', 'track', trackId] as const,
  },
  verification: {
    all: ['verification'] as const,
    job: (jobId: string) => ['verification', 'job', jobId] as const,
  },
};
```

---

## Security Considerations

1. **Rate Limiting**: Genius API has daily limits; implement caching and queuing
2. **Content Moderation**: Scan lyrics for prohibited content before storage
3. **Copyright**: Clear attribution for Genius-sourced lyrics; consider licensing
4. **Data Privacy**: Lyrics edits create audit trail; ensure GDPR compliance
5. **Audio Processing**: Uploaded audio files need malware scanning

---

## Monitoring & Analytics

Track these metrics:
- **Lyrics coverage**: % of tracks with lyrics
- **Provider distribution**: Breakdown by source (Apple > Musixmatch > Genius > Manual)
- **Auto-sync success rate**: % of tracks that got lyrics automatically on import
- **Reliability scores**: Average reliability across catalog
- **Verification rate**: % of locked (transcript-verified) lyrics
- **Compliance rate**: % of lyrics passing Apple guidelines
- **Overwrite events**: When higher-reliability source replaced lower

---

## Key Concepts Summary

### Provider Priority (Highest to Lowest)
| Provider | Reliability | Source Type | Notes |
|----------|-------------|-------------|-------|
| Apple Music | 0.95 | Official | Label-provided, synced, highest quality |
| Spotify | 0.90 | Official | Via Musixmatch partnership |
| Musixmatch | 0.75 | Licensed | Curated, often synced |
| Genius | 0.60 | Community | User-contributed, may have errors |
| Manual | 0.50 | Artist | Unverified artist input |
| Transcript-Verified | 1.00 | Any | Once verified, becomes authoritative |

### Reliability-Based Resolution
```
New lyrics arrive from provider X
  │
  ├─ No existing lyrics? → Store with provider's reliability score
  │
  ├─ Existing lyrics LOCKED? → Reject (verified lyrics are truth)
  │
  ├─ Existing is MANUAL edit? → Only overwrite if new is more reliable
  │
  └─ Compare reliability scores → Higher score wins, version incremented
```

### Lock-to-Truth Flow
```
1. Lyrics ingested from any provider
2. Artist can edit (creates 'manual' version at 0.50 reliability)
3. Higher-reliability source can still overwrite manual edits
4. Artist requests transcript verification
5. Audio transcribed via Whisper/AssemblyAI
6. If match score > 0.90 → Lyrics LOCKED at 1.00 reliability
7. Locked lyrics cannot be auto-overwritten (are "truth")
8. Manual unlock requires explicit artist action
```

---

## Future Considerations

1. **LyricFind Integration**: Commercial licensed lyrics for legal compliance
2. **Spotify Lyrics API**: Monitor for public API access
3. **Real-time sync**: WebSocket updates when lyrics change
4. **Lyrics duet/multi-voice**: Support for tracks with multiple vocalists
5. **AI Lyrics Generation**: Help artists with writer's block (separate from verification)
6. **Cross-artist deduplication**: Detect covers/samples with same lyrics
