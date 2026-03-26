# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project uses [Calendar Versioning](https://calver.org/) (`YY.M.PATCH`).

## [26.4.80] - 2026-03-26

### Changed

- Dashboard core data cache TTL increased from 30s to 5min — tag-based invalidation handles mutations, reducing DB queries on navigation [internal]
- Release matrix cache TTL increased from 30s to 5min — releases only change on import/sync [internal]
- Lighthouse performance budgets tightened 2-3x (FCP 4s→1.5s, LCP 5s→2s, TBT 1.5s→500ms, performance score 50%→75%) [internal]

### Added

- Nav hover prefetching — hovering a dashboard nav link preloads page data into TanStack Query cache with 150ms debounce [internal]
- Per-page TanStack Query hydration — releases and earnings pages prefetch data server-side for instant SPA navigation [internal]
- Cache tag constant usage in settings action — replaced string literals with CACHE_TAGS.DASHBOARD_DATA [internal]

## [26.4.79] - 2026-03-26

### Added

- Pitch generation via Jovie chat — artists can ask "generate pitches for [release]" and get Spotify, Apple Music, Amazon Music, and General pitches inline
- "Generate pitches" suggested prompt in chat (paid plans only, personalized with latest release title)
- ChatPitchCard component with loading skeleton, success state (4 platforms with copy buttons and char counts), and error state
- Shared `buildPitchInput()` service extracted from pitch API route (DRY)
- Optional `instructions` parameter for pitch generation (e.g., "mention my tour")
- Test-only `/api/admin/test-user/set-plan` endpoint for E2E paid-tier testing
- E2E test suite for chat pitch generation with plan upgrade/downgrade coverage

### Fixed

- Free-tier plan limitations now list "pitch generation" as a blocked tool

## [26.4.78] - 2026-03-25

### Changed

- Spotify import link discovery now runs in background — users see their catalog instantly instead of waiting 15-25s for cross-platform link lookup
- Link discovery parallelized with concurrency limit of 5 (was sequential), reducing wall-clock time from ~25s to ~5s for large catalogs
- Pre-save cron processes rows concurrently (grouped by refresh token to prevent OAuth races), reducing 500-row processing from ~50s to ~10s
- Admin leads batch URL processing parallelized with input deduplication
- HUD metrics polling no longer triggers redundant refetches on tab focus (staleTime increased from 0 to 15s)

### Added

- Admin releases table at `/app/admin/releases` showing all releases across the platform with server-side pagination, search, and sort
- Data quality indicators (missing artwork, no providers, no UPC, zero tracks) as inline health pills in the Issues column
- Non-ASCII-safe search preserving music titles with accented characters
- Admin sidebar nav entry for Releases with Disc3 icon
- [internal] `mapConcurrent` utility for concurrent async operations with configurable worker pool limit
- [internal] Unit tests for `mapConcurrent` (7 test cases covering concurrency, ordering, errors, edge cases)

## [26.4.77] - 2026-03-25

### Changed

- Track URLs are now nested under their parent release (`/{handle}/{release}/{track}`) instead of flat (`/{handle}/{track}`), matching MusicBrainz hierarchy
- Track sidebar label changed from "Smart link" to "Track link" to distinguish from release-level smart links
- Track slug "sounds" is now reserved to prevent collision with the "Use This Sound" route

### Added

- New public track deep link route at `/{handle}/{releaseSlug}/{trackSlug}` with MusicRecording structured data and "from [Release Name]" breadcrumb
- Flat track URLs now 302-redirect to the nested format when a parent release is known
- Artist profiles now capture all 30+ platforms discovered during enrichment (previously only 7 were saved)
- Streaming platforms are automatically promoted to artist pages; other platforms stored for future features
- [internal] Canonical `artist_identity_links` table with provenance tracking for MusicFetch, MusicBrainz, SERP enrichment sources
- [internal] Structured enrichment logging shows returned/stored/published counts per MusicFetch call

### Fixed

- Verified badge no longer overlaps the avatar on artist profiles — badge now sits cleanly inline with the artist name

## [26.4.76] - 2026-03-25

### Changed

- Settings pages now use a cleaner layout — flat section headers replace nested cards, eliminating redundant title bars
- Arrow keys in admin tables now update the detail panel immediately without requiring a click

### Fixed

- Fixed sign-in across all environments by routing authentication through the correct Clerk endpoint
- [internal] Replaced dead `clerk.jov.ie` with `distinct-giraffe-5.clerk.accounts.dev` everywhere: fetch() proxy in middleware, root + app vercel.json rewrites, CSP allowlists, preconnect hints; added Clerk architecture docs to AGENTS.md and CLAUDE.md

### Removed

- [internal] Removed 1,100+ lines of dead settings code (SettingsPolished, DashboardSettings, passthrough wrappers)

## [26.4.75] - 2026-03-25

### Fixed

- Empty states no longer contradict themselves — removed "No Spotify or Apple Music" messages that appeared alongside connected DSP links
- Tour dates empty state now says "No upcoming tour dates" instead of the generic "No tour dates found"
- Product screenshots are now cleaner and more consistent by preventing development-only overlays from appearing
- [internal] Screenshot workflow enables server-side `NEXT_PUBLIC_E2E_MODE` gating and adds an explicit selector for the Next.js dev build indicator

## [26.4.74] - 2026-03-25

### Fixed

- Fixed sign-in on production — authentication requests no longer fail with "Invalid host"
- [internal] Only intercept `/__clerk/*` in middleware for staging; production uses vercel.json rewrites which correctly set the Host header for Clerk's proxy domain validation

## [26.4.73] - 2026-03-25

### Fixed

- Fixed sign-in reliability on staging environments so authentication requests stay in the correct environment
- [internal] Route `/__clerk/*` and `/clerk/*` to the environment-specific Clerk FAPI host

## [26.4.72] - 2026-03-25

### Changed

- Align sidebar tokens with Linear's exact color values — dark mode background elevated from `8 9 10` to `15 16 17`, light mode refined across all sidebar token channels
- Remove `color-mix()` backgrounds from content surfaces, right drawer, and page shell — use flat `var(--linear-app-content-surface)` for cleaner rendering
- Move right panel inside `<main>` content card so sidebar and content share one unified card (matches Linear layout)
- Remove sidebar card chrome — no border, rounded corners, inset shadow, or backdrop-blur on `variant=sidebar`
- Revert BrandLogo from inline SVG back to `next/image` with dark/light theme-aware variants
- Restore JovieLogo and LogoIcon components (previously removed)
- Simplify ChatWorkspaceSurface — strip ContentSurfaceCard wrapper with gradients/shadows
- ProfileCompletionCard: use `border-subtle` token instead of custom color-mix border
- ProfileSidebarHeader: remove "Profile workspace" sub-label
- Empty state in JovieChat: position content near chat input instead of vertical center

### Fixed

- Remove duplicate "Recent actions" section from audience member sidebar — was showing the same data as "Activity" with a different layout
- Cap activity feed to 10 most recent items to keep sidebar concise
- [internal] Fix Clerk proxy test failures when Doppler sets `NEXT_PUBLIC_CLERK_PROXY_DISABLED=1` — explicitly clear disabled flag in tests that expect proxy active

## [26.4.71] - 2026-03-25

### Fixed

- [internal] Remove redundant `force-dynamic` from audience, earnings, and insights dashboard pages — unblocks future PPR optimization
- [internal] Add missing `dashboardLoadError` check to insights page
- [internal] Replace direct `Sentry.captureException` with `captureError()` in earnings page
- [internal] Fix hardcoded `/app/insights` and `/onboarding` redirect URLs to use route constants
- [internal] Wrap presence page in Suspense boundary for instant skeleton streaming
- [internal] Replace `logger.error` with `captureError` in audience and insights catch blocks
- [internal] Show error state instead of fake empty state when DSP presence data fails to load

## [26.4.70] - 2026-03-25

### Added

- [internal] Automated product screenshot generation CI workflow — regenerates homepage screenshots when UI code changes on main, opens auto-merge PR with updated images
- [internal] Orphan screenshot cleanup — CI removes screenshots no longer referenced in source code
- [internal] Exclude screenshot-only changes from triggering main CI pipeline

### Changed

- Convert BrandLogo from image-based rendering to inline SVG with `currentColor` — eliminates double HTTP requests for dark mode, enables CSS-controlled visual hierarchy
- Standardize logo icon sizes: sidebar icons 13/18px → 16px, remove conflicting Tailwind size overrides
- Standardize loading states: all use `tone='muted'` + `animate-pulse` + `animate-in fade-in` for consistent visual weight
- Simplify ProfileNavButton from dual stacked logos to single element with conditional pulse
- LogoLoader: size 64→32px, animation spin→pulse, always muted tone
- [internal] Narrow TypeScript `include` from broad `**/*.ts` glob to explicit source directories, cutting ~1100 files from typecheck scope — cold typecheck drops from 58s to 24s CPU time (59% faster)
- [internal] Add separate `tsconfig.test.json` for test/script file typechecking off the critical path
- [internal] Add `typecheck:tests` script to `apps/web/package.json`

### Fixed

- FooterBranding: wordmark variant now correctly passes `tone='white'` when `isLinear=true` (was defaulting to `auto`)
- SVG asset fill colors: black icon `#222326` → `#000000`, white icon `#F4F5F8` → `#FFFFFF` for maximum contrast at small sizes
- AuthLayout logo animation: one-shot pulse with reduced-motion guard (was permanently looping)
- BrandLogo wrapped in `<span>` to isolate from parent `[&>svg]` selector overrides in CircleIconButton/SidebarMenuButton
- [internal] Tighten E2E error filters — replace 40+ broad substrings (`'clerk'`, `'404'`, `'database'`, `'image'`) with specific vendor patterns so real console errors surface instead of being silently swallowed
- [internal] Add per-page console error monitoring to dashboard health tests with proper listener cleanup between pages
- [internal] Add Clerk UI visibility assertion (`user-button-loaded` data-testid) to catch missing auth shell on desktop
- [internal] Expand nightly E2E config to include dashboard health tests across all 5 browser projects
- [internal] Replace manual `page.on()` listeners in admin health test with `setupPageMonitoring` for consistent error isolation
- [internal] Add safety guards preventing silent test disablement when route matrices are empty

### Removed

- Dead components: JovieLogo, LogoIcon (zero production imports)
- `animate-logo-spin` CSS keyframe (replaced by standard `animate-pulse`)

## [26.4.69] - 2026-03-25

### Changed

- Phone mockup on homepage now matches the real product — Jovie logo top-left, social/action bar replaces dot indicators, mini release card replaces notification CTA, tip amounts corrected to $3/$5/$7, verified badge enabled

### Fixed

- [internal] Clear stale Turbopack cache during setup to prevent `@clerk/ui` module resolution failures in dev mode

## [26.4.68] - 2026-03-25

### Added

- [internal] Add AI chat eval framework with 16 golden cases testing music industry knowledge accuracy, voice compliance, and prompt injection guards
- [internal] Add 30+ unit tests for chat components (ChatInput, ChatMessage, ChatMarkdown, SuggestedPrompts, intent classification, knowledge retrieval, etc.)
- [internal] Extract tool schemas into shared `tool-schemas.ts` for eval runner reuse without importing execute functions
- [internal] Add shared test fixture factories (`chat-context.ts`) for artist context and release data
- [internal] Exclude `tests/eval/` from CI vitest configs to prevent API cost on every push

### Changed

- [internal] Extract right drawer from content container into standalone card — drawer now sits beside main content as a sibling element with its own border, radius, and shadow
- [internal] Apply `rounded-full` pill shape to SegmentControl, CloseButton, and all drawer interactive elements per DESIGN.md spec
- [internal] Normalize drawer internal spacing from `gap-2` to `gap-1.5`

## [26.4.67] - 2026-03-25

### Fixed

- [internal] Fix scroll-reveal cleanup leak — `reveal-js` class now removed on unmount even when no scroll elements exist
- [internal] Add `aria-hidden` and `inert` to crossfaded homepage panels so screen readers only see the active panel
- [internal] Use computed `phoneIndex` instead of duplicating the expression in CrossfadeBlock calls

## [26.4.66] - 2026-03-25

### Added

- [internal] Add 27 middleware behavioral tests for proxy.ts covering cookie banner geo-detection, auth redirects, circuit breaker, bot detection, banned user handling, and domain redirect
- [internal] Add content-positive assertions for top 5 dashboard routes (Chat, Audience, Releases, Earnings, Presence) — health checks now verify the right content loaded, not just absence of errors
- [internal] Wire existing `assertFastPageLoad` performance budgets into dashboard health checks (CI-only)

