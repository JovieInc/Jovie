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
| `/api/admin/ingestion-health` | GET | `admin` | Ingestion pipeline health |
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

### Artist

| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| `/api/artist/theme` | GET, PUT | `auth` | Get/update artist theme |

### Audience

| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| `/api/audience/click` | POST | `public` | Track link click |
| `/api/audience/opt-in` | POST | `public` | Fan opt-in to notifications |
| `/api/audience/unsubscribe` | GET, POST | `public` | Unsubscribe from notifications |
| `/api/audience/visit` | POST | `public` | Track profile visit |
| `/s/[code]` | GET | `public` | Track source link or QR scan and redirect |

### Billing

| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| `/api/billing/health` | GET | `auth` | Billing system health check |
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

### Capture Tip

| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| `/api/capture-tip` | POST | `public` | Capture completed tip payment |

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
| `/api/chat/confirm-link` | POST | `auth` | Confirm AI-suggested link add |
| `/api/chat/confirm-remove-link` | POST | `auth` | Confirm AI-suggested link removal |
| `/api/chat/conversations` | GET, POST | `auth` | List/create conversations |
| `/api/chat/conversations/[id]` | GET, DELETE | `auth` | Get/delete conversation |
| `/api/chat/conversations/[id]/messages` | GET | `auth` | Get conversation messages |
| `/api/chat/usage` | GET | `auth` | Get chat usage stats |

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
| `/api/cron/process-ingestion-jobs` | GET | `cron` | Process creator ingestion queue |
| `/api/cron/process-pre-saves` | GET | `cron` | Process pre-save conversions |
| `/api/cron/purge-pixel-ips` | GET | `cron` | Purge stored pixel IP addresses |
| `/api/cron/schedule-release-notifications` | GET | `cron` | Schedule upcoming release notifications |
| `/api/cron/send-release-notifications` | GET | `cron` | Send queued release notifications |

### Dashboard

| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| `/api/dashboard/activity/recent` | GET | `auth` | Recent activity feed |
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
| `/api/dashboard/profile` | GET, PUT | `auth` | Profile data |
| `/api/dashboard/releases/[releaseId]/analytics` | GET | `auth` | Release analytics |
| `/api/dashboard/releases/[releaseId]/pitch` | POST | `auth` | Generate release pitch |
| `/api/dashboard/releases/[releaseId]/tracks` | GET | `auth` | Release tracks |
| `/api/dashboard/retargeting/attribution` | GET | `auth` | Retargeting attribution data |
| `/api/dashboard/shop` | GET, POST | `auth` | Shop management |
| `/api/dashboard/social-links` | GET, POST, PUT, DELETE | `auth` | Social link CRUD |
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
| `/api/dsp/bio-sync/status` | GET | `auth` | Get bio sync job status |
| `/api/dsp/discover` | POST | `auth` | Trigger DSP artist discovery for cross-platform matching |
| `/api/dsp/enrichment/status` | GET | `auth` | Get DSP enrichment status for a profile |
| `/api/dsp/matches` | GET | `auth` | List DSP artist match suggestions |
| `/api/dsp/matches/[id]/confirm` | POST | `auth` | Confirm a DSP artist match |
| `/api/dsp/matches/[id]/reject` | POST | `auth` | Reject a DSP artist match |

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
| `/api/health` | GET | `public` | Basic health check |
| `/api/health/auth` | GET | `public` | Auth system health |
| `/api/health/build-info` | GET | `public` | Build and deployment metadata |
| `/api/health/comprehensive` | GET | `public` | Full health check (DB, Redis, Stripe, etc.) |
| `/api/health/db` | GET | `public` | Database connectivity |
| `/api/health/db/performance` | GET | `public` | Database performance metrics |
| `/api/health/deploy` | GET | `public` | Deployment status and version |
| `/api/health/env` | GET | `public` | Environment variable presence check |
| `/api/health/homepage` | GET | `public` | Homepage rendering health |
| `/api/health/keys` | GET | `public` | Cryptographic key health |
| `/api/health/redis` | GET | `public` | Redis connectivity |

### HUD

| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| `/api/hud/metrics` | GET | `auth` | HUD metrics with kiosk token auth |

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

### Investors

| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| `/api/investors/track` | POST | `public` | Record investor page view heartbeat |

### Link

| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| `/api/link/[id]` | POST | `public` | Generate time-limited signed URL for sensitive links |

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

### Pixel

| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| `/api/px` | GET | `public` | Pixel tracking endpoint |

### Pre-Save

| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| `/api/pre-save/apple` | POST | `auth` | Submit Apple Music pre-save |
| `/api/pre-save/spotify/start` | GET | `public` | Initiate Spotify OAuth for pre-save |
| `/api/pre-save/spotify/callback` | GET | `public` | Handle Spotify OAuth callback |

### Profile

| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| `/api/profile/view` | POST | `public` | Increment profile view count (bot-filtered) |

### Referrals

| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| `/api/referrals/apply` | POST | `auth` | Apply a referral code |
| `/api/referrals/code` | GET, POST | `auth` | Get or generate referral code |
| `/api/referrals/stats` | GET | `auth` | Get referral statistics and earnings |

### Revalidate

| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| `/api/revalidate/featured-creators` | POST | `cron` | Revalidate featured creators cache |

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
| `/api/webhooks/stripe-connect` | POST | `webhook` | Stripe Connect events |
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
| `auth` | ~62 |
| `public` | ~33 |
| `cron` | ~15 |
| `webhook` | ~7 |
| **Total** | **~155** |
