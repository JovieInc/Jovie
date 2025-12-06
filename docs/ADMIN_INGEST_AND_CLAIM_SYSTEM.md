# Admin Creator Ingest & Claim System

This document explains the current admin creator ingestion flow and the claim system for Jovie.

---

## Overview

Jovie supports two paths for creator profiles to exist:

1. **Admin-ingested profiles** – Admins paste a Linktree URL; the system scrapes the profile, creates an unclaimed `creator_profile`, and generates a claim token.
2. **User-claimed profiles** – A creator visits a unique claim link, authenticates via Clerk, and takes ownership of the pre-built profile.

---

## Current Implementation

### 1. Admin Ingest Flow

**Entry point:** `/admin` panel → "Add Creator" action  
**API route:** `POST /api/admin/creator-ingest`  
**Source:** `app/api/admin/creator-ingest/route.ts`

#### How it works

1. Admin pastes a Linktree URL (e.g., `https://linktr.ee/artistname`).
2. The API validates the URL and extracts the handle.
3. If a profile with that normalized handle already exists → 409 conflict.
4. The system fetches the Linktree HTML and extracts:
   - Display name
   - Avatar URL
   - Social links (Spotify, Instagram, TikTok, etc.)
5. A new `creator_profile` row is inserted with:
   - `isClaimed = false`
   - `userId = null`
   - `ingestionStatus = 'processing'` → `'idle'`
6. Extracted links are normalized via `detectPlatform` / `canonicalIdentity` and inserted into `social_links` with:
   - `state = 'active'` or `'suggested'` based on confidence
   - `sourceType = 'ingested'`
   - `sourcePlatform = 'linktree'`
   - Confidence score (0.00–1.00)

#### Key files

| File | Purpose |
|------|---------|
| `app/api/admin/creator-ingest/route.ts` | API endpoint for ingestion |
| `lib/ingestion/processor.ts` | `normalizeAndMergeExtraction()` – link dedup & merge |
| `lib/ingestion/strategies/linktree.ts` | Linktree HTML fetch & parse |
| `lib/ingestion/confidence.ts` | Confidence scoring rules |
| `lib/ingestion/profile.ts` | Avatar/display name enrichment |

---

### 2. Claim Token Generation

**Source:** `lib/admin/creator-profiles.ts` → `getAdminCreatorProfiles()`

When the admin panel loads creator profiles, any unclaimed profile without a `claimToken` is automatically assigned one:

```ts
if (!row.isClaimed && !row.claimToken) {
  const token = randomUUID();
  await db.update(creatorProfiles).set({ claimToken: token });
}
```

Admins can then copy the claim link from the admin table actions menu.

---

### 3. Claim Flow (Creator Side)

**Entry point:** `/claim/[token]`  
**Source:** `app/claim/[token]/page.tsx`

#### Flow

1. Creator clicks the claim link (e.g., `https://jov.ie/claim/abc123-uuid`).
2. If not authenticated → redirect to `/sign-in?redirect_url=/claim/[token]`.
3. After Clerk auth, the page:
   - Looks up the profile by `claimToken`.
   - If already claimed or invalid token → redirect to `/dashboard`.
   - Creates or finds the `users` row for the Clerk user.
   - Updates the `creator_profile`:
     - `userId = dbUserId`
     - `isClaimed = true`
     - `claimToken = null`
     - `claimedAt = now()`
4. If onboarding not completed → redirect to `/onboarding?handle=<handle>`.
5. Otherwise → redirect to `/dashboard/overview`.

#### Post-claim state

- The creator now owns the profile and can edit links, avatar, display name.
- Admin-ingested links remain but can be modified or deleted.
- The profile appears as "claimed" in the admin panel.

---

### 4. Admin Panel Actions

**Source:** `app/admin/actions.ts`, `components/admin/CreatorProfilesTable.tsx`

