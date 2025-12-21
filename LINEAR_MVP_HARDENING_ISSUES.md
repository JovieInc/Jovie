# MVP Flow Hardening - Linear Issues

> **Generated**: 2024-12-21
> **Purpose**: Systematically identify and harden all MVP-critical user flows
> **Owner**: Codex Agent
> **Status**: Ready for Linear Import

---

## Overview

This document contains specifications for Linear issues covering all MVP-critical flows that require hardening before production launch. Each issue follows a consistent structure with scope, hardening requirements, and testable definitions of done.

**Common Tags Applied to All Issues**:
- `mvp-core`
- `flow-hardening`

---

## Issue 1: Authentication Flow Hardening

### Title
`[Auth] Harden Email OTP Sign-In/Sign-Up Flow`

### Tags
`mvp-core`, `flow-hardening`, `auth`, `security`

### Priority
**P0 - Critical**

### Description

#### What the User is Trying to Accomplish
Users sign in or create an account using email-based OTP (one-time password) authentication. This flow is the gateway to all authenticated functionality in Jovie.

#### Entry Points
- `/signin` - Email OTP sign-in page
- `/signup` - Email OTP sign-up page
- `proxy.ts` - Middleware handling auth redirects

#### Exit Points
- Successful auth → `/onboarding` (new users) or `/app/dashboard/overview` (returning users)
- Failed auth → Error message on sign-in page

#### Key Files
- `/app/(auth)/signin/page.tsx`
- `/app/(auth)/signup/page.tsx`
- `/components/auth/OtpSignInForm.tsx`
- `/components/auth/OtpSignUpForm.tsx`
- `/lib/auth/session.ts`
- `/lib/onboarding/rate-limit.ts`
- `/app/api/clerk/webhook/route.ts`
- `/proxy.ts`

### Scope of Hardening

#### 1. Rate Limiting Persistence (CRITICAL)
- **Current State**: In-memory rate limiter (`Map()`) - lost on restart, not shared across instances
- **Required**: Replace with Redis-backed persistent rate limiting using Upstash
- **Config**: 5 OTP attempts per email per 15 minutes, 60 requests/minute global per IP

#### 2. Redirect URL Validation (CRITICAL)
- **Current State**: Basic `startsWith('/')` check vulnerable to bypasses
- **Required**: Strict whitelist validation of allowed redirect paths
- **Blocked Patterns**: `//`, whitespace, fragments, URL encoding attacks

#### 3. Environment Variable Enforcement (CRITICAL)
- **Current State**: Clerk keys marked as `.optional()` in Zod schemas
- **Required**: Make `CLERK_SECRET_KEY` and `CLERK_WEBHOOK_SECRET` required in production

#### 4. Session Expiry & Idle Timeout (HIGH)
- **Current State**: No explicit session expiry mechanism
- **Required**: 30-minute idle timeout with 5-minute warning, configurable per environment

#### 5. OTP Attempt Rate Limiting (HIGH)
- **Current State**: No per-email OTP brute force protection
- **Required**: Track failed OTP attempts per email, lock after 5 failures for 15 minutes

#### 6. Webhook Audit Trail (HIGH)
- **Current State**: Webhook events processed but no persistent audit log
- **Required**: Log all Clerk webhook events with timestamps and outcomes

### Assumptions & Dependencies
- Upstash Redis available for persistent rate limiting
- Clerk handles token refresh internally
- Production environment variables properly configured

### Known Risks
- OTP brute force window: 6-digit code = 1M combinations in 10-minute window
- In-memory rate limiting fails at horizontal scale
- Redirect URL bypass could enable phishing attacks

### Definition of Done
- [ ] Rate limiting persists across server restarts (Redis-backed)
- [ ] Rate limits apply correctly across multiple server instances
- [ ] Redirect URL validation rejects all bypass patterns (documented test cases)
- [ ] Environment validation fails startup if Clerk keys missing in production
- [ ] Session idle timeout triggers logout after 30 minutes inactivity
- [ ] OTP attempts limited to 5 per email per 15 minutes
- [ ] All unit tests passing for validation functions
- [ ] E2E test covering failed OTP scenarios
- [ ] No silent failures - all errors surfaced to user or logged
- [ ] Security headers (CSP) tightened for auth pages

---

## Issue 2: Onboarding Flow Hardening

