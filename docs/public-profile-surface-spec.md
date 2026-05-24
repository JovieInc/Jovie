# Public Profile Surface Spec — JOV-2020

**Status:** Canonical  
**Date:** 2026-05-08  
**Author:** COS coder agent (cos/jov-2020-profile-spec)  
**Input:** `docs/public-profile-hardening-audit.md` (JOV-2019)  
**Consumed by:** JOV-2021, JOV-2022, JOV-2023, JOV-2024, JOV-2025, JOV-2026, JOV-2027  

> This document is the canonical UX contract for the public profile epic. Implementation sub-issues MUST cite this spec. When a finding conflicts with this spec, update this doc and cite the amendment.

---

## 1. Route Categories

Every route under `/{username}` belongs to exactly one category. Category membership determines tab bar visibility, caching strategy, shell chrome, and back behavior.

### 1.1 Top-Level Profile Section

Routes rendered inside the compact profile surface, showing the bottom tab bar.

| Route | Active Tab | Notes |
|---|---|---|
| `/{username}` | Home | Profile root; canonical primary surface |
| `/{username}?mode=profile` | Home | Alias — same as root |
| `/{username}?mode=listen` | Music | DSP list in tab panel / drawer |
| `/{username}?mode=tour` | Events | Shown only when `hasTourDates === true`; omitted from tab bar otherwise |
| `/{username}?mode=subscribe` | Alerts | Inline subscribe flow within tab panel |
| `/{username}?mode=releases` | Music | Releases drawer overlay; Music tab stays active |
| `/{username}?mode=about` | Home | About drawer overlay; Home tab stays active |
| `/{username}?mode=contact` | Home | Contact drawer overlay; Home tab stays active |
| `/{username}?mode=pay` | Home | Pay drawer on mobile; panel on desktop; Home tab stays active |

### 1.2 Secondary Task Flow (Full-Page, No Tab Bar)

Standalone pages with their own visual surface. No profile bottom tab bar. User arrives from an external link, campaign, or direct navigation. Back returns to the referring context, not to the tab bar.

| Route | Purpose | Caching |
|---|---|---|
| `/{username}/alerts` | Campaign-linked subscribe landing; reads `?s=` source code client-side | ISR (`revalidate = 3600`) |
| `/{username}/notifications` | Legacy standalone subscribe page; no clear entry point from profile (see §4.3 for canonical decision) | Defaults (see §4.3) |
| `/{username}/{slug}` | Content smart link / release landing page | ISR (`revalidate = 300`) + `generateStaticParams` for featured profiles |
| `/{username}/{slug}/{trackSlug}` | Track smart link | ISR (`revalidate = 300`) |
| `/{username}/{slug}/sounds` | "Use this sound" page | ISR (`revalidate = 300`) |
| `/{username}/{slug}/download` | Promo download gate | Server-rendered |

### 1.3 External Action

Routes that exist solely to redirect or execute a side-effect. They do not render a UI surface. Back does not apply.

| Route | Behavior |
|---|---|
| `/{username}/claim` | Route handler (`route.ts`); initiates claim flow |
| `/{username}/shop` | Server fetch Shopify URL → redirect; `ShopRedirectClient` client-side fallback; `robots: index: false` |
| `/{username}/tip` | Legacy redirect → `/{username}?mode=pay` (preserves `?source=`) |

### 1.4 Redirect Sink (Mode Redirect)

Routes that exist only to redirect to a `?mode=` equivalent on the profile root. Rendered entirely server-side via `redirectToProfileMode()`. No page UI. No tab bar.

| Route | Redirects To |
|---|---|
| `/{username}/about` | `/{username}?mode=about` |
| `/{username}/contact` | `/{username}?mode=contact` |
| `/{username}/listen` | `/{username}?mode=listen` |
| `/{username}/pay` | `/{username}?mode=pay` |
| `/{username}/releases` | `/{username}?mode=releases` |
| `/{username}/subscribe` | `/{username}?mode=subscribe` |
| `/{username}/tour` | `/{username}?mode=tour` |

