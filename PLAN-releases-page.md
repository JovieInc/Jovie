# Releases Page - Remaining Work Plan

## Current State Summary

The releases page has a **complete MVP UI** with:
- ✅ Release matrix table (artwork, title, date, smart link)
- ✅ Provider status indicators (detected/manual/missing)
- ✅ Smart link copy functionality
- ✅ Edit dialog for provider URL overrides
- ✅ Reset to detected link functionality
- ✅ Smart link redirect route (`/r/[slug]`)

**Key limitation:** Currently uses **in-memory store** with seeded demo data (`lib/discography/store.ts`). No persistence.

## Database Schema (Ready)

The following tables exist and are migrated:
- `discog_releases` - Release metadata (title, slug, artwork, release_date, etc.)
- `discog_tracks` - Track metadata (supports multi-track releases)
- `provider_links` - Links to streaming platforms per release/track
- `smart_link_targets` - Custom routing rules for smart links
- `providers` - Provider registry (Spotify, Apple Music, etc.)

---

## V1 Scope

**No manual release creation.** Releases are imported exclusively via Spotify artist profile discovery.

---

## Remaining Work Items

### Phase 1: Spotify Discovery & Import (Critical)

Import releases from the artist's connected Spotify profile.

#### 1.1 Spotify Artist API Integration
**Location:** `apps/web/lib/spotify/`

- [ ] Use existing Spotify OAuth connection from artist profile
- [ ] Fetch artist's discography via Spotify Web API (`/artists/{id}/albums`)
- [ ] Parse album/single/EP metadata (title, release_date, artwork, tracks)
- [ ] Extract Spotify URLs for each release

#### 1.2 Release ingestion flow
- [ ] Trigger import when user connects Spotify OR on-demand "Sync" button
- [ ] Create `importReleasesFromSpotify(profileId, spotifyArtistId)` function
- [ ] Map Spotify albums → `discog_releases` records
- [ ] Map Spotify tracks → `discog_tracks` records
- [ ] Create `provider_links` entries with Spotify URLs (`source: 'ingested'`)

#### 1.3 Cross-platform link discovery
- [ ] Use release metadata (title, artist, UPC/ISRC) to find on other platforms
- [ ] Integrate with Odesli/Songlink API or similar for cross-platform matching
- [ ] Auto-populate Apple Music, YouTube Music, etc. links where found

---

### Phase 2: Database Persistence (Critical)

Replace in-memory store with Drizzle queries.

#### 2.1 Create database query layer
**Location:** `apps/web/lib/discog/queries.ts`

- [ ] `getReleasesForProfile(profileId)` - Fetch releases with provider links
- [ ] `getReleaseBySlug(profileId, slug)` - Single release lookup
- [ ] `upsertRelease(profileId, data)` - Insert/update from Spotify import
- [ ] `upsertProviderLink(releaseId, providerId, url, source)` - Save provider link
- [ ] `resetProviderLink(releaseId, providerId)` - Reset manual override to ingested

#### 2.2 Update server actions
**Location:** `apps/web/app/app/dashboard/releases/actions.ts`

- [ ] Replace `getReleasesForProfile()` (in-memory) with DB query
- [ ] Replace `updateProviderLink()` with DB mutation
- [ ] Update `saveProviderOverride()` to use DB
- [ ] Update `resetProviderOverride()` to use DB
- [ ] Add `syncReleasesFromSpotify()` action

#### 2.3 Update smart link redirect
**Location:** `apps/web/app/r/[slug]/route.ts`

- [ ] Replace `resolveReleaseBySlug()` with DB query
- [ ] Add analytics tracking for redirects (Statsig event)

---

### Phase 3: Sync & Refresh UI

#### 3.1 Sync controls
- [ ] Add "Sync from Spotify" button in releases page header
- [ ] Show last sync timestamp
- [ ] Loading state during sync
- [ ] Success/error toast feedback

#### 3.2 Empty state
- [ ] Update empty state to prompt Spotify connection
- [ ] Link to profile settings if Spotify not connected
- [ ] "Connect Spotify to import your releases"

#### 3.3 New release detection
- [ ] Compare Spotify discography on sync
- [ ] Highlight newly imported releases
- [ ] Optional: webhook/polling for new releases (future)

---

### Phase 4: Provider Link Overrides (Existing UI)

The UI already supports this - ensure it works with DB persistence.

#### 4.1 Manual override flow
- [ ] User edits provider URL → saves as `source: 'manual'`
- [ ] Reset button → reverts to `source: 'ingested'` URL (or removes if none)
- [ ] Visual badge for manual overrides (already implemented)

---

### Phase 5: Feature Gate & Analytics

#### 5.1 Feature gate
- [ ] Ensure `feature_discog_smart_links` gate exists in Statsig
- [ ] Gate the releases page behind this flag
- [ ] Add gradual rollout rules

#### 5.2 Analytics events
- [ ] `releases_synced` - When user syncs from Spotify
- [ ] `smart_link_copied` - When user copies a smart link
- [ ] `smart_link_clicked` - When fan clicks a smart link
- [ ] `provider_override_saved` - When user customizes a link

---

### Future (Post-V1)

#### Smart Link Landing Page
- [ ] Optional landing page vs auto-redirect
- [ ] Release artwork, title, platform buttons

#### Track-Level Management
- [ ] Track listing per release
- [ ] Track-specific smart links

#### Additional Import Sources
- [ ] Apple Music artist profile import
- [ ] DistroKid/TuneCore API integration
- [ ] Manual release creation (if needed)

---

## Recommended Implementation Order

1. **Phase 2** (Database) - Foundation for persistence
2. **Phase 1** (Spotify Import) - Core V1 feature
3. **Phase 3** (Sync UI) - User-facing controls
4. **Phase 4** (Overrides) - Already built, verify with DB
5. **Phase 5** (Analytics) - Measure usage

---

## Files to Modify/Create

### New Files
- `apps/web/lib/discog/queries.ts` - Database query functions
- `apps/web/lib/spotify/discography.ts` - Spotify import logic
- `apps/web/lib/discog/cross-platform.ts` - Odesli/Songlink integration

### Files to Modify
- `apps/web/app/app/dashboard/releases/actions.ts` - Use DB queries, add sync action
- `apps/web/app/app/dashboard/releases/page.tsx` - Add sync button, update empty state
- `apps/web/app/r/[slug]/route.ts` - Use DB queries + analytics
- `apps/web/components/dashboard/organisms/ReleaseProviderMatrix.tsx` - Add sync UI
- `apps/web/lib/discography/store.ts` - Delete (replaced by queries.ts)

---

## Testing Requirements

- [ ] Unit tests for Spotify API parsing
- [ ] Unit tests for database query functions
- [ ] E2E test: Connect Spotify → sync releases → verify in table
- [ ] E2E test: Copy smart link → verify redirect works
- [ ] E2E test: Edit provider link → verify override persists
- [ ] E2E test: Reset override → verify reverts to ingested URL

---

## Dependencies

- Spotify OAuth already connected via artist profile
- Spotify Web API access token available
- Odesli/Songlink API key (for cross-platform discovery)