### Title
`[Onboarding] Harden Profile Creation & Handle Selection`

### Tags
`mvp-core`, `flow-hardening`, `data-integrity`, `infra`

### Priority
**P0 - Critical**

### Description

#### What the User is Trying to Accomplish
New users complete onboarding by entering their display name and choosing a unique Jovie handle (username). The handle becomes their public profile URL (`jov.ie/@handle`).

#### Entry Points
- `/onboarding` - Multi-step onboarding wizard
- Redirected from successful sign-up

#### Exit Points
- Successful completion → `/app/dashboard/overview`
- Failure → Error message with retry option

#### Key Files
- `/app/onboarding/page.tsx`
- `/app/onboarding/actions.ts`
- `/components/dashboard/organisms/AppleStyleOnboardingForm.tsx`
- `/app/api/handle/check/route.ts`
- `/lib/onboarding/rate-limit.ts`
- `/lib/validation/username.ts`
- `/lib/db/schema.ts` (creator_profiles table)

### Scope of Hardening

#### 1. UNIQUE Constraint on `username_normalized` (CRITICAL)
- **Current State**: NO UNIQUE constraint - only regular index exists
- **Required**: Add `UNIQUE` constraint on `creator_profiles.username_normalized`
- **Impact**: Prevents race condition where two users claim same handle simultaneously

#### 2. Persistent Rate Limiting (CRITICAL)
- **Current State**: In-memory rate limiter with 60 req/min (too high)
- **Required**: Redis-backed limiting, 3 onboarding attempts per user per hour

#### 3. Transaction Isolation (CRITICAL)
- **Current State**: Uses READ COMMITTED (allows phantom reads between SELECT and INSERT)
- **Required**: Use SERIALIZABLE isolation for profile creation transaction

#### 4. Handle Check Timing Attacks (HIGH)
- **Current State**: Different response times for available vs. taken handles
- **Required**: Constant-time responses (100ms padded), random delay injection

#### 5. Avatar Upload Reliability (MEDIUM)
- **Current State**: Fire-and-forget, silently ignores failures
- **Required**: Retry mechanism, explicit error handling, user notification

#### 6. Email Uniqueness Race Condition (MEDIUM)
- **Current State**: Email check separate from insert, race window exists
- **Required**: Include email uniqueness check within same transaction

### Assumptions & Dependencies
- PostgreSQL supports SERIALIZABLE isolation level
- Redis available for rate limiting
- Avatar upload to Cloudinary is non-blocking

### Known Risks
- Handle collision could lead to profile URL conflicts (critical for MVP)
- Non-persistent rate limiting allows brute force across server instances
- Username enumeration enables targeted attacks

### Definition of Done
- [ ] UNIQUE constraint migration deployed on `username_normalized`
- [ ] Database rejects duplicate usernames with constraint violation error
- [ ] Rate limiter uses Redis, survives server restarts
- [ ] Rate limit config reduced to 3 attempts per hour per user
- [ ] Profile creation uses SERIALIZABLE transaction isolation
- [ ] Handle check API responds in constant time (100ms ± 10ms)
- [ ] Avatar upload failures logged and user notified
- [ ] Integration test for concurrent handle claims (both should not succeed)
- [ ] No orphaned profiles created on partial failures
- [ ] Flow works end-to-end for new user in all tested scenarios

---

## Issue 3: Public Profile Flow Hardening

### Title
`[Public Profile] Harden Anonymous Profile Access & Tracking`

### Tags
`mvp-core`, `flow-hardening`, `ui`, `data-integrity`

### Priority
**P0 - Critical**

### Description

#### What the User is Trying to Accomplish
Fans access an artist's public profile page to view their bio, streaming links, social accounts, and optionally send tips. This is the primary public-facing product surface.

#### Entry Points
- `/@[username]` - Public profile URL (e.g., `jov.ie/@taylor`)
- QR code scans
- Social media bio links

#### Exit Points
- View profile content (streaming links, social accounts)
- Click through to external platforms
- Open tip modal
- 404 if profile not found

#### Key Files
- `/app/[username]/page.tsx`
- `/app/[username]/not-found.tsx`
- `/lib/db/queries.ts` (getCreatorProfileWithLinks)
- `/app/api/audience/visit/route.ts`
- `/app/api/audience/click/route.ts`
- `/app/api/audience/lib/audience-utils.ts`

