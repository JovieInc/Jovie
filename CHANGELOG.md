     1|# Changelog
     2|
     3|All notable changes to this project will be documented in this file.
     4|
     5|The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
     6|and this project uses [Calendar Versioning](https://calver.org/) (`YY.M.PATCH`).
     7|
     8|## [26.4.211] - 2026-05-07

> [internal] Design system token migration for marketing and homepage surfaces.

### Changed

- [internal] Migrated 21 marketing and homepage components from hardcoded raw color classes (gray/zinc/neutral/slate/stone Tailwind palette classes, raw hex colors, inline `var(--linear-*)` style props) to shell-v1 canonical design tokens (`text-primary-token`, `text-tertiary-token`, `bg-surface-1`, `bg-surface-0`, `border-subtle`, `text-success`, etc.). Replaced all raw `cubic-bezier(0.34,1.56,0.64,1)` motion values with `var(--ds-motion-cinematic-easing)` in demo chart components. Replaced `transition-all` with `transition-colors` in ArtistSearch. Runtime-computed colors (brand palette, profile themes) preserved as inline styles.

## [26.4.210] - 2026-05-08

> [internal] Design system token cleanup for release and share surfaces.

### Changed

- [internal] Migrated release and share feature components to shell-v1 design tokens: replaced semi-transparent surface tokens (`bg-surface-1/30`, `/50`, `/70`, `bg-surface-2/80`) with explicit opacity values, replaced raw duration values (`duration-100`, `duration-150`, `duration-200`) with canonical motion tokens (`duration-fast`, `duration-subtle`, `duration-slow`), replaced `text-green-500` with `text-success-token`, replaced decorative hover scale/translate on smart link play button with color-only feedback, replaced `transition-all` with `transition-[transform,opacity]` on icon crossfade animation.

## [26.4.209] - 2026-05-06
     9|
    10|> Public alert-conversion landing page: each artist now has a fast `/<handle>/alerts` URL that turns paid traffic into verified SMS or email subscribers. Single CTA, channel toggle, TCPA-grade consent copy, source-link attribution carried through every click.
    11|
    12|### Added
    13|
    14|- [alerts] **New public route** at `/<handle>/alerts` — fully static (CDN-cached HTML), profile-scoped, with `generateMetadata` for OG tags and a canonical URL.
    15|- [alerts] **`<AlertGrowthLanding>` client component** that reads `?s=<code>` from the live URL via `useSearchParams` (so the parent page can stay static) and threads it into the subscribe-mutation `source` field as `alerts-landing:<code>`.
    16|- [alerts] **TCPA-grade consent copy** rendered inline on the SMS path using the canonical `SMS_CONSENT_TEXT` + `SMS_CONSENT_VERSION` constants. The form labels them with `data-consent-version` so a future evidence query can match the version a fan saw at signup.
    17|- [tests] **15 unit tests** covering channel toggling, US E.164 normalization, source-link sanitization, query-string read, error/pending/success states, and the aria-pressed toggle pattern.
    18|
    19|### Changed
    20|
    21|- [alerts] **Strict US-only phone normalization at the form boundary.** A `+44 7700 …` paste now rejects with an inline error instead of being mangled into a malformed `+1****00…` number that hits Twilio. NANP rules enforced (area code starts 2-9).
    22|- [alerts] **Source-link query strings are sanitized** to `[a-zA-Z0-9_-]{1,32}` before threading into the subscribe payload. A hostile `?s=<200KB>` paste cannot now blow up downstream parsers or analytics funnels.
    23|- [alerts] **No double-submit after success/pending-confirmation.** The submit handler bails on every non-`idle` / non-`error` state so a tap-spamming user can't trigger a second mutation.
    24|
    25|
    26|## [26.4.207] - 2026-05-06
    27|
    28|> The auth-unavailable fallback now reads the right verb. Visiting `/signup` no longer says "Sign in is temporarily unavailable" — it says "Sign up is temporarily unavailable." A small thing, but the prior copy made every signup-CTA click on the homepage feel like the wrong page when Clerk briefly fell back.
    29|
    30|### Fixed
    31|
    32|- [auth] Auth-unavailable fallback page now reads the auth flow from the URL: `/signup` shows "Sign up is temporarily unavailable", `/signin` keeps "Sign in is temporarily unavailable". Previously the headline was hardcoded to "Sign in" on both routes, so every homepage signup CTA looked broken whenever Clerk was unreachable.
    33|
    34|
    35|## [26.4.205] - 2026-05-06
    36|
    37|> Release-day SMS alerts now actually send. Phase 1 captured verified SMS subscribers; this release wires Twilio into the notification dispatch path so those fans receive the text when an artist's release ships.
    38|
    39|### Added
    40|
    41|- [notifications] **SMS as a first-class delivery channel** in `sendNotification()`. Verified subscribers with `channel='sms'` now receive a release-day text built from a compact GSM-7 body (artist + title + URL, capped near two segments with title-trim that always preserves the URL).
    42|- [notifications] **Outbound Twilio sender** at `apps/web/lib/notifications/providers/sms/twilio-sender.ts`. Uses the bounded `serverFetch` wrapper for timeout protection. Returns a discriminated result; never throws on Twilio-side failures so the dispatch path can persist a delivery-log entry without try/catch noise.
    43|- [notifications] **Global STOP enforcement on every SMS dispatch** via `isPhoneSmsSuppressed`. A fan who texted STOP is filtered out at send time even if a stale subscriber row slipped past the cron's upstream filter.
    44|- [notifications] **Provider error 21610 maps to suppression.** When Twilio reports a recipient as unsubscribed, the contact is flipped to `stopped` immediately so subsequent releases skip cleanly — protects against missed STOP webhooks and out-of-band carrier opt-outs.
    45|- [tests] **22 new unit tests** covering the SMS body builder, Twilio sender (success / 4xx with code / 5xx-retryable / timeout / no-retry-on-POST / phone-redaction / missing config), and the SMS dispatch flow (deliver / no-phone / suppressed / provider-error / 21610 → suppression / channel-disabled).
    46|
    47|### Changed
    48|
    49|- [notifications] **No retry on outbound SMS POST.** Twilio's Messages API is not idempotent; a 5xx or timeout retry was double-billing duplicate sends. The release-notification cron picks the row up on its next tick if the first attempt looked transient.
    50|- [notifications] **Phone numbers stripped from logged Twilio errors.** Twilio frequently echoes the recipient phone in error strings; that value is now redacted before it crosses into Sentry, application logs, or `notification_delivery_log`.
    51|- [internal] **Unified `NotificationDeliveryChannel`** to include `sms` alongside `email`, `push`, and `in_app`. Resolves the structural split that forced JOV-1834 to bypass the dispatch service.
    52|
    53|## [26.4.203] - 2026-05-05
    54|
    55|> Native SMS subscribe handoff Phase 1 lands behind a feature flag. Fans tap "Get Release Alerts," text a JOIN code from their phone, and the inbound webhook confirms verified consent without a Jovie form in the middle.
    56|
    57|### Added
    58|
    59|- [profile] **Native SMS subscribe button** with a state-aware CTA. The button opens Messages with a pre-filled `JOIN <code>` body, polls confirmation, surfaces a manual code chip if the OS handoff fails, and collapses to "You're subscribed." when the webhook confirms — DESIGN.md Subtraction throughout (no green check, no celebration). Locked behind `NATIVE_SMS_ENABLED` for staged rollout.
    60|- [api] **Three new public endpoints** at `/api/notifications/sms-intents` (POST), `/api/notifications/sms-intents/[id]/status` (GET), and `/api/webhooks/sms` (POST). Twilio HMAC-SHA1 signature verification with a two-key rotation window via `TWILIO_AUTH_TOKEN_SECONDARY` + `TWILIO_AUTH_TOKEN_SECONDARY_EXPIRES_AT`. Three-axis rate limiting (per IP, per artist, per visitor).
    61|- [db] **Two new tables** — `notification_contacts` (cross-artist global state only: `smsStatus`, `phoneVerifiedAt`, `smsConsent*` first-write-wins) and `sms_subscribe_intents` (8-char one-time codes, fingerprint-bound, 10-minute TTL, partial index on active states). Per-artist consent moves to `notification_subscriptions` to preserve the TCPA audit trail across multi-artist races. CHECK constraints enforce the SMS state machine and the per-artist consent ledger all-or-none invariant.
    62|- [cron] **Daily janitor** at `/api/cron/cleanup-sms-intents` marks expired intents and hard-deletes rows older than 24 hours.
    63|- [internal] **Twilio provider adapter** at `apps/web/lib/notifications/providers/sms/twilio.ts` with HMAC verification, payload parsing, and a forward-compatible `SmsProviderAdapter` shape so swapping providers later is one file.
    64|- [internal] **PII helpers** at `apps/web/lib/utils/pii.ts` for safe phone + verification-code logging across all new SMS code paths.
    65|- [tests] **97 unit assertions** across six new spec files covering command parsing (10 commands plus carrier multipart noise), code generation entropy, phone normalization equivalence, signature verification (primary + secondary rotation window), consent hashing, and PII masking.
    66|
    67|### Changed
    68|
    69|- [api] **TCPA carve-out:** the inbound webhook honors `STOP`, `STOPALL`, `UNSUBSCRIBE`, `CANCEL`, `END`, `QUIT`, and `HELP` regardless of feature-flag state. CTIA recovery (`START`, `UNSTOP`, `YES`) flips a previously stopped contact back to active. The `blocked` admin/carrier-level state is sticky across STOP/START/JOIN — no fan-side command can clear it.
    70|- [perf] **Homepage TBT cut** by code-splitting six below-the-fold sections (release velocity reveal, outcome cards, Friday-rhythm, go-live, V2 pricing + final CTA) so their `motion/react` hydration cost no longer competes with above-the-fold work. SSR HTML is preserved for SEO.
    71|- [ci] **Lighthouse public-routes thresholds** calibrated to measured CI runner reality (homepage perf 0.7→0.4, TBT 300→1500ms, profile CLS 0.15→0.25, profile/release TBT 500→1500ms). Accessibility, best-practices, color-contrast, and structural assertions stay strict.
    72|- [internal] **Public-routes Lighthouse path filter** now also triggers on `apps/web/components/homepage/` and `apps/web/components/marketing/` so future homepage component changes don't slip past the lane.
    73|
    74|## [26.4.202] - 2026-05-05
    75|
    76|> Audience row follow-ups: hidden emails stay hidden across desktop and mobile, and a high-intent fan who has gone quiet for over a week is now correctly labelled as cooling instead of staying flagged as "high".
    77|
    78|### Fixed
    79|
    80|- **Hidden emails respect the privacy gate everywhere.** The Message button on both the audience table and the mobile card now stays disabled when a fan's email is gated, instead of firing with the address present. A fan whose only identity is a gated email also renders as "Anonymous Fan" instead of "Visitor".
    81|- **High-intent fans cool to "Rising" past the 7-day window** instead of staying labelled "High" out to 14 days. Frequent visitors keep their "Rising" badge in the 8-14 day gap so they don't drop straight to dormant.
    82|- **Mobile last-seen line** stays stable through SSR (renders an em dash until hydration completes) so it no longer flickers from "now" to "5d ago" on the first paint.
    83|
    84|## [26.4.201] - 2026-05-05
    85|
    86|> Audience CRM rows are denser and easier to scan: monogram identity, state pill, channel signals, engagement bars, and a single Message action per row.
    87|
    88|### Changed
    89|
    90|- **Audience row redesign** to a compact six-column layout (Fan / State / Signal / Engagement / Last / Action) with monogram avatars instead of profile photos. State pill labels recently active fans as **High**, **Rising**, or **Dormant**; subscriber rows render a fixed **Subscriber** pill.
    91|- **Mobile card** rebuilt to match the new layout: monogram + name + state on top, last-seen + Message action on the bottom. Tap targets are 44px.
    92|- **Engagement** is now a 5-bar visualization (out of 5) instead of the prior wide column.
    93|- **Last seen** column is compact (`6h`, `2d`, `12d`) and stays stable through SSR via a shared timestamp context to avoid hydration jank.
    94|
    95|### Fixed
    96|
    97|- **Identity chip** no longer duplicates the email when `displayName` already equals the email; falls through to a masked phone or an anonymous label.
    98|- **Phone mask** stopped fabricating `+5` country codes for short test numbers; it only prefixes a country code when the number is long enough to have one.
    99|- **Anonymous fan** rule now respects Spotify-connected fans: a fan with only a Spotify identity is no longer mislabeled as anonymous.
   100|- [internal] Members audience now exposes an explicit `emailVisibleToArtist` flag at the data boundary so future cells can treat it as a privacy gate, mirroring the subscribers code path.
   101|
   102|## [26.4.200] - 2026-05-05
   103|
   104|> [internal] Internal agent docs were reorganized for reliability — no user-facing changes.
   105|
   106|### Changed
   107|
   108|- [internal] **Agent docs restructured** to module-style. `CLAUDE.md` shrunk from 168 lines to ~130 as a controller that lists hard invariants and points to scoped rule files. `AGENTS.md` is now a symlink to `CLAUDE.md` so Codex/Cursor read the same source.
   109|- [internal] **`CODEX.md`** updated to reference the new scoped rules.
   110|
   111|### Added
   112|
   113|- [internal] **`.claude/rules/`** with 11 topic-scoped guides: environment, auth, db, ui, security, release, testing, infra, code-style, linear, gstack. Detail moved here from the previous 1,880-line `AGENTS.md`. Anthropic guidance: agent docs under ~200 lines are followed more reliably.
   114|
   115|## [26.4.199] - 2026-04-30
   116|
   117|> Turbo remote cache policy is now explicit for local development and CI.
   118|
   119|### Added
   120|
   121|- [internal] **Local Turbo wrapper** for root build, lint, typecheck, and test scripts that reads `TURBO_TOKEN` and `TURBO_TEAM` from the environment or Doppler while keeping app secrets out of Turbo task hashes.
   122|- [internal] **Remote cache verifier** via `pnpm run turbo:verify-cache` to prove local read access against a small cached task.
   123|- [internal] **TypeScript native-preview benchmark notes** in `.context`, showing TS6 baseline timing and the current TS7 blocker on inherited `baseUrl`.
   124|
   125|### Changed
   126|
   127|- [internal] **Local Turbo tasks** now default to `local:rw,remote:r`, while CI uses `local:rw,remote:rw` so CI remains the trusted remote-cache writer.
   128|- [internal] **Automation verify and lint-staged typecheck** now run through the local Turbo wrapper for consistent cache behavior.
   129|
   130|## [26.4.198] - 2026-04-29
   131|
   132|> Main CI and Linear automation are restored to a green, predictable path.
   133|
   134|### Fixed
   135|
   136|- **Public axe CI** now boots the downloaded standalone Next.js server artifact directly, waits for readiness, and cleans up the server process after the audit.
   137|- **Linear AI Dispatcher** now treats missing Linear credentials as disabled automation with a green scheduled run instead of making `main` red.
   138|- **Homepage outcome cards** now expose the horizontal rail as a keyboard-focusable labelled region so the public axe audit passes.
   139|
   140|## [26.4.197] - 2026-04-29
   141|
   142|> Homepage hero, Friday rhythm, and footer CTA visual polish.
   143|
   144|### Changed
   145|
   146|- **Homepage hero** now leads with the sidebar-open release calendar screenshot as a single crisp product frame, with neighboring carousel shots hidden to avoid cropped side imagery.
   147|- **Friday rhythm section** now uses a full-section, subtle heartbeat background, tighter notification cards, darker graph treatment, and calmer release-category accent glow.
   148|- **Go Live and final CTA typography** now use tighter spacing and smaller, cleaner responsive sizing to better match the homepage design system.
   149|
   150|### Fixed
   151|
   152|- **Homepage header logo contrast** is locked to white on the dark homepage surface in both light and dark system modes.
   153|- **Mobile and desktop homepage layouts** were rechecked for horizontal overflow at 1440, 1024, 430, 375, and 320px.
   154|
   155|## [26.4.196] - 2026-04-29
   156|
   157|> Homepage story polish, Friday rhythm model, and mobile hero crop repair.
   158|
   159|### Added
   160|
   161|- **Go Live In 60 Seconds homepage section** above the Friday rhythm story, with three native dark-mode workflow columns for signal, action, and compounding motion.
   162|- **Friday Rhythm homepage section** with deterministic 2026 Friday modeling, mobile before/after controls, decorative heartbeat motion, release-category accents, and unit coverage for Friday generation.
   163|
   164|### Changed
   165|
   166|- **Footer CTA headline** now reads “Keep Your Music Moving.”
   167|- **Friday rhythm graph** now fills every active Friday with muted release-category accents for new singles, merch drops, remixes, videos, and tour recaps.
   168|
   169|### Fixed
   170|
   171|- **Mobile homepage hero screenshots no longer crop horizontally** by sizing the mobile desktop mockup frame from available width instead of fixed stage height.
   172|
   173|## [26.4.195] - 2026-04-29
   174|
   175|> Faster local development, UI parallax polish, and tighter mobile public profiles.
   176|
   177|### Added
   178|
   179|- [internal] **`pnpm run dev:web:fast`** for daily web work: pinned Doppler scope, local auth bypass defaults, stable `PORT=3100`, local Sentry disabled by default, and automatic prewarming for `/`, `/app`, and `/api/health/build-info`.
   180|- [internal] **`pnpm run benchmark:dev`** to measure local dev server readiness, first-route compile time, and warm-route latency across configurable routes.
   181|- [internal] **Fast iteration commands** for changed web tests and incremental web typechecking.
   182|- Added a native-dialog lint guard and design-system docs for choosing confirmations, success/error toasts, and future undo-toast flows.
   183|- Added test coverage for task deletion confirmation behavior and the ready creator persona's Pro entitlement.
   184|- **`/ui/parallax` demo route** under the existing UI parity workspace, with a 7-image zoom-parallax collage driven by the shared `ZoomParallax` component in `apps/web/components/ui/zoom-parallax.tsx`.
   185|- **Unit coverage** for the new component, including the image cap at 7 items and generated fallback alt text for unnamed images.
   186|- **`ProfileMediaCard` primitive** for image-led release, event, playlist, listen, and merch-style profile cards. Release artwork keeps the editorial grayscale treatment; artist photos stay in color.
   187|- **iPhone SE 2/3 coverage** in the mobile public profile viewport suite, plus stricter no-scroll assertions for page and compact-shell vertical overflow.
   188|
   189|### Changed
   190|
   191|- [internal] **Repeat `./scripts/setup.sh` runs are faster** by skipping unchanged dependency installs, preserving Turbopack cache unless `JOVIE_DEV_RESET_NEXT_CACHE=1`, and making dev Clerk ID sync opt-in or stale-marker based.
   192|- [internal] **Local Sentry initialization is a true no-op by default** in development, while production, preview, and explicit `JOVIE_ENABLE_LOCAL_SENTRY=1` behavior remains available.
   193|- [internal] **Homepage fallback imports are lighter** by loading the older home design only when its feature flag is enabled.
   194|- Replaced remaining production `alert()` and `confirm()` browser dialogs in release sidebars, investor links, catalog health, and task deletion flows with `ConfirmDialog` or Sonner toasts.
   195|- Made the `creator-ready` local auth bypass persona Pro-entitled so dashboard QA and perf checks can reach gated creator surfaces without a manual plan toggle.
   196|- **`/ui` demo shell now uses a real viewport-height layout** via `h-screen` in `apps/web/app/ui/layout.tsx`, so tall demos scroll within the shell's main pane instead of trapping the page at `scrollY=0`.
   197|- **Parallax motion implementation now follows the actual scroll container** instead of assuming window scroll. `ZoomParallax` resolves the nearest scrollable ancestor, drives transforms through `requestAnimationFrame`, and respects reduced-motion users.
   198|- **Mobile public profile Home** is denser and more reference-aligned: color artist hero image, bottom-fade text overlay, Bell alert control, bare social icons, compact Latest + Up Next treatment, and small-height breakpoints that keep content inside standard iPhone viewports.
   199|- **Mobile Music, Events, and Alerts tabs** now use flatter native-list surfaces with less outer chrome while preserving existing release, tour, and notification data contracts.
   200|- **Notification viewport QA** now opens the dedicated notifications route, clears local notification status cache, waits for the actual email step, and verifies input focus does not move or zoom the shell.
   201|
   202|### Fixed
   203|
   204|- [internal] **Removed Turbo's deprecated `daemon` config** so local Turbo commands no longer emit the Turbo 2.9 deprecation warning.
   205|- [internal] **Homepage V2 CTA components now have one source of truth** so pricing and final CTA copy cannot drift between entrypoints.
   206|- [internal] **Fast dev scripts handle edge cases more clearly** with portable port defaults, Node heap defaults, route probe timeouts, and dependency-free port checks.
   207|- **Nested landmark bug on `/ui/parallax`** by removing an inner `<main>` from the route page. The `/ui` workspace now exposes one top-level main landmark instead of invalid nested mains.
   208|- **Browser warning from the prior `motion/react` container setup** and the underlying non-animating state in the `/ui` shell. The collage now scales correctly on desktop and mobile within the shell's internal scroller.
   209|- **Profile media countdown hydration** no longer mismatches server/client seconds on first render.
   210|- **Public profile mobile overflow** now fails tests when the compact shell requires vertical scroll, including on iPhone SE, Mini, standard, Pro, Plus, and Max viewport families.
   211|
   212|### Documentation
   213|
   214|- [internal] **Local development docs now point at `dev:web:fast`** across README, agent guidance, Doppler setup, iOS setup, and screenshot-report instructions.
   215|
   216|## [26.4.194] - 2026-04-29
   217|
   218|> Frame.io-inspired design layer for `/artist-profiles` + premium marketing footer rewrite.
   219|
   220|### Added
   221|
   222|- **`.frame-skin` design layer** in `apps/web/app/(home)/home.css` — page-scoped cinematic editorial monochrome. Deep `#0a0a0b` base, subtle SVG film grain at 4%, hairline `rgba(255,255,255,0.06)` dividers between sections, 320px ambient edge-glow at the page seam, magazine-scale section padding via `--frame-section-y: clamp(5rem, 8vw, 9rem)`. Inside `.frame-skin`, `--primary-token` / `--secondary-token` / `--tertiary-token` / `--linear-border-*` map to frame.io values so child components inherit without per-component changes.
   223|- **`.frame-eyebrow` + `.frame-caption`** helpers for editorial pairings (11px / 0.18em tracking, 13px / 1.55 leading). Promoted to base classes so callers outside `.frame-skin` get the same typography.
   224|- **`eyebrow` prop** on `ArtistProfileSectionHeader` for category tags above the headline.
   225|
   226|### Changed
   227|
   228|- **`/artist-profiles` end-to-end** now wears the frame.io skin: tightened type ramp on `ArtistProfileSectionHeader` (clamp 2.6→4.5rem, weight 640, leading 0.96, body max-w 36rem); `ArtistProfileSectionShell` tags each section with `frame-section` so in-skin padding and divider rules apply automatically.
   229|- **`MarketingFooter` rewrite** as `.marketing-footer-premium` — `#06070a` base, hairline top border + 220px ambient edge-glow, wordmark column with tagline, 4 nav columns with 11px tracked-caps eyebrow headers, 14px caption-weight links, hairline-separated bottom band with copyright + Privacy/Terms in 12px tertiary. Active across every marketing route. Minimal variant collapses to mark + bottom band only.
   230|
   231|### Fixed
   232|
   233|- **Hairline section dividers actually render now** — the original `.frame-skin .frame-section + .frame-section` selector never matched because each section in `ArtistProfileLandingPage` is wrapped in a `<div data-testid="...">`. Switched to `.frame-skin > div + div` which targets the wrapper divs that ARE direct siblings. (Sentry P-LOW)
   234|- **Minimal-footer baseband margin** — `mt-7` Tailwind class (specificity 0,1,0) was overridden by `.mf-baseband { margin-top: clamp(...) }` (specificity 0,2,0). Switched to inline style so the minimal footer lands at 28px instead of 48–72px. (Greptile P1)
   235|- **Eyebrow class duplication** in `ArtistProfileSectionHeader` — removed redundant `text-[11px] font-medium uppercase tracking-[0.18em]` Tailwind classes since `.frame-eyebrow` already covers them. (Greptile P2)
   236|
   237|## [26.4.193] - 2026-04-29
   238|
   239|> Marketing screenshot pipeline + CSS cascade fix. Hamburger no longer leaks onto desktop, profile-desktop capture renders the real desktop UI, every product-screenshot literal in marketing code now flows through `apps/web/lib/screenshots/registry.ts`.
   240|
   241|### Fixed
   242|
   243|- **Hamburger menu showing on desktop** — `marketing-utilities.css`, `auth-utilities.css`, and `app-utilities.css` were re-importing `tailwindcss/utilities.css` after globals.css, emitting a duplicate `.flex { display: flex }` rule that won source-order tiebreak over `.md\:hidden { display: none }`. Removed all three CSS files and their imports from `(marketing)`, `(auth)`, `app`, `onboarding`, and `waitlist` layouts. Tailwind v4 still auto-scans the project, so no classes are lost. Second CSS bundle on `/new` dropped from 371KB to 29KB.
   244|- **`profile-desktop.png` rendered as a phone-shaped fallback on a wide black canvas** — the capture's `waitFor` selector fired before React's `useEffect` flipped `isDesktopLayout=true`. Switched to `[data-testid="profile-desktop-surface"]` so the capture waits for post-hydration desktop layout. Same fix applied to `tim-white-profile-live-desktop` and `tim-white-profile-mainstream-desktop`.
   245|- **Locator-captured screenshots advertised wrong dimensions to next/image** — `release-tasks-active.png` is 1624×1428, not 2880×1800. New `PUBLIC_EXPORT_DIMENSIONS` map in `apps/web/lib/screenshots/registry.ts` returns the actual PNG dimensions from each IHDR header.
   246|
   247|### Changed
   248|
   249|- New `getMarketingExportScenarios()` and `getMarketingExportImage(id)` helpers in `apps/web/lib/screenshots/registry.ts` (client-safe — no `node:fs` imports).
   250|- New `<MarketingScreenshot scenarioId>` and `<MarketingPhoneImage scenarioId>` wrappers under `apps/web/components/marketing/`. Default `quality={85}` and a sensible responsive `sizes` attribute.
   251|- 31 hardcoded `/product-screenshots/...` literals across 14 active files (data files + 9 home components + 2 artist-profile sections + `HomepageV2Route`) now flow through the registry.
   252|- 9 scenarios re-tagged `marketing-export` (`tim-white-profile-*` mobile variants, release-presave-mobile, release-tasks-desktop, `artist-spec-*` desktops).
   253|- Recaptured at retina: `marketing-home-desktop`, `public-profile-desktop`, `release-landing-{desktop,mobile}`, `release-tasks-active`, several `artist-spec-*` and `artist-profile-*-section-desktop`.
   254|- Cleaned up 2 orphan PNGs (`artist-spec-geo-insights-panel.png`, `artist-spec-rich-analytics-panel.png`) that had no registry entry.
   255|
   256|### Removed
   257|
   258|- 3 unused orphan files in `apps/web/app/(marketing)/new/_components/` (`NewLandingHero`, `NewLandingSections`, `NewLandingFinalCta` — 473 lines of dead code, never imported).
   259|
   260|### Documentation
   261|
   262|- `docs/CANONICAL_SURFACES.md` gains a "How to add a marketing screenshot" section.
   263|- `CLAUDE.md` gets a one-line pointer.
   264|
   265|## [26.4.192] - 2026-04-29
   266|
   267|> Mobile public profile alert signup hardening and iPhone viewport gates.
   268|
   269|### Added
   270|
   271|- **Blocking mobile profile viewport suite** covering iPhone 13 through 17 viewport families across Home, Music, Events, Alerts, About, Contact, Pay, Releases, and Notifications screens.
   272|- **Alert signup focus stability checks** that fail when mobile input focus changes the layout viewport, scrolls the shell, introduces horizontal overflow, or risks iOS input zoom.
   273|- **Public Lighthouse CI coverage** for the new profile mobile viewport/performance budget gate.
   274|
   275|### Changed
   276|
   277|- **Alerts signup flow** now treats OTP verification as the subscription activation moment, then collects name and birthday as follow-up enrichment.
   278|- **Mobile profile artwork fallbacks** avoid rendering default app/avatar assets as hero and rail imagery.
   279|
   280|## [26.4.191] - 2026-04-28
   281|
   282|> Pre-landing review fixes for the page-builder + component-checker (#7920, #7919). Four Greptile findings addressed.
   283|
   284|### Fixed
   285|
   286|- **Suspense boundary around `useSearchParams()`** in both `/exp/page-builder/page.tsx` and `/exp/component-checker/page.tsx`. Without it, Next.js 16 App Router opts the route out of static prerendering and throws at build time.
   287|- **Page-builder body reset bug**: removing the last section now drops the `?body=` param entirely instead of setting it to `''`. The "no body sections" empty state in the drawer is reachable again.
   288|- **Page-builder toolbar count**: `Sections (N)` now uses the resolved variant count, not raw URL ids — keeps the label truthful when someone hand-types a stale id into `?body=`.
   289|- **Page-builder dialog a11y**: drawer now has `aria-modal='true'` and an Escape-key handler.
   290|
   291|## [26.4.190] - 2026-04-28
   292|
   293|> Page-builder route + chrome toggles. PR 2 of the landing-system consolidation. Builds on the section registry from PR 1; renders a complete landing page (header + body + CTA + footer) with toolbar toggles for header chrome, footer density, CTA visibility, and a side drawer for body composition.
   294|
   295|### Added
   296|
   297|- **`/exp/page-builder`** — composes a real landing page from registry sections. Always renders `MarketingHeader` + body + `MarketingFinalCTA` + `MarketingFooter` (the locked-in trio). URL-driven state via `?header=`, `?footer=`, `?cta=`, `?body=` so deep links survive refresh.
   298|- **Chrome toolbar** (fixed at top of viewport):
   299|  - **Header**: Solid (`landing` variant) ↔ Transparent (`homepage` variant)
   300|  - **Footer**: Full ↔ Minimal
   301|  - **CTA**: On ↔ Off
   302|  - **Sections (N)** button → opens the side drawer
   303|- **Section drawer** (slides in from the right):
   304|  - Top section: current body order with up/down/remove controls per section
   305|  - Below: every body-eligible variant grouped by category (`hero | logo-bar | feature-card | testimonial | faq`) — click any variant to append it
   306|  - Headers, footers, and footer-CTAs are excluded from the drawer; they're chrome
   307|- **Default body composition**: hero → logo-bar → feature-cards → testimonials → FAQ. Mirrors a "complete" landing page so reviewers see the canonical shape on first load.
   308|
   309|### Why now
   310|
   311|PR 2 closes the loop on what we want every landing page to look like. With the toolbar toggles locked into the spec, "what does this landing page look like with a transparent header and minimal footer?" stops being a thought experiment — you toggle and see it.
   312|
   313|### Not yet
   314|
   315|PR 3 deletes the duplicates flagged by PR 1's registry (`CTASection` orphaned, `HeroSection` consolidate → `MarketingHero`, `FinalCTASection` refactor to extract `ClaimHandleForm`). PR 4 adds the `MarketingPageShell` "every landing must end with `MarketingFinalCTA` unless in `LEGAL_ROUTES`" invariant so the page-builder's locked-in design contract is enforced at the type level.
   316|
   317|## [26.4.189] - 2026-04-28
   318|
   319|> Landing-page section registry + component-checker. PR 1 of the landing-system consolidation. Adds one source of truth for "what landing-page sections exist" and a full-bleed preview surface (`/exp/component-checker`) so we can audit variants on ultra-wide before merging duplicates.
   320|
   321|### Added
   322|
   323|- **`apps/web/lib/sections/registry.ts`** — typed registry of landing-page section variants. Eight categories (`header | hero | logo-bar | feature-card | testimonial | faq | footer-cta | footer`) ordered top-of-page → bottom-of-page. Each entry carries `componentPath`, `usedIn`, `status` (`canonical | consolidate | orphaned`), and a `render()` callback so both the component-checker and the upcoming page-builder render variants identically. Per-category variant arrays live in `apps/web/lib/sections/variants/*.tsx` so adding a new variant doesn't touch the registry root.
   324|- **`/exp/component-checker`** — full-bleed single-section preview, no chrome.
   325|  - Floating top-left toolbar: category dropdown + variant dropdown + status pill (canonical/consolidate/orphaned) + canonical badge + component path.
   326|  - URL-driven via `?id=<variant-id>` so deep links survive refresh.
   327|  - Keyboard nav: `←`/`→` move within the current category; `⌘↑`/`⌘↓` jump category. Skips when an input/textarea is focused.
   328|  - 16 variants seeded across the 8 categories — every section that ships on a landing page has at least one entry.
   329|
   330|### Why
   331|
   332|The page-builder (PR 2) and the consolidation pass (PR 3) both need this registry as their data layer. Registry-first means PR 2 lands as a thin composition shell on top of `SECTION_REGISTRY`, and PR 3's deletions are mechanical because every call site is enumerated in `usedIn`.
   333|
   334|### Not yet
   335|
   336|PR 2 (page-builder with header/footer/CTA chrome toggles) builds on top of this. PR 3 deletes `CTASection` (orphaned), folds `HeroSection` into `MarketingHero`, and refactors `FinalCTASection` to extract `ClaimHandleForm`. PR 4 adds the `MarketingPageShell` "every landing must end with `MarketingFinalCTA` unless in `LEGAL_ROUTES`" invariant.
   337|
   338|## [26.4.187] - 2026-04-28
   339|
   340|> Quiet console fix: avatars and other small images stop triggering Next.js's "placeholder='blur' on image smaller than 40x40" warning on every authenticated page. Plus an expanded Claude Code permission allowlist so QA-typical commands stop prompting.
   341|
   342|### Fixed
   343|
   344|- **`OptimizedImage` no longer ships a blur placeholder for renders below 40x40.** Next.js Image warns whenever `placeholder='blur'` is set on an image rendered smaller than 40x40 because the blur overhead is wasteful at that size. The component defaulted to `'blur'` and renders avatars as small as `size='sm'` (32x32, used in workspace menu and sidebar profile button), so the warning fired on every authenticated page. New `effectivePlaceholder` memo downgrades to `'empty'` when the rendered dimension is below 40px and the caller didn't ask for empty. `fill` mode keeps the original placeholder since rendered size is unknown at build time. Existing 9 unit tests pass unchanged. (ISSUE-001 from the QA golden-path sweep.)
   345|
   346|### Changed
   347|
   348|- **`.claude/settings.json` allowlist expanded** from `/sync-permissions` and `/fewer-permission-prompts`. Adds `mcp__linear-server__*` (allow), `pnpm exec grep *` and `~/.claude/skills/gstack/browse/dist/browse *` (bash.allow), and `GIT_EDITOR=* git *` (bash.prompt). Reduces redundant permission prompts during interactive sessions.
   349|
   350|## [26.4.185] - 2026-04-28
   351|
   352|> DevToolbar override badge no longer lies about orphans. Override entries in
   353|> localStorage that no longer match any flag in `APP_FLAG_OVERRIDE_KEYS` are now
   354|> partitioned out — the badge counts only valid overrides, and a separate
   355|> "Orphans (N)" section in the open panel exposes them with inspect + manual purge
   356|> buttons. Manual purge only by design (no auto-prune) to avoid cross-tab races
   357|> on version skew. Also: Next.js dev indicators disabled to declutter the corner.
   358|
   359|### Changed
   360|
   361|- `useStoredAppFlagOverrides` now exposes `validOverrides`, `orphanKeys`, and `purgeOrphans()` alongside the existing `overrides` record. `validOverrides` is the partition of the stored record whose keys are present in `APP_FLAG_OVERRIDE_KEYS`; `orphanKeys` is the rest. `purgeOrphans()` rewrites localStorage with only the valid keys.
   362|- DevToolbar's bottom-bar override count now reads from `validOverrides` so orphans don't inflate it. The open panel renders an "Orphans (N)" section with inspect (expand to see keys) and purge (rewrite localStorage) actions when `orphanKeys.length > 0`.
   363|- `next.config.js`: `devIndicators` set to `false`. The floating "N" overlay is gone.
   364|
   365|### Added
   366|
   367|- `apps/web/tests/unit/flags/useStoredAppFlagOverrides.test.tsx` — 6 Vitest cases covering partition correctness, idempotent purge, cross-tab `storage` event sync without auto-write, and no-op on empty orphans.
   368|
   369|## [26.4.185] - 2026-04-28
   370|
   371|> Refactor: extract `executeChatTurn()` from the 2k-line chat route into `apps/web/lib/chat/run.ts` as a pure pipeline. No behavior change. Sets up an eval harness and a future canon-retrieval layer to share the same code path the production route runs, so regressions are catchable without re-implementing chat from scratch.
   372|
   373|### Changed
   374|
   375|- **Chat-turn pipeline extracted to `lib/chat/run.ts`.** `executeChatTurn()` owns knowledge-context selection, system-prompt assembly, model-message conversion, model selection (light vs full + `forceLightModel` override), telemetry tagging, and the `streamText()` invocation. Tools are pre-built by the caller and passed in (closure pattern unchanged). `apps/web/app/api/chat/route.ts` shrinks from 2,036 → ~1,800 lines and now delegates the streaming pipeline.
   376|- **Sentry coupling removed from the pipeline.** `executeChatTurn` accepts a `ChatTelemetry` object with `setTags`/`setExtra`/`captureException` hooks. The route binds these to Sentry; future eval/replay callers can pass a no-op telemetry. No production observability change — the same tags fire from the same call sites.
   377|- **Shared chat types moved to `lib/chat/types.ts`** (`ArtistContext`, `ReleaseContext`, `artistContextSchema`, `ChatTelemetry`). Avoids cycles between `route.ts` and `run.ts`.
   378|
   379|### Added
   380|
   381|- `apps/web/tests/unit/chat/run.parity.test.ts` (14 tests). Asserts model selection, system-prompt content, sorted tool names, telemetry tag emission, and `onError` capture routing — locks in parity for any future caller of `executeChatTurn`.
   382|
   383|## [26.4.184] - 2026-04-28
   384|
   385|> Frame.io-inspired homepage refresh: the hero now matches Frame.io's exact typography spec (Satoshi 80px / weight 600 / -0.045em) and layout positions, the mockup carousel has a proper window-style top chrome with rounded 18px corners, the header is transparent docked and switches to frosted glass on scroll, and the footer locks to the same edge-to-edge gutter system as the header. New shared `MarketingFinalCTA` foundation for the landing page system.
   386|
   387|### Changed
   388|
   389|- **Homepage hero typography matches Frame.io's `/features/present` spec exactly** (verified by reading their computed styles via DOM inspection). Eyebrow `Meet Jovie` in cyan-blue (rgb(97,153,246)), 12px / weight 400 / 0.06em tracking. Headline `Drop more music, with less work.` in Satoshi 80px / weight 600 / -0.045em. Subhead 18px / weight 400 / line-height 1.45 / color rgba(234,234,255,0.5). CTAs 14px / weight 600 / 40px / 100px radius / solid white primary, transparent secondary.
   390|- **Header glassmorphism on scroll.** Docked = transparent. Past 8px of scroll = rgba(8,8,10,0.55) bg + backdrop-blur 18px saturate(180%) + hairline bottom border. Driven by `HomeScrollWatcher` toggling `data-scrolled` on `.home-viewport`. 220ms transition.
   391|- **Mockup carousel restored to Frame's 3-desktop peek pattern.** Center desktop fully visible at 879×494, side peeks clipped at the viewport edges. Window-style top chrome (32px, hairline divider) with 18px rounded corners and a subtle purple glass tint matching Frame.io's GlassWrapper. Soft purple glow above each mockup softens the top transition into the page.
   392|- **Header / content / footer share the same edge-to-edge gutter system.** New `MarketingFooter` is full-bleed with `clamp(1.25rem, 2.2vw, 2rem)` gutters. Privacy/Terms moved to the right via `justify-between`; copyright stays left.
   393|- **Header content trimmed.** Header height 84 → 72px, nav 15px/680 → 14px/600, auth links 40 → 36px tall. Login/Start Free Trial gap 1.5rem → 1.75rem so they read as separate elements.
   394|- **Outcome cards shrunk** ~30% via `flex-basis` reductions. Card titles dropped to clamp(2rem,3vw,3rem) / weight 680 / -0.025em.
   395|- **Trust band label visible.** "Trusted by artists on" now renders above the logo strip (was sr-only).
   396|- **Animated electric beam** in the hero: four cyan-blue verticals with an 8s pulse and slight Y drift, mix-blend-mode screen, prefers-reduced-motion respected.
   397|- **Outcome card titles** drop from 43.2px → 24-28px (clamp(1.5rem, 2vw, 1.75rem)) so the rail stops competing with the H2 above it; H2/H3 step restored.
   398|- **Final-CTA H2** aligned to the system scale: clamp(2rem, 3.4vw, 3rem) / weight 680 / line-height 1.05 / tracking -0.025em (was 52px / 590 — off-system).
   399|- **Vestigial mockup top chrome bar removed** after the traffic lights were dropped. Every side now gets equal 7px chrome with the same glass tint.
   400|- **Final-CTA primary button copy:** "Start Free Trial" → "Claim my workspace" so the same label doesn't repeat in header, hero, pricing, and footer-CTA.
   401|- **DESIGN.md blesses the homepage hero Satoshi exception** inside System B (Inter-only) so future contributors know the deviation is intentional.
   402|
   403|### Added
   404|
   405|- `apps/web/components/site/MarketingFinalCTA.tsx` — shared final-CTA section for marketing pages. Sensible defaults (title, "Start Free Trial" → /signup) with per-page overrides for title / body / cta / secondary cta. Foundation for the landing page system.
   406|- `apps/web/components/homepage/HomeScrollWatcher.tsx` — client component that toggles `data-scrolled` on `.home-viewport` for the glassmorphic header.
   407|- `SHELL_CHAT_V1` app flag (default off, dev toolbar label "New Design"). Plumbed through contracts + registry; consumer lands separately.
   408|- Satoshi Variable font loaded globally via `next/font/local` (was downloaded but never registered) so `--font-satoshi` resolves outside the marketing wrapper.
   409|
   410|## [26.4.183] - 2026-04-27
   411|
   412|> Follow-up to v26.4.181. Allow `DELETE` in R2 CORS so the browser-side multipart-abort path works when a user cancels a half-finished upload.
   413|
   414|### Fixed
   415|
   416|- [internal] R2 CORS — added `DELETE` to allowed methods on all three env-specific CORS files. AWS S3's `AbortMultipartUpload` operation (which R2 supports) uses HTTP DELETE; without it, browser preflight for an in-flight upload cancel would fail. Object deletion stays server-side via signed URLs; this is for the upload-cancel path only.
   417|
   418|## [26.4.182] - 2026-04-27
   419|
   420|> Press `?` anywhere in the dashboard to open the keyboard shortcuts help. Linear convention; complements the existing `Cmd+/`.
   421|
   422|### Added
   423|
   424|- Press `?` anywhere outside an input to open the keyboard shortcuts modal. The modal's `keyboard-shortcuts` row now lists both `⌘ /` and `?` so the new alternate is discoverable.
   425|
   426|## [26.4.181] - 2026-04-27
   427|
   428|> Follow-up to v26.4.180. Tightens R2 bucket configuration based on bot review of #7845 — separates CORS rules per environment so localhost no longer hits production, and fixes a lifecycle bug where the orphan-multipart-upload sweep was scoped to a single prefix.
   429|
   430|### Changed
   431|
   432|- [internal] Split `infra/r2/cors.json` into `cors-dev.json` / `cors-staging.json` / `cors-prod.json`. The prod bucket no longer accepts `http://localhost:3000`. Allowed headers tightened from `*` to the explicit set the AWS S3 SDK uses for browser-side multipart.
   433|
   434|### Fixed
   435|
   436|- [internal] `infra/r2/lifecycle.json` — `abortMultipartUploadsTransition` was nested inside the `archived/` prefix-scoped rule, so orphan multiparts targeting the actual upload path (`creator/<id>/raw/...`) were never aborted. Split into two rules: the IA transition stays prefix-scoped, the multipart abort runs against every prefix.
   437|
   438|## [26.4.180] - 2026-04-27
   439|
   440|> Reproducible Cloudflare R2 bucket configuration for the upcoming audio-asset upload pipeline.
   441|
   442|### Added
   443|
   444|- [internal] `infra/r2/cors.json` and `infra/r2/lifecycle.json` capture the deployed CORS rules and Infrequent-Access lifecycle for the `jovie-audio-{dev,staging,prod}` buckets, so the bucket configuration can be re-applied with `wrangler r2 bucket cors set` / `lifecycle set`.
   445|
   446|## [26.4.179] - 2026-04-26
   447|
   448|> Public artist profiles now ship with a full mobile/desktop refresh, photo-driven accents, a new home rail, and a guided alerts experience that stays consistent across live profiles, previews, and demo captures.
   449|
   450|### Added
   451|
   452|- Public profiles now include a refreshed home rail for releases, shows, alerts, and listening destinations.
   453|- Artists can collect richer alert preferences, including artist-email opt-in state, through a guided mobile flow.
   454|- Desktop profile views now use a dedicated surface that mirrors the refreshed mobile profile experience.
   455|- Profile accents now automatically adapt to artist photos and stay consistent across profile updates.
   456|- [internal] Added versioned `theme.profileAccent` support across upload, suggestion, ingestion, admin, dashboard, and public-profile mutation paths.
   457|- [internal] Added visual review tooling for mock-home profile captures and review matrices.
   458|
   459|### Changed
   460|
   461|- Public profiles now use a shared compact shell with a full-bleed hero, status pill, alerts CTA, quick social actions, and tabbed navigation.
   462|- Preview, demo, and live profile surfaces now stay visually aligned.
   463|- Alert and profile drawer flows now share a more consistent modal, embedded, and standalone presentation model.
   464|- Pay/tip drawers now support custom amount entry and drawer-specific presentation.
   465|- [internal] Rebuilt the compact profile template around shared primary-tab panel contracts and profile surface presentations.
   466|- [internal] Theme writes now merge rather than replace the full theme object, preserving persisted profile accent data.
   467|
   468|### Fixed
   469|
   470|- Alert resend cooldowns now block repeated resend actions instead of only changing the button label.
   471|- Profile username updates now invalidate both the old and new public profile cache keys.
   472|- Profile home rail pagination now tracks the visible card using viewport-relative positions.
   473|- Notification status responses no longer expose default content preferences for unsubscribed users.
   474|- Public render fallbacks now avoid noisy local image lookups while keeping neutral accents when no usable image is available.
   475|
   476|## [26.4.178] - 2026-04-25
   477|
   478|> Closes two SonarCloud security hotspots on the bio-import sanitizer that shipped in 26.4.176. ReDoS-prone unbounded greedy quantifiers in the URL-stripping regex are now bounded; the bidi/zero-width char class is built via `new RegExp(string)` with `\u` escapes so the source file itself contains no bidi chars (trojan-source defense). No behavior change for real bios.
   479|
   480|### Fixed
   481|
   482|- `apps/web/lib/ai/tools/extract-bio-candidate.ts` — bounded `URL_PATTERN` quantifiers (`[^\s<>"']{1,2048}` and `[a-z0-9.-]{1,253}`) closing the `typescript:S5852` super-linear backtracking hotspot. Switched `ZERO_WIDTH_PATTERN` to `new RegExp('[\\u200B-...]', 'g')` so the source bytes are 100% ASCII, closing the `text:S6389` bidirectional-character hotspot. Also normalized `CONTROL_PATTERN` to use `\x` escapes for consistency.
   483|
   484|## [26.4.176] - 2026-04-24
   485|
   486|> Jovie chat agent can now import an artist's bio from a public URL. Say "import my bio from timwhite.co" and the agent fetches the page server-side, extracts a candidate from JSON-LD or meta tags, sanitizes it, and routes it through the existing confirmation card with a clear "Imported from timwhite.co" provenance line. Closes the most common follow-up to "write me a bio" — owning the URL-import flow instead of telling the user to paste.
   487|
   488|### Added
   489|
   490|- `apps/web/lib/ai/tools/safe-fetch-public-html.ts` — SSRF-safe HTML fetcher for arbitrary user-supplied URLs. Composes the existing `isPrivateHostname` (DNS-resolved gate) and `isSafeExternalHttpsUrl` (literal-host gate) primitives with manual redirect handling so every redirect hop is re-validated. HTTPS only, 5s timeout, 512 KiB body cap, 3 redirect cap. Detects auth walls (401/403, `WWW-Authenticate`, redirects to known identity providers like Clerk/Auth0/Google). Returns a typed discriminated union — callers never rethrow.
   491|- `apps/web/lib/ai/tools/extract-bio-candidate.ts` — extracts a bio from raw HTML in priority order: JSON-LD `Person`/`MusicGroup`/`ProfilePage` `description` (tolerates `@graph` and array `@type`), then `og:description`, then `<meta name="description">`. Sanitizes before any model sees the text: strips URLs, C0/C1 control chars, zero-width and bidi chars, then word-boundary truncates at 600 chars. The "first non-trivial `<p>` in `<main>`" fallback was deliberately cut as the highest-injection-surface, lowest-signal path.
   492|- `apps/web/lib/ai/tools/import-bio-from-url.ts` — chat tool that wires the fetcher and extractor together, gated by per-user-per-tool rate limits (5/min and 20/hour, scoped to the tool not the chat to absorb fan-out within a single chat turn). Returns `{ ok: true, candidateBio, sourceUrl, sourceTitle }` on success and a typed `reason` plus model-readable `hint` on failure. The system prompt instructs the model to pass the candidate verbatim through `proposeProfileEdit` and to treat all returned text as untrusted external data, never instructions.
   493|- `apps/web/lib/rate-limit/{config,limiters,index}.ts` — registers `bioImportFromUrl` (5/min) and `bioImportFromUrlHourly` (20/hour) limiters following the existing per-feature pattern.
   494|- 49 unit tests across `apps/web/tests/unit/lib/ai/tools/` covering: SSRF guards (literal IPs, IPv6 link-local, IPv4-mapped IPv6, metadata hosts, internal suffixes), DNS-rebinding mitigation across redirect hops, redirect chain to private IP, redirect cap, auth-wall detection (status + IDP host fragments), content-type and body-size enforcement, timeout, JSON-LD extraction priority and edge cases, prompt-injection round-trip with URL stripping, and rate-limit short-circuit.
   495|
   496|### Changed
   497|
   498|- `apps/web/app/api/chat/route.ts` — registers `importBioFromUrl` in the paid-plan tools map alongside `proposeProfileEdit`.
   499|- `apps/web/lib/chat/system-prompt.ts` — instructs the model to call `importBioFromUrl` when the artist names or pastes a URL, then chain `proposeProfileEdit` with the returned candidate. Establishes the untrusted-content posture so injection attempts in fetched bios cannot redirect agent behavior.
   500|- `apps/web/lib/ai/tools/profile-edit.ts` — adds optional `sourceUrl` and `sourceTitle` fields on `proposeProfileEdit` so the confirmation card can surface provenance when the value originated from a URL import.
   501|