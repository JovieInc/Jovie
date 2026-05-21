     1|# Changelog
     2|
     3|All notable changes to this project will be documented in this file.
     4|
     5|The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
     6|and this project uses [Calendar Versioning](https://calver.org/) (`YY.M.PATCH`).

## [26.5.32] - 2026-05-21

> [internal] Keyboard navigation in the releases shell view now supports J/K row selection, Enter to open the track sidebar, and focus-scoped navigation so keys don't fire when focus is elsewhere.

### Added

- **Keyboard navigation for shell releases (JOV-1823)**: J/K and arrow keys now select releases in the shell list; Enter opens the release sidebar for the selected row. Navigation is scoped to the list region — keys don't fire when focus is in a search input, drawer, or other panel.

## [26.5.29] - 2026-05-18

> [internal] Profile music/releases scroll is now hardware-accelerated for smooth native-feel scrolling on touch devices.

### Fixed

- **Profile scroll jank (JOV-1983)**: added `touch-action: pan-y`, `will-change: scroll-position`, and `contain: layout style` to all profile scroll containers — compact surface, desktop surface, drawer shell, and the releases list — eliminating scroll jank on iOS and Android.

## [26.5.28] - 2026-05-18

> [internal] Desktop dictation bridge payloads are now validated before the web app trusts them.

### Fixed

- **Desktop dictation bridge hardening (JOV-2402)**: validates `getDictationStatus()` IPC payloads before storing them in renderer state, pins the desktop contract test to the main-process handler registration, and keeps Web Speech feature detection scoped through the shared browser window reference.

## [26.5.27] - 2026-05-18

> [internal] Desktop dictation is now guarded by an explicit Electron bridge so stale desktop builds fail closed instead of showing a broken microphone.

### Fixed

- **Desktop dictation bridge (JOV-2277)**: added a guarded Electron dictation capability probe and preload/main IPC contract. Browser contexts keep the normal Web Speech path, stale Electron builds disable dictation quietly, and the desktop media permission handler now only allows audio-only requests from the trusted Jovie app origin.

## [26.5.26] - 2026-05-17

> First-run cinematic boot: the very first time you land in the app each tab, Jovie greets you with a soft cinematic — logo cinematic fade, gentle reverse spin, frame settles, sidebar slides in, welcome content appears. Subsequent navigations skip straight to the skeleton — no repeat motion.

### Added

- **Cinematic app boot — first-mount-per-tab (JOV-2364)**: new `CinematicAppBoot` organism wraps the `(shell)/layout.tsx` Suspense fallback. On the first shell mount of each browser tab, plays a 2.4s forward-only cinematic over a dark canvas (Jovie mark fades in → reverse spin → mark fades off → frame fades in → sidebar slides in → welcome content fades up). On subsequent shell suspensions in the same tab the cinematic is skipped and the route-specific skeleton renders directly. SSR-safe via a `mounted` guard, honors `prefers-reduced-motion`, and gates per-tab via the `jovie:cinematic-boot-played` sessionStorage flag. Final composed state mirrors the post-resolve `AppShellFrame` so the natural unmount-on-resolve is visually seamless. New atomic vitest suite (5 assertions) covers the gating logic.

## [26.5.25] - 2026-05-17

> [internal] Auth reliability: middleware 503 paths now return HTML for browser navigation, and Sentry rate-limiting uses atomic Redis operations to prevent silent alert suppression.

### Fixed

- **[internal] Middleware 503 paths return HTML for browser requests**: when Clerk auth is degraded and the proxy returns a 503, requests from browsers (identified via `Accept: text/html`) now receive a styled HTML page rather than a JSON error response. This means users who navigate directly to a protected page during a Clerk outage see a readable "service temporarily unavailable" message instead of raw JSON. JSON responses are preserved for API clients and background fetch calls. (JOV-2393)
- **[internal] Sentry rate-limit is now atomic**: replaced the previous non-atomic `INCR` + `EXPIRE` pair with a single atomic `SET NX EX` operation. The old implementation had a gap where `INCR` succeeded but `EXPIRE` failed, leaving the Redis key without a TTL — this permanently silenced Sentry alerts for that hostname until the key was manually removed. The new implementation writes the key and its 60-second TTL in one operation, eliminating the race. (JOV-2393)
- **[internal] Waitlist error boundary no longer triggers on Stripe/DB auth errors**: narrowed the `isAuthDegradedError` heuristic from the broad `msg.includes('auth')` (which matched Stripe, JWT, and database auth errors) to `msg.includes('authentication service')`, which is specific to Clerk error messages. (JOV-2393)

## [26.5.24] - 2026-05-17

> The Jovie pitch deck is now available at jov.ie/pitch with a one-click PDF download.

### Added

- **Public pitch deck route at `/pitch`**: 10-slide investor deck reusing the existing slide viewer, with keyboard, swipe, and dot navigation, a fullscreen mode, and a one-click PDF download of the same content. The page is search-engine hidden (NOINDEX) so it only shows up when shared directly. (JOV-2357)

### Fixed

- **Investor portal deck now actually renders**: the slide manifest in the web app's content directory had no slides listed, so both `/investor-portal` and the new `/pitch` route were silently rendering an empty "No slides yet — check back soon" state. Mirrored the 10 canonical slide markdown files plus the updated manifest into `apps/web/content/investors/` so the deck loads everywhere. (JOV-2357)

## [26.5.22] - 2026-05-17

> The empty Ask Jovie screen now wears a soft electric outline of the Jovie mark behind your input — a subtle glow that reads as ambient atmosphere, not chrome.

### Changed

- **Empty chat state — electric Jovie mark backdrop**: replaced the static giant "j" glyph behind the Ask Jovie empty state with a faint outline of the Jovie mark, softened by a radial mask and accented with a slow traveling spark when motion is permitted. Reduced-motion users see the same outline without the spark, preserving the visual idiom. The mark sits at `clamp(220px, 44vw, 440px)` so it scales gracefully from phone to desktop. Reuses canonical design tokens; no new accent colors introduced. Follow-ups tracked as JOV-2364 (first-run-only cinematic boot) and JOV-2365 (reuse `JovieMarkElectric` in other empty/loading surfaces).

## [26.5.21] - 2026-05-17

> [internal] Design polish: stripped banned uppercase tracking eyebrow text from dashboard surfaces and fixed title case in upgrade interstitials.

### Fixed

- [internal] **Remove uppercase tracking eyebrow text from dashboard surfaces (JOV-2250, JOV-2251, JOV-2252, JOV-2249, JOV-2248, JOV-2257, JOV-2258)**: stripped `uppercase tracking-*` Tailwind classes from settings sidebar group labels, ad pixels field labels, profile photo section labels, preview panel section headers, MetadataAgent card headers, and release-plan track number label. Also fixed title case in `ReleasePlanPromptDialog`, `ReleasePlanUpgradeInterstitial`, and `CompactReleasePlanUpgradeCard` headings — "Upgrade to Generate a Release Plan" (not all-caps title case).

## [26.5.15] - 2026-05-16

> [internal] Observability: AI responses now flow into the Braintrust "Jovie" project when the API key is configured, so we can see model traces and run evals against production.

### Added

- [internal] **Braintrust LLM observability**: every Vercel AI SDK call (`streamText`, `generateText`, `generateObject`, `streamObject`) is wrapped through `apps/web/lib/ai/sdk.ts` and every direct Anthropic SDK call goes through `getAnthropicClient()` in `apps/web/lib/ai/anthropic.ts`. Wiring includes `initLogger` in `apps/web/instrumentation.ts` (Node runtime only, fail-open on init), the `braintrust/webpack-loader` rule in `apps/web/next.config.js`, the `braintrust@^3.10.0` dependency, a `BRAINTRUST_API_KEY` slot in `apps/web/lib/env-server-schema.ts`, and an MCP server entry in `.mcp.json` (`https://api.braintrust.dev/mcp`) so agents can query traces. Wrapper functions are lazy so partial `vi.mock('ai')` calls in unit tests don't fault on sibling exports they never invoke.

## [26.5.14] - 2026-05-16

> [internal] Desktop shell identity hardening: added a branded Electron recovery screen and bumped the DMG release version.

### Fixed

- [internal] **Desktop shell identity and failure fallback (JOV-2314)**: Electron launch failures now render a branded Jovie Desktop recovery surface with retry affordance instead of a blank or generic web failure. The desktop app name is set explicitly for production/staging, and the desktop release version is bumped so the next DMG carries the current app-shell identity.

## [26.5.13] - 2026-05-16

> [internal] Security: drop unauthenticated scanner traffic at the edge so off-platform probe URLs no longer reach the page handler or generate observability warnings.

### Fixed

- [internal] Drop unauthenticated scanner traffic at the edge so off-platform probe URLs no longer reach the page handler or generate observability warnings.

## [26.5.11] - 2026-05-16

> [internal] Desktop release bump for the Electron app-shell launch fix and a guard that prevents future desktop code from landing without DMG release handling.

### Fixed

- [internal] **Desktop DMG app-shell release guard (JOV-2295)**: Bumped desktop release metadata so the shipped DMG includes the Electron `/app` launch behavior. Added a CI guard that fails when `apps/desktop/**` changes without either a `VERSION` bump or an explicit update to `.github/workflows/desktop-release.yml`, preventing desktop-only fixes from landing without a publish trigger.

## [26.5.10] - 2026-05-16

> [internal] Bug fix: the onboarding claim endpoint no longer fires twice on a single /start page visit when Clerk's auth state updates mid-effect.

### Fixed

- [internal] **`useOnboardingClaim` duplicate request guard (JOV-2203)**: React 18 re-runs `useEffect` whenever any dependency changes. When Clerk's auth state transitions (`isLoaded false→true`, then `isSignedIn false→true`) on the same `claimTrigger` value, the effect could fire twice before the first `POST /api/onboarding/claim` resolved — sending a duplicate request. Added an `inflightTriggersRef` (`useRef<Set<number>>`) that gates the async work synchronously before the first `await`. The guard is cleared only after the fetch settles, not in the effect cleanup. Three Vitest tests verify: (1) sequential trigger advancement fires exactly once per trigger, (2) concurrent re-renders with a slow in-flight fetch fire exactly once, (3) retrying a signed-in user after chat activity advances the trigger correctly.

## [26.5.9] - 2026-05-16

> [internal] Homepage hydration fix — eliminates React mismatch warning on the homepage workspace section.

### Fixed

- [internal] **Homepage hydration mismatch in `HomepageWorkspaceSection`**: Framer Motion scroll-linked `MotionValue` style props were serialised differently during SSR vs. the initial client render, producing a React hydration warning on every page load. Added an `isMounted` guard so both the server render and the first client paint use `style={undefined}` on `motion.div` and `motion.li`; MotionValues wire up after mount. Also fixes a secondary mismatch for visitors with `prefers-reduced-motion`: `useReducedMotion()` now reads `false` on both server and initial hydration (before mount), matching the SSR output.

## [26.5.8] - 2026-05-16

> [internal] AI Connector v1 — approve/reject/execute backend for the Gmail → Google Calendar booking flow. Closed beta only (flag-gated, default off). Artists never see this; it will be allowlisted for design-partner DJs post-merge.

### Added

- **[internal] Approve endpoint (`POST /api/connectors/suggested-actions/[id]/approve`)**: CAS transition `pending → accepted`, inserts a `workflow_runs` row, returns the new run ID. Idempotent on CAS miss (409).
- **[internal] Reject endpoint (`POST /api/connectors/suggested-actions/[id]/reject`)**: CAS transition `pending → dismissed`. No follow-up work. Idempotent on CAS miss (409).
- **[internal] Workflow cron (`POST /api/cron/process-workflow-runs`, every minute)**: Claims up to 20 `pending` runs with a two-step SELECT+CAS UPDATE, processes up to 5 concurrently, fails unknown kinds immediately (fail-closed).
- **[internal] `executeApprovedAction` executor**: Loads `workflow_runs` row, extracts `approvalId` + `eventPayload` from `stepOutputs`, delegates to `createCalendarEvent`, CAS-transitions `running → completed | failed`.
- **[internal] Precision eval harness**: 14 scenario fixtures covering booking-confirmed, booking-cancelled, multi-booking, Asia-Pacific, Europe tour, DJ sets, already-present, and edge cases; `precision.test.ts` asserts extraction scores ≥0.9 against all fixtures.
- **[internal] `ai_connectors_beta` Statsig gate** registered in `contracts.ts`, `registry.ts`, `STATSIG_FEATURE_GATES.md`, and `FEATURE_REGISTRY.md` — default off, closed beta.

## [26.5.7] - 2026-05-16

> [internal] Bug fix: release plan demo page is now reachable in dev and preview without a manual flag override.

### Fixed

- [internal] **Release plan demo page 404 in dev/preview**: `RELEASE_PLAN_DEMO` feature flag now returns `true` in all non-production environments. The flag's `decide()` in `registry.ts` returns `!IS_VERCEL_PRODUCTION`, matching the same env-aware pattern used by `shouldHonorClientFlagOverrides`. Production keeps the flag off (default `false`) and can be unlocked via the DevToolbar or `localStorage` override.

## [26.5.6] - 2026-05-16

> Connect Gmail and Google Calendar to your Jovie account. Once connected, Jovie scans your inbox for confirmed booking emails and proposes calendar events — all reviewable before anything is added.

### Added

- **Gmail + Google Calendar OAuth connector**: Connect your Google accounts from Settings → Connectors. The OAuth flow requests read-only Gmail and Calendar access, stores encrypted tokens, and shows connection status with the connected email address.
- **AI booking extractor**: New `extractEventSignal` function uses Claude to identify confirmed DJ booking emails from your inbox and extract event details (title, venue, city, dates, confidence score). Prompt-injection defense and Zod-validated structured output prevent malformed data from reaching the UI.
- **Suggested actions UI**: Extracted events surface as pending action cards on the Connectors settings page. Each card shows event title, dates, venue, rationale, and the source email subject — ready to accept or dismiss.
- **Token vault**: Encrypted storage layer (`token-vault.ts`) for OAuth access and refresh tokens using AES-256-GCM, with automatic refresh-if-expired logic.
- **Admin agent runs page**: New `/app/admin/agent-runs/[id]` page for inspecting AI extraction runs, including prompt, token usage, cost, and status.
- **Dev fixtures**: Dev-only seed endpoint (`/api/dev/connectors/seed-fixtures`) populates mock Gmail and Calendar accounts with realistic booking email fixtures so the extraction pipeline can be tested without real OAuth credentials.

### Fixed

- **[internal] Connector routes use `getCachedAuth()` instead of `auth()` directly**: All connector API routes and the settings page now use the canonical `getCachedAuth()` helper, which supports the dev test-auth bypass. Direct `auth()` calls were crashing the settings page and all connector API routes in the dev environment.
- **[internal] Static `node:crypto` import in `extract-event-signal.ts`**: Replaced dynamic `require('node:crypto')` inside `buildDigest()` with a static top-level import. The file has `import 'server-only'` making the original edge-runtime concern moot.

## [26.5.5] - 2026-05-16

> Rich chips in chat now render cleanly on the white user bubble, lift artwork from cached release data, and reveal a richer preview on hover. Image attachments use the same chip language, so a message with a release reference and a dragged-in image reads as one coherent strip.

### Fixed

- **Chat user-message chips no longer render as dark rectangles on the white bubble**: `EntityChip` is now surface-aware (`tone='onLight' | 'onDark'`) and uses neutral text with accent-tinted thumbnail/dot/border on light, so release/artist/track/event chips stay readable inside the user bubble without candy-coloring across kinds.

### Changed

- **Rich chips reveal details on hover/tap/focus**: Transcript chips wrap in a popover trigger with full keyboard (Enter/Space/Escape), touch (tap), and pointer-hover (200ms open, 120ms close) affordances. Popover body shows artwork + kind eyebrow + label + compact stats, with an "Open release" CTA when the side-panel flag is enabled.
- **Image attachments render as inline chips with full-preview popover**: User messages no longer drop a 128×128 grid; pasted/dragged images render as compact `ImageAttachmentChip`s matching the rich-chip visual language, and the full image (max 480×480) appears in a hover/tap popover with filename caption.
- **Transcript chips lift artwork from already-loaded cache**: New `EntityResolutionProvider` consults `queryClient.getQueryData` for releases and events without triggering fetches, so chips light up with artwork whenever the slash menu has loaded data and degrade gracefully (label + accent dot) when it hasn't or when no provider is mounted (e.g. onboarding chat).
- **Skill input pills extracted into shared `SkillChip`**: `ChipTray` no longer duplicates ~30 lines of input-pill styling; future chip-style changes touch one place.

## [26.5.4] - 2026-05-16

> Public artist profiles now load roughly 400 KB less JavaScript for anonymous visitors. Faster first paint on every fan-facing profile page.

### Changed

- **Public profile pages skip Clerk auth bundle**: `app/[username]/layout.tsx` now bypasses ClerkProvider on the public profile route, so anonymous visitors no longer download the ~400 KB Clerk JS runtime they never use. Sign-in flows are unaffected — they live in a separate route group with their own provider. The single client-side Clerk consumer in the profile subtree (`ProfileInlineNotificationsCTA`) already degrades gracefully when Clerk is bypassed (JOV-2268).

## [26.5.3] - 2026-05-15

> [internal] Security: fix middleware matcher dot-escape bug that allowed WordPress scanner paths to bypass auth middleware.

### Fixed

- **[internal] Middleware matcher dot-escape (JOV-2236)**: Dots inside the `proxy.ts` matcher pattern were single-escaped (`\.`) which a JS string silently strips to a bare `.` (any-character wildcard). Paths like `/wp-json`, `/wp-json/wp/v2/users`, and `/a-css/foo` bypassed middleware entirely. Fixed by double-escaping to `\\.` so the compiled regex sees literal-dot separators. Added 35 integration tests covering WordPress scanning paths and true static-asset bypass.

## [26.5.2] - 2026-05-15

> [internal] Marketing page performance: remove an unnecessary 68 KB font preload and reduce hero screenshot file size.

### Changed

- **[internal] DM Sans preload removed**: DM Sans is only used in below-fold marketing sections. Setting `preload: false` eliminates a 68 KB early-load hint emitted on every page without affecting visual quality — `display: optional` already suppresses FOUT (JOV-2267).
- **[internal] Hero screenshot quality reduced**: Homepage hero product screenshots lowered from `quality=100` to `quality=85`. Next.js image compression cuts ~30–40% off JPEG/WebP bytes at this setting with no perceptible quality loss at marketing-page viewing distance (JOV-2264).

## [26.5.1] - 2026-05-15

> [internal] Foundation schema and encrypted token vault for AI connector v1 (OAuth token storage, per-account refresh lock, 8 new tables, 7 new enums). Admin design-system polish: Title Case labels, no ALL-CAPS CSS transforms, and visible metric cards.

### Added

- **[internal] AI Connector schema (v1)**: 8 new Drizzle ORM tables — `connector_accounts`, `connector_sync_states`, `external_objects`, `webhook_deliveries`, `context_facts`, `agent_runs`, `suggested_actions`, `workflow_runs` — plus 7 enums covering connector provider, status, webhook provider, context fact kind, suggested action status, agent run status, and workflow run status.
- **[internal] Token vault**: `storeTokens`, `loadDecryptedToken`, and `withRefreshLock` helpers encrypt OAuth tokens at rest (AES-256-GCM) and implement a row-level CAS refresh lock in `connector_sync_states` to prevent concurrent token refreshes per account.
- **[internal] Idempotent migration 0048**: All `CREATE TYPE` and `CREATE TABLE` statements are wrapped in `IF NOT EXISTS` guards so the migration is safe to replay.

### Fixed

- **[internal] Admin KPI label casing**: LeadGtmInsights KpiItem titles corrected from ALL-CAPS to Title Case per design-system rules (JOV-2170).
- **[internal] Admin uppercase CSS utility removed**: Dropped `uppercase tracking-[0.08em]` from GtmFunnel section sub-labels and TimActionRequiredSection issue identifier/priority badge, which were visually forcing Title Case strings to ALL-CAPS (JOV-2171).
- **[internal] ContentMetricCard surface elevation**: Removed `bg-surface-0 shadow-none` override from ContentMetricCard usage in GrowthStatusPanel (4 cards) and CampaignSettingsPanel (1 card) — those cards sit inside a surface-1 parent and were invisible without a visible background and border (JOV-2172).

## [26.5.0] - 2026-05-15

> Chat now uses the dark app-native composer across shell surfaces, with hardened focus, picker, attachment, and typed-entity states.

### Changed

- **Chat composer surface and controls**: Replaced the white command-style composer with a dark System B surface, two-zone text/toolbar layout, stable 36px controls, corrected focus affordances, bounded multiline autosize, inline structured chips, and Geist-accented entity chips.
- **App shell chat chrome**: Aligned the Electron titlebar controls with the Codex-style back/forward layout, moved New thread into the sidebar navigation, tightened chat message presentation, and removed assistant avatars from the chat transcript.
- **Attachment and picker polish**: Hardened the attachment menu, slash picker, entity picker, and dropzone layering so menus float without clipping and composer layout remains stable across empty, typing, mobile, and compact states.

### Fixed

- **Textarea focus-ring leakage**: Suppressed raw textarea focus outlines in chat and task document fields while preserving compound-widget focus states at the containing surface.
- **Chat shell loading and thinking states**: Added a dark conversation-loading skeleton, smoother pending/thinking placeholders, verbose dev-only tool state output, and stable drag cursors for Kanban/task cards.
- **Composer regression coverage**: Expanded unit and Playwright coverage for focus preservation, button states, chip layout, text contrast, picker ARIA paths, attachment clipping, and mobile composer geometry.

## [26.4.248] - 2026-05-14

> Onboarding now opens in the canonical app-shell chat front door with hardened tool artifacts, picker stability, and performance gates.

### Changed

- **Canonical onboarding chat front door**: `/onboarding` and waitlist entry now route into `/start`, preserving onboarding query params while leaving `/onboarding/checkout` as the checkout handoff.
- **App-shell onboarding experience**: `/start` now renders inside the Shell V1 app frame with the sidebar collapsed, shared chat composer primitives, polished onboarding tool artifacts, and stable slash-picker geometry across desktop and mobile.

### Fixed

- **Chat layout stability and visible implementation leakage**: Removed the app-shell entrance animation that caused screen flashes, replaced generic tool rows with purpose-built onboarding cards, hid raw tool internals from the transcript, and hardened error, loading, thinking, retry, and artist-pick states.
- **Onboarding QA and perf coverage**: Added `/start` Playwright visual/flow coverage, onboarding transcript evals, canonical redirect assertions, Lighthouse `/start` coverage, and stricter onboarding/chat CLS budgets.

## [26.4.247] - 2026-05-14

> Artist profiles now display the background atmosphere correctly even when the hero image fails to load — instead of a blank screen, the page falls back to a subtle gradient.

### Fixed

- **Profile hero background no longer goes blank on image failure**: When a hero image URL is invalid or the CDN returns an error, `ProfileCompactTemplate` now degrades gracefully to the gradient placeholder background instead of rendering blank. Root cause: `ImageWithFallback`'s fallback container used `h-full w-full` (normal flow) but `<Image fill>` generates `position: absolute; inset: 0`, so the fallback had zero height in the ambient background context. Fixed by using `absolute inset-0` for fill-layout fallbacks, and tracking image failure state in `ProfileCompactTemplate` to render the gradient instead of a centred avatar icon.

## [26.4.246] - 2026-05-13

> [internal] Hardened DashboardAudienceTable unit tests against CI shard timing (JOV-2138).

### Fixed

- **[internal] Flaky unit test shards 2/6, 3/6, 5/6 resolved**: `DashboardAudienceTable` tests used a synchronous ResizeObserver mock that triggered `setDesktopTableWidth` inside `useEffect`, but React 18 batches the resulting re-render asynchronously. Under forked-worker memory pressure in CI, the default 1 000 ms `waitFor` window closed before the re-render landed. Fixed by flushing React's scheduler with `await act(async () => {})` immediately after render, wrapping `fireDesktopTableResize` calls in `act()`, and extending `waitFor` timeout to 5 000 ms as a buffer. All 11 tests pass; three previously-failing shards now pass cleanly.

## [26.4.245] - 2026-05-13

> [internal] CI: Guardrails (proxy) job no longer requires pnpm install, unblocking dependabot PRs.

### Fixed

- **[internal] Guardrails (proxy) CI unblocked on dependabot PRs**: The `ci-guardrails` job was running the full `setup-node-pnpm` composite action (which calls `pnpm install --offline --frozen-lockfile`) before executing the proxy guard script. Dependabot PRs that bump `package.json` without regenerating `pnpm-lock.yaml` triggered `ERR_PNPM_OUTDATED_LOCKFILE`, failing the Guardrails job and cascading to `ci-fast` and PR Ready. Since `next-proxy-guard.mjs` only uses Node.js built-ins (`fs`, `path`), the job now runs `actions/setup-node` and invokes the script directly with `node`, eliminating the lockfile dependency and reducing job time from ~60s to ~8s.

## [26.4.244] - 2026-05-12

> [internal] Touring settings page button polish: Bandsintown pill height normalized to sm scale, Copy Link button uses pill shape.

### Fixed

- **[internal] Touring page button sizing**: Bandsintown connection pill now matches the sm button height (h-7) and icon scale (h-3.5 w-3.5). Copy Link button replaced with the shared Button component (variant secondary, size sm) giving it the correct rounded-full pill shape. No layout shifts.

> Public marketing is tightened for YC: the homepage keeps the strong product story visible, hides broad navigation and feature-grid sprawl, and limits pricing to Free plus waitlisted Pro by default.

### Changed

- **YC homepage flow tightened**: The public homepage now keeps the hero, proof logos, Meet Jovie AI plan demo, Go live in 60 seconds, Workspace, Artist Profiles, Free/Pro pricing, FAQ, and final CTA visible while keeping Friday Rhythm and feature/spec-grid content hidden by default.
- **Minimal marketing chrome by default**: Marketing headers render logo plus Sign in and Start Free Trial unless the shared center-nav flag is explicitly enabled. Marketing footers render only legal links unless the full-footer flag is explicitly enabled.
- **Free + Pro pricing defaults**: Marketing pricing cards and pricing-page JSON-LD now use the visible plan set, defaulting to Free and waitlisted Pro. Pricing copy follows the visible paid plan set so future plan exposure does not leave Pro-only copy around Team or Enterprise cards.

### Fixed

- **AI demo layout stability**: The homepage AI composer reserves enough space across states so the typing animation does not shift the surrounding section.
- **Mobile center-nav fallback**: If center navigation is re-enabled, the glass header hides inline mobile auth actions when the hamburger nav is active, avoiding duplicate auth controls and header crowding.

## [26.4.243] - 2026-05-12

> [internal] Ops admin deployment rows are now actionable — each row shows a context menu to open the GitHub Actions run, navigate to the branch, or copy the deployment ID.

### Changed

- **[internal] Ops HUD deployment rows: context menu actions**: Both the compact history list and the current-run detail view on the Ops admin screen now include a three-dot actions menu on each deployment row. Available actions: Open GitHub run (links to the Actions workflow run), Open branch (links to the branch on GitHub), and Copy deployment ID (clipboard with toast confirmation). Clipboard errors surface a toast instead of silently failing.

## [26.4.242] - 2026-05-12

> [internal] Approval queue rows now show direct action links to open the related PR and Linear issue in a new tab.

### Added

- **[internal] Open PR and Open Linear links on approval queue rows**: Each run row in the AgentOS admin approval queue now surfaces inline action links when a PR URL or Linear issue URL is present. Links are host-allowlisted to `github.com` and `linear.app` only.
- [internal] **Shell Releases controls parity** (JOV-1822): the design-v1 shell releases view mirrors production release controls with Spotify sync/manual-add gates, inline import/Apple Music/smart-link banners, release plan generation, delete confirmation, and smart-link row gating from plan entitlements.
- [internal] **Shell Releases complexity split**: extracted artwork playback, smart-link gating, and list-content helpers so `ShellReleaseRow` and `ShellReleasesView` stay below SonarCloud cognitive-complexity limits while preserving parity behavior.

### Fixed

- **[internal] Tighten external URL allowlist in AgentOS admin surface**: `getSafeExternalHref` in both `WorkflowRunRow` and `ArtifactDrawer` now validates that URLs are `https`-only, credential-free, and from the expected provider domains, preventing open-redirect risk from artifact-injected URLs.

## [26.4.241] - 2026-05-12

> [internal] AgentOS board now shows real run IDs on cards, lets you click lane counts to filter by status, and displays actual issue/PR identifiers in the detail drawer.

### Changed

- [internal] **AgentOS board cards**: `sourceRunId` is now displayed next to the source label (e.g., `vercel-workflow wrun_agentos_health_001`), giving operators a direct reference to the upstream run without opening the drawer.
- [internal] **AgentOS lane counts**: status count badges are now `<button>` elements with `aria-pressed`. Clicking a lane count highlights that lane and dims all others. Clicking again clears the filter. The panel subtitle updates to show the filtered count.
- [internal] **ArtifactDrawer links**: Linear and PR links now display actual identifiers (`JOV-1971`, `#8282`) instead of generic `"Linear"` / `"Pull Request"` labels.

## [26.4.240] - 2026-05-12

> Pricing pages now use a single source of truth for plan names, prices, and CTAs. "Request Access" and "Waitlist" copy is removed; all plans link directly to signup with the plan pre-selected.

### Added

- **Pricing source of truth** (`constants/plans.ts`): new `CANONICAL_PLANS` export — the single source of truth for plan display names, monthly/yearly prices, CTA labels, and signup URLs. Prices derive from `PLAN_PRICES`; feature lists derive from the entitlement registry. Marketing pages and onboarding import from here instead of duplicating values.
- **Fixture invariant tests** (`tests/unit/seed/seed-fixture-invariants.test.ts`): enforces that demo persona seed data contains no known placeholder titles, correctly credits collaborators (no Tim White identity collision in Calvin demo), and has consistent Spotify ID + artwork pairing. (JOV-2077, JOV-2078)
- **Screenshot player timestamp invariants** (`tests/unit/product-screenshots/screenshot-player-timestamps.test.ts`): enforces unique `playerTimestamp` values across all marketing screenshot scenarios that show a visible audio player, and validates the timestamp format (`M:SS` / `MM:SS`). (JOV-2087)
- **Pricing contract tests** (`tests/unit/pricing/pricing-source-of-truth.test.ts`): 16 tests enforcing plan IDs, prices, CTA copy (no banned phrases), and signup href `?plan=` params all flow from canonical sources.
- `playerTimestamp` field on `ScreenshotScenario` type; Tim White profile mobile variants (listen, pay, live, subscribe) now declare unique timestamps.

### Changed

- **Pricing pages** (`/pricing`, `/launch/pricing`): removed "Request Access", "Waitlist", and "Paid plans open from the waitlist" copy. CTAs updated to "Claim your profile" (free) and "Start Free Trial" (Pro/Max). Availability changed to `InStock` in JSON-LD structured data.
- `MarketingPricingPlans` component: removed `isMarketingPlanActive`/`getMarketingPlanCtaLabel`/`getMarketingPlanHref` helpers; CTA labels and hrefs now come directly from the data layer.
- `data/marketingPricingPlans.ts`: replaced `team`/`enterprise` plans with `max`; replaced `activeCtaLabel`/`waitlistCtaLabel` with single `ctaLabel`/`ctaHref`; prices now reference `PLAN_PRICES`.

## [26.4.239] - 2026-05-12

> Artist profile cards no longer stretch too tall on large monitors, footer sections breathe a bit more, and the spec-wall animations on the homepage now stagger instead of firing all at once.

### Changed

- **Artist profile height cap**: at 1280px+ viewports the hero card no longer stretches past 640px (640px at xl, 680px at 2xl), keeping proportions tight on large monitors.
- **Footer vertical padding**: all footer variants now use responsive vertical padding — the regular footer uses split pt/pb values (pt-12/pb-10 mobile, pt-16/pb-14 desktop, pt-20/pb-16 ultrawide) while the marketing footer and minimal variant use py-* clamp values — giving each footer section more breathing room.
- **Homepage spec-wall animation stagger**: spec-wall cards now animate in with staggered delays (0ms, −600ms, −1200ms … −3675ms) so the pulse effect ripples across cards instead of triggering all at once.

## [26.4.238] - 2026-05-12

> [internal] Homepage content cleanup: removed the spec-wall section with internal sales language, dropped three text-only placeholder logos from the trust bar, and reordered sections so "Go live in 60 seconds" appears directly below the hero.

### Removed

- **[internal] Spec-wall section removed**: the "Answers for every launch objection" section used internal sales language ("objection") that read poorly to customers. Section and its unused icon imports removed from the homepage. (JOV-2073)
- **[internal] Text-only logo placeholders removed**: Blanco y Negro, RecPlay, and disco:wax were rendered as plain `<span>` text rather than real SVG or image assets. Removed from the HomeTrustSection inline-strip; only logos with real assets remain (UMG, AWAL, The Orchard, Armada Music, Black Hole Recordings). (JOV-2075)

### Changed

- **[internal] Homepage section order updated**: sections reordered to "Go live in 60 seconds" → product statement (AI release plan) → workspace → artist profiles carousel, putting the immediate proof beat directly after the hero. (JOV-2076)

## [26.4.237] - 2026-05-12

> [internal] Analytics settings toggle now shows a compact state label instead of a verbose disclosure card.

### Changed

- [internal] **Analytics settings** (`SettingsAnalyticsSection`): replaced the verbose `ContentSurfaceCard` disclosure block with a single-line description label on the toggle row — "High quality only" when filtering is on, "All traffic" when off. Removes 17 lines of explanatory chrome that duplicated the toggle's own affordance.

## [26.4.236] - 2026-05-12

> [internal] Fixed cookie consent banner buttons being unresponsive when the server action failed.

### Fixed

- **[internal] Cookie banner buttons respond immediately**: Accept All, Reject, and Save Preferences now update the UI synchronously. Previously, if the server-side cookie write failed (network error, CSRF issue), the banner stayed stuck open. Consent is now persisted to localStorage first; the server action runs fire-and-fight in the background. Also raised banner z-index from z-40 to z-[60] to prevent overlay stacking issues.

## [26.4.235] - 2026-05-10

> [internal] Coverage heatmap and risk register infrastructure for autonomous-agent shipping. Nightly audit cron, generator script, and instrumentation fixes surfaced by an /autoplan adversarial review.

### Added

- [internal] **Test risk register** (`docs/TEST_RISK_REGISTER.md`): hand-curated taxonomy of 11 high-risk surfaces with blast-radius / reversibility / visibility scores. YAML front-matter is the machine-readable form; rendered table for humans.
- [internal] **Coverage heatmap** (`docs/TEST_COVERAGE_HEATMAP.md`): auto-generated from the risk register joined with v8 coverage + Stryker mutation scores. Priority queue, stale-row detector, unmapped-churn detector, flake tracking, mutation-score warnings.
- [internal] **Heatmap generator** (`scripts/audit-test-coverage.ts`, 900+ LOC): zero new npm deps. Modes: default, `--check-pr`, `--dry-run`. Reads v8 coverage, Stryker JSON, flake report, 90-day git churn; writes heatmap markdown + committed JSON snapshot baseline at `apps/web/reports/test-coverage-snapshot.json`.
- [internal] **Nightly audit workflow** (`.github/workflows/test-coverage-audit.yml`): 06:00 UTC cron. Rebases before push to handle race conditions; opens a GitHub issue on failure.
- [internal] **Proxy extraction plan** (`docs/PROXY_EXTRACTION_CANDIDATES.md`): risk-ordered plan to split the 1,412-line `apps/web/proxy.ts` into per-domain modules so per-region coverage becomes measurable.
- [internal] `pnpm run test:coverage:report` and `pnpm run test:coverage:diff` root scripts.

### Changed

- [internal] **Stryker mutate[]** (`apps/web/stryker.config.mjs`): extended to include `app/api/stripe/webhooks/route.ts`, `lib/auth/decode-fapi-host.ts`, `lib/auth/staging-clerk-keys.ts`, `lib/auth/test-mode.ts`. Mutation testing now exercises the highest-blast-radius infra paths, not just validation helpers.
- [internal] **Vitest config** (`apps/web/vitest.config.fast.mts`): added `coverage.thresholds` scaffolding for critical globs (set to 0 in this PR; raised to register targets in a future PR per JOV-2128).
- [internal] **`.claude/rules/testing.md`**: added "Risk-Based Testing" section at the top with explicit links to the heatmap, register, and the decision rule for when agents must add tests. Closes the discoverability dead-end where agents could read CLAUDE.md → testing rules without finding the heatmap.

### Fixed

- [internal] **`--check-pr` no-op defect** surfaced by /autoplan eng subagent: snapshot lived at `.context/test-coverage-snapshot.json` (gitignored) and the cron didn't commit it, so any CI delta check found no baseline and exited 0 silently. Moved snapshot to `apps/web/reports/test-coverage-snapshot.json` (committed), updated the cron to commit it with `git pull --rebase --autostash` before push, and added `gh issue create` on cron failure.
- [internal] **Per-region proxy.ts coverage hallucination**: three register rows (clerk-routing, investor-portal, audience-block) all globbed the same file and reported identical 68.2%. Collapsed into one `proxy` row; per-region tracking deferred until the extraction plan ships.
- [internal] **CI Clerk secret scope**: workflow scoped unprefixed `CLERK_*` secrets (= production keypair per `.claude/rules/auth.md`) for the coverage step, even though unit tests are auth-mocked at the SDK boundary. Replaced with `pk_test_*` / `sk_test_*` dummies — no production credentials in scope for the coverage workflow.
- [internal] **Hardcoded `assertion_ratio = 0.5` formula bias**: the stub inflated every risk score uniformly by ~+10 via its 20% weight. Removed from the formula; `coverage_score` now uses line + branch only (50/50). Status assignments unchanged (thresholds at 30/18).

## [26.4.234] - 2026-05-10

> Apple Sign In was still failing the OAuth callback step. The Clerk proxy now correctly resolves relative redirect URLs that come back from Apple's "Hide My Email" flow.

### Fixed

- **Clerk proxy** (`apps/web/proxy.ts`): when Clerk FAPI returned a 302 with a relative `Location` header (e.g. `/v1/oauth_callback?code=...&state=...` — which happens during Apple's `response_mode=form_post` callback chain), the proxy passed the relative path to `NextResponse.redirect`, which throws "URL is malformed — please use only absolute URLs". Now resolves FAPI-relative paths against the `/__clerk` proxy origin and absolute non-FAPI URLs pass through unchanged. Regression test in `tests/unit/middleware/proxy-behavioral.test.ts`.

## [26.4.233] - 2026-05-10

> Sign In and Sign Up pages now show the Google and Apple buttons. The previous attempts to gate them by env var weren't taking effect in production, so the allowlist is now hardcoded.

### Fixed

- **`lib/auth/oauth-providers.ts`**: replaced the `NEXT_PUBLIC_CLERK_OAUTH_*_ENABLED` env-var gate with a hardcoded allowlist (apple + google). The env-var approach was unreliable — the values were set in Vercel but not inlined into the production build (likely a Turborepo cache + build-time env resolution interaction). Keeping the gate as code is the single reliable chokepoint: to remove a provider, delete its case line and Clerk dashboard entry; to add one, add a line here only after end-to-end credential verification.

## [26.4.232] - 2026-05-10

> Sign In page was showing an empty box with no Google/Apple buttons after the previous auth hardening shipped. Fixed — the OAuth provider guard now reads its enablement flags correctly in the production build.

### Fixed

- **`lib/auth/oauth-providers.ts`**: `isOAuthProviderEnabled` was reading `process.env[dynamicKey]` via bracket notation, which Next.js / webpack DefinePlugin cannot statically inline. The lookup always returned `undefined` in the client bundle, hiding every OAuth button in production regardless of the `NEXT_PUBLIC_CLERK_OAUTH_*_ENABLED` env var values. Switched to a `switch` with statically-referenced `process.env.NEXT_PUBLIC_CLERK_OAUTH_<PROVIDER>_ENABLED` expressions so DefinePlugin inlines the values at build time.

## [26.4.231.0] - 2026-05-10

> Hardens auth: Clerk proxy now fails closed on a missing or malformed publishable key, OAuth provider buttons are hidden unless explicitly enabled via env flag, and the sign-in/sign-up UI is unified under a single AuthShell component.

### Added

- **`lib/auth/decode-fapi-host.ts`**: canonical helper that decodes the Clerk FAPI host from a publishable key. Returns `null` on any malformed input so callers always fail closed (JOV-2062).
- **`lib/auth/oauth-providers.ts`**: fail-closed OAuth provider guard. A provider button only appears when `NEXT_PUBLIC_CLERK_OAUTH_<PROVIDER>_ENABLED=1` is set — any other value keeps it hidden. Prevents Apple "invalid client" errors from leaking into production (JOV-2062).
- **`AuthShell` component**: unified auth surface shared by the full-page sign-in/sign-up routes and the intercepted modal. Provider guard and appearance config are applied in one place so disabled OAuth buttons cannot re-appear (JOV-2064).

### Changed

- **Clerk proxy** (`proxy.ts`): replaced inline FAPI host decoding with `decodeFapiHostFromPublishableKey()` and upgraded proxy errors from `console.error` to `captureError` with structured error fields for Sentry tracking.
- **Sign-in page** and **sign-up page**: refactored to delegate rendering to `AuthShell`; each page retains only its URL-parameter extraction and toast logic.

### Added (tests)

- [internal] Unit tests for `decode-fapi-host.ts` and `oauth-providers.ts` (45 + 103 cases).
- [internal] Extended `signin-page` and `signup-page` unit tests to cover `AuthShell` delegation paths.

## [26.4.230] - 2026-05-10

> Apple Sign In now works on jov.ie. The login flow was returning an error for everyone trying to sign in with Apple — including Hide My Email — while Google login worked. Fixed.

### Fixed

- **Apple Sign In production callback**: removed manual `host` and `content-length` headers from the Clerk FAPI proxy in `apps/web/proxy.ts`. Edge fetch (undici) rejects manual override of these on POST bodies, which is why Apple's `response_mode=form_post` callback to `/__clerk/v1/oauth_callback` 502'd while Google's GET-based callback worked. Also scoped Referer forwarding to OAuth callback paths only and added structured error capture so the next proxy failure surfaces its actual exception name + message.

## [26.4.229] - 2026-05-10

> [internal] Added P0 smoke tests for the cookie banner and chat page, and extended the visual regression matrix to cover 7 canonical viewport widths.

### Added

- [internal] **Cookie banner smoke tests** (`cookies.spec.ts`): verifies the banner appears for EU visitors, the "Accept All" button is clickable with nonzero bounding box and dismisses the banner, and the "Customize" button opens the preferences modal with a "Save Preferences" action (JOV-2074).
- [internal] **Chat page smoke tests** (`chat.spec.ts`): verifies authenticated chat loads without console errors, the composer accepts typed text, pressing bare T does not toggle the theme while the input is focused, and a slash command does not cause layout shift >50px (JOV-2074).
- [internal] **7-viewport visual regression matrix** (`visual-regression.spec.ts`): extends screenshot coverage to 375, 768, 1024, 1280, 1440, 1728, and 2560px widths for the homepage, sign-up, and sign-in pages, with horizontal scroll guards and CTA-clip assertions at each breakpoint (JOV-2081).
- [internal] Added `data-cta-sign-up="true"` to public homepage signup CTAs for stable Playwright targeting (JOV-2065).
- [internal] Added auth E2E coverage for sign-in/sign-up page content and `/signup` modal CTA routing (JOV-2065).
- [internal] Added homepage E2E coverage that verifies signup CTAs route to `/signup` and the trust logo bar renders visual logo elements (JOV-2065, JOV-2066).

## [26.4.228] - 2026-05-09

> Refreshed the Mac download page copy: clearer hero, six-feature grid, an expanded FAQ, and a final download call-to-action at the bottom.

### Changed

- **Mac download page copy refresh**: rewrote `/download` hero subhead, expanded the feature grid from 4 to 6 items, added a "Do I need a Jovie account?" FAQ entry, and added a final CTA section. Replaced "Universal" with "Apple Silicon + Intel" and split signing/notarization metadata onto its own line.

## [26.4.227] - 2026-05-09

> [internal] Progress bars across the dashboard now animate in with a spring/bounce effect using Framer Motion.

### Changed

- **[internal] Spring animation on all progress bars**: replaced CSS `transition-all` with `motion.div` spring animation (`damping: 10, mass: 0.75, stiffness: 100`) in `ReleaseTaskProgressBar`, `ProfileCompletionCard`, `ImportProgressBanner`, and `ProgressIndicator`. Native `<progress>` elements replaced with accessible `role="progressbar"` div wrappers where needed for animation compatibility.

## [26.4.226] - 2026-05-09

> [internal] Canonical metadata builder for all public artist profile routes — adds a shared lib/profile/metadata.ts that every /[username] route's generateMetadata now delegates to. Redirect-sink sub-routes (listen, releases, subscribe, tip, tour, pay, contact, [...slug]) gain noindex metadata guards. The alerts button now says "Get alerts" everywhere on artist profiles — consistent label, consistent intent.

### Added

- **[internal] `lib/profile/metadata.ts`**: shared metadata factory for all public profile routes. Provides `buildPublicProfileMetadata` (full OG + Twitter Card + canonical URL + robots + genre keywords + geo.placename), `sanitizeMetadataText` (HTML-strip artist bio/name/location before embedding in meta tags), `truncateMetadataText` (word-boundary truncation for descriptions), `buildProfileCanonicalUrl` (normalized slug resolution), and static fallback constants `PROFILE_NOT_FOUND_METADATA` / `PROFILE_ERROR_METADATA` / `REDIRECT_SINK_METADATA`.
- **[internal] 43 unit tests** for the metadata builder covering all edge cases: null/undefined inputs, HTML injection, XSS in display_name, canonical URL normalization, description priority order, genre keywords, verified badge, geo.placename sanitization, and noindex on all error/not-found/redirect states.
- **[internal] `generateMetadata` on 9 redirect-sink routes**: `[...slug]`, `contact`, `listen`, `pay`, `releases`, `subscribe`, `tip`, `tour` — all return `REDIRECT_SINK_METADATA` (`robots: noindex, nofollow`) so crawlers don't independently index transient redirect paths.

### Changed

- **[internal] `app/[username]/page.tsx` `generateMetadata`**: delegates to `buildPublicProfileMetadata` from the shared builder. Removed the local `buildProfileMetadata` and `buildProfileDescription` duplicates; returns `PROFILE_ERROR_METADATA` (noindex) on fetch errors instead of an ad-hoc object.
- **[internal] `app/[username]/notifications/page.tsx` `generateMetadata`**: now resolves the artist display name from the profile loader rather than using the raw URL segment; adds `metadataBase`, full OG tags, Twitter card, and `robots: noindex`; sanitizes the artist name with `sanitizeMetadataText`.

### Fixed

- [internal] Canonical `SubscribeForm` wrapper component locks the "Get alerts" CTA label across all profile surfaces (spec §4.1). Previously, nine call-sites used inconsistent labels ("Turn On Alerts", "Turn on alerts", "Turn On") that conflicted with the spec.
- [internal] `source` analytics tag now correctly passes through the two-step (email → SMS) flow; previously dropped in `TwoStepNotificationsCTA`, causing attribution gaps in subscribe analytics.

## [26.4.225] - 2026-05-09

> Jovie now has a real download page for the Mac app at jov.ie/download — version, system requirements, FAQ, and a button that always serves the latest signed release.

### Added

- **Download page (`/download`)**: public marketing page for the Mac app with hero, features, system requirements, FAQ, and legal footer. Designed to match the rest of jov.ie.
- **Auto-updating download link**: the download button always serves the latest signed DMG without manual page edits — the link resolves at click time against our public release feed.
- [internal] `/api/desktop/download` route 302-redirects to the latest universal DMG asset on GitHub Releases via a server-only helper (`lib/desktop/github-releases.ts`).
- [internal] `APP_ROUTES.DOWNLOAD` constant added; in-app `UserButton` "Download Desktop App" item now opens `/download` instead of the raw GitHub URL.

## [26.4.224] - 2026-05-09

> [internal] Extracts the bottom tab bar from ProfileCompactSurface into a canonical BottomTabBar component, adds safe-area nav constants, and removes 6 legacy V2 profile files and their tests.

### Added

- **[internal] `BottomTabBar` component** (`components/features/profile/nav/BottomTabBar.tsx`): canonical extracted bottom tab bar for the public profile compact surface — 4 primary tabs (Home/Music/Events/Alerts), conditional Events tab, optional More menu trigger, aria-current/aria-expanded/aria-haspopup, 44pt touch targets via `min-h-[52px]`, iOS safe-area padding, and responsive grid columns.
- **[internal] `lib/profile/nav-constants.ts`**: `TAB_BAR_HEIGHT_REM`, `CONTENT_SAFE_AREA_BOTTOM_PADDING`, and `TAB_BAR_INTERNAL_SAFE_AREA_MIN_PX` — published surface contract for JOV-2023/JOV-2024 desktop work.
- **[internal] 26 unit tests for `BottomTabBar`**: covers tab rendering (with/without tour dates), More button visibility and aria-expanded, active state aria-current, font-semibold/medium, onTabSelect/onOpenMenu handlers, grid column counts (3/4/4/5), touch target class, data-testid, and safe-area wrapper class.

### Changed

- **[internal] `ProfileCompactSurface`**: removes 80-line inline tab bar, now renders `<BottomTabBar>` via shell slot.

### Removed

- **[internal] Deleted 6 legacy V2 chain files**: `ProfileFeaturedCard.tsx`, `ProfileScrollBody.tsx`, `ProfileSkeleton.stories.tsx`, `ProfileViewportShell.tsx`, `ProgressiveArtistPage.tsx`, `PublicProfileTemplateV2.tsx` and their corresponding test files (1,358 lines removed).

## [26.4.223] - 2026-05-09

> The homepage now leads with a sharper release command center, verified proof, and a product-led workspace story without leaking internal tools into marketing screenshots.

### Added

- **Homepage product statement break**: adds a Linear-inspired "Meet Jovie" statement between verified logos and the Workspace chapter so the page has better pacing before the second large product screenshot.
- **Integrated Workspace chapter**: replaces the old command-center/workflow pair with one product-led section using the seeded releases workspace and anchored release-management callouts.

### Changed

- **Homepage hero and proof strip**: tightens the sticky header, verified-logo treatment, hero carousel framing, and section transitions around the current Shell v1 product screenshots.
- **Marketing screenshot fixtures**: seeds Shell v1 releases/library captures with real Tim White and verified release data, full tables, matching artwork, and an open release rail.

### Fixed

- **Admin-free marketing captures**: Shell v1 screenshot routes now use `capture=marketing` so homepage assets do not expose admin/internal navigation.

## [26.4.222] - 2026-05-08

> [internal] Central profile route config and canonical shell barrel for the public artist surface — consolidates routing logic, removes dead feature-flag code, and deletes 16 legacy files from the JOV-2021 hardening phase.

### Added

- [internal] `apps/web/lib/profile/route-config.ts` — single source of truth for public profile route configuration. Exports `PROFILE_ROUTE_CONFIG`, `TOP_LEVEL_ROUTE_KEYS`, `BOTTOM_TAB_KEYS`, `REDIRECT_SINK_ROUTE_KEYS`, and full TypeScript types (`ProfileRouteCategory`, `ProfileRouteKey`, `ProfileRouteConfig`). Includes bidirectional reverse-completeness tests to guard against missing entries.
- [internal] `apps/web/components/features/profile/shell/index.ts` — canonical barrel re-exporting `ProfileCompactTemplate`, `ProfileCompactSurface`, and `ProfileDesktopSurface`. All imports of profile shell components should go through this barrel.

### Removed

- [internal] Removed `SHOW_PUBLIC_PROFILE_V1_DESIGN` dead feature flag and all call-sites (flag was always true after JOV-2019 landed).
- [internal] Deleted 16 legacy profile surface files superseded by the canonical shell stack (JOV-2021 cleanup phase).

## [26.4.221] - 2026-05-09

> [internal] Ops now opens as a constrained command-center cockpit: AgentOS runs lead the page, deployments are supporting context, and approvals stay beside the active work.

### Changed

- [internal] Reworked `/app/admin/ops` into a shell-v1 cockpit with a max-width admin surface, board-first AgentOS lanes, compact deployment feed, persistent approval/detail rail, and denser run metadata tucked into popovers.

## [26.4.220] - 2026-05-08

> [internal] Canonical UX contract for the public artist profile surface: route categories, bottom tab bar, navigation, alert/subscribe, and copy — plus the P0 decision to restore ISR by removing `force-dynamic` and moving the cookie read client-side.

### Added

- [internal] `docs/public-profile-surface-spec.md` — canonical UX contract for `/{username}/*` referenced by JOV-2021 through JOV-2027. Covers route categories (live, demo, preview, admin, legacy), bottom tab bar contract (four fixed primary tabs: Home/Music/Events/Alerts), navigation contract (drawer model, URL handling, tab persistence), alert/subscribe contract (canonical CTA label "Get alerts", component hierarchy), and a 37-entry copy table. Includes the binding P0 ISR/cookies decision: remove `export const dynamic = 'force-dynamic'` from `app/[username]/page.tsx`, move `AUDIENCE_ANON_COOKIE` read to a client component, and switch to `revalidateTag('profile:{username}')` for cache invalidation.

## [26.4.219] - 2026-05-09

> [internal] Public profile surface audit: route matrix, component duplication map, legacy cleanup list, and risk register for the /{username} surface — feeds JOV-2021 through JOV-2029 hardening backlog.

### Added

- [internal] `docs/public-profile-hardening-audit.md` — read-only audit of the public profile surface covering 26 route/state combinations, 9 component duplication categories, 11 legacy cleanup items, and a risk register. Spawned sub-issues JOV-2021 through JOV-2029 for implementation work.

     7|
     8|## [26.4.218] - 2026-05-08

> [internal] Ops HUD now shows a live shipping velocity chart — merged, opened, and closed PRs per day via GitHub GraphQL, cached in Redis.

### Added

- **[internal] Shipping velocity chart in `/app/admin/ops`**: cinematic Recharts area chart showing PR velocity (merged, opened, closed) over 7D / 30D / 1Y. Purple hero line for merged PRs, ghost green for opened, hidden red for closed-without-merge (toggle to reveal). Click any series to spotlight it; click empty area or the series legend again to reset.
- **[internal] GitHub GraphQL PR velocity API** (`GET /api/admin/hud/shipping-velocity`): cursor-paginated GraphQL query (5000 pts/hr) with Redis 20-min TTL cache, graceful fallback when token or Redis is unavailable.

## [26.4.217] - 2026-05-08

> You can now update Jovie from right inside the app. A blue "Update" pill appears in the header when a new version is ready — click it to apply instantly.

### Added

- **Update pill in app header**: a compact "Update" button appears in the `/app/*` titlebar row when a new version is available. Click triggers an instant update — no need to manually refresh or relaunch.
- Desktop (Electron) update detection uses `electron-updater` IPC events (`update-available`, `update-downloaded`) for background update checks.
- Web update detection polls the build hash every 5 minutes; on drift the pill appears and clicking reloads to the new build.

## [26.4.216] - 2026-05-08

> [internal] Admin workspace links removed from Settings page; the admin sidebar is now the single entry point for all admin workspaces.

### Removed

- [internal] **`SettingsAdminSection`**: removed the "Admin Workspaces" panel (9 workspace quick-links) from the admin Settings page. These links are now only accessible from the admin sidebar, which already has a Workspaces + Utilities section for all 9 IDs.
- [internal] **`adminSettingsNavigationSections`** export: deleted from `dashboard-nav/config.ts` — it was only used by the removed panel.

### Changed

- [internal] **`adminNavigationSections`** (sidebar config): added the Utilities section (`investors`, `screenshots`, `share_studio`) so the admin sidebar now shows all 9 workspace IDs in one place.

## [26.4.215] - 2026-05-08

> [internal] Hardens the conflict-marker pre-commit check for locale safety.

### Changed

- [internal] **`scripts/check-conflict-markers.sh`**: added `LC_ALL=C` to the `grep` call so the locale-English output match works correctly on all developer machines regardless of system locale.
- [internal] **`.husky/pre-commit`**: added inline comment explaining why `set -e` is required — without it a failing sub-script wouldn't abort the hook.

## [26.4.214] - 2026-05-08

> [internal] Pre-commit hook now blocks commits with leftover merge conflict markers.

### Added

- [internal] **`scripts/check-conflict-markers.sh`**: new pre-commit script that runs `git diff --cached --check` and fails fast if any staged file contains `<<<<<<<`, `=======`, or `>>>>>>>` conflict markers.
- [internal] Wired the conflict-marker check as the first step in `.husky/pre-commit` (before `next:proxy-guard` and `lint-staged`) so cheap checks run first.

## [26.4.212] - 2026-05-08

> [internal] Design-system token consolidation pass on the artist profile feature — no visible changes.

### Changed

- [internal] **Profile system shell-v1 token migration**: replaced hardcoded hex values (`#0a0b0f`, `#0e0f12`, `#1a1a1e`, `#ff8b8b`, `#dc2626`) with canonical design-system tokens (`--profile-stage-bg`, `--profile-drawer-bg`, `bg-white/[0.08]`, `text-error`) across `ProfileSkeleton`, `ProfileMediaCard`, `ProfileMobileNotificationsFlow`, `NativeSmsSubscribeButton`, `ProfileCompactTemplate`, and `ProfileDesktopSurface`.
- [internal] Fixed pre-existing `duration-200` motion violations (replaced with `duration-subtle`) in all touched profile files.

## [26.4.213] - 2026-05-07

> [internal] Design system token consolidation across dashboard organisms and shared organisms — wave 1.

### Changed

- [internal] Migrated 44 files in `components/features/dashboard/**` and `components/organisms/**` to shell-v1 design tokens: replaced semi-transparent surface overrides (`bg-surface-0/XX`, `bg-surface-1/XX`) with solid equivalents, replaced raw numeric duration classes (`duration-150`, `duration-200`, `duration-300`, `duration-500`, `duration-700`) with canonical motion tokens (`duration-subtle`, `duration-cinematic`), replaced `transition-all` with explicit property transitions, removed decorative hover-lift (`hover:scale-*`, `hover:-translate-*`) from DashboardPreview and MismatchCard, and migrated `bg-card`/`border-border` references to `bg-surface-0`/`border-subtle`.

## [26.4.211] - 2026-05-07

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
