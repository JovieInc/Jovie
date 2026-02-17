# Profile Visitor Retargeting — Implementation Plan

> **Status: DEFERRED** — Ship after Growth plan launch. This is the full plan for when we're ready to build it.

## Context

When a visitor hits an artist's public profile and bounces without subscribing (email/SMS), the artist should be able to automatically retarget them on Facebook until they convert. The subscriber list is synced to Facebook as a **Custom Audience exclusion** — as people subscribe, they're automatically excluded from ads. No conversion detection or campaign pausing needed.

**What already works today:**
- `audienceMembers` tracks every anonymous visitor by fingerprint (IP+UA hash) with intent scoring
- Facebook CAPI forwarding sends `PageView` events to the artist's pixel — Facebook is **already building a retargetable "website visitors" audience** from these events
- `notificationSubscriptions` stores confirmed email/SMS subscribers with double opt-in
- `creatorPixels` stores per-artist Facebook pixel ID + encrypted access token

**What's missing:** Syncing the subscriber list to Facebook as an exclusion audience, and automated "set it and forget it" campaign creation.

---

## Artist UX — The End State

Dead simple. The artist sees this in their Jovie dashboard:

1. **Connect** — Paste their Facebook Ad Account ID + System User token (same flow as existing pixel setup). Phase 3 replaces this with a "Connect Facebook" OAuth button.
2. **Pick a budget** — `$1/day` / `$5/day` / `$10/day`. One click.
3. **Done.** Jovie auto-generates the ad creative from their profile (photo, name, Jovie link), creates the campaign on their Facebook Ad Account targeting bounced visitors with subscriber exclusion, and activates it. Facebook charges the artist's card on file directly. New subscribers are excluded from ads every 15 minutes automatically.

The artist never opens Facebook Ads Manager. They just pick a budget and forget about it.

---

## Code vs Facebook Approval — Summary

| What | Just Code? | Facebook Approval? |
|------|-----------|-------------------|
| Subscriber exclusion audience sync | YES | NO — artist's own System User token works |
| Dashboard UI for retargeting settings | YES | NO |
| Custom Audience creation (Marketing API) | YES | NO — System User tokens don't need App Review |
| Automated campaign creation (Ads API) | YES | NO — same token, same API |
| OAuth "Connect Facebook" button | YES (code) | **YES — requires Meta App Review for `ads_management` scope (2-6 weeks)** |
| Token refresh for OAuth tokens | YES (code) | Blocked on OAuth approval above |

**Bottom line:** Phases 1 and 2 are pure code — shippable with no Facebook approval. The artist pastes a System User token (same pattern as the existing pixel config). Phase 3 (OAuth flow for smoother UX) requires Meta App Review, which can be submitted in parallel with Phase 2 development.

---

## Phase 1: Subscriber Exclusion Audience Sync

**Pure code. No Facebook approval. Shippable immediately.**

The backend that creates and maintains a Facebook Custom Audience of confirmed subscribers, for use as an ad set exclusion.

### 1.1 Schema: New `retargeting` module

**Create** `apps/web/lib/db/schema/retargeting.ts`

New table `fb_custom_audiences`:
- `id`, `creatorProfileId` (FK, unique per profile)
- `facebookAudienceId` (null until created on Facebook)
- `facebookAdAccountId` (`act_XXXXX`)
- `audienceName`, `status` (pending/created/syncing/synced/error)
- `lastSyncedAt`, `lastSyncError`, `memberCount`
- `syncCursor` (tracks last `notificationSubscriptions.id` processed for incremental sync)

### 1.2 Schema: Extend `creatorPixels`

**Modify** `apps/web/lib/db/schema/pixels.ts`

Add column: `facebookAdAccountId: text('facebook_ad_account_id')` — the artist's Facebook Ad Account ID, required for Marketing API calls.

**Migration:** One migration adds the column + creates the new table.

### 1.3 Facebook Marketing API wrapper

**Create** `apps/web/lib/facebook/marketing-api.ts`

Functions wrapping the Marketing API v18.0 (follows patterns from `lib/tracking/forwarding/facebook.ts`):

| Function | Facebook Endpoint | Purpose |
|----------|-------------------|---------|
| `createCustomAudience()` | `POST /{ad_account_id}/customaudiences` | Create the exclusion audience |
| `addUsersToAudience()` | `POST /{audience_id}/users` | Upload hashed subscriber data |
| `removeUsersFromAudience()` | `DELETE /{audience_id}/users` | Remove unsubscribed users |
| `getAudienceInfo()` | `GET /{audience_id}` | Check audience size/status |
| `deleteAudience()` | `DELETE /{audience_id}` | Clean up |

All require `ads_management` permission. All use the same `AbortController` timeout + error logging pattern as the existing CAPI forwarder.

**Facebook API constraints:**
- Batch limit: 10,000 records per upload call
- Rate limit: 5,000 calls/hour per ad account (generous)
- Minimum audience size: 20 members for Facebook to use it in targeting

### 1.4 Hashing utility