All redirect sinks issue HTTP 307. Future implementation may upgrade to 308 permanent — that is a JOV-2027 decision, not a JOV-2020 decision.

### 1.5 System / Utility State

Routes that represent loading, empty, error, or unavailable states, not product navigation.

| State | Mechanism | Notes |
|---|---|---|
| 404 — unknown artist | `notFound()` in `ArtistPage` → `not-found.tsx` | Renders `PublicPageShell` (marketing nav); see §4.4 for canonical decision on shell choice |
| Profile error | `error.tsx` → `PublicPageErrorFallback` with `context='Profile'` | Shown when `getProfileAndLinks` returns `status === 'error'` |
| Release error | `/{username}/[slug]/error.tsx` → `ErrorBoundary` with `context='Release'` | |
| Unknown sub-path | `/{username}/[...slug]` catch-all → 307 redirect to `/{username}` | Silently swallows unknown sub-paths; see JOV-2027 for intent clarification |

---

## 2. Bottom Tab Bar Contract

### 2.1 Canonical Tab Definitions

Exactly four tabs. Order is fixed. Labels and icons are fixed. No exceptions.

| Position | Mode | Label | Icon (Lucide) |
|---|---|---|---|
| 1 | `profile` | Home | `UserRound` |
| 2 | `listen` | Music | `Music2` |
| 3 | `tour` | Events | `CalendarDays` |
| 4 | `subscribe` | Alerts | `Bell` |

A fifth "More" menu item appears after the four tabs when `hideMoreMenu` is `false`. More is not a tab — it opens the `menu` drawer.

### 2.2 Tab Bar Visibility Rules

| Context | Tab Bar Visible? |
|---|---|
| Any route in Category 1 (Top-Level Profile Section) | Yes — always |
| Any route in Category 2 (Secondary Task Flow) | No |
| Any route in Category 3 (External Action) | No |
| Any route in Category 4 (Redirect Sink) | No — user is redirected before a UI renders |
| Any route in Category 5 (System / Utility State) | No |

Implementation note: `showBottomNav` is currently hardcoded to `true` in `ProfileCompactSurface`. This is correct for Category 1 routes. It is not exposed as a prop. JOV-2024 may add conditional logic — do not change this before that issue is in progress.

### 2.3 Conditional Tab: Events

The Events tab is omitted from the tab bar when `hasTourDates === false`. When omitted:
- The `tour` mode is not accessible via the tab bar.
- The grid column count decreases by one (4 tabs + More → 3 tabs + More).
- Entering `/{username}?mode=tour` directly redirects the active tab highlight to `profile` (Home) — the tab bar renders without the tour entry active.

No other tabs are conditional. Home, Music, and Alerts appear for all artists.

### 2.4 Active State Determination

Active state is determined by `resolveActivePrimaryTab()` in `ProfileCompactSurface`. Rules:
- The `mode` query param maps directly to a `ProfilePrimaryTab` value.
- If the mode is `tour` and `hasTourDates === false`, the active tab falls back to `profile`.
- Drawer modes (`releases`, `about`, `contact`, `pay`) do not change the active tab — the tab that was active before the drawer opened remains active.
- On the profile root (`/{username}` with no `?mode=`), the active tab is `profile`.

### 2.5 Behavior on Direct Load / Refresh / Deep Link / Back

| Scenario | Behavior |
|---|---|
| Direct load of `/{username}` | Tab bar renders; Home tab active; profile data fetched server-side (ISR after JOV-2023 fix) |
| Direct load of `/{username}?mode=listen` | Tab bar renders; Music tab active; drawer or tab panel opens to DSP list |
| Direct load of `/{username}?mode=subscribe` | Tab bar renders; Alerts tab active; inline subscribe form visible |
| Direct load of `/{username}?mode=tour` | Tab bar renders; Events tab active if `hasTourDates === true`; otherwise falls back to Home |
| Direct load of `/{username}?mode=releases` | Tab bar renders; Music tab active; releases drawer opens |
| Browser refresh on any `?mode=` | Page reloads; the same mode is restored from the URL (no state is lost) |
| Browser back from a drawer mode | Returns to the previous `?mode=` in the browser history stack (via `history.pushState`). If the drawer was opened from Home, back returns to Home. |
| Browser back from `/{username}/alerts` | Returns to the referring page (external or profile root); does not return to the tab bar |
| Deep link to `/{username}/listen` | Server redirect to `/{username}?mode=listen`; browser loads profile with Music tab active |

