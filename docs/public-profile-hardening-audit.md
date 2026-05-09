# Public Profile Hardening Audit — JOV-2019

**Status:** Read-only discovery  
**Date:** 2026-05-08  
**Auditor:** COS coder agent (cos/jov-2019-profile-audit)  
**Unblocks:** JOV-2020 (Phase 1 spec) and all subsequent implementation phases

---

## 1. Route Matrix

Each row covers one public-profile route or deep-linkable state.

### Legend
- **Tab bar** = the bottom dock/tab bar inside the compact profile surface
- **Nav behavior** = how mode transitions are implemented (drawer, scroll, redirect, history push)
- **Caching** = Next.js `revalidate` / `dynamic` setting

| Path Pattern | Type | Component(s) | Nav Behavior | Tab Bar Shows? | Drawer / Modal / Full-Page | Expected Canonical | Scroll Container | Metadata / SEO | Known Issues | Test Coverage | Priority |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `/{username}` | Top-level profile root | `ArtistPage` (RSC) → `StaticArtistPage` → `ProfileCompactTemplate` → `ProfileCompactSurface` | SPA mode switch via `?mode=` query param + `history.pushState` | Yes (Home/Music/Events/Alerts/More) | Drawers for contact, pay, listen, menu, share, releases (via `ProfileUnifiedDrawer`) | Canonical — primary public surface | `overflow-hidden h-[100dvh]` — viewport-locked, no page scroll | Full OG/Twitter meta + JSON-LD @graph (ProfilePage, MusicGroup, BreadcrumbList, MusicEvent) | `dynamic = 'force-dynamic'` overrides ISR layout (`revalidate = 3600`); bottom tab bar set `showBottomNav = true` unconditionally in compact surface | Unit: ProfileShell, ProfileCompactSurface, StaticArtistPage, ProfileInlineNotificationsCTA; E2E: profile.spec, artist-profiles.spec, profile-subscribe-e2e.spec, profile-drawers.spec | P0 |
| `/{username}?mode=listen` | Secondary — listen DSP list | Same as above; drawer view `listen` via `ProfileUnifiedDrawer` → `ListenView` | `history.pushState` to `?mode=listen` on tab click; bottom tab `Music` active | Yes (Music tab active) | Drawer (standalone: full sheet; embedded: embedded; desktop: modal) | Drawer over compact surface | Drawer scroll container | No separate metadata; inherits profile page meta | Desktop shows `ProfileDesktopSurface` with inline panel instead of drawer; no title update on mode change | Unit: ProfileShell tests; E2E: profile.spec | P0 |
| `/{username}?mode=subscribe` | Secondary — alerts opt-in | `ProfileCompactSurface` → `ProfileInlineNotificationsCTA` rendered inline in tab panel | Scroll-to inline CTA (no drawer); URL updates via `history.pushState` | Yes (Alerts tab active) | No drawer — inline subscribe flow within main surface | Inline within compact surface tab panel | Tab panel scroll container | No separate metadata | Subscribe tab shows inline form without drawer transition — inconsistent with listen/tour which open drawers | Unit: subscription-form-states, subscription-sms-flow, useSubscriptionForm, notifications-otp-step; E2E: profile-subscribe-e2e.spec | P0 |
| `/{username}?mode=tour` | Secondary — tour dates | `ProfileCompactSurface` → `ProfilePrimaryTabPanel` → `TourView` (drawer when compact, inline on desktop) | Tab click pushes `?mode=tour` to history; tour tab rendered only when `hasTourDates` | Yes (Events tab active when tour dates exist; omitted otherwise) | Drawer in compact standalone; inline content on desktop | Tab panel or drawer depending on layout | Tab panel scroll | Inherits profile page meta | Events tab omitted when no tour dates — inconsistent tab count across artists | Unit: ProfileShell.tour.test; E2E: profile.spec | P0 |
| `/{username}?mode=releases` | Secondary — discography | `ProfileUnifiedDrawer` → `ReleasesView` | Drawer (pushes `?mode=releases` but drawer is overlay, not tab) | Yes (Music tab active) | Drawer overlay | Drawer | Drawer scroll | Inherits profile meta | `releases` mode is handled via drawer, not via a tab; activates Music tab; inconsistent with tour/subscribe pattern | Unit: ProfileUnifiedDrawerReleases.test; E2E: profile.spec | P1 |
| `/{username}?mode=about` | Secondary — about / bio | `ProfileUnifiedDrawer` → `AboutView` (compact) OR `ProfileDesktopSurface` panel | Drawer on mobile/tablet; panel on desktop | Yes (profile/Home tab active) | Drawer | Drawer or desktop panel | Drawer scroll | Inherits profile meta | No dedicated tab for About; must navigate via "More" menu — low discoverability | Unit: no dedicated unit test found; E2E: profile.spec | P1 |
| `/{username}?mode=contact` | Secondary — contact channels | `ProfileUnifiedDrawer` → `ContactView` (compact) | Drawer; pushed to URL via `history.pushState` | Yes (profile/Home tab active) | Drawer | Drawer | Drawer scroll | Inherits profile meta | Contact only appears in bottom dock in the old `ProfileShell` (organism). In `ProfileCompactSurface` it is accessible only via the "More" drawer menu | Unit: artist-contacts-button/useArtistContacts; E2E: profile.spec | P1 |
| `/{username}?mode=pay` | Secondary — tip / Venmo | `ProfileUnifiedDrawer` → `PayView` → `PayDrawer` (standalone mobile) | Drawer on mobile (separate `PayDrawer` component); URL push on desktop | Yes | Drawer on mobile (full sheet); modal/panel on desktop | Drawer | Drawer scroll | Inherits profile meta | `mode=pay` and `mode=tip` both resolve to the pay flow via `getProfileMode('tip') → 'pay'`; legacy `/tip` route does a server redirect; `PayDrawer` is separate from `ProfileUnifiedDrawer` on mobile creating two drawer implementations | Unit: ProfileShell tests (pay); E2E: tipping.spec | P0 |
| `/{username}/about` | Full-page route (→ redirect) | `AboutPage` → `redirectToProfileMode(params, 'about')` — does a Next.js `redirect()` to `/{username}?mode=about` | Server 307 redirect to `?mode=about` | Via redirect to profile root | Via redirect | Redirect to `/{username}?mode=about` | N/A | `buildViewMetadata('about')` emitted before redirect | Route exists only as a redirect sink — no standalone page rendered | None specific to this path | P2 |
| `/{username}/alerts` | Full-page standalone | `AlertsPage` → `AlertGrowthLanding` (client) | Full-page; no profile tab bar | No | Full page (completely separate surface from profile) | Full page ISR (`revalidate = 3600`) | Full-page scroll | OG/Twitter meta generated; canonical set; `robots: index: true` | Entirely separate visual surface from main profile — no Jovie shell, no profile nav; used for paid traffic / SMS campaign links; design diverges completely from compact profile | Unit: none found; E2E: artist-notifications.spec | P1 |
| `/{username}/claim` (route.ts) | Utility — claim flow entry | `ClaimPageContent.tsx` (client); `claim/route.ts` is a route handler | Redirects to claim onboarding flow | No | Full-page redirect | API route handler | N/A | None | Route is a handler not a page — likely triggers the claim flow. Profile claim trust boundary. | Unit: none found | P0 |
| `/{username}/contact` | Full-page route (→ redirect) | `ContactPage` → `redirectToProfileMode(params, 'contact')` | Server 307 redirect | Via redirect | Via redirect | Redirect to `/{username}?mode=contact` | N/A | None | Same redirect-sink pattern as `/about`, `/listen`, etc. | None | P2 |
| `/{username}/listen` | Full-page route (→ redirect) | `ListenPage` → `redirectToProfileMode(params, 'listen')` | Server 307 redirect | Via redirect | Via redirect | Redirect to `/{username}?mode=listen` | N/A | None | Redirect sink | None | P2 |
| `/{username}/notifications` | Full-page standalone | `NotificationsPage` → `NotificationsPageClient` (client) | Full-page; responsive card layout | No | Full page (separate from compact profile surface) | Full page; no ISR setting found (`dynamic` defaults) | Full-page viewport-locked card | OG meta generated (no canonical OG type, no full OG/Twitter meta) | Second standalone notifications surface (separate from `/alerts`); uses `ArtistNotificationsCTA` with `autoOpen + forceExpanded`; no link from main profile; unclear product intent vs. `/alerts` | Unit: page.test (notifications); E2E: profile-notifications-hosts.spec | P1 |
| `/{username}/pay` | Full-page route (→ redirect) | `PayPage` → `redirectToProfileMode(params, 'pay')` | Server 307 redirect | Via redirect | Via redirect | Redirect to `/{username}?mode=pay` | N/A | None | Redirect sink | None | P2 |
| `/{username}/releases` | Full-page route (→ redirect) | `ReleasesPage` → `redirectToProfileMode(params, 'releases')` | Server 307 redirect | Via redirect | Via redirect | Redirect to `/{username}?mode=releases` | N/A | None | Redirect sink | None | P2 |
| `/{username}/shop` | Full-page — Shopify redirect | `ShopPage` → `ShopRedirectClient` (client) | Server fetch → client redirect to Shopify URL | No | Full-page server redirect if Shopify URL found; `ShopRedirectClient` for client-side fallback | ISR (`revalidate = 3600`) | N/A — redirect | `robots: index: false` | Robots noindex; Shopify URL constructed from `profile.settings`; client-side `ShopRedirectClient` handles fallback; no profile nav | Unit: none found; E2E: none found | P2 |
| `/{username}/subscribe` | Full-page route (→ redirect) | `SubscribePage` → `redirectToProfileMode(params, 'subscribe')` | Server 307 redirect | Via redirect | Via redirect | Redirect to `/{username}?mode=subscribe` | N/A | None | Redirect sink | None | P2 |
| `/{username}/tip` | Legacy route (→ redirect) | `TipRedirectPage` → `redirectToProfileMode(params, searchParams, 'pay')` | Server redirect to `/{username}?mode=pay`, preserving `?source=` | Via redirect | Via redirect | Permanent redirect to pay | N/A | None | Legacy — predates `pay` mode rename | None | P2 |
| `/{username}/tour` | Full-page route (→ redirect) | `TourPage` → `redirectToProfileMode(params, 'tour')` | Server 307 redirect | Via redirect | Via redirect | Redirect to `/{username}?mode=tour` | N/A | None | Redirect sink | None | P2 |
| `/{username}/{slug}` | Content smart link | `ContentSmartLinkPage` → `ReleaseLandingPage` or specialty pages (mystery/unreleased/video) | Full-page ISR (`revalidate = 300`) | No | Full page; `ProfileDrawerShell` used for inline subscribe / listen CTAs | ISR; `generateStaticParams` for featured profiles | Page scroll | Full OG/Twitter meta with artwork; JSON-LD MusicRecording / MusicAlbum | Track slugs client-redirect to `/{username}/{releaseSlug}/{trackSlug}`; `PreferredDspRedirect` fires client-side to auto-redirect to DSP | Unit: none profile-specific; E2E: smartlink-experience.spec | P0 |
| `/{username}/{slug}/{trackSlug}` | Track smart link | `ContentSmartLinkPage` for track type | Full-page ISR | No | Same as release smart link | ISR | Page scroll | Full OG/Twitter meta; canonical points to track path | Track pages redirect from `/{username}/{slug}` via client `PreserveSearchRedirect` | Unit: bench/track-route.bench.test | P1 |
| `/{username}/{slug}/sounds` | "Use this sound" page | `SoundsPage` → `SoundsLandingPage` | Full-page ISR (`revalidate = 300`); redirects to smart link if no video providers | No | Full page; `ProfileDrawerShell` used for subscribe CTA | ISR | Page scroll | OG/Twitter meta generated | Canonical points to smart link URL if no video links; inconsistent `ProfileDrawerShell` usage for subscribe CTAs | Unit: none found; E2E: none found | P2 |
| `/{username}/{slug}/download` | Promo download gate | `PromoDownloadGate` | Full page | No | Full page | Server-rendered | Page scroll | None found | Download gating logic; unclear if this page has its own metadata | Unit: none found | P2 |
| `/{username}/[...slug]` | Catch-all fallback | `CatchAllPage` → `redirect('/{username}')` | Server 307 redirect to profile root | Via redirect | Via redirect | Redirect to profile root | N/A | None | Silently swallows unknown sub-paths | None | P2 |

