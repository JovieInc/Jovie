# API Route Map

> **Question this answers:** "Does an API endpoint already exist for X? What auth does it need?"
>
> For route creation patterns, see [AGENTS.md — File Creation Patterns](../AGENTS.md).

## Auth Legend

| Code | Meaning |
|------|---------|
| `public` | No authentication required |
| `auth` | Clerk `auth()` — requires authenticated user |
| `admin` | Requires admin role via `getCurrentUserEntitlements()` |
| `cron` | `CRON_SECRET` bearer token |
| `webhook` | Provider-specific signature verification |

---

## Routes by Domain

### Account

| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| `/api/account/delete` | POST | `auth` | Delete user account |
| `/api/account/email` | GET | `auth` | Get user email |
| `/api/account/export` | GET | `auth` | Export user data |

### Actions

| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| `/api/v1/actions` | GET | `auth` | Read-only canonical Actions discovery. Resolves advisory capabilities for the four stable action IDs against an owned profile. No writes. |

### External Operational Contracts

These handlers intentionally have no in-repo HTTP caller. Their callers are
sibling deployments, machine publishers, or source-repository automation.

| Route | Methods | Auth | External Caller / Description |
|-------|---------|------|-------------------------------|
| `/api/hud/hermes-events` | GET, POST | HUD auth (GET); `HERMES_HUD_API_KEY` bearer (POST) | Hermes laptop publisher writes Agent OS events; HUD clients read the current feed |
| `/api/ovie/certifications/metrics` | GET | Ovie principal + Summer control | Ovie/Summer certification clients use the shared Ovie route projection |
| `/api/ovie/ingest` | POST | Ovie principal + Summer control | Ovie/Summer clients submit durable operating-store dumps through the shared Ovie route projection |
| `/api/internal/ovie/lyb-mrr` | GET | `CRON_SECRET` + trusted origin | Ovie and Summer company tools read the LogYourBody RevenueCat MRR record |
| `/api/internal/release-communications/merge-events` | POST | HMAC `x-jovie-signature-256` | Source-repository merge automation submits verified release events |

### Admin

| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| `/api/admin/batch-ingest` | POST | `admin` | Batch ingest creator profiles |
| `/api/admin/campaigns/invites` | GET, POST | `admin` | Campaign invite management |
| `/api/admin/campaigns/settings` | GET, PUT | `admin` | Campaign settings |
| `/api/admin/campaigns/stats` | GET | `admin` | Campaign statistics |
| `/api/admin/creator-avatar` | POST | `admin` | Upload creator avatar |
| `/api/admin/creator-ingest` | POST | `admin` | Single creator ingestion |
| `/api/admin/creator-ingest/rerun` | POST | `admin` | Rerun failed ingestion |
| `/api/admin/creator-invite` | POST | `admin` | Send creator claim invite |
| `/api/admin/creator-invite/bulk` | POST | `admin` | Bulk send claim invites |
| `/api/admin/creator-invite/bulk/stats` | GET | `admin` | Bulk invite statistics |
| `/api/admin/creator-social-links` | GET | `admin` | Get creator social links |
| `/api/admin/creators` | GET | `admin` | List/search creators |
| `/api/admin/feedback` | GET | `admin` | List user feedback |
| `/api/admin/feedback/[id]/dismiss` | POST | `admin` | Dismiss feedback item |
| `/api/admin/fit-scores` | GET | `admin` | Get creator fit scores |
| `/api/admin/impersonate` | POST | `admin` | Start admin impersonation |
| `/api/admin/investors/links` | GET, POST | `admin` | Investor link management |
| `/api/admin/investors/links/[id]` | PUT, DELETE | `admin` | Update/delete investor link |
| `/api/admin/investors/settings` | GET, PUT | `admin` | Investor portal settings |
| `/api/admin/leads` | GET | `admin` | List leads |
| `/api/admin/leads/[id]` | GET, PUT | `admin` | Get/update lead |
| `/api/admin/leads/[id]/dm-sent` | POST | `admin` | Mark lead DM sent |
| `/api/admin/leads/[id]/skip` | POST | `admin` | Skip lead |
| `/api/admin/leads/discover` | POST | `admin` | Discover new leads |
| `/api/admin/leads/keywords` | GET, POST | `admin` | Discovery keywords |
| `/api/admin/leads/qualify` | POST | `admin` | Qualify leads |
| `/api/admin/leads/seed` | POST | `admin` | Seed leads |
| `/api/admin/leads/settings` | GET, PUT | `admin` | Lead pipeline settings |
| `/api/admin/outreach` | GET, POST | `admin` | Outreach management |
| `/api/admin/outreach/debug` | GET | `admin` | Debug outreach |
| `/api/admin/outreach/settings` | GET | `admin` | Outreach settings |
| `/api/admin/overview` | GET | `admin` | Admin dashboard overview metrics |
| `/api/admin/roles` | GET, POST | `admin` | Role management |
| `/api/admin/screenshots/[filename]` | GET | `admin` | Serve screenshot file |
| `/api/admin/users` | GET | `admin` | List users |
| `/api/admin/test-user/set-plan` | POST | `admin` | Deprecated admin namespace endpoint (returns 410; use `/api/dev/test-user/set-plan`) |
| `/api/admin/waitlist` | GET, POST | `admin` | Waitlist management |