### 2.6 Content Padding for Tab Bar Height and Safe Area

All content rendered inside Category 1 routes MUST apply bottom padding equal to the tab bar height plus the device safe area inset. The tab bar height is `3.5rem` (56px). Safe area inset is applied via `env(safe-area-inset-bottom)`.

Canonical padding class: `pb-[calc(3.5rem+env(safe-area-inset-bottom))]`

Content that does not apply this padding will be obscured by the tab bar on devices with a home indicator (iOS) or gesture navigation bar (Android).

### 2.7 Desktop and Tablet Behavior

| Viewport | Tab Bar Behavior |
|---|---|
| < 768px (mobile) | Tab bar renders at the bottom of the viewport-locked surface |
| 768–1180px (tablet / embedded mode) | Tab bar renders; profile card is inset inside the page; safe area padding still applies |
| > 1180px (desktop) | `ProfileDesktopSurface` is loaded via `dynamic()`. Desktop layout uses a sidebar panel instead of a bottom drawer for secondary modes. The bottom tab bar does not render on `ProfileDesktopSurface`. Navigation uses sidebar/panel affordances. |

Desktop tab behavior is owned by JOV-2024. This spec records the current behavior; JOV-2024 may modify it.

### 2.8 Maximum Tabs Before Overflow

The tab bar supports a maximum of **4 primary tabs plus one More item**. When the Events tab is visible, the grid is `5 columns` (4 tabs + More). When Events is hidden, the grid is `4 columns` (3 tabs + More). No additional tabs may be added to the primary tab bar without human product approval. If a future tab exceeds this count, the overflow belongs in the More drawer menu.

---

## 3. Navigation Contract

### 3.1 Top-Level Navigation Uses Route Changes

Mode changes at the top level (Home ↔ Music ↔ Events ↔ Alerts) MUST update the URL via `history.pushState` to `/{username}?mode=<mode>`. This ensures:
- Browser back and forward work correctly.
- Deep links share the correct state.
- Server-side rendering on direct load produces the correct active tab.

Fake local state (`useState` toggling between sections without URL change) is banned for primary tabs.

### 3.2 Secondary Flows Use Full-Page Routes

Secondary flows that require their own metadata, full chrome replacement, or paid-traffic landing pages MUST be separate Next.js pages (`/{username}/alerts`, `/{username}/{slug}`, etc.), not drawer states or query-param toggles on the profile root.

Drawers are for **contextual overlays** that enhance the current profile context. Drawers are not a substitute for a full-page route when:
- The content needs its own metadata (OG, Twitter, JSON-LD).
- The content is linked from external sources (campaigns, QR codes).
- The content is a complete task flow with its own entry and exit points.

### 3.3 Back Behavior

| Navigation | Back Result |
|---|---|
| Tab click (pushes `?mode=X`) | Previous `?mode=` or profile root |
| Drawer open (does not push new entry in history) | Drawer closes; same `?mode=` remains active |
| Redirect sink (`/{username}/listen`) | Back returns to the page that linked to the sink |
| Full-page secondary (`/{username}/alerts`) | Back returns to the referring page |

Back must never strand the user on a dead-end state. Every navigable state must have a clear exit. Drawers close on backdrop tap, swipe-down (Vaul), and Escape (desktop). Full-page secondary routes show a back affordance in their own chrome.

### 3.4 No Drawer-Only Access

Every profile mode that is a user destination MUST be reachable by URL. The following modes have URL-addressable entry points:
- `/{username}?mode=listen` — Music/DSP list
- `/{username}?mode=subscribe` — Alerts opt-in
- `/{username}?mode=tour` — Tour dates (when available)
- `/{username}?mode=releases` — Releases/discography
- `/{username}?mode=about` — Bio/about
- `/{username}?mode=contact` — Contact channels
- `/{username}?mode=pay` — Tip/pay