---

## 2. Component Duplication Map

### 2.1 Profile Shell

| Component | Path | Status | Notes |
|---|---|---|---|
| `ProfileCompactSurface` | `apps/web/components/features/profile/templates/ProfileCompactSurface.tsx` | **Active / canonical** | Main production mobile/tablet profile shell; contains bottom tab nav |
| `ProfileDesktopSurface` | `apps/web/components/features/profile/templates/ProfileDesktopSurface.tsx` | **Active / canonical** | Desktop layout; loaded lazily via `dynamic()` in `ProfileCompactTemplate` |
| `ProfileCompactTemplate` | `apps/web/components/features/profile/templates/ProfileCompactTemplate.tsx` | **Active / canonical** | Router between compact and desktop surface; owns URL↔mode sync logic |
| `StaticArtistPage` | `apps/web/components/features/profile/StaticArtistPage.tsx` | **Active / canonical** | Thin adapter — builds view model, renders `ProfileCompactTemplate` |
| `ProfileShell` | `apps/web/components/organisms/profile-shell/ProfileShell.tsx` | **Legacy — superseded** | Old organism-layer shell with `PublicSurfaceShell` + bottom dock nav; still exported from organisms but not used in the main `/{username}` route; used only via `ArtistPageShell` which is in turn used only by `PublicProfileTemplate` (legacy chain) |
| `ArtistPageShell` | `apps/web/components/features/profile/ArtistPageShell.tsx` | **Legacy — wrapper for ProfileShell** | Thin memo wrapper around `ProfileShell`; no live callers outside legacy template chain |
| `PublicProfileTemplate` | `apps/web/components/features/profile/templates/PublicProfileTemplate.tsx` | **Legacy — used only by AnimatedArtistPage** | Wraps `ArtistPageShell`; explicitly marked NOSONAR legacy in AnimatedArtistPage |
| `PublicProfileTemplateV2` | `apps/web/components/features/profile/templates/PublicProfileTemplateV2.tsx` | **Legacy — scroll-page layout** | Full-page scroll layout (not viewport-locked); used by `ProgressiveArtistPage` which is only exported from index.ts but has no live callers in production routes |
| `AnimatedArtistPage` | `apps/web/components/features/profile/animated-artist-page/AnimatedArtistPage.tsx` | **Dead — explicitly marked deprecated** | Comment in source: "AnimatedArtistPage is itself deprecated; both are legacy non-production components" |
| `ProgressiveArtistPage` | `apps/web/components/features/profile/ProgressiveArtistPage.tsx` | **Near-dead — thin wrapper over StaticArtistPage** | Passes `presentation='compact-preview'` to `StaticArtistPage`; exported from barrel but no live page callers found |
| `ProfileViewportShell` | `apps/web/components/features/profile/ProfileViewportShell.tsx` | **Legacy — only used by PublicProfileTemplateV2** | Provides ambient image + header slot; not used in live production paths |