### Scope of Hardening

#### 1. Rate Limiting on Public Routes (CRITICAL)
- **Current State**: No rate limiting - `checkRateLimit()` returns false globally
- **Required**:
  - Profile page: 100 requests/minute per IP
  - Click endpoint: 50 requests/minute per IP
  - Visit endpoint: 50 requests/minute per IP

#### 2. Bounded Data Retrieval (CRITICAL)
- **Current State**: No LIMIT on social links or contacts returned
- **Required**: Max 100 social links, max 50 contacts per profile

#### 3. IP Address Privacy (HIGH)
- **Current State**: IP stored in plaintext in `click_events`
- **Required**: Hash IPs before storage, keep plaintext only in session (24hr TTL)

#### 4. Profile View Counter Reliability (HIGH)
- **Current State**: Fire-and-forget increment, no error handling
- **Required**: Retry mechanism, Sentry monitoring, atomic increment

#### 5. Audience Tracking Validation (HIGH)
- **Current State**: Accept any `creatorProfileId` in request body
- **Required**: Validate profile exists AND is public before recording

#### 6. Bot Detection Enhancement (MEDIUM)
- **Current State**: Only blocks Meta crawlers on specific endpoints
- **Required**: Filter bot traffic from analytics aggregations

### Assumptions & Dependencies
- Redis available for rate limiting
- Upstash connection configured
- Profiles can have variable numbers of links

### Known Risks
- Unbounded queries could cause OOM on profiles with many links
- Unprotected tracking endpoints enable metric inflation attacks
- IP storage creates privacy/compliance risk

### Definition of Done
- [ ] Rate limiting active on all public endpoints
- [ ] Returns 429 with Retry-After header when rate limited
- [ ] Social links query includes `LIMIT 100`
- [ ] Contacts query includes `LIMIT 50`
- [ ] IP addresses hashed before storage in click_events
- [ ] Profile view increment has retry logic
- [ ] Click/visit endpoints validate profile is public
- [ ] Bot traffic filtered from analytics calculations
- [ ] 404 page branded and user-friendly
- [ ] Profile loads in <2.5 seconds for profiles with max links
- [ ] No silent failures in tracking

---

## Issue 4: Tipping/Monetization Flow Hardening

### Title
`[Tipping] Harden Payment Flow & Webhook Processing`

### Tags
`mvp-core`, `flow-hardening`, `billing`, `data-integrity`

### Priority
**P0 - Critical**

### Description

#### What the User is Trying to Accomplish
Fans send monetary tips to artists via their public profile. Artists receive payments through Stripe Connect.

#### Entry Points
- Tip button on public profile (`/@[username]`)
- `POST /api/create-tip-intent` - Creates Stripe PaymentIntent
- `POST /api/capture-tip` - Webhook handler for successful payments

#### Exit Points
- Successful payment → Tip recorded in database, artist notified
- Failed payment → Error displayed to fan
- Webhook failure → Stripe retries

#### Key Files
- `/app/api/create-tip-intent/route.ts`
- `/app/api/capture-tip/route.ts`
- `/app/api/stripe/webhooks/route.ts`
- `/lib/db/schema.ts` (tips table)
- `/components/organisms/TipSection.tsx`

### Scope of Hardening

#### 1. Refund Support (CRITICAL)
- **Current State**: Zero refund handling - no columns, no webhooks, no UI
- **Required**:
  - Add `refundedAt`, `refundAmountCents`, `status` columns to tips table
  - Handle `charge.refunded` webhook event
  - Update tip status appropriately

#### 2. Atomic Profile Lookup + Insert (CRITICAL)
- **Current State**: Separate queries - race condition if profile deleted mid-transaction
- **Required**: Wrap in database transaction with proper error handling

#### 3. Webhook Audit Trail (CRITICAL)
- **Current State**: `capture-tip` doesn't record to `stripeWebhookEvents` table
- **Required**: Record all tip-related webhook events for audit

#### 4. Idempotency Keys (HIGH)
- **Current State**: No idempotency key on payment intent creation
- **Required**: Client generates UUID idempotency key, Stripe deduplicates

#### 5. Max Retry Logic (HIGH)
- **Current State**: Returns 500 forever if profile not found
- **Required**: After 3 failures, move to dead-letter queue, stop retrying

