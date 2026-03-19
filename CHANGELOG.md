# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project uses [Calendar Versioning](https://calver.org/) (`YY.M.PATCH`).

## [26.4.10] - 2026-03-18

### Fixed

- Guard all keyboard shortcut hooks against undefined `event.key` — prevents crashes from IME composition, dead keys, and browser extension injected events (JOVIE-WEB-EE, JOVIE-WEB-CT, JOVIE-WEB-F1)

### Added

- Unit tests for `useSidebarKeyboardShortcut` and `useSequentialShortcuts` hooks (13 tests)

### Changed

- Waitlist gating: replaced `WAITLIST_ENABLED` env var with DB-only `gateEnabled` toggle — admin panel now controls waitlist without server restarts
- Default waitlist state for fresh environments changed to OFF (gateEnabled: false), matching previous env-var-unset behavior

### Removed

- `WAITLIST_ENABLED` environment variable and `waitlist-config.ts` — consolidated into `waitlist_settings.gateEnabled` DB column

## [26.4.9] - 2026-03-18

### Fixed

- Fix conversion rate labels showing between wrong funnel stages — 33% now correctly appears between Profile Views and Unique Visitors instead of between Unique Visitors and Followers
- Fix Cities, Countries, and Sources tabs showing blank by sourcing geo data from audience_members (visits) instead of click_events (link clicks only)
- Fix time range toggle (7d/30d) overflowing off-screen by stacking it below the tab bar
- MusicFetch ingest pipeline: treat 400 errors as permanent failures instead of retrying indefinitely, preventing circuit breaker trips that blocked all enrichment (JOV-1629, JOV-1630)
- MusicFetch enrichment: return gracefully when API returns no data instead of throwing and retrying

### Added

- New blog post: "The Contact Problem" — explores the structural problem of stale artist contacts and introduces the Jovie Inbox vision
- "Problems We're Solving" section in investor memo linking to all three problem essays (MySpace, Friday, Contact)
- Global campaign email toggle (`campaignsEnabled`) on campaign settings — allows admin to pause all outreach emails and drip campaigns with a single switch
- Campaign toggle check in both the campaign processor cron and claim-invite job processor
- Admin UI toggle switch on the outreach email page for enabling/disabling campaigns
- API endpoints for reading and updating campaign enabled state

### Removed

- Delete unused `getAnalyticsData()` and `getUserAnalytics()` functions from analytics query module


## [26.4.8] - 2026-03-18

### Added

- Conductor workspace archive script to clean up build artifacts and node_modules when archiving

### Changed

- Homepage hero: "One link to grow your music career" → "One link to launch your music career"
- Final CTA: "start growing today" → "launch your career today"
- Meta descriptions and SEO schema updated across all pages to new positioning
- llms.txt brand description updated to match new messaging
- Investor memo mission updated to "AI that manages your music career"
- Replace SQL string interpolation with parameterized queries in batch update functions (`batchUpdateSortOrder`, `batchUpdateSocialLinks`) for defense-in-depth against SQL injection
- Extract shared `validateBatchItem` helper to deduplicate validation logic across batch operations
- Remove `console.time()`/`console.timeEnd()` from dashboard API routes to prevent timing information leaks in production logs
- Document intentional `Access-Control-Allow-Origin: *` CORS policy on public pixel tracking endpoint

### Fixed