**Duplication risk:** 4 dead/legacy shell implementations (ArtistPageShell → ProfileShell → PublicProfileTemplate → AnimatedArtistPage; PublicProfileTemplateV2 → ProfileViewportShell) coexist with the active 3-layer stack (StaticArtistPage → ProfileCompactTemplate → ProfileCompactSurface / ProfileDesktopSurface).

### 2.2 Bottom Navigation

| Component | Path | Status | Notes |
|---|---|---|---|
| Bottom nav in `ProfileCompactSurface` | `apps/web/components/features/profile/templates/ProfileCompactSurface.tsx:663` | **Active / canonical** | Inline `<nav>` with `data-testid='profile-bottom-nav'`; renders Home/Music/Events/Alerts/More; `showBottomNav = true` hardcoded |
| Bottom dock in `ProfileShell` (organism) | `apps/web/components/organisms/profile-shell/ProfileShell.tsx:274` | **Legacy** | `<nav aria-label='Profile Modes'>` with `CircleIconButton` dock; uses CSS vars for theming; NOT used in live route |

**Duplication risk:** Two entirely different bottom nav implementations; only one is live.

### 2.3 Alert / Subscribe / Email Capture

| Component | Path | Context | Notes |
|---|---|---|---|
| `ProfileInlineNotificationsCTA` | `apps/web/components/features/profile/artist-notifications-cta/ProfileInlineNotificationsCTA.tsx` | **Active / canonical** — used in `ProfileCompactSurface`, `ProfileDesktopSurface`, release pages | Multi-step subscribe form (email → OTP → name → birthday → done) |
| `ArtistNotificationsCTA` | `apps/web/components/features/profile/artist-notifications-cta/ArtistNotificationsCTA.tsx` | **Active** — wraps `ProfileInlineNotificationsCTA`; used in `NotificationsPageClient`, `ProfileModeDrawer`, `TourModePanel`, `SubscribeView`, `VideoReleasePage` | Thin adapter that passes through to `ProfileInlineNotificationsCTA` |
| `TwoStepNotificationsCTA` | `apps/web/components/features/profile/artist-notifications-cta/TwoStepNotificationsCTA.tsx` | **Active** — used in `ProfileUnifiedDrawer`, `ProfileModeDrawer`, `SubscribeView`, `ProfilePrimaryTabPanel` | Two-step variant (email first, then OTP) via `ProfileInlineNotificationsCTA` with `twoStep` prop |
| `AlertGrowthLanding` | `apps/web/components/features/alerts/AlertGrowthLanding.tsx` | **Active** — used only on `/{username}/alerts` page | Completely different visual surface (standalone full-page); reads `?s=` source code |
| `NativeSmsSubscribeButton` | `apps/web/components/features/profile/artist-notifications-cta/NativeSmsSubscribeButton.tsx` | **Active** — part of SMS flow | Renders a native `sms:` href for iOS/Android; part of subscribe flow |
| `SubscribeDrawer` | `apps/web/components/features/profile/SubscribeDrawer.tsx` | **Potentially orphaned** — imports `ProfileDrawerShell` but no live callers found outside of the file itself | Check if still imported anywhere in production code before Phase 1 |

