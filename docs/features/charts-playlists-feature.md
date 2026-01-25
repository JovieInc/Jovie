# Charts & Auto-Playlists Feature Exploration

## Executive Summary

Public charts displaying top artists ranked by "Jovie Score" (a composite metric derived from traffic, engagement, and fan activity), with automatically generated Spotify and Apple Music playlists that sync to chart positions.

---

## The Jovie Score Algorithm

### Philosophy
The Jovie Score measures **fan heat** — how active and engaged an artist's fanbase is, not just raw follower counts. An artist with 10K engaged fans clicking through to stream is more valuable than one with 100K passive followers.

### Proposed Formula (0-100 scale)

```
Jovie Score = (
  Traffic Score (0-30)     +
  Engagement Score (0-30)  +
  Fan Activity Score (0-25) +
  Momentum Score (0-15)
)
```

#### 1. Traffic Score (30 points max)
- **Profile views** (0-15): Log-scale normalization across all artists
- **Click volume** (0-10): Total clicks on streaming links (last 30 days)
- **Geographic diversity** (0-5): Bonus for traffic from multiple countries

#### 2. Engagement Score (30 points max)
- **Click-through rate** (0-15): Clicks / Profile views ratio
- **Listen clicks ratio** (0-10): % of clicks going to streaming platforms vs other links
- **Subscriber conversion** (0-5): Notification subscribers / Unique visitors

#### 3. Fan Activity Score (25 points max)
- **High-intent visitors** (0-10): Visitors with `intentLevel: 'high'`
- **Repeat visitors** (0-10): Audience members with `visits > 1`
- **Spotify-connected fans** (0-5): Fans who connected Spotify accounts

#### 4. Momentum Score (15 points max)
- **Week-over-week growth** (0-10): Traffic trend direction
- **Release recency** (0-5): Bonus for releases in last 6 months

### Score Decay
- Scores recalculated daily via cron job
- Time-weighted: Recent activity counts more than older activity
- Configurable lookback period (default: 30 days)

---

## Chart Types

### 1. **Jovie Hot 50** (Primary Chart)
Top 50 artists by Jovie Score. The flagship public chart.

### 2. **Genre Charts**
- Hot Electronic / EDM
- Hot Hip-Hop
- Hot Indie
- Hot Pop

Filter by `creatorProfiles.genres` array.

### 3. **Regional Charts**
- Top artists by city (NYC, LA, London, etc.)
- Top artists by country

Derived from `clickEvents.city` and `clickEvents.country`.

### 4. **Rising Artists**
Artists with highest momentum score — fast climbers.

### 5. **New Releases Chart**
Artists with releases in last 30 days, ranked by engagement.

---

## Database Schema Additions

```sql
-- Chart snapshots for historical tracking
CREATE TABLE chart_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chart_type TEXT NOT NULL, -- 'hot50', 'genre_electronic', 'city_nyc', etc.
  snapshot_date DATE NOT NULL,
  rankings JSONB NOT NULL, -- [{position, artistId, score, delta}]
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX chart_snapshots_type_date ON chart_snapshots(chart_type, snapshot_date);

-- Artist score history for trend tracking
CREATE TABLE artist_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_profile_id UUID NOT NULL REFERENCES creator_profiles(id) ON DELETE CASCADE,
  score INTEGER NOT NULL,
  score_breakdown JSONB NOT NULL, -- {traffic, engagement, fanActivity, momentum}
  calculated_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX artist_scores_profile_date ON artist_scores(creator_profile_id, calculated_at DESC);

-- Managed playlists (Jovie-owned playlists on DSPs)
CREATE TABLE managed_playlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chart_type TEXT NOT NULL,
  provider_id TEXT NOT NULL REFERENCES providers(id),
  external_playlist_id TEXT NOT NULL,
  external_playlist_url TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  follower_count INTEGER DEFAULT 0,
  last_synced_at TIMESTAMP,
  sync_error TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX managed_playlists_chart_provider ON managed_playlists(chart_type, provider_id);

-- Track selections for playlists (which track to use per artist)
CREATE TABLE playlist_track_selections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  managed_playlist_id UUID NOT NULL REFERENCES managed_playlists(id) ON DELETE CASCADE,
  creator_profile_id UUID NOT NULL REFERENCES creator_profiles(id) ON DELETE CASCADE,
  track_id UUID REFERENCES discog_tracks(id) ON DELETE SET NULL,
  position INTEGER NOT NULL,
  selection_reason TEXT, -- 'most_popular', 'latest_release', 'most_clicked'
  spotify_track_uri TEXT,
  apple_music_track_id TEXT,
  added_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX playlist_track_selections_playlist_position
  ON playlist_track_selections(managed_playlist_id, position);
```

