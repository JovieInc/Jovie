# Admin Creator Ingest & Claim System

This document explains the current admin creator ingestion flow, claim system, and the GTM roadmap for Jovie.

---

## Overview

Jovie supports two paths for creator profiles to exist:

1. **Admin-ingested profiles** – Admins paste a Linktree URL; the system scrapes the profile, creates an unclaimed `creator_profile`, and generates a claim token.
2. **User-claimed profiles** – A creator visits a unique claim link, authenticates via Clerk, and takes ownership of the pre-built profile.

---

## GTM Implementation Roadmap

### Step 1 – Harden Core Ingest + Claim ✅ DONE

| Task | Status | Notes |
|------|--------|-------|
| Strict Linktree URL validation | ✅ | HTTPS only, valid hosts, handle validation |
| Unique constraint on `usernameNormalized` | ✅ | DB migration 0002 |
| Link dedup constraint | ✅ | Unique index on `(creatorProfileId, platform, url)` |
| Error handling / failed state | ✅ | `lastIngestionError`, `ingestionStatus = 'failed'` |
| Generate `claimToken` on create | ✅ | Token + expiration in ingest route |
| Add `claimTokenExpiresAt` column | ✅ | 30-day default |
| Atomic claim update | ✅ | WHERE `isClaimed = false AND userId IS NULL` |
| Audit columns | ✅ | `claimedFromIp`, `claimedUserAgent` |
| Multi-profile guard | ✅ | 1 user ↔ 1 profile |
| Soft-delete check | ✅ | Blocks claim if user deleted |
| Admin UX badges | ✅ | `ingestionStatus`, `lastIngestionError` exposed |
| Copy claim link | ✅ | Already wired |
| Rerun ingestion | ✅ | `resetJobForRetry()` with backoff |

**Result:** Safe to hand-craft claim emails manually and trust the system.

---

### Step 2 – v1 Email Invites (Manual Trigger) 🔜 NEXT

| Task | Status | Notes |
|------|--------|-------|
| `creator_claim_invites` table | ⬜ | See schema below |
| `email_unsubscribes` table | ⬜ | Keyed by email |
| Email provider integration | ⬜ | SendGrid/Resend/SES |
| Static founder-style template | ⬜ | No AI yet |
| Admin UI: email field per profile | ⬜ | Inline edit or modal |
| Admin UI: "Send invite" action | ⬜ | Creates pending invite |
| Invite status display | ⬜ | never/invited/bounced/unsubscribed |
| Unsubscribe endpoint | ⬜ | `/unsubscribe?token=...` |
| Footer compliance | ⬜ | Physical address + opt-out |

---

### Step 3 – Scheduling, Throttling, 9–5 PST Batching ⬜ LATER

| Task | Status | Notes |
|------|--------|-------|
| Send window logic | ⬜ | Mon–Fri, 9–5 PST |
| Per-hour throttle | ⬜ | `MAX_INVITES_PER_HOUR` config |
| "Pause all sending" toggle | ⬜ | Admin control |
| Queue management UI | ⬜ | View/cancel/reschedule invites |

---

### Step 4 – AI Personalization ⬜ LATER

| Task | Status | Notes |
|------|--------|-------|
| Prompt template system | ⬜ | Base tone/persona config |
| LLM integration in worker | ⬜ | Generate subject/body |
| Post-process validation | ⬜ | Ensure links present |
| Admin preview | ⬜ | Generate sample, toggle AI on/off |

---

### Step 5 – Analytics + Claim Funnel ⬜ LATER

| Task | Status | Notes |
|------|--------|-------|
| Admin stats widget | ⬜ | All-time + 7d/30d conversion |
| `GET /api/admin/stats` endpoint | ⬜ | Returns invite/claim counts |
| `DashboardStatsWidget` component | ⬜ | Renders conversion card |
| Funnel tracking (advanced) | ⬜ | Invite → open → login → claim |
| Per-invite attribution | ⬜ | `claimedFromInviteId` (defer) |
| A/B test tracking | ⬜ | Per-variant metrics |

---

### Deferred (Not Core to GTM MVP)

- Spotify ingestion strategy
- Instagram bio parsing
- Recursive ingestion
- Smart link routing
- Sensitive link protection
- AI link classification
- Bulk ingest CSV

---

## Email & Contact System Design (Step 2)

### Overview

Auto-harvest contact emails during ingestion, classify them, and make invites "one click" for admins.

---

### Data Model