### Apple Music

| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| `/api/apple-music/search` | GET | `auth` | Search Apple Music catalog |

### Apple Wallet

| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| `/api/wallet/apple/profile-pass` | GET | `auth` | Generate and return the current user's Jovie Profile `.pkpass` |
| `/api/wallet/apple/v1/devices/[deviceLibraryIdentifier]/registrations/[passTypeIdentifier]` | GET | Pass auth token | Return changed serial numbers for registered Wallet passes |
| `/api/wallet/apple/v1/devices/[deviceLibraryIdentifier]/registrations/[passTypeIdentifier]/[serialNumber]` | POST, DELETE | Pass auth token | Register or unregister a device for pass updates |
| `/api/wallet/apple/v1/passes/[passTypeIdentifier]/[serialNumber]` | GET | Pass auth token | Return the latest signed Wallet pass bundle |
| `/api/wallet/apple/v1/log` | POST | `public` | Receive Apple Wallet client logs with public rate limiting |

### Artist

| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| `/api/artist/theme` | GET, PUT | `auth` | Get/update artist theme |
| `/api/v1` | GET | `public` | Stable, non-enumerating capability index for the anonymous read-only artist API; lifecycle Link only |
| `/api/v1/[username]` | GET | `public` | Public read-only artist profile with releases, events, merch, durable 100/min/IP artist-profile limit, RateLimit headers, and typed 429/503 paths |
| `/api/v1/openapi.json` | GET | `public` | Canonical OpenAPI 3.1 contract for the public artist API |
| `/openapi.json` | GET | `public` | Conventional discovery surface; identical contract to `/api/v1/openapi.json` |

### Audience

| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| `/api/audience/click` | POST | `public` | Track link click |
| `/api/audience/opt-in` | POST | `public` | Fan opt-in to notifications |
| `/api/audience/unsubscribe` | GET, POST | `public` | Unsubscribe from notifications |
| `/api/audience/visit` | POST | `public` | Track profile visit |
| `/s/[code]` | GET | `public` | Track source link or QR scan and redirect |

### Analytics

| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| `/api/analytics/navigation` | POST, GET | `auth` (POST), `admin` (GET) | Rate-limited, aggregate-only app navigation telemetry writes; privacy-suppressed admin baseline reads |

### Billing

| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| `/api/billing/health` | GET | `public` liveness; detail is `admin` or `CRON_SECRET` | Anonymous callers get `{healthy, timestamp}` only. Full sync metrics require an admin session or `Authorization: Bearer ${CRON_SECRET}` |
| `/api/billing/history` | GET | `auth` | Payment history |
| `/api/billing/status` | GET | `auth` | Current subscription status |

### Calendar

| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| `/api/calendar/[eventId]` | GET | `public` | Get calendar event ICS file |

### Canvas

| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| `/api/canvas/generate` | POST | `auth` | Generate Spotify Canvas video |

### Changelog

| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| `/api/changelog/subscribe` | POST | `public` | Subscribe to changelog emails |
| `/api/changelog/unsubscribe` | GET | `public` | Unsubscribe from changelog |
| `/api/changelog/verify` | GET | `public` | Verify changelog subscription |

### Chat

| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| `/api/chat` | POST | `auth` | Send chat message to AI assistant |
| `/api/chat/confirm-edit` | POST | `auth` | Confirm AI-suggested profile edit |
| `/api/chat/confirm-link` | POST | `auth` | Confirm AI-suggested link add; optional `expectedVersion` enforces CAS, success returns `version`, stale writes return 409 `VERSION_CONFLICT` |
| `/api/chat/confirm-remove-link` | POST | `auth` | Confirm AI-suggested link removal |
| `/api/chat/conversations` | GET, POST | `auth` | List/create conversations |
| `/api/chat/conversations/[id]` | GET, DELETE | `auth` | Get/delete conversation |
| `/api/chat/conversations/[id]/messages` | GET | `auth` | Get conversation messages |
| `/api/chat/usage` | GET | `auth` | Get chat usage stats |
| `/api/mobile/v1/eyes-free-capture` | POST | mobile session | Closed-destination eyes-free capture. `jovie` runs the existing creative chat turn; `summer` is founder-only via the OV admin gate. Idempotent on `clientTurnId`. |

### Clerk

| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| `/api/clerk/webhook` | POST | `webhook` | Clerk user lifecycle webhooks |

### Create Tip Intent

| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| `/api/create-tip-intent` | POST | `public` | Create Stripe payment intent for tip |

### Creator

| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| `/api/creator` | GET | `auth` | Get current user's creator profile |

### Cron

> See [docs/CRON_REGISTRY.md](./CRON_REGISTRY.md) for full schedule and details.

| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| `/api/cron/billing-reconciliation` | GET | `cron` | Reconcile billing records |
| `/api/cron/cleanup-idempotency-keys` | GET | `cron` | Purge expired idempotency keys |
| `/api/cron/cleanup-photos` | GET | `cron` | Remove orphaned photo uploads |
| `/api/cron/daily-maintenance` | GET | `cron` | Daily maintenance tasks |
| `/api/cron/data-retention` | GET | `cron` | Enforce data retention policies |
| `/api/cron/frequent` | GET | `cron` | High-frequency recurring tasks |
| `/api/cron/generate-insights` | GET | `cron` | Generate AI insights for creators |
| `/api/cron/pixel-forwarding` | GET | `cron` | Forward queued pixel events |
| `/api/cron/process-campaigns` | GET | `cron` | Process pending campaigns |
| `/api/cron/process-merch-fulfillment` | GET | `cron` | Submit paid merch orders to Printful idempotently |
| `/api/cron/process-ingestion-jobs` | GET | `cron` | Process creator ingestion queue |
| `/api/cron/process-pre-saves` | GET | `cron` | Process pre-save conversions |
| `/api/cron/purge-pixel-ips` | GET | `cron` | Purge stored pixel IP addresses |
| `/api/cron/schedule-release-notifications` | GET | `cron` | Schedule upcoming release notifications |
| `/api/cron/send-release-notifications` | GET | `cron` | Send queued release notifications |
| `/api/cron/web-ai-health` | GET | `cron` | Probe five production AI surfaces and return a redacted health receipt |

### Dashboard

| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| `/api/dashboard/activity/recent` | GET | `auth` | Recent activity feed |
| `/api/dashboard/ai-crawlers` | GET | `auth` | AI crawler analytics (Pro detail; free users get teaser counts) |
| `/api/dashboard/analytics` | GET | `auth` | Analytics overview |
| `/api/dashboard/audience/members` | GET | `auth` | Audience member list |
| `/api/dashboard/audience/source-groups` | GET, POST | `auth` | Audience source group management |
| `/api/dashboard/audience/source-groups/[id]` | PATCH | `auth` | Update audience source group |
| `/api/dashboard/audience/source-links` | POST | `auth` | Create trackable source or QR link |
| `/api/dashboard/audience/source-links/[id]` | PATCH | `auth` | Update trackable source or QR link |
| `/api/dashboard/audience/subscribers` | GET | `auth` | Subscriber list |
| `/api/dashboard/contacts` | GET, POST | `auth` | Contact management |
| `/api/dashboard/earnings` | GET | `auth` | Earnings overview |
| `/api/dashboard/pixels` | GET, POST | `auth` | Pixel management |
| `/api/dashboard/pixels/health` | GET | `auth` | Pixel health check |
| `/api/dashboard/pixels/test-event` | POST | `auth` | Send test pixel event |
| `/api/dashboard/profile` | GET, PUT | `auth` | GET returns `{ profile }` (the web query adapter also accepts the legacy raw-profile response and normalizes its cache); PUT requires canonical `profileId` with no active-profile fallback, accepts optional integer `expectedVersion`, returns `profile.profileEditVersion`, and returns 409 `VERSION_CONFLICT` for stale writes |
| `/api/dashboard/profile/create` | POST | `auth` | Create an additional artist profile (displayName + username); wraps `createAdditionalProfile` |
| `/api/dashboard/profile/switch` | POST | `auth` | Switch the active artist profile by `profileId`; wraps `switchActiveProfile` |
| `/api/dashboard/releases/artwork-downloads` | POST | `auth` | Toggle allow-artwork-downloads for the active profile |
| `/api/dashboard/releases/[releaseId]/analytics` | GET | `auth` | Release analytics |
| `/api/dashboard/releases/[releaseId]/pitch` | POST | `auth` | Generate release pitch |
| `/api/dashboard/releases/[releaseId]/tracks` | GET | `auth` | Release tracks |
| `/api/dashboard/shop` | GET, POST | `auth` | Shop management |
| `/api/dashboard/social-links` | GET, POST, PUT, PATCH, DELETE | `auth` | Social link CRUD; PUT/PATCH/DELETE accept optional `expectedVersion`, success returns `version`, stale writes return 409 `VERSION_CONFLICT` |
| `/api/dashboard/tour-dates/[id]/analytics` | GET | `auth` | Tour date analytics |

### Dev

| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| `/api/dev/clear-session` | POST | `auth` | Clear dev session |
| `/api/dev/test-user/set-plan` | POST | `auth` | Test-user-only plan switching for E2E in non-production |
| `/api/dev/unwaitlist` | POST | `auth` | Remove from waitlist in dev |

### DSP

| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| `/api/dsp/bio-sync` | GET, POST | `auth` | List bio sync providers or trigger bio sync |
| `/api/dsp/discover` | POST | `auth` | Trigger DSP artist discovery for cross-platform matching |
| `/api/dsp/enrichment/status` | GET | `auth` | Get DSP enrichment status for a profile |
| `/api/dsp/matches` | GET | `auth` | List DSP artist match suggestions |
| `/api/dsp/matches/[id]/confirm` | POST | `auth` | Confirm a DSP artist match |
| `/api/dsp/matches/[id]/reject` | POST | `auth` | Reject a DSP artist match |

### YouTube Library

| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| `/api/youtube-library/links/[id]/approve` | POST | `auth` | Approve a pending ISRC release link (owner only) |
| `/api/youtube-library/links/[id]/reject` | POST | `auth` | Reject a pending ISRC release link with a reason (owner only) |
| `/api/youtube-library/videos/[videoId]/optimization` | GET | `auth` | Evidence-backed YouTube thumbnail, metric, and experiment snapshot |

### Email

| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| `/api/email/track/click` | GET | `public` | Email click tracking redirect |
| `/api/email/track/open` | GET | `public` | Email open tracking pixel |

### Featured Creators

| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| `/api/featured-creators` | GET | `public` | Get featured creator profiles |

### Feedback

| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| `/api/feedback` | POST | `auth` | Submit user feedback |

### Max Access Request

| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| `/api/max-access-request` | POST | `auth` | Request Max tier access |

### Handle

| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| `/api/handle/check` | GET | `public` | Check username availability (rate limited, timing-safe) |

### Health

| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| `/api/health` | GET | `public` liveness; detail on failure is admin or `CRON_SECRET` | Success stays `{status:"ok"}`. Failure is `{healthy:false,timestamp}` unless the caller is an admin session or `Authorization: Bearer $CRON_SECRET` |
| `/api/health/auth` | GET | `public` liveness outside production; detail is admin or `CRON_SECRET` | Production returns 403 for every caller. Outside production, anonymous is `{healthy,timestamp}` and does not read the session |
| `/api/health/build-info` | GET | `public` | Build and deployment metadata |
| `/api/health/comprehensive` | GET | `public` liveness; detail is admin or `CRON_SECRET` | Anonymous `{healthy:true,timestamp}` with no DB or vendor calls. Full env/DB/system body requires admin session or `CRON_SECRET` |
| `/api/health/db` | GET | `public` liveness; detail is admin or `CRON_SECRET` | Anonymous connectivity is `{healthy,timestamp}` (200/503). Pool, config, and error strings require admin session or `CRON_SECRET` |
| `/api/health/db/performance` | GET | `public` liveness; detail is admin or `CRON_SECRET` | Anonymous is `{healthy:true,timestamp}` and does not run performance queries |
| `/api/health/deploy` | GET | `public` liveness; detail is admin or `CRON_SECRET` | Anonymous still runs env and DB checks, body is `{healthy,timestamp}`. `checks` and `issues` require admin session or `CRON_SECRET` |
| `/api/health/env` | GET | `public` liveness; detail is admin or `CRON_SECRET` | Anonymous local validation is `{healthy,timestamp}` with no error strings or integration flags |
| `/api/health/homepage` | GET | `public` liveness; detail is admin or `CRON_SECRET` | Anonymous is `{healthy:true,timestamp}` and does not fetch featured creators |
| `/api/health/keys` | GET | `public` liveness; detail is admin or `CRON_SECRET` | Anonymous is `{healthy,timestamp}` (503 when a required key is missing) with no key labels |
| `/api/health/redis` | GET | `admin` or `CRON_SECRET` | Redis write/read operability (protected to prevent quota burn) |

### HUD

| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| `/api/hud/metrics` | GET | `auth` | HUD metrics with kiosk token auth |
| `/api/hud/shipping-state` | GET | `auth` | Read-only `ovie.shipping-state.v1` Ubuntu operational-truth projection (JOV-5248). Named authority reads only. No dispatch, retry, cancel, restart, or arbitrary file/log access. |

### Images

| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| `/api/images/upload` | POST | `auth` | Upload and optimize avatar image |
| `/api/images/status/[id]` | GET | `auth` | Check image processing status |
| `/api/images/artwork/upload` | POST | `auth` | Upload release artwork |

### Insights

| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| `/api/insights` | GET | `auth` | List active AI insights for a profile |
| `/api/insights/[id]` | PATCH | `auth` | Update insight status (dismiss/acted on) |
| `/api/insights/generate` | POST | `auth` | Trigger AI insight generation |
| `/api/insights/summary` | GET | `auth` | Top-3 insights summary for dashboard widget |