No mode may be accessible only via a drawer trigger without a corresponding URL entry point. Modes that lack a URL today (e.g., contact, about) are reachable via the redirect sinks (`/{username}/contact`, `/{username}/about`).

### 3.5 No Overlay / Embedded-Form Dead Ends

Inline forms and embedded components within the profile surface MUST have:
1. A clear dismiss / close affordance (X button, backdrop tap, or Escape).
2. A success state that returns the user to the profile context (not a blank or broken state).
3. An error state that keeps the user on the form with an error message — not a full-page error.

---

## 4. Alert / Subscribe Contract

### 4.1 Canonical CTA Label

The canonical label for the primary alert/subscribe call-to-action is:

**"Get alerts"**

This label is used on:
- The primary submit button in `AlertGrowthLanding` (full-page landing, `/{username}/alerts`)
- The submit button in `ProfileInlineNotificationsCTA` (inline form, `?mode=subscribe`)
- The Alerts tab label in the bottom tab bar

**Banned alternatives:** "Subscribe", "Notify me", "Follow", "Get notified", "Stay updated", "Be the first", "Sign up", "Join". Do not introduce new variants without human product approval.

### 4.2 Canonical Destination

The canonical entry point for a fan arriving from an external campaign link (SMS, email, social) is `/{username}/alerts`. This page is the single durable URL for alert campaigns.

The inline form at `?mode=subscribe` is the in-profile entry point (accessed from the Alerts tab). It is not a campaign landing page.

### 4.3 Canonical Decision: `/notifications` vs. `/alerts`

**The `/{username}/notifications` route is a legacy dead-end. Its canonical status is: deprecated, redirect to `/{username}/alerts`.**

Rationale (from audit §4.1): Two separate full-page subscribe surfaces exist with overlapping intent. `/alerts` is the campaign-linked surface (ISR, full metadata, `robots: index: true`). `/notifications` has no entry point from the profile, no clear product intent, and no test coverage. Deduplication is a JOV-2027 task.

Until JOV-2027 ships, `/notifications` continues to serve its current behavior. After JOV-2027 ships, `/notifications` issues a 301 permanent redirect to `/{username}/alerts`.

### 4.4 Canonical Decision: 404 Shell

**The `/{username}/not-found.tsx` 404 page continues to use `PublicPageShell` (marketing nav) until a future issue explicitly changes it.** This decision is intentionally deferred. JOV-2027 may address it if the team decides the 404 experience needs to match the profile shell.

### 4.5 One Full-Page UI

`/{username}/alerts` is the single canonical full-page subscribe UI. `AlertGrowthLanding` is the canonical component for this surface. No new full-page subscribe surfaces may be created without deprecating an existing one.

### 4.6 Success State

After successful subscription, the subscribe form shows a confirmation state within the same surface. The user is not redirected. The confirmation copy is: **"You're all set"** (heading) + the artist name acknowledgment below. The flow exits back to the inline form in the collapsed/confirmed state.

Full-page (`/{username}/alerts`): the form shows a success confirmation inline within `AlertGrowthLanding`. The URL does not change.

### 4.7 Error State

Subscribe errors are shown inline within the form. The error message is not a toast — it is an error message rendered inside the form, adjacent to the offending field. The user remains on the form. The form fields are not cleared.

Generic error copy: **"Something went wrong. Try again."**  
Email format error: **"Enter a valid email address."**  
OTP error: **"Incorrect code. Try again."**

### 4.8 Canonical Analytics Event Set

The following events are the canonical set for the alert/subscribe flow. Implementation sub-issues MUST NOT introduce new subscribe-adjacent event names.