### Changed

- Unified hero and sticky phone tour into one continuous scroll experience — phone persists from hero through all 4 mode transitions, then logo bar wipes it away
- Hero content (headline, claim form) is now the first "slide" that crossfades into tour mode panels as you scroll
- HeroCinematic is now mobile-only; desktop uses the unified sticky section

### Fixed

- [internal] Fix redirect loop test silently skipping when `E2E_CLERK_USER_PASSWORD` not set — test now runs unauthenticated as intended
- [internal] Stop masking real failures with `test.skip()` on transient navigation errors in smoke tests
- [internal] Use `smokeNavigateWithRetry` for protected route redirect test instead of raw `page.goto`
- Fix scroll infrastructure: split body/html overflow rules so `overflow-x:clip` isn't promoted to `hidden` (which broke `position:sticky`)
- Fix scroll-reveal system: `reveal-js` class was never added to document root, so entrance animations never activated
- Fix MobileNav scroll lock cleanup: use `removeProperty` instead of empty string to prevent ghost inline styles

## [26.4.65] - 2026-03-25

### Changed

- Redesigned audience table with sortable columns for easier fan management
- Redesigned profile hero with larger artist image and cleaner layout
- [internal] Revamp audience table to Linear layout — break composite cells into individual columns (User, Type, Location, Intent, Visits, LTV, Last Action), show sortable column headers, inline touring badge into user cell
- [internal] Redesign v2 profile hero from cramped horizontal card to centered vertical layout with large artist image (160px mobile / 192px desktop), conditional shape (rounded-full for avatar, rounded-2xl for release artwork), and no card chrome
- [internal] Strip avatar from sticky profile header — artist identity now lives prominently in the hero section
- [internal] Lighten sticky header border opacity for a more minimal navigation feel
- [internal] Automated keyword filtering for public changelog — vendor names, dev tooling, staging URLs, and infrastructure patterns are now auto-filtered even without the `[internal]` prefix
- [internal] Cleaned up ~80 existing changelog entries: tagged internals, rewrote verbose entries to be benefit-led and concise

### Removed

- [internal] Remove redundant calendar date badge from profile hero card (eyebrow text already communicates timing)
- [internal] Remove card container chrome (border, background, shadow, divider) from profile hero

## [26.4.64] - 2026-03-25

### Fixed

- Add "Cookie Settings" button to site footer for GDPR-regulated regions so users can reopen cookie preferences after dismissing the banner
- Load saved cookie preferences when reopening the cookie modal instead of always showing defaults
- Sync tracking consent state (`jv_tracking_consent`) when users accept or reject cookies via the banner or modal
- Add "Cookie Settings" action to the user profile menu for authenticated users
- Add accessible dialog description to the cookie preferences modal
- Fix Clerk proxy URL mismatch — align code to use `/__clerk` path matching Clerk Dashboard proxy configuration, restoring Google OAuth callbacks and Clerk JS loading on production
- Remove double shell around releases table — table now fills edge-to-edge within the app shell frame, matching Linear's table route pattern

## [26.4.63] - 2026-03-24

### Changed

- Redesigned homepage with a cleaner, more focused layout

### Removed

- [internal] Remove ValuePropsSection, PhoneProfileDemo, AiSection, PricingSection, TestimonialsSection, and FaqSection from homepage — pricing moves to nav, FAQ to /support

## [26.4.62] - 2026-03-24

### Changed

- Redesigned pricing page with cleaner layout and easier plan comparison on mobile

### Fixed

- Fixed sign-in not loading on some environments
- [internal] Fix auth not loading on production and staging by reverting Clerk proxy from SDK `frontendApiProxy` back to Vercel rewrite
- [internal] Add locally bundled Clerk UI to dashboard provider for consistent auth rendering
- [internal] Center logo relative to Clerk sign-in card by moving it inside the form wrapper container

## [26.4.61] - 2026-03-24

### Fixed

- Sign-ups now go straight to onboarding — no more waitlist

### Changed

- Profile V2 layout is now the default for all artist profiles
- [internal] Skip Statsig feature flag evaluation in dev mode to reduce request overhead — all flags return defaults, matching existing behavior when no server secret is configured

## [26.4.60] - 2026-03-24

### Fixed

- [internal] Bump database connection pool from 10 to 20 for launch burst traffic capacity
- [internal] Health check endpoint now uses lightweight query to reduce load
- Notification emails now show native unsubscribe button in Gmail and Outlook
- Fixed blank sign-in pages that could occur intermittently

## [26.4.59] - 2026-03-24

### Added

- [internal] `/demo/audience` route — auth-free audience CRM demo page for screenshots and marketing

### Changed

- [internal] Product screenshots now captured from `/demo` pages instead of authenticated dashboard routes — eliminates login screen screenshots
- [internal] Releases screenshot spec uses `/demo` route with graceful image loading fallbacks
- [internal] Audience screenshot spec uses `/demo/audience` route

### Removed

- [internal] Insights screenshot spec — insights feature not currently shipping

## [26.4.58] - 2026-03-24

### Fixed

- Fixed onboarding skipping steps (handle, avatar, Spotify connect) after waitlist approval
- Fixed redirect loop between dashboard and onboarding
- [internal] Waitlist approval was auto-completing onboarding, skipping handle selection, avatar upload, and Spotify connect
- [internal] Profile completion redirect was enforcing avatar as a hard requirement, causing infinite redirect loops
- [internal] Signup redirect sent new users to waitlist page instead of onboarding
- [internal] Service worker toggle broken on Vercel preview deploys due to NODE_ENV always being 'production' — now uses NEXT_PUBLIC_VERCEL_ENV for accurate environment detection
- [internal] Fixed a rare error when unregistering stale service workers

### Changed

- [internal] Removed `inviteToken` from waitlist API response — token-based claim flow replaced by direct approval
- [internal] Service worker disabled by default in development with dev toolbar toggle to re-enable for PWA testing

### Added

- [internal] Service worker control utilities (`lib/service-worker/control.ts`) for shared SW registration/unregistration logic
- [internal] Dev toolbar SW toggle button for explicit service worker opt-in during development

## [26.4.57] - 2026-03-24

### Fixed

- Visual polish: fixed homepage background color, CTA button color, and profile typography

### Added

- [internal] Golden path E2E test coverage: onboarding completion, responsive layout, pro feature gates, payment flow
- [internal] Shared Stripe test helpers for consistent payment E2E testing

## [26.4.56] - 2026-03-24

### Fixed

- Fixed missing font on sign-in and sign-up pages
- Fixed blank screen flash on sign-in page
- Terms of Service and Privacy Policy links on sign-up are now easier to tap on mobile

## [26.4.55] - 2026-03-24

### Fixed

- [internal] OAuth login on staging redirecting to `jov.ie/__clerk` instead of `staging.jov.ie/__clerk` — added runtime hostname-based Clerk key selection so staging uses its own Clerk instance
- [internal] Dual Clerk middleware instances (production + staging) with lazy initialization
- [internal] 8 dynamic layouts now resolve publishable key from request headers instead of build-time env var

## [26.4.54] - 2026-03-24

### Fixed

- Fixed broken checkmarks on comparison page
- Corrected AI assistant free tier limit display (25 msgs/day)
- Fixed broken footer link
- [internal] Missing H1 on /launch/pricing — promoted heading from h2 to h1 for SEO/accessibility
- [internal] ProductScreenshot fallback showed developer-facing text on production — replaced with user-friendly "Preview coming soon"
- [internal] /ai page exposed internal founder AI workflow publicly — redirected to investor portal with noindex

## [26.4.53] - 2026-03-24

### Changed

- [internal] Disabled Sentry client SDK initialization in development — eliminates 20-80KB of unnecessary JS overhead during local dev

### Fixed

- [internal] Clerk "Failed to load script" error in local development — `frontendApiProxy` now only enabled in production/preview where the proxy target is reachable

## [26.4.52] - 2026-03-24

### Fixed

- Fixed authentication not loading on some environments
- [internal] Auth broken on both staging and production — migrated Clerk proxy from static `vercel.json` rewrites (hardcoded to `clerk.jov.ie`) to Clerk SDK's built-in `frontendApiProxy` middleware
- [internal] Removed stale `NEXT_PUBLIC_CLERK_PROXY_URL` from Doppler prd/stg configs
- [internal] Updated Clerk middleware bypass paths from `/clerk` to `/__clerk` (SDK default)
- Fixed duplicate "Jovie" in page titles
- [internal] Screenshot pipeline auth guard now allows `+clerk_test` emails without password
- [internal] Clerk proxy disabled for screenshot dev server (avoids HTTPS requirement on localhost)
- [internal] Profile screenshot locator no longer matches hidden dark-mode logo images

### Added

- Homepage product screenshots: audience CRM dashboard, artist profile (phone + desktop)
- [internal] E2E authentication documentation in TESTING.md and CLAUDE.md

### Removed

- Founder quote from homepage testimonials section (Tim White quote card)

## [26.4.51] - 2026-03-24

### Fixed

- Improved 404 page messaging
- [internal] Marketing route 404s no longer render double header/footer (added `(marketing)/not-found.tsx`)
- Changelog subscribe confirmation now more visible
- [internal] ProductScreenshot fallback shows clean "Coming soon" instead of a developer-facing placeholder message

## [26.3.51] - 2026-03-24

### Fixed

- [internal] Removed `merge=union` strategy from CHANGELOG.md that was silently creating duplicate and malformed entries on merge
- [internal] Fixed CI deploy pipeline deploying directly to production before canary health checks — staging deploy now creates a preview deployment first

## [26.3.50] - 2026-03-23

### Changed

- [internal] Made Clerk proxy URL environment-driven to support separate staging Clerk instance
- [internal] Production uses `/clerk` Vercel rewrite; staging uses direct `https://clerk.staging.jov.ie`

## [26.3.49] - 2026-03-23

### Added

- Redesigned blog with magazine-style layout, author pages, and category pages
- [internal] Enhanced Article JSON-LD schema with author URL, keywords, word count, and date modified
- [internal] Added `buildPersonSchema()` for author page structured data
- [internal] Blog author and category pages included in sitemap with accurate `lastModified` dates
- Blog posts now show tags and estimated reading time

### Changed

- [internal] Blog index replaced timeline layout with editorial magazine grid (featured + 2-column cards)
- [internal] Blog post priority bumped from 0.6 to 0.7 in sitemap
- [internal] `BlogMarkdownReader` semantic HTML: moved `<article>` wrapper to page level
- [internal] Extended `ResolvedAuthor` with `bio` and `username` fields from Jovie profile data
### Changed

- [internal] Migrated investor portal from subdomain (`investors.jov.ie`) to path-based auth (`/investor-portal`)
- [internal] Legacy subdomain now 301 redirects to `/investor-portal`, preserving token params
- [internal] Replaced emoji-based deck navigation with Lucide icons (ChevronLeft/Right, Download, Maximize2)
- [internal] Added touch swipe support and slide dot navigation to pitch deck viewer
- [internal] Implemented mobile hamburger slide-out sheet navigation for investor portal
- [internal] Improved responsive typography and padding across deck viewer and memo content
- [internal] Added loading skeleton for investor memo pages
- [internal] Token display in admin investor table now shows truncated token with copy-to-clipboard

### Removed

- [internal] Removed subdomain-based token validation from investor page components (now handled by middleware)
- [internal] Removed duplicate `requireInvestorAccess` from layout (middleware is single source of truth)

### Fixed

- [internal] Added top padding on mobile to prevent content hiding behind fixed header
- [internal] Added `dark` class to investor respond page containers for consistent theming
- [internal] Fixed sticky bar button layout for proper mobile stacking

## [26.4.48] - 2026-03-23

### Fixed

- Fixed cropped app icons on installed PWA
- Improved PWA reliability

### Added

- Offline fallback page for installed PWA
- Pinch-to-zoom now works on all pages
### Changed

- Expanded support page with documentation links and FAQ

### Fixed

- Fixed duplicate "Jovie" in support page title
## [26.3.48] - 2026-03-23

### Changed