| Action | Description |
|--------|-------------|
| **Copy claim link** | Copies `/claim/[token]` URL for unclaimed profiles |
| **Toggle verified** | Sets `isVerified` flag (shows badge on public profile) |
| **Toggle featured** | Sets `isFeatured` flag (shows on homepage carousel) |
| **Toggle marketing opt-out** | Sets `marketingOptOut` flag |
| **Rerun ingestion** | Re-scrapes the Linktree source to refresh links |
| **Delete** | Unclaimed: hard delete. Claimed: soft delete user (`deletedAt`) |
| **Update avatar** | Admin can override avatar URL |

---

### 5. Ingestion Job System

**Source:** `lib/ingestion/processor.ts`

The system supports background ingestion jobs via `ingestion_jobs` table:

- `claimPendingJobs()` – polls for pending jobs by `run_at` and priority
- `processJob()` – dispatches to the correct strategy (currently only `import_linktree`)
- `processLinktreeJob()` – fetches, extracts, and merges links

Jobs track:
- `status`: pending → processing → succeeded/failed
- `attempts`: retry count
- `error`: failure reason

---

### 6. Confidence & State System

**Source:** `lib/ingestion/confidence.ts`

Links have a confidence score (0.00–1.00) and state:

| State | Meaning |
|-------|---------|
| `active` | Shown on public profile |
| `suggested` | Shown as suggestion pill in dashboard (behind flag) |
| `rejected` | Hidden; user dismissed |

Confidence signals:
- Manual add (user): +0.6
- Manual add (admin): +0.5
- Linktree source: +0.2
- Handle similarity: +0.1–0.2
- Multi-source bonus: +0.15 per additional source

---

## Planned Additions

### Near-term

| Feature | Status | Notes |
|---------|--------|-------|
| **Spotify ingestion strategy** | Planned | API-based; higher confidence for artist profiles |
| **Instagram bio parsing** | Planned | HTTP meta parse for bio links |
| **Dashboard suggestion pills** | In progress | Accept/dismiss UI for `state='suggested'` links |
| **Recursive ingestion** | Planned | Follow discovered profile URLs up to depth 3 |
| **Scraper config admin UI** | Planned | Toggle enabled, strategy, rate limits per network |

### Medium-term

| Feature | Status | Notes |
|---------|--------|-------|
| **Smart link routing** | Designed | Geo/device/app-aware redirects via `/l/[slug]` |
| **Sensitive link protection** | Designed | Hide OnlyFans/Fansly from social crawlers |
| **AI link classification** | Future | Classify generic links/titles |
| **Bulk ingest CSV** | Future | Admin uploads CSV of Linktree URLs |

### Claim system enhancements

| Feature | Status | Notes |
|---------|--------|-------|
| **Email claim invites** | Planned | Send claim link via email with preview |
| **Claim expiration** | Planned | Tokens expire after N days |
| **Claim analytics** | Planned | Track claim funnel (link clicked → auth → claimed) |
| **Handle reservation** | Designed | Homepage handle-claim form (see `future_features/claim-handle.md`) |

---

## Database Schema (Key Tables)

### `creator_profiles`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `userId` | uuid | FK to `users`; null if unclaimed |
| `username` | text | Display handle |
| `usernameNormalized` | text | Lowercase, unique |
| `isClaimed` | boolean | |
| `claimToken` | uuid | Null after claim |
| `claimedAt` | timestamp | |
| `isVerified` | boolean | Admin-set |
| `isFeatured` | boolean | Admin-set |
| `ingestionStatus` | enum | idle/pending/processing/failed |
| `avatarLockedByUser` | boolean | Prevents ingestion override |
| `displayNameLocked` | boolean | Prevents ingestion override |