#### `creator_contacts` table (Hidden CRM Data)

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `creator_profile_id` | uuid | FK → `creator_profiles` |
| `email` | text | Unique per `(creator_profile_id, email)` |
| `label` | text | Optional: "Personal", "Manager", "Agent", "Press" |
| `type` | enum | `personal` / `manager_agent` / `generic` / `junk` |
| `source_type` | enum | `ingested` / `manual` |
| `source_platform` | text | `linktree`, `website`, `instagram_bio`, etc. |
| `confidence` | numeric(3,2) | 0.00–1.00 |
| `is_primary` | boolean | Only one true per profile (DB constraint) |
| `is_active` | boolean | Soft-disable without deleting |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

**RLS:** Only exposed to backend/admin API. Never to public/creator-side. Treat as internal CRM data.

#### `creator_claim_invites` table

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `creator_profile_id` | uuid | FK to `creator_profiles` |
| `creator_contact_id` | uuid | FK to `creator_contacts` (which email was used) |
| `email` | text | Snapshot of email at send time |
| `status` | enum | `pending`/`scheduled`/`sending`/`sent`/`bounced`/`failed`/`unsubscribed` |
| `send_at` | timestamp | When to send (UTC) |
| `sent_at` | timestamp | Actual send time |
| `error` | text | Error from provider |
| `subject` | text | Final subject used |
| `body` | text | Final rendered text |
| `ai_variant_id` | text | Optional for A/B testing |
| `meta` | jsonb | `{ source: 'admin_click' | 'bulk' | 'auto' }` |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

#### `email_unsubscribes` table

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `email` | text | Unique, lowercase |
| `creator_profile_id` | uuid | Optional FK |
| `unsubscribe_token` | text | For link verification |
| `reason` | text | Optional |
| `created_at` | timestamp | |

#### `creator_profiles` additions

| Column | Type | Notes |
|--------|------|-------|
| `has_contact_email` | boolean | Denormalized for cheap admin table filtering |

---

### Email Scraping During Ingestion

#### Where it plugs in

1. **Linktree strategy** (`lib/ingestion/strategies/linktree.ts`):
   - After fetching HTML, run `extractEmailsFromHtml(html, sourceMeta)`

2. **Processor** (`lib/ingestion/processor.ts`):
   - Merge into `creator_contacts` via `mergeContacts()` step
   - Similar to social link merging

#### How to extract emails

**Simple v1:**

1. From `<a href="mailto:...">` – strip `mailto:` and query params
2. From raw text – regex: `[\w.+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}`
3. Dedup between mailto + raw text

**Later:** Scrape external "official site" links for emails (defer until base system stable)

---

### Email Classification (Rule-Based, No AI Needed)

#### Type Classification

| Type | Criteria |
|------|----------|
| **junk** | Local-part matches: `noreply`, `no-reply`, `do-not-reply`, `mailer-daemon`, `notifications`, `updates`, `mailer`. Or domain is bulk service (Mailchimp, SendGrid) |
| **generic** | Local-part in: `info`, `contact`, `support`, `hello`, `team`, `press`, `booking`, `business`, `management`, `office` |
| **manager_agent** | Local-part or context contains: `manager`, `mgmt`, `agent`, `booking`, `bookings`, `agency`, `label`, `pr`, `press` |
| **personal** | Local-part includes handle/creator name (or close match) AND doesn't contain generic/manager keywords |

#### Confidence Scoring

```
Base: 0.5 for any non-junk email

Add:
  +0.2 if classified as personal
  +0.15 if context/anchor text is "email me" / "business email"
  +0.1 if domain is custom (e.g., @artistname.com)

Subtract:
  −0.2 if generic
  −0.1 if manager_agent (when prioritizing personal)
```

---

### Priority & Sending Rules

#### Priority Order (When Picking Email for Invite)

1. Any `creator_contacts` where `is_primary = true AND is_active = true`
2. If none, highest priority among:
   - `type = 'personal' AND is_active = true`
   - then `type = 'manager_agent'`
   - then `type = 'generic'`
3. **Exclude:** `type = 'junk'` and `is_active = false`
4. **Within same type:** Sort by higher confidence, then earliest `created_at`

#### Manual Override Rules

| Action | Behavior |
|--------|----------|
| Admin manually adds email | `source_type = 'manual'`, `is_primary = true`, flip all other `is_primary` to false |
| Admin changes primary via UI | Update `is_primary`, leave `source_type` as is |
| Admin disables email | Set `is_active = false`, don't delete |

---

### Admin Panel Behavior

#### Table Display