### 2.4 Link Buttons (DSP / Social / Smart Links)

| Component | Path | Context | Notes |
|---|---|---|---|
| `StaticListenInterface` | `apps/web/components/features/profile/StaticListenInterface.tsx` | Used in `ProfileShell` context (legacy) | DSP list in old ProfileShell layout |
| `AnimatedListenInterface` | `apps/web/components/features/profile/animated-listen-interface/AnimatedListenInterface.tsx` | Used by `AnimatedArtistPage` (dead) | Animated DSP list; also dead |
| `ListenView` (in `ListenDrawer`) | `apps/web/components/features/profile/views/ListenView.tsx` | **Active** — used in `ProfileUnifiedDrawer` and `ListenDrawer` | Canonical live DSP list for compact/desktop |
| `ReleaseLandingPage` provider buttons | `apps/web/app/r/[slug]/ReleaseLandingPage.tsx` | **Active** — smart link DSP buttons | Separate from profile DSP links; shares `PROVIDER_CONFIG` data |
| `SocialLinkComponent` | `apps/web/components/molecules/SocialLink.tsx` | Used in legacy `ProfileShell` header | Legacy social link pill |
| Social icon links in `ProfileCompactSurface` hero | Inline in `ProfileCompactSurface.tsx:511` | **Active** | Direct `<a>` + `<SocialIcon>` in hero identity block |

### 2.5 Music Cards / Embeds

| Component | Path | Context | Notes |
|---|---|---|---|
| `ProfileMediaCard` | `apps/web/components/features/profile/ProfileMediaCard.tsx` | **Active** — used by `LatestReleaseCard`, `ProfileHomeRail`, `TourDateCard` | Generic media card primitive |
| `LatestReleaseCard` | `apps/web/components/features/profile/LatestReleaseCard.tsx` | **Active** | Renders latest release artwork + title + DSP links |
| `ProfileFeaturedCard` | `apps/web/components/features/profile/ProfileFeaturedCard.tsx` | **Active** — used in `PublicProfileTemplateV2` (`ProfileScrollBody`) and exports `resolveFeaturedContent` | Featured tour-or-release card for the legacy V2 scroll layout |
| `ProfilePrimaryActionCard` | `apps/web/components/features/profile/ProfilePrimaryActionCard.tsx` | **Active** — used in `ProfileCompactSurface` / `ProfileHomeRail` | Hero action card showing latest release or tour date; P1 featured action |
| `ProfileHomeRail` | `apps/web/components/features/profile/ProfileHomeRail.tsx` | **Active** — renders in home tab of `ProfileCompactSurface` | Horizontal rail of cards (latest release, tour, alerts, playlist, listen) |

