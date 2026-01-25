# Lyrics Ingestion & Management Feature Plan

## Overview

A comprehensive lyrics management system that enables artists to ingest, edit, standardize, and verify lyrics for their tracks. This feature adds a **Lyrics tab** to the existing release sidebar alongside DSP links.

---

## Phase 1: Data Model & Schema

### New Database Tables

```sql
-- Core lyrics storage
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

  -- Source tracking
  source_type VARCHAR(50) NOT NULL,            -- 'genius', 'manual', 'musixmatch', 'transcription'
  source_url TEXT,                             -- Original source URL
  source_id TEXT,                              -- External ID (Genius ID, etc.)

  -- Verification
  verification_status VARCHAR(50) DEFAULT 'unverified', -- 'unverified', 'pending', 'verified', 'disputed'
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

-- Indexes
CREATE INDEX idx_track_lyrics_track ON track_lyrics(track_id) WHERE is_current = true;
CREATE INDEX idx_track_lyrics_source ON track_lyrics(source_type);
CREATE INDEX idx_track_lyrics_verification ON track_lyrics(verification_status);
CREATE INDEX idx_genius_sync_track ON genius_sync_status(track_id);
CREATE INDEX idx_transcript_jobs_status ON transcript_verification_jobs(status);
```

### TypeScript Types

```typescript
// apps/web/lib/lyrics/types.ts

export type LyricsSourceType = 'genius' | 'manual' | 'musixmatch' | 'transcription';
export type VerificationStatus = 'unverified' | 'pending' | 'verified' | 'disputed';
export type SyncDirection = 'pull' | 'push' | 'bidirectional';

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
  geniusSync?: GeniusSyncStatus;
  hasLyrics: boolean;
  isVerified: boolean;
  needsStandardization: boolean;
  canPushToGenius: boolean;
}
```

---

## Phase 2: Genius API Integration

### API Setup

```typescript
// apps/web/lib/lyrics/genius-client.ts

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

## Phase 3: Sidebar UI - Tabbed Interface

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

## Phase 4: Apple Music Guidelines Compliance

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

## Phase 5: Transcript Verification

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

## Phase 6: Additional "Magic" Features

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

### Phase 1: Foundation (Week 1-2)
- [ ] Database schema and migrations
- [ ] TypeScript types and Zod schemas
- [ ] Basic CRUD operations for lyrics

### Phase 2: Genius Integration (Week 3-4)
- [ ] Genius API client
- [ ] Search and matching algorithm
- [ ] Lyrics scraping
- [ ] Sync status tracking

### Phase 3: UI Implementation (Week 5-6)
- [ ] Sidebar tab structure
- [ ] Lyrics display component
- [ ] Lyrics editor component
- [ ] Track selector for multi-track releases

### Phase 4: Apple Compliance (Week 7)
- [ ] Compliance checker
- [ ] Auto-fix functionality
- [ ] Compliance panel UI

### Phase 5: Verification (Week 8-9)
- [ ] Transcription service integration
- [ ] Comparison algorithm
- [ ] Verification job queue
- [ ] Verification UI

### Phase 6: Polish & Magic (Week 10+)
- [ ] Analytics dashboard
- [ ] Export functionality
- [ ] Annotation system
- [ ] Collaborative editing

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
- Lyrics coverage: % of tracks with lyrics
- Genius match rate: % successful auto-matches
- Compliance rate: % of lyrics passing Apple guidelines
- Verification rate: % of verified lyrics
- Edit frequency: Average edits per lyrics entry
- Sync conflicts: Pull vs push preference

---

## Future Considerations

1. **Musixmatch Integration**: Alternative/backup lyrics source
2. **LyricFind**: Licensed lyrics for commercial use
3. **Apple Music Lyrics API**: When/if Apple opens their API
4. **Spotify Lyrics**: Currently closed, monitor for changes
5. **User-Generated Lyrics**: Community contributions with moderation
6. **AI Lyrics Generation**: Help artists with writer's block