- [internal] Bumped all dependencies to latest compatible versions across monorepo
- [internal] Updated Next.js 16.1.7 → 16.2.1, Sentry 10.39.0 → 10.45.0, Tailwind CSS 4.1.18 → 4.2.2
- [internal] Upgraded Biome 2.3.11 → 2.4.8, Turbo 2.8.9 → 2.8.20, Vitest 4.0.18 → 4.1.1
- [internal] Bumped Storybook 10.2.x → 10.3.3, AI SDK 6.0.116 → 6.0.137, Motion 12.29.0 → 12.38.0
- [internal] Updated lucide-react 0.577.0 → 1.0.1 (replaced removed brand icons with generic equivalents)
- [internal] Bumped pnpm overrides: vite ^6.4.1, rollup ^4.60.0, axios ^1.13.6
- [internal] Excluded HTML files from Biome lint (new in 2.4, not previously linted)
## [26.4.48] - 2026-03-24

### Changed

- Redesigned sign-in and sign-up pages with improved styling and polish
- Improved verification code input with larger digits and visual feedback
- [internal] Consolidated Clerk auth styling to CSS-primary architecture (theme.css single source of truth)
- [internal] Primary button hover now uses accent-hover color instead of subtle opacity change
- [internal] Social/primary button hover lift only on pointer devices (no fidget on touch)
- [internal] All auth transitions use design system easing (--ease-interactive)
- [internal] Divider "or" text increased to 12px for readability
- [internal] Footer link hover uses accent color instead of barely-visible opacity
- [internal] Softened auth card shadow for less aggressive depth

### Fixed

- [internal] Modal backdrop/content styles now correctly target portaled elements outside auth root
- [internal] Input error state uses correct Clerk data attributes (data-feedback, aria-invalid)
- [internal] Focus ring opacity normalized to 0.28 across all interactive elements
- [internal] Warning text uses --linear-warning token instead of hardcoded oklch value

### Added

- [internal] Styling for 13 previously unstyled Clerk elements: forgot password link, back button, hint/warning/error text, step headers, alternative methods, verification status, phone input, selectors, badges, modals
- Disabled and loading states for buttons and inputs
- Accessible handle availability indicator on sign-up

## [26.4.47] - 2026-03-23

### Changed

- Updated design system and color tokens to match Linear's March 2026 refresh
- [internal] Rewrote DESIGN.md as complete design system spec (typography, colors, spacing, motion, component patterns)
- [internal] Updated theme base hue 272→282, font weight book 400→450, light sidebar color corrected
- [internal] Normalized all OKLCH hue references from 260/272 to 282 across token files

### Fixed

- Fixed oversized marketing headlines on wide screens
- Improved text spacing consistency across navigation and UI elements
- [internal] Marketing H1 capped at 64px (was 76px at >=1280px), H2 capped at 48px (was 56px at >=1440px)
- [internal] H1 line-height corrected from 1.0 to 1.06; removed global letter-spacing from body

## [26.3.48] - 2026-03-23

### Fixed

- [internal] Reduced Sentry error noise (~80% of monthly budget) by filtering known non-actionable errors
- [internal] Replaced `captureWarning` with `console.warn` for expected build-info read failures in dev
- [internal] Changed retryable DB errors to log as Sentry breadcrumbs instead of exceptions
- [internal] Added CSP violation filtering (browser extension noise) to `scrubPii`
- [internal] Added `ignoreErrors` patterns for build-info, FeaturedCreators timeout, daily budget, hooks mismatch

### Removed

- [internal] Removed Sentry example page and API route (dev-only test scaffolding)
### Added

- New /about page with founder story and FAQ
- New comparison pages: Jovie vs Linktree, Jovie vs Linkfire
- New alternatives pages for link-in-bio tools
- [internal] Brand disambiguation in llms.txt and new llms-full.txt for AI engine optimization
- [internal] FAQ section with FAQPage JSON-LD schema on homepage
- [internal] Article and BreadcrumbList JSON-LD schemas on all blog posts
- [internal] FAQ schema builder, Article schema builder, and Breadcrumb schema builder utilities
- [internal] Entity IDs (@id) for consistent knowledge graph across Organization, WebSite, and SoftwareApplication schemas
- [internal] knowsAbout, foundingDate, and additionalType fields on Organization schema
- [internal] /about, /pricing, /support, /tips, /changelog added to sitemap

### Fixed

- [internal] Corrected sameAs schema links from non-existent @jovieapp accounts to real @meetjovie Instagram

## [26.3.47] - 2026-03-23

### Fixed

- [internal] Secured audience opt-in endpoint with HMAC-signed tokens to prevent unauthenticated email manipulation
- Fixed broken opt-in link in tip thank-you emails
- [internal] Added rate limiting (30/hour per IP) to tip checkout session creation endpoint
- [internal] Clamped admin list endpoints (creators, users) to max 100 pageSize to prevent unbounded queries

### Added

- [internal] Added `opt-in-token` module with HMAC token generation, verification, and URL building
- [internal] Added `tipCheckout` rate limiter (30 sessions/hour per IP) for public checkout endpoint
- [internal] Added unit tests for opt-in token roundtrip, rejection of tampered/malformed tokens, and URL generation
### Changed

- Redesigned settings with cleaner navigation and dedicated pages for each section

### Fixed

- [internal] Added feature gate to payments settings page (Stripe Connect flag)
- [internal] Added admin guard to admin settings page (isAdmin check)
- [internal] Fixed settings routes to use proper constants (SETTINGS_ACCOUNT, SETTINGS_DATA_PRIVACY, etc.)

### Removed

- [internal] Removed duplicate /account card-grid dashboard entry point (redirects to /app/settings/account)
- [internal] Removed hash-based navigation in settings (fully route-based now)
- [internal] Removed referral nav item from settings sidebar

## [26.3.46] - 2026-03-23

### Added

- [internal] Shared Clerk appearance and availability helpers, a reusable auth-route prefetch helper, and an explicit auth-unavailable fallback card for auth routes
- [internal] Focused unit coverage for auth layout fallback behavior, onboarding waitlist guarding, Clerk provider configuration, and the updated sign-in/sign-up Clerk props
- [internal] Added shared standalone product shells, redirect surfaces, and loading-state primitives to align non-marketing product routes with the Linear-inspired app system
- [internal] Added typed dashboard activity-feed normalization and regression tests so stale emoji payloads safely coerce to supported icons

### Changed

- Refreshed app design system for more consistent layout and visual polish
- [internal] Aligned auth, billing, HUD, investor admin, public redirect, and utility product surfaces to the Linear-inspired product design system and shared page shells
- [internal] Refreshed retargeting ad preview tooling, billing success celebration, and product-shell rhythm for more consistent product-side layout and feedback

### Fixed

- Sign-in and sign-up pages now match Jovie's dark theme
- Fixed an issue where new users could briefly see the wrong page during sign-up
- [internal] Theme Clerk's prebuilt auth UI to match Jovie dark mode and bundle the Core 3 UI assets through the auth provider instead of falling back to the stock dark styling
- [internal] Route post-signup users through the canonical waitlist and onboarding gate so waitlist-state users no longer fall into onboarding and see the flow flip underneath them
- [internal] Preserve redirect-aware auth navigation while hardening mock and misconfigured Clerk fallback handling, provider config, and related auth smoke coverage
- [internal] Prevent delayed public-link redirects from firing after unmount and restore standalone billing success scrolling with accessible verification feedback
- [internal] Fix Vercel preview builds by matching App Router function globs and keep PR smoke runs on the fast E2E iteration path
- [internal] Normalize CalVer release metadata by syncing `version.json`, workspace package versions, and the changelog head

## [26.4.45] - 2026-03-23

### Added

- [internal] Added 5 agent reference docs: database schema map, API route map, cron registry, webhook map, and library module index
- [internal] Added documentation index section to AGENTS.md linking to all reference docs

## [26.4.44] - 2026-03-22

### Fixed

- [internal] Fixed an issue where waitlist approvals in the admin board could appear successful without fully updating the user's account
- [internal] Invited people on the waitlist can now be fully approved from the admin board
- Fixed a rare routing issue where people still on the waitlist could briefly land on onboarding
- Admin board now blocks invalid claimed→invited drag transitions until proper reversion support is added
- Bulk approve action now includes invited entries, matching individual approval behavior

## [26.4.43] - 2026-03-22

### Changed