### 2.6 Merch / Social Blocks

| Component | Path | Context | Notes |
|---|---|---|---|
| `SocialBar` (organism) | `apps/web/components/organisms/SocialBar.tsx` | Marketing / legacy organism | Not used in live profile surface |
| Social icons in `ProfileShell` header | Legacy — `ProfileShell.tsx:234` | Not live | |
| Social icon row in `ProfileCompactSurface` hero | Inline — `ProfileCompactSurface.tsx:506` | **Active** | Canonical live social icon row |
| Shop button in `ProfileShell` dock | Legacy dock, not live | N/A | |
| Shop trigger in `ProfileCompactTemplate` `ProfileDesktopSurface` | Via `onOpenMenu` → drawer menu | **Active** | Shop opens as external link |

### 2.7 Drawers / Modals / Sheets

| Component | Path | Context | Notes |
|---|---|---|---|
| `ProfileUnifiedDrawer` | `apps/web/components/features/profile/ProfileUnifiedDrawer.tsx` | **Active / canonical** | Single drawer hub for compact surface: listen, releases, share, menu, notifications, about, contact, pay views |
| `ProfileDrawerShell` | `apps/web/components/features/profile/ProfileDrawerShell.tsx` | **Active primitive** — used by almost all drawers as their container | Vaul-backed drawer sheet; handles standalone / embedded / modal presentation variants |
| `ListenDrawer` | `apps/web/components/features/profile/ListenDrawer.tsx` | **Active** — used in `PublicProfileTemplateV2` and `ProfilePrimaryCTA` | Standalone DSP list drawer; separate from listen view inside `ProfileUnifiedDrawer` |
| `PayDrawer` | `apps/web/components/features/profile/PayDrawer.tsx` | **Active** — used in `ProfileShell` (organism, legacy), `PublicProfileTemplateV2`, and mobile pay path of `ProfileCompactTemplate` | Venmo pay drawer |
| `SubscribeDrawer` | `apps/web/components/features/profile/SubscribeDrawer.tsx` | **Likely orphaned** — no live callers found | |
| `ProfileModeDrawer` | `apps/web/components/features/profile/ProfileModeDrawer.tsx` | **Only called from tests** — no live production callers found | Was the original single-mode drawer; superseded by `ProfileUnifiedDrawer` |
| `ProfileMenuDrawer` | `apps/web/components/features/profile/ProfileMenuDrawer.tsx` | **Likely orphaned** — imports `ProfileDrawerShell` but no live callers found | |
| `ContactDrawer` | `apps/web/components/features/profile/artist-contacts-button/ContactDrawer.tsx` | **Active** — used in `PublicProfileTemplateV2` | Standalone contact drawer; also logic covered inside `ProfileUnifiedDrawer → ContactView` |
| `TourModePanel` | `apps/web/components/features/profile/TourModePanel.tsx` | **Unclear** — uses `ProfileDrawerShell`; check if still called | |

### 2.8 Empty States

| Implementation | Path | Context | Notes |
|---|---|---|---|
| `resolveEmptyState` in profile surface state | `apps/web/components/features/profile/profile-surface-state.ts:230` | **Active** — drives `ProfileHomeRail` empty state | Resolves the appropriate empty content card variant based on artist data |
| Inline empty copy in `SwipeableModeContainer` | `apps/web/components/features/profile/SwipeableModeContainer.tsx:139` | Legacy swipeable mode container | "No upcoming shows right now…" inline string |
| `TableEmptyState` organism | `apps/web/components/organisms/table/atoms/TableEmptyState.tsx` | Dashboard only — NOT profile | Unrelated |

### 2.9 Error States

| Implementation | Path | Context | Notes |
|---|---|---|---|
| `ProfileError` (`error.tsx`) | `apps/web/app/[username]/error.tsx` | **Active** | Renders `PublicPageErrorFallback` with `context='Profile'` |
| Inline `ErrorBanner` in `ArtistPage` | `apps/web/app/[username]/page.tsx:344` | **Active** | Shown when `getProfileAndLinks` returns `status === 'error'`; profile shell not rendered |
| `ReleaseError` (`error.tsx`) | `apps/web/app/[username]/[slug]/error.tsx` | **Active** | Renders `ErrorBoundary` with `context='Release'` |
| `notFound()` in `ArtistPage` | `apps/web/app/[username]/page.tsx:359` | **Active** | Calls Next.js `notFound()` → renders `not-found.tsx` with 404 shell |
| `not-found.tsx` | `apps/web/app/[username]/not-found.tsx` | **Active** | Marketing-style 404 page with ghosted 404 text; uses `PublicPageShell` |

---

## 3. Legacy Cleanup List

Concrete named items to remove after migration. No vague entries.

### 3.1 Dead / Orphaned Components (Safe to Delete)

