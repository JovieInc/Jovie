# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project uses [Calendar Versioning](https://calver.org/) (`YY.M.PATCH`).

## [26.4.195] - 2026-04-29

> Dashboard destructive actions now use accessible in-app confirmations, and local QA can exercise Pro-gated creator surfaces with the ready persona.

### Changed

- Replaced remaining production `alert()` and `confirm()` browser dialogs in release sidebars, investor links, catalog health, and task deletion flows with `ConfirmDialog` or Sonner toasts.
- Made the `creator-ready` local auth bypass persona Pro-entitled so dashboard QA and perf checks can reach gated creator surfaces without a manual plan toggle.

### Added

- Added a native-dialog lint guard and design-system docs for choosing confirmations, success/error toasts, and future undo-toast flows.
- Added test coverage for task deletion confirmation behavior and the ready creator persona's Pro entitlement.

## [26.4.194] - 2026-04-29

> Frame.io-inspired design layer for `/artist-profiles` + premium marketing footer rewrite.

### Added

- **`.frame-skin` design layer** in `apps/web/app/(home)/home.css` — page-scoped cinematic editorial monochrome. Deep `#0a0a0b` base, subtle SVG film grain at 4%, hairline `rgba(255,255,255,0.06)` dividers between sections, 320px ambient edge-glow at the page seam, magazine-scale section padding via `--frame-section-y: clamp(5rem, 8vw, 9rem)`. Inside `.frame-skin`, `--primary-token` / `--secondary-token` / `--tertiary-token` / `--linear-border-*` map to frame.io values so child components inherit without per-component changes.
- **`.frame-eyebrow` + `.frame-caption`** helpers for editorial pairings (11px / 0.18em tracking, 13px / 1.55 leading). Promoted to base classes so callers outside `.frame-skin` get the same typography.
- **`eyebrow` prop** on `ArtistProfileSectionHeader` for category tags above the headline.

### Changed

- **`/artist-profiles` end-to-end** now wears the frame.io skin: tightened type ramp on `ArtistProfileSectionHeader` (clamp 2.6→4.5rem, weight 640, leading 0.96, body max-w 36rem); `ArtistProfileSectionShell` tags each section with `frame-section` so in-skin padding and divider rules apply automatically.
- **`MarketingFooter` rewrite** as `.marketing-footer-premium` — `#06070a` base, hairline top border + 220px ambient edge-glow, wordmark column with tagline, 4 nav columns with 11px tracked-caps eyebrow headers, 14px caption-weight links, hairline-separated bottom band with copyright + Privacy/Terms in 12px tertiary. Active across every marketing route. Minimal variant collapses to mark + bottom band only.

### Fixed

- **Hairline section dividers actually render now** — the original `.frame-skin .frame-section + .frame-section` selector never matched because each section in `ArtistProfileLandingPage` is wrapped in a `<div data-testid="...">`. Switched to `.frame-skin > div + div` which targets the wrapper divs that ARE direct siblings. (Sentry P-LOW)
- **Minimal-footer baseband margin** — `mt-7` Tailwind class (specificity 0,1,0) was overridden by `.mf-baseband { margin-top: clamp(...) }` (specificity 0,2,0). Switched to inline style so the minimal footer lands at 28px instead of 48–72px. (Greptile P1)
- **Eyebrow class duplication** in `ArtistProfileSectionHeader` — removed redundant `text-[11px] font-medium uppercase tracking-[0.18em]` Tailwind classes since `.frame-eyebrow` already covers them. (Greptile P2)

## [26.4.193] - 2026-04-29

> Marketing screenshot pipeline + CSS cascade fix. Hamburger no longer leaks onto desktop, profile-desktop capture renders the real desktop UI, every product-screenshot literal in marketing code now flows through `apps/web/lib/screenshots/registry.ts`.

### Fixed

- **Hamburger menu showing on desktop** — `marketing-utilities.css`, `auth-utilities.css`, and `app-utilities.css` were re-importing `tailwindcss/utilities.css` after globals.css, emitting a duplicate `.flex { display: flex }` rule that won source-order tiebreak over `.md\:hidden { display: none }`. Removed all three CSS files and their imports from `(marketing)`, `(auth)`, `app`, `onboarding`, and `waitlist` layouts. Tailwind v4 still auto-scans the project, so no classes are lost. Second CSS bundle on `/new` dropped from 371KB to 29KB.
- **`profile-desktop.png` rendered as a phone-shaped fallback on a wide black canvas** — the capture's `waitFor` selector fired before React's `useEffect` flipped `isDesktopLayout=true`. Switched to `[data-testid="profile-desktop-surface"]` so the capture waits for post-hydration desktop layout. Same fix applied to `tim-white-profile-live-desktop` and `tim-white-profile-mainstream-desktop`.
- **Locator-captured screenshots advertised wrong dimensions to next/image** — `release-tasks-active.png` is 1624×1428, not 2880×1800. New `PUBLIC_EXPORT_DIMENSIONS` map in `apps/web/lib/screenshots/registry.ts` returns the actual PNG dimensions from each IHDR header.

### Changed

- New `getMarketingExportScenarios()` and `getMarketingExportImage(id)` helpers in `apps/web/lib/screenshots/registry.ts` (client-safe — no `node:fs` imports).
- New `<MarketingScreenshot scenarioId>` and `<MarketingPhoneImage scenarioId>` wrappers under `apps/web/components/marketing/`. Default `quality={85}` and a sensible responsive `sizes` attribute.
- 31 hardcoded `/product-screenshots/...` literals across 14 active files (data files + 9 home components + 2 artist-profile sections + `HomepageV2Route`) now flow through the registry.
- 9 scenarios re-tagged `marketing-export` (`tim-white-profile-*` mobile variants, release-presave-mobile, release-tasks-desktop, `artist-spec-*` desktops).
- Recaptured at retina: `marketing-home-desktop`, `public-profile-desktop`, `release-landing-{desktop,mobile}`, `release-tasks-active`, several `artist-spec-*` and `artist-profile-*-section-desktop`.
- Cleaned up 2 orphan PNGs (`artist-spec-geo-insights-panel.png`, `artist-spec-rich-analytics-panel.png`) that had no registry entry.

### Removed

- 3 unused orphan files in `apps/web/app/(marketing)/new/_components/` (`NewLandingHero`, `NewLandingSections`, `NewLandingFinalCta` — 473 lines of dead code, never imported).

### Documentation

- `docs/CANONICAL_SURFACES.md` gains a "How to add a marketing screenshot" section.
- `CLAUDE.md` gets a one-line pointer.

## [26.4.192] - 2026-04-29

> Mobile public profile alert signup hardening and iPhone viewport gates.

### Added

- **Blocking mobile profile viewport suite** covering iPhone 13 through 17 viewport families across Home, Music, Events, Alerts, About, Contact, Pay, Releases, and Notifications screens.
- **Alert signup focus stability checks** that fail when mobile input focus changes the layout viewport, scrolls the shell, introduces horizontal overflow, or risks iOS input zoom.
- **Public Lighthouse CI coverage** for the new profile mobile viewport/performance budget gate.

### Changed

- **Alerts signup flow** now treats OTP verification as the subscription activation moment, then collects name and birthday as follow-up enrichment.
- **Mobile profile artwork fallbacks** avoid rendering default app/avatar assets as hero and rail imagery.

## [26.4.191] - 2026-04-28