### Inbox Founder Reviews

| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| `/api/inbox/founder-reviews` | GET, POST | `auth` | List or create owner-bound Inbox review receipts before a canonical decision is applied |
| `/api/inbox/founder-reviews/upload-token` | POST | `auth` / signed Blob callback | Issue a private-audio upload token and record its expiring cleanup lease on completion |
| `/api/inbox/founder-reviews/[id]/media` | GET, DELETE | `auth` | Stream byte ranges from retained private audio or delete it from an owned receipt |
| `/api/inbox/founder-reviews/[id]/outcome` | PATCH | `auth` | Record a failed canonical action or verify an applied outcome against owned suggested-action state |

### Investors

| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| `/investor-portal/events` | POST | `investor cookie` | Persist allowlisted investor engagement to investor activity without exposing the token |
| `/api/investors/track` | POST | `public` | Record investor page view heartbeat |

### Link

| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| `/api/link/[id]` | POST | `public` | Generate time-limited signed URL for sensitive links |

### Library Documents

| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| `/api/library/documents` | GET, POST | `auth` | Cursor-page private ideas/scripts or capture an idempotent private idea |
| `/api/library/documents/[id]` | PATCH | `auth` | Save an immutable rich-text document revision with optimistic concurrency |
| `/api/library/documents/[id]/claims` | POST | `auth` | Attach a sourced evidence claim to the current private revision |
| `/api/library/documents/[id]/review` | POST | `auth` | Freeze factual evidence for the exact current script revision |
| `/api/library/documents/[id]/approve` | POST | `auth` (owner) | Approve and hand off the exact reviewed script revision for capture |
| `/api/library/relationships` | POST, DELETE | `auth` | Confirm or remove merch-in-video library relationships |

### Library Post-Release

| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| `/api/library/post-release` | GET | `auth` | Load attested downloads, presence findings, observed rightsholders, provider connection state, and running Library experiments for an owned profile |
| `/api/library/post-release` | PATCH | `auth` | Apply a local presence action (draft repair, collision disposition, or direct update) without sending outbound requests. Missing findings return 404; invalid or terminal transitions return 409 |

### Merch

| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| `/api/merch/checkout` | POST | `public` | Create a Stripe Checkout session for a live Jovie merch card |
| `/{username}/merch/{cardId}` | GET | `public` | Public merch product page with mockups, size/quantity selection, and checkout |

### Mobile

| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| `/api/mobile/v1/push-devices` | PUT, DELETE | mobile session | Register or remove the signed-in user's encrypted APNs device token. |

### Notifications

| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| `/api/notifications/confirm` | GET | `public` | Confirm email subscription (double opt-in) |
| `/api/notifications/preferences` | PATCH | `public` | Update fan notification preferences |
| `/api/notifications/status` | POST | `public` | Check notification subscription status |
| `/api/notifications/subscribe` | POST | `public` | Subscribe to artist release notifications |
| `/api/notifications/unsubscribe` | POST | `public` | Unsubscribe from artist notifications |
| `/api/notifications/update-name` | PATCH | `public` | Update subscriber display name |
| `/api/notifications/verify-email-otp` | POST | `public` | Verify email OTP for notification subscription |

### Ovie

| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| `/api/ovie/summer/reconcile` | GET | `auth` + founder UUID | Reconcile the one source-bound Summer recovery event through a server-signed Eve GET, then idempotently persist only an exact completed result. Accepts no event or deployment input and exposes no mutating handler. |
| `/api/ovie/summer` | GET, POST | `admin` | Founder Mac lander: list/claim/complete/fail Eve-bound current-Summer turns. |

### Pixel

| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| `/api/px` | GET | `public` | Pixel tracking endpoint |

### Pre-Save

| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| `/api/pre-save/apple` | POST | `auth` | Submit Apple Music pre-save |
| `/api/pre-save/spotify/callback` | GET | `public` | Handle Spotify OAuth callback |