| Item | File | Reason | Phase |
|---|---|---|---|
| `AnimatedArtistPage` and entire directory | `apps/web/components/features/profile/animated-artist-page/` (6 files) | Explicitly marked deprecated in source comment; no live callers | JOV-2021 |
| `AnimatedListenInterface` and entire directory | `apps/web/components/features/profile/animated-listen-interface/` (5 files) | Only used by `AnimatedArtistPage` (dead) | JOV-2021 |
| `PublicProfileTemplate` | `apps/web/components/features/profile/templates/PublicProfileTemplate.tsx` | Only used by `AnimatedArtistPage` (dead) | JOV-2021 |
| `ArtistPageShell` | `apps/web/components/features/profile/ArtistPageShell.tsx` | Only used by `PublicProfileTemplate` (dead); exported from barrel but no live route callers | JOV-2021 |
| `ProfileShell` (organism) | `apps/web/components/organisms/profile-shell/ProfileShell.tsx` and `useProfileShell.ts`, `types.ts`, `index.ts` | Superseded by `ProfileCompactSurface`. NOTE: `useProfileShell` is still imported by live components — must split before deletion | JOV-2022 |
| `ProfileModeDrawer` | `apps/web/components/features/profile/ProfileModeDrawer.tsx` | Only referenced in tests; superseded by `ProfileUnifiedDrawer` | JOV-2021 |
| `ProfileMenuDrawer` | `apps/web/components/features/profile/ProfileMenuDrawer.tsx` | No live callers found in production code | JOV-2021 |
| `SubscribeDrawer` | `apps/web/components/features/profile/SubscribeDrawer.tsx` | No live callers found in production code | JOV-2021 |
| `SwipeableModeContainer` | `apps/web/components/features/profile/SwipeableModeContainer.tsx` | No live callers found in production code (legacy swipeable layout) | JOV-2021 |
| `ProfileViewportShell` | `apps/web/components/features/profile/ProfileViewportShell.tsx` | Only used by `PublicProfileTemplateV2` | JOV-2022 |
| `StaticListenInterface` | `apps/web/components/features/profile/StaticListenInterface.tsx` | Only used in `ProfileShell` (legacy) | JOV-2022 |

### 3.2 Legacy Templates to Deprecate After Verification

| Item | File | Reason | Phase |
|---|---|---|---|
| `PublicProfileTemplateV2` | `apps/web/components/features/profile/templates/PublicProfileTemplateV2.tsx` | Scroll-page layout; used only by `ProgressiveArtistPage` which has no live page callers | JOV-2022 |
| `ProgressiveArtistPage` | `apps/web/components/features/profile/ProgressiveArtistPage.tsx` | Thin wrapper; no live page callers; exported from barrel | JOV-2022 |
| `ProfileScrollBody` | `apps/web/components/features/profile/ProfileScrollBody.tsx` | Only used by `PublicProfileTemplateV2` | JOV-2022 |
| `ProfileFeaturedCard` (component, not the utility export) | `apps/web/components/features/profile/ProfileFeaturedCard.tsx` | Used in `ProfileScrollBody` (legacy V2 layout); `resolveFeaturedContent` utility is live and must be extracted first | JOV-2022 |
| `AnimatedArtistPage.stories.tsx` | `apps/web/components/features/profile/AnimatedArtistPage.stories.tsx` | Dead story for dead component | JOV-2021 |
| `ProfileSkeleton.stories.tsx` | `apps/web/components/features/profile/ProfileSkeleton.stories.tsx` | Check if skeleton still matches live layout | JOV-2022 |

### 3.3 Route-Specific Hacks to Resolve

| Hack | Location | Impact | Phase |
|---|---|---|---|
| `dynamic = 'force-dynamic'` on `/{username}` page.tsx | `apps/web/app/[username]/page.tsx:5` | Overrides ISR set by layout (`revalidate = 3600`); every profile visit is server-rendered on demand | JOV-2023 |
| `shouldBypassClerkForPublicProfiles` logic in layout | `apps/web/app/[username]/layout.tsx:13` | Bypasses Clerk in test/preview/E2E; fragile env-check chain | JOV-2025 |
| `screen.orientation.lock('portrait')` in `ProfileCompactTemplate` | `ProfileCompactTemplate.tsx:258` | Forces portrait orientation lock on any device viewing a profile; may interfere with tablet/landscape | JOV-2022 |
| `addListener` deprecated API fallback in `ProfileCompactTemplate` | `ProfileCompactTemplate.tsx:298-302` | `MediaQueryList.addListener` is deprecated; fallback still present | JOV-2022 |
| `globalThis.joviePixel?.track` with `@ts-expect-error` in `ProfileShell` | `ProfileShell.tsx:107` | Pixel tracking via global; not type-safe | JOV-2025 |
| `SHOW_PUBLIC_PROFILE_V1_DESIGN` static flag hardcoded to `false` | `apps/web/lib/flags/marketing-static.ts:44` | Dead code path for V1 design variant; `visualVariant='v1'` in `ProfileCompactTemplate` renders an alternate desktop sidebar | JOV-2021 |

### 3.4 Design Tokens / CSS Variables to Consolidate

