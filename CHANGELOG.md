# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project uses [Calendar Versioning](https://calver.org/) (`YY.M.PATCH`).

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

- Duplicate creator profiles when users re-enter onboarding — `fetchExistingProfile` now prefers claimed profiles over unclaimed pre-populated ones
- Dashboard profile selector now prioritizes claimed profiles, preventing sidebar/panel username mismatch
- Orphaned unclaimed profiles are deactivated on handle change to prevent stale public profile pages

## [26.3.2] - 2026-03-17

### Added

- Shopify shop redirect at `/[username]/shop` — redirects to creator's `*.myshopify.com` store with UTM attribution
- Shopping bag icon in public profile nav bar when shop is enabled
- Dashboard shop settings card in Earnings tab for connecting/disconnecting Shopify store URL
- Shop click tracking via `/api/track` with `sendBeacon` for fire-and-forget analytics

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
