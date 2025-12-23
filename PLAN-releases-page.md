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

## Remaining Work Items

### Phase 1: Database Persistence (Critical)

Replace in-memory store with Drizzle queries to enable data persistence.

#### 1.1 Create database query layer
**Location:** `apps/web/lib/discog/queries.ts`

- [ ] `getReleasesForProfile(profileId)` - Fetch releases with provider links
- [ ] `getReleaseBySlug(profileId, slug)` - Single release lookup
- [ ] `createRelease(profileId, data)` - Insert new release
- [ ] `updateRelease(releaseId, data)` - Update release metadata
- [ ] `deleteRelease(releaseId)` - Soft/hard delete
- [ ] `upsertProviderLink(releaseId, providerId, url)` - Save provider override
- [ ] `resetProviderLink(releaseId, providerId)` - Reset to detected

#### 1.2 Update server actions
**Location:** `apps/web/app/app/dashboard/releases/actions.ts`

- [ ] Replace `getReleasesForProfile()` (in-memory) with DB query
- [ ] Replace `updateProviderLink()` with DB mutation
- [ ] Update `saveProviderOverride()` to use DB
- [ ] Update `resetProviderOverride()` to use DB

#### 1.3 Update smart link redirect
**Location:** `apps/web/app/r/[slug]/route.ts`

- [ ] Replace `resolveReleaseBySlug()` with DB query
- [ ] Add analytics tracking for redirects (Statsig event)

---

### Phase 2: Add Release Functionality

Users need to be able to add their own releases.

#### 2.1 Manual release creation
- [ ] Create "Add Release" button in releases page header
- [ ] Create `AddReleaseDialog` component with form:
  - Title (required)
  - Release date (optional)
  - Artwork URL (optional, later: upload)
  - Release type (single/EP/album)
- [ ] Create `createRelease` server action
- [ ] Add validation (Zod schema)

#### 2.2 Provider link detection (future)
- [ ] Integrate with music metadata APIs (Spotify, MusicBrainz)
- [ ] Auto-populate provider links when release is found
- [ ] Mark detected links with `source: 'ingested'`

---

### Phase 3: Edit & Delete Release

#### 3.1 Edit release metadata
- [ ] Add "Edit" action to release row (separate from provider links)
- [ ] Create `EditReleaseDialog` component
- [ ] Allow editing: title, release date, artwork URL, release type
- [ ] Create `updateRelease` server action

#### 3.2 Delete release
- [ ] Add "Delete" action (with confirmation dialog)
- [ ] Create `deleteRelease` server action
- [ ] Handle cascade deletion of provider links

---

### Phase 4: Smart Link Landing Page

Currently `/r/[slug]` auto-redirects. Add optional landing page.

#### 4.1 Landing page UI
**Location:** `apps/web/app/r/[slug]/page.tsx`

- [ ] Create landing page with:
  - Release artwork (large)
  - Release title and artist
  - List of streaming platform buttons
  - "Listen now" CTAs per provider
- [ ] Add device detection for smart default provider

#### 4.2 User preference
- [ ] Allow users to choose between auto-redirect and landing page
- [ ] Store preference in `smart_link_targets` or release metadata

---

### Phase 5: Track-Level Management (Future)

The schema supports tracks but UI doesn't expose them.

#### 5.1 Track listing
- [ ] Show track count on release row
- [ ] Expand release to see track list
- [ ] Track-level smart links

#### 5.2 Track provider links
- [ ] Edit provider links per track
- [ ] Track-specific smart links (`/r/[slug]/[trackSlug]`)

---

### Phase 6: Import & Sync (Future)

Connect to external services for release ingestion.

#### 6.1 Distributor integration
- [ ] Connect to DistroKid, TuneCore, CD Baby APIs
- [ ] Sync releases automatically
- [ ] Handle new release notifications

#### 6.2 Music service APIs
- [ ] Spotify Artist API integration
- [ ] Apple Music API integration
- [ ] Auto-update provider links

---

### Phase 7: Feature Gate & Analytics

#### 7.1 Feature gate
- [ ] Ensure `feature_discog_smart_links` gate exists in Statsig
- [ ] Gate the releases page behind this flag
- [ ] Add gradual rollout rules

#### 7.2 Analytics events
- [ ] `smart_link_copied` - When user copies a smart link
- [ ] `smart_link_clicked` - When fan clicks a smart link
- [ ] `provider_override_saved` - When user customizes a link
- [ ] `release_created` / `release_deleted`

---

## Recommended Implementation Order

1. **Phase 1** (Database) - Critical foundation
2. **Phase 2.1** (Manual add) - Basic CRUD complete
3. **Phase 3** (Edit/Delete) - Full CRUD
4. **Phase 7** (Analytics) - Measure usage
5. **Phase 4** (Landing page) - Better UX
6. **Phase 5-6** (Tracks, Import) - Advanced features

---

## Files to Modify/Create

### New Files
- `apps/web/lib/discog/queries.ts` - Database query functions
- `apps/web/components/dashboard/organisms/AddReleaseDialog.tsx`
- `apps/web/components/dashboard/organisms/EditReleaseDialog.tsx`
- `apps/web/app/r/[slug]/page.tsx` - Landing page (optional)

### Files to Modify
- `apps/web/app/app/dashboard/releases/actions.ts` - Use DB queries
- `apps/web/app/app/dashboard/releases/page.tsx` - Add "Add Release" button
- `apps/web/app/r/[slug]/route.ts` - Use DB queries + analytics
- `apps/web/components/dashboard/organisms/ReleaseProviderMatrix.tsx` - Add edit/delete actions
- `apps/web/lib/discography/store.ts` - Delete (replaced by queries.ts)

---

## Testing Requirements

- [ ] Unit tests for database query functions
- [ ] E2E test: Create release → copy smart link → verify redirect
- [ ] E2E test: Edit provider link → verify override persists
- [ ] E2E test: Delete release → verify cascade deletion