**Create** `apps/web/lib/facebook/hashing.ts`

- `hashEmailForFacebook(email)` — lowercase, trim, SHA-256 hex
- `hashPhoneForFacebook(phone, countryCode?)` — E.164 format, SHA-256 hex

Per Facebook spec: plaintext PII never leaves Jovie's servers.

### 1.5 Audience sync service

**Create** `apps/web/lib/facebook/audience-sync.ts`

`syncSubscriberExclusionAudience(creatorProfileId)`:
1. Load `fbCustomAudiences` row + `creatorPixels` (decrypt access token via `decryptPII`)
2. If no audience exists on Facebook yet → `createCustomAudience()`
3. Query `notificationSubscriptions` WHERE `confirmedAt IS NOT NULL` AND `unsubscribedAt IS NULL` AND `id > syncCursor`, ordered by id, limit 10,000
4. Hash emails/phones → `addUsersToAudience()` in batches of 10,000
5. Update `syncCursor`, `lastSyncedAt`, `memberCount`, `status`

**Unsubscribe handling:** Daily full re-sync compares current confirmed subscribers against previously synced set. Uses `removeUsersFromAudience()` for anyone who unsubscribed (so they start seeing ads again).

### 1.6 Cron job

**Create** `apps/web/app/api/cron/sync-exclusion-audiences/route.ts`

- Schedule: every 15 minutes (add to `vercel.json`)
- Auth: `CRON_SECRET` (same pattern as `app/api/cron/pixel-forwarding/route.ts`)
- Processes up to 20 profiles per run
- Once daily: runs full re-sync for unsubscribe handling

### 1.7 Extend pixel settings API

**Modify** `apps/web/app/api/dashboard/pixels/route.ts`