| Event | Fired When |
|---|---|
| `subscribe_step_reveal` | Subscribe form opens / step advances |
| `subscribe_click` | User clicks the primary subscribe button |
| `notifications_subscribe_attempt` | Subscribe API call initiated |
| `notifications_subscribe_success` | Subscription confirmed (email or SMS) |
| `notifications_subscribe_error` | Subscribe API call failed |
| `otp_resend_attempt` | User requests OTP resend |
| `otp_resend_success` | OTP resend confirmed |
| `sms_intent_create_attempt` | SMS intent initiated |
| `sms_intent_create_success` | SMS intent created |
| `sms_intent_create_error` | SMS intent failed |
| `sms_native_sms_opened` | Native SMS app opened |
| `sms_subscription_confirmed` | SMS subscription confirmed |
| `sms_join_code_expired` | SMS join code expired before use |
| `name_capture_shown` | Name capture step displayed |
| `name_capture_submitted` | Name captured |
| `name_capture_skipped` | Name capture skipped |

All events include `{ artist_id, handle }` as base properties. Additional properties per event are in `useSubscriptionForm.ts`.

### 4.9 No Duplicate Drawer / Embed Variants

The inline form (`ProfileInlineNotificationsCTA` via `ArtistNotificationsCTA`) and the full-page landing (`AlertGrowthLanding`) are the only two subscribe surfaces. No new drawer-only or embed-only variants may be added. The `SubscribeDrawer` component is orphaned (no live callers per audit §2.3) and is scheduled for deletion in JOV-2021.

---

## 5. Copy Contract

### 5.1 Tab Labels (Fixed)

| Tab | Label |
|---|---|
| Profile / Home | Home |
| Listen / Music | Music |
| Tour / Events | Events |
| Subscribe / Alerts | Alerts |
| More menu trigger | More |

These labels are not translated in the initial implementation. Internationalization is out of scope for JOV-2021..JOV-2027.

### 5.2 CTA Labels

| Action | Label |
|---|---|
| Primary subscribe button (full-page) | Get alerts |
| Primary subscribe button (inline) | Get alerts |
| SMS subscribe button | Get alerts via text |
| OTP verify button | Verify |
| OTP resend link | Resend code |
| Name capture continue | Continue |
| Name capture skip | Skip |
| Birthday capture continue | Continue |
| Birthday capture skip | Skip |
| Success dismiss / close | Done |
| Subscribe manage (already subscribed) | Manage alerts |
| Pay / tip primary | Send a tip |
| Contact primary | View contacts |
| Listen / DSP primary | Listen |

### 5.3 Helper Text

| Context | Copy |
|---|---|
| Subscribe email step | Enter your email to get alerts from {artistName} |
| Subscribe email placeholder | Email address |
| Subscribe OTP step | We sent a code to {email} |
| Subscribe name step | What's your name? (optional) |
| Subscribe birthday step | When's your birthday? (optional) |
| Subscribe success heading | You're all set |
| Subscribe success body | You'll get alerts from {artistName} |
| Alerts tab empty state (no subscription) | Get alerts from {artistName} |
| Events tab empty state (no tour dates) | No upcoming tour dates |
| Music tab empty state (no releases) | No releases yet |

### 5.4 Validation Errors

| Validation | Message |
|---|---|
| Email missing | Enter your email |
| Email format invalid | Enter a valid email address |
| OTP incorrect | Incorrect code. Try again |
| OTP expired | Code expired. Request a new one |
| Server error (generic) | Something went wrong. Try again |
| Rate limit | Too many attempts. Try again later |

### 5.5 Empty State Rules

1. Empty states use sentence case, not Title Case.
2. Empty states never use emoji.
3. Empty states reference the artist name or context where possible (e.g., "No upcoming tour dates" rather than "Nothing here").
4. Empty states on the profile surface do not show actions that are already visible in the tab bar (no "Get alerts" button in the Alerts tab empty state if the subscribe form is already rendered above it).

### 5.6 Truncation and Wrapping Rules

| Element | Rule |
|---|---|
| Artist display name (hero heading) | Single line; truncate with `text-ellipsis overflow-hidden whitespace-nowrap` at container width |
| Artist bio / about text | Multi-line; truncate at 3 lines with `line-clamp-3` on the home tab rail; full text in the About drawer |
| Release title (cards and rows) | Single line; truncate with ellipsis |
| Tab labels | Fixed width per tab cell; labels do not wrap or truncate (labels are short by spec) |
| CTA buttons | Labels do not wrap; button width expands to fit label |
| Error messages | Multi-line allowed; no truncation |
| Tour date venue / city | Single line; truncate with ellipsis at container width |