### `social_links`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `creatorProfileId` | uuid | FK |
| `platform` | text | e.g., spotify, instagram |
| `url` | text | Normalized |
| `state` | enum | active/suggested/rejected |
| `confidence` | numeric(3,2) | 0.00–1.00 |
| `sourceType` | enum | manual/admin/ingested |
| `sourcePlatform` | text | e.g., linktree |
| `evidence` | jsonb | `{ sources: [], signals: [] }` |

### `ingestion_jobs`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `jobType` | text | e.g., import_linktree |
| `payload` | jsonb | `{ creatorProfileId, sourceUrl }` |
| `status` | enum | pending/processing/succeeded/failed |
| `attempts` | int | |
| `runAt` | timestamp | Scheduled execution time |
| `priority` | int | Lower = higher priority |

---

## Security & RLS

- Admin actions require `requireAdmin()` check (email allowlist).
- Ingestion jobs set `app.clerk_user_id = 'system_ingestion'` for RLS bypass.
- Claim tokens are UUIDs; invalidated on use.
- Avatar URLs validated against allowlist of hosts.

---

## Hardening (Implemented)

### A. Creator Ingest Hardening

| Feature | Status | Implementation |
|---------|--------|----------------|
| **Strict URL validation** | ✅ | HTTPS only, valid Linktree hosts, handle validation |
| **Handle normalization** | ✅ | Lowercase, strip @, validate format (1-30 chars, alphanumeric + underscore) |
| **Unique constraint** | ✅ | `usernameNormalized` unique at DB level (migration 0002) |
| **Transaction + race safety** | ✅ | `withSystemIngestionSession` wraps all operations |
| **Idempotency key** | ✅ | Optional UUID in request body |
| **Error persistence** | ✅ | `lastIngestionError` column, `ingestionStatus = 'failed'` |
| **Claim token at creation** | ✅ | Token + expiration generated in ingest route |
| **Link dedup** | ✅ | Unique index on `(creatorProfileId, platform, url)` |

### B. Claim Flow Hardening

| Feature | Status | Implementation |
|---------|--------|----------------|
| **Token generated at create** | ✅ | Ingest route generates token; backfill for legacy |
| **Token uniqueness** | ✅ | Unique partial index on `claimToken` |
| **Token expiration** | ✅ | `claimTokenExpiresAt` (30 days default) |
| **Atomic claim update** | ✅ | WHERE clause: `token = $token AND isClaimed = false AND userId IS NULL` |
| **Audit columns** | ✅ | `claimedFromIp`, `claimedUserAgent` |
| **Soft-delete check** | ✅ | Blocks claim if user has `deletedAt` set |
| **Multi-profile guard** | ✅ | 1 user ↔ 1 profile (blocks second claim) |

### C. Ingestion Jobs Hardening

| Feature | Status | Implementation |
|---------|--------|----------------|
| **Max attempts** | ✅ | `maxAttempts` column (default 3) |
| **Exponential backoff** | ✅ | `calculateBackoff()` with jitter |
| **Dedup key** | ✅ | `dedupKey` column with unique partial index |
| **Job status tracking** | ✅ | `failJob()`, `succeedJob()`, `resetJobForRetry()` |

---

## Migration: 0002_ingest_claim_hardening.sql

Adds:
- `creator_profiles.last_ingestion_error` (text)
- `creator_profiles.claim_token_expires_at` (timestamp)
- `creator_profiles.claimed_from_ip` (text)
- `creator_profiles.claimed_user_agent` (text)
- `ingestion_jobs.max_attempts` (int, default 3)
- `ingestion_jobs.next_run_at` (timestamp)
- `ingestion_jobs.dedup_key` (text)
- Unique index on `username_normalized`
- Unique partial index on `claim_token`
- Unique index on `(creator_profile_id, platform, url)` for social_links
- Index for efficient job polling

---

## Related Documentation

- `docs/link_ingestion_and_suggestions.md` – Full design doc for ingestion system
- `future_features/claim-handle.md` – Handle-first claim flow design
- `docs/STATSIG_FEATURE_GATES.md` – Feature flags for rollout