#### 6. Charge Validation (HIGH)
- **Current State**: Loose extraction of charge object, no amount validation
- **Required**: Validate charge exists, amount > 0, amount < max ($500)

### Assumptions & Dependencies
- Stripe webhook secret configured
- Database supports transactions
- Dead-letter table/queue exists for failed webhooks

### Known Risks
- Payment captured but tip not recorded = money received but not tracked
- Refunds processed in Stripe Dashboard without app awareness
- Infinite webhook retries if profile permanently deleted

### Definition of Done
- [ ] `tips` table has `refundedAt`, `refundAmountCents`, `status` columns
- [ ] `charge.refunded` webhook updates tip status
- [ ] Profile lookup + tip insert in single transaction
- [ ] All tip webhooks recorded in `stripeWebhookEvents`
- [ ] Client sends idempotency key on tip intent creation
- [ ] Failed webhooks move to dead-letter after 3 retries
- [ ] Amount validation (min: $0.30, max: $500)
- [ ] Unit tests for refund handling
- [ ] E2E test for successful tip flow
- [ ] No orphaned payments - all captured payments recorded

---

## Issue 5: Dashboard & Link Management Flow Hardening

### Title
`[Dashboard] Harden Link CRUD & Profile Management`

### Tags
`mvp-core`, `flow-hardening`, `data-integrity`, `ui`

### Priority
**P1 - High**

### Description

#### What the User is Trying to Accomplish
Artists manage their profile from the dashboard: add/remove streaming links, edit bio, update avatar, and organize their public presence.

#### Entry Points
- `/app/dashboard/overview` - Main dashboard
- `/app/dashboard/links` - Link management
- `/app/dashboard/profile` - Profile editing
- `PUT/PATCH /api/dashboard/social-links`

#### Exit Points
- Changes saved → UI reflects updates
- Validation errors → Error messages displayed
- Concurrent edit conflict → Refresh prompt

#### Key Files
- `/app/app/dashboard/*/page.tsx`
- `/app/api/dashboard/social-links/route.ts`
- `/app/api/dashboard/profile/route.ts`
- `/components/dashboard/organisms/EnhancedDashboardLinks.tsx`
- `/components/dashboard/organisms/GroupedLinksManager.tsx`

### Scope of Hardening

#### 1. Transaction Wrapper for Link Updates (CRITICAL)
- **Current State**: DELETE and INSERT not in transaction - race condition
- **Required**: Wrap in `withDbSessionTx()` for atomic updates

#### 2. Optimistic Locking (HIGH)
- **Current State**: No version field, concurrent edits overwrite each other
- **Required**: Add `version` column, check version before update, return 409 on conflict

#### 3. Idempotency Keys (HIGH)
- **Current State**: No deduplication for retry requests
- **Required**: Accept idempotency key in request body, deduplicate in DB

#### 4. PATCH State Validation (MEDIUM)
- **Current State**: Can transition link from any state to any other
- **Required**: Only allow transitions from 'suggested' state

#### 5. Rate Limiting (MEDIUM)
- **Current State**: No limits on PUT/PATCH endpoints
- **Required**: 30 requests per minute per user

#### 6. URL Validation Enhancement (LOW)
- **Current State**: Blocks dangerous protocols, no hostname validation
- **Required**: Block localhost/internal IPs, add length limits

### Assumptions & Dependencies
- Database supports transactions
- Client implements debouncing (500ms currently)
- Version field migration can be added

### Known Risks
- DELETE + INSERT race can leave user with 0 links temporarily
- Concurrent edits from multiple tabs cause data loss
- Network failures with retries create duplicates

### Definition of Done
- [ ] Link updates wrapped in database transaction
- [ ] `version` column added to `social_links` table
- [ ] Version check on update, 409 response on mismatch
- [ ] Idempotency key accepted and checked before processing
- [ ] PATCH rejects invalid state transitions
- [ ] Rate limiting active on all dashboard endpoints
- [ ] URL validation rejects internal IPs
- [ ] Integration test for concurrent link modifications
- [ ] Client handles 409 conflict response gracefully
- [ ] No data loss under concurrent modification

---

## Issue 6: Billing/Pro Subscription Flow Hardening

### Title
`[Billing] Harden Subscription Lifecycle & Sync`