- **Email column:** Show chip: `Email: personal`, `Email: manager`, `Email: generic`, or `No email`
- **Invite button:**
  - **Enabled** if at least one `creator_contacts` with `is_active = true AND type != 'junk'`
  - **Disabled + tooltip:** "No contact email found. Add one to send an invite."

#### Email Detail Modal (Click email cell)

List of emails with:
- Email address
- Type badge (Personal, Manager, etc.)
- Source (manual/linktree)
- Confidence
- Toggle: Active/inactive
- Star: Set as primary

#### Manual Email Entry

"Add email" form:
- Email input
- Optional label (free text) or dropdown for type
- On save: Create `creator_contacts` with `source_type = 'manual'`, `type` from dropdown (default personal), `is_primary = true`

---

### Sending Layer (Resend Now, SES Later)

#### Provider Abstraction

```typescript
// lib/email/sendClaimInvite.ts
type ClaimInviteEmail = {
  to: string;
  subject: string;
  bodyText: string; // plain text only
};

export async function sendClaimInviteEmail(payload: ClaimInviteEmail) {
  if (process.env.EMAIL_PROVIDER === 'resend') {
    // call Resend SDK with text-only
  } else if (process.env.EMAIL_PROVIDER === 'ses') {
    // call SES SDK
  }
}
```

#### Plain Text Founder-Style Email (v0 Template)

```
Subject: I set up a Jovie profile for you

Hey {first_name_or_handle},

I made a Jovie profile for you based on your Linktree.

You can claim it here:
{claim_url}

Once you claim it, you can edit your links and customize how fans find your stuff.

If you don't want this, you can just ignore this email.

– {founder_name}
```

**Note:** No HTML fluff. Looks like personal Gmail from founder.

---

### Basic Invite Flow (MVP)

1. **Admin clicks "Invite"** on profile row
2. **Server:** 
   - Calls `getPrimaryContactEmail(creatorProfileId)` with priority rules
   - Validates email not in `email_unsubscribes`
   - Creates `creator_claim_invites` row with `status = 'pending'`
3. **Background worker:**
   - Fetches pending invites
   - Generates email from template
   - Sends via provider abstraction
   - Updates status to `sent` or `failed`

### Compliance Requirements

- Footer with physical mailing address
- One-click unsubscribe link (`/unsubscribe?token=...`)
- Track unsubscribes in `email_unsubscribes` table

---

### Scheduling & Throttling (Step 3)

#### Send Window

- Convert `now` to `America/Los_Angeles`
- Only send if: `DayOfWeek ∈ [Mon–Fri]` AND `Hour ∈ [9..16]`

#### Throttling

- Config: `MAX_INVITES_PER_HOUR` in DB or env
- Worker counts `sentAt` in last hour, sends up to remaining capacity
- Exceeding invites stay `scheduled` for next run

---

### AI Personalization (Step 4)

#### Template Spec

- Base prompt template with variables: `{creator_name}`, `{platform}`, `{linktree_url}`, `{claim_url}`, `{founder_name}`, `{style}`
- Style presets for tone, length

#### Generation Step

- Call LLM with base prompt + variables
- Receive `{subject, body_text}` (plain text only)
- Post-process: ensure claim link present, append unsubscribe, enforce max length

#### Storage

- Persist final `subject` and `body` in `creator_claim_invites` before send
- Resend uses exact same content
- Full audit trail

---

### Implementation Order (Step 2 Breakdown)

| Order | Task | Notes |
|-------|------|-------|
| 2.1 | DB migrations | `creator_contacts` table + indexes + constraints |
| 2.2 | Add `has_contact_email` to `creator_profiles` | Denormalized for filtering |
| 2.3 | Implement `extractEmailsFromHtml()` | In Linktree strategy |
| 2.4 | Implement `classifyEmailType()` & scoring | Rule-based, no AI |
| 2.5 | Implement `mergeContacts()` | Dedup + priority logic |
| 2.6 | Implement `getPrimaryContactEmail()` | Priority selection utility |
| 2.7 | Admin UI: email presence/type per profile | Chip display |
| 2.8 | Admin UI: disable Invite if no usable email | Button state |
| 2.9 | Admin UI: "Add email" modal | Manual entry |
| 2.10 | Wire Resend with provider abstraction | Ready for SES later |
| 2.11 | `creator_claim_invites` table + worker | Send flow |
| 2.12 | Unsubscribe endpoint + tracking | Compliance |

**Result:** Automated the hardest part of GTM – finding and prioritizing who to email.

---

