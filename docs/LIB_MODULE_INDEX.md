# Library Module Index

> **Question this answers:** "Which lib module provides the functionality I need?"
>
> All modules live in `apps/web/lib/`. Import via `@/lib/<module>`.

## Auth & Identity

| Module | Purpose | Key Exports |
|--------|---------|-------------|
| `auth/` | Authentication gate, session management, Clerk identity sync | `requireAuth`, `getCachedAuth`, `syncEmailFromClerk` |
| `admin/` | Admin role verification (database-backed), impersonation, audit logging | `requireAdmin`, `isAdmin`, `startImpersonation`, `getEffectiveClerkId` |
| `entitlements/` | Plan entitlement registry (free, trial, pro, max) and server-side resolution with backward-compat aliases handled centrally | `ENTITLEMENT_REGISTRY`, `getCurrentUserEntitlements`, `getCreatorEntitlements` |
| `cookies/` | Server-side cookie helpers for user preferences | `getListenPreference`, `setListenPreference` |

## Data

| Module | Purpose | Key Exports |
|--------|---------|-------------|
| `db/` | Canonical database client (Drizzle ORM + Neon) with pooling, health checks, retry | `db`, `withRetry`, `checkDbHealth`, `TABLE_NAMES` |
| `cache/` | Next.js cache tag system with profile/social-link/avatar invalidation | `CACHE_TAGS`, `CACHE_TTL`, `invalidateProfileCache` |
| `queries/` | TanStack Query hooks: 80+ query/mutation hooks for dashboard and admin data | `queryKeys`, `HydrateClient`, `useBillingStatusQuery` |
| `validation/` | Zod schemas organized by domain (audience, dashboard, admin, payments, etc.) | `clickSchema`, `visitSchema`, `onboardingSchema`, `validateUsername` |

## Content & Media

| Module | Purpose | Key Exports |
|--------|---------|-------------|
| `discography/` | Release/track/recording management with DSP provider links and ISRC resolution | `musicfetchClient`, `spotifyImport`, `releaseTrackLoader` |
| `discography/artist-queries/` | Multi-artist DB ops: CRUD, search, collaboration, credit management | `findOrCreateArtist`, `searchArtists`, `getArtistsForRelease` |
| `lyrics/` | Multi-platform lyrics formatting (Apple Music, Deezer, Genius) | `formatLyrics`, `formatLyricsForAppleMusic` |
| `services/canvas/` | Spotify Canvas video generation specs for social ads | `SPOTIFY_CANVAS_SPEC`, `SOCIAL_AD_SPECS` |
| `services/profile/` | Profile data access layer (queries + mutations) | `getProfileByUsername`, `getProfileWithLinks`, `updateProfileById` |
| `services/social-links/` | Social link CRUD with ingestion scheduling and rate limiting | `createLink`, `updateLink`, `deleteLink` |
| `services/pitch/` | AI-powered pitch text generator for playlist/PR outreach | `generatePitches`, `buildSystemPrompt` |
| `services/insights/` | AI-powered insight generation from artist metric snapshots | `generateInsights`, `MetricSnapshot` |
| `services/tips/` | Post-tip-completion: fan upsert, cumulative totals, thank-you emails | `processTipCompleted` |
| `services/link-wrapping/` | Smart link wrapping with anti-cloaking and URL encryption | `WrappedLink`, `generateShortId` |

## Communication

| Module | Purpose | Key Exports |
|--------|---------|-------------|
| `email/` | Email templates (claim invites, DSP bio updates, tip thank-yous) with job queuing | `enqueueClaimInviteJob`, `getClaimInviteEmail` |
| `notifications/` | Multi-channel dispatch (email, Slack) with quota, reputation, suppression management | `sendNotification`, `checkQuota`, `isEmailSuppressed` |
| `chat/` | AI chat assistant: system prompt, command registry, knowledge routing | `buildSystemPrompt`, `COMMANDS`, `routeKnowledge` |

## DSP Integrations

| Module | Purpose | Key Exports |
|--------|---------|-------------|
| `spotify/` | Spotify API client with circuit breaker, retry, data sanitization | `spotifyClient`, `searchSpotifyArtists`, `getSpotifyArtist` |
| `bandsintown/` | Bandsintown tour date sync | `fetchBandsintownEvents`, `verifyBandsintownArtist` |
| `dsp-bio-sync/` | Push artist bio updates to DSPs via API or email | `syncBioToDsps`, `getBioSyncStatus` |
| `dsp-enrichment/` | Cross-platform artist matching, enrichment, new release detection | `DspProviderId`, `calculateConfidenceScore` |