### Tags
`mvp-core`, `flow-hardening`, `billing`, `infra`

### Priority
**P1 - High**

### Description

#### What the User is Trying to Accomplish
Artists subscribe to Jovie Pro to unlock premium features (remove branding). They manage their subscription through the Stripe customer portal.

#### Entry Points
- `/billing` - Billing/pricing page
- `POST /api/stripe/checkout` - Create checkout session
- `POST /api/stripe/portal` - Access customer portal
- `POST /api/stripe/webhooks` - Stripe event handler

#### Exit Points
- Successful subscription → `isPro = true`, features unlocked
- Cancellation → `isPro = false`, features locked
- Payment failure → Downgrade to free tier

#### Key Files
- `/app/api/stripe/checkout/route.ts`
- `/app/api/stripe/portal/route.ts`
- `/app/api/stripe/webhooks/route.ts`
- `/lib/stripe/customer-sync.ts`
- `/lib/entitlements/server.ts`
- `/hooks/use-billing-status.ts`

### Scope of Hardening

#### 1. Subscription Status Reconciliation (CRITICAL)
- **Current State**: Database only updated on webhook events - can become stale
- **Required**: Background job to reconcile DB state with Stripe (hourly)

#### 2. Webhook Idempotency with Ordering (CRITICAL)
- **Current State**: Deduplicates by event ID, but no ordering guarantee
- **Required**: Track event timestamps, skip older events than last processed

#### 3. Concurrent Update Locking (HIGH)
- **Current State**: No locking mechanism, race conditions possible
- **Required**: Optimistic locking or row-level lock on billing updates

#### 4. Expanded Payment Failure Handling (HIGH)
- **Current State**: Only handles `past_due` and `unpaid` statuses
- **Required**: Also handle `incomplete` and `incomplete_expired`

#### 5. Client Cache Invalidation (HIGH)
- **Current State**: 5-minute TTL, no invalidation on webhook
- **Required**: Broadcast cache invalidation or reduce TTL after billing change

#### 6. Atomic Customer-User Linking (MEDIUM)
- **Current State**: Create Stripe customer then write to DB - non-atomic
- **Required**: Transaction-based approach with cleanup on failure

### Assumptions & Dependencies
- Stripe webhook secret configured
- Background job infrastructure (Vercel Cron or similar)
- Single subscription plan (Standard)

### Known Risks
- Stale `isPro` status after manual Stripe cancellation
- Failed webhook processing leaves user in wrong subscription state
- Concurrent webhooks can overwrite each other

### Definition of Done
- [ ] Reconciliation job runs hourly, fixes status mismatches
- [ ] Webhook handler skips events older than last known update
- [ ] Billing updates use optimistic locking or row locks
- [ ] All payment failure statuses trigger downgrade
- [ ] Client cache invalidated on billing webhook
- [ ] Customer creation is atomic with DB write
- [ ] Subscription audit log tracks all state changes
- [ ] Integration tests for webhook ordering scenarios
- [ ] Health check endpoint verifies billing sync status
- [ ] No user stuck in wrong subscription state for >1 hour

---

## Issue 7: Analytics & Audience Flow Hardening

### Title
`[Analytics] Harden Data Collection, Privacy & Performance`

### Tags
`mvp-core`, `flow-hardening`, `data-integrity`, `infra`

### Priority
**P1 - High**

### Description

#### What the User is Trying to Accomplish
Artists view analytics about their profile visitors: click counts, device breakdown, geographic data, and audience engagement metrics.

#### Entry Points
- `/app/dashboard/overview` - Analytics summary
- `/app/dashboard/audience` - Audience member management
- `POST /api/audience/click` - Click tracking
- `POST /api/audience/visit` - Visit tracking
- `GET /api/dashboard/analytics` - Analytics data fetch

#### Exit Points
- Dashboard displays analytics data
- Audience list shows visitor information
- Tracking endpoints record events

#### Key Files
- `/app/app/dashboard/analytics/page.tsx` (redirect only)
- `/app/app/dashboard/audience/page.tsx`
- `/lib/db/queries/analytics.ts`
- `/app/api/audience/click/route.ts`
- `/app/api/audience/visit/route.ts`
- `/app/api/dashboard/analytics/route.ts`

### Scope of Hardening

