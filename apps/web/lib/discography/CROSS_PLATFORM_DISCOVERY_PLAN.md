# Cross-Platform Link Discovery Plan

## Overview

Automatically discover streaming platform links for releases imported from Spotify using reliable, free APIs. The goal is to reduce manual link entry by creators while maintaining high accuracy.

## Available Data from Spotify Import

When importing from Spotify, we already capture:

| Field | Level | Used For |
|-------|-------|----------|
| `UPC` | Album | Album-level lookups |
| `ISRC` | Track | Track-level lookups |
| `spotifyId` | Both | Spotify links (already done) |

## Provider API Reliability Matrix

| Provider | ISRC Lookup | UPC Lookup | Auth Required | Rate Limit | Status |
|----------|-------------|------------|---------------|------------|--------|
| **Apple Music** | ✅ iTunes API | ❌ | No | ~20/min | **Ready** (implemented) |
| **Deezer** | ✅ Public API | ✅ | No | ~50/5s | **Recommended** |
| **MusicBrainz** | ✅ | ✅ | No | 1/sec | **Optional** (cross-ref) |
| YouTube Music | ❌ | ❌ | OAuth | N/A | Search fallback |
| Tidal | ❌ | ❌ | OAuth | N/A | Search fallback |
| Amazon Music | ❌ | ❌ | N/A | N/A | Search fallback |
| SoundCloud | ❌ | ❌ | OAuth | N/A | Search fallback |
| Bandcamp | ❌ | ❌ | N/A | N/A | Search fallback |

## Implementation Phases

### Phase 1: Apple Music Integration (Week 1)

**Already implemented in `provider-links.ts`** - just needs integration.

```typescript
// Existing function
lookupAppleMusicByIsrc(isrc: string): Promise<AppleMusicLookupResult | null>
```

**Integration point:** After importing a release, call `resolveProviderLinks()` with track ISRCs.

**Tasks:**
- [ ] Add `includeTracks: true` option during Spotify sync to get ISRCs
- [ ] After release import, look up Apple Music link for lead track
- [ ] Save discovered link with `sourceType: 'discovered'` and `quality: 'canonical'`

### Phase 2: Deezer ISRC Lookup (Week 2)

**API Endpoint:** `https://api.deezer.com/track/isrc:{ISRC}`

**Response:**
```json
{
  "id": 646330892,
  "title": "Track Name",
  "link": "https://www.deezer.com/track/646330892",
  "album": {
    "id": 12345,
    "title": "Album Name",
    "link": "https://www.deezer.com/album/12345"
  }
}
```

**Tasks:**
- [ ] Create `lookupDeezerByIsrc(isrc: string)` function
- [ ] Extract album link from response (prefer album over track link)
- [ ] Handle 404 (track not on Deezer) gracefully
- [ ] Add to `resolveProviderLinks()` pipeline

### Phase 3: MusicBrainz Cross-Reference (Optional)

**Use case:** Enrich metadata and find additional platform IDs.

**API Endpoint:** `https://musicbrainz.org/ws/2/recording?query=isrc:{ISRC}&fmt=json`

**Tasks:**
- [ ] Create `lookupMusicBrainzByIsrc(isrc: string)` function
- [ ] Extract external links (Tidal, Amazon if present)
- [ ] Respect 1 req/sec rate limit
- [ ] Cache results aggressively

## Link Quality Hierarchy

```typescript
type ProviderLinkQuality =
  | 'canonical'        // Direct API match by ISRC/UPC
  | 'cross_reference'  // Found via MusicBrainz or similar
  | 'search_fallback'  // Pre-built search URL
  | 'manual_override'; // User-provided link
```

**Resolution order:**
1. Manual override (always wins)
2. Canonical match (ISRC/UPC lookup)
3. Cross-reference (MusicBrainz discovered)
4. Search fallback (always available)

## Database Schema Update

Add quality tracking to `provider_links` table:

```sql
ALTER TABLE provider_links
ADD COLUMN quality VARCHAR(20) DEFAULT 'search_fallback',
ADD COLUMN discovered_from VARCHAR(50);
```

## Discovery Service Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Spotify Import Flow                       │
│                                                              │
│  1. Import release (album metadata + UPC)                   │
│  2. Import tracks (with ISRCs if includeTracks=true)        │
│  3. Create Spotify provider link                            │
│                           │                                  │
│                           ▼                                  │
│              ┌────────────────────────┐                     │
│              │  Discovery Queue Job   │                     │
│              └────────────────────────┘                     │
│                           │                                  │
│         ┌─────────────────┼─────────────────┐               │
│         ▼                 ▼                 ▼               │
│   ┌──────────┐     ┌──────────┐     ┌────────────┐         │
│   │  Apple   │     │  Deezer  │     │ MusicBrainz│         │
│   │  Music   │     │   API    │     │    API     │         │
│   └──────────┘     └──────────┘     └────────────┘         │
│         │                 │                 │               │
│         └─────────────────┼─────────────────┘               │
│                           ▼                                  │
│              ┌────────────────────────┐                     │
│              │  Upsert Provider Links │                     │
│              │  (with quality field)  │                     │
│              └────────────────────────┘                     │
└─────────────────────────────────────────────────────────────┘
```

## API Rate Limiting Strategy

```typescript
const RATE_LIMITS = {
  apple_music: { requests: 20, windowMs: 60_000 },
  deezer: { requests: 50, windowMs: 5_000 },
  musicbrainz: { requests: 1, windowMs: 1_000 },
};
```

**Approach:**
- Use a simple in-memory rate limiter per provider
- Process discovery as background job (not blocking import)
- Batch requests where possible

## User Experience

1. **During sync:** Show "Synced 10 releases. Discovering links..."
2. **In table:** Show spinner for providers being discovered
3. **After discovery:** Update UI with found links
4. **Manual fallback:** User can always override any link

## Search Fallback URLs (Already Implemented)

For providers without ISRC APIs, generate pre-filled search URLs:

```typescript
buildSearchUrl('youtube_music', { title, artistName, isrc })
// → https://music.youtube.com/search?q=Artist%20Name%20Track%20Title
```

## Success Metrics

- **Discovery rate:** % of releases with canonical links (vs search fallback)
- **Accuracy:** % of discovered links that are correct
- **Coverage:** # of providers with canonical links per release

## References

- [iTunes Search API](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/)
- [Deezer API](https://developers.deezer.com/api)
- [MusicBrainz API](https://musicbrainz.org/doc/MusicBrainz_API)