---

## Auto-Playlist Generation

### Track Selection Strategy

For each artist on a chart, select their "best" track using this priority:

1. **Most-clicked track** (if click data exists on release pages)
2. **Latest single** (most recent `releaseType: 'single'`)
3. **Highest Spotify popularity track** (from `spotifyPopularity`)
4. **Lead track from latest album** (track 1 from most recent album)

### Spotify Playlist Sync

#### Authentication Requirements
Current Spotify integration uses **Client Credentials** (read-only). Playlist management requires:

1. **Jovie Service Account**: Create a dedicated Spotify account for Jovie
2. **User Authorization Flow**: OAuth with scopes:
   - `playlist-modify-public`
   - `playlist-modify-private`
   - `ugc-image-upload` (for playlist artwork)

#### Sync Process
```typescript
async function syncChartToSpotifyPlaylist(chartType: string) {
  // 1. Get current chart rankings
  const rankings = await getChartRankings(chartType, 50);

  // 2. Get best track for each artist
  const tracks = await Promise.all(
    rankings.map(async (entry) => {
      const track = await selectBestTrack(entry.creatorProfileId);
      return track?.spotifyTrackUri;
    })
  );

  // 3. Get or create playlist
  const playlist = await getOrCreateManagedPlaylist(chartType, 'spotify');

  // 4. Replace playlist tracks (atomic update)
  await spotifyApi.replacePlaylistTracks(
    playlist.externalPlaylistId,
    tracks.filter(Boolean)
  );

  // 5. Update playlist metadata
  await spotifyApi.updatePlaylistDetails(playlist.externalPlaylistId, {
    name: `Jovie Hot 50 - ${format(new Date(), 'MMM yyyy')}`,
    description: `The hottest artists on Jovie right now. Updated daily.`,
  });

  // 6. Record sync
  await updatePlaylistSyncStatus(playlist.id, { lastSyncedAt: new Date() });
}
```

### Apple Music Playlist Sync

Apple Music playlists require:

1. **Apple Music for Artists** account
2. **MusicKit API** with curator token
3. **Curator Playlist permissions**

The MusicKit integration already exists (`/lib/dsp-enrichment/providers/apple-music.ts`), but curator playlist creation would need:
- Curator authentication (different from standard MusicKit JWT)
- `POST /v1/me/library/playlists` endpoint access

---

## Public Chart Pages

### URL Structure
```
/charts                     → Chart index (all charts)
/charts/hot50               → Jovie Hot 50
/charts/electronic          → Hot Electronic
/charts/city/new-york       → NYC chart
/charts/rising              → Rising Artists
```

### Page Components

```tsx
// /app/(public)/charts/[chartType]/page.tsx

export default function ChartPage({ params }: { params: { chartType: string } }) {
  return (
    <div>
      <ChartHeader
        title="Jovie Hot 50"
        lastUpdated={lastUpdated}
        playlistLinks={{ spotify: '...', appleMusic: '...' }}
      />

      <ChartTable>
        {rankings.map((entry, i) => (
          <ChartRow
            key={entry.creatorProfileId}
            position={i + 1}
            previousPosition={entry.previousPosition}
            delta={entry.delta} // ▲3, ▼2, NEW, —
            artist={entry.artist}
            score={entry.score}
            topTrack={entry.topTrack}
            streamLinks={entry.streamLinks}
          />
        ))}
      </ChartTable>

      <PlaylistCTA
        spotify={spotifyPlaylistUrl}
        appleMusic={appleMusicPlaylistUrl}
      />
    </div>
  );
}
```

### Visual Design Elements
- **Position indicators**: ▲ ▼ — NEW
- **Score visualization**: Mini sparkline or bar
- **Embedded player**: Spotify/Apple Music preview for top track
- **Social sharing**: "I'm #12 on the Jovie Hot 50!" templates