#### 1. PII Encryption (CRITICAL)
- **Current State**: Email, phone, IP stored in plaintext
- **Required**: Field-level encryption (AES-256) for all PII fields

#### 2. Data Retention Policy (CRITICAL)
- **Current State**: No automatic deletion of aged data
- **Required**: Configurable retention (90 days default), background cleanup job

#### 3. API Authentication on Public Endpoints (CRITICAL)
- **Current State**: Click/visit endpoints accept POST from any origin
- **Required**: Require signed request tokens (HMAC-SHA256)

#### 4. Rate Limiting on Tracking (HIGH)
- **Current State**: No rate limiting on click/visit endpoints
- **Required**: Per-creator limits (10,000 clicks/hour)

#### 5. Query Timeouts (HIGH)
- **Current State**: No explicit timeouts on analytics queries
- **Required**: 10s timeout for dashboard queries, 5s for APIs

#### 6. Bot Filtering in Aggregations (HIGH)
- **Current State**: `isBot` flag stored but not used in queries
- **Required**: Filter `isBot = true` from all analytics calculations

#### 7. Test Coverage (HIGH)
- **Current State**: Zero dedicated tests for analytics functions
- **Required**: Unit + integration tests for all query functions

#### 8. RLS Hardening (MEDIUM)
- **Current State**: `ALLOW_AUDIENCE_RLS_BYPASS` can be enabled
- **Required**: Remove bypass capability entirely

### Assumptions & Dependencies
- Encryption keys managed securely
- Background job infrastructure available
- Redis available for rate limiting

### Known Risks
- PII exposure in data breach (GDPR/CCPA violation)
- Indefinite data retention creates compliance risk
- Unprotected endpoints enable metric spam
- Slow queries could block database connections

### Definition of Done
- [ ] Email, phone, IP encrypted at rest with AES-256
- [ ] Data older than 90 days automatically deleted (configurable)
- [ ] Click/visit endpoints require signed tokens
- [ ] Rate limiting active: 10k clicks/hour per creator
- [ ] All analytics queries have explicit timeouts
- [ ] Bot traffic excluded from aggregations
- [ ] Unit tests cover `getAnalyticsData()` and related functions
- [ ] Integration tests cover click → analytics flow
- [ ] RLS bypass removed from codebase
- [ ] No plaintext PII in database backups
- [ ] Query performance regression tests in place

---

## Summary

| Issue | Priority | Effort Estimate | Primary Risk |
|-------|----------|-----------------|--------------|
| Auth Flow | P0 | 3-4 weeks | Brute force, session hijacking |
| Onboarding Flow | P0 | 2-3 weeks | Handle collision, data corruption |
| Public Profile Flow | P0 | 2-3 weeks | DDoS, metric inflation |
| Tipping Flow | P0 | 2-3 weeks | Payment loss, no refund handling |
| Dashboard Flow | P1 | 2 weeks | Data loss, race conditions |
| Billing Flow | P1 | 2 weeks | Stale subscription status |
| Analytics Flow | P1 | 3-4 weeks | PII exposure, compliance |

**Total Estimated Effort**: 16-21 weeks of engineering work

**Recommended Execution Order**:
1. **Week 1-2**: Database migrations (UNIQUE constraints, new columns)
2. **Week 3-4**: Redis-backed rate limiting across all flows
3. **Week 5-6**: Transaction hardening and atomic operations
4. **Week 7-8**: Webhook reliability and refund handling
5. **Week 9-10**: PII encryption and retention policies
6. **Week 11-12**: Test coverage and monitoring
7. **Week 13+**: Optimistic locking, performance optimization

---

## Appendix: Cross-Cutting Concerns

### A. Test Coverage Gaps (All Flows)
- Add concurrent modification tests
- Add race condition tests with real database
- Add security-focused tests (injection, bypass attempts)
- Add performance regression tests

### B. Monitoring & Alerting (All Flows)
- Add Sentry spans for all critical operations
- Configure alerts for:
  - Rate limit triggers
  - Webhook failures
  - Database query timeouts
  - Payment processing errors

### C. Documentation Needs
- Document rate limiting strategy
- Document retry/backoff policies
- Document PII handling procedures
- Document incident response for payment issues

---

*This document serves as the specification for Linear issue import. Each section above represents one Linear issue with complete scope and acceptance criteria.*