- [internal] Document all 11 custom ESLint rules, 12 Claude hooks, canonical import paths, and file creation templates in AGENTS.md so agents stop failing on preventable mistakes
- [internal] Fix duplicate guardrail numbering (#10/#11/#12 → #13/#14/#15) and incorrect cache preset references (`DYNAMIC_CACHE` → actual presets from `cache-strategies.ts`)
### Added

- Improved security for contact link protection
- [internal] AES-256-GCM encryption for wrapped links with versioned envelope format (`v: 1`), replacing base64 obfuscation
- [internal] Zod input validation schemas for `/api/wrap-link` (POST/PUT/DELETE) with SSRF-safe URL validation
- [internal] Zod input validation for `/api/growth-access-request` replacing manual string checks
- [internal] Migration script (`scripts/migrate-wrapped-links.ts`) to re-encrypt legacy base64 wrapped links to AES-GCM
- [internal] Documented contact obfuscation threat model (intentional anti-scraping, not cryptographic protection)
- [internal] 25 new tests: encryption round-trip, versioned envelope detection, legacy format fallback, schema validation

### Changed

- [internal] Link wrapping now stores encrypted URLs as versioned JSON envelopes instead of raw base64
- [internal] Decrypt path auto-detects format: AES-GCM envelope (`v: 1`) or legacy base64 fallback

## [26.4.42] - 2026-03-22

### Fixed

- Improved sign-in and sign-up reliability
- [internal] Use Clerk's prebuilt auth components on `/signin` and `/signup` so sign-in, sign-up, and Google OAuth flows no longer depend on the fragile custom multi-step auth runtime
- [internal] Update auth page and smoke tests to validate the rendered Clerk flows and canonical auth-route navigation instead of the removed custom stepper UI

### Changed

- [internal] Update auth testing docs to explain the Clerk Playwright setup, signed-out auth-page coverage, and gstack `/browse` QA flow

### Removed

- [internal] Delete the obsolete custom Clerk auth hooks, multi-step auth form components, and their unused tests after the prebuilt auth cutover
- Fix duplicate "Jovie" in public profile page title — browser tab showed "Tim White | Jovie | Jovie" instead of "Tim White | Jovie"
### Added

- [internal] Dev toolbar "Clear" button to nuke all cookies, localStorage, and sessionStorage in one click — fixes environment cross-contamination when testing dev and production in the same browser
- [internal] Server-side `/api/dev/clear-session` endpoint with prefix-based Clerk cookie deletion (catches suffixed variants like `__session_<suffix>`) and production guard
- [internal] Toolbar state (`__dev_toolbar` cookie and localStorage keys) preserved across session clear so the toolbar stays visible after reload

## [26.4.41] - 2026-03-22

### Added

- Blog author sections now pull display name, avatar, and verified badge from the author's Jovie profile instead of hardcoded frontmatter
- [internal] Batch profile query `getProfilesByUsernames` for efficient blog index rendering
- [internal] `resolveAuthor` helper with graceful fallback to frontmatter when profile is not found
### Fixed

- [internal] Fix feature flags not showing in dev toolbar — toolbar was outside the FeatureFlagsProvider tree so the flags panel never rendered
- [internal] Extract shared `FF_OVERRIDES_KEY` constant to prevent key drift between toolbar and provider

## [26.4.40] - 2026-03-22

### Fixed

- [internal] Fix deploy failure caused by out-of-order migration journal timestamps — Drizzle was silently skipping migration 0007 because its timestamp was earlier than an already-applied migration
- [internal] Add monotonic timestamp validation to `validate-migrations.sh` CI guard to prevent future out-of-order journal entries
### Added

- [internal] `scripts/browse-auth.ts` — Playwright script to authenticate Clerk test users for gstack `/browse` headless QA sessions

### Fixed

- [internal] Handle both `UseSignInReturn` and `SignInSignalValue` types from Clerk v6 in auth hooks
- [internal] Add type overlays for `SignInResource`/`SignUpResource` to match runtime Signal API

## [26.4.39] - 2026-03-21

> [internal] Audit changelog for customer and investor safety.

### Changed

- [internal] Hide sensitive entries (old pricing, scraping pipeline, YC demo tooling, admin features, vendor names, conversion funnel tactics) behind `[internal]` prefix
- [internal] Rewrite technical entries into customer-friendly language
- [internal] Remove blog post references from public changelog

## [26.4.38] - 2026-03-21

### Fixed

- Use the canonical `BASE_URL` for signup metadata so `/signup` Open Graph URLs and images resolve to `jov.ie` instead of the deprecated app domain
### Added

- [internal] Centered Jovie brand logo in the dev toolbar bottom bar (theme-aware, auto dark/light)
- [internal] Viewport breakpoint indicator in dev toolbar showing current Tailwind breakpoint (xs–2xl)

## [26.4.37] - 2026-03-21

### Changed

- Update hero copy: "The link your music deserves." with subhead "Share every release. Reach every fan. Automatically."
- [internal] Standardize all documentation, snippets, and AI rules to reference Lucide React as the first-choice icon library (replacing stale Heroicons references)
- [internal] Replace dead CSS icon classes in phone mockup preview with working SocialIcon and Lucide React components
- [internal] Replace inline SVG icons in phone mockup preview with Lucide React components (ChevronRight, Link2)

### Removed

- [internal] Remove non-functional `getPlatformIcon()` utility that returned UnoCSS class strings (UnoCSS not installed)

## [26.4.36] - 2026-03-21

### Fixed

- Fixed a rare issue where some users could get stuck in a redirect loop after signing up
- [internal] Consolidate 5 independent profile completeness checks into one canonical `isProfileComplete()` function, eliminating the redirect loop bug class between `/app` and `/onboarding`
- [internal] Add ACTIVE user guard on onboarding page to break redirect loops from stale proxy cache or direct navigation
- [internal] Add circuit breaker in proxy.ts that detects and breaks redirect loops after 3 redirects in 30 seconds

## [26.4.35] - 2026-03-21

### Added

- Preview panel with live mobile profile preview, profile snapshot metrics, and share actions
- Profile sidebar header with copy URL, download QR code, and download vCard actions

### Changed

- [internal] Dashboard drawer headers support ReactNode titles with multi-line metadata
- [internal] Auth hooks (`useSignInFlow`, `useSignUpFlow`) refactored to use Clerk Core API via shared `useAuthFlowBase`
- [internal] `useClerkSafe` hooks provide context-based safe access to Clerk state outside `ClerkProvider`

### Fixed

- [internal] Remove `void` operator anti-pattern from async onClick handlers (SonarCloud)
- [internal] Fix timeout stacking in error display copy button with ref-based cleanup
- Fix image remove button not visible on touch devices
- [internal] Fix test state mutation in `useSignInFlow` tests with proper `beforeEach`/`afterEach` scoping
### Fixed

- [internal] Make CI schema verify step block deploys when database columns are missing — prevents shipping code that references columns not yet in production
- [internal] Add repair migration for `discovered_pixels`, `discovered_pixels_at`, `pitch_context`, and `generated_pitches` columns that were tracked as applied but never executed
- [internal] Fix referral settings page passing Clerk user ID to a UUID column — now converts to internal UUID first, redirects to onboarding if user record missing

## [26.4.34] - 2026-03-21

### Fixed

- Fixed incorrect artist photos appearing on some profiles
- [internal] Block blacklisted Spotify artist IDs from polluting profiles during MusicFetch enrichment — prevents wrong artist photos, discography imports, and spotifyId overwrites
- [internal] Allow re-enrichment recovery when a profile's stored spotifyId is blacklisted but the enrichment URL points to the correct artist

## [26.4.33] - 2026-03-21

### Fixed

- [internal] Dev toolbar "Unwaitlist" button now invalidates proxy user state cache on repeat clicks, fixing stale waitlist redirects after approval
### Added

- AI-powered playlist pitch generator: auto-generates per-platform pitches (Spotify, Apple Music, Amazon, Generic) from artist and release data
- New "Pitch context" field in Settings > Artist Profile for artists to provide streaming milestones, press coverage, radio play, and other context the AI can't auto-detect
- [internal] Pitch generation service using Claude via Vercel AI SDK with structured output and Zod validation
- [internal] Per-platform character limit enforcement (Spotify 500, Apple Music 300, Amazon 500, Generic 1000) with smart truncation fallback
- Release sidebar "Playlist Pitches" section in the Details tab with generate, regenerate, and copy-to-clipboard per platform
- [internal] Rate limiting: 10 pitch generations per hour per user
- [internal] 28 new tests covering prompt builders, Zod schema validation, truncation logic, and profile validation

## [26.4.32] - 2026-03-21

### Added

- AI chat now gives more accurate, specific advice based on deep music industry knowledge
- [internal] Knowledge-aware AI chat — keyword router selects relevant music industry topics and injects them into the system prompt for accurate, specific advice
- [internal] `lib/chat/knowledge/topics.ts` — topic registry that loads distilled knowledge docs at cold start
- [internal] `lib/chat/knowledge/router.ts` — keyword-based topic selection (top 2 matches per message, min score threshold)

### Changed

- [internal] Upgraded Clerk SDK to v7 (Core 3): `@clerk/nextjs` 6.36.7→7.0.6, `@clerk/backend` ^2.32→^3.2, `@clerk/clerk-js` ^5.121→^6.3, `@clerk/testing` ^1.13→^2.0
- [internal] Replaced removed `SignedIn`/`SignedOut` components with new `Show` component (`when="signed-in"` / `when="signed-out"`)
- [internal] Migrated `useSignIn` and `useSignUp` hooks to `@clerk/nextjs/legacy` import path (v7 moved these to a signal-based API; legacy maintains the imperative `{ signIn, setActive, isLoaded }` shape)
- [internal] Updated test mocks to match v7 exports

## [26.4.29] - 2026-03-20

### Added

- [internal] YC demo Playwright spec (`yc-demo.spec.ts`) that records the full onboarding flow at watchable pace with deliberate pauses for voiceover narration
- [internal] Demo-specific Playwright config (`playwright.config.demo.ts`) with video recording always on, 1280x720 viewport, single worker
- [internal] Shared E2E helper module (`helpers/e2e-helpers.ts`) extracted from golden-path spec for reuse across test specs
- [internal] `demo:record` script in package.json for one-command demo video recording
## [26.4.31] - 2026-03-21

### Added

- [internal] Music industry knowledge canon — scrape + distill pipeline that ingests 670+ pages from trusted music industry sources and synthesizes them into 8 authoritative topic guides
- [internal] `scripts/knowledge/fetch.ts` — automated fetcher with resume support, exponential backoff, QA gate, and provenance manifest for internal auditing
- [internal] `scripts/knowledge/distill.ts` — LLM-powered distillation that curates top articles per topic and synthesizes via Claude Sonnet into source-agnostic reference guides
- [internal] 8 distilled knowledge docs: release strategy, playlist strategy, streaming metrics, profile optimization, marketing/promotion, distribution basics, monetization, music rights

## [26.4.30] - 2026-03-21

### Fixed

- [internal] Set `active_profile_id` in all onboarding claim paths — `createProfileForExistingUser`, `updateExistingProfile`, and waitlist approval now update `users.active_profile_id`
- [internal] Restrict stored function profile lookup to claimed profiles only (`is_claimed = true`), matching backfill behavior

## [26.4.30] - 2026-03-20

### Added

- [internal] Defensive handling for all Clerk sign-in statuses (`needs_second_factor`, `needs_client_trust`, `needs_new_password`, `needs_first_factor`) with clear user-facing error messages
- Two-factor authentication now works seamlessly during sign-in
- [internal] `verificationReason` field exposed from sign-in hook for context-aware UI copy (MFA vs device trust)
- [internal] `abandoned` status handling in sign-up flow with specific "interrupted" message
- [internal] Unit tests for all new sign-in status branches (7 tests) and sign-up status branches (2 tests)
### Changed

- [internal] Removed "Primary goal" step from waitlist onboarding — form now starts directly with social platform selection (2 steps instead of 3)
- [internal] Adopted Linear in-app design system (`rounded-full`) for all auth buttons and inputs globally
- [internal] Unified waitlist form focus rings to use `--linear-border-focus` token instead of ad-hoc accent colors
- [internal] Normalized platform pill typography to Linear caption tokens
- [internal] Made `primaryGoal` optional in API validation (DB column was already nullable)

### Removed

- [internal] `WaitlistPrimaryGoalStep` component and `PrimaryGoal` type — no longer part of onboarding flow
### Fixed

- [internal] CSP `connect-src` now allows Sentry regional ingest URLs (`*.ingest.us.sentry.io`) — fixes silent error reporting failure
- [internal] CSP `script-src` includes `@vercel/analytics` inline script hash — eliminates console CSP violation
- [internal] Statsig "Server secret not configured" warning now logs once instead of 48+ times per page load

### Added

- [internal] Unit tests for new CSP entries (Sentry regional wildcard, Vercel analytics hash)
- [internal] Unit test for Statsig warn-once behavior

## [26.4.29] - 2026-03-20

> The changelog is now customer-friendly — no more developer jargon on the public page, RSS feed, or emails.

### Changed

- Public changelog page, RSS feed, and subscriber emails now show plain-language summaries and hide developer-facing details
- Each release has a short summary at the top describing what changed in simple terms
- [internal] Consolidated changelog parsing into a shared module used by the page and RSS feed

### Added

- [internal] Shared changelog parser (`apps/web/lib/changelog-parser.ts`) used by both the page and RSS feed
- 12 unit tests for the shared changelog parser

## [26.4.29] - 2026-03-20

> [internal] YC demo recording tooling.

### Added

- [internal] YC demo Playwright spec (`yc-demo.spec.ts`) that records the full onboarding flow at watchable pace with deliberate pauses for voiceover narration
- [internal] Demo-specific Playwright config (`playwright.config.demo.ts`) with video recording always on, 1280x720 viewport, single worker
- [internal] Shared E2E helper module (`helpers/e2e-helpers.ts`) extracted from golden-path spec for reuse across test specs
- [internal] `demo:record` script in package.json for one-command demo video recording

### Changed

- [internal] Refactored golden-path.spec.ts to import helpers from shared module instead of inlining them
- [internal] `ensureDbUser()` now accepts optional `knownSpotifyArtistIds` parameter for caller-specific Spotify ID cleanup
- [internal] `createFreshUser()` no longer calls `ensureDbUser()` internally — callers handle DB setup explicitly

## [26.4.29] - 2026-03-21

> Tips are now more reliable, and your dashboard handles errors more gracefully.

### Fixed

- Tips now process correctly even in rare edge cases
- [internal] Stop capture-tip infinite Stripe retry loop — return 200 with fire-and-forget Sentry alert instead of 500 when creator profile not found
- [internal] Store immutable profile_id in Stripe payment intent metadata so capture-tip webhook can resolve creators without relying on mutable handle lookups
- [internal] Validate profile_id still exists before tip insert to prevent FK violation causing 500 retry loops
- [internal] Check isPublic flag on creator profile in create-tip-intent to match checkout flow behavior
- Dashboard pages show a friendly error message instead of redirecting to sign-in during temporary outages
- [internal] Add auth-first guards (getCachedAuth before getDashboardData) on dashboard pages to prevent unauthenticated access during DB outages
- [internal] Escalate stripe-tips webhook from logger.warn to captureCriticalError with redacted email context
- [internal] Dashboard pages (earnings, audience, releases, presence) show PageErrorState with consistent captureError telemetry instead of redirecting to signin on DB failure
- [internal] Add error tracking to batchUpdateSequential with succeeded count and failed item context
- [internal] Use APP_ROUTES.ONBOARDING constant instead of hardcoded paths

## [26.4.28] - 2026-03-20

> Fixed a rare issue where some users couldn't access their dashboard after signing up.

### Fixed

- Fixed an issue where some new users would see a "no active profile" error after signing up
- [internal] Add missing `active_profile_id` column to production database — migration was lost during migration squash, causing 6 Sentry errors across auth, session, and dashboard queries
- [internal] Backfill `active_profile_id` for existing users with claimed profiles — prevents "no active profile" state after column is added
- [internal] Update `create_profile_with_user()` stored function to set `active_profile_id` during onboarding
- [internal] Deterministic backfill query uses correlated subquery with `ORDER BY created_at ASC LIMIT 1` to handle multi-profile users
- [internal] Stored function prefers claimed profiles over unclaimed ones when selecting existing profile
- [internal] Fix migration journal timestamp ordering so new migration runs after existing ones on all environments
- Returning to the waitlist page after being approved no longer accidentally locks you out
- [internal] Waitlist re-submission no longer silently downgrades approved users — `upsertUserAsPending` is now guarded behind `existing.status === 'new'`, preventing approved users from being locked out if they re-hit the waitlist endpoint via stale bookmark or direct API call
- [internal] Added regression test for waitlist status downgrade protection

### Added

- [internal] Dev toolbar "Unwaitlist" button for self-approving waitlist entry during local testing
- [internal] Dev-only API route `POST /api/dev/unwaitlist` reusing existing approval logic (blocked in production)

## [26.4.27] - 2026-03-20

> Improved security and fixed several sign-up issues. Google sign-up now shows a clear message when the account already exists.

### Fixed

- Google sign-up now shows a clear error message when your account already exists, with a link to sign in instead
- Sign-up page now shows an error message if something goes wrong while checking handle availability
- [internal] Hardened redirect URL sanitization against backslash and encoded bypass attacks (e.g., `%5C`, `%2F`)
- [internal] Click count increment on `/go/:id` redirects now uses `after()` to survive serverless teardown
- [internal] Email open/click tracking events now use `after()` to prevent lost analytics in serverless environments
- [internal] Pixel settings API no longer fetches actual token values from database — uses SQL-level `IS NOT NULL` booleans instead
- [internal] OAuth callback handler uses imperative Clerk API for proper error classification (account exists, access denied, unknown)

## [26.4.26] - 2026-03-20

> Fixed an issue where the wrong artist photo could appear on the homepage.

### Fixed

- Homepage and featured creators now always show the correct artist photo
- [internal] Spotify artist blacklist for founder identity protection — blocks 24 wrong "Tim White" Spotify IDs from search results, DSP enrichment, and profile claiming
- [internal] Safety assertion prevents accidental self-blacklisting of the correct Tim White Spotify ID
- [internal] Observability logging when blacklisted artists are filtered from search results
- [internal] DSP enrichment pipeline can no longer overwrite Tim White's profile with wrong artist data

## [26.4.25] - 2026-03-20

> [internal] CI/CD reliability improvements.

### Changed

- [internal] Schema verify step (`drizzle:verify:ci`) is now non-blocking — schema drift warns via Slack instead of blocking all deploys for days
- [internal] Vercel deploy step retries up to 3 times for transient failures (10s backoff)
- [internal] Health monitor auto-reruns failed CI deploys (once per run, prevents infinite loops via `run_attempt` check)
- [internal] Health monitor permissions upgraded from `actions: read` to `actions: write` to support auto-rerun

## [26.4.24] - 2026-03-20

> [internal] Database migration cleanup.

### Changed

- [internal] Squash 79 pre-launch migrations into single v1 baseline (84 tables) with separate RLS/function migration
- [internal] Remove ~400 LOC dead bootstrap/probe/boundary code from migration runner (`drizzle-migrate.ts`)
- [internal] Preserve `create_profile_with_user()` onboarding function and Row Level Security policies in hand-written migration

### Removed

- [internal] 79 incremental migration files and 22 snapshot files accumulated pre-launch
- [internal] Migration boundary execution logic (`planMigrationExecution`, `COMMIT_BOUNDARY_AFTER`)
- [internal] Schema detection probes (`detectAppliedThroughIdx`, `resolveMigrationsSchemaSafely`)
- [internal] Migration history bootstrapping (`bootstrapMigrationHistoryIfNeeded`)
- [internal] Obsolete `drizzle-migrate.test.ts` (tested removed boundary logic)

## [26.4.23] - 2026-03-20

> [internal] Agent configuration update.

### Changed

- [internal] Agent autonomy rules: agents now handle tests, error handling, edge cases, and linting without asking — questions reserved for real product/architecture decisions
- [internal] Scope rule updated: agents include hardening (error handling, edge cases, tests) for code they touch, not just the literal task asked
- [internal] Simplified changelog automation docs in AGENTS.md

## [26.4.22] - 2026-03-20

> Refreshed the releases page with a cleaner, more polished look. Your profile now shows your top 3 genres.

### Changed

- Releases page has a cleaner, more polished design with improved spacing and layout
- Release and track sidebars now use a stacked card layout for easier scanning
- [internal] Releases route visual overhaul: Linear-style surfaces, squircle corners, tighter spacing across table, sidebar drawers, toolbar, dialogs, banners, and mobile views
- [internal] Shared segment control and drawer primitives aligned to Linear design language (flatter controls, stacked drawer cards, quieter chrome)
- [internal] Extracted `LINEAR_SURFACE` token set for reusable card/popover/toolbar surface classes
- [internal] Release sidebar now uses stacked card layout (header, analytics, tabs as separate cards)
- [internal] Track sidebar uses stacked card layout (track card, details card)
- [internal] Release table subheader moved inside the table card container
- [internal] Lower-shell sidebar banners (upgrade, install) use quieter background treatment

### Added

- Your profile now shows your top 3 genres based on your releases
- Genres are automatically updated when you import from Spotify
- [internal] `LINEAR_SURFACE` design token constants for consistent surface hierarchy across the dashboard
- [internal] Comprehensive test coverage for releases route: AddReleaseSidebar, MobileReleaseList, ReleaseTable, ReleasesEmptyState, SmartLinkGateBanner, TrackRow, ReleaseEditDialog, AddProviderUrlPopover, DialogLoadingSkeleton, DrawerLoadingSkeleton, ArtistSearchCommandPalette
- [internal] Test hooks (`data-testid`) for drawer loading skeleton cards, dialog loading cards, mobile release list
- [internal] Cap artist profile genres at 3 (was 10), populated by most frequent genres across releases
- [internal] Genre picker UI default max reduced from 10 to 3
- [internal] Onboarding review step shows top 3 genres instead of 5
- [internal] Profile validation schema caps genres array at 3
- [internal] `syncProfileGenresFromReleases()` — aggregates genres from all releases by frequency and writes top 3 to profile
- [internal] Genre sync automatically runs after Spotify import
- [internal] Unit tests for genre aggregation (frequency sorting, tiebreak, null handling, deduplication)

## [26.4.21] - 2026-03-20

> Your music catalog is now organized more intuitively — recordings are the core unit, and tracks appear as part of releases.

### Changed

- Your catalog is now organized around recordings, making it easier to see where each song appears across different releases
- Dashboard no longer shows a single/track toggle — tracks are always shown as part of their release
- [internal] MusicBrainz-inspired recording/release-track data model: `discog_recordings` (canonical audio entity) and `discog_release_tracks` (recording's appearance on a release)
- [internal] `recording_artists` junction table for artist credits on recordings
- [internal] Recording and release-track upsert functions with ISRC/slug collision handling
- [internal] Recording-artists CRUD module (upsert, get, delete, query by artist)
- [internal] Backfill migration to populate new tables from existing `discog_tracks` data
- [internal] Spotify import now writes directly to new model (recordings + release tracks) instead of dual-writing to both old and new tables
- [internal] All platform readers migrated from `discog_tracks` to `discog_recordings`/`discog_release_tracks`: release enrichment, DSP artist discovery, platform stats, sitemap, ISRC route
- [internal] Smart link resolution uses recordings as primary lookup with legacy track fallback
- [internal] Legacy dual-write to `discog_tracks` during Spotify import — new imports only populate the new model
- [internal] `releaseView` toggle in release provider matrix (singles classified correctly as releases now)
- [internal] Redesigned dev toolbar UX — unified searchable flag list (statsig + code flags combined), keyboard shortcuts (Cmd+Shift+D toggle, Escape to close panel), quick actions (copy SHA/route, theme picker, admin link) moved to always-visible bottom bar
- [internal] Added toggle flash feedback when switching feature flags, auto-focus search on panel expand, responsive compacting for narrow viewports
- [internal] Clickable override badge in bottom bar opens flag panel directly
- [internal] 50 unit tests covering all toolbar interactions (up from ~10)

## [26.4.20] - 2026-03-19

> Listen to track previews right from your dashboard with the new Now Playing player. We also moved the "Delete account" option to a safer location.

### Added

- Now Playing player in the sidebar — listen to track previews with artwork, play/pause controls, and a progress bar
- Preview availability indicators show which releases and tracks have audio previews
- [internal] Audio error handling with toast notification when preview URLs fail to load
- [internal] Fade-in entrance animation for Now Playing card (tw-animate-css)
- [internal] Keyboard-accessible focus rings on all player buttons
- [internal] Image fallback for missing/broken artwork URLs
- [internal] 11 unit tests covering useTrackAudioPlayer hook and NowPlayingCard component states

### Changed

- [internal] "Delete account" moved from the dropdown menu to Settings for safety — it was too easy to click accidentally
- [internal] Extended useTrackAudioPlayer hook with track metadata (title, release, artist, artwork) for any UI surface to render current track
- [internal] All 5 toggleTrack callers now pass release metadata (ReleaseCell, ReleaseTrackList, TrackRow, ReleaseSidebar, NowPlayingCard)

## [26.4.19] - 2026-03-19

> The releases page now loads faster.

### Changed

- Releases page loads faster thanks to parallel data loading
- [internal] Performance budget for releases page (`/app/dashboard/releases`) with Gmail-rule targets: 500ms skeleton-to-content, 1500ms FCP/TTFB
- [internal] Authenticated route support in perf guard script: Clerk session cookie injection via `CLERK_SESSION_COOKIE` env or `.auth/session.json`
- [internal] Custom skeleton-to-content timing metric: measures time from navigation to `[data-testid="releases-loading"]` disappearing
- [internal] Browser warm-up in perf guard to eliminate Playwright launch overhead from measurements
- [internal] Releases page now uses Suspense streaming: auth gate blocks navigation, all data fetches fire in parallel inside a Suspense boundary (eliminates sequential waterfall)
- [internal] Removed duplicate `ReleasesClientBoundary` wrapper from `ReleasesContent` component

## [26.4.18] - 2026-03-19

> New ad pixel tracking for Facebook, Google, and TikTok. See which platforms drive your fans, with built-in privacy controls.

### Added

- Ad pixel tracking for Facebook, Google, and TikTok — see which ad platforms drive your fans
- Pixel health monitoring so you know if your tracking is working
- Test button to verify your pixel setup from the dashboard
- See which ad platform brought each new subscriber
- [internal] Server-side pixel forwarding to Facebook CAPI, Google Measurement Protocol, and TikTok Events API with consent gating and retry logic
- [internal] IP purge cron job: deletes raw IPs after 48 hours, retains hashed IPs for analytics
- [internal] Pixel forwarding retry cron with exponential backoff (5 retries, max 3h) and dead-lettering
- [internal] Unit tests for anonymizeIp, deriveAttributionSource, computeHealthStatus, parseConsentCookie, and forwarding orchestration
- [internal] Auto-Lake protocol for gstack: resource-cost decisions (test coverage, error handling, edge cases, DRY fixes) are now auto-resolved without prompting when `auto_lake` is enabled — only genuine human decisions (architecture, scope, UX) still ask for input
- [internal] Decision tree in the shared gstack preamble distinguishes 10 auto-resolve categories from 10 always-ask categories
- [internal] `[AUTO-LAKE]` log lines provide a visible audit trail of every auto-resolved decision
- [internal] End-of-workflow summary shows count of auto-resolved vs asked decisions

### Changed

- [internal] Pixel health endpoint now uses SQL aggregation instead of loading all events into memory
- [internal] Replaced `drizzleSql.raw()` with safe parameterized query in IP purge cron
- [internal] Deduplicated `NO_STORE_HEADERS` constant across 5 route files (now imports from shared module)
- [internal] Added `retryCount` column to pixel_events for accurate dead-letter tracking
- [internal] Added partial index on pixel_events for efficient IP purge queries
- [internal] Attribution endpoint now requires Pro plan entitlement (consistent with all other pixel APIs)

### Fixed

- [internal] Retry counter bug: was counting JSONB status entries instead of actual retry attempts, causing infinite retries for persistently failing events
- Updated cookie policy
- Refreshed landing page messaging
- [internal] Cookie policy updated to reflect server-side forwarding (no third-party scripts injected)
- [internal] Hero section replaced 4-mode scroll carousel with dashboard reveal animation showing auto-generated smart links
- [internal] AudienceCRM headline: "You're losing fans every day" with concrete fan-loss scenarios
- [internal] Pricing headline: "Get live for free. Grow when you're ready"
- [internal] Final CTA: "Every day without Jovie is fans you'll never see again"
- [internal] Meta title, description, and structured data updated to match new positioning
- [internal] Release artwork self-hosted from `/img/releases/` instead of Spotify CDN
- [internal] Added persistent "Claim your handle" ghost button during dashboard animation
- [internal] Mobile dashboard uses stacked row layout for full smart link URL visibility
- [internal] Smart checkout step after onboarding recommends a plan based on your audience size
- [internal] Onboarding checkout intercept: all users completing onboarding now see an upgrade page (gated by `ONBOARDING_CHECKOUT_STEP` feature flag)
- [internal] Smart plan recommendation: Spotify followers determine suggested tier (Pro for <10K, Growth for 10K+)
- [internal] Personalized checkout hint for organic users with their jov.ie handle
- [internal] Founding member urgency callout with accent-tinted card
- [internal] Annual billing pre-selected when savings exceed 25%
- [internal] `&source=intent|organic` query param to disambiguate paid intent from organic upsell
- Upgraded users now see a celebration message after completing onboarding
- [internal] Post-upgrade celebration: onboarding upgraders see "Your profile is live — and upgraded!" on the billing success page
- [internal] Analytics segmentation via `intent_source` on checkout events

## [26.4.17] - 2026-03-19

> Share a Spotify Wrapped-style card celebrating your profile. Plus, your profile genres are now visible.

### Added

- Shareable celebration card — a Spotify Wrapped-style card for your profile, available in feed and story sizes, with download and share buttons
- [internal] Demo account seed scripts: `setup-demo-user.ts` (Clerk user creation) and `seed-demo-account.ts` (comprehensive DB seeding)
- [internal] Seeds 18 entity types with realistic data: profile, releases, social links, tour dates, subscribers (150), audience (200), tips (30), clicks (500+), profile views (90 days), contacts, inbox threads (8), AI insights, chat history, referrals, email engagement, pre-save tokens, DSP matches
- [internal] Hockey-stick date distributions for convincing growth narrative on sales calls
- [internal] Realistic fan names, heartfelt tip messages, and authentic email bodies for inbox threads
- [internal] Production safety: `--allow-production` flag required for live Clerk keys
- [internal] Username reservation: script aborts if `timwhite` username belongs to a different user
- [internal] Hardcoded fallback profile data so script works without `/tim` in the database
- [internal] Idempotent re-runs with delete-then-insert and batch inserts
- [internal] Shared `profileCardLayout` function: DRY layout used by both OG images and celebration cards
- [internal] Re-enrichment script: one-off script to enqueue MusicFetch enrichment jobs for all existing artists with dedup safety
- [internal] `genres` field on `CreatorProfile` interface for Artist type removal phase 1

### Fixed

- Celebration screen no longer auto-advances while you're downloading or sharing your card
- [internal] `convertCreatorProfileToArtist` now passes through `venmoHandle` and `genres` (previously silently dropped)

### Changed

- [internal] Refactored `opengraph-image.tsx` to use shared `profileCardLayout` instead of inline JSX (net -120 lines)
- [internal] Cleaned up TODOS.md: removed completed items (re-enrichment, social card) and duplicate win-back email entry
- [internal] CHANGELOG.md now uses `merge=union` in `.gitattributes` to auto-resolve merge conflicts between concurrent PRs
- [internal] Version bumping and changelog generation handled entirely by `/ship` workflow — removed standalone `version:bump` and `changelog:generate` scripts
- [internal] Removed `scripts/generate-changelog.mjs`, `scripts/version-bump.mjs`, and related commands

### Fixed

- [internal] Admin creator table: UUID validation on all profileId inputs (single and bulk operations)
- [internal] Admin creator table: email send failure during verification no longer crashes the action
- [internal] Admin creator table: self-deletion prevention — admins cannot delete their own account
- [internal] Admin creator table: double-delete guard rejects re-deleting already soft-deleted users
- [internal] Admin creator table: cache invalidation added to delete and marketing toggle actions
- [internal] Admin creator table: JSON.parse wrapped in try-catch for bulk operation payloads
- [internal] Payload parsers: UUID validation and whitespace-only profileId rejection

## [26.4.15] - 2026-03-19

> Cleaned up the dashboard by removing clutter and simplifying the chat experience.

### Removed

- Removed dashboard clutter — simplified to focus on what matters
- Chat simplified from 3 states to 2 for a cleaner experience
- [internal] AI-generated dashboard components: MusicImportHero, InsightOneLiner, SmartActionCards, and recent-releases API — AI slop adding complexity without user value
- [internal] 3-state chat (dashboard/chatActive/chat) simplified to 2-state (empty/chat) — removes confusing intermediate state
- [internal] Wordy error boundary messages replaced with concise default
- [internal] Verbose modal/dialog copy trimmed across feedback, growth access, and cookie modals
- [internal] Inline styles in CookieModal replaced with Tailwind classes and Button component

### Changed

- Chat suggestions now show practical prompts like "Change profile photo" and "How do I get paid?"
- [internal] CI: unit tests now gate PR merges — runs on PRs and merge queue, not just post-merge on main
- [internal] Chat prompts restored to practical defaults: "Change profile photo", "Set up a link", "How do I get paid?"
- [internal] SuggestedProfilesCarousel relocated from sidebar to chat empty state
- [internal] Pagination buttons use conditional rendering instead of disabled links to "#"

### Fixed

- Feedback submission now shows an error message if something goes wrong, instead of faking success
- [internal] DSP match status validated against allowlist (was unchecked type cast)
- [internal] MusicFetch enrichment: removed duplicate complete-status call
- [internal] MusicFetch enrichment: transient errors no longer pre-mark job as failed before retry

## [26.4.14] - 2026-03-19

> "Delete account" is now easier to find in Settings, and the changelog page handles errors gracefully.

### Fixed

- "Delete account" is now easy to find — Settings shows all sections, plus there's a direct link in your profile menu
- [internal] Changelog pages now show a friendly error page instead of crashing on temporary issues
- [internal] Account deletion now discoverable: settings page shows all sections (Data & Privacy was hidden by focusSection='account')
- [internal] Added "Delete account" link to user profile menu with destructive styling
- [internal] Added direct `/app/settings/delete-account` route for deep-linking
- [internal] Backend cleanup expanded: preSaveTokens, feedbackItems, and emailSuppressions now explicitly deleted on account deletion (previously orphaned with null userId)
- [internal] Added 7 unit tests for the account deletion API route
- [internal] Changelog verify and unsubscribe routes now return friendly HTML error pages instead of raw 500s on DB failures
- [internal] Removed dead bot-detection stubs (checkMetaASN, checkRateLimit, isSuspiciousRequest) that shadowed real implementations

### Removed

- [internal] Deleted unauthenticated `/api/waitlist-debug` endpoint and its tests
- [internal] Removed unused domain-categorizer functions (addSensitiveDomain, containsSensitiveKeywords, sanitizeForCrawlers, getAllSensitiveDomains)

## [26.4.13] - 2026-03-19

> Cookie consent banner now only appears where legally required, so most visitors won't see it.

### Changed

- Cookie consent banner now only appears where legally required
- [internal] Added state/province-level detection for US and Canada using Vercel `x-vercel-ip-country-region` header
- [internal] When visitor geo cannot be determined, the banner no longer shows (previously showed as fail-safe)
- [internal] US/Canada visitors with unknown region see the banner as a safe compliance fallback

## [26.4.12] - 2026-03-18

> Spotify import now shows real progress, and the import experience is smoother overall.

### Fixed

- Spotify import progress bar now shows real progress ("5 of 30 imported") instead of a bouncing animation
- Import progress no longer flashes in and out during active imports
- [internal] "No matching Apple Music artist" banner no longer shows while Spotify import is still running
- Progress bar holds at 100% briefly before disappearing for a polished finish
- [internal] Move Next.js dev indicator to top-right corner so it no longer overlaps the DevToolbar at the bottom of the screen
- [internal] Added 1-second completion hold at 100% before banner fadeout for a polished finish
- [internal] Added ARIA progressbar attributes for screen reader accessibility
- [internal] Replaced jerky ping-pong animation with smooth unidirectional shimmer for unknown-total fallback

## [26.4.11] - 2026-03-18

> [internal] Development environment improvement.

### Changed

- [internal] Skip Sentry server and edge SDK initialization in development — eliminates terminal warnings and 100% trace sampling overhead during local dev

## [26.4.10] - 2026-03-18

> Fixed keyboard shortcuts not working with certain input methods, and the waitlist is now controlled from the admin panel.

### Fixed

- Keyboard shortcuts now work correctly with all input methods (international keyboards, browser extensions, etc.)
- [internal] Guard all keyboard shortcut hooks against undefined `event.key` — prevents crashes from IME composition, dead keys, and browser extension injected events (JOVIE-WEB-EE, JOVIE-WEB-CT, JOVIE-WEB-F1)

### Changed

- [internal] Waitlist can now be toggled on/off from the admin panel without restarting the server
- [internal] Waitlist gating: replaced `WAITLIST_ENABLED` env var with DB-only `gateEnabled` toggle — admin panel now controls waitlist without server restarts
- [internal] Default waitlist state for fresh environments changed to OFF (gateEnabled: false), matching previous env-var-unset behavior

### Added

- [internal] Unit tests for `useSidebarKeyboardShortcut` and `useSequentialShortcuts` hooks (13 tests)

### Removed

- [internal] `WAITLIST_ENABLED` environment variable and `waitlist-config.ts` — consolidated into `waitlist_settings.gateEnabled` DB column

## [26.4.9] - 2026-03-18

> Your music is now discovered across more streaming platforms. We also fixed analytics labels and chart display issues.

### Fixed

- Your music is now matched across Deezer and MusicBrainz in addition to Apple Music, so more of your catalog gets linked
- Analytics conversion rate labels now appear between the correct stages
- Cities, Countries, and Sources tabs now show the right data
- Time range toggle (7d/30d) no longer overflows off-screen on smaller displays
- [internal] Expand ISRC-based DSP artist discovery to include Deezer and MusicBrainz — previously hardcoded to Apple Music only, leaving built discovery code for 2 providers dead
- [internal] Replace tautological E2E musicfetch-coverage tests with real DB and UI assertions that catch multi-DSP regressions
- [internal] Fix conversion rate labels showing between wrong funnel stages — 33% now correctly appears between Profile Views and Unique Visitors instead of between Unique Visitors and Followers
- [internal] Fix Cities, Countries, and Sources tabs showing blank by sourcing geo data from audience_members (visits) instead of click_events (link clicks only)
- [internal] Fix time range toggle (7d/30d) overflowing off-screen by stacking it below the tab bar
- [internal] MusicFetch ingest pipeline: treat 400 errors as permanent failures instead of retrying indefinitely, preventing circuit breaker trips that blocked all enrichment (JOV-1629, JOV-1630)
- [internal] MusicFetch enrichment: return gracefully when API returns no data instead of throwing and retrying

### Added

- [internal] Pause all outreach emails with a single toggle in the admin panel
- [internal] Multi-DSP golden path assertions: poll for Apple Music, Deezer, Tidal, YouTube Music, SoundCloud IDs after Spotify connect with tiered thresholds by artist size
- [internal] Profile page DSP round-trip test: navigate to public profile page and verify multiple DSP links render
- [internal] Seed multi-DSP data for dualipa test profile (6 DSP IDs + 4 social links) for reliable E2E assertions
- [internal] TODO: wrong-artist detection + multi-candidate DSP matching (PR2 follow-up)
- [internal] "Problems We're Solving" section in investor memo linking to all three problem essays (MySpace, Friday, Contact)
- [internal] Global campaign email toggle (`campaignsEnabled`) on campaign settings — allows admin to pause all outreach emails and drip campaigns with a single switch
- [internal] Campaign toggle check in both the campaign processor cron and claim-invite job processor
- [internal] Admin UI toggle switch on the outreach email page for enabling/disabling campaigns
- [internal] API endpoints for reading and updating campaign enabled state

### Removed

- [internal] Delete unused `getAnalyticsData()` and `getUserAnalytics()` functions from analytics query module


## [26.4.8] - 2026-03-18

> Updated homepage messaging and improved security.

### Changed

- [internal] Homepage headline updated to "One link to launch your music career"
- [internal] Conductor workspace archive script to clean up build artifacts and node_modules when archiving
- [internal] Meta descriptions and SEO schema updated across all pages to new positioning
- [internal] llms.txt brand description updated to match new messaging
- [internal] Investor memo mission updated to "AI that manages your music career"
- [internal] Replace SQL string interpolation with parameterized queries in batch update functions (`batchUpdateSortOrder`, `batchUpdateSocialLinks`) for defense-in-depth against SQL injection
- [internal] Extract shared `validateBatchItem` helper to deduplicate validation logic across batch operations
- [internal] Remove `console.time()`/`console.timeEnd()` from dashboard API routes to prevent timing information leaks in production logs
- [internal] Document intentional `Access-Control-Allow-Origin: *` CORS policy on public pixel tracking endpoint

### Fixed

- [internal] Conductor run script no longer double-wraps Doppler secrets (was `doppler run -- pnpm dev:web` which chains into web's `doppler run -- next dev`)

## [26.4.7] - 2026-03-18

> New bulk actions for the admin panel and improved table interactions.

### Added

- [internal] Bulk actions for managing creators, users, and waitlist entries from the admin panel
- [internal] Non-interactive cleanup mode (`--force`, `--dry-run`) for E2E test account script, enabling agents and CI to clean up without human prompts
- [internal] Paginated Clerk user discovery and database record cleanup (FK CASCADE) in cleanup script
- [internal] Rate-limited batch deletion with exponential backoff for Clerk API calls
- [internal] Expanded test user detection to match both `role: 'e2e'` metadata and `+clerk_test` email patterns
- [internal] QA & Browse authentication instructions in AGENTS.md so agents auto-login using Doppler credentials instead of prompting
- [internal] Agent cleanup requirement in AGENTS.md — agents must run cleanup after sessions creating test accounts
- [internal] Clerk E2E test user cleanup step in CI workflows (`e2e-full-matrix.yml`, `nightly-tests.yml`)
- [internal] Bulk Unfeature, Enable/Disable marketing email actions for Creators table
- [internal] Bulk Copy User IDs action for Users table
- [internal] Bulk Approve/Disapprove actions for Waitlist table (with status-based filtering)
- [internal] Destructive variant styling for bulk action dropdown items (Delete shows in red)
- [internal] DRY `executeBulkAction` helper replacing 5+ near-identical bulk action handlers

### Changed

- [internal] Migrate Creators table from custom `AdminCreatorsToolbar` to shared `TableBulkActionsToolbar` dropdown pattern, matching Users and Waitlist tables
- [internal] All three admin tables now use identical bulk actions toolbar UX

### Fixed

- [internal] Missing `E2E_CLERK_USER_USERNAME` and `E2E_CLERK_USER_PASSWORD` env vars in weekly E2E full matrix workflow
- [internal] Badge test assertion updated to match renamed design token (`bg-(--color-bg-primary)`)
- [internal] Fix admin table checkbox multi-select on Creators and Waitlist tables by removing dual selection system conflict (TanStack Table internal selection racing with custom `useRowSelection` hook)

### Removed

- [internal] `AdminCreatorsToolbar.tsx` — replaced by shared `TableBulkActionsToolbar`


## [26.4.6] - 2026-03-18

> The homepage now shows real creator profiles, and public profile pages load faster.

### Added

- Homepage "See it in action" section now shows real creator profiles from the platform
- [internal] Tim's profile (`jov.ie/tim`) pinned as first card, remaining slots filled from featured creators
- [internal] Section visibility gated by feature flag (off by default in production)
- [internal] New `getCreatorByHandle()` cached function for single-profile lookup with timeout guards

### Changed

- Public profile pages load faster with optimized resource loading
- [internal] Lazy-load TipDrawer and ProfileNotificationsMenu on public profile pages, removing ~25-40 KB from the critical-path client bundle
- [internal] Parallelize tour dates fetch with Statsig feature flag queries, eliminating ~100-200ms sequential waterfall on tour mode pages

## [26.4.5] - 2026-03-18

> New celebration screens, a getting started checklist, and referral settings.

### Added

- Celebration page with confetti animation after upgrading your plan
- First-fan celebration when you get your first subscriber
- Getting Started checklist with 5 growth tips to help you launch
- Referral settings page with your shareable link and earnings stats
- [internal] Shared `Confetti.tsx` atom extracted from `ProfileLiveCelebration` for DRY reuse across celebration screens
- [internal] Testimonials section on homepage (feature-flagged via `NEXT_PUBLIC_SHOW_TESTIMONIALS`)
- [internal] User conversion funnel section in admin dashboard (Total Users → With Profiles → Profile Complete → Has Subscribers → Paid)
- [internal] 43 unit tests covering all new components and data flows
- [internal] 3 deferred items in TODOS.md (shareable social card, weekly digest email, win-back email)
- [internal] Test for billing reconciliation audit log insert failure path

### Fixed

- [internal] Dashboard analytics CTE now has RLS session variable set on the db connection (defense-in-depth for audience_members and notification_subscriptions queries)
- [internal] Billing reconciliation audit log insert failure no longer silently swallows errors — failures are captured via captureCriticalError

### Changed

- [internal] Removed 5 app-level legacy DB transactions in favor of getSessionContext() and direct queries
- [internal] Tour date analytics route uses getSessionContext() instead of transaction-scoped RLS setup
- [internal] getUserAnalytics and getUserDashboardAnalytics no longer wrap queries in transactions
- [internal] Billing reconciliation repair functions use sequential writes with error handling instead of transactions
- [internal] Migrate LeadTable from manual `<table>` with page-based pagination to UnifiedTable with infinite scroll, matching all other admin tables
- [internal] Migrate EarningsTab tipper table from manual `<table>` to UnifiedTable with column definitions and empty state
- [internal] Extract ~50 `shadow-[...]` bracket notations into 10 named shadow design tokens (`shadow-subtle-bottom`, `shadow-inset-divider`, `shadow-inset-ring-focus`, `shadow-popover`, etc.)
- [internal] Standardize all buttons and icon buttons to `rounded-full` (pill shape) across the design system
- [internal] Wrap ProfileContactSidebar header and profile link sections in DrawerSurfaceCard for visual consistency
- [internal] Align leads API response shape (`items` → `rows`, `limit` → `pageSize`) with other admin endpoints
- Feedback now properly reports errors instead of silently failing
- [internal] Feedback API route now logs errors with `captureError` instead of silently swallowing exceptions

### Removed

- [internal] Delete unused BaseSidebar component (4 files, 321 lines) — replaced by RightDrawer/EntitySidebarShell
- [internal] Remove `useLeadsListQuery` and `AdminLeadListResponse` — replaced by `useLeadsInfiniteQuery`

## [26.4.4] - 2026-03-17

> Onboarding now requires a profile photo, and the releases page no longer shows a false "Connect Spotify" prompt during import.

### Fixed

- Onboarding now requires a profile photo before you can access your dashboard
- Releases page no longer shows "Connect Spotify" while your import is still running
- Right-clicking a release row now shows the quick actions menu (Copy smart link, Open smart link, etc.)
- [internal] VirtualizedTableRow forwards extra HTML props to the underlying `<tr>` element, enabling Radix ContextMenu.Trigger's `asChild` pattern to work correctly

### Added

- Upload your profile photo directly on the onboarding review step
- [internal] Unit tests for Spotify connection detection during import status transitions

## [26.4.3] - 2026-03-17

> The developer toolbar no longer covers page content.

### Fixed

- [internal] Dev toolbar no longer covers page content — adds dynamic body padding so content flows above the toolbar
- [internal] Dev toolbar can be hidden via X button, with a small "Dev" pill to bring it back
- [internal] Hide/show state persists across page loads via localStorage

## [26.4.2] - 2026-03-17

> Genres, locations, and hometowns now display in proper title case on your profile.

### Changed

- Genres, locations, and hometowns now display in proper title case on your profile and dashboard

### Added

- [internal] Post-migration schema verification — CI now compares every Drizzle schema column against the actual database after running migrations, blocking deploys if any columns are missing

## [26.4.1] - 2026-03-17

> Fans can now share their name when they subscribe, and notification emails greet them by name.

### Added

- Fans can optionally share their first name after subscribing to you
- Notification emails now greet subscribers by name ("Hey Sarah,") when available
- Subscriber names appear alongside emails in your audience table

### Fixed

- [internal] Strip control characters from subscriber names in plain text emails to prevent formatting injection
- [internal] 5-minute time window on name update endpoint to prevent abuse of the unauthenticated API

## [26.4.0] - 2026-03-17

> Track how your tour dates are performing with ticket click analytics right in your dashboard.

### Added

- Tour date analytics — see ticket clicks, top cities, and top referrers for each show
- Ticket click tracking on your public profile and tour page

### Changed

- [internal] Extracted shared `useTourDateTicketClick` hook from duplicated click handlers in `TourDateCard` and `TourModePanel`

### Fixed

- Tour date cards no longer crash when a venue has an unusual timezone
- [internal] Tour date analytics API route enforces ownership (IDOR prevention) via profileId check
- [internal] Seed data idempotency — deterministic `externalId` values enable safe `onConflictDoNothing`

## [26.3.5] - 2026-03-17

> [internal] Lead pipeline improvements and automation.

### Added

- [internal] Shared `approveLead()` pipeline for both manual admin approval and auto-approve cron (DRY extraction)
- [internal] `runAutoApprove()` — automated approval with daily limits, fit score threshold, high-profile/representation guards
- [internal] Scrape retry tracking with auto-disqualification after 3 failures (`scrape_attempts` column)
- [internal] Pipeline health warnings: zero discovery results and high qualification error rate alerts via Sentry
- [internal] 15s fetch timeout on Instantly API push (`AbortSignal.timeout`)
- [internal] Idempotency guard on Instantly push (skips if `instantlyLeadId` already set)
- [internal] 20 new pipeline tests: approve-lead, process-batch, pipeline-health-warnings, instantly-timeout

### Fixed

- [internal] TOCTOU race condition in approval pipeline — atomic `WHERE status='qualified'` guard prevents double-approval
- [internal] Non-atomic daily counter increment — uses SQL `autoIngestedToday + N` instead of in-memory calculation
- [internal] Expired claim tokens now regenerated during routing instead of reusing stale tokens

## [26.3.4] - 2026-03-17

> New documentation pages, guides, and a smarter upgrade flow after onboarding.

### Added

- New help pages: Tour Dates, Verified Badge, AI Insights, Ad Pixels, Fan CRM, Retargeting Ads, Plans & Pricing
- New guides: Share Your First Smart Link, Set Up Tipping, Set Up Ad Pixels, Connect Bandsintown
- [internal] After onboarding, you'll see a personalized upgrade page with a plan recommendation based on your audience size
- [internal] Upgrade prompts now appear when you're close to reaching plan limits
- [internal] `docs/PRODUCT_CAPABILITIES.md` — canonical rich feature catalog for AI agents with 37+ features, consistent schema
- [internal] "Use This Sound" feature documented in FEATURE_REGISTRY
- [internal] Signup-to-paid conversion funnel: capture `?plan=` intent at signup, persist through onboarding, present personalized checkout step before dashboard
- [internal] Onboarding checkout page (`/onboarding/checkout`) with profile value preview, interactive branding toggle, monthly/annual Stripe pricing, and skip option
- [internal] "Profile is live" confetti celebration after onboarding step 3 with profile URL and copy button
- [internal] Contextual upgrade nudges on plan-gated settings features (branding, analytics, contacts, notifications)
- [internal] Reusable `UsageLimitUpgradePrompt` component shown at 80%+ of plan limits with progress bar
- [internal] `plan-intent.ts` utility for cookie + sessionStorage plan intent persistence across the funnel
- [internal] `onboarding.checkoutStep` feature flag for safe rollout (server + client gated)
- [internal] 11+ analytics events across the full conversion funnel

### Changed

- [internal] Rewrote Chat & AI docs page → AI Assistant (was inaccurately describing fan messaging; now correctly documents AI career assistant)
- [internal] Fixed Tips docs page (aligned with actual Venmo-based payments, not Stripe)
- [internal] Expanded all 6 existing docs.jov.ie feature pages from ~20 lines to ~80-120 lines with plan availability tables and detailed capabilities
- [internal] Updated FEATURE_REGISTRY.md change management process to include PRODUCT_CAPABILITIES.md and docs.jov.ie updates
- [internal] Renamed "Self-Serve Guide" section to "Guides" in docs navigation
- [internal] `ChatUsageAlert` now shows direct upgrade button for free users and plan-specific messaging
- [internal] `SettingsPlanGateLabel` enhanced with feature-specific copy and upgrade click tracking

## [26.3.3] - 2026-03-17

> New DSP Presence page shows all your matched streaming profiles. Admin settings are now centralized.

### Added

- DSP Presence page — see all your matched streaming platform profiles (Spotify, Apple Music, Deezer, etc.) with match confidence and confirm/reject actions
- [internal] Centralized admin settings page for campaign targeting, developer tools, and waitlist controls
- [internal] Admin settings section in Settings sidebar with dedicated `/app/settings/admin` route
- [internal] `CampaignSettingsPanel` — campaign targeting (fit score, batch size) and throttling controls moved from inline campaign manager to centralized settings
- [internal] Dev toolbar on/off toggle under Admin > Developer tools
- [internal] Waitlist settings panel embedded in admin settings
- [internal] Navigation entry for Presence in the dashboard sidebar
- [internal] Next.js rewrite rule mapping `/app/presence` to `/app/dashboard/presence`

### Changed

- [internal] Campaign manager now reads settings from persisted config instead of inline controls, with "Change in Settings" link
- [internal] Admin sidebar section renamed from "Admin" to "General" with restructured card layout (dev tools, waitlist, campaigns, quick links)

### Fixed

- Tour date cards no longer crash when a venue has an unusual timezone
- [internal] Invalid IANA timezone values no longer crash `TourDateCard` — wrapped `Intl.DateTimeFormat` in try/catch
- [internal] Tour date analytics API route enforces ownership (IDOR prevention) via profileId check
- [internal] Seed data idempotency — deterministic `externalId` values enable safe `onConflictDoNothing`

## [26.3.2] - 2026-03-17

> [internal] Removed unused database tables, columns, and dead routes.

### Removed

- [internal] Unused DB tables `dsp_artist_enrichment` and `release_sync_status` — scaffolded but never queried or written to
- [internal] Unused DB columns `creator_profiles.outreach_priority` and `creator_profiles.last_login_at` — never populated in application code
- [internal] Dead route `/api/monitoring/performance` — stub returning 501, never implemented (JOV-480)
- [internal] Dead route `/ingest/[...path]` — decommissioned tombstone returning 404
- [internal] Dead route `/loader-preview` — page that immediately called `notFound()`
- [internal] Unused environment variable `CONTACT_OBFUSCATION_KEY` — defined but never read
- [internal] Unused `fallbackSrc` prop from Avatar component — accepted but never used in render logic

## [26.3.1] - 2026-03-17

> Fixed settings save indicator and audience filters now work consistently.

### Changed

- [internal] Reordered homepage sections for a better flow
- [internal] Move phone carousel (DeeplinksGrid) above CRM section (AudienceCRMSection) on homepage

### Fixed

- Settings save indicator no longer shows "Save failed" while still saving
- Audience segment filters now work the same way everywhere
- Ad pixel settings no longer crash when data is partially loaded
- [internal] `SettingsStatusPill` no longer shows "Save failed" alongside "Saving..." and "Saved" states due to operator precedence bug with `&&` and ternary
- [internal] Audience segment filters now use OR (union) logic consistently between SSR and API routes — previously SSR used AND while the API used OR, causing inconsistent results when selecting multiple segments
- [internal] `SettingsAdPixelsSection` uses safe optional chaining on `pixels` and `hasTokens` objects to prevent runtime crashes when data shape is partial

## [26.3.0] - 2026-03-17

> Artists you've already claimed now appear first in search results. The dashboard loads correctly after onboarding.

### Added

- "On Jovie" badge on search results for artists already on the platform
- [internal] 5-second profile review pause during onboarding so you can see your enriched profile before continuing
- Right-click context menus on all data tables for quick actions

### Fixed

- Your claimed artist now appears first in search results so you can easily find yourself among duplicates
- Dashboard now loads completely after onboarding — sidebar, streaming links, and social links all appear immediately
- [internal] Profile review button is disabled while your data is still loading (with a 10-second safety timeout)
- [internal] Tour Dates table shows the full menu (Edit, Open tickets, Delete) on both the menu button and right-click
- [internal] Dashboard redirect now waits for `connectSpotifyArtist` DB writes to complete — fixes empty sidebar, missing DSPs, and missing social links after onboarding
- [internal] Profile review CTA disabled while enrichment or Spotify connection is still in progress (with 10s timeout fallback)

## [26.2.2] - 2026-03-17

> Fixed demo sidebar navigation, Apple Music detection, and error messages now show properly.

### Fixed

- [internal] Demo sidebar tabs (Audience, Earnings) no longer redirect to sign-in — shows a toast notification instead
- Error messages now display when something goes wrong (like "Handle already taken") instead of silently reverting
- [internal] `isAppleMusicConfigured()` now reads env vars at call time instead of module load, fixing false positives when Doppler injects credentials
- [internal] Google CSE tests now correctly stub SerpAPI key to exercise the Google CSE code path
- [internal] Extract API error messages from 4xx response bodies in `fetchWithTimeout` so user-friendly errors propagate to the UI

## [26.2.1] - 2026-03-17

> Major visual refresh — the entire site now follows a polished, consistent design language with dark mode support.

### Changed

- Complete visual refresh of the homepage and marketing pages with a polished, consistent design
- Wider content layout for a more spacious feel
- Dark mode now works on sign-in, sign-up, waitlist, and onboarding pages
- Updated messaging across the homepage
- [internal] SSO loading screens now match the app's dark theme
- [internal] Migrated all marketing homepage components from hardcoded rgba/hex to CSS design tokens (`var(--linear-*)`)
- [internal] Replaced fluid `clamp()` typography with discrete breakpoints matching Linear.app's exact values at 375/768/1280/1440px
- [internal] Widened homepage content max-width from 984px to 1250px to match Linear.app layout
- [internal] Darkened mockup panel surfaces and switched to rounded-top-only corners with inset ring shadow
- [internal] Removed force-light CSS override so marketing pages render in dark mode
- [internal] Added `text-rendering: optimizelegibility` to Inter font stack
- [internal] Updated design system tokens to match Linear's latest values: accent `#7170ff`, font weights (normal 400, semibold 590, bold 680), button radius 4px, text quaternary `#62666d`, font features `"cv01","ss03"`
- [internal] Migrated all UI components from `--linear-border-focus` to `--color-accent` for focus rings
- [internal] Updated all `font-[450]` to `font-[400]` across UI atoms and app components
- [internal] Badge component now uses pill shape (`rounded-full`) and 12px font size
- [internal] Button component uses hardcoded `rounded-[4px]` instead of `--radius-default` variable
- [internal] Replaced hardcoded `#5e6ad2` accent in PricingSection with `var(--color-accent)` token
- [internal] Pricing buttons now link directly to the plan you choose

### Fixed

- Sidebar display name updates immediately after saving profile edits
- Social link delete no longer fails on temporary items
- Social links show proper platform names instead of raw URLs
- Mobile settings page now shows all tabs (Links, Music, Earn, About) — they were hidden on small screens
- [internal] Analytics section reserves space during loading to prevent layout shift
- Homepage claim button now validates your handle before submitting
- [internal] CRM audience demo table now shows visible labels for all columns
- Social links on artist profiles now open in new tabs
- "Log in" link is now visible on mobile homepage
- [internal] Social link optimistic rollback now properly reverts UI on server error (was using stale closure instead of snapshot)
- [internal] Theme-init script no longer causes hydration mismatch (nonce undefined vs empty string) on every page load
- [internal] Display name inline editor now uses distinct aria-label ("Edit display name") to avoid screen reader confusion with the form field
- [internal] Admin creator sidebar now displays DSP and social link icons (previously showed empty tabs because `platform` field was dropped during data hydration)
- [internal] Fixed swapped `platformIcon`/`platformName` fields in `CreatorProfileSocialLinks` table component
- [internal] CRM contact sidebar now correctly resolves platform icons from `platform` field before falling back to URL detection
- [internal] Removed duplicate font declaration in auth layout that caused unused CSS preload warnings on every page
- [internal] Reduced cognitive complexity in `ingest-lead.ts` by extracting `enqueuePostIngestionJobs` helper (SonarCloud S3776)
- [internal] Replaced nested ternary operators in `ClaimHandleForm` and `SpotifyConnectDialog` with explicit conditionals (SonarCloud S3358)
- [internal] Used direct `undefined` comparison instead of `typeof` in feature-flags client (SonarCloud S7741)
- [internal] Used `globalThis` instead of `window` in `SettingsAdminSection` for portability (SonarCloud S7764)

### Added

- Spotify search shows when an artist is already claimed by another account
- [internal] Canonical CDN domain registry (`constants/platforms/cdn-domains.ts`) as single source of truth for all platform image domains
- [internal] Comprehensive CDN coverage for all supported platforms
- [internal] Sync test to verify `next.config.js` remotePatterns stays in sync with the CDN registry
- [internal] Made code-level feature flags (`THREADS_ENABLED`, `SHOW_REPLACES_SECTION`, `PWA_INSTALL_BANNER`) toggleable in the dev toolbar via localStorage overrides
- [internal] Added `useCodeFlag` hook for reactive code-level flag consumption with dev toolbar override support
- [internal] Added "Dev Toolbar" toggle in Admin settings so admins can enable the toolbar in production without manually setting a cookie
- [internal] Added SerpAPI as primary search provider for lead discovery, with Google CSE as legacy fallback

### Fixed

- Fixed duplicate search results when a featured creator matches your search
- Fixed search results showing "0" instead of nothing when a Spotify artist has zero followers
- Spotify artist connect now shows a clear "already linked" message instead of a confusing error
- [internal] Fixed VIP priority feature creating duplicate search results by filtering same-name non-VIP artists when a featured creator matches
- [internal] Fixed React rendering bug showing literal "0" instead of nothing when a Spotify artist has zero followers (affected all 3 search components)
- [internal] Fixed Spotify artist connect showing cryptic "Server Components render" error instead of friendly "already linked" message — Drizzle ORM wraps PG errors in `.cause`, breaking unique constraint detection (JOVIE-WEB-EY)
- [internal] Fixed 5 locations with the same Drizzle error-wrapping bug (releases, referrals, ingestion, discography queries)
- [internal] Added pre-check query in `connectSpotifyArtist` to detect already-claimed artists before hitting the constraint
- [internal] Added diagnostic Sentry logging for Spotify state inconsistency (artistName set but spotifyId null)
- [internal] Fixed admin leads page showing premature "Unable to load pipeline settings" error during TanStack Query retries
- [internal] Fixed admin leads table showing error state during initial data fetch retries
- [internal] Suppressed "You're off the waitlist!" email for users who bypassed the waitlist (gate disabled or auto-accept threshold)
- [internal] Fixed leads table query failures (JOVIE-WEB-E0/EJ/E3, 385 events)
- [internal] Fixed `SET LOCAL statement_timeout` being a no-op with Neon HTTP driver (JOVIE-WEB-EX/EV)
- [internal] Fixed profile view endpoint returning 500 on non-critical view counter failures (JOVIE-WEB-DZ, 24 events)

### Removed

- [internal] Deleted unused `UserActionsMenu.tsx` component (dead code, zero imports)

## [26.2.0] - 2026-02-12

> [internal] Version management improvements.

### Added

- [internal] Added `pnpm version:check` to validate CalVer alignment, package-version sync, and changelog consistency before releases.

### Changed

- [internal] Hardened `pnpm version:bump` to enforce valid CalVer input, prevent calendar regressions, rotate changelog sections safely, and sync all workspace package versions.

### Fixed

- [internal] Closed versioning drift risk where `apps/should-i-make` and `packages/ui` package versions were not updated during version bumps.

## [25.1.0] - 2025-01-01

> Launched Jovie with smart links, Pro subscriptions, and the foundation of the design system.

### Added

- Pro subscription with branding removal and advanced features
- Pricing page with Free and Pro plan comparison
- [internal] Billing success page with upgrade confirmation
- Pro users can remove "Made with Jovie" branding from their profile
- [internal] Initial design token map and tailwind v4 config
- [internal] Canonical shadcn Button atom
- [internal] Button atom now supports loading state and token-driven accent styles
- [internal] Created `/pricing` page with custom pricing UI showing Free and Pro plans
- [internal] Added Stripe Checkout API route (`/api/stripe/redirect`) with user authentication
- [internal] Implemented Stripe webhook handler (`/api/stripe/webhook`) for subscription management
- [internal] Added billing success page (`/billing/success`) with user-friendly confirmation
- [internal] Created `BrandingBadge` component that automatically hides "Made with Jovie" text for Pro users
- [internal] Updated `ProfileFooter` component to use the new branding system
- [internal] Added middleware protection for billing routes
- [internal] Updated environment variables to include Stripe configuration

### Changed

- [internal] Branding now controlled by Clerk user metadata (`publicMetadata.plan`)
- [internal] Supports "free" (shows branding) and "pro" (hides branding) plans
- [internal] Removed hardcoded "Powered by Jovie" text from artist profile routes
- [internal] Hardened Drizzle migration flow on `main` by fixing index migrations to avoid `CREATE INDEX CONCURRENTLY` inside the transactional migrator, pinned `parse5` via `pnpm.overrides` to stabilize Vitest jsdom tests, and aligned `CTAButton` `data-state` semantics with loading/disabled states so the component and unit tests stay in sync.