## Analytics & Tracking

| Module | Purpose | Key Exports |
|--------|---------|-------------|
| `tracking/` | Client-side pixel tracking: consent, subscribe events, JSON beacons | `fireSubscribeEvent`, `jsonBeacon`, `withPixelSession` |
| `tracking/forwarding/` | Server-side pixel forwarding to Facebook, Google, TikTok with retry | `forwardEvent`, `processPendingEvents` |
| `utm/` | UTM parameter builder with presets, sorting, and share menu generators | `buildUTMUrl`, `UTM_PRESET_MAP`, `extractUTMParams` |
| `monitoring/` | Performance monitoring for APIs, DB queries, middleware with request ID | `withApiPerformanceMonitoring`, `withDatabaseMonitoring` |
| `fit-scoring/` | ICP fit scoring for creator profiles with Spotify enrichment | `calculateFitScore`, `getTopFitProfiles` |
| `sentry/` | Sentry SDK factory: lite (public, ~20KB) vs full (dashboard, ~60KB) | `initSentry`, `getSentryMode`, `upgradeSentryToFull` |

## Billing

| Module | Purpose | Key Exports |
|--------|---------|-------------|
| `stripe/` | Stripe client, checkout helpers, plan-change logic, dunning | `getStripe`, `PlanType`, `checkoutHelpers` |
| `stripe/customer-sync/` | Customer sync with optimistic locking, event ordering, billing queries | `ensureStripeCustomer`, `getUserBillingInfo` |
| `stripe/webhooks/` | Modular webhook handler architecture with registry routing | `getHandler`, `SubscriptionHandler`, `CheckoutSessionHandler` |

## Growth

| Module | Purpose | Key Exports |
|--------|---------|-------------|
| `ingestion/` | Social platform profile ingestion: scheduler, processor, avatar handling | `processor`, `scheduler`, `statusManager` |
| `ingestion/jobs/` | Platform-specific ingestion processors (Linktree, Instagram, TikTok, YouTube, etc.) | `executeIngestionJob`, `processLinktreeJob` |
| `ingestion/strategies/` | Platform-specific HTML extraction with URL validation | `detectIngestionPlatform`, `extractLinktree` |
| `intent-detection/` | AI intent classifier and pattern matching for chat command routing | `classifyIntent`, `routeIntent`, `INTENT_PATTERNS` |

## Infrastructure

| Module | Purpose | Key Exports |
|--------|---------|-------------|
| `env-server.ts` | Server-side Zod-validated env var proxy | `env` |
| `env-client.ts` | Client-side env constants (NODE_ENV, IS_DEV, IS_TEST) | `env` |
| `env-public.ts` | Public env vars with lazy getter for Vercel cold-start safety | `publicEnv` |
| `error-tracking.ts` | Structured error logging with Sentry | `captureError`, `captureCriticalError` |
| `flags/` | Canonical app flag contracts, Statsig integration, server evaluation, and client overrides | `APP_FLAG_KEYS`, `getAppFlagValue`, `AppFlagProvider`, `useAppFlag` |
| `rate-limit/` | Redis-backed rate limiting with 40+ pre-configured limiters, plan-aware | `createRateLimiter`, `createPlanAwareRateLimiter` |
| `fetch/` | Request deduplication with in-memory cache and prefetch | `dedupedFetch`, `useDedupedFetch`, `prefetch` |
| `nuqs/` | Type-safe URL search params with server/client caches | `useTableParams`, `audienceSearchParams` |
| `pacer/` | TanStack Pacer: debounce, throttle, auto-save, retry utilities | `useDebouncedInput`, `useAutoSave` |
| `utils/` | Shared utilities: date formatting, URL parsing, CSV, PII encryption, logger | `logger`, `piiEncryption`, `formatNumber` |
| `utils/platform-detection/` | Social/music platform URL detection and normalization | `detectPlatform`, `normalizeUrl`, `PLATFORMS` |

## Where to Add New Functionality

| If your code... | Put it in... |
|----------------|-------------|
| Touches the database directly | `lib/db/` or a domain `lib/services/<domain>/` |
| Is a reusable query/mutation hook | `lib/queries/` |
| Is a Zod validation schema | `lib/validation/schemas/<domain>/` |
| Is UI state or a React hook | `components/hooks/` |
| Is shared across `apps/web` and `packages/ui` | `packages/ui/` |
| Is a standalone service (email, billing, etc.) | `lib/<service>/` |