| Token / Variable | Location | Issue |
|---|---|---|
| `--profile-stage-bg`, `--profile-content-bg`, `--profile-drawer-bg`, `--profile-panel-border`, `--profile-dock-border`, `--profile-dock-bg`, `--profile-dock-shadow`, etc. | Used throughout profile components via inline `style` + Tailwind arbitrary values | Custom CSS variables defined per-component with inconsistent naming; some defined in `buildProfileAccentCssVars`, others set via `style={}` inline; no single source of truth token file |
| `--profile-shell-max-width`, `--profile-shell-card-radius`, `--profile-shell-header-max-width` | Scattered across `ProfileCompactTemplate` and `ProfileCompactSurface` | Hard-coded magic values; not in design token system |

---

## 4. Risk List

### 4.1 Routes with Unclear Product Intent

| Route | Risk | Notes |
|---|---|---|
| `/{username}/notifications` | **Duplicate surface** — unclear canonical vs. `/alerts` | Two separate full-page subscribe surfaces exist: `/alerts` (campaign-linked, ISR) and `/notifications` (direct URL, no clear entry point from profile). Product intent of `/notifications` is ambiguous — it may be a dead route or a legacy QR-code landing page. |
| `/{username}?mode=releases` | **Mode implemented as drawer, not tab** | The "releases" mode opens a drawer rather than showing a tab panel — inconsistent with `listen`, `tour`, `subscribe` which all use tabs. Unclear if this is intentional product design or an implementation gap. |
| `/{username}/shop` | **Shopify hard redirect** | The shop route does a hard redirect to an external Shopify URL from `profile.settings.shopifyUrl`. The `ShopRedirectClient` client-side fallback fires if the server redirect didn't complete. Layout during redirect is undefined. |
| `/{username}/[...slug]` | **Silent catch-all redirect** | All unknown sub-paths silently redirect to the profile root. This could swallow future legitimate routes or make 404 errors invisible. |

### 4.2 Unclear Data Model Assumptions

| Risk | Source | Notes |
|---|---|---|
| `dynamic = 'force-dynamic'` on profile root | `apps/web/app/[username]/page.tsx:5` | `cookies()` is called in the page server component (for `AUDIENCE_ANON_COOKIE`), which forces dynamic rendering. ISR set in layout is effectively overridden. Fixing this requires moving cookie reads to a client component or API route. |
| `profile.settings` as `Record<string, unknown>` | Throughout `page.tsx` | All profile feature flags (shop enabled, photo download, showOldReleases, avatarSizes, featuredPlaylist) are read by casting `profile.settings` JSON to `Record<string, unknown>`. No Zod validation; any malformed JSON silently applies defaults. |
| `convertCreatorProfileToArtist` mapping | `types/db.ts` → used in every profile route | Profile data is fetched as `CreatorProfile` then converted to `Artist`; multiple fields have nullable fallbacks with `??` chains; conversion logic not co-located with schema. |
| `getLegacySocialLinks` / `LegacySocialLink` type | Referenced throughout | Social links stored in a `links` table with a `platform` string — no enum enforcement at DB level; platform string mismatches silently drop links. |

### 4.3 Third-Party Embeds with Layout/Scroll Risk

| Embed | Route | Risk |
|---|---|---|
| Vaul (drawer library) | `ProfileDrawerShell` → all drawers | Vaul's `shouldScaleBehind` prop and `snapPoints` interact with the `overflow-hidden h-[100dvh]` profile container. In embedded presentation mode (768–1180px width), the drawer sits inside the profile card — scroll conflicts possible on short-viewport devices. |
| YouTube iFrame (music video releases) | `/{username}/{slug}` (releaseType=music_video) | `VideoReleasePage` renders a YouTube embed. The iFrame `height` is set to `100%` inside a flex container; on short viewports the embed may overflow or collapse. |
| `screen.orientation.lock('portrait')` | `ProfileCompactTemplate` | May cause layout issues on foldable devices or tablets in landscape. |
| Venmo deep link (`venmo://...`) | `PayDrawer` / `VenmoPaySelector` | Deep link resolution is device-dependent; fallback to web Venmo is via `window.open`. No timeout or failure detection. |

### 4.4 Analytics Events that Could Break

| Event | Location | Risk |
|---|---|---|
| `joviePixel.track('tip_page_view')` | `ProfileShell.tsx:107` (legacy, organism) | Uses `globalThis.joviePixel` — a global set by `JoviePixel` server component. If `JoviePixel` is not rendered (legacy `ProfileShell` path), this fires against `undefined`. Currently marked `@ts-expect-error`. |
| Visit tracking via `/api/audience/visit` | `ProfileViewTracker` component; `getClientTrackingToken` in `page.tsx` | HMAC token generated server-side; if `TRACKING_TOKEN_SECRET` is not configured, `visitTrackingToken` is `undefined` and visit tracking silently fails. No error metric emitted. |
| `PreferredDspRedirect` auto-redirect tracking | `/{username}/{slug}` smart link | Fires a tracking request before redirecting to DSP. If the tracking API is slow, users see a blank page briefly. |

### 4.5 Public SEO / Share Behavior Risks