### 5.7 Missing Data Rules

| Field | Behavior When Missing |
|---|---|
| Artist display name | Fall back to `@{username}` handle |
| Artist avatar | Fall back to initials avatar (first letter of display name or handle) |
| Artist bio | Omit bio section entirely (do not show a placeholder) |
| Tour dates | Hide Events tab from tab bar |
| Latest release | Show `ProfilePrimaryActionCard` default/empty variant (not a skeleton) |
| Social links | Omit social icon row entirely |
| Contact links | Omit contact trigger from More menu |
| Shopify URL (shop) | `/{username}/shop` renders a "Shop not available" state via `ShopRedirectClient` |

### 5.8 Copy Table for Implementation Sub-Issues

Implementation agents may lift this table verbatim into code. Strings are the canonical source of truth. Do not use string literals not in this table without adding them here first.

```
KEY                              | VALUE
---------------------------------|----------------------------------------------------
tab.home                         | Home
tab.music                        | Music
tab.events                       | Events
tab.alerts                       | Alerts
tab.more                         | More
cta.get_alerts                   | Get alerts
cta.get_alerts_via_text          | Get alerts via text
cta.verify                       | Verify
cta.resend_code                  | Resend code
cta.continue                     | Continue
cta.skip                         | Skip
cta.done                         | Done
cta.manage_alerts                | Manage alerts
cta.send_a_tip                   | Send a tip
cta.view_contacts                | View contacts
cta.listen                       | Listen
helper.subscribe_email           | Enter your email to get alerts from {artistName}
placeholder.email                | Email address
helper.subscribe_otp             | We sent a code to {email}
helper.subscribe_name            | What's your name? (optional)
helper.subscribe_birthday        | When's your birthday? (optional)
success.heading                  | You're all set
success.body                     | You'll get alerts from {artistName}
empty.events                     | No upcoming tour dates
empty.music                      | No releases yet
empty.alerts                     | Get alerts from {artistName}
error.email_missing              | Enter your email
error.email_invalid              | Enter a valid email address
error.otp_incorrect              | Incorrect code. Try again
error.otp_expired                | Code expired. Request a new one
error.generic                    | Something went wrong. Try again
error.rate_limit                 | Too many attempts. Try again later
fallback.display_name            | @{username}
```

---

## 6. Canonical Decision: ISR / Cookies (P0)

### 6.1 The Problem

`apps/web/app/[username]/page.tsx` contains:
```ts
export const dynamic = 'force-dynamic';
```
and calls `await cookies()` to read `AUDIENCE_ANON_COOKIE` at line 325.

The layout sets `export const revalidate = 3600`. In Next.js App Router, `dynamic = 'force-dynamic'` on the page overrides the layout's `revalidate`, making every profile visit a server-render on demand. ISR does not apply. Every profile page load hits the server and the database. This is the P0 finding from audit §3.3.

### 6.2 The Canonical Decision

**ISR with cache tags. No per-request cookie reads in the public profile server component.**

The `AUDIENCE_ANON_COOKIE` read must be moved out of the page server component. The correct approach:
1. Remove `export const dynamic = 'force-dynamic'` from `apps/web/app/[username]/page.tsx`.
2. Remove the `await cookies()` call from the page server component.
3. Move the anonymous visitor state (`AUDIENCE_ANON_COOKIE`) read to a Client Component that reads the cookie client-side (via `document.cookie` or a lightweight API route) after the static shell has been served.
4. The `getClientTrackingToken` server-side HMAC generation does NOT require a cookie — it only uses `username` and the `TRACKING_TOKEN_SECRET` env var. It is safe to keep as a server-side call without forcing dynamic rendering, provided the cookie read is removed.
5. On-demand cache invalidation uses `revalidateTag('profile:{username}')` triggered by profile mutation events (admin edits, profile updates, etc.).

**Result:** Profile pages are ISR-cached at `revalidate = 3600` (1 hour CDN TTL). Profile mutations trigger `revalidateTag` for instant stale-mark. Anonymous visitor state is read client-side after hydration, not in the server component.