## Admin Analytics Widget Design (Step 5)

### Overview

Simple dashboard widget showing if the GTM engine is producing actual ownership, not just emails fired into the void.

---

### Metrics to Display

#### All-Time (Headline Row)

| Metric | Description |
|--------|-------------|
| **Invites sent** | Total `creator_claim_invites` with `status = 'sent'` |
| **Profiles claimed** | Total `creator_profiles` with `isClaimed = true` |
| **Conversion** | `profiles_claimed / invites_sent` |

#### Recent Performance (Secondary Row)

For **Last 7 days** and **Last 30 days**:
- Invites sent (in window)
- Profiles claimed (in window)
- Conversion rate

---

### Data Sources

Already have everything needed:

| Table | Columns Used |
|-------|--------------|
| `creator_claim_invites` | `status`, `sent_at` |
| `creator_profiles` | `is_claimed`, `claimed_at` |

**MVP:** No per-invite attribution needed. Conversion = "profile claimed at any time after we started sending invites."

**Later (defer):** Add `claimed_from_invite_id` on `creator_profiles` for precise attribution.

---

### Core Aggregation Queries

#### All-Time Totals

```sql
-- Total invites sent
SELECT COUNT(*) AS invites_sent_all_time
FROM creator_claim_invites
WHERE status = 'sent';

-- Total profiles claimed
SELECT COUNT(*) AS profiles_claimed_all_time
FROM creator_profiles
WHERE is_claimed = true;

-- Conversion rate (compute in app code)
-- conversion_all_time = profiles_claimed_all_time / invites_sent_all_time
```

#### Windowed Stats (7d / 30d)

```sql
-- Invites sent in window
SELECT COUNT(*) AS invites_sent
FROM creator_claim_invites
WHERE status = 'sent'
  AND sent_at >= NOW() - INTERVAL '7 days';  -- or '30 days'

-- Profiles claimed in window (simple MVP)
SELECT COUNT(*) AS profiles_claimed
FROM creator_profiles
WHERE is_claimed = true
  AND claimed_at >= NOW() - INTERVAL '7 days';

-- More precise: only profiles that were invited
SELECT COUNT(DISTINCT cp.id) AS profiles_claimed
FROM creator_profiles cp
JOIN creator_claim_invites ci
  ON ci.creator_profile_id = cp.id
WHERE cp.is_claimed = true
  AND cp.claimed_at >= NOW() - INTERVAL '7 days'
  AND ci.status = 'sent';
```

---

### API Endpoint

#### `GET /api/admin/stats`

Locked behind `requireAdmin()`.

**Response:**

```json
{
  "allTime": {
    "invitesSent": 1234,
    "profilesClaimed": 321,
    "conversion": 0.26
  },
  "last7d": {
    "invitesSent": 80,
    "profilesClaimed": 20,
    "conversion": 0.25
  },
  "last30d": {
    "invitesSent": 270,
    "profilesClaimed": 60,
    "conversion": 0.22
  }
}
```

---

### Dashboard Widget UX

#### Layout

Single card on `/admin`:

```
┌─────────────────────────────────────────────────────┐
│  GTM Performance                                    │
├─────────────────────────────────────────────────────┤
│  1,234          321           26%                   │
│  Invites sent   Claimed       Conversion            │
├─────────────────────────────────────────────────────┤
│  Last 7d:  80 invites, 20 claims, 25%              │
│  Last 30d: 270 invites, 60 claims, 22%             │
└─────────────────────────────────────────────────────┘
```

#### Conversion Color Coding

- **Green:** Last 7d > Last 30d (improving)
- **Red:** Last 7d < Last 30d (declining)
- **Neutral:** Within 5% variance

#### Nice-to-Have

- "Last updated: just now" label
- Click-through to `/admin/analytics` (future)

---

### Implementation Order (Step 5 Breakdown)

| Order | Task | Notes |
|-------|------|-------|
| 5.1 | Implement `getAdminStats()` | Server function with SQL queries |
| 5.2 | Create `GET /api/admin/stats` | Route with `requireAdmin()` |
| 5.3 | Build `DashboardStatsWidget` | Card component with SWR/fetch |
| 5.4 | Add to `/admin` page | Render above profiles table |

**Result:** Immediate signal if GTM efforts are working.

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
- `docs/discog_rollout_checklist.md` – Discog gate, backfill, and monitoring rollout steps
- `future_features/claim-handle.md` – Handle-first claim flow design
- `docs/STATSIG_FEATURE_GATES.md` – Feature flags for rollout