| Risk | Location | Notes |
|---|---|---|
| OG image uses `opengraph-image.tsx` | `apps/web/app/[username]/opengraph-image.tsx` | Profile OG image is generated via Next.js ImageResponse. If avatar URL is slow or fails, OG image generation can timeout or produce a broken share card. |
| JSON-LD `dateCreated` / `dateModified` uses raw `profile.created_at` / `profile.updated_at` Date objects | `page.tsx:187-188` | Date objects passed directly into the JSON-LD graph. `safeJsonLdStringify` handles serialization, but if dates are missing the fields are omitted silently — fine for SEO but worth auditing. |
| Smart link canonical URL for tracks points to track path not release path | `/{username}/{slug}` metadata | Tracks redirect client-side to `/{username}/{releaseSlug}/{trackSlug}` but the metadata canonical in `generateMetadata` already points to the track path. If the redirect fires before crawlers index the canonical, the canonical may appear broken. |
| `/{username}/alerts` `robots: index: true` | `alerts/page.tsx` | This page is a campaign-linked landing; indexing it causes SEO cannibalization with the main profile page for artist name searches. |
| `not-found.tsx` uses `PublicPageShell` (marketing nav) | `apps/web/app/[username]/not-found.tsx` | 404 for unknown artists shows marketing-style nav; inconsistent with profile surface expectations. Could be confusing for users deep-linked to an artist profile that was deleted. |
| No `alternates.canonical` for `?mode=` URLs | `/{username}?mode=listen`, etc. | Modes accessed via query params have no canonical URL specified — search engines may index all mode variants as separate pages. |

---

## 5. Maps to Sub-Issues

| Finding | Sub-Issue |
|---|---|
| Dead component cleanup: AnimatedArtistPage, AnimatedListenInterface, PublicProfileTemplate, ArtistPageShell, ProfileModeDrawer, ProfileMenuDrawer, SubscribeDrawer, SwipeableModeContainer, SHOW_PUBLIC_PROFILE_V1_DESIGN flag | JOV-2021 — Phase 1: Component Cull |
| Legacy template removal: PublicProfileTemplateV2, ProgressiveArtistPage, ProfileScrollBody, ProfileViewportShell, ProfileShell organism, ArtistPageShell; useProfileShell extraction | JOV-2022 — Phase 2: Template Consolidation |
| `dynamic = 'force-dynamic'` → ISR restoration; `cookies()` read extraction; profile settings Zod validation | JOV-2023 — Phase 3: Route Data Hardening |
| Bottom nav tab consistency (releases, about, contact discoverability); empty-state standardization | JOV-2024 — Phase 4: Navigation Hardening |
| `shouldBypassClerkForPublicProfiles` cleanup; `joviePixel` global type-safety; visit tracking error metric | JOV-2025 — Phase 5: Auth + Tracking Hardening |
| Profile CSS variable consolidation; design token source-of-truth | JOV-2026 — Phase 6: Token / Style Hardening |
| `/{username}/notifications` vs. `/alerts` clarification; shop route UX; catch-all route behavior | JOV-2027 — Phase 7: Route Intent Clarification |
| OG image reliability; smart link canonical; `robots: index: true` on `/alerts`; `?mode=` canonical | JOV-2028 — Phase 8: SEO Hardening |
| Vaul scroll conflicts in embedded presentation; YouTube embed layout on short viewports; Venmo deep-link fallback | JOV-2029 — Phase 9: Embed + Scroll Risk Remediation |

---

## Appendix: Key File Paths

### Active Production Files
- Route root: `apps/web/app/[username]/page.tsx`
- Route layout: `apps/web/app/[username]/layout.tsx`
- Profile data loader: `apps/web/app/[username]/_lib/public-profile-loader.ts`
- Profile mode registry: `apps/web/components/features/profile/registry.ts`
- Profile contracts: `apps/web/components/features/profile/contracts.ts`
- Main page entry point: `apps/web/components/features/profile/StaticArtistPage.tsx`
- Active template: `apps/web/components/features/profile/templates/ProfileCompactTemplate.tsx`
- Mobile/tablet surface: `apps/web/components/features/profile/templates/ProfileCompactSurface.tsx`
- Desktop surface: `apps/web/components/features/profile/templates/ProfileDesktopSurface.tsx`
- Unified drawer: `apps/web/components/features/profile/ProfileUnifiedDrawer.tsx`
- Subscribe CTA: `apps/web/components/features/profile/artist-notifications-cta/ProfileInlineNotificationsCTA.tsx`
- Surface state resolver: `apps/web/components/features/profile/profile-surface-state.ts`

### Legacy Files (Candidates for Deletion)
- `apps/web/components/features/profile/animated-artist-page/` (entire directory)
- `apps/web/components/features/profile/animated-listen-interface/` (entire directory)
- `apps/web/components/features/profile/templates/PublicProfileTemplate.tsx`
- `apps/web/components/features/profile/templates/PublicProfileTemplateV2.tsx`
- `apps/web/components/features/profile/ArtistPageShell.tsx`
- `apps/web/components/features/profile/ProgressiveArtistPage.tsx`
- `apps/web/components/features/profile/ProfileScrollBody.tsx`
- `apps/web/components/features/profile/ProfileViewportShell.tsx`
- `apps/web/components/features/profile/ProfileModeDrawer.tsx`
- `apps/web/components/features/profile/ProfileMenuDrawer.tsx`
- `apps/web/components/features/profile/SubscribeDrawer.tsx`
- `apps/web/components/features/profile/SwipeableModeContainer.tsx`
- `apps/web/components/features/profile/StaticListenInterface.tsx`
- `apps/web/components/organisms/profile-shell/ProfileShell.tsx` (after `useProfileShell` extraction)