> Pre-landing review fixes for the page-builder + component-checker (#7920, #7919). Four Greptile findings addressed.

### Fixed

- **Suspense boundary around `useSearchParams()`** in both `/exp/page-builder/page.tsx` and `/exp/component-checker/page.tsx`. Without it, Next.js 16 App Router opts the route out of static prerendering and throws at build time.
- **Page-builder body reset bug**: removing the last section now drops the `?body=` param entirely instead of setting it to `''`. The "no body sections" empty state in the drawer is reachable again.
- **Page-builder toolbar count**: `Sections (N)` now uses the resolved variant count, not raw URL ids — keeps the label truthful when someone hand-types a stale id into `?body=`.
- **Page-builder dialog a11y**: drawer now has `aria-modal='true'` and an Escape-key handler.

## [26.4.190] - 2026-04-28

> Page-builder route + chrome toggles. PR 2 of the landing-system consolidation. Builds on the section registry from PR 1; renders a complete landing page (header + body + CTA + footer) with toolbar toggles for header chrome, footer density, CTA visibility, and a side drawer for body composition.

### Added

- **`/exp/page-builder`** — composes a real landing page from registry sections. Always renders `MarketingHeader` + body + `MarketingFinalCTA` + `MarketingFooter` (the locked-in trio). URL-driven state via `?header=`, `?footer=`, `?cta=`, `?body=` so deep links survive refresh.
- **Chrome toolbar** (fixed at top of viewport):
  - **Header**: Solid (`landing` variant) ↔ Transparent (`homepage` variant)
  - **Footer**: Full ↔ Minimal
  - **CTA**: On ↔ Off
  - **Sections (N)** button → opens the side drawer
- **Section drawer** (slides in from the right):
  - Top section: current body order with up/down/remove controls per section
  - Below: every body-eligible variant grouped by category (`hero | logo-bar | feature-card | testimonial | faq`) — click any variant to append it
  - Headers, footers, and footer-CTAs are excluded from the drawer; they're chrome
- **Default body composition**: hero → logo-bar → feature-cards → testimonials → FAQ. Mirrors a "complete" landing page so reviewers see the canonical shape on first load.

### Why now

PR 2 closes the loop on what we want every landing page to look like. With the toolbar toggles locked into the spec, "what does this landing page look like with a transparent header and minimal footer?" stops being a thought experiment — you toggle and see it.

### Not yet

PR 3 deletes the duplicates flagged by PR 1's registry (`CTASection` orphaned, `HeroSection` consolidate → `MarketingHero`, `FinalCTASection` refactor to extract `ClaimHandleForm`). PR 4 adds the `MarketingPageShell` "every landing must end with `MarketingFinalCTA` unless in `LEGAL_ROUTES`" invariant so the page-builder's locked-in design contract is enforced at the type level.

## [26.4.189] - 2026-04-28

> Landing-page section registry + component-checker. PR 1 of the landing-system consolidation. Adds one source of truth for "what landing-page sections exist" and a full-bleed preview surface (`/exp/component-checker`) so we can audit variants on ultra-wide before merging duplicates.

### Added

- **`apps/web/lib/sections/registry.ts`** — typed registry of landing-page section variants. Eight categories (`header | hero | logo-bar | feature-card | testimonial | faq | footer-cta | footer`) ordered top-of-page → bottom-of-page. Each entry carries `componentPath`, `usedIn`, `status` (`canonical | consolidate | orphaned`), and a `render()` callback so both the component-checker and the upcoming page-builder render variants identically. Per-category variant arrays live in `apps/web/lib/sections/variants/*.tsx` so adding a new variant doesn't touch the registry root.
- **`/exp/component-checker`** — full-bleed single-section preview, no chrome.
  - Floating top-left toolbar: category dropdown + variant dropdown + status pill (canonical/consolidate/orphaned) + canonical badge + component path.
  - URL-driven via `?id=<variant-id>` so deep links survive refresh.
  - Keyboard nav: `←`/`→` move within the current category; `⌘↑`/`⌘↓` jump category. Skips when an input/textarea is focused.
  - 16 variants seeded across the 8 categories — every section that ships on a landing page has at least one entry.

### Why

The page-builder (PR 2) and the consolidation pass (PR 3) both need this registry as their data layer. Registry-first means PR 2 lands as a thin composition shell on top of `SECTION_REGISTRY`, and PR 3's deletions are mechanical because every call site is enumerated in `usedIn`.

### Not yet

PR 2 (page-builder with header/footer/CTA chrome toggles) builds on top of this. PR 3 deletes `CTASection` (orphaned), folds `HeroSection` into `MarketingHero`, and refactors `FinalCTASection` to extract `ClaimHandleForm`. PR 4 adds the `MarketingPageShell` "every landing must end with `MarketingFinalCTA` unless in `LEGAL_ROUTES`" invariant.

## [26.4.187] - 2026-04-28

> Quiet console fix: avatars and other small images stop triggering Next.js's "placeholder='blur' on image smaller than 40x40" warning on every authenticated page. Plus an expanded Claude Code permission allowlist so QA-typical commands stop prompting.

### Fixed

- **`OptimizedImage` no longer ships a blur placeholder for renders below 40x40.** Next.js Image warns whenever `placeholder='blur'` is set on an image rendered smaller than 40x40 because the blur overhead is wasteful at that size. The component defaulted to `'blur'` and renders avatars as small as `size='sm'` (32x32, used in workspace menu and sidebar profile button), so the warning fired on every authenticated page. New `effectivePlaceholder` memo downgrades to `'empty'` when the rendered dimension is below 40px and the caller didn't ask for empty. `fill` mode keeps the original placeholder since rendered size is unknown at build time. Existing 9 unit tests pass unchanged. (ISSUE-001 from the QA golden-path sweep.)

### Changed

- **`.claude/settings.json` allowlist expanded** from `/sync-permissions` and `/fewer-permission-prompts`. Adds `mcp__linear-server__*` (allow), `pnpm exec grep *` and `~/.claude/skills/gstack/browse/dist/browse *` (bash.allow), and `GIT_EDITOR=* git *` (bash.prompt). Reduces redundant permission prompts during interactive sessions.

## [26.4.185] - 2026-04-28

> DevToolbar override badge no longer lies about orphans. Override entries in
> localStorage that no longer match any flag in `APP_FLAG_OVERRIDE_KEYS` are now
> partitioned out — the badge counts only valid overrides, and a separate
> "Orphans (N)" section in the open panel exposes them with inspect + manual purge
> buttons. Manual purge only by design (no auto-prune) to avoid cross-tab races
> on version skew. Also: Next.js dev indicators disabled to declutter the corner.

### Changed

- `useStoredAppFlagOverrides` now exposes `validOverrides`, `orphanKeys`, and `purgeOrphans()` alongside the existing `overrides` record. `validOverrides` is the partition of the stored record whose keys are present in `APP_FLAG_OVERRIDE_KEYS`; `orphanKeys` is the rest. `purgeOrphans()` rewrites localStorage with only the valid keys.
- DevToolbar's bottom-bar override count now reads from `validOverrides` so orphans don't inflate it. The open panel renders an "Orphans (N)" section with inspect (expand to see keys) and purge (rewrite localStorage) actions when `orphanKeys.length > 0`.
- `next.config.js`: `devIndicators` set to `false`. The floating "N" overlay is gone.

### Added

- `apps/web/tests/unit/flags/useStoredAppFlagOverrides.test.tsx` — 6 Vitest cases covering partition correctness, idempotent purge, cross-tab `storage` event sync without auto-write, and no-op on empty orphans.

## [26.4.185] - 2026-04-28

> Refactor: extract `executeChatTurn()` from the 2k-line chat route into `apps/web/lib/chat/run.ts` as a pure pipeline. No behavior change. Sets up an eval harness and a future canon-retrieval layer to share the same code path the production route runs, so regressions are catchable without re-implementing chat from scratch.

### Changed

- **Chat-turn pipeline extracted to `lib/chat/run.ts`.** `executeChatTurn()` owns knowledge-context selection, system-prompt assembly, model-message conversion, model selection (light vs full + `forceLightModel` override), telemetry tagging, and the `streamText()` invocation. Tools are pre-built by the caller and passed in (closure pattern unchanged). `apps/web/app/api/chat/route.ts` shrinks from 2,036 → ~1,800 lines and now delegates the streaming pipeline.
- **Sentry coupling removed from the pipeline.** `executeChatTurn` accepts a `ChatTelemetry` object with `setTags`/`setExtra`/`captureException` hooks. The route binds these to Sentry; future eval/replay callers can pass a no-op telemetry. No production observability change — the same tags fire from the same call sites.
- **Shared chat types moved to `lib/chat/types.ts`** (`ArtistContext`, `ReleaseContext`, `artistContextSchema`, `ChatTelemetry`). Avoids cycles between `route.ts` and `run.ts`.

### Added

- `apps/web/tests/unit/chat/run.parity.test.ts` (14 tests). Asserts model selection, system-prompt content, sorted tool names, telemetry tag emission, and `onError` capture routing — locks in parity for any future caller of `executeChatTurn`.

## [26.4.184] - 2026-04-28

> Frame.io-inspired homepage refresh: the hero now matches Frame.io's exact typography spec (Satoshi 80px / weight 600 / -0.045em) and layout positions, the mockup carousel has a proper window-style top chrome with rounded 18px corners, the header is transparent docked and switches to frosted glass on scroll, and the footer locks to the same edge-to-edge gutter system as the header. New shared `MarketingFinalCTA` foundation for the landing page system.

### Changed

- **Homepage hero typography matches Frame.io's `/features/present` spec exactly** (verified by reading their computed styles via DOM inspection). Eyebrow `Meet Jovie` in cyan-blue (rgb(97,153,246)), 12px / weight 400 / 0.06em tracking. Headline `Drop more music, with less work.` in Satoshi 80px / weight 600 / -0.045em. Subhead 18px / weight 400 / line-height 1.45 / color rgba(234,234,255,0.5). CTAs 14px / weight 600 / 40px / 100px radius / solid white primary, transparent secondary.
- **Header glassmorphism on scroll.** Docked = transparent. Past 8px of scroll = rgba(8,8,10,0.55) bg + backdrop-blur 18px saturate(180%) + hairline bottom border. Driven by `HomeScrollWatcher` toggling `data-scrolled` on `.home-viewport`. 220ms transition.
- **Mockup carousel restored to Frame's 3-desktop peek pattern.** Center desktop fully visible at 879×494, side peeks clipped at the viewport edges. Window-style top chrome (32px, hairline divider) with 18px rounded corners and a subtle purple glass tint matching Frame.io's GlassWrapper. Soft purple glow above each mockup softens the top transition into the page.
- **Header / content / footer share the same edge-to-edge gutter system.** New `MarketingFooter` is full-bleed with `clamp(1.25rem, 2.2vw, 2rem)` gutters. Privacy/Terms moved to the right via `justify-between`; copyright stays left.
- **Header content trimmed.** Header height 84 → 72px, nav 15px/680 → 14px/600, auth links 40 → 36px tall. Login/Start Free Trial gap 1.5rem → 1.75rem so they read as separate elements.
- **Outcome cards shrunk** ~30% via `flex-basis` reductions. Card titles dropped to clamp(2rem,3vw,3rem) / weight 680 / -0.025em.
- **Trust band label visible.** "Trusted by artists on" now renders above the logo strip (was sr-only).
- **Animated electric beam** in the hero: four cyan-blue verticals with an 8s pulse and slight Y drift, mix-blend-mode screen, prefers-reduced-motion respected.
- **Outcome card titles** drop from 43.2px → 24-28px (clamp(1.5rem, 2vw, 1.75rem)) so the rail stops competing with the H2 above it; H2/H3 step restored.
- **Final-CTA H2** aligned to the system scale: clamp(2rem, 3.4vw, 3rem) / weight 680 / line-height 1.05 / tracking -0.025em (was 52px / 590 — off-system).
- **Vestigial mockup top chrome bar removed** after the traffic lights were dropped. Every side now gets equal 7px chrome with the same glass tint.
- **Final-CTA primary button copy:** "Start Free Trial" → "Claim my workspace" so the same label doesn't repeat in header, hero, pricing, and footer-CTA.
- **DESIGN.md blesses the homepage hero Satoshi exception** inside System B (Inter-only) so future contributors know the deviation is intentional.

### Added

- `apps/web/components/site/MarketingFinalCTA.tsx` — shared final-CTA section for marketing pages. Sensible defaults (title, "Start Free Trial" → /signup) with per-page overrides for title / body / cta / secondary cta. Foundation for the landing page system.
- `apps/web/components/homepage/HomeScrollWatcher.tsx` — client component that toggles `data-scrolled` on `.home-viewport` for the glassmorphic header.
- `SHELL_CHAT_V1` app flag (default off, dev toolbar label "New Design"). Plumbed through contracts + registry; consumer lands separately.
- Satoshi Variable font loaded globally via `next/font/local` (was downloaded but never registered) so `--font-satoshi` resolves outside the marketing wrapper.

## [26.4.183] - 2026-04-27

> Follow-up to v26.4.181. Allow `DELETE` in R2 CORS so the browser-side multipart-abort path works when a user cancels a half-finished upload.

### Fixed

- [internal] R2 CORS — added `DELETE` to allowed methods on all three env-specific CORS files. AWS S3's `AbortMultipartUpload` operation (which R2 supports) uses HTTP DELETE; without it, browser preflight for an in-flight upload cancel would fail. Object deletion stays server-side via signed URLs; this is for the upload-cancel path only.

## [26.4.182] - 2026-04-27

> Press `?` anywhere in the dashboard to open the keyboard shortcuts help. Linear convention; complements the existing `Cmd+/`.

### Added

- Press `?` anywhere outside an input to open the keyboard shortcuts modal. The modal's `keyboard-shortcuts` row now lists both `⌘ /` and `?` so the new alternate is discoverable.

## [26.4.181] - 2026-04-27

> Follow-up to v26.4.180. Tightens R2 bucket configuration based on bot review of #7845 — separates CORS rules per environment so localhost no longer hits production, and fixes a lifecycle bug where the orphan-multipart-upload sweep was scoped to a single prefix.

### Changed

- [internal] Split `infra/r2/cors.json` into `cors-dev.json` / `cors-staging.json` / `cors-prod.json`. The prod bucket no longer accepts `http://localhost:3000`. Allowed headers tightened from `*` to the explicit set the AWS S3 SDK uses for browser-side multipart.

### Fixed

- [internal] `infra/r2/lifecycle.json` — `abortMultipartUploadsTransition` was nested inside the `archived/` prefix-scoped rule, so orphan multiparts targeting the actual upload path (`creator/<id>/raw/...`) were never aborted. Split into two rules: the IA transition stays prefix-scoped, the multipart abort runs against every prefix.

## [26.4.180] - 2026-04-27

> Reproducible Cloudflare R2 bucket configuration for the upcoming audio-asset upload pipeline.

### Added

- [internal] `infra/r2/cors.json` and `infra/r2/lifecycle.json` capture the deployed CORS rules and Infrequent-Access lifecycle for the `jovie-audio-{dev,staging,prod}` buckets, so the bucket configuration can be re-applied with `wrangler r2 bucket cors set` / `lifecycle set`.

## [26.4.179] - 2026-04-26

> Public artist profiles now ship with a full mobile/desktop refresh, photo-driven accents, a new home rail, and a guided alerts experience that stays consistent across live profiles, previews, and demo captures.

### Added

- Public profiles now include a refreshed home rail for releases, shows, alerts, and listening destinations.
- Artists can collect richer alert preferences, including artist-email opt-in state, through a guided mobile flow.
- Desktop profile views now use a dedicated surface that mirrors the refreshed mobile profile experience.
- Profile accents now automatically adapt to artist photos and stay consistent across profile updates.
- [internal] Added versioned `theme.profileAccent` support across upload, suggestion, ingestion, admin, dashboard, and public-profile mutation paths.
- [internal] Added visual review tooling for mock-home profile captures and review matrices.

### Changed

- Public profiles now use a shared compact shell with a full-bleed hero, status pill, alerts CTA, quick social actions, and tabbed navigation.
- Preview, demo, and live profile surfaces now stay visually aligned.
- Alert and profile drawer flows now share a more consistent modal, embedded, and standalone presentation model.
- Pay/tip drawers now support custom amount entry and drawer-specific presentation.
- [internal] Rebuilt the compact profile template around shared primary-tab panel contracts and profile surface presentations.
- [internal] Theme writes now merge rather than replace the full theme object, preserving persisted profile accent data.

### Fixed

- Alert resend cooldowns now block repeated resend actions instead of only changing the button label.
- Profile username updates now invalidate both the old and new public profile cache keys.
- Profile home rail pagination now tracks the visible card using viewport-relative positions.
- Notification status responses no longer expose default content preferences for unsubscribed users.
- Public render fallbacks now avoid noisy local image lookups while keeping neutral accents when no usable image is available.

## [26.4.178] - 2026-04-25

> Closes two SonarCloud security hotspots on the bio-import sanitizer that shipped in 26.4.176. ReDoS-prone unbounded greedy quantifiers in the URL-stripping regex are now bounded; the bidi/zero-width char class is built via `new RegExp(string)` with `\u` escapes so the source file itself contains no bidi chars (trojan-source defense). No behavior change for real bios.

### Fixed

- `apps/web/lib/ai/tools/extract-bio-candidate.ts` — bounded `URL_PATTERN` quantifiers (`[^\s<>"']{1,2048}` and `[a-z0-9.-]{1,253}`) closing the `typescript:S5852` super-linear backtracking hotspot. Switched `ZERO_WIDTH_PATTERN` to `new RegExp('[\\u200B-...]', 'g')` so the source bytes are 100% ASCII, closing the `text:S6389` bidirectional-character hotspot. Also normalized `CONTROL_PATTERN` to use `\x` escapes for consistency.

## [26.4.176] - 2026-04-24

> Jovie chat agent can now import an artist's bio from a public URL. Say "import my bio from timwhite.co" and the agent fetches the page server-side, extracts a candidate from JSON-LD or meta tags, sanitizes it, and routes it through the existing confirmation card with a clear "Imported from timwhite.co" provenance line. Closes the most common follow-up to "write me a bio" — owning the URL-import flow instead of telling the user to paste.

### Added

- `apps/web/lib/ai/tools/safe-fetch-public-html.ts` — SSRF-safe HTML fetcher for arbitrary user-supplied URLs. Composes the existing `isPrivateHostname` (DNS-resolved gate) and `isSafeExternalHttpsUrl` (literal-host gate) primitives with manual redirect handling so every redirect hop is re-validated. HTTPS only, 5s timeout, 512 KiB body cap, 3 redirect cap. Detects auth walls (401/403, `WWW-Authenticate`, redirects to known identity providers like Clerk/Auth0/Google). Returns a typed discriminated union — callers never rethrow.
- `apps/web/lib/ai/tools/extract-bio-candidate.ts` — extracts a bio from raw HTML in priority order: JSON-LD `Person`/`MusicGroup`/`ProfilePage` `description` (tolerates `@graph` and array `@type`), then `og:description`, then `<meta name="description">`. Sanitizes before any model sees the text: strips URLs, C0/C1 control chars, zero-width and bidi chars, then word-boundary truncates at 600 chars. The "first non-trivial `<p>` in `<main>`" fallback was deliberately cut as the highest-injection-surface, lowest-signal path.
- `apps/web/lib/ai/tools/import-bio-from-url.ts` — chat tool that wires the fetcher and extractor together, gated by per-user-per-tool rate limits (5/min and 20/hour, scoped to the tool not the chat to absorb fan-out within a single chat turn). Returns `{ ok: true, candidateBio, sourceUrl, sourceTitle }` on success and a typed `reason` plus model-readable `hint` on failure. The system prompt instructs the model to pass the candidate verbatim through `proposeProfileEdit` and to treat all returned text as untrusted external data, never instructions.
- `apps/web/lib/rate-limit/{config,limiters,index}.ts` — registers `bioImportFromUrl` (5/min) and `bioImportFromUrlHourly` (20/hour) limiters following the existing per-feature pattern.
- 49 unit tests across `apps/web/tests/unit/lib/ai/tools/` covering: SSRF guards (literal IPs, IPv6 link-local, IPv4-mapped IPv6, metadata hosts, internal suffixes), DNS-rebinding mitigation across redirect hops, redirect chain to private IP, redirect cap, auth-wall detection (status + IDP host fragments), content-type and body-size enforcement, timeout, JSON-LD extraction priority and edge cases, prompt-injection round-trip with URL stripping, and rate-limit short-circuit.

### Changed

- `apps/web/app/api/chat/route.ts` — registers `importBioFromUrl` in the paid-plan tools map alongside `proposeProfileEdit`.
- `apps/web/lib/chat/system-prompt.ts` — instructs the model to call `importBioFromUrl` when the artist names or pastes a URL, then chain `proposeProfileEdit` with the returned candidate. Establishes the untrusted-content posture so injection attempts in fetched bios cannot redirect agent behavior.
- `apps/web/lib/ai/tools/profile-edit.ts` — adds optional `sourceUrl` and `sourceTitle` fields on `proposeProfileEdit` so the confirmation card can surface provenance when the value originated from a URL import.
- `apps/web/components/features/dashboard/organisms/ProfileEditPreviewCard.tsx` — renders an "Imported from {host}" line linking to the source URL above the diff. The host is the user-facing safety signal that prevents click-through approval of attacker-controlled bio content.

## [26.4.173] - 2026-04-24

> Public view-tracking endpoint now rejects malformed handles before they touch Redis or the rate limiter. Arbitrary 100-char strings (unicode, control bytes, path-traversal probes, XSS payloads) used to reach `profile:views:${x}` Redis keys and per-handle rate-limit keys via `/api/profile/view`; the endpoint now enforces the canonical 3-24 char `[a-z0-9-]` handle schema used everywhere else in the app.

### Fixed

- `apps/web/app/api/profile/view/route.ts` — tightened the POST body schema from `z.string().min(1).max(100)` to the canonical lowercase handle pattern (3-24 chars, `[a-z0-9-]`), with pre-normalization to lowercase so mixed-case input is still accepted by legitimate clients. Closes three hardening gaps: Redis keyspace pollution via `profile:views:${attacker-supplied-bytes}`, per-handle rate-limit key pollution via `${handle}:${ip}`, and wasted DB lookups on handles that can never exist in `usernameNormalized`. No legitimate traffic breaks — the only caller (`ProfileViewTracker` on `/[username]/page.tsx`) always passes the canonical `artist.handle`.

### Added

- `apps/web/tests/unit/profile/profile-view-api.test.ts` — 13 new adversarial test cases (script injection, path traversal, null byte, internal whitespace, RTL override, zero-width joiner, combining marks, emoji, whitespace padding, colon/slash for key pollution, underscore/dot outside charset) plus length-boundary tests and a mixed-case normalization test. All previously passing tests still pass.

## [26.4.172] - 2026-04-23

> The intercepted signup modal no longer blows out to the full viewport when the intent hint is short. The dialog now hugs its content, centers cleanly, and the Clerk form sits flush inside our modal chrome instead of stacking a second card inside a card.

### Fixed

- `apps/web/components/auth/AuthModalShell.tsx` — swapped `fixed inset-0 m-auto h-auto` for explicit `left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-fit`, which was the root cause of the dialog stretching to full viewport height. Tightened to `max-w-[400px]` / `p-5`, and moved the `statusRow` out of the header flex into a centered single-line row beneath the back arrow so the "Continuing with…" hint no longer gets truncated mid-phrase.
- `apps/web/app/@auth/(.)signup/page.tsx` — simplified the `statusRow` to a truncating `<p>`; placement now lives in the shell.
- `apps/web/styles/theme.css` — scoped a `.jovie-auth-modal` override so Clerk's `.cl-card` renders flush inside the dialog (no nested border/background/shadow/backdrop-filter/padding) and hides any `[data-clerk-captcha]` / `#clerk-captcha` spacer that would otherwise force dialog height.

## [26.4.171] - 2026-04-23

> Main deploys stop starving when merge-queue bursts stack up. Only the commit that is still `main` HEAD at gate time deploys, intermediates skip cleanly, and mid-flight cancellations now page Slack instead of silently reporting success.

### Changed

- `.github/workflows/ci.yml` — added a `deploy-gate` job that checks whether the current SHA is still `origin/main` tip via the GitHub API. When it isn't, `deploy-staging`, `canary-health-gate`, and `promote-production` all skip cleanly so the six-commit pile-up observed on 2026-04-24 can't happen again. The gate reads `github.sha` against the live main tip on every run, so agent-pipeline merge-queue bursts collapse to a single deploy of the final tip.
- `.github/workflows/ci.yml` — `deploy-notify` now classifies `cancelled` deploy-chain jobs alongside `failure`. Runs that get cancelled mid-flight (merge queue, concurrency preemption) post a `⛔ Deploy cancelled mid-flight` alert to `#alerts-critical` instead of silently succeeding like the cancelled `14d5a44` run did on 2026-04-24.

## [26.4.170] - 2026-04-23

> Desktop auth screens get a split-screen brand panel — the sign-in form sits on the left, a clean white panel with the brand mark fills the right. Mobile is unchanged.

### Changed

- `apps/web/components/features/auth/AuthLayout.tsx` — wrapped the auth shell in a `lg` grid so desktop auth screens (signin, waitlist, etc.) render a centered form on a dark left column beside a white brand panel on the right. Mobile keeps its fixed-overlay behavior (scoped via `max-lg:` so non-responsive utilities can't win the cascade).

## [26.4.169] - 2026-04-23

> The homepage now opens with a tighter premium hero, real product navigation, and a live trust strip right under the fold. Visitors can go straight to Product, Solutions, Pricing, or Resources, ask Jovie from the new hero composer, and see the trust bar immediately instead of waiting on a staged flag.

### Added

- `apps/web/public/brand-logos/black-hole-recordings.png` — added a monochrome-ready Black Hole Recordings asset for the live homepage trust strip.

### Changed

- `apps/web/app/(home)/layout.tsx`, `MarketingHeader`, `HeaderNav`, `MobileNav`, and `MarketingSignInLink` — the live `/` route now uses the shared marketing header with `Product`, `Solutions`, `Pricing`, and `Resources`, plus a single white `Sign in` pill and no duplicate mobile `Log in` link.
- `apps/web/app/(home)/page.tsx` and `apps/web/app/(home)/home.css` — rebuilt the homepage hero into a contained near-black surface with rounded bottom corners, a centered glow, a perspective grid, and spacing tuned for the fixed header on desktop and mobile.
- `apps/web/components/homepage/intent.ts` and `HomepageIntent.tsx` — refreshed the homepage brief to `Your AI Artist Manager.`, updated the subhead and `Ask Jovie...` placeholder, and replaced the prompt pills with `Plan a release`, `Generate album art`, `Pitch playlists`, `Build artist profile`, and `Analyze momentum`.
- `apps/web/components/features/home/HomeTrustSection.tsx` and `label-logos.tsx` — shipped the trust bar live on `/` with the label `Trusted by artists`, explicit homepage styling, and refreshed monochrome label treatment for Universal Music Group, Armada Music, The Orchard, AWAL, Black Hole Recordings, and disco:wax.
- `apps/web/tests/e2e/homepage.spec.ts`, `apps/web/tests/e2e/homepage-intent.spec.ts`, `apps/web/components/homepage/HomepageIntent.test.tsx`, `apps/web/components/homepage/intent.test.ts`, and `apps/web/tests/unit/home/intent-store.test.ts` — updated homepage coverage for the new hero copy, nav map, trust strip, mobile nav behavior, and prompt analytics payloads.
- [internal] Synced `VERSION`, `version.json`, and all package manifests to `26.4.169` so the repo's version sources agree again.

## [26.4.168] - 2026-04-22

> Profile edits through chat now actually show you the confirmation. "Update my bio to..." used to save the bio silently with no assistant reply, making it look like nothing happened. Every deterministic chat action (bio, name, add link, remove link, avatar upload, feedback) now streams back a visible assistant confirmation.

### Fixed

- `apps/web/app/api/chat/route.ts` — deterministic intent replies were returned as plain JSON, which the AI SDK `useChat` client (expecting `text/event-stream` UIMessage chunks) silently dropped. The reply now streams as a `text-delta` chunk via `createUIMessageStream` + `createUIMessageStreamResponse`, so the confirmation renders in the thread and persists to the conversation history.

### Added

- `apps/web/tests/unit/lib/chat/intent-response-sse-stream.test.ts` — regression test asserting deterministic intent responses use `text/event-stream` content type and contain the expected `text-delta` chunk, not plain JSON.

## [26.4.167] - 2026-04-22

> Clicking "Generate album art" on a release no longer ships a raw JSON blob as your chat message. Release references render as a pill chip in the transcript, readable at a glance. The chip format is the groundwork for the upcoming `/` command menu — any release, artist, or skill will compose into the input as a chip instead of free text.

### Added

- `apps/web/lib/chat/tokens.ts` — wire-format serializer/parser for `@release:id[label]`, `@artist:id[label]`, `@track:id[label]` entity mentions, and `/skill:id` skill invocations. Pure, server-safe, 17 unit tests covering parse/serialize/roundtrip/extractors.
- `apps/web/lib/commands/registry.ts` — shared Command registry seeded from `tool-schemas.ts` with 5 skills (generateAlbumArt, proposeAvatarUpload, proposeSocialLink, proposeSocialLinkRemoval, submitFeedback). Single source of truth for the upcoming chat `/` menu and cmd+k palette.
- `apps/web/lib/commands/entities.ts` — `EntityProvider` type + lazy registration API for per-kind search hooks (release, artist, track).
- `apps/web/components/jovie/components/EntityChip.tsx` — pill component with `input` and `transcript` variants, accessible (`role="img"` + `aria-label` reading "Release: Midnight Drive").
- `apps/web/components/jovie/components/TokenizedText.tsx` — parses tokens in user-authored messages and renders chips inline.

### Changed

- `ChatAlbumArtCard` no longer embeds `JSON.stringify({releaseId, releaseTitle, ...})` inside user messages. Button clicks now emit `/skill:generateAlbumArt @release:<id>[<title>] — show three options.`, which renders as a pill chip in the transcript.
- `ChatMessage` renders user messages through `TokenizedText` instead of plain `whitespace-pre-wrap`, so chips display inline.
- System prompt has a new "Entity & Skill Tokens" section teaching the model to interpret `@kind:id[label]` and `/skill:id` tokens directly (pass id as the tool's releaseId; don't echo tokens in replies).

- [internal] `AGENTS.md`: added rule to always open a Linear issue for deferred follow-ups and link dependencies with `blockedBy`.
- [internal] Slash command menu, contenteditable chip input, and concrete EntityProviders are tracked in JOV-1793. Global cmd+k palette that consumes this registry is tracked in JOV-1792.
- [internal] Bumped version to `26.4.167` across `VERSION` and `package.json`.

## [26.4.166] - 2026-04-22

> Killed the "Built for artists." hero eyebrow pill so the headline owns first attention. Fixed the sign-in modal's small-then-layoutshift flash when Clerk loads cold: the modal now reserves its final size and paints a Clerk-shaped skeleton while the bundle is in flight, and the "Sign in" header link prefetches the modal chunk on hover/focus so the skeleton almost never appears. Hardened hero paint isolation so the pulsing glow can't invalidate below-the-fold layout.

### Added

- New `MarketingSignInModal` skeleton (`data-testid="marketing-signin-skeleton"`) that mirrors the Clerk compact card layout (header, OAuth row, divider, input, primary button, footer) and is swapped out the moment Clerk's first input appears. Card wrapper reserves `min-height: 520px` so the box never resizes.
- `MarketingSignInLink` prefetches `./MarketingSignInModal` on first `mouseenter` / `focus` / `touchstart` so the Clerk bundle is already loading by the time the visitor clicks.
- New Vitest coverage for both components: `tests/components/organisms/MarketingSignInModal.test.tsx` (skeleton render, reserved min-height, Escape close, backdrop close, dialog role) and `tests/components/organisms/MarketingSignInLink.test.tsx` (no modal until click, open+close cycle, prefetch handlers wired).

### Changed

- Removed the `homepage-hero-eyebrow` "Built for artists." pill and its `HERO_COPY.eyebrow` entry. Dropped the now-redundant `mt-7 sm:mt-8` on the h1 since it's the first flex child.
- [perf] Added `contain: layout paint` to `.homepage-hero-flood` so the pulsing glow can no longer invalidate below-fold content, and `transform: translateZ(0); backface-visibility: hidden` on the decorative gradient layers to pin them to the compositor (animation runs off the main thread).

### Infrastructure

- [internal] Bumped version to `26.4.166` across `VERSION` and `package.json`.

## [26.4.165] - 2026-04-22

> Sign-in no longer gets stuck on a black spinner when Clerk cookies or env keys drift between dev/staging/prod. The `/signin` page now surfaces a "Reset session" escape after 6 seconds, and a new public `/api/auth/reset` endpoint clears Clerk cookies on both the host and `.jov.ie` parent scope so stale cookies from one environment can't poison another. Staging deployments that accidentally inherit production Clerk keys show a visible error card instead of a blank page, and every silent-failure path now fires a Sentry event so the next occurrence can't go unnoticed.

### Added

- New `POST/GET /api/auth/reset` public endpoint that clears Clerk cookies (`__clerk*`, `__session*`, `__client*`, `__refresh*`) on both the current host and the parent `.jov.ie` domain scope, then redirects to `/signin?reset=1` with a confirmation toast.
- New `SignInTimeoutEscape` component renders a "Reset session and retry" link after 6 seconds if Clerk's sign-in form fails to mount, fires a `clerk_signin_skeleton_timeout` Sentry event, and links to `/api/auth/reset`.
- New `scripts/detect-clerk-id-drift.ts` audit script scans the DB for users whose `clerk_id` no longer matches any Clerk user for their email, reports mismatches, and emits a `clerk_id_drift_detected` Sentry event per row. Exits non-zero on drift so it can run on a schedule.
- `AuthUnavailableCard` gains a `showResetAction` mode that replaces the "Go to Homepage" link with a "Reset session and retry" form pointing at `/api/auth/reset`, used whenever auth is unavailable on a public host.
- Auth layout now fires a `clerk_bypass_on_public_host` Sentry event (error level) whenever the fallback unavailable card renders on a public https host, tagged with `hostname` and `key_status`.

### Changed

- `resolveClerkKeys()` now returns a structured `{ publishableKey, secretKey, status }` shape with `'ok' | 'staging_missing' | 'staging_inherits_prod' | 'no_publishable_key'` so downstream UI can distinguish missing-keys from inherits-prod misconfig.
- Middleware always sets an `x-clerk-key-status` request header alongside the existing `x-clerk-publishable-key`, giving the auth layout a deterministic signal for what to render.
- `AuthClientProviders` fires `clerk_bypass_on_public_host` from the client when `shouldBypassClerk` triggers on a public host, matching the server-side detection.
- Extracted Clerk cookie name prefixes into `@/lib/auth/clerk-cookie-names` and the dev Sync-Clerk core into `@/lib/auth/sync-clerk-id`. Both are now reused between dev-only routes and new public/recovery surfaces.

### Infrastructure

- [internal] Added `isPublicAuthHost()` helper to `components/providers/clerkAvailability.ts` for gating public-host-specific behavior (https + non-private hostname).
- [internal] Bumped version to `26.4.165` across `VERSION` and `package.json`.

## [26.4.164] - 2026-04-22

> Sign-in modal now proxies Clerk traffic through the app's `/__clerk` middleware like the rest of the app (fixing a would-be production break on `pk_live_` keys), and restores URL and focus state cleanly when dismissed. Hero headline picks up its intended Linear-bold weight from CSS instead of a conflicting Tailwind utility.

### Fixed

- [a11y] Restored focus to the trigger element when the sign-in modal closes, so keyboard and screen-reader users return to where they were.
- Fixed Clerk requests from the sign-in modal bypassing the `/__clerk` proxy in production. The scoped provider now passes `proxyUrl={getClerkProxyUrl(...)}` like the rest of the app.
- Fixed stale `#/sign-in/...` hash fragments persisting on the homepage after the modal was dismissed mid-flow. The original hash is restored on unmount.
- Fixed homepage hero headline rendering at Tailwind `font-semibold` (600) instead of the intended Linear-bold `680` weight. The `font-semibold` utility was removed so the `.homepage-hero-headline` class wins cleanly.

### Changed

- [internal] Synced the homepage performance manifest's `readySelectors` to the live hero (`#home-hero-heading` + `input#homepage-intent-input`) so `pnpm perf:loop --route-id home` can measure the real DOM instead of hanging on elements from the retired hero.
- [internal] Removed the unused `HERO_COPY.eyebrow.badge` field (dead code since the "NEW" chip was dropped from the pill).
- [internal] Synced the canonical VERSION file and workspace `package.json` entries to `26.4.164`.

## [26.4.163] - 2026-04-22

> Codex now boots Jovie worktrees through the canonical setup path and performs safe stop-time cleanup automatically when lifecycle hooks are available.

> Sign-in modal polish: portaled to `<body>` so it escapes the header's `backdrop-filter` containing block, restyled to a compact 400px dark card close to stock Clerk, and hardened for accessibility with a visible close X, focus-in-modal on open, and a Tab focus trap that keeps keyboard users inside the dialog.

### Added

- Added tracked Codex lifecycle config that runs the canonical setup wrapper on session start and the cleanup wrapper on stop.
- Added a safe Codex cleanup wrapper that prunes stale worktree metadata, clears Turbopack cache, and keeps heavier E2E/archive cleanup behind explicit environment flags.

### Fixed

- [a11y] Trapped Tab focus inside the sign-in modal so keyboard users no longer escape to the page behind the backdrop after Clerk's internal focus cycle ends.
- [a11y] Grew the close X touch target from 32×32 to 44×44 (WCAG 2.1 AAA) while keeping the 16px icon visually identical.
- Fixed the sign-in modal mounting inside the marketing header's `backdrop-filter` containing block, which shrank the dialog to 72px and top-clipped the Clerk card. Now portaled to `document.body`.

### Changed

- Simplified the Codex setup wrapper to delegate to `scripts/setup.sh`, including hook-safe JSON stdout handling for Codex lifecycle events.
- Restyled the sign-in modal to a compact dark Clerk appearance (400px card, stock Clerk `Sign in to Jovie` + "Welcome back" + social buttons + "Secured by Clerk" footer) instead of the heavy marketing theme.
- Added `ui={ui}` from `@clerk/ui` to the scoped ClerkProvider so Clerk pins its internal DOM structure for forward compatibility.
- Added a visible close X in the top-right of the modal card for users who don't know Escape + backdrop-click.
- Moved focus to the first input when the modal opens, via a `MutationObserver` that watches Clerk's async mount.
- [internal] Synced the canonical version file, workspace package versions, and the changelog head to `26.4.163`.

## [26.4.162] - 2026-04-22

> The homepage now opens with a Linear-premium hero: a muted, slow-pulsing neon glow behind a "Your AI Artist Manager." one-line headline that fits from 375px up, a "Built for artists." eyebrow pill, and a Clerk modal sign-in that lazy-mounts only when the header link is clicked. The rest of the `/new` composition is available behind individual feature flags, all off in production.

### Added

- Added saturated-flood-turned-Linear-premium hero to the homepage with a slow-pulsing blue-violet glow, centered headline that fits on one line across breakpoints, "Built for artists." eyebrow pill, and one-click Clerk sign-in modal that preserves the static home build.
- Added a configurable `label` prop to `HomeTrustSection` so the homepage can read "Accelerating release cycles for artists on" while artist-profile and release-notification surfaces keep "Trusted by artists on".
- Added individual feature flags for every `/new` section on the homepage (`SHOW_HOMEPAGE_V2_TRUST`, `_SYSTEM_OVERVIEW`, `_SPOTLIGHT`, `_CAPTURE_REACTIVATE`, `_POWER_GRID`, `_PRICING`, `_FINAL_CTA`, `_FOOTER_LINKS`), all default false, so sections can be rolled on one at a time.

### Changed

- The `(home)` layout now uses `.home-viewport` + `min-h-[100svh]` on both the shell and `<main>` so the hero fills the viewport and the footer sits below the fold, revealed on scroll.
- [internal] Synced the canonical VERSION file and workspace `package.json` entries to `26.4.162`.

## [26.4.161] - 2026-04-22

> Dropdown flyouts now behave like one focused menu stack, so release actions no longer leave multiple sibling submenus hanging open at the same time.

### Fixed

- Fixed shared dropdown submenu coordination so opening a sibling submenu closes the previously open flyout across dropdown and context-menu surfaces.
- Added regression coverage for root, context-menu, and nested submenu siblings so tracked-link style menus keep only one child flyout open per level.
- [internal] Synced the canonical version file, workspace package versions, and the changelog head to `26.4.161`.

## [26.4.160] - 2026-04-21

> Windows agents can bootstrap the repo from PowerShell without hitting the WSL launcher, and PR automation now verifies GitHub auth before trying to move branches.

### Added

- Added a PowerShell setup wrapper that locates Git for Windows Bash and runs the existing bootstrap script from the correct shell.
- Added setup-time GitHub CLI auth checks, including support for `GH_TOKEN` or `GITHUB_TOKEN` supplied by the environment or Doppler.

### Changed

- Documented the Windows setup path and captured the automation lesson so future PR train runs do not depend on local keyring access.

## [26.4.159] - 2026-04-18

> Tim White profile proof now uses the real action-card system, notification capture stays stable through every step, and the releases dashboard polish is ready to review on the same branch.

### Added

- Added shared Tim White profile action-card and demo review boards for latest release, countdown, nearby tour, next tour, playlist fallback, listen fallback, and inline subscription states.
- Added focused regression coverage for Tim White profile cards, OTP recovery, fixed-height notification states, and the releases dashboard date-picker and action-menu polish.

### Changed

- Rebuilt the Artist Profile marketing page around real Tim White proof surfaces, including the adaptive hero, outcomes grid, spec-wall crops, how-it-works visuals, and proof styling.
- Refined the public profile and home/demo fixtures so Tim White remains the canonical founder/profile identity, with collaboration credits rendered consistently as `w/ Cosmic Gate`.
- Refreshed the add-release drawer and provider-matrix expansion rows to use the shared calendar picker and cleaner bounded child-row layout.
- [internal] Adopted the latest runtime flag and Stripe-connect platform changes from `origin/main` while keeping the branch’s artist-profile QA fixes intact.

### Fixed

- Fixed the inline notifications composer so email, OTP, name, birthday, and done states keep one stable shell, and OTP recovery no longer loops or wipes trailing digits after an error.
- Fixed artist-profile accessibility follow-ups, including hero mode contrast, ingesting badge contrast, reactivation and monetization muted text contrast, and keyboard access into the monetization scroller.
- [internal] Synced the canonical version file, workspace package versions, and the changelog head to `26.4.159`.

## [26.4.158] - 2026-04-17

> Staged homepage and pricing refresh work is ready to review again, the mobile public profile hero is cleaner and more stable, and preview deploys keep working even when Vercel rejects oversized prebuilt uploads.

### Added

- Added the staged `/new` homepage route, shared marketing story primitives, and the data-driven homepage v2 copy/config stack so the refreshed landing experience can be reviewed behind a noindex route.

### Changed

- Refreshed `/pricing` with the new comparison-table and mobile-plan layout, updated staged marketing navigation/footer wiring, and swapped the demo founder persona assets to the canonical Calvin Harris image set used in the new marketing surfaces.
- Reworked the mobile public profile hero stack to prioritize notification capture, simplify the top-fold shell, and align the latest release treatment with the quieter pearl-style profile system.

### Fixed

- [internal] Hardened the preview deploy flow so Vercel falls back from impossible oversized prebuilt uploads to a source deploy, and made the postbuild asset sync script survive `.vercelignore` filtering.
- [internal] Fixed the mobile public profile listen drawer accessibility contract by injecting stable hidden drawer labels at the content root, which removes the Next dev overlay issue on `?mode=listen`.
- [internal] Fixed the inline mobile notifications flow so the revealed email field reliably receives focus after the hero CTA animates open, which keeps the primary public-profile conversion step feeling responsive.
- [internal] Synced the canonical version file, workspace package versions, and the changelog head to `26.4.158`.

## [26.4.157] - 2026-04-17

> Preview deploys now survive the Vercel oversized-prebuilt edge case, so PR review links keep generating even when the archive upload path fails first.

### Fixed

- [internal] Updated the shared Vercel deploy wrapper to count `.vercel/output` files, skip the plain `--prebuilt` fallback once output exceeds Vercel's `15000`-file cap, and fall back to a source deploy instead of retrying an impossible path.
- [internal] Synced the canonical version file, workspace package versions, and the changelog head to `26.4.157`.

## [26.4.156] - 2026-04-16

> Homepage and Artist Profile surfaces now inherit the refreshed design-system timing, weights, and profile shell tokens, and the PR preview deploy path now survives Vercel archive upload failures without stalling review.

### Changed

- Homepage marketing interactions now use the shared motion-duration and font-weight tokens, so claim-handle flows, search states, demo proof, and CTA surfaces animate on the same rhythm as the refreshed design system.
- Artist Profile cards, drawers, skeletons, and notification controls now read the canonical profile radius and action tokens instead of hardcoded pixel radii, which keeps the public profile shell aligned with the latest pearl surface system.
- [internal] Added `--profile-card-radius` and `--profile-inner-radius` to the shared design system and aligned the profile layout contract test to the tokenized shell radius.
- [internal] Extracted the shared profile drawer action classes into a single token-backed module so menu, notifications, releases, and contact rows stay aligned and Sonar duplication stays below the new-code gate.

### Fixed

- [internal] Reconciled the local home/profile polish pass against the latest `origin/main` design refresh without restoring deleted homepage proof-strip chrome or older profile surface values.
- [internal] Rebalanced shared subscription, contact, and drawer surface styling to the current pearl token set so mobile and desktop profile CTAs render with the same shell geometry.
- [internal] Restored the positioned Bento card shell, tokenized the remaining profile skeleton and drawer rows, and cleaned the waitlist route/button casing follow-up so the design-system pass matches the latest review feedback exactly.
- [internal] Added a reusable Vercel prebuilt deploy wrapper that retries archive uploads and falls back to plain prebuilt deploys, which unblocks preview and staging deploys when Vercel rejects the archived upload path.

## [26.4.155] - 2026-04-16

> Dropdown submenus now keep a stable width and row alignment even when optional icons are absent.

### Fixed

- [internal] `CommonDropdown` submenus now inherit the trigger row width when no explicit submenu width is provided, which keeps nested menus aligned with their parent entry in the shared dropdown system.
- [internal] Added regression coverage for inherited submenu width, explicit width overrides, and icon-less submenu row structure so shared dropdown menus keep consistent sizing across future refactors.
- [internal] Synced the canonical version file, workspace package versions, and the changelog head to `26.4.155`.

## [26.4.154.2] - 2026-04-16

> Public demo and screenshot pages now stay aligned with the real product screens, so review links and captures reflect the UI the team is actually shipping.

### Added

- [internal] Added canonical surface ownership metadata and demo parity coverage for shared dashboard screenshot routes.

### Changed

- [internal] `/demo/audience`, analytics, settings, links, earnings, and onboarding demo flows now render shared app surfaces with fixture-backed data instead of separate demo-only panels.
- [internal] Homepage smart-link proof now uses a generated product screenshot instead of mounting a live demo widget.

### Fixed

- [internal] Demo releases no longer request live-auth-only release credits on the public route.
- [internal] Demo audience fixtures are now deterministic, which removes hydration drift while keeping hot-reload parity stable.

## [26.4.154.1] - 2026-04-16

> Admins can now connect and promote a Spotify publisher account, configure playlist engine eligibility, and generate pending playlist reviews without enabling live automation.

### Added

- Added the Admin Platform Connections page with Spotify Publisher and Playlist Engine controls.
- Added admin system settings for playlist publisher and engine eligibility state.
- [internal] Added focused unit coverage for platform connection helpers, Spotify token lookup, cron gating, and the admin UI smoke path.

### Changed

- [internal] Playlist generation cron now uses the admin database toggle and eligibility interval instead of the playlist feature flag.
- [internal] Jovie Spotify token resolution now prefers the configured admin publisher and falls back to the legacy env system account when present.
### Fixed

- [internal] Moved playlist cadence persistence into the durable generation path so cron lease retries cannot create duplicate pending playlists after a partial success.
- [internal] Split the Admin Platform Connections client into smaller Spotify and engine tab components and resolved follow-up review comments around control labels and button state logic.
- [internal] Reduced hidden homepage hero rendering work to improve the public Lighthouse margin on the landing page.

## [26.4.154.0] - 2026-04-15

> Audience now explains fan activity with verified, source-aware language and trackable QR links.

### Added

- Added structured audience actions with evidence-safe sentence rendering, so Spotify, Apple, and YouTube clicks render as checked-out or opened activity instead of overclaiming listens or watches.
- Added creator-owned source groups and source links for QR and short-link attribution, so audience activity shows where scans and link visits came from.
- Added audience source creation and share actions from the existing dashboard share pattern: Copy Link, Open Link, and Download QR Code.
- [internal] Added `/s/[code]` redirects, UTM appending, scan counting, and missing-code handling for source links.
- [internal] Added tests for audience activity grammar, source-link code generation, audience table rendering, redirect behavior, and structured tracking expectations.

### Changed

- [internal] Updated audience click, visit, track, subscription, and activity-feed paths to write structured audience events while preserving legacy latest-action projections.
- Updated the audience table and member sidebar to show Source, Last Activity, tokenized activity language, and combined QR/UTM/referrer source rows.

### Fixed

- [internal] Fixed Source menu triggering in the Audience header by using a Radix-compatible header action button.
- [internal] Fixed QR PNG downloads by converting generated data URLs locally instead of fetching `data:` URLs blocked by CSP.

## [26.4.153.7] - 2026-04-16

> Artist Profiles now uses real Tim White profile screenshots for proof, with cleaner demo chrome and a more focused fan-capture story.

### Added

- [internal] Added Tim White profile screenshot scenarios and public exports for tour, pay, presave, live, video, subscribe, and listen states.
- [internal] Added generated Artist Profile section screenshots for the adaptive, outcomes, monetization, capture, opinionated, and setup sections.
- [internal] Added regression coverage for profile release drawer gating and UTC release-year rendering.

### Changed

- Reworked the Artist Profiles adaptive section around the “One profile. Adapts to every fan.” thesis with one-line mode pills and captured product shots.
- Rebuilt the Capture Every Fan section as a restrained audience-intelligence surface with opt-in action and slow audience rails.
- Updated the Built for artists spec wall with a Dedicated release pages tile.
- Updated the outcomes headline to “Built for artists.”
- Made the Artist Profiles FAQ keep only one item open at a time.
- Hid demo-only profile chrome from the Tim White marketing screenshots while keeping live public profile behavior unchanged.

### Removed

- [internal] Removed stale fake `artist-profile-mode-*` screenshot routes and exports.
- Removed the duplicated lower logo row from the Artist Profiles proof section.
## [26.4.153.6] - 2026-04-15

> Internal drawer inspector cleanup keeps the shared right-drawer foundation stable for follow-up UI work.

### Fixed

- [internal] Addressed drawer inspector review feedback around collapsible section state updates, card header alignment, client boundaries, and test placement.

## [26.4.153.5] - 2026-04-15

> The Artist Profiles final call-to-action now has more breathing room, so the closing claim section feels calmer and less cramped.

### Changed

- Increased the final Artist Profiles claim section spacing for a more generous closing layout.

### Fixed

- Fixed Profile navigation on chat routes so sidebar and mobile Profile clicks open the right drawer from preview-panel state without requiring a profile query parameter.
- Cleared stale chat preview data while profile drawer hydration is inactive so reopened drawers do not briefly show the previous profile.
- Added regression coverage for Profile nav click behavior, state-open drawer hydration, profile deep-link hydration, and inactive preview-data cleanup.

## [26.4.153.4] - 2026-04-15

> Release drawers now use compact inspector cards, and public profile releases now fail safely with timezone-consistent year rendering.

### Changed

- Reorganized the release drawer from tabs into a Linear-style inspector card stack with shared metadata row alignment.
- Public profile release fetch now uses a fail-safe helper so telemetry/reporting errors do not break page rendering.
- Release year extraction now uses UTC year semantics across profile and release matrix surfaces.
- Profile drawer release navigation now gates on visible navigable releases instead of raw release presence flags.

### Fixed

- Public release-lite query now returns an explicit public DTO and serializes release dates as ISO strings before crossing server-client boundaries.

## [26.4.153.3] - 2026-04-15

> Homepage demo proof now uses canonical featured artists, and the add-release CTA remains clearly visible on dark surfaces.

### Changed

- Homepage logo bar now renders as a bolder full-width black proof band with larger solid-white label logos.
- Refined the Artist Profiles spec wall into a quieter signal-router layout with flat accent icons and focused product-specific tiles.
- Updated Artist Profiles page copy for the 60-second setup section and real artist workflow proof heading.
- Updated homepage demo proof fallbacks to use Tim White, David Guetta, and Kaskade.

### Fixed

- Increased contrast on the add-release sidebar footer CTA so the Create Release button stays visible on dark surfaces.
- Isolated auth layout unit tests from ambient Doppler Clerk runtime keys so staging fallback assertions stay deterministic.

## [26.4.153.2] - 2026-04-15

> Dropdown menus are now more consistent across the app, with better search, keyboard behavior, and loading states. Drawer detail panes also have a cleaner shared layout for compact record details. Theme setup also happens earlier so pages avoid the brief visual mismatch on load.

### Added

- [internal] Shared drawer inspector card, stack, and fixed label/value grid primitives for Linear-style detail panes.
- Shared dropdown menus now support consistent loading, selected, active, danger, trailing content, count, and searchable nested states through the common dropdown primitive
- Recursive dropdown search now supports submenu-local filters, custom radio-item matching, and regression coverage for keyboard search flows

### Changed

- [internal] Common dropdown rendering is split into focused renderer, item renderer, type, and utility modules so future menu variants reuse the same styles and behavior
- Common dropdown, context menu, and submenu surfaces now draw from the same centralized menu style tokens

### Fixed

- Searchable dropdowns preserve keyboard access: Escape clears search before closing, arrow navigation can leave the search field, Enter can activate the first result, and clear keeps focus in the input
- Controlled dropdown close no longer emits duplicate empty search callbacks, while the legacy `onSearch` callback remains limited to non-empty queries
- Theme initialization runs before first paint without reintroducing the local hydration mismatch

## [26.4.153.1] - 2026-04-13

### Added

- Agent guardrail: "No Redundant Chrome" rule (4d) prevents AI agents from adding duplicate titles, headers, and card wrappers inside containers that already provide them
- Container lookup table mapping EntitySidebarShell, Sheet/Dialog, Card, DrawerSurfaceCard, and DashboardHeader to the chrome they provide
- Mechanical 4-step checklist for agents to verify container-aware design before PRs

### Changed

- Subtraction Principle (4b) now explicitly requires reading parent container chrome before building child components
- No AI-Slop rule (4c) now names specific parent surfaces (Sheet, Drawer, existing Card) instead of generic "every block"

## [26.4.153.0] - 2026-04-13

### Added

- Music video release type: artists can now create video releases that show an embedded YouTube player with email subscribe CTA on the release landing page
- YouTube URL parser and Data API metadata fetcher with graceful degradation
- Embed timeout-based error detection: redirects to artist profile on load failure, fires tracking beacon for broken video monitoring
- Demo seed data includes a Calvin Harris music video release for testing

### Changed

- Artist profile latest release now excludes music_video releases to keep the profile focused on email conversion
- Release filter counts and type styles updated to include music_video

## [26.4.152.1] - 2026-04-13

### Fixed

- Remove double logo on auth pages (hide Clerk's built-in logoBox, keep custom BrandLogo)
- Change sign-in/sign-up CTA button from purple to white with dark text

## [26.4.152.0] - 2026-04-12

### Added

- "Resend code" link on any OTP error with 30-second cooldown and inline confirmation
- Segmented birthday input with grouped [MM]/[DD]/[YYYY] digit boxes (replaces plain text input)
- `useSegmentedInput` shared hook powering both OTP and birthday digit inputs
- Birthday now captures the full year (stored as YYYY-MM-DD, backwards-compatible with legacy MM-DD)
- Wire `processTipCompleted` into Stripe checkout webhook, enabling fan audience tracking and thank-you emails for every completed tip
- Stripe Connect money routing: tips now flow directly to creators with active Connect accounts, with live account verification and platform fee retention
- Venmo pixel tracking: `VenmoTipSelector` now fires `venmo_link_click` events (previously fired nothing)

### Changed

- Venmo clicks fire `venmo_link_click` instead of `tip_intent` to distinguish unverifiable Venmo link opens from Stripe payment intents in analytics
- Profile query in tip checkout now includes `stripeAccountId` and `stripePayoutsEnabled` fields

### Fixed

- OTP verification: expired or invalid codes no longer allow submitting (all subscribe components)
- OTP auto-clears after error so fans get a fresh slate to retype
- Step transitions in the inline subscribe flow are tighter and smoother (~370ms down to ~240ms)
- `processTipCompleted` (fan audience upsert + thank-you email) was dead code with zero callers, now wired into the checkout webhook with error isolation

## [26.4.151.6] - 2026-04-12

> Releases page filtering now works: tracks/releases toggle switches the table view, all 7 release types appear in the filter dropdown, and filter badge counts stay stable when filters are applied.

### Fixed

- Wire up the tracks/releases segment control to actually switch between `ReleaseTable` and `ReleaseTableWithTracks`
- Add missing release type filter options (Live, Mixtape, Other) to match all 7 `ReleaseType` values
- Compute filter badge counts from unfiltered releases so numbers stay stable when filters are applied
- Sync tracks view toggle with `localStorage` preferences so the selection persists across page loads

## [26.4.151.5] - 2026-04-12

> Centered action menu icons in the sidebar and task list, and fixed stale release drawer persisting when switching tasks.

### Fixed

- Vertically center the three-dot action menu in sidebar nav items using transform instead of fixed pixel offsets
- Vertically center the overdue badge relative to the action button in task list rows
- Close the release sidebar when switching tasks so the drawer doesn't persist without context

## [26.4.151.4] - 2026-04-12

### Fixed

- Handle `DYNAMIC_SERVER_USAGE` error in root layout so public profile pages can use ISR with `revalidate` without crashing the build

## [26.4.151.3] - 2026-04-12

> Agents now verify verifiable claims before acting, reducing drift from stale assumptions.

### Added

- [internal] Agent guardrail: "Verify before trusting" rule added to AGENTS.md — agents now verify user claims before acting on them

## [26.4.148.1] - 2026-04-12

### Removed

- Delete 23 dead loading skeletons on redirect-only routes that never rendered
- Remove orphaned `WaitlistSkeleton` component and Storybook story
- Remove unused `BrandingSettingsLoading`, `NotificationsSettingsLoading`, and `BillingSettingsLoading` exports

### Fixed

- Fix infinite page refresh loop on release pages when countdown expires (affects ScheduledReleasePage, MysteryReleasePage, PreSaveActions, ProfileCompactTemplate)
- Show specific handle validation errors during onboarding instead of generic "Not available" for all failures
- Rewrite retargeting-ads loading skeleton to match actual page layout (summary cards, ad group grids, instructions)
- Rewrite blog index loading skeleton from timeline to featured post + 2-column grid layout
- Replace billing success/cancel `AuthLoader` skeletons with page-matching celebration and cancel layouts
- Add missing ad-pixels section skeleton to audience settings loader
- Fix billing settings loader description text ("Subscription" to "Plan")

## [26.4.148.0] - 2026-04-11

### Fixed

- Eliminate chat message flickering by skipping entrance animation on messages loaded from persistence
- Rewrite chat skeleton loader to match actual message layout (circular logo above bubble, correct border styling)
- Cap chat thread and input width at 44rem to prevent overly wide layouts on large screens

### Changed

- Chat copy buttons now show icon-only with circle background only on hover, matching the sidebar toggle pattern
- Replace top-right Copy Session ID button with an ellipsis dropdown menu containing Copy and Archive actions

## [26.4.147.0] - 2026-04-11

### Fixed

- Gracefully handle missing Clerk middleware context on `/api/images/upload` instead of throwing unhandled errors (Fixes JOVIE-WEB-JC)
- Add CSP `media-src` directive to allow audio previews from Spotify, Apple Music, and Deezer CDNs, and video from Vercel blob storage (Fixes JOVIE-WEB-JD)

### Added

- Centralized media CDN domain registry (`PLATFORM_MEDIA_DOMAINS`) alongside existing image CDN registry, so CSP stays in sync when new providers are added
- AGENTS.md guardrail requiring CSP domain updates go through the CDN registry, not direct CSP edits

## [26.4.146.3] - 2026-04-11

### Changed

- Standardize badge styling across settings pages to use Badge component variants instead of custom inline classes
- Add CheckCircle icon to "Verified" badge in Connected Accounts for consistency with Email section
- Convert raw `<span>` "Current session" badge to Badge component in Session Management
- Correct theme selector card border radius from 12px to 10px in Appearance settings

## [26.4.146.2] - 2026-04-11

### Fixed

- Pass CSP nonce from middleware to theme-init Script in root layout, fixing hydration mismatch on authenticated pages
- Suppress expected hydration warning on smart link URLs where server/client origins intentionally differ

## [26.4.146.1] - 2026-04-11

### Changed

- Normalize settings typography: descriptions from 13px to 12px in SettingsActionRow and SettingsToggleRow
- Align SettingsPanel title letter-spacing to -0.02em to match row components
- Override SettingsSection header to 13px/font-[540] with 12px descriptions via new PageHeader pass-through props
- Moved playlist pages from `(marketing)` to `(dynamic)` route group so ISR pages with DB queries no longer violate the static marketing page contract
- Added dedicated playlist layout to preserve site header, footer, and dark theme styling

## [26.4.146.0] - 2026-04-11

### Fixed

- Staging auth routes (/signup, /signin) returning 500, blocking CI canary health gate since April 8
- Detect production Clerk keys on staging and skip middleware instead of crashing on domain mismatch
- Add try-catch safety net around staging Clerk middleware call
- Fix auth layout tests missing CLERK_SECRET_KEY in test environment
- Gate x-clerk-publishable-key header injection on both PK and SK presence

## [26.4.145.2] - 2026-04-11

### Fixed

- Fixed territory badge border token in ContactDetailSidebar — replaced `border-(--linear-app-frame-seam)` (divider token) with `border-subtle` (card-level token) to match release sidebar badge pattern
- Standardized dashboard elevation tokens to 3-tier system (DataCard, EmptyState, banners, empty state icons)
- Added card wrapper to audience funnel stats (Profile Views, Unique Visitors, Followers)
- Removed double shadow on chat input that caused visible border artifact
- Fixed drawer card clipping from oversized 18px border radius
- Improved smart link URL contrast from tertiary to secondary text color
- Removed directional shadow-card from drawer/sidebar cards to fix uneven border weight
- Centered empty state text with contextual icons in analytics sidebar tabs

## [26.4.145.1] - 2026-04-10

### Fixed

- Bumped `next` 16.2.1 → 16.2.3 across all apps to fix Server Components DoS vulnerability
- Bumped `drizzle-orm` override to 0.45.2 to fix SQL injection via improperly escaped identifiers
- Bumped `vite` override to ^6.4.2 to fix arbitrary file read and path traversal (dev-only)
- Bumped `basic-ftp` override to ^5.2.2 to fix FTP command injection via CRLF (dev-only)
- Bumped `lodash` override to >=4.18.1 to fix code injection and prototype pollution
- Added overrides for `lodash-es`, `handlebars`, `@xmldom/xmldom`, and `brace-expansion` to remediate transitive dependency vulnerabilities

## [26.4.145] - 2026-04-10

### Changed

- Normalized audience JSONB arrays (referrer history, actions) into relational tables for query performance and schema safety
- Made `url` column on `audience_referrers` NOT NULL since the write path already guards against null values
- Populated the `source` field from referrer URL hostname on every referrer insert
- Removed redundant `onConflictDoNothing()` on referrer inserts where no unique constraint exists

### Fixed

- Profile nav button now toggles the right drawer open and closed instead of only opening it

## [26.4.144.1] - 2026-04-10

### Added

- "Create a new release" suggestion on the empty chat state, shown as the first option for both new and returning users

### Fixed

- Checkboxes now properly toggle when clicked, fixing broken indeterminate state handling that prevented "select all" from working correctly in tables
- Indeterminate checkboxes now show a minus icon instead of a checkmark, matching standard UI conventions
- Checkbox alignment fixed in admin creator profile rows (was rendering at top-left instead of centered)
- Screen readers can now access table checkboxes (removed `aria-hidden` from interactive containers)

### Changed

- All checkbox instances now use the central design system component without custom style overrides, ensuring consistent appearance across admin, audience, and dashboard tables

## [26.4.144] - 2026-04-10

### Added

- Chrome extension support for AWAL (workstation.awal.com) and Kosign (app.kosignmusic.com) alongside DistroKid
- Autofill button in extension sidebar that fills distributor/publisher forms from Jovie release data
- Bulk-insert content script handler with React-compatible nativeInputValueSetter for framework-controlled inputs
- React Select async dropdown handler for AWAL's Project Artist field (type, wait, select)
- Undo button to revert autofilled fields to previous values
- Label-alias mapping so Jovie entity fields (Release Title, Display Name) map to platform form labels (Project Name, Project Artist)
- Slugified project code derivation from release title for AWAL

### Changed

- Extension domain infrastructure refactored for multi-distributor support (DRY classifyPage reads from shared DOMAIN_CONFIGS)
- Shell copy updated from DistroKid-specific messaging to generic distributor language
- DistroKid domain mode changed from read to write (pre-launch, no existing users)

## [26.4.143] - 2026-04-10

> Unreleased content pages now capture fan emails instead of showing a dead-end "Coming Soon" card. Smart link errors show the right message, OG images generate faster, and profile copy is tighter across all modes.

### Added

- Email notification signup on countdown pages for unreleased releases, with countdown timer and share button
- Error and 404 boundaries for smart link routes so errors say "Content not found" instead of "Profile is temporarily unavailable"
- Unit tests for the redesigned countdown page

### Changed

- "Choose a Service" → "Listen now" and "Tip with Venmo" → "Send a tip" in profile mode subtitles
- "Drops in" → "Releases in" on countdown timers
- OG image base64 encoding uses chunked conversion instead of char-by-char concatenation
- Extracted shared profile mapper to eliminate duplicate CreatorProfile construction
- Moved promo download check from inline dynamic imports to a shared data function

### Fixed

- OG images no longer bypass the 2MB size guard when upstream servers omit Content-Length headers
- Empty countdown container no longer renders when release date has passed (uses CSS empty:hidden)
- Notification subscribe on profile pages now shows the OTP verification input after email submission instead of staying stuck on the email field

## [26.4.142] - 2026-04-10

> YC demo recordings now stay coherent from the dashboard to the public smart link, with real analytics data and cleaner scene transitions. Also keeps fresh worktrees bootstrappable even when local Homebrew metadata is broken.

### Changed

- Made the YC recorder use the canonical auth bypass flow, deterministic seeded releases, and stricter scene readiness gates so the exported demo follows one consistent release story
- Pinned the demo recorder to `127.0.0.1` and switched contact-sheet capture to stable scene timestamps so the review artifact reflects the polished video instead of transition cuts
- Hardened `scripts/setup.sh` so failed Homebrew or Doppler installer calls degrade into clear missing-tool reporting instead of aborting the whole bootstrap
- Added a standalone ripgrep fallback that downloads and verifies a supported release into `$HOME/.local/bin` when package-manager installation paths fail, with guidance for keeping that path available in future shells

### Fixed

- Restored release sidebar analytics during demo runs by forwarding bypass-auth context through the client fetch and resolving the same demo profile in the analytics route
- Removed captured loading shells, stale row selection drift, and clipped late-scene captions from the exported YC demo video
- Prevented `./scripts/setup.sh` from failing on macOS worktrees when Homebrew reports `/opt/homebrew/opt/node@22 is not a valid keg` during prerequisite installs
- [internal] Synced the canonical version file, `version.json`, and workspace package versions to `26.4.142`

## [26.4.141] - 2026-04-09

> Claim-invite emails now read more like a real note from Tim, and they avoid awkward fake personalization when an artist name looks like a handle instead of a real first name.

### Added

- Focused regression coverage for claim-invite greetings across safe real names, handles, symbols, emoji, accented names, and generic follow-up fallbacks
- [internal] Added repo guardrails and lessons so outbound email personalization fails safe by default

### Changed

- Rewrote the artist claim-invite and follow-up emails in a more personal founder voice with a softer feedback-first ask
- Only personalize claim-invite greetings when the creator string clearly looks like a real first-and-last name, including accented names; otherwise fall back to a generic opener
- [internal] Synced the canonical version file, `version.json`, and workspace package versions to `26.4.141`

## [26.4.140] - 2026-04-09

> Make the app's right-side drawers feel like one product again by flattening stray chrome, unifying shell structure, and turning release playback into a simpler tracks list.

### Added

- Focused regression coverage for the shared drawer shell, add-release flow, release tracks list, dashboard header chrome, and right-drawer focus behavior

### Changed

- Unified dashboard, admin, and demo entity drawers on the shared right-drawer shell so headers, cards, tabs, and footer actions use one calmer layout model
- Simplified the add-release drawer into a preview card, an in-card details form, and a flat pinned create action while keeping the release-creation flow intact
- Renamed the release drawer's `Playback` tab to `Tracks` and reduced it to a flat track list that hands actual playback off to the persistent bottom audio bar
- [internal] Synced the canonical version file, `version.json`, and workspace package versions to `26.4.140`

### Fixed

- Removed stray divider, border, and wrapper chrome under dashboard header actions and other shared page toolbars so the top of each page stays flat
- Eliminated the drawer-container focus ring leak and kept one-click close affordances visible in the refactored card action bars
- Standardized drawer card borders so preview and details surfaces use one consistent perimeter border instead of stacked seams

## [26.4.139] - 2026-04-09

> Keep the subscribed notifications state inline on compact public profiles so the CTA does not collapse into passive copy and keyboard users land directly in preferences.

### Added

- Focused regression coverage for the compact profile subscribed-state CTA and notifications drawer handoff

### Changed

- Replaced the compact profile's passive subscribed copy with an inline `Notifications on` button that preserves the CTA footprint and opens preferences
- Wired the compact public profile subscribed-state CTA directly into the existing notifications drawer, including keyboard tab focus behavior without reopen loops
- [internal] Synced the canonical version file, `version.json`, and workspace package versions to `26.4.139`

## [26.4.138] - 2026-04-08

> Finish the remaining design-system audit work by consolidating marketing surfaces, extracting shared public-surface shell primitives, and locking the live public profile path to the canonical compact template.

### Added

- Shared marketing primitives for page shells, section intros, metric cards, and surface cards
- Route-local `/new` marketing sections built on the shared marketing layer
- Shared public-surface shell primitives for ambient background, stage framing, header layout, and footer safe-area spacing
- Focused regression coverage for the canonical `ProgressiveArtistPage -> StaticArtistPage` path

### Changed

- Normalized `/new`, `/artist-profiles`, `/pricing`, `/launch`, and `/launch/pricing` onto the shared marketing page shell
- Moved `SmartLinkShell` and `ProfileShell` onto the shared public-surface shell family
- Kept live public profile rendering on `StaticArtistPage -> ProfileCompactTemplate` and soft-demoted legacy animated and V2 profile templates
- Updated design-token and component-architecture docs to describe the real surface families and canonical route contract
- [internal] Synced the canonical version file, `version.json`, and workspace package versions to `26.4.138`

## [26.4.137] - 2026-04-08

> Add a repo-owned canonical surface contract for the four design-system surfaces that actually exist on fresh `main`.

### Added

- `apps/web/lib/canonical-surfaces.ts` as the typed source of truth for `homepage`, `public-profile`, `release-landing`, and `dashboard-releases`
- `docs/CANONICAL_SURFACES.md` documenting the live routes, review routes, screenshot IDs, owners, and exclusions for the canonical surfaces
- Static invariant coverage that locks the current screenshot IDs, review routes, and redirect-only exclusions for the canonical surface registry

### Changed

- [internal] Synced the canonical version file, `version.json`, and workspace package versions to `26.4.137`

## [26.4.136] - 2026-04-07

> Strengthened signup, onboarding, and ingest regression coverage so breakage is caught earlier in CI and after deploys.

### Added

- Direct unit and integration coverage for onboarding completion, onboarding discovery, welcome chat bootstrap, and signup lead attribution
- [internal] Deterministic signup funnel smoke coverage uses the local auth-bypass flow so CI catches breakage before real auth providers are in the loop

### Changed

- Expanded signup, onboarding, creator-ingest, ingestion job, and admin ingestion tests to cover key negative paths and persistence behavior
- [internal] Pointed smoke and overnight QA selectors at the new signup funnel and onboarding completion coverage so the merge gate watches the real conversion path
- [internal] Added `/signup` to the CI and canary health checks for post-deploy visibility into signup outages
- [internal] Synced the canonical version file and workspace package versions to `26.4.136`

### Fixed

- Workspace archive cleanup now always prunes stale git worktree metadata immediately (`git worktree prune --expire now`), even when `.claude/worktrees` is missing

## [26.4.135] - 2026-04-07

> Fold Spotify algorithm diagnosis into the creator sidebar, eliminate misleading empty-score states, and document the local `ripgrep` prerequisite for fresh worktrees.

### Added

- An `Algorithm` tab in the admin creator sidebar with a verdict-first view, confidence, next actions, warnings, and an on-demand compared-artists list
- Focused API and sidebar test coverage for ready, unavailable, and no-Spotify-link states

### Changed

- Spotify Fans Also Like analysis now returns explicit `ready`, `empty`, or `unavailable` states with verdict metadata, timestamps, and attempted-versus-resolved artist counts
- Admin algorithm analysis now resolves context from creator-linked Spotify profiles instead of asking operators for a raw artist ID
- Documented `ripgrep` as a local prerequisite in the getting-started guide
- Added `ripgrep` install commands for macOS and Ubuntu/Debian after the initial workspace bootstrap step
- Taught `setup.sh` to verify `rg` and auto-install it on supported local environments

### Fixed

- Spotify error pages and scrape failures now surface as unavailable diagnostics instead of a misleading `0%` score
- The legacy `/app/admin/algorithm-health` route now redirects into the creators workspace

### Removed

- The standalone Admin Algorithm Health utility surface from admin navigation and admin snapshot coverage

## [26.4.134] - 2026-04-07

> Automated playlist network engine: LLM-curated Spotify playlists as an inbound artist acquisition channel.

### Added

- Automated playlist generation using AI to create niche, searchable music collections featuring Jovie artists
- Public playlist pages and genre/mood discovery hubs for organic growth
- Admin approval workflow for generated playlists before publishing
- Daily automated playlist creation with compliance-safe cadence controls
- Sitemap integration for published playlists
- [internal] LLM curation pipeline uses Claude (Haiku concept generation, Sonnet sequencing) with Spotify discovery, Sharp cover rendering, and publish orchestration
- [internal] Marketing playlist routes are implemented at `/playlists` and `/playlists/[slug]` with structured data support
- [internal] Admin moderation route is implemented at `/admin/playlists`
- [internal] Spotify OAuth for the system account is coordinated via Clerk with health checks and Sentry alerting
- [internal] Daily cron trigger runs at 6 AM UTC behind the `PLAYLIST_ENGINE` feature flag
- [internal] Playlist persistence uses `jovie_playlists` and `jovie_playlist_tracks` tables with supporting indexes
- [internal] Added a repo-local `stitch` MCP server entry in `.mcp.json`
- [internal] Configured the Google Stitch MCP endpoint to read the `X-Goog-Api-Key` header from `GOOGLE_STITCH_API_KEY` for local agent tooling

## [26.4.133] - 2026-04-07

> Restore settings-page scrolling and clean up duplicate app-name page titles across marketing and legal routes.

### Fixed

- Settings pages now use page-level scrolling again inside the app shell
- Added a regression unit test to keep the settings layout on the correct scroll mode
- Removed duplicate app-name suffixes from affected marketing and legal page titles while preserving branded social metadata
### Changed

- The top-left Jovie mark on public artist profiles now links to the artist profiles landing page instead of acting as decorative chrome
- [internal] Added a unit test that locks the public-profile logo destination to the artist profiles route

## [26.4.132] - 2026-04-07

> Higher resolution profile photos on artist pages and sharper hero images on retina displays.

### Changed

- Ingestion pipeline preserves full Spotify image resolution (was downscaling 640px to 512px)
- Avatar AVIF quality raised from 65-70 to 80 across upload and ingestion pipelines
- Added 1024px avatar download size for retina hero display
- Profile photo size mappings updated: large=1024px, medium=512px
- Next.js image optimizer now serves 1024px breakpoint
- Profile refresh now re-fetches unlocked DSP-sourced avatars through the higher-quality pipeline

## [26.4.131] - 2026-04-06

> Fix broken legal page anchor links, inaccurate cookie policy text, and add Lighthouse CI budgets for all legal pages.

### Fixed

- In-page anchor links on Terms page now scroll to the correct section (removed remark-html double sanitization that prefixed heading IDs with `user-content-`)
- Cookie Policy no longer references a non-existent "Cookie settings" footer link (updated to match the actual "Manage" button in the consent bar)

### Added

- Cookie Policy link in the site footer alongside Privacy and Terms
- Blocking Lighthouse CI budgets for all three legal pages (performance, accessibility, SEO)
- Legal page path patterns trigger Lighthouse CI on content changes
- Regression tests for markdown heading ID and anchor link resolution

## [26.4.128] - 2026-04-06

> Unified design system across release smart links, presave pages, sounds pages, and artist profiles.

### Added

- Unified profile drawer: single persistent drawer with animated crossfade between menu, about, listen, contact, tip, tour, subscribe, and notification views
- Credits drawer using shared ProfileDrawerShell with sentence case labels
- "Use this sound" menu item on release pages (links to sounds page)
- Dev preview page at `/dev/smart-links` showing all 3 page types side-by-side with stress test data (20 DSPs, long titles)
- Submit button animation: arrow fades to spinner on email submit, input text fades out simultaneously
- Inline notification reveal from menu: "Turn on notifications" closes drawer and focuses the email input on the page

### Changed

- Release, presave, and sounds pages now use the same profile card shell (ambient background, card container, top bar, drawers)
- DSP buttons are pill-shaped (rounded-full) across all smart link pages
- Provider list is flat (removed "More ways to verify" collapsible sections)
- Notification preference toggles use Apple-style green switches instead of dots
- About section flattened (removed card wrapper, borders, shadows)
- Contact channel icons are flat by default with hover circle (no permanent border/bg)
- Drawer headers left-aligned with optional back button matching close button style
- Drawer body has min-height to prevent shrinking between views
- Countdown display: large prominent numbers with faded uppercase D/H/M units
- Hero artwork uses fixed aspect-[4/3] on mobile so content area scrolls
- Content area scrolls independently, "Powered by Jovie" footer pinned at bottom
- Homepage section heading updated
- Homepage footer flattened (transparent, dimmer text, no border)
- Notification input text size matches button (15px)

### Fixed

- About button hidden in profile menu when no about content exists
- Zero layout shift between notification button and email input states

## [26.4.130] - 2026-04-06

> Add standalone DMCA policy page and legal links on public artist profiles.

### Added

- Standalone DMCA policy page at `/legal/dmca` with takedown procedure, counter-notice process, and designated agent
- Privacy and Terms links now appear in the footer of all public artist profiles

### Fixed

- Profile footer no longer disappears entirely when artist hides branding, legal links always render
- ProfileFooter now renders on public profile pages (was missing from the compact template)

## [26.4.129] - 2026-04-06

> Tighten Lighthouse and Playwright performance budgets for public profiles and onboarding to Gmail-rule targets. Convert 2 presentational components to server components for reduced JS bundle.

### Changed

- Profile route Lighthouse budgets tightened: FCP 800ms, LCP 1500ms, TBT 100ms, CLS 0.05, perf score 0.95 (as `warn`, promote to `error` after stability)
- Onboarding route Lighthouse budgets tightened: FCP 1000ms, LCP 1500ms, TBT 200ms, CLS 0.05, perf score 0.90
- Profile Playwright budgets tightened in both `performance-budgets.config.js` and `performance-route-manifest.ts`
- Lighthouse CI now runs 3 passes (was 1) for more stable measurements
- Added `/tim` profile page to Lighthouse CI URL collection

### Fixed

- `ProfileFeaturedCard` and `ProfileViewportShell` converted from client to server components (reduced profile JS bundle)

## [26.4.128] - 2026-04-06

> Remove visual borders from sidebar edge, right drawer seam, and audience filter pill group for a cleaner dashboard layout.

### Fixed

- Sidebar no longer shows a visible right border against the main content area
- Right drawer entity card no longer has a left border line
- Audience filter pills (All/Identified/Anonymous) no longer wrapped in a bordered container

## [26.4.127] - 2026-04-06

> Unified drawer and shell surfaces into a strict three-tier elevation model for consistent visual hierarchy. Right-drawer behavior now matches desktop/mobile layering expectations. Surface token docs corrected for dark mode parity.

### Changed

- [internal] Unified surface elevation to a strict 3-tier model matching Linear.app (page bg → content card → drawer cards)
- [internal] Drawer cards now show proper Tier 2 chrome (border ring + shadow-card + 10px radius) in both light and dark mode
- [internal] Right drawer is transparent on desktop (inherits from main content area), uses content surface on mobile overlay
- [internal] Removed all `color-mix()` surface background formulas from drawer and shell components
- [internal] Removed `surfaceTone` quiet variant — all drawer content uses consistent Tier 2 card treatment
- [internal] Fixed dark mode surface-1 token value in DESIGN.md (#1c1c1f → #17171a to match linear-tokens.css)

> World-class SEO for public profiles, releases, and tracks. Hero-style OG images with artist photos, single @graph JSON-LD with ProfilePage/MusicGroup/MusicEvent/MusicAlbum/MusicRecording schemas, and Google Events integration for tour dates.

### Added

- Hero-style OG images for artist profiles, featuring the artist's actual photo with dark gradient overlay, Jovie branding, and genre tags
- ProfilePage structured data wrapping MusicGroup for better Google rich results
- MusicEvent JSON-LD for tour dates (capped at 10) with venue, ticket, and status data for Google Events
- ListenAction on profiles, releases, and tracks linking to streaming platform URLs
- Track list schema on release pages (MusicAlbum.track ItemList) for Google track listings
- Duration (ISO 8601), ISRC codes, and track position in MusicRecording schemas
- Credits (producer, composer, lyricist) in MusicAlbum structured data
- Profile avatar images in sitemap entries for Google Image Search
- Single @graph JSON-LD arrays across all public page types
- Enhanced meta tags: geo.placename, music:album, music:duration

### Changed

- Consolidated dual OG image system (file convention replaces /api/og/ route)
- Profile, release, and track pages now use single @graph JSON-LD instead of separate script tags
- Track page metadata enriched to match release page quality (keywords, robots, authors)

### Fixed

- Presence page now shows error state when dashboard data fails to load instead of a blank screen
- Releases page now shows error state when query fails instead of a blank screen

### Removed

- Dead /api/og/[artistSlug] route (replaced by opengraph-image.tsx file convention)
- Unused og-image.ts helper and its tests

## [26.4.125] - 2026-04-05

### Fixed

- Audience city names now display properly instead of URL-encoded (`Los Angeles` not `Los%20Angeles`)
- DSP presence page shows all platform names instead of "View on undefined" for 14 previously missing providers (FLO, Gaana, KKBOX, LINE MUSIC, NetEase, QQ Music, and more)

### Changed

- Upgraded gstack tooling to v0.15.11.0

## [26.4.124] - 2026-04-05

> Admin table search now filters instantly on the client, eliminating server round-trips and skeleton loaders. Keyboard navigation is unified across all tables via a single shared key map.

### Changed

- Table search now filters instantly on the client instead of round-tripping to the server with skeleton loaders
- All admin tables (users, creators, releases, leads) use the same search pattern: HeaderSearchAction + TanStack Table globalFilter
- Keyboard navigation (j/k, arrows, Home/End) now shares a single key map across all tables and the tasks view
- Admin infinite queries keep previous data visible during refetch instead of flashing skeletons

### Removed

- Unused admin TableSearchBar duplicate
- Server-side search round-trips from admin table search inputs

## [26.4.123] - 2026-04-05

### Fixed

- Inline editable fields (ISRC, UPC, Label) no longer shift the layout when entering or exiting edit mode

## [26.4.122] - 2026-04-05

> Audio player now lives in a persistent bottom bar that stays visible across all dashboard and admin pages, even when the sidebar is collapsed or hidden on mobile. Includes dismiss, loading state, and safe-area clearance for notched devices.

### Changed

- Audio player moved from the sidebar to a persistent bottom bar inside the main content area
- Player stays visible when the sidebar is collapsed or hidden on mobile

### Added

- Dismiss button (X) to clear the audio player
- Loading state with pulsing indicator and disabled seek bar
- Safe-area-aware mobile clearance for notched devices

### Removed

- `NowPlayingCard` from sidebar (replaced by bottom bar)

## [26.4.121] - 2026-04-05

> Catalog scan moves from a dedicated page into the Presence page as an inline triage section. One click per mismatch instead of four.

### Changed

- Catalog scan is now a collapsible "Catalog Health" section inside the Presence page, not a standalone page
- Mismatch triage uses card-stack UI with "Mine" / "Not Mine" buttons and 3-second undo window
- Cards show album art (clickable to Spotify), track name, artist, and album for confident decisions
- Section auto-expands when unresolved mismatches exist, collapses to a one-liner when clean
- "Not in catalog" mismatches show as triage cards, "missing from Spotify" items show as an info row
- Post-triage summary persists with a link to Spotify's content mismatch form

### Added

- Auto-scan triggers on first Spotify match confirmation (no manual scan needed)
- Bulk dismiss button appears when 10+ mismatches need review
- Keyboard navigation and screen reader announcements for card triage

### Removed

- Dedicated catalog scan page (now redirects to Presence)
- "Catalog Scan" sidebar navigation item (5 nav items instead of 6)

## [26.4.120] - 2026-04-05

> Faster releases navigation and lighter loading placeholders improve perceived speed across all dashboard tables.

### Changed

- Releases page now prefetches on hover so navigation feels instant
- Reduced table skeleton from 25 rows to 10 across all dashboard tables (releases, audience, contacts, tour dates)
- Removed phantom skeleton header card that didn't match the real page layout

## [26.4.119] - 2026-04-05

> Homepage proof is now real. Every screenshot comes from the actual product, reproduced by the Playwright pipeline. The hero uses a Spotlight Depth layout with a dominant profile phone and atmospheric glow.

### Changed

- Replaced fabricated homepage proof with canonical product screenshots from deterministic demo surfaces
- Implemented Variant F Spotlight Depth hero: dominant profile phone in front, blurred release card behind for depth, atmospheric blue-violet glow, task panel anchored bottom-right
- Simplified release destinations to mobile-only "Before Launch" / "After Launch" side-by-side layout
- Enforced hero headline as exactly two lines via structural markup instead of CSS text-wrap hacks
- Updated page metadata and JSON-LD schemas to reflect "release operating system" positioning
- Increased trust bar logo opacity from 45% to 55% for better legibility
- Unified all pricing constants into a single source of truth (`lib/config/plan-prices.ts`)
- Billing, marketing, and upgrade flows now derive prices from one shared file instead of maintaining independent copies
- Added `toCents()` helper with `Math.round` for safe dollar-to-cent conversion

### Added

- Evergreen presave demo surface for homepage proof screenshots
- [internal] Homepage proof manifest system with registry validation
- [internal] Mobile release screenshot scenarios in the pipeline
- [internal] Pricing invariant tests (tier ordering, annual discount, float safety)

### Removed

- Hero notification pill
- Desktop screenshots from the release destinations section
- Release destinations notification card overlay

## [26.4.118] - 2026-04-05

> Admin tables cleaned up: fewer redundant badges, visible checkboxes, always-on search. Public profile pages now fit the mobile viewport.

### Changed

- Merged Funnel, Status, and Lifecycle columns into a single Status column on the admin users table (12 to 10 columns)
- Search fields on admin Users, Creators, and Releases pages are now always visible instead of hidden behind an icon

### Added

- Staggered cascade animation when generating a release plan: category groups fade in sequentially, tasks slide in from left with blur-to-sharp effect
- Typewriter reveal for AI-generated playlist pitches with animated sparkle icon and blinking cursor
- Platform tab switching re-triggers typewriter animation for each DSP pitch

### Fixed

- Table checkboxes are now visible in their unchecked state (removed override that made borders nearly invisible)
- Public profile pages no longer scroll on mobile — viewport locks to screen height, hero image shrinks to fit

## [26.4.117] - 2026-04-05

> The Growth admin page is now a self-driving pipeline dashboard. Pick a speed, watch the funnel, inspect leads if curious.

### Changed

- Replaced the 4-tab Growth admin page (Leads/Outreach/Campaigns/Ingest) with a single-screen pipeline dashboard
- Speed dial (Off/Test/Normal/Fast) replaces 15+ individual pipeline controls with one-click presets
- Pipeline funnel visualization shows all-time status counts with drop-off percentages and 30-day conversion metrics
- Lead table filter tabs now display status counts inline (e.g. "Qualified (145)")
- Tools, advanced settings, and outreach/campaigns are tucked into three collapsible accordion sections
- Backward-compatible deep links auto-open the corresponding accordion section

### Fixed

- Removed server-only import boundary violation in admin growth page collapsibles

## [26.4.116] - 2026-04-04

> App shell layout, chat UX, and dark mode visual refinements to close the gap with Linear's polish.

### Fixed

- App shell missing top gap on desktop (CSS cascade: base `pt-[env()]` overriding `lg:p-[var()]`)
- Sidebar profile dropdown clipping at the content border junction
- Chat thread constrained to narrow column instead of using full content width

### Changed

- Empty state vertically centered with input as optical anchor (no layout shift when suggestions change)
- Suggestions container narrowed to `max-w-md` for visual hierarchy below the input
- Dark mode shell borders and shadows reduced for subtler elevation (closer to Linear)
- [internal] Sidebar `overflow-hidden` changed to `overflow-clip` to prevent positioned element clipping
- [internal] Scroll container in AppShellFrame now `flex flex-col` for proper height propagation
- [internal] Skeleton loading shell matches AppShellFrame desktop padding

## [26.4.115] - 2026-04-04

> Added workflow linting to CI so broken GitHub Actions YAML gets caught before it hits production.

### Added

- Actionlint GitHub Actions workflow (`actionlint.yml`) validates all workflow YAML on every push and PR
- SHA-pinned actions for supply-chain security, explicit permissions, and 5-minute timeout

## [26.4.114] - 2026-04-03

> Tightened compact dropdown styling to canonical design tokens and refreshed gstack skill docs to the latest generated templates.

### Changed

- Updated `MENU_ITEM_COMPACT` and `DROPDOWN_CONTENT_COMPACT_BASE` in `packages/ui/lib/dropdown-styles.ts` to use `--linear-*` radius, surface, border, and text tokens for consistency with the Linear token system
- Updated compact dropdown tests to assert compact padding semantics directly in `packages/ui/lib/dropdown-styles.test.ts`
- [internal] Regenerated gstack skill documentation updates in `.claude/skills/gstack/{checkpoint,design-html,health,learn}/SKILL.md`

## [26.4.113] - 2026-04-03

> Public profiles ship the V2 template globally: immersive hero, content-aware section ordering, share button, and a batch of reliability fixes that make profiles load faster and stay fresher.

### Added

- Share button in V2 hero with `navigator.share()` on mobile and clipboard fallback on desktop, with check-icon success feedback
- "View as visitor" button in artist profile settings linking to the public profile
- `generateStaticParams` for featured artist profiles, pre-rendering up to 100 at build time
- Server-side tour date sorting (removed client-side useMemo)
- 3-second timeout on OG image data fetch with reliable fallback to branded Jovie card
- `requestIdleCallback` deferral for profile view tracking to avoid blocking first paint

### Changed

- Enabled `PROFILE_V2` and `LATEST_RELEASE_CARD` feature flags (V2 template is now the default for all public profiles)
- Tour dates are now always fetched regardless of template version (non-blocking with error fallback)
- Profile scroll body reordered: Featured Content, Tour, Subscribe, Connect, About, Follow (previously Subscribe was first)
- V2 hero shows 3 social links (up from 2) alongside Share and Notify buttons
- Bio truncation threshold increased from 190 to 300 characters and 3 to 5 lines before "Read more"
- Renamed social links section from "Elsewhere" to "Follow"
- Hero image sizes tightened from 3-breakpoint to 2-breakpoint for better mobile image optimization
- Profile skeleton rewritten to match V2 full-bleed hero layout (prevents layout shift on cold loads)
- Dashboard header no longer shows a shadow line between the header and content area
- Content shell spacing is now visually consistent on all edges
- Tasks toolbar sits as a full-width subheader matching the dashboard header height
- Task list rows have tighter left padding for better density
- Priority indicators use signal bars that fill proportionally (urgent=4, high=3, medium=2, low=1) instead of uniform colored dots
- Overdue badge is now hidden on cancelled tasks
- Playback stats use plain language: "linked" instead of "canonical", "unconfirmed" instead of "fallback", "pending" instead of "unknown", and zero counts are hidden

### Fixed

- `ProfileFeaturedCard` now receives actual tour dates instead of empty array, restoring tour CTA
- `unstable_cache` double-fetch eliminated by restructuring cached function as sole fetch path
- `SettingsSection` now supports `headerAction` prop for inline action buttons

## [26.4.112] - 2026-04-03

> Added a deterministic releases dashboard QA loop that starts with chaos, locks fixture states, and only passes once functional, performance, Lighthouse, cross-browser, and visual checks are all green in the same run.

### Added

- Added `qa:releases:loop`, source-controlled QA artifacts, and dedicated releases dashboard chaos plus health Playwright coverage
- Added deterministic `/demo/showcase/releases?state=...` fixtures for populated, disconnected, connected-empty, importing, failed, and partial release states
- Added unit coverage for shell route matching used by the releases loading path

### Changed

- Releases dashboard functional coverage now treats missing creator releases or disconnected provider states as failures in blocking mode instead of skipping
- Dashboard Lighthouse auth setup now preserves warmed authenticated state and runs repeatable releases audits for stable perf gating
- Dashboard shell and releases loading surfaces now render visible loading copy sooner so perf and Lighthouse checks measure deterministic content

### Fixed

- [internal] Reused the standalone production server path for the releases QA loop instead of a less stable local start path
- [internal] Disabled demo-mode releases polling so importing showcase fixtures do not hit live background polling behavior
- [internal] Refreshed releases product screenshots to match the shipped drawer tabs and demo fixtures

## [26.4.111] - 2026-04-02

> Moved tips into Artist Profile so payout setup, tip links, and QR sharing live next to the public profile editor, while legacy earnings routes now land on the new surface and tip traffic stays aligned with analytics.

### Added

- Added a shared monetization summary model and API that powers the new tips card in Artist Profile and the preview drawer Earn tab

### Changed

- Replaced the standalone earnings workspace with a compact Tips panel in `Settings > Artist Profile`, moved shop setup onto the same page, and removed the primary Earnings nav item
- Legacy earnings and tipping routes now redirect to `Settings > Artist Profile ?tab=earn#tips`
- Smart setup prompts now use generic tips and payments copy instead of Venmo-specific language
- Analytics now shows a single `Tip Link Visits` metric when tip traffic exists

### Fixed

- Tip visit totals now count all tracked tip-link visits so the new tips surfaces match analytics
- Preserved existing getting-started checklist completion for the renamed tips task
- [internal] Updated route-matrix and performance-manifest expectations to the new redirects and current settings section selectors

## [26.4.110] - 2026-04-02

> Added a resumable end-user performance loop for core routes, tightened homepage perf handling during the redesign window, fixed the local auth bypass for loopback testing, and reworked release and track sidebars around playback-first QA with stronger preview fallback handling.

### Added

- `/perf-loop all core pages` support via the new end-user performance orchestrator and command docs
- Added dedicated playback cards for release and track sidebars with explicit preview/provider QA states
- Added shared preview QA derivation and persistence metadata for preview verification and provider confidence

### Changed

- Performance loop CLI now supports end-user scope, manifest route IDs, group filters, resume state, and a dedicated `perf:loop:end-user` entrypoint
- Homepage perf work now lazy-loads the phone showcase path and reduces below-the-fold rendering cost while preserving the existing route UI
- Replaced the release sidebar track list flow with a playback tab using inline disclosure rows
- Moved track sidebars to playback-first and platforms-only tabs
- Public smart-link pages now separate canonical provider links from search fallback links and surface fallback preview sources

### Fixed

- Local dev test-auth bootstrap now keeps redirects host-stable so bypass cookies survive on `localhost` and `127.0.0.1`
- Performance route selection and tests now cover manifest-ID driven route resolution and resumable end-user state flow
- Shared audio playback now fails closed on missing media, rejected `play()` calls, and media errors
- Preview fallback enrichment now tries Spotify and Apple preview sources when MusicFetch does not provide a usable preview
- Tracks without preview-resolution metadata stay in `missing` instead of being mislabeled as `unknown`

## [26.4.109] - 2026-04-01

> Polished the Jovie chat interface and dashboard shell visual design: flattened the right drawer to match Linear's app-shell elevation, elevated entity cards so they read clearly on the flat surface, cleaned up bevel shadows from the chat input and suggestion pills, and vertically centered the chat welcome state.

### Changed

- Chat input and suggestion pills no longer have the bevel highlight shadow that created a false border effect
- Welcome screen text is smaller and tighter, vertically centered as a single composed block
- Right drawer on desktop is now flat — no border, no radius, no shadow — matching the main content surface
- Entity header card inside the drawer shell is now visibly elevated with an ambient shadow
- [internal] Removed "Response" label and uppercase tracking from chat message metadata

### Fixed

- [internal] Welcome state gradient position adjusted to stay within the centered content block
- [internal] Updated surface-elevation guardrail tests to reflect the intentional flat-drawer design

## [26.4.108] - 2026-04-01

### Fixed

- [internal] Fixed performance route resolver test to correctly simulate unavailable database in Doppler-injected environments

## [26.4.107] - 2026-04-01

> Reworked the marketing homepage with a sharper hero, a clearer artist profiles landing page, and smoother motion behavior. Internal route/config alignment and test updates shipped alongside the visual refresh.

### Added

- Added a dedicated artist profiles landing page
- Added a new homepage hero experience with refreshed messaging

### Changed

- Reworked the homepage hero copy, logo bar layout, and phone-tour spacing around the new Linear-inspired marketing direction
- [internal] Added route protections so artist profile handles cannot conflict with the new artist profiles page
- Homepage staggered animations now respect reduced-motion preferences
- [internal] Aligned homepage feature-flag defaults with the shipped marketing layout

### Fixed

- [internal] Homepage E2E coverage now matches the active section layout
- Increased the new hero body copy size to 16px for better readability

## [26.3.111] - 2026-03-31

> Replaced the swipe-driven profile V2 shell with a single-scroll layout, simplified legacy mode handling, expanded the public-profile social link cap to match the new UX, and extracted shared dashboard primitives for filters, query caching, keyboard shortcuts, and route guards.

### Added

- Added `ProfileScrollBody` to compose profile V2 sections in a single scroll surface
- Shared API route guard `withDashboardRoute` centralizing auth/profile resolution and error responses
- Keyboard shortcut registry validation tests (no duplicate keys, no overlapping bindings)

### Changed

- Public profile V2 now renders bio, social links, featured content, tour dates, and action rows in one continuous scroll flow
- Profile V2 hero now uses a shorter image treatment with the adaptive primary action beside the play control
- Legacy `?mode=tour` links now scroll to the tour section while listen, subscribe, contact, and tip continue opening drawers
- Extracted `ActiveFilterPill`, `FilterCheckboxItem`, and `FilterSearchInput` into reusable `molecules/filters` primitives
- Refactored `FilterSubmenu` into a generic, searchable checkbox submenu component
- Consolidated `AudienceFilterDropdown` and `ReleaseFilterDropdown` onto shared filter primitives
- Standardized query hook options via `cache-strategies.ts` presets (`STANDARD_CACHE`, `FREQUENT_BACKGROUND_CACHE`, `RETRY_BACKOFF`, etc.)
- Extended query key factories with filter/sort parameterization for cache granularity
- Consolidated dashboard keyboard shortcuts into a single `useDashboardShortcuts` orchestrator

### Fixed

- Synced the shared header social-link cap helper to four links and updated regression coverage for the new limit
- Added missing Escape key handler in filter checkbox items for keyboard navigation

## [26.3.110] - 2026-03-31

> Expanded Smart Link coverage now includes richer credit and platform metadata so release pages can surface additional providers and improved preview behavior.

### Added

- [internal] Added icon metadata coverage for Genius, Discogs, and AllMusic in DSP icon contrast checks

### Changed

- [internal] Synchronized Smart Link Credits and presence data paths for expanded non-DSP platform coverage
- [internal] Updated release audio preview and credits sidebar behavior alongside presence UI changes

### Fixed

- [internal] Updated DSP registry completeness test to the new service count
- [internal] Added regression coverage for icon contrast handling of newly introduced services

## [26.3.110] - 2026-03-31

> Added the Linear-style tasks foundation and unified the app, demo, and onboarding shell framing so pages, drawers, and tables share one consistent layout system.

### Added

- First-class `tasks` schema, migration backfill from release tasks, and a top-level tasks workspace with filtering and status controls
- Shared `AppShellContentPanel` and `OnboardingExperienceShell` primitives with guardrail tests for shell elevation and onboarding stability

### Changed

- Unified chat, dashboard, admin, settings, and shell-backed demo routes onto one framed content-panel system with consistent spacing, drawer elevation, and table chrome
- Updated demo showcase and onboarding surfaces to reuse the real shell and onboarding layout rules instead of bespoke wrappers
- Trimmed redundant helper copy across home, settings, admin, and demo surfaces while keeping billing and onboarding guidance intact

### Fixed

- Recovered from stale shell/profile state, missing local mock-Clerk fields, and admin users being redirected into onboarding
- Fixed nested `/demo/*` routes so they no longer trigger auth-only queries or hydrate sidebar nav items into mismatched button/link markup
- Corrected task query scoping and optimistic task-cache updates so badges, stats, and list/detail caches stay in sync

## [26.3.109] - 2026-03-31

> Fixed duplicate platform icons and truncated names on the DSP Presence page, plus added screen-reader description to the Add Platform dialog.

### Fixed

- Removed duplicate platform icon appearing in presence table rows
- Fixed truncated platform names in the Add Platform dialog by switching to a 3-column grid
- Added accessible description to the Add Platform dialog for screen readers

## [26.3.108] - 2026-03-30

> Reduced dashboard movement during loading so the shell appears immediately, chat loads more smoothly, and the side drawer no longer jumps on first paint.

### Fixed

- Reduced layout shift so the sidebar and header appear immediately while dashboard content loads
- Fixed flashing content on the chat page during load
- Prevented the right drawer from animating into view on first paint

## [26.3.107] - 2026-03-30

### Added

- Compact `Signals` card in the audience analytics sidebar with top AI insights and Ask Jovie drill-down links
- Insight data-hash freshness gate so cron and manual generation can skip unchanged insight types

### Changed

- `/app/insights` now redirects to the audience dashboard, with stale route benchmarks removed from the performance manifest
- Insight generation narrowed to the remaining high-value categories and a max of five surfaced insights per run
- Audience rows now collapse based on the actual table container width instead of raw viewport width, so the desktop layout stays readable with the drawer open or closed
- Audience user rows now carry a metadata subtitle when columns are hidden, preserving engagement, location, and recency context at tighter breakpoints

### Fixed

- Repeated insight generation now avoids recycling stale signals when the underlying metric slice has not changed
- Cron insights concurrency test timeout increased to reflect the observed route import cost in CI-like environments
- Analytics no longer default-opens into the full-screen mobile drawer on first load; it now opens after mount on desktop and closes when crossing down to mobile
- Audience table unit tests now cover narrow, medium, and wide desktop layouts and mock the mobile card through the current table barrel export

## [26.4.106] - 2026-03-30

### Removed

- Dead ad-pixels settings page (was behind a redirect to `/settings/audience` since v26.4.46)
- Orphaned `SettingsGroupHeading` component (replaced by `SettingsPanel`)

### Changed

- Account settings sections (Email, Connected Accounts, Sessions) now use `SettingsPanel` for consistent title typography
- Referral page rewritten with standard `SettingsPanel` components and proper loading/error states
- Billing button uses standard `variant='secondary' size='sm'` instead of custom className overrides
- Settings icon sizes normalized to `h-4 w-4` across all pages
- Import paths standardized from re-export barrel (`features/dashboard/molecules/`) to source (`molecules/settings/`)

## [26.4.105] - 2026-03-30

### Fixed

- Home page now renders the real chat UI instead of a separate card-style layout introduced by the perf wave
- Added guardrail rule preventing performance PRs from replacing route UIs with different layouts
- Added regression test ensuring the home page always renders the same chat component as `/app/chat`

## [26.4.104] - 2026-03-30

### Changed

- Sidebar drawers (Analytics, Audience Member, DSP Presence, Profile Contact) now consolidate the close button into the overflow menu instead of showing a standalone close button alongside the three-dot menu
- Updated drawer chrome tests to verify the new overflow menu pattern

## [26.4.103] - 2026-03-30

### Changed

- All dashboard sub-routes now use the fast essential shell data path, reducing unnecessary DB queries for audience, earnings, insights, and presence pages
- Calibrated skeleton-to-content performance budgets to realistic values based on production build measurements (auth'd server-rendered pages have a ~500ms rendering floor)
- Fixed presence page performance selector to match actual DOM (`dsp-presence-workspace`)

## [26.4.102] - 2026-03-29

### Added

- Interactive investor links manager: create links, copy shareable URLs, toggle active/inactive, deactivate with confirmation
- Investor portal settings form: fundraise display, CTA URLs, follow-up automation, Slack webhook
- Referral settings page wired to existing referral APIs (code display, stats, program terms)
- Ad pixels settings page wired to existing pixel APIs (Facebook, Google, TikTok with encrypted token storage)
- Route completeness guard test: catches orphaned loading skeletons without matching pages in CI

### Changed

- Investor link delete now correctly soft-deletes (matches server behavior) instead of removing from list

## [26.4.101] - 2026-03-29

### Added

- Re-enrichment pipeline for profiles imported before MusicFetch integration (backfills ~12 additional DSPs per release)
- Admin API endpoint for single-profile and batch re-enrichment (`/api/admin/re-enrich`)
- Preview URL capture from Deezer and MusicFetch during link discovery (backfills audio previews when Spotify returns null)
- Under-enriched profile sweep to automatically find and fix profiles with incomplete DSP coverage

### Fixed

- Preview URLs now validated (HTTPS-only) and sanitized before persistence
- Deezer empty/non-string preview responses handled gracefully without losing provider link

## [26.4.100] - 2026-03-29

### Fixed

- Stale "$9/mo" founding price fallback in sidebar upgrade banner (actual cheapest paid tier is Pro at $20/mo)
- Second hardcoded $9 fallback in verified upgrade price formatter
- Stale "$5 branding removal" copy in pricing page SEO metadata and PricingCTA component
- Defensive founding→pro mapping in chat usage API's resolvePlan() for legacy DB rows
- Stale comment claiming free-tier AI limit is 25/day (actual: 10/day from entitlement registry)

### Removed

- Founding tier from pricing config, Stripe config, plan hierarchy, env validation, and onboarding checkout
- Founding from valid plan intent options (no longer offered to new users)

### Added

- Unit tests for resolvePlan() covering all plan values including legacy founding and growth mappings

## [26.4.99] - 2026-03-29

### Fixed

- Card elevation consistency across the app shell — replaced semi-transparent backgrounds with solid `bg-surface-0` so loading skeletons, empty states, and card containers are visually distinct from their parent surface
- Card-within-card nesting in drawer empty states (double border/shadow removed)
- Redundant "Earnings" / "AI Insights" / "DSP Presence" page titles that duplicated the breadcrumb header
- Toast notifications now have proper elevation (solid background + card shadow)
- Release table row deduplication to prevent multiple rows highlighting on click
- Billing history section no longer wraps content in invisible same-color Card components

### Added

- Surface elevation guardrail test to catch semi-transparent backgrounds and card nesting regressions
- AGENTS.md rules for surface elevation and duplicate page title prevention

## [26.4.98] - 2026-03-29

### Fixed

- TikTok auto-generated titles like "TikTok (@handle)" now correctly extract the handle instead of displaying redundantly
- SoundCloud reserved routes (`/discover`, `/stream`, `/charts`, etc.) no longer produce fake `@` handles
- Twitch reserved routes (`/directory`, `/settings`, `/wallet`, etc.) no longer produce fake `@` handles
- "New Release" button on dashboard did nothing when clicked — AddReleaseSidebar was rendered inline inside an `overflow-hidden` container instead of through the right panel system
- Zombie drawer: add-release form would reappear after closing a release or track sidebar because `addReleaseOpen` state was never cleared when opening other sidebars
- Consolidated suggested identity cards into single unified card (was two separate cards with header split from content)
- Profile image cropping on DSP match suggestions (64px fixed height → responsive 3:1 aspect ratio)
- Purple accent buttons in suggested identity carousel replaced with grayscale design system primary buttons
- Dismiss button in profile-ready card now disabled during action to prevent double-dismiss

### Added

- Tests for reserved route filtering across SoundCloud and Twitch platform handlers

## [26.4.97] - 2026-03-28

### Fixed

- Consistent display name resolution for social/music links: displayText → handle → platform name
- Broken `@handle` extraction in dashboard link pills and chat-style link items (was using `canonicalIdentity` which never returned `@`-prefixed strings)
- YouTube `/channel/UCID` URLs no longer produce fake `@UCID` handles, fall back to platform name instead
- Raised display label character limit from 28 to 40 to prevent silent truncation of user-set labels

### Added

- Platform display handlers for SoundCloud, Facebook, Twitch, and LinkedIn handle extraction
- Smart secondary text: shows platform name when primary is a handle, shows handle when primary is a custom label
- 12 new tests covering the display name fallback chain, YouTube channel ID handling, and new platform handlers
- SoundCloud Pro badge detection via SC API v2 as independent fit score signal (+10 points)
- New scoring criterion `soundcloudPro` in fit scoring system (stacks independently with social paid verification)
- SoundCloud strategy module with config, detection, and storage (`ingestion/strategies/soundcloud/`)
- Negative detection support: clears stale Pro flags when subscription lapses
- Immediate fit score recalculation after Pro status detection
- Non-blocking SC Pro detection hook in MusicFetch enrichment pipeline

### Changed

- Fit score version bumped from 4 to 5 (new SoundCloud Pro signal)
- Fit score theoretical max increased from 125 to 135 (still capped at 100)

## [26.4.96] - 2026-03-28

### Added

- Visual regression spec (`visual-regression.spec.ts`) covering homepage, auth pages, and pricing in light/dark mode
- ClientProviders composition test catching the TooltipProvider regression class (a518d3fb5)
- Proxy composition critical test for CSP nonce, test bypass, and matcher exclusions
- Migration journal ordering guard (critical test) preventing schema drift
- Coverage ratchet thresholds in `vitest.config.ci.mts` (placeholder zeros, calibrate on main)
- `/demo/onboarding` mock route for rapid onboarding UI iteration without auth gating
- Progressive profile panel on right side during onboarding demo (fills as steps advance)
- Step picker toolbar and step dots for instant navigation between all 9 onboarding steps
- Fade-to-transparent reveal transition from onboarding overlay to dashboard

### Changed

- Onboarding checkout/upgrade interstitial is now always shown after profile review (feature flag removed)
- Spotify artist enrichment (name, avatar, bio) is now awaited during onboarding so the profile shows the correct artist name immediately
- Post-checkout redirect routes to the welcome chat page, enabling the "Welcome to Jovie" message with imported release counts

### Fixed

- All 47 API routes now use `getCachedAuth()` instead of Clerk's `auth()` directly, fixing 401 errors when using dev test auth bypass
- Onboarding return-to validator now accepts the chat route for post-checkout welcome chat bootstrap
- Prevent false onboarding redirect on dashboard pages (audience, earnings, presence, releases) when dashboard data fails to load — existing users were being sent to a blank onboarding screen instead of seeing the error state

## [26.4.95] - 2026-03-28

### Added

- Automated YC demo video recording pipeline via Playwright (`doppler run -- pnpm --filter web demo:record`)
- Video-first `/demo/video` investor page with autoplay, loading states, and screenshot carousel fallback
- Caption overlay injection in demo recording for silent video context
- Production environment guard in demo spec to prevent accidental prod user creation
- Download proxy API route at `/api/demo/download` for cross-origin video downloads
- WebVTT captions file for accessibility on the demo page
- `DemoVideoPlayer` component with loading/error/fallback states
- `BrowserFrame` decorative browser chrome wrapper
- `DEMO_REUSE_SERVER` option in `playwright.config.demo.ts` to use an existing dev server

### Changed

- Relaxed multi-DSP enrichment assertions in demo spec to best-effort (don't fail recording if enrichment is slow)
- Simplified onboarding form detection in demo spec to match current UI selectors
- Presence page converted from card grid to table layout, matching the Releases page pattern with row selection and sidebar integration
- Insights page wrapped in DashboardWorkspacePanel with PageToolbar, matching all other dashboard pages
- Right drawer card widths normalized by fixing asymmetric padding that caused cards to be narrower on the right side
- Drawer tabs card padding aligned with entity header padding for visual consistency
- Dashboard header action button gap tightened from 6px to 4px for more cohesive grouping

### Removed

- DspPresenceCard component (replaced by DspPresenceTable rows)

## [26.4.94] - 2026-03-28

### Added

- Audio preview player on release smart link pages: compact player card with play/pause, seek bar, and disabled state when no preview URL is available
- Preview URL fetching from Spotify full track endpoint during import, carried through `mergeFullTrackMetadata`
- Parallel database query for primary track preview URL on release page load

### Changed

- Chat empty state content is now vertically centered instead of bottom-anchored, creating a more balanced layout when no conversation is active

## [26.4.93] - 2026-03-28

### Fixed

- Screenshot CI workflow now reuses a single PR instead of creating a new one each run, preventing stale screenshot PRs from piling up
- Sitemap crash on Vercel: blog directory missing causes ENOENT, now returns empty list gracefully
- Middleware redirect loop on `/monitoring` (Sentry tunnel): excluded from proxy matcher so Sentry events flow without hitting auth logic
- Chat metadata crash: `generateMetadata` threw "User not found" when Clerk user had no DB record yet, now falls back to default titles
- CSP blocking Clerk JS from `clerk.jov.ie`: added the Clerk proxy CNAME to `script-src` and `connect-src` directives
- Chat usage API: narrowed `auth()` error handling to only catch Clerk middleware-detection errors, re-throws real infrastructure failures

## [26.4.92] - 2026-03-28

### Fixed

- Homepage hero layout: text and phone mockup now display side-by-side on desktop instead of stacking vertically (Tailwind v4 specificity fix)

## [26.4.91] - 2026-03-28

### Added

- Manual DSP platform linking: artists can add streaming platform profiles by name and URL
- Add Platform dialog with provider picker grid and URL validation against DSP_REGISTRY domains
- Admin-only Refresh button to trigger DSP discovery re-scan from presence page
- Card grid layout replacing table view on presence page with provider-colored borders
- "Manual" badge for user-added matches (distinct from auto-discovered confidence scores)
- Discovery overwrite protection: manual matches preserved when auto-discovery runs

### Changed

- Presence page uses responsive card grid (1/2/3 columns) instead of data table
- Empty state updated with actionable "Add Platform" CTA
- Loading skeleton matches new card grid layout
- Sidebar guards null confidence for manual matches

## [26.4.90] - 2026-03-28

### Fixed

- Auth page text invisible in light mode: Clerk footer ("Don't have an account?"), branding badge, and card elements used theme-dependent CSS tokens on a hardcoded dark background. Migrated all auth-scoped Clerk styling to fixed dark-theme `--clerk-color-*` CSS variables using Clerk v7's CSS custom property API.
- Error page (`/error/user-creation-failed`) text invisible in light mode: same root cause, fixed with hardcoded light text values.

## [26.4.90] - 2026-03-28

### Fixed

- Account deletion now invalidates profile ISR cache so deleted artist pages don't linger
- Account deletion signs out the user via Clerk instead of a bare redirect, clearing stale session cookies
- Right drawer entity header and tabs scroll with content in minimal mode instead of pinning to top (restores intended layout)
- Release sidebar: entity header and analytics render inside scrollable content instead of pinned header area
- Profile sidebar: smart link analytics render inside scrollable content instead of pinned header area

### Removed

- Algorithm Health Check admin page and Spotify FAL analysis API (deprecated experimental feature)
- CI self-approval guard in agent pipeline (no longer needed)
- Unreleased changelog entries for removed features

## [26.4.89] - 2026-03-28

### Added

- User suspension system with admin UI (confirmation dialog with required reason)
- Generic "service unavailable" page for suspended users (no account-specific language)
- Ban check in dashboard layout to cover all `/app` routes
- Admin audit trail for all suspension/restoration actions with Clerk metadata sync

### Changed

- Middleware uses URL rewrite instead of redirect for suspended users (URL bar stays on original page)

### Removed

- Deprecated `/autopilot`, `/orchestrate`, and `/swarm` agent-dispatch skills (replaced by Conductor workspaces)
- `.claude/skills/parallel-agents.md` (duplicate of swarm)

## [26.4.88] - 2026-03-28

### Added

- Tab overflow mechanism with collapse-to-dropdown behavior for drawer tabs, keeping all tabs accessible when space is constrained
- `DashboardWorkspacePanel` shared wrapper component with toolbar slot for consistent page body structure across all 5 dashboard routes
- `distribution` prop on TabBar and DrawerTabs to support fill-width tab distribution
- Visual flag badge system: flagged UI regions show dashed outlines + clickable name chips when dev toolbar is active (Cmd+Shift+F to toggle)
- `<Flagged>` wrapper component for marking feature-flagged UI regions
- Flag badge toggle button in dev toolbar bottom bar

### Changed

- Converged all 5 core dashboard surfaces (Releases, Audience, Presence, Earnings, Chat/Profile) toward Linear visual parity
- Unified right drawer structure across all sidebars: entity card first, no duplicate title rows, consistent elevation tokens (`LINEAR_SURFACE`)
- Presence route now uses the shared global right drawer instead of a bespoke inline side panel
- Earnings route uses toolbar pattern instead of bespoke hero/header chrome
- Sidebar nav states driven by design tokens instead of opacity modifiers (`/78`, `/92` removed)
- App shell and sidebar extended to bottom edge of viewport, eliminating dead space
- Drawer tabs fill available width where appropriate instead of undersized intrinsic pills
- All 16 Statsig gates consolidated into `FEATURE_FLAGS` as code-level booleans, toggleable via dev toolbar
- `useFeatureGate` replaced with `useCodeFlag` across all consumers
- `FeatureFlagsProvider` no longer requires server-side bootstrap prop
- DevToolbar unified flag list shows all flags as "code" source (no more statsig/code split)

### Fixed

- Release enrichment jobs for Deezer were silently failing because the payload schema only accepted `apple_music`, causing Deezer links to never populate after DSP artist discovery
- Per-release refresh button now triggers DSP artist discovery (Apple Music, Deezer, MusicBrainz) alongside MusicFetch enrichment, matching the full sync behavior
- Admin bulk creator refresh now enqueues DSP artist discovery jobs in addition to MusicFetch enrichment
- ISRC rescan now enriches both Apple Music and Deezer releases (previously Apple Music only)
- Added error handling for Deezer ISRC batch lookups to prevent circuit breaker errors from killing the entire enrichment job
- Duplicate drawer title rows above entity cards in all sidebars
- Profile identity in Chat drawer now comes from entity card, not a generic header row
- Audience sidebar layout aligned with release/profile drawer pattern
- Sidebar visibility broken by Tailwind v4 cascade changes
- Hidden/responsive display patterns swept for Tailwind v4 compatibility
- DevToolbar spacing uses CSS variable instead of body padding
- Earnings page missing `sr-only` H1 for accessibility
- Bottom gap padding removed from earnings page body
- Unused import in ReleaseTableSubheader test cleaned up

### Removed

- `statsig-node` dependency and all Statsig server SDK integration
- `lib/feature-flags/server.ts` (Statsig init, gate evaluation, bootstrap)
- `lib/feature-flags/stripe-connect.ts` (domain-specific Statsig wrapper)
- Server-side feature flag bootstrap in shell, auth, and onboarding layouts

## [26.4.87] - 2026-03-27

### Added

- Per-release target playlists field in the release sidebar, allowing artists to set playlist targets per release instead of only at the profile level
- New `target_playlists` column on `discog_releases` table (additive migration, no data loss)
- Pitch generation now prefers release-level target playlists over profile-level defaults

### Changed

- Artist settings "Target playlists" label updated to "Default target playlists" with copy explaining per-release override
- Shared `targetPlaylistsSchema` validation extracted for reuse across profile and release actions

### Fixed

- Release target playlists component resets properly when switching between releases (key-based remount)
- Error toast displayed when saving target playlists fails (previously swallowed)

## [26.4.86] - 2026-03-28

### Added

- Welcome message now prompts new artists to share career highlights when the field is empty, improving pitch quality from the first interaction
- Golden path E2E test suite covering post-onboarding flows: welcome message, core pages, settings persistence, and chat send/receive
- Performance budget for `/app` dashboard page [internal]
- Suspense streaming shell: skeleton renders at first byte while dashboard data resolves
- `getDashboardDataEssential()` fast-path fetch for future use (not yet wired into the shell provider) [internal]
- `fetchDashboardBaseWithSession()` shared helper eliminates duplication between full and essential data fetches [internal]
- Pre-warm request in performance budget guard for consistent warm-cache measurements [internal]
- `data-testid="chat-content"` marker on JovieChat for skeleton-to-content measurement [internal]

### Changed

- Rename "Pitch Context" to "Career Highlights" across the entire stack: database column, API, validation, settings UI, pitch service, and all type interfaces
- Extract `buildWelcomeMessage` to its own module (`lib/services/onboarding/welcome-message.ts`) for testability
- Settings description updated to explain how career highlights improve pitches and recommendations
- Dashboard shell layout uses Suspense boundary with streaming fallback instead of blocking on full data fetch
- Code-split `ProfileContactSidebar` via `next/dynamic` (sidebar panel, not critical path) [internal]
- `generateMetadata()` on `/app` reuses deduplicated dashboard data instead of a separate DB call [internal]
- Feature flag bootstrap hardened with `.catch()` fallback to prevent shell crash on transient failures [internal]
- Separate resource budgets per page type [internal]
- Performance budget guard skeleton-to-content measurement uses `chat-content` testid [internal]

### Fixed

- Extracted nested ternary in `DashboardShellSkeleton` to lookup table [internal]

## [26.4.85] - 2026-03-27

### Changed

- Build validation now runs on every PR and blocks merge if the build fails, catching broken builds before they reach main [internal]
- Lighthouse performance checks, accessibility audits, and layout guard now run on all PRs without the `testing` label (informational, non-blocking) [internal]
- Agent workflow updated: draft PR first, commit often, let CI catch issues early, then `/ship` to finalize [internal]
- `/ship` now detects existing draft PRs and updates them instead of creating duplicates [internal]
- Agent pre-push gate replaced with gstack skill pipeline (`/qa` → `/review` → `/ship` → `/land-and-deploy`) [internal]

## [26.4.84] - 2026-03-27

### Changed

- Migrate all test files from `UserState` to `CanonicalUserState` and remove backward-compat alias from `gate.ts` [internal]
- Create shared admin types barrel file (`lib/admin/types.ts`) and update 46 admin components to import types from it, removing the ESLint server-only override [internal]
- Add ESLint rule enforcing type-only exports in `lib/admin/types.ts` [internal]
- Update ESLint server-only-imports rule to allow `@/lib/admin/types` and `@/lib/admin/csv-configs/` [internal]

### Fixed

- Artist profile settings page no longer crashes when a social link has an unexpected `platformType` value from the database; unknown values now fall back to the "Web" section with a Sentry breadcrumb for observability
- Unsafe type cast in `PreviewDataHydrator` replaced with runtime validation guard to prevent bad DB data from being laundered into trusted app state
- Fix batch fit scoring to apply pixel suppression filtering (matching individual scoring path) [internal]
- Unskip avatar upload validation error tracking test (hook already implemented) [internal]
- Document Linktree suppressed pixel ID methodology (no platform-owned pixel IDs detected) [internal]

## [26.4.83] - 2026-03-27

### Changed

- DSP Presence page converted from card grid to Linear-style table with sortable columns, external link icons, and keyboard navigation
- Suggested DSP matches now sort first so actionable items appear at the top of the list
- Conductor workspace archive script now cleans up `.claude/worktrees` (stale agent worktrees) alongside node_modules and build artifacts [internal]

## [26.4.82] - 2026-03-26

### Added

- Canonical screenshot catalog plumbing for admin: registry + manifest metadata, deterministic demo showcase routes, and a catalog-backed admin gallery with grouping and consumer filters [internal]
- Product screenshot registry coverage test plus shared jsdom browser stubs for `window.open`, canvas contexts, and anchor navigation in Vitest [internal]

### Changed

- Screenshot automation now captures a finite overwrite-in-place catalog, writes an internal manifest, and refreshes public marketing exports from the same scenario registry [internal]
- `pnpm vitest --run --changed` now uses a stable single-fork configuration so large affected-test sweeps don't fail on worker startup churn [internal]

## [26.4.81] - 2026-03-26

### Changed

- Public deploy, changelog subscribe, webhook dispatch, and cron control paths now fail closed when durable coordination is unavailable instead of degrading to in-memory behavior [internal]
- Server-side operational HTTP now uses bounded timeout and retry handling through the shared `serverFetch()` wrapper [internal]
- Admin reliability now includes unresolved Sentry issues, Redis availability, and deployment state alongside latency and incident metrics [internal]

### Added

- Shared cron auth helper with timing-safe bearer verification and optional trusted-origin enforcement [internal]
- Redis-backed limiters for changelog subscription and deploy promotion [internal]
- Route and helper test coverage for deploy control, changelog subscription, cron auth, idempotency, webhook dedupe, and operational webhook/cron entrypoints [internal]

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

- Fixed an issue where waitlist approvals in the admin board could appear successful without fully updating the user's account
- Invited people on the waitlist can now be fully approved from the admin board
- [internal] Fixed an issue where waitlist approvals in the admin board could appear successful without fully updating the user's account
- [internal] Invited people on the waitlist can now be fully approved from the admin board
- Fixed a rare routing issue where people still on the waitlist could briefly land on onboarding
- Admin board now blocks invalid claimed→invited drag transitions until proper reversion support is added
- Bulk approve action now includes invited entries, matching individual approval behavior

## [26.4.43] - 2026-03-22

### Changed

- Document all 11 custom ESLint rules, 12 Claude hooks, canonical import paths, and file creation templates in AGENTS.md so agents stop failing on preventable mistakes
- Fix duplicate guardrail numbering (#10/#11/#12 → #13/#14/#15) and incorrect cache preset references (`DYNAMIC_CACHE` → actual presets from `cache-strategies.ts`)
### Added

- AES-256-GCM encryption for wrapped links with versioned envelope format (`v: 1`), replacing base64 obfuscation
- Zod input validation schemas for `/api/wrap-link` (POST/PUT/DELETE) with SSRF-safe URL validation
- Zod input validation for `/api/growth-access-request` replacing manual string checks
- Migration script (`scripts/migrate-wrapped-links.ts`) to re-encrypt legacy base64 wrapped links to AES-GCM
- Documented contact obfuscation threat model (intentional anti-scraping, not cryptographic protection)
- 25 new tests: encryption round-trip, versioned envelope detection, legacy format fallback, schema validation

### Changed

- Link wrapping now stores encrypted URLs as versioned JSON envelopes instead of raw base64
- Decrypt path auto-detects format: AES-GCM envelope (`v: 1`) or legacy base64 fallback
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

- Use Clerk's prebuilt auth components on `/signin` and `/signup` so sign-in, sign-up, and Google OAuth flows no longer depend on the fragile custom multi-step auth runtime
- Update auth page and smoke tests to validate the rendered Clerk flows and canonical auth-route navigation instead of the removed custom stepper UI

### Changed

- Update auth testing docs to explain the Clerk Playwright setup, signed-out auth-page coverage, and gstack `/browse` QA flow
- Improved sign-in and sign-up reliability
- [internal] Use Clerk's prebuilt auth components on `/signin` and `/signup` so sign-in, sign-up, and Google OAuth flows no longer depend on the fragile custom multi-step auth runtime
- [internal] Update auth page and smoke tests to validate the rendered Clerk flows and canonical auth-route navigation instead of the removed custom stepper UI

### Changed

- [internal] Update auth testing docs to explain the Clerk Playwright setup, signed-out auth-page coverage, and gstack `/browse` QA flow

### Removed

- [internal] Delete the obsolete custom Clerk auth hooks, multi-step auth form components, and their unused tests after the prebuilt auth cutover
- Fix duplicate "Jovie" in public profile page title — browser tab showed "Tim White | Jovie | Jovie" instead of "Tim White | Jovie"
### Added

- Dev toolbar "Clear" button to nuke all cookies, localStorage, and sessionStorage in one click — fixes environment cross-contamination when testing dev and production in the same browser
- Server-side `/api/dev/clear-session` endpoint with prefix-based Clerk cookie deletion (catches suffixed variants like `__session_<suffix>`) and production guard
- Toolbar state (`__dev_toolbar` cookie and localStorage keys) preserved across session clear so the toolbar stays visible after reload
- [internal] Dev toolbar "Clear" button to nuke all cookies, localStorage, and sessionStorage in one click — fixes environment cross-contamination when testing dev and production in the same browser
- [internal] Server-side `/api/dev/clear-session` endpoint with prefix-based Clerk cookie deletion (catches suffixed variants like `__session_<suffix>`) and production guard
- [internal] Toolbar state (`__dev_toolbar` cookie and localStorage keys) preserved across session clear so the toolbar stays visible after reload

## [26.4.41] - 2026-03-22

### Added

- Blog author sections now pull display name, avatar, and verified badge from the author's Jovie profile instead of hardcoded frontmatter
- Batch profile query `getProfilesByUsernames` for efficient blog index rendering
- `resolveAuthor` helper with graceful fallback to frontmatter when profile is not found
### Fixed

- Fix feature flags not showing in dev toolbar — toolbar was outside the FeatureFlagsProvider tree so the flags panel never rendered
- Extract shared `FF_OVERRIDES_KEY` constant to prevent key drift between toolbar and provider
- [internal] Batch profile query `getProfilesByUsernames` for efficient blog index rendering
- [internal] `resolveAuthor` helper with graceful fallback to frontmatter when profile is not found
### Fixed

- [internal] Fix feature flags not showing in dev toolbar — toolbar was outside the FeatureFlagsProvider tree so the flags panel never rendered
- [internal] Extract shared `FF_OVERRIDES_KEY` constant to prevent key drift between toolbar and provider

## [26.4.40] - 2026-03-22

### Fixed

- Fix deploy failure caused by out-of-order migration journal timestamps — Drizzle was silently skipping migration 0007 because its timestamp was earlier than an already-applied migration
- Add monotonic timestamp validation to `validate-migrations.sh` CI guard to prevent future out-of-order journal entries
### Added

- `scripts/browse-auth.ts` — Playwright script to authenticate Clerk test users for gstack `/browse` headless QA sessions
  - Auto-creates test user via Clerk API if not found
  - Uses `+clerk_test` email suffix with magic OTP code `424242`
  - Exports session cookies to `/tmp/browse-clerk-cookies.json` for import into browse
  - Replicates `@clerk/testing/playwright` behavior with `context.route()` for reliable token injection

### Fixed

- Handle both `UseSignInReturn` and `SignInSignalValue` types from Clerk v6 in auth hooks
- Add type overlays for `SignInResource`/`SignUpResource` to match runtime Signal API
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
- Updated cookie policy to reflect how tracking works
- Refreshed landing page messaging to better explain what Jovie does
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

- Cookie consent banner now only appears in regions where it's legally required (EU, UK, Brazil, South Korea, and US privacy states like California)
- If we can't determine your location, the banner won't show unless required as a safety fallback
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
- [internal] Section visibility gated by Statsig `show_see_it_in_action` gate (off by default in production)
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