---

## Artist Dashboard Integration

### Chart Position Widget
```tsx
<ChartPositionCard>
  <Position>#23</Position>
  <ChartName>Jovie Hot 50</ChartName>
  <Trend>▲ 5 from last week</Trend>
  <ScoreBreakdown>
    Traffic: 24/30
    Engagement: 18/30
    Fan Activity: 15/25
    Momentum: 8/15
  </ScoreBreakdown>
</ChartPositionCard>
```

### Score Improvement Tips
AI-generated suggestions based on score breakdown:
- "Your engagement score is lower than similar artists. Consider adding a subscribe CTA."
- "Traffic is up 23% this week. New release incoming?"

---

## Cron Jobs & Background Tasks

### Daily Jobs
```typescript
// 1. Calculate all artist scores (2:00 AM UTC)
@Cron('0 2 * * *')
async calculateAllScores() {
  const artists = await getActiveArtists();
  for (const artist of artists) {
    const score = await calculateJovieScore(artist.id);
    await saveArtistScore(artist.id, score);
  }
}

// 2. Generate chart snapshots (3:00 AM UTC)
@Cron('0 3 * * *')
async generateChartSnapshots() {
  const chartTypes = ['hot50', 'electronic', 'hiphop', 'indie', ...];
  for (const chartType of chartTypes) {
    const rankings = await generateChartRankings(chartType);
    await saveChartSnapshot(chartType, rankings);
  }
}

// 3. Sync playlists to DSPs (4:00 AM UTC)
@Cron('0 4 * * *')
async syncAllPlaylists() {
  const playlists = await getActiveManagedPlaylists();
  for (const playlist of playlists) {
    await syncPlaylistToDSP(playlist);
  }
}
```

---

## Implementation Phases

### Phase 1: Score Infrastructure
- Add `artist_scores` table
- Implement Jovie Score calculation algorithm
- Build score calculation cron job
- Add score display to admin dashboard

### Phase 2: Chart Generation
- Add `chart_snapshots` table
- Implement chart ranking logic
- Build chart snapshot cron job
- Create internal chart preview page

### Phase 3: Public Chart Pages
- Design and build `/charts` routes
- Implement chart table components
- Add position delta tracking
- Social sharing features

### Phase 4: Spotify Playlist Sync
- Set up Jovie Spotify service account
- Implement OAuth user authorization flow
- Add `managed_playlists` table
- Build playlist sync logic
- Create playlist artwork

### Phase 5: Apple Music Integration
- Obtain curator API access
- Implement Apple Music playlist creation
- Add dual-platform sync

### Phase 6: Artist Dashboard
- Chart position widget
- Score breakdown visualization
- Improvement suggestions

---

## Metrics & Success Criteria

### Chart Health Metrics
- Chart page views
- Playlist follows (Spotify + Apple Music)
- Social shares of chart positions
- Artist dashboard engagement with score widget

### Score Quality Metrics
- Correlation between Jovie Score and Spotify popularity
- Score variance across artist population
- Momentum prediction accuracy

### Business Metrics
- New artist signups from chart visibility
- Profile claims driven by chart ranking emails
- Premium conversions from chart position features

---

## Open Questions

1. **Minimum data threshold**: How much traffic/engagement before an artist is chart-eligible?
2. **Gaming prevention**: How to prevent fake traffic from inflating scores?
3. **Opt-out**: Should artists be able to opt out of charts?
4. **Historical charts**: Archive weekly charts for "This week in 2025" features?
5. **Collaborative playlists**: Let fans vote on tracks to include?

---

## Technical Considerations

### Existing Building Blocks
- ✅ Click tracking with geo data (`clickEvents`)
- ✅ Audience engagement scoring (`audienceMembers.engagementScore`)
- ✅ Profile views tracking (`creatorProfiles.profileViews`)
- ✅ Spotify integration (read-only)
- ✅ Apple Music integration (MusicKit JWT)
- ✅ Release/track data with ISRCs
- ✅ Multi-artist support
- ✅ Recharts for visualization

### Needs Implementation
- User OAuth for Spotify playlist management
- Apple Music curator API access
- Score calculation pipeline
- Chart snapshot system
- Public chart pages