- Add `facebookAdAccountId` to PUT validation schema and GET response
- Not sensitive (it's `act_XXXXX`), no encryption needed

### 1.8 Retargeting audience API

**Create** `apps/web/app/api/dashboard/retargeting/audience/route.ts`

- `GET` — returns exclusion audience status (synced/error/member count/last sync)
- `POST` — creates the `fbCustomAudiences` row, sets status to `pending`
- `DELETE` — deletes audience on Facebook + removes local row

### 1.9 Entitlements gate

**Modify** `apps/web/lib/stripe/config.ts` — add `canUseRetargeting: true` to Growth, `false` to Free/Pro

**Modify** `apps/web/lib/entitlements/server.ts` + `apps/web/types/index.ts` — include `canUseRetargeting`

### Phase 1 file summary

| New Files | Purpose |
|-----------|---------|
| `lib/db/schema/retargeting.ts` | `fbCustomAudiences` table |
| `lib/facebook/marketing-api.ts` | Marketing API wrapper |
| `lib/facebook/hashing.ts` | SHA-256 hashing for Facebook |
| `lib/facebook/audience-sync.ts` | Sync service |
| `app/api/cron/sync-exclusion-audiences/route.ts` | Cron job |
| `app/api/dashboard/retargeting/audience/route.ts` | Dashboard API |

| Modified Files | Change |
|----------------|--------|
| `lib/db/schema/pixels.ts` | Add `facebookAdAccountId` column |
| `lib/db/schema/index.ts` | Export retargeting schema |
| `app/api/dashboard/pixels/route.ts` | Accept/return ad account ID |
| `lib/stripe/config.ts` | `canUseRetargeting` entitlement |
| `lib/entitlements/server.ts` | Resolve new entitlement |
| `types/index.ts` | Add to `UserEntitlements` |
| `vercel.json` | Add cron schedule |

---

## Phase 2: Dashboard UI + Campaign Creation

**Pure code. No Facebook approval.** Submit Meta App Review for OAuth in parallel.

### 2.1 Retargeting settings page

**Create** `apps/web/app/app/(shell)/settings/retargeting/page.tsx`

Follow pattern from `settings/ad-pixels/page.tsx`:
- Facebook Ad Account ID input (reuses existing pixel config pattern)
- Exclusion audience status card (sync state, member count, last sync time)
- Token permission indicator (test with a lightweight Marketing API call)

### 2.2 "Set It and Forget It" budget picker

**Create** `apps/web/components/dashboard/retargeting/RetargetingActivator.tsx`

Simple UI:
- Three budget buttons: **$1/day** / **$5/day** / **$10/day**
- One-click activate: selects budget → Jovie handles everything else
- Status card showing: active/paused, daily budget, impressions, clicks, spend to date
- Pause/resume toggle
- "Change budget" dropdown to switch tiers

### 2.3 Ad account validation endpoint

**Create** `apps/web/app/api/dashboard/retargeting/validate/route.ts`

Validates:
1. Token has `ads_management` on the given ad account
2. Ad account has a valid payment method (required for campaigns to run)
3. Website visitors Custom Audience exists from pixel events (the retargetable pool)

### 2.4 Campaign service — auto-generation

**Create** `apps/web/lib/facebook/campaign-service.ts`

| Function | Facebook Endpoint | What it does |
|----------|-------------------|-------------|
| `createRetargetingCampaign()` | `POST /act_{id}/campaigns` | Objective: `OUTCOME_TRAFFIC` |
| `createAdSet()` | `POST /act_{id}/adsets` | Targeting: website visitors audience. **Exclusion: subscriber audience.** Daily budget from artist's tier selection. |
| `createAdCreative()` | `POST /act_{id}/adcreatives` | Auto-generated from artist's profile photo + name + Jovie link |
| `createAd()` | `POST /act_{id}/ads` | Links creative to ad set |
| `updateCampaignBudget()` | `POST /{campaign_id}` | When artist changes budget tier |
| `pauseCampaign()` / `resumeCampaign()` | `POST /{campaign_id}` | Toggle campaign status |

**Auto-generated creative:**
- **Image:** Artist's profile photo (already stored)
- **Headline:** Artist's display name
- **Body:** "Check out {artist name}'s latest music" (or similar template)
- **CTA:** "Learn More" → links to artist's Jovie profile URL
- **No artist input needed.** The ad creative is auto-built from existing profile data.

Campaign is created and **immediately activated** (not paused) — since the artist explicitly clicked a budget and the whole point is "forget about it."

### 2.5 Campaign schema + API

**Add to** `lib/db/schema/retargeting.ts`:

`retargetingCampaigns` table:
- `id`, `creatorProfileId`
- Facebook IDs: `facebookCampaignId`, `facebookAdSetId`, `facebookAdId`, `facebookCreativeId`
- `dailyBudgetTier` (enum: `$1` / `$5` / `$10`)
- `dailyBudgetCents` (100 / 500 / 1000)
- `status` (active / paused / error)
- Performance snapshots: `impressions`, `clicks`, `spendCents`
- `createdAt`, `updatedAt`

**Create** `app/api/dashboard/retargeting/campaign/route.ts`:
- `POST` — pick budget tier → auto-create full campaign on Facebook → activate
- `PATCH` — change budget tier or pause/resume
- `DELETE` — pause + archive campaign
- `GET` — return campaign status + performance stats

### 2.6 Campaign stats cron

**Create** `app/api/cron/sync-campaign-stats/route.ts` — hourly, pulls impressions/clicks/spend from Facebook Insights API, updates `retargetingCampaigns` performance snapshots

### Billing model

Campaigns run on the **artist's own Facebook Ad Account**. Facebook charges the artist's card on file directly. Jovie gates retargeting as a Growth-tier feature ($99/mo) but does not intermediate on ad spend money at all.

---

## Phase 3: OAuth Flow (Requires Meta App Review)

**Code can be built in parallel. Deployment blocked on Meta App Review approval.**

### What requires approval

Jovie needs to register a Meta Business App and request Advanced Access for `ads_management` scope. This allows any Facebook user (not just app developers) to click "Connect Facebook" and grant Jovie permission to manage their ads.

**Meta App Review process:**
- Submit via Meta Developer Dashboard
- Requires: app description, screencast demo, privacy policy, data handling explanation
- Timeline: **2-6 weeks** typically
- Also requires **Business Verification** (upload business docs)

### 3.1 OAuth login flow

**Create** `app/api/auth/facebook/route.ts` (initiate) + `app/api/auth/facebook/callback/route.ts` (callback)

Scopes: `ads_management`, `ads_read`
Token exchange → long-lived token (60 days) → store encrypted in `creatorPixels`

### 3.2 Token refresh cron

**Create** `app/api/cron/refresh-fb-tokens/route.ts` — daily, refreshes tokens expiring within 7 days

### 3.3 Environment variables

Add to `lib/env-server-schema.ts`: `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`

---

## Error Handling

| Facebook Error | Response |
|---------------|----------|
| Error 17 (rate limit) | Exponential backoff, retry in next cron cycle |
| Error 190 (invalid/expired token) | Mark audience as `error`, surface in dashboard |
| Error 2635 (audience too small, <20) | Show "needs more subscribers" message |
| Error 100 (invalid parameter) | Log full request/response, show generic error |
| Network timeout | Same `AbortController` pattern as existing CAPI forwarder |

**Unsubscribe edge case:** When someone unsubscribes, they're *removed* from the exclusion audience so they start seeing ads again. Daily full-sync handles this.

**Privacy:** Emails/phones are SHA-256 hashed before leaving Jovie's servers. Hashed values computed on-the-fly, not stored locally.

---

## Verification Plan

1. **Unit tests:** Hashing functions produce correct SHA-256 output per Facebook spec. Marketing API wrapper constructs correct payloads. Audience sync handles cursor logic, batching, and error states.
2. **Integration test:** Create a test Custom Audience in Facebook sandbox, upload hashed data, verify audience populates.
3. **E2E manual test:** Configure a test artist profile with Facebook Ad Account → trigger audience sync → verify audience appears in Facebook Ads Manager → create a campaign with exclusion → verify excluded subscribers don't see ads.
4. **Cron validation:** Verify sync runs on schedule, handles empty subscriber lists, skips profiles without valid config.
