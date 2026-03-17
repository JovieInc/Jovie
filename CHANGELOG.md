# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project uses [Calendar Versioning](https://calver.org/) (`YY.M.PATCH`).

## [Unreleased]

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