- Conductor run script no longer double-wraps Doppler secrets (was `doppler run -- pnpm dev:web` which chains into web's `doppler run -- next dev`)

## [26.4.7] - 2026-03-18

### Added

- Non-interactive cleanup mode (`--force`, `--dry-run`) for E2E test account script, enabling agents and CI to clean up without human prompts
- Paginated Clerk user discovery and database record cleanup (FK CASCADE) in cleanup script
- Rate-limited batch deletion with exponential backoff for Clerk API calls
- Expanded test user detection to match both `role: 'e2e'` metadata and `+clerk_test` email patterns
- QA & Browse authentication instructions in AGENTS.md so agents auto-login using Doppler credentials instead of prompting
- Agent cleanup requirement in AGENTS.md — agents must run cleanup after sessions creating test accounts
- Clerk E2E test user cleanup step in CI workflows (`e2e-full-matrix.yml`, `nightly-tests.yml`)
- Bulk Unfeature, Enable/Disable marketing email actions for Creators table
- Bulk Copy User IDs action for Users table
- Bulk Approve/Disapprove actions for Waitlist table (with status-based filtering)
- Destructive variant styling for bulk action dropdown items (Delete shows in red)
- DRY `executeBulkAction` helper replacing 5+ near-identical bulk action handlers

### Changed

- Migrate Creators table from custom `AdminCreatorsToolbar` to shared `TableBulkActionsToolbar` dropdown pattern, matching Users and Waitlist tables
- All three admin tables now use identical bulk actions toolbar UX

### Fixed

- Missing `E2E_CLERK_USER_USERNAME` and `E2E_CLERK_USER_PASSWORD` env vars in weekly E2E full matrix workflow
- Badge test assertion updated to match renamed design token (`bg-(--color-bg-primary)`)
- Fix admin table checkbox multi-select on Creators and Waitlist tables by removing dual selection system conflict (TanStack Table internal selection racing with custom `useRowSelection` hook)

### Removed

- `AdminCreatorsToolbar.tsx` — replaced by shared `TableBulkActionsToolbar`


## [26.4.6] - 2026-03-18

### Added

- "See it in action" homepage section now shows real creator profiles from the database instead of fake placeholders
- Tim's profile (`jov.ie/tim`) pinned as first card, remaining slots filled from featured creators
- Section visibility gated by Statsig `show_see_it_in_action` gate (off by default in production)
- New `getCreatorByHandle()` cached function for single-profile lookup with timeout guards

### Changed

- Lazy-load TipDrawer and ProfileNotificationsMenu on public profile pages, removing ~25-40 KB from the critical-path client bundle
- Parallelize tour dates fetch with Statsig feature flag queries, eliminating ~100-200ms sequential waterfall on tour mode pages

## [26.4.5] - 2026-03-18

### Added

- Post-checkout celebration page with confetti animation, plan-aware greeting, and feature unlock cards (Branding Removed, Advanced Analytics, Contact Export)
- Shared `Confetti.tsx` atom extracted from `ProfileLiveCelebration` for DRY reuse across celebration screens
- First-fan celebration modal on dashboard — triggers when subscriber count reaches 1-5, gated by localStorage, auto-dismisses after 5s
- Getting Started checklist card on dashboard with 5 growth tasks (share on Instagram, Spotify bio link, QR code, invite artist, connect Venmo), dismissible for 24h
- Referral settings page at `/app/settings/referral` with copyable share link, program terms, and earnings stats
- Testimonials section on homepage (feature-flagged via `NEXT_PUBLIC_SHOW_TESTIMONIALS`)
- User conversion funnel section in admin dashboard (Total Users → With Profiles → Profile Complete → Has Subscribers → Paid)
- 43 unit tests covering all new components and data flows
- 3 deferred items in TODOS.md (shareable social card, weekly digest email, win-back email)
- Test for billing reconciliation audit log insert failure path

### Fixed

- Dashboard analytics CTE now has RLS session variable set on the db connection (defense-in-depth for audience_members and notification_subscriptions queries)
- Billing reconciliation audit log insert failure no longer silently swallows errors — failures are captured via captureCriticalError

### Changed

- Removed 5 app-level legacy DB transactions in favor of getSessionContext() and direct queries
- Tour date analytics route uses getSessionContext() instead of transaction-scoped RLS setup
- getUserAnalytics and getUserDashboardAnalytics no longer wrap queries in transactions
- Billing reconciliation repair functions use sequential writes with error handling instead of transactions
- Migrate LeadTable from manual `<table>` with page-based pagination to UnifiedTable with infinite scroll, matching all other admin tables
- Migrate EarningsTab tipper table from manual `<table>` to UnifiedTable with column definitions and empty state
- Extract ~50 `shadow-[...]` bracket notations into 10 named shadow design tokens (`shadow-subtle-bottom`, `shadow-inset-divider`, `shadow-inset-ring-focus`, `shadow-popover`, etc.)
- Standardize all buttons and icon buttons to `rounded-full` (pill shape) across the design system
- Wrap ProfileContactSidebar header and profile link sections in DrawerSurfaceCard for visual consistency
- Align leads API response shape (`items` → `rows`, `limit` → `pageSize`) with other admin endpoints

### Fixed

- Feedback API route now logs errors with `captureError` instead of silently swallowing exceptions

### Removed

- Delete unused BaseSidebar component (4 files, 321 lines) — replaced by RightDrawer/EntitySidebarShell
- Remove `useLeadsListQuery` and `AdminLeadListResponse` — replaced by `useLeadsInfiniteQuery`

## [26.4.4] - 2026-03-17

### Fixed

- Onboarding profile review step now requires a profile photo before allowing dashboard access
- Releases page no longer shows "Connect Spotify" empty state during async onboarding import
- Right-clicking a release row in the dashboard table now shows the custom context menu (Copy smart link, Open smart link, etc.) instead of the browser's default context menu
- VirtualizedTableRow forwards extra HTML props to the underlying `<tr>` element, enabling Radix ContextMenu.Trigger's `asChild` pattern to work correctly

### Added

- Uploadable avatar on onboarding profile review step (tap to upload)
- Unit tests for Spotify connection detection during import status transitions

## [26.4.3] - 2026-03-17

### Fixed

- Dev toolbar no longer covers page content — adds dynamic body padding so content flows above the toolbar
- Dev toolbar can be hidden via X button, with a small "Dev" pill to bring it back
- Hide/show state persists across page loads via localStorage

## [26.4.2] - 2026-03-17

### Added

- Post-migration schema verification — CI now compares every Drizzle schema column against the actual database after running migrations, blocking deploys if any columns are missing

### Changed

- Title case genre, location, and hometown display on artist profiles and dashboard sidebar

## [26.4.1] - 2026-03-17

### Added

- Post-signup name capture — fans can optionally share their first name after subscribing to a creator
- Personalized email greetings — release notification emails use "Hey [Name]," when a subscriber name is available
- Creator dashboard shows subscriber names alongside emails in the audience table
- Name capture analytics: `name_capture_shown`, `name_capture_submitted`, `name_capture_skipped` events

### Fixed

- Strip control characters from subscriber names in plain text emails to prevent formatting injection
- 5-minute time window on name update endpoint to prevent abuse of the unauthenticated API

## [26.4.0] - 2026-03-17

### Added

- Tour date ticket click tracking on public profile and dedicated tour page via shared `useTourDateTicketClick` hook
- Tour date analytics sidebar card in dashboard — ticket clicks, top cities, and top referrers per show
- API endpoint `GET /api/dashboard/tour-dates/[id]/analytics` with ownership verification and UUID validation
- `useTourDateAnalyticsQuery` React Query hook for client-side analytics fetching
- `tour_date` content type support in click tracking validation
- Comprehensive tour date seed data (12 venues across 7 countries)
- Test coverage: API route (auth, validation, ownership, errors), hook, sidebar analytics UI, and validation

### Changed

- Extracted shared `useTourDateTicketClick` hook from duplicated click handlers in `TourDateCard` and `TourModePanel`

### Fixed

- Invalid IANA timezone values no longer crash `TourDateCard` — wrapped `Intl.DateTimeFormat` in try/catch
- Tour date analytics API route enforces ownership (IDOR prevention) via profileId check
- Seed data idempotency — deterministic `externalId` values enable safe `onConflictDoNothing`

## [26.3.5] - 2026-03-17

### Added

- Shared `approveLead()` pipeline for both manual admin approval and auto-approve cron (DRY extraction)
- `runAutoApprove()` — automated approval with daily limits, fit score threshold, high-profile/representation guards
- Scrape retry tracking with auto-disqualification after 3 failures (`scrape_attempts` column)
- Pipeline health warnings: zero discovery results and high qualification error rate alerts via Sentry
- 15s fetch timeout on Instantly API push (`AbortSignal.timeout`)
- Idempotency guard on Instantly push (skips if `instantlyLeadId` already set)
- 20 new pipeline tests: approve-lead, process-batch, pipeline-health-warnings, instantly-timeout

### Fixed

- TOCTOU race condition in approval pipeline — atomic `WHERE status='qualified'` guard prevents double-approval
- Non-atomic daily counter increment — uses SQL `autoIngestedToday + N` instead of in-memory calculation
- Expired claim tokens now regenerated during routing instead of reusing stale tokens

## [26.3.4] - 2026-03-17

### Added

- `docs/PRODUCT_CAPABILITIES.md` — canonical rich feature catalog for AI agents with 37+ features, consistent schema (one-line, plan tier, problem solved, how it works, benefits, routes)
- "Use This Sound" feature documented in FEATURE_REGISTRY — influencer sharing pages at `/{username}/{slug}/sounds` for TikTok, Instagram Reels, YouTube Shorts
- 7 new docs.jov.ie feature pages: Tour Dates, Verified Badge, AI Insights, Ad Pixels, Fan CRM, Retargeting Ads, Plans & Pricing
- 4 new docs.jov.ie guides: Share Your First Smart Link, Set Up Tipping, Set Up Ad Pixels, Connect Bandsintown
- Signup-to-paid conversion funnel: capture `?plan=` intent at signup, persist through onboarding, present personalized checkout step before dashboard
- Onboarding checkout page (`/onboarding/checkout`) with profile value preview, interactive branding toggle, monthly/annual Stripe pricing, and skip option
- "Profile is live" confetti celebration after onboarding step 3 with profile URL and copy button
- Contextual upgrade nudges on plan-gated settings features (branding, analytics, contacts, notifications)
- Reusable `UsageLimitUpgradePrompt` component shown at 80%+ of plan limits with progress bar
- `plan-intent.ts` utility for cookie + sessionStorage plan intent persistence across the funnel
- `onboarding.checkoutStep` feature flag for safe rollout (server + client gated)
- 11+ analytics events across the full conversion funnel

### Changed

- Rewrote Chat & AI docs page → AI Assistant (was inaccurately describing fan messaging; now correctly documents AI career assistant)
- Fixed Tips docs page (aligned with actual Venmo-based payments, not Stripe)
- Expanded all 6 existing docs.jov.ie feature pages from ~20 lines to ~80-120 lines with plan availability tables and detailed capabilities
- Updated FEATURE_REGISTRY.md change management process to include PRODUCT_CAPABILITIES.md and docs.jov.ie updates
- Renamed "Self-Serve Guide" section to "Guides" in docs navigation
- `ChatUsageAlert` now shows direct upgrade button for free users and plan-specific messaging
- `SettingsPlanGateLabel` enhanced with feature-specific copy and upgrade click tracking

## [26.3.3] - 2026-03-17

### Added

- Admin settings section in Settings sidebar with dedicated `/app/settings/admin` route
- `CampaignSettingsPanel` — campaign targeting (fit score, batch size) and throttling controls moved from inline campaign manager to centralized settings
- Dev toolbar on/off toggle under Admin > Developer tools
- Waitlist settings panel embedded in admin settings
- DSP Presence dashboard page at `/app/presence` — card grid showing all matched streaming platform profiles (Spotify, Apple Music, Deezer, etc.) with confidence scores, ISRC match counts, and confirm/reject actions for suggested matches
- Detail sidebar for each DSP profile with match status, confidence breakdown, and external platform link
- Navigation entry for Presence in the dashboard sidebar
- Next.js rewrite rule mapping `/app/presence` to `/app/dashboard/presence`

### Changed

- Campaign manager now reads settings from persisted config instead of inline controls, with "Change in Settings" link
- Admin sidebar section renamed from "Admin" to "General" with restructured card layout (dev tools, waitlist, campaigns, quick links)

### Fixed

- Invalid IANA timezone values no longer crash `TourDateCard` — wrapped `Intl.DateTimeFormat` in try/catch
- Tour date analytics API route enforces ownership (IDOR prevention) via profileId check
- Seed data idempotency — deterministic `externalId` values enable safe `onConflictDoNothing`

## [26.3.2] - 2026-03-17

### Removed

- Unused DB tables `dsp_artist_enrichment` and `release_sync_status` — scaffolded but never queried or written to
- Unused DB columns `creator_profiles.outreach_priority` and `creator_profiles.last_login_at` — never populated in application code
- Dead route `/api/monitoring/performance` — stub returning 501, never implemented (JOV-480)
- Dead route `/ingest/[...path]` — decommissioned tombstone returning 404
- Dead route `/loader-preview` — page that immediately called `notFound()`
- Unused environment variable `CONTACT_OBFUSCATION_KEY` — defined but never read
- Unused `fallbackSrc` prop from Avatar component — accepted but never used in render logic

## [26.3.1] - 2026-03-17

### Changed

- Move phone carousel (DeeplinksGrid) above CRM section (AudienceCRMSection) on homepage

### Fixed

- `SettingsStatusPill` no longer shows "Save failed" alongside "Saving..." and "Saved" states due to operator precedence bug with `&&` and ternary
- Audience segment filters now use OR (union) logic consistently between SSR and API routes — previously SSR used AND while the API used OR, causing inconsistent results when selecting multiple segments
- `SettingsAdPixelsSection` uses safe optional chaining on `pixels` and `hasTokens` objects to prevent runtime crashes when data shape is partial

## [26.3.0] - 2026-03-17

### Added

- "On Jovie" badge on search results for artists already claimed on the platform (homepage + onboarding DSP step)
- `boostClaimedArtists()` helper to sort claimed artists to the top of Spotify search results
- 5-second minimum display time on profile review step so users actually see their enriched profile before proceeding
- Unified row context menus across all data tables — kebab menu and right-click show the same actions

### Fixed

- Claimed artists now appear first in search results so users can identify their own profile among duplicates
- Dashboard redirect now waits for `connectSpotifyArtist` DB writes to complete — fixes empty sidebar, missing DSPs, and missing social links after onboarding
- Profile review CTA disabled while enrichment or Spotify connection is still in progress (with 10s timeout fallback)
- Tour Dates table now shows complete menu (Edit, Open tickets, Delete) on both kebab and right-click
- Feedback table now exposes Copy/Dismiss actions via both kebab menu and right-click context menu

## [26.2.2] - 2026-03-17

### Fixed

- Demo sidebar navigation no longer redirects unauthenticated users to sign-in when clicking Audience or Earnings tabs — shows toast notification instead
- `isAppleMusicConfigured()` now reads env vars at call time instead of module load, fixing false positives when Doppler injects credentials
- Google CSE tests now correctly stub SerpAPI key to exercise the Google CSE code path
- Show user-facing error toast when username change fails (e.g., "Handle already taken") instead of silently reverting
- Extract API error messages from 4xx response bodies in `fetchWithTimeout` so user-friendly errors propagate to the UI

## [26.2.1] - 2026-03-17

### Changed

- Migrated all marketing homepage components from hardcoded rgba/hex to CSS design tokens (`var(--linear-*)`)
- Replaced fluid `clamp()` typography with discrete breakpoints matching Linear.app's exact values at 375/768/1280/1440px
- Widened homepage content max-width from 984px to 1250px to match Linear.app layout
- Darkened mockup panel surfaces and switched to rounded-top-only corners with inset ring shadow
- Updated marketing copy across all homepage sections (hero, CRM, deeplinks, pricing, final CTA)
- Removed force-light CSS override so marketing pages render in dark mode
- Added `text-rendering: optimizelegibility` to Inter font stack

### Changed

- Updated design system tokens to match Linear's latest values: accent `#7170ff`, font weights (normal 400, semibold 590, bold 680), button radius 4px, text quaternary `#62666d`, font features `"cv01","ss03"`
- Migrated all UI components from `--linear-border-focus` to `--color-accent` for focus rings (button, switch, checkbox, radio, card, dialog, input, badge, segment-control, dropdown)
- Updated all `font-[450]` to `font-[400]` across UI atoms and app components (17 instances across 20 files)
- Badge component now uses pill shape (`rounded-full`) and 12px font size to match Linear
- Button component uses hardcoded `rounded-[4px]` instead of `--radius-default` variable
- Replaced hardcoded `#5e6ad2` accent in PricingSection with `var(--color-accent)` token

### Fixed

- Sidebar display name now updates immediately after saving profile edits (was stale until full-page reload due to separate query cache)
- Social link delete API no longer returns 500 on temp-* IDs — rejects with 400 before hitting the database
- Social link optimistic rollback now properly reverts UI on server error (was using stale closure instead of snapshot)
- Mobile settings page now shows "Links, music & more" trigger to access Social/Music/Earn/About tabs (were completely hidden below `lg` breakpoint)
- Social link action labels now show platform name or @handle consistently instead of raw hostnames for X, Threads, Facebook, Twitch, Snapchat
- Analytics "Last 30 days" container reserves min-height to prevent layout shift during lazy load
- Theme-init script no longer causes hydration mismatch (nonce undefined vs empty string) on every page load
- Display name inline editor now uses distinct aria-label ("Edit display name") to avoid screen reader confusion with the form field
- Admin creator sidebar now displays DSP and social link icons (previously showed empty tabs because `platform` field was dropped during data hydration)
- Fixed swapped `platformIcon`/`platformName` fields in `CreatorProfileSocialLinks` table component
- CRM contact sidebar now correctly resolves platform icons from `platform` field before falling back to URL detection

- Homepage claim button now validates handle input before submitting (previously navigated to self-referential `/signup` when empty)
- CRM audience demo table now shows visible text labels for Intent, Returning, and Source columns instead of invisible icon-only cells
- Social links on artist profile now open in new tabs instead of navigating away from the page
- "Log in" link now visible on mobile homepage navigation (was hidden below 380px)
- Removed duplicate font declaration in auth layout that caused unused CSS preload warnings on every page
- Reduced cognitive complexity in `ingest-lead.ts` by extracting `enqueuePostIngestionJobs` helper (SonarCloud S3776)
- Replaced nested ternary operators in `ClaimHandleForm` and `SpotifyConnectDialog` with explicit conditionals (SonarCloud S3358)
- Used direct `undefined` comparison instead of `typeof` in feature-flags client (SonarCloud S7741)
- Used `globalThis` instead of `window` in `SettingsAdminSection` for portability (SonarCloud S7764)

### Changed

- Pricing CTA buttons now pass plan context (`?plan=free` / `?plan=founding`) to the signup page
- Removed redundant FloatingClaimBar (third duplicate claim form) from homepage

### Changed

- SSO callback loading screens now match app dark theme with centered spinner and fade-in animation instead of plain white page with spinning logo

### Added

- Canonical CDN domain registry (`constants/platforms/cdn-domains.ts`) as single source of truth for all platform image domains
- Comprehensive CDN coverage for all supported platforms: music DSPs (Spotify, Apple Music, YouTube Music, SoundCloud, Bandcamp, Tidal, Deezer, Amazon Music, Pandora, Beatport), social networks (Instagram, Twitter/X, TikTok, Facebook, YouTube, LinkedIn, Snapchat, Pinterest, Reddit), and creator platforms (Twitch, Discord, Patreon, Substack, Medium, GitHub, Behance, Dribbble)
- Sync test to verify `next.config.js` remotePatterns stays in sync with the CDN registry

### Changed

- Avatar host validation, CSP img-src, and DSP image bypass now derive from the CDN registry instead of maintaining separate hardcoded lists
- Consolidated `next.config.js` remotePatterns to include all platform CDN domains

### Changed

- Upgraded homepage hero H1 to "Your entire music career. One intelligent link."
- Updated homepage meta title, description, OG tags, and JSON-LD to match new positioning
- Changed final CTA headline to "Your music deserves better than a list of links."
- Changed Audience CRM section heading to "Know every fan by name."

- Auth (`/signin`, `/signup`), waitlist, and onboarding pages now respect user theme preference instead of being forced dark — only marketing pages remain dark-only

- Consolidated action menus across Admin Users, Admin Creator Profiles, and Contacts tables so right-click context menu, ellipsis menu, and drawer right-click menu all show the same actions
- Migrated Admin User detail drawer from raw `RightDrawer` to `EntitySidebarShell` for consistency with other entity drawers
- Extracted `buildAdminUserActions()` builder from inline context menu logic for reuse across table and drawer

### Added

- Made code-level feature flags (`THREADS_ENABLED`, `SHOW_REPLACES_SECTION`, `PWA_INSTALL_BANNER`) toggleable in the dev toolbar via localStorage overrides
- Added `useCodeFlag` hook for reactive code-level flag consumption with dev toolbar override support
- Added "Dev Toolbar" toggle in Admin settings so admins can enable the toolbar in production without manually setting a cookie

### Changed

- Code-level flag consumers (`DashboardNav`, `SidebarInstallBanner`) now use `useCodeFlag` hook instead of static constants

- Added SerpAPI as primary search provider for lead discovery, with Google CSE as legacy fallback (Google deprecated the Custom Search JSON API for new customers)
- Added "Already claimed" visual treatment for Spotify artists already linked to another Jovie account in search results
- Added `isClaimed` field to Spotify search API response with 30s-cached DB lookup

### Fixed

- Fixed VIP priority feature creating duplicate search results by filtering same-name non-VIP artists when a featured creator matches
- Fixed React rendering bug showing literal "0" instead of nothing when a Spotify artist has zero followers (affected all 3 search components)

### Fixed

- Fixed Spotify artist connect showing cryptic "Server Components render" error instead of friendly "already linked" message — Drizzle ORM wraps PG errors in `.cause`, breaking unique constraint detection (JOVIE-WEB-EY)
- Fixed 5 locations with the same Drizzle error-wrapping bug (releases, referrals, ingestion, discography queries)
- Added pre-check query in `connectSpotifyArtist` to detect already-claimed artists before hitting the constraint
- Added diagnostic Sentry logging for Spotify state inconsistency (artistName set but spotifyId null)
- Fixed admin leads page showing premature "Unable to load pipeline settings" error during TanStack Query retries
- Fixed admin leads table showing error state during initial data fetch retries
- Suppressed "You're off the waitlist!" email for users who bypassed the waitlist (gate disabled or auto-accept threshold)
- Fixed leads table query failures (JOVIE-WEB-E0/EJ/E3, 385 events) — Drizzle error wrapping hid "column does not exist" messages from fallback detection in admin leads and outreach routes
- Fixed `SET LOCAL statement_timeout` being a no-op with Neon HTTP driver (JOVIE-WEB-EX/EV) — replaced with `SET` in dashboard earnings and tipping stats queries
- Fixed profile view endpoint returning 500 on non-critical view counter failures (JOVIE-WEB-DZ, 24 events) — now logs to Sentry and returns 200

### Removed

- Deleted unused `UserActionsMenu.tsx` component (dead code, zero imports)

## [26.2.0] - 2026-02-12

### Added

- Added `pnpm version:check` to validate CalVer alignment, package-version sync, and changelog consistency before releases.

### Changed

- Hardened `pnpm version:bump` to enforce valid CalVer input, prevent calendar regressions, rotate changelog sections safely, and sync all workspace package versions.

### Fixed

- Closed versioning drift risk where `apps/should-i-make` and `packages/ui` package versions were not updated during version bumps.

## [25.1.0] - 2025-01-01

### Added

- Initial design token map and tailwind v4 config
- Canonical shadcn Button atom
- Button atom now supports loading state and token-driven accent styles

- **Pro Subscription System**: Implemented $5/month Pro plan with Stripe Checkout integration
  - Created `/pricing` page with custom pricing UI showing Free and Pro plans
  - Added Stripe Checkout API route (`/api/stripe/redirect`) with user authentication
  - Implemented Stripe webhook handler (`/api/stripe/webhook`) for subscription management
  - Added billing success page (`/billing/success`) with user-friendly confirmation
  - Created `BrandingBadge` component that automatically hides "Made with Jovie" text for Pro users
  - Updated `ProfileFooter` component to use the new branding system
  - Added middleware protection for billing routes
  - Updated environment variables to include Stripe configuration
  - Added comprehensive README section with billing setup instructions

### Changed

- **Branding Logic**: Updated from artist-specific settings to user plan-based control
  - Branding now controlled by Clerk user metadata (`publicMetadata.plan`)
  - Supports "free" (shows branding) and "pro" (hides branding) plans
  - Removed hardcoded "Powered by Jovie" text from artist profile routes
  - Updated `lib/footer.ts` to accept user plan parameter
- Hardened Drizzle migration flow on `main` by fixing index migrations to avoid `CREATE INDEX CONCURRENTLY` inside the transactional migrator, pinned `parse5` via `pnpm.overrides` to stabilize Vitest jsdom tests, and aligned `CTAButton` `data-state` semantics with loading/disabled states so the component and unit tests stay in sync.

### Technical Details

- Added Stripe SDK dependency for payment processing
- Implemented Clerk user metadata updates via webhook
- Created unit tests for `BrandingBadge` component
- Added E2E tests for pricing page functionality
- All changes follow existing TypeScript and ESLint standards
- Maintains backward compatibility with existing artist profiles

### Security

- Stripe webhook signature verification for secure payment processing
- User authentication required for all billing operations
- Environment variable validation for payment security