### Profile

| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| `/api/profile/view` | POST | `public` | Increment profile view count (bot-filtered) |

### Revalidate

| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| `/api/revalidate/featured-creators` | POST | `cron` | Revalidate featured creators cache |

### Search

| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| `/api/search/header` | GET | `auth` | Per-user rate-limited search of the active profile's releases with standard rate-limit headers/429, validated input, a five-result cap, and a minimal result shape |

### Sentry

| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| `/api/sentry-example-api` | GET | `public` | Sentry test endpoint (dev only) |

### Stripe

| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| `/api/stripe/cancel` | POST | `auth` | Cancel subscription |
| `/api/stripe/checkout` | POST, GET | `auth` | Create checkout session / get status |
| `/api/stripe/plan-change` | POST, GET, DELETE | `auth` | Change, preview, or cancel plan change |
| `/api/stripe/plan-change/preview` | POST, GET | `auth` | Preview plan change proration |
| `/api/stripe/portal` | POST, GET | `auth` | Create/get Stripe customer portal session |
| `/api/stripe/pricing-options` | GET | `auth` | Get available pricing options |
| `/api/stripe/webhooks` | POST | `webhook` | Stripe subscription webhooks |

### Spotify

| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| `/api/spotify/search` | GET | `auth` | Search Spotify artists |

### Stripe Connect

| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| `/api/stripe-connect/disconnect` | POST | `auth` | Disconnect Stripe Connect account |
| `/api/stripe-connect/onboard` | POST | `auth` | Create Connect account and return onboarding URL |
| `/api/stripe-connect/return` | GET | `auth` | Handle Connect onboarding return redirect |
| `/api/stripe-connect/status` | GET | `auth` | Get Connect connection status |

### Suggestions

| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| `/api/suggestions` | GET | `auth` | List pending profile suggestions |
| `/api/suggestions/avatars/[id]/dismiss` | POST | `auth` | Dismiss avatar suggestion |
| `/api/suggestions/avatars/[id]/select` | POST | `auth` | Select avatar suggestion |
| `/api/suggestions/social-links/[id]/approve` | POST | `auth` | Approve social link suggestion |
| `/api/suggestions/social-links/[id]/reject` | POST | `auth` | Reject social link suggestion |

### Tips

| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| `/api/tips/create-checkout` | POST | `public` | Create Stripe Checkout for tipping |

### Track

| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| `/api/track` | POST | `public` | Track analytics event |

### Unsubscribe

| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| `/api/unsubscribe/claim-invites` | GET, POST | `public` | Unsubscribe from claim invite emails via signed token |

### Verification

| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| `/api/verification/request` | POST | `auth` | Request artist identity verification |

### Waitlist

| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| `/api/waitlist` | GET, POST | `auth` | Get waitlist status or join |

### Webhooks

| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| `/api/webhooks/linear` | POST | `webhook` | Linear issue updates |
| `/api/webhooks/resend` | POST | `webhook` | Resend delivery events |
| `/api/webhooks/resend-inbound` | POST | `webhook` | Resend inbound email |
| `/api/webhooks/sentry` | POST | `webhook` | Sentry issue alerts |
| `/api/webhooks/printful` | POST | `webhook` | Printful merch fulfillment status updates |
| `/api/webhooks/stripe-connect` | POST | `webhook` | Stripe Connect events |
| `/api/webhooks/stripe-merch` | POST | `webhook` | Stripe merch Checkout and refund events |
| `/api/webhooks/stripe-tips` | POST | `webhook` | Stripe tip payment events |

### Wrap Link

| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| `/api/wrap-link` | POST | `auth` | Create wrapped tracking link |

---

## Summary

| Auth Type | Route Count |
|-----------|-------------|
| `admin` | ~38 |
| `auth` | ~66 |
| `public` | ~35 |
| `cron` | ~17 |
| `webhook` | ~9 |
| **Total** | **~164** |