This decision is assigned to JOV-2023 (Phase 3: Route Data Hardening). Implementation agents working JOV-2023 MUST follow this decision and not introduce any new `cookies()` call in the `/{username}` page server component.

### 6.3 What Must Not Regress

After the JOV-2023 fix:
- Profile pages must return HTTP 200 with cached HTML from the CDN for cold visitors.
- OG/Twitter metadata must be pre-rendered in the static HTML.
- JSON-LD structured data must be pre-rendered in the static HTML.
- The `ProfileViewTracker` visit tracking (using the HMAC token) must still fire on client hydration.
- Anonymous visitor personalization (if any) must be applied client-side after hydration, not as a server-side render difference.

---

## 7. Sub-Issue Reference Map

| This Spec Section | Implements | Sub-Issue |
|---|---|---|
| §2 (Tab Bar Contract), §3 (Navigation Contract) | Bottom tab consistency, drawer-vs-tab routing | JOV-2024 |
| §4 (Alert/Subscribe Contract) | Subscribe CTA consolidation, orphan cleanup | JOV-2021 (SubscribeDrawer deletion), JOV-2024 |
| §5 (Copy Contract) | Label standardization, error copy, empty states | All sub-issues |
| §6 (ISR/Cookies Decision) | `force-dynamic` removal, cookie extraction | JOV-2023 |
| §1 (Route Categories) §3.4 (No Drawer-Only Access) | Mode redirect sinks | JOV-2024 |
| §4.3 (`/notifications` deprecation) | Route intent clarification | JOV-2027 |
| §1.5 (System States) | 404 shell, error states | JOV-2025 |
| Legacy component cleanup | Dead shell removal | JOV-2021, JOV-2022 |
| CSS variables, design tokens | Token consolidation | JOV-2026 |
| Auth bypass cleanup, pixel tracking | Auth + tracking hardening | JOV-2025 |
| Vaul scroll conflicts, YouTube embed, Venmo fallback | Embed + scroll risk | JOV-2029 |
| OG image reliability, smart link canonical, robots | SEO hardening | JOV-2028 |

---

## Appendix: Canonical Component Stack (Active, Not Legacy)

| Layer | Component | File |
|---|---|---|
| Page (RSC) | `ArtistPage` | `apps/web/app/[username]/page.tsx` |
| Layout | `ProfileLayout` | `apps/web/app/[username]/layout.tsx` |
| Data loader | `getProfileAndLinks` | `apps/web/app/[username]/_lib/public-profile-loader.ts` |
| Adapter | `StaticArtistPage` | `apps/web/components/features/profile/StaticArtistPage.tsx` |
| Surface router | `ProfileCompactTemplate` | `apps/web/components/features/profile/templates/ProfileCompactTemplate.tsx` |
| Mobile/tablet surface | `ProfileCompactSurface` | `apps/web/components/features/profile/templates/ProfileCompactSurface.tsx` |
| Desktop surface | `ProfileDesktopSurface` | `apps/web/components/features/profile/templates/ProfileDesktopSurface.tsx` |
| Drawer hub | `ProfileUnifiedDrawer` | `apps/web/components/features/profile/ProfileUnifiedDrawer.tsx` |
| Subscribe CTA (canonical) | `ProfileInlineNotificationsCTA` | `apps/web/components/features/profile/artist-notifications-cta/ProfileInlineNotificationsCTA.tsx` |
| Subscribe CTA (adapter) | `ArtistNotificationsCTA` | `apps/web/components/features/profile/artist-notifications-cta/ArtistNotificationsCTA.tsx` |
| Campaign landing | `AlertGrowthLanding` | `apps/web/components/features/alerts/AlertGrowthLanding.tsx` |
| Surface state | `resolveEmptyState` | `apps/web/components/features/profile/profile-surface-state.ts` |
| Mode registry | `getProfileModeDefinition` | `apps/web/components/features/profile/registry.ts` |
| Profile contracts | `ProfileMode`, `ProfilePrimaryTab` | `apps/web/components/features/profile/contracts.ts` |
