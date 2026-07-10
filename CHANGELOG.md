# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project uses [Calendar Versioning](https://calver.org/) (`YY.M.PATCH`).

## [26.6.61] - 2026-06-28

> Outbound SMS provider integration ships behind `OUTBOUND_SMS_ENABLED`. Release alerts and webhook auto-replies (STOP/HELP) now route through a single Twilio connector.

### Added

- **[notifications] Outbound SMS connector (JOV-3626)**: `providers/sms/outbound-sms.ts` gates live Twilio POSTs behind `OUTBOUND_SMS_ENABLED`; `sendNotification()` SMS channel and inbound webhook auto-replies both use it; unit-economics spike documented in `NOTIFICATION_GUIDELINES.md`.

## [Unreleased]

- [internal] **Desktop renderer recovery (JOV-3595)**: recover from hosted loads that return HTTP 200 but never boot React, and route crashed or unresponsive renderers to the visible recovery shell instead of a permanent black window.
- [internal] Agent preflight: one-shot JSON bootstrap for /autoplan (JOV-4183)
- **[internal] Critical auth, activation, and billing identity hardening (JOV-4181)**: Stripe billing updates, trial activation, billing-status reads, and profile ownership checks now resolve Better Auth application users safely across the legacy Clerk-ID transition; deterministic regression tests cover the identity and compare-and-set predicates. CI now classifies onboarding, ingestion, memory, AI/workflow, enrichment, chat, and cron changes as high risk.
- **Jovie now presents one focused, dark career operating system from hero to conversion:** the homepage leads with “Jovie runs your music career,” shows one release workspace, replaces the profile carousel with three static artist outcomes, and connects release, fan capture, routing, learning, and next actions in one closed-loop story. The floating header, CTAs, chat bubbles, motion, reduced-motion behavior, and responsive alignment now follow the same compact System B rules.
- [internal] **Chat tool-card System B consolidation (JOV-3551)**: Shared `ChatToolSurface` primitive; one "Cancelled" dismiss verb; success accent uses `text-success` (no cyan-300); Make Live uses Play icon; album-art single title; nested merch action is flat (no card-in-card); analytics signal cards on surface tokens.
- **Opportunity Inbox home stack (JOV-3931–3935)**: Feature flag `inbox_home` gates a named Inbox nav item on `/app`, swipe/keyboard card-stack interactions, accept/reject decision writeback to the feedback store + taste-mirror builders, server-side pinned-opportunity context injection in chat, and a YouTube thumbnail playbook detector that emits evidence-backed suggested_actions (and measured report payloads without fabricated numbers).
- [internal] **Inbox stack implementation (JOV-3931–3935)**: `INBOX_HOME` app flag (default off); `OpportunityCardStack` (motion drag + ArrowLeft/Right/Enter); `buildPinnedOpportunityBlock` + `executeChatTurn` injection; `recordInboxDecision` on approve/reject; `inbox-taste-mirror` pure aggregators; `youtube-thumbnail-detector` playbook helpers + golden eval case.
- [internal] **Test reliability batch (JOV-4112, JOV-4033, JOV-1880)**: stop Playwright from importing `server-only` env helpers in E2E dashboard route resolvers; drop quarantined specs from the PR smoke manifest and add a guardrail test; seed a prebuilt claim fixture and desktop smoke for the GTM claim-link canary.
- **Tagging knows your world (JOV-3717)**: Artist picker cold-starts with your claimed Spotify artist and catalog collaborators (with ids) above Spotify search.

- **Public artist profiles now feel native at every size (JOV-2018)**: Square artwork stays square, portraits keep a face-safe crop, profile rails use one consistent card size, scrollbars stay out of sight, and sparse or subscription states no longer leave awkward gaps.
- **Unclaimed artist profiles now close with a cleaner claim poster (JOV-2018)**: Desktop AEO content uses a tighter editorial rhythm, then ends on oversized `jov.ie/you` type, one Spotify-verified proof line, and one claim action.
- **Library status badges no longer call released items "Draft" (JOV-3333)**: Grid cards and the release rail hero show Release Status only; Approval Status stays as a single editable control in Details.
- **Chat release right-rail System B polish (JOV-3493)**: Section cards use Library elevation, DSP rows show provider icons, and typography drops oversized/all-caps chrome.
- **Chat file attachments render as rich chips (JOV-3492)**: Uploaded audio/docs show a filetype icon + clean filename instead of raw Vercel blob URLs.
- **Provider-ingested released music can only be archived (JOV-3885)**: Soft-hide via `deleted_at` for ingested published releases; Jovie-created releases still hard-delete.
- **Search fills the whole screen (JOV-2982)**: Cmd+K opens a full-viewport search surface with the same clean input; results scroll the remaining height instead of a cramped centered card.


- [internal] **Single machine-readable design-token source, wave 1 (GH-12009, GH-10158)**: New `apps/web/design/tokens.json` compiled by `scripts/build-design-tokens.mjs` (`pnpm tokens:build` / `tokens:check`) into generated CSS (`--gray1..12` now resolve app-wide), a typed TS export, and an agent manifest. `--linear-*` namespace is now shrink-only ratcheted (`linear-namespace-ratchet.test.ts`, baseline 2242), and a source-vs-emitter divergence guard locks tokens.json to the live accent palette. No visual changes.
- [internal] **One EmptyState primitive (GH-12638)**: Canonical molecule at `components/molecules/EmptyState` (greyscale icon + Title Case heading + one sentence + primary CTA + optional text-link secondary). Migrated DSP presence/matches, insights, release tasks, and table empty surfaces onto it; deleted 5 bespoke `*EmptyState` components; component-family ratchet emptyState 14→9.
- Toasts and banners now share one canonical feedback system: confirmations and errors appear bottom-right and dismiss on their own, while system status stays pinned at the top until you dismiss it. (GH-12885)
- [internal] **Canonical feedback system (GH-12885)**: new `@/components/feedback` module (arity-preserving toast wrapper over sonner + `Banner`/`BannerViewport`/`FeedbackProvider`); all 124 direct `sonner` imports migrated to the canonical module; explicit 4s auto-dismiss default, max 3 stacked toasts, safe-area-aware bottom-right offset; unhandled TanStack mutation errors now surface a canonical error toast via a `MutationCache` fallback.
- [internal] **CI control-plane characterization (montevideo-v2)**: Locks merge-gate set, risk smoke/preview contracts, and required-check aggregates via `pnpm ci:control:test` (Structural Contract). Adds `scripts/lib/ci-control-plane.mjs`, `print-contract` CLI, deterministic metrics evaluation window, and forbidden pins for all harness merge-gate job names.

- [internal] **IRPAA cohort baseline + lift tracking (GH-12141)**: adds `artist_revenue_cohorts` (cohort tag `jovie_active`/`control` + immutable 30-day pre-Jovie revenue baseline, auto-assigned on first automation outcome), versioned dollarization weights (`lib/metrics/revenue-lift-weights.ts`), per-artist rolling revenue signal + lift rows (`lib/metrics/artist-revenue-cohorts.ts`), and the canonical `getIRPAA(window)` North Star rollup (`lib/metrics/irpaa.ts`). All proxy terms labeled with weights version + validation date.
- [internal] **Motion doctrine + easing gap tokens (GH-13636)**: `.claude/rules/motion.md` adapts Emil Kowalski's motion-craft rules (MIT, attribution in-file) onto System B tokens — duration table, easing decision tree, press/enter/popover/perf/a11y rules, review checklist. `design-system.css` gains `--ease-drawer` (iOS-like drawer settle curve) and `--scale-press` (0.96 canonical press feedback). Doctrine + additive tokens only; no component changes.

- **Plan-locked chat tools now explain and offer an upgrade instead of erroring (GH-13304)**: Asking Jovie for album art, photo retouching, or merch on the Free plan no longer dead-ends the conversation. Jovie describes what it would create, and a single upgrade prompt appears inline — with copy sourced from the plan registry so it always names the right plan.

- [internal] **AEO citation monitoring + brand integrity (GH-11037)**: Pure-function modules `lib/aeo/citation-monitor.ts` and `lib/aeo/brand-integrity.ts` implement share-of-citation measurement (tracks whether Jovie profile URLs are cited by answer engines for canonical artist queries) and same-name entity disambiguation (scores KB-anchor coverage, flags missing MusicBrainz/Wikidata/ISNI identifiers, and produces a disambiguating checklist mapping to schema.org fields). 47 unit tests. No migrations.

- **Chat replies no longer flash blank or flicker while Jovie starts answering (GH-11921)**: On send, the reply row keeps its thinking shimmer until the first real content arrives, and follow-up messages no longer briefly show the previous reply before the new one streams in.
- [internal] **Chat stale-stream guard (GH-11921)**: `useJovieChat` snapshots pre-turn assistant SDK message ids at send time; the delta/stop/error paths ignore the previous turn's assistant message so its parts are never dispatched into the fresh assistant row. `ChatMessage` keeps the shimmer during `streaming`-with-no-renderable-content instead of collapsing to blank. Regression tests: `useJovieChat.stale-stream.test.tsx` + `ChatMessage.test.tsx`.
- [internal] **Model A/B bake-off core (GH-11462, part 1/2)**: `model_experiments` / `model_usage_events` / `model_promotions` schema, deterministic weighted arm selection, and cost-aware promotion math (no runtime wiring yet).
- [internal] **Biome lint repair for desktop scripts (GH-13206)**: Resolved `organizeImports`, unused-var, and format drift in `apps/desktop/scripts/` — no logic changes, pre-commit gate stays green.
- **Profile pages no longer squash the hero image or stretch cards (GH-11899)**: The profile hero now keeps its intended crop with a 240px minimum height at every screen size, and profile cards render in fixed shapes with the action button always anchored at the bottom.
- [internal] **Profile composition layer (GH-11899)**: New `apps/web/lib/profile/composition.ts` + `--aspect-hero` / `--aspect-card-standard` theme tokens codify the deterministic profile rules (hero 16/7 crop + 240px floor; card shapes compact 1:1 / standard 4:5 / wide 16:9; CTA footer outside the clipped text zone). `EntityCard` gains an opt-in `shape` prop consumed by the profile carousel; hero/skeleton/desktop-cover/media-card instances adopt the tokens; arbitrary-values ratchet lowered. Root-cause fix for GH-8290 (hero squish) and GH-8443 (card height).
- [internal] **Settings sidebar nav-row guard promoted to error + parity test (GH-12025)**: `sidebar-nav-row-ratchet.test.ts` flips `WARN_ONLY` off now that the hand-rolled nav-row baseline is 0, the settings row class derivation is extracted to `getSettingsSidebarRowClassName()` in `SettingsPolished.tsx`, and a settings-vs-shell parity test locks row padding/density/active/hover to the canonical `getSidebarNavRowClassName()` chrome.
- **Release rows show stacked provider logos (GH-11493)**: Library table rows and shell release rows now render overlapping DSP avatars with a "+N more" chip and a hover popover listing every provider, replacing the bare provider-count number. The shell row's avatar stack also now reflects the release's full provider coverage instead of capping at four hardcoded majors.
- [internal] **Founder conversion HUD (GH-11500)**: admin Overview opens with the visitor→pay funnel flowchart (onboarding chat → account → profile claimed → onboarding complete → paid) — per-step counts, step-to-step conversion %, 7d/30d/all-time range selector, biggest drop-off highlighted — topped by MRR (same `getAdminFunnelMetrics` source as the hero) and shipping velocity (merges/day from the existing shipping-velocity route). Adds `lib/admin/founder-funnel.ts` + admin-gated `/api/admin/hud/founder-funnel`.
- [internal] **iOS write-configuration resilience (GH-11003)**: Rewrote `apps/ios/scripts/write-configuration.sh` to use `/usr/bin/plutil` (always present on macOS) instead of `python3`, preventing failures when a broken Homebrew interpreter (e.g. pyexpat/libexpat symbol mismatch with python@3.14) is first on PATH. Adds a `TARGET_PLIST` env override for testability and four regression tests (`write-configuration.test.mjs`) run in `ios-ci.yml`.
- **Smoother icon transitions (GH-11472)**: Copy buttons and the mobile menu now morph between states with a soft, interruptible animation instead of snapping. Adds shared animation primitives (`lib/animation/motion-primitives.ts` + `AnimatedIconSwap`) for icon swaps, staggered entrances, and layered depth shadows.
- [internal] **Tool discovery skill (GH-13124)**: New `.claude/skills/tool-discovery/SKILL.md` — when a link/tool is shared without context, the agent searches GitHub (`gh search repos`) and the web for docs/pricing/reviews and returns a structured evaluation instead of asking for manual research or a gated unlock action.
- [internal] **Ovie HUD auto-reload (GH-12988)**: Electron now polls `/api/health/build-info` every 60 seconds and reloads `/hud` windows when the deployed commit/build fingerprint changes, with no-store build-info responses so running operator shells pick up new HUD deploys without a manual restart.
- [internal] **Mobile bottom nav derives from canonical config (GH-12644)**: `mobilePrimaryNavigation` no longer defines its own `mobileHome` item; it references the shared `newThreadNavItem` used by desktop nav directly, so mobile can no longer drift from desktop. Adds a regression test asserting every mobile nav item traces back to a canonical desktop nav item.
- [internal] **Desktop auth return schemes (GH-12927)**: legacy per-environment deep-link aliases now map to the current auth-return handler so desktop shells can return from browser auth consistently while the main release path stamps the next DMG version.
- [internal] **Desktop dir-only fuse builds (JOV-3835)**: dir-target Electron test builds disable only the embedded asar-integrity fuse so local/staging packaged apps boot instead of rendering a blank window; main release stamping will publish the next signed DMG.
- [internal] **Codex issue shipper stale-checkout fail-closed gate (GH-12841)**: primary `~/Jovie` checkout must be clean `main` at `origin/main` before dispatch; unsafe drift logs `stale_checkout_abort` + Telegram/Slack and refuses to ship; safe detritus auto-heals for the next launchd tick; adds `shipper-gated-entrypoint.py` (gbrain/grok preflight) and blocks `git checkout` in the primary repo from agent bash hooks.
- [internal] **Dev server stale `.next` cache guard (GH-12899)**: `node scripts/dev.mjs` now wipes `.next` when app route sources are newer than the compiled manifest, logs the on-disk route count at first compile, and Turbo `dev` restarts when `page.tsx` / `route.ts` / `layout.tsx` inputs change.
- [internal] **Tracker migration phase 2 (GH-12725)**: Replaced Linear orchestrator/dispatcher with GitHub-native `agent-ready` dispatch, added `claimIssue`/`transitionIssue` to `scripts/lib/tracker.mjs`, switched Hermes-Air intake to `gh issue create` (Linear mirror behind `TRACKER_GITHUB_ONLY`), and standardized `Fixes #N` PR linking for merge-time issue close.
- [internal] **Dev server resource hygiene (GH-12902)**: `pnpm dev` now starts web-only fast dev instead of all workspace Next.js servers; use `pnpm run dev:all` for the full turbo dev matrix. Added `pnpm run dev:cleanup` / `dev:cleanup:force` to report or terminate stale `next dev` / `turbo dev` processes (default threshold: 4h).
- [internal] **Desktop build clarity (GH-12900)**: Documented the canonical production/staging/local Electron shells (`apps/desktop/BUILDS.md`), restricted `jovie://` URL registration to production only, disabled auto-update on local shells, gated CDP behind `JOVIE_DEV=1`, and added `pnpm run desktop:audit` for `/Applications` hygiene.
- **iOS chat entity chip thumbnails (GH-12708)**: Inline transcript entity mentions now render as pill chips with a fixed 16×16 thumbnail slot using the shared `AvatarImageCache` loader (no raw `AsyncImage`); unresolved entities keep the accent-dot fallback.
- [internal] Codex issue shipper now skips `type:epic` pointer issues (they have no code of their own), fixing the claim/find-nothing/release/re-claim loop on epics like #12729. Adds a `skippedEpic` scan counter. (#12846)
- [internal] x402 payment-gated artist resources spike (#12750): `docs/spikes/x402-payment-gated-artist-resources.md` (conditional GO — self-hosted Cloudflare Worker template for per-resource pricing; defer managed Monetization Gateway) + reproducible unit-economics model `apps/web/lib/x402-spike/unit-economics.ts`.
- [internal] Schedule the codex kanban ship loop via Houston launchd (`co.jovie.hermes.cron-codex-kanban-ship`, every 15m) with PAUSE-respecting `scripts/hermes/ship-loop.sh`.

> Connector enrichment turns synced Gmail and Calendar objects into graph facts and calendar suggestions; assistant chat replies surface entity mentions as subdued accent spans that reveal detail cards on hover.

### Added

- **AI crawler intelligence (GitHub #12747 P0)**: Pro artists can see which AI services read their profile and asset pages — named crawlers, 30-day read counts, and weekly trends on the Audience dashboard. Free artists see a teaser with total read volume and an upgrade path. Data syncs daily from Cloudflare edge analytics.
- [internal] **`readyToMerge` percentiles in `ci-metrics` (Hermes)**: `scripts/lib/merge-queue-guard.mjs`'s `parseMergeQueueTimeline` now also captures the latest `ready_for_review` timeline event (falling back to PR `createdAt` for never-drafted PRs) and computes `readyToMergedSeconds`; `scripts/lib/ci-metrics-compute.mjs` exposes a `latency.readyToMergeSeconds` `{p50,p75,p95}`; `scripts/hermes/jobs/ci-metrics.ts` surfaces it in the rendered summary and the `gbrain` `ci-metrics/latest` page. Continuously tracks the ready→merged p50<10m / p95<15m target using data the job already fetches — no new crons or API calls.
- [internal] **Mobile action-loop API (GitHub #12706)**: adds read-only `/api/mobile/v1/inbox` and `/api/mobile/v1/calendar` endpoints backed by the existing opportunity inbox (`suggested_actions`) and calendar sources (tour dates + releases), plus iOS Codable contracts and `APIClient` fetch methods so shell v1.5 can land after the API contract.
- **Production Journey Auditor**: a layered net for the signup → AI onboarding interview. Deepens the existing canary so it verifies the interview actually initializes (starter prompt visible, composer usable) instead of only checking the chat container is present; adds a nightly real-turn detector, a production smoke command (`qa:journey:smoke`) with a compact redacted failure packet, a product-promise registry, and a report-only exploratory journey scout (`qa:journey:scout`). [internal] Captures a currently-broken anonymous onboarding turn (500 on send) with a clear diagnosis — root cause tracked in JOV-3693.
- **Connector enrichment pipelines (JOV-3114)**: adds `lib/connectors/enrichment/` with per-provider gmail/calendar pipelines that emit `context_facts`, memory graph observations, and `suggested_actions`; extends `context_fact_kind` for entity mentions; refactors `extractAndPropose` to sync Gmail `external_objects` then run the enrichment runner. Apple Photos deferred until JOV-2919.
- **Chat progressive disclosure entity accents (JOV-3116)**: assistant responses parse `@kind:id[label]` wire tokens into per-type System B accent spans (release violet, artist purple, track blue, event orange) with hairline underlines instead of pills; hover/tap/focus opens the existing entity detail card with accent-tinted eyebrow copy. User bubbles keep rich input chips unchanged.
- **Tagging now knows your world first (GitHub #11943)**: when you tag an artist, release, or event with `@` or `/`, the people and work you've recently referenced rank above generic Spotify results — and the menu opens already populated with them instead of waiting for a search. The same entity never shows twice, and Spotify stays available as a fallback.
- [internal] **Taste-label guard (GitHub #12034)**: `scripts/taste-label-guard.mjs` + the `Taste Label Guard` workflow auto-clear `needs:taste` / `needs-human-taste` from PRs whose conventional-commit type is non-taste (chore/deps/build/ci/fix/refactor/test/docs/perf/style/revert) unless they carry a `ux:material` marker — so chores, dep bumps, and bug fixes auto-flow instead of waiting on a human. Backstops the Hermes `pr_gates.taste_surface` labeler.
- [internal] **`eve` adopted as the product `AgentHarness` target (GitHub #12498)**: records the ADR delta from the recon spike (GitHub #12499, `docs/spikes/eve-agent-sdk-fit.md`, conditional GO) — names Vercel `eve` as the selected harness implementation (superseding the OpenAI Agents SDK target; interface unchanged) across `MEMORY_ADR.md`, `MEMORY_CORE_ARCHITECTURE.md`, and `AUTOMATION_AUDIT.md`, reaffirms the Trigger.dev (#9871) and AgentOS WDK (#8191) boundaries, and pins the decision in the memory-adr-contract guardrail test. The flag-gated `eve` build is decomposed and deferred (needs the `ai` v6→v7 bump + security scoping + human go-ahead).
- [internal] **Merge-queue stall watchdog**: `scripts/merge-queue-watchdog.sh` + a `*/10` cron tick on `merge-queue-autoenroll.yml` rescue PRs stuck inside the Graphite queue (measured p90 94m / max 770m label→merge with no prior rescue). Stalled-but-clean PRs get a cooldown-guarded `merge-queue` label-cycle kick; conflicting PRs get `needs-conflict-resolution` only (drain owns the dequeue); terminal-red PRs get dequeued. `merge-queue-autoenroll.yml` also gains `workflow_run` (on CI completion) and `synchronize` triggers to cut enrollment latency.

### Fixed

- [internal] **Hermes/OpenClaw agent config health**: adds a launchd-backed sentinel for recurring Telegram-dispatched agent failures, catching stale Hermes fallback models, paid OpenRouter fallbacks, and schema-clobbered OpenClaw `memorySearch` blocks before gateway churn.
- **Smoother dashboard interactions (JOV-3800)**: opening a release, contact, or tour-date panel from chat now shows the details instantly instead of a brief loading state; settings pages no longer nudge when a change is being saved; and the calendar keeps its layout steady while it first loads.
- [internal] Pre-push Biome gate scopes to changed files (mirroring CI) instead of a repo-wide `biome check .`, so pre-existing Biome drift on `main` no longer blocks `git push` from every worktree and stops training agents toward the `JOVIE_SKIP_PRE_PUSH_GATE=1` escape hatch (GitHub #12475).
- [internal] Cleared the pre-existing Biome drift on `main` that #12475 unblocked (GitHub #12482): `biome format` reflow of `globals.css` + `design-system.css` (whitespace-only — design tokens byte-identical with whitespace stripped) and `biome migrate` on `biome.json` (schema `2.4.8`→`2.5.1`, deprecated `recommended: false`→`preset: "none"`). `biome ci .` is now clean. The issue's `setup.ts` and public-SVG `noSvgWithoutTitle` buckets were already non-issues on current main (Biome 2.5.1 does not lint raw `.svg` files).
- **Library share links no longer error on re-open**: opening a release that already has share settings — or two tabs opening it at once — previously returned a 500. The "ensure share settings exist" path is now idempotent under a concurrent first-open race via an `ON CONFLICT DO NOTHING` insert plus re-read (GitHub #12407).

### Changed

- [internal] **Slimmed the `gtmq_*` merge-queue CI lane**: Graphite batch branches now skip Lighthouse (all four surfaces), A11y, Mobile Overflow, E2E Smoke, Golden Path, `DB Migrate (PR main)`, Preview Deploy, and the `PR Summary` comment — none of those lanes ever gated `PR Ready`, and their evidence was already produced on the source PR before it entered the queue. `Layout Guard` moved off PRs entirely to run once post-merge (`push: main`) instead of once per PR and once per gtmq batch. `PR Ready` now depends directly on the four `ci-fast` leaves (typecheck, biome, guardrails, structural contract) instead of hopping through the `ci-fast` aggregate job, and waives its preview-evidence check on `gtmq_*` bases the same way it already waives it for Dependabot. Reduces GitHub Actions runner consumption by roughly 10–15 job slots per Graphite batch.
- [internal] **Canonical Button system (DS_FOUNDATION_V1 Wave 1)**: `@jovie/ui` now exposes five Button variants (`primary`, `secondary`, `tertiary`, `ghost`, `link`) across three canonical sizes, with destructive styling handled by a prop; chat, library, calendar, claim, composer, and download surfaces now use the shared Button instead of retired `system-b-*-button` CSS classes, with a shrink-only ratchet preventing regressions.
- [internal] **proxy.ts decomposed into lib/auth modules**: the 909-line middleware is now a ~280-line orchestrator; `handleProxyRequest` (routing, CSP nonce, state redirects, circuit breaker) moved to `lib/auth/proxy-request-handler.ts`, Clerk production/staging instance selection to `lib/auth/clerk-middleware-instances.ts`, and the thrice-repeated degraded-auth HTML/JSON block collapsed into `respondAuthDegraded()`. Behavior-preserving — no logic, status-code, or matcher changes; all 619 middleware/auth tests pass unchanged.
- **Library right rail polish (JOV-3679)**: release status badges now use distinct colors — a released drop reads in accent purple instead of the same green as an approved one — buttons and icon buttons are pill-shaped with a clean hover circle, and streaming providers show their real brand icons (Spotify, Apple Music, …) in both the detail drawer and the filter rail. The approval control drops its redundant inline label.
- **Homepage collapsed to hero + minimal footer**: the below-the-fold story stack (product statement, trust strip, go-live steps, workspace, artist-profiles carousel, Friday rhythm, bento/loop/stat sections, pricing, FAQ) and the final CTA are flagged off via the existing static marketing flags (`SHOW_HOMEPAGE_UNLOCKED_SECTIONS`, `SHOW_HOMEPAGE_V2_FINAL_CTA`). The header keeps the logo and sign-in but drops the center nav (its anchors pointed at the now-hidden sections), and the homepage footer renders the minimal variant. Fully reversible by flipping the flags back on. Pages stay fully static (`revalidate = false`).

## [26.6.60] - 2026-06-28

> Catalog collaborator signal matching resolves external mentions to discography releases with confidence scoring.

### Added

- **Catalog collaborator signal matching (JOV-2206)**: adds `lib/catalog` collaborator entity resolver with alias normalization, provider ID matching, and confidence scoring; founder-demo fixture coverage for Cosmic Gate → The Deep End; and `POST /api/catalog/collaborators/match` for confidence-scored release matches.

## [26.6.59] - 2026-06-28

> Merge-queue Lighthouse and mobile-overflow CI lanes reuse shared Neon fixtures reliably.

### Fixed

- **CI throughput (JOV-3606)**: public Lighthouse shard-0 and mobile overflow guards stop injecting stale main DB credentials into ephemeral Neon branches, rebalance the mobile-viewport Playwright spec across LHCI shards, and keep deterministic Promptfoo skill-registry coverage in sync with `analyzePackaging`.

## [26.6.58] - 2026-06-28

> Tasks workspace rows read calmer: overdue pills stop screaming red, the All tab stays visible, and list rows stop repeating title/due/assignee you already see in the detail pane. Release detail panel metadata rows are easier to scan: compact copy buttons, readable titles, and labeled copyright lines.

### Fixed

- **Tasks workspace UI polish (JOV-3652)**: stale overdue due chips downgrade from urgent red to muted metadata; the All assignee subview tab no longer clips under the toolbar; selected list rows hide duplicate title and due chips when the document pane is open; assignee chips hide on Mine/Jovie subviews where every row shares the same assignee.
- **Release detail panel UI (JOV-3654)**: shrinks UPC/ISRC copy buttons to match metadata row density, exposes the full release title on hover when clamped, and labels phonogram/composition copyright rows as P-line/C-line instead of bare ℗/© symbols.

## [26.6.57] - 2026-06-27

> The desktop app recovers from renderer crashes instead of leaving you on a permanent black screen.

### Fixed

- **Desktop renderer crash recovery**: when the embedded web view crashes or runs out of memory, Jovie now reloads it automatically. If crashes repeat, the app shows the load-failure page with a Retry button instead of a blank black window.

## [26.6.56] - 2026-06-26

> Admins can now turn product features on and off per environment (dev, staging, prod) from a new Features panel, and changes take effect without a redeploy.

### Added

- **[internal] Admin Features page + runtime per-environment flag store**: new `/app/admin/features` page (admin-only) lists every runtime feature flag with an inline on/off switch for each of dev, staging, and prod. Toggles persist to a new `feature_flag_overrides` table and take effect on the next request — no redeploy. Reads are cached via `unstable_cache` + `revalidateTag('feature-flags')`, so the hot path stays read-free in steady state; an unset cell inherits the code default. The override layer is additive (absent row = no change).
- **[internal] Flags now work in production**: `getAppFlagValue` consults the per-env override store, so a flag flipped in the admin panel changes server-rendered behavior in prod for all users. Dev-bar personal cookie overrides are now also honored in production for admins only (safe per-admin preview), instead of being ignored everywhere in prod.

## [26.6.54] - 2026-06-21

> [internal] Design-taste jury loop: change-aware screenshot planning, multi-juror consensus, and auto-filed issue manifests with reference comps; repo hygiene removes leaked competitor-analysis doc and adds blocking brand-scrub CI guard. Restores changelog email subscription by wiring invisible Turnstile bot protection.

### Removed

- **[internal] Competitor teardown doc removed from public repo**: a private competitor-analysis doc (`docs/plans/lyb-aesthetics-workout-tracker-validation.md`) was accidentally merged via PR #11018 and is now removed. Private strategy docs must live in a private repo.

### Added

- [internal] **Design-taste jury loop (JOV-10939)**: surgical change-aware capture planning skips non-UI pushes and regenerates only affected screenshot scenarios; per-surface benchmark references (Apple Health, Linear, Superhuman, Raycast, Frame.io, Mobbin/21st.dev/Godly); three-juror consensus engine (System B lead, product-density, marketing-restraint) emitting ranked findings tagged `ship` or `taste`; objective findings auto-file Visual QA issues with reference comps; taste findings queue to Tim; every consensus call writes to gbrain so the jury gate narrows over time.
- **[internal] Brand-scrub CI gate** (`scripts/brand-scrub.py` + `.github/workflows/brand-scrub.yml`): blocking check on every PR that (a) rejects new files under `docs/plans/`, `docs/ideation/`, and similar strategy-doc paths, and (b) flags known competitor brand names in file content. 14 unit tests cover both rules.

### Fixed

- **[internal] Changelog email subscribe Turnstile wiring**: `ChangelogEmailSignup` now mounts the reusable `InvisibleTurnstile` atom and guards client-side submit until a valid token arrives, preventing the empty-token `403` that made changelog subscriptions non-functional when `TURNSTILE_SECRET_KEY` is configured in production.
- **[internal] `InvisibleTurnstile` component**: new reusable atom (`components/atoms/InvisibleTurnstile.tsx`) that renders an execute-mode Cloudflare Turnstile widget off-screen, issues a deterministic bypass token in dev/E2E, and exposes `isTurnstileClientBypassed` / `isTurnstileClientConfigured` for consumers. 4 unit tests cover managed render, E2E bypass, missing site key, and external reset.

## [26.6.53] - 2026-06-15

> The Mac desktop app now completes browser sign-in more reliably and ships as a desktop release.

### Fixed

- **Mac desktop sign-in**: verifies that the signed-in session is visible to the protected return route before continuing in Electron, keeps local auth on a single loopback host, and adds release handling so the desktop app receives the fix.

## [26.6.52] - 2026-06-13

> Desktop auth callback no longer falls through to the PWA offline page.

### Fixed

- **Desktop login auth callback (JOV-3119)**: unregisters stale PWA service workers in Electron sessions, bypasses offline fallback on auth/OAuth routes, and stamps the desktop user agent on the auth handoff window so callback navigations reach the network.

## [26.6.51] - 2026-06-13

> [internal] Bug fixes now require regression test evidence before ship.

### Added

- [internal] **Signed-in auth verification harness (JOV-2761)**: adds `check:signed-in-auth`, `verify:signed-in-auth`, `test:auth:web`, Clerk key-routing preflight, deployment probe, and Playwright signed-in session proof for web (Electron/iOS/extension follow-up tracked separately).
- [internal] **Bug-to-test rule enforcement (JOV-1873)**: adds `pnpm test:bug-to-test`, PR template checklist, Danger gate, and `/ship` Step 3.35 to require regression tests (or documented waivers) on bug-fix PRs.

## [26.6.50] - 2026-06-11

> Infra train refresh after ui train merge; desktop security ships with DMG release handling.

### Changed

- **VERSION**: bumps train integration to v26.6.50 so desktop security hardening ships with DMG release handling.

### Fixed

- **Loop infra review blockers**: hardens workflow-run CAS claims, connector enum casts, approved-action workflow enqueue idempotency, and per-source memory evidence metadata.
- **PersistentAudioBar tests**: align dismiss and region aria-label assertions with Title Case labels.
- **Shell AudioBar neutral play control**: moves central transport play/pause from accent fill onto neutral System B primary button tokens.

## [26.6.49] - 2026-06-11

> Calendar date selection uses neutral System B controls.

### Fixed

- **Calendar neutral selected date**: moves selected days and calendar focus rings off accent tokens onto neutral System B button and ring tokens while preserving fixed day and navigation control dimensions.

## [26.6.48] - 2026-06-11

> Display menu switches use neutral System B controls.

### Fixed

- **Display menu neutral switch**: moves checked switch tracks from raw primary fill onto neutral button tokens and guards the layout-stable control against accent drift.

## [26.6.47] - 2026-06-11

> The iOS auth loading state keeps the central browser action neutral.

### Fixed

- **iOS auth neutral loading indicator**: removes the accent-blue spinner from the Continue in Browser primary action and guards the button against future accent-color drift.

## [26.6.46] - 2026-06-11

> Merch confirmation actions in chat now use the neutral System B primary button surface.

### Fixed

- **Chat merch neutral action**: moves non-destructive merch confirmation buttons from raw primary color fills onto neutral primary button tokens while preserving the destructive archive styling.

## [26.6.45] - 2026-06-11

> Infra train version bump for desktop release guard; post-onboarding interview modal uses shared System B surfaces.

### Changed

- **VERSION**: bumps train integration to v26.6.45 so desktop security changes ship with DMG release handling.

### Fixed

- **Onboarding interview modal System B cleanup**: replaces hardcoded modal colors, white-alpha input styling, raw shadows, and glyph progress with tokenized System B surface classes, the shared textarea primitive, and stable progress dots.

## [26.6.44] - 2026-06-11

> Desktop security hardening plus neutral System B action controls.

### Changed

- **Desktop security (infra train)**: hardens Electron shell auth, CSP watchdog, permissions, and window-state handling ahead of the next DMG release.

### Fixed

- **Electron shell security (JOV-3014)**: bumps Electron to 42.4.0 and removes sandbox-weakening macOS entitlements so desktop releases ship with defense-in-depth defaults.
- **System B neutral action controls**: moves admin speed presets, celebration card size selection, audio transport buttons, and the listening overlay icon from primary/accent fills onto neutral primary button tokens while leaving progress and status accents intact.

## [26.6.43] - 2026-06-11

> Chat slash picker scroll clearance avoids redundant observer work while typing.

### Fixed

- **Chat slash picker scroll effect**: keeps picker-open transcript clearance stable without rebuilding scroll observers on every composer keystroke, and falls back cleanly if `ResizeObserver` setup fails.

## [26.6.42] - 2026-06-11

> Chat slash-command suggestions reserve real transcript clearance in populated threads.

### Fixed

- **Chat slash picker clearance**: grows the virtualized transcript scroll range while the root slash picker is open so active thread content stays clear of the suggestion surface without moving the composer dock.
## [26.6.41] - 2026-06-11

> Codex issue shipper GBrain capture metadata no longer carries a redundant slug assignment.

### Fixed

- **Codex issue shipper capture metadata**: removes the unused initial `captureSlug` assignment so the capture result is assigned exactly once from either the successful GBrain capture output or the captured failure fallback.

## [26.6.40] - 2026-06-11

> Codex issue shipper success and blocker label handling is resilient to GitHub comment and label edge cases.

### Fixed

- **Codex issue shipper cleanup**: clears the `codex-in-progress` label after a PR is found, logs success-comment failures without marking completed work blocked, and adds `codex-blocked` independently from best-effort claim-label removal.

## [26.6.39] - 2026-06-11

> Codex issue shipper dispatch is gated, sandboxed, and resilient to GBrain capture failures.

### Fixed

- **Codex issue shipper hardening**: requires the maintainer-applied `codex-approved` label before dispatch, bounds untrusted issue prompt text, runs Codex with a workspace-write sandbox and explicit approval policy, exits nonzero on fatal job failures, and lets dispatch continue when GBrain capture fails instead of retry-looping the issue.

## [26.6.38] - 2026-06-11

> Admin execution actions now use neutral System B primary button surfaces instead of raw colored fills.

### Fixed

- **Admin execution neutral actions (JOV-3036)**: removes local primary-token and primary-color fills from the impersonation `End Session` and ops `Dispatch worker` actions, preserving warning/status color while keeping central execution controls neutral.

## [26.6.37] - 2026-06-11

> Founder demo approval actions now use the neutral System B primary button instead of a local colored fill.

### Fixed

- **Founder demo neutral approval action (JOV-3034)**: replaces the raw `bg-primary-token` `Approve drop` CTA in the recording demo with neutral primary button tokens while preserving demo timing, copy, and progress accents.

## [26.6.36] - 2026-06-11

> Settings SMS access requests now use the neutral System B primary button instead of a colored fill.

### Fixed

- **Settings SMS neutral action (JOV-3031)**: replaces the colored `bg-primary-token` request CTA in the SMS access settings section with neutral primary button tokens, keeping accent color reserved for the surrounding informational state.

## [26.6.35] - 2026-06-11

> Dashboard header creation actions now use neutral toolbar controls instead of colored fills.

### Fixed

- **Dashboard header neutral actions (JOV-3030)**: removes colored `bg-primary-token` fills from release creation and task creation header actions, preserving compact toolbar behavior while keeping accent colors reserved for status, progress, and selection states.

## [26.6.34] - 2026-06-10

> Library share submit actions now use neutral System B button surfaces instead of colored fills.

### Fixed

- **Library share neutral actions (JOV-3026)**: replaces colored `bg-primary-token` fills on the share-drop creator and passphrase gate submit buttons with neutral System B primary button tokens, keeping accent color reserved for progress, status, marks, and highlights.

## [26.6.33] - 2026-06-09

> Library release assets can now be shared as a branded press-kit drop with optional passphrase and download controls.

### Added

- **Library branded share page (JOV-2936)**: adds `library_share_drops` storage, authenticated share-drop creation from the Library drawer, public `/drop/[token]` press-kit surfaces with grid/list/reel layouts, optional comment + download toggles, and passphrase gating with expiry handling.

## [26.6.32] - 2026-06-09

> Library thumbnails now expose hover scrub previews for audio waveforms and canvas videos.

### Added

- **Library scrubbable media thumbnails (JOV-2935)**: adds hover waveform and video scrub overlays to library grid, list, and drawer artwork while mapping canvas video URLs and deterministic waveform seeds from release data.

## [26.6.31] - 2026-06-08

> Chat merch generation now requests photorealistic Printful mockups after artwork is created.

> The app shell main pane no longer scrolls as a whole — route content scrolls inside the clip so the right rail stays fixed.

### Added

- **Printful merch mockup pipeline (JOV-2621)**: adds a mockup catalog, Printful mockup task creation/polling, authenticated `/api/merch/mockups`, and async chat merch enrichment that merges photorealistic mockup URLs into design options.

### Changed

- **[internal] Bulk press-photo import gate (JOV-2878)**: adds `bulk_press_photo_import` Statsig gate (default off), platform activation-evidence evaluation for manual press-photo usage, and gated scheduling after profile enrichment. Manual single-photo upload remains the default path; bulk import stays deferred until evidence thresholds pass.

### Fixed

- **Shell scroll + right rail stickiness (JOV-2639)**: makes `app-shell-scroll` a non-scrolling clip, wraps the right rail in a dedicated `app-shell-right-rail` slot outside that pane, and tightens the shell child height chain so context panels no longer ride along when lists or grids scroll.

## [26.6.30] - 2026-06-08

> Library grid cards and list rows now line up with the page toolbar instead of sitting on a tighter inset.

### Changed

- **Library grid spacing and header alignment (JOV-2647)**: normalizes library grid gap and horizontal padding to the shared shell header/content tokens so toolbar meta, grid cards, list rows, loading skeletons, and the status bar share the same left edge.

## [26.6.29] - 2026-06-08

> Tasks now use the same shell header search entry as Releases and Library.

### Changed

- **App-wide search entry (JOV-2644)**: routes task title search through the shared `useRegisterHeaderSearch` header pill surface, removes the duplicate `HeaderSearchAction` from the tasks workspace toolbar, and adds guardrails so tasks stay on the canonical shell header search contract.

## [26.6.28] - 2026-06-07

> Admin settings headings now use the quiet app-scale typography instead of tracked all-caps or oversized display sizes.

### Fixed

- **Admin settings heading typography (JOV-2102)**: normalizes `/app/settings/admin` and admin settings surfaces onto `text-app font-[540]` row and panel headings, removes tracked eyebrow styling from campaign settings metrics, and replaces the oversized effective-rate display with compact settings-scale copy.

## [26.6.27] - 2026-06-07

> Admin investor pipeline surfaces now lean on the shared page shell instead of nested section chrome.

### Changed

- **[internal] Admin investor pipeline subtraction (JOV-2101)**: removes nested `ContentSectionHeader` wrappers, icon empty states, and duplicate settings navigation from the investor pipeline, links manager, and settings form so the canonical `AdminPage` shell owns page titles and actions.

## [26.6.26] - 2026-06-07

> Main CI health monitoring works again without failing on Jovie Bot token creation.

### Fixed

- **Main CI health monitor token permissions (JOV-2779)**: removes the Jovie Bot app-token step that requested Actions write (not granted on the installation), keeps the monitor job read-only for evaluation and Slack alerts, and moves one-shot auto-rerun into a separate job with scoped `GITHUB_TOKEN` write access.

## [26.6.25] - 2026-06-07

> The Venmo payment method selector now uses neutral action chrome with provider color only on the logo.

### Fixed

- **Venmo method selector neutrality (JOV-2901)**: replaces the provider-blue Venmo payment method button fill with neutral primary styling, keeps Venmo blue on the logo mark, and extends the TipSection guard so payment method selection cannot regress to provider-filled central action styling.

## [26.6.24] - 2026-06-07

> Public DSP/listen actions now stay neutral, with provider color limited to service marks.

### Fixed

- **DSP listen CTA neutrality (JOV-2900)**: removes provider-colored fills from shared DSP buttons, the exported DSP button HTML helper, and public playlist Spotify CTAs while preserving provider color on logos/icons, and adds focused guards so central listen actions cannot regress to Spotify-green or provider-filled buttons.

## [26.6.23] - 2026-06-07

> Dashboard link swipe edit actions now use neutral chrome instead of blue fills.

### Fixed

- **Link swipe action neutrality (JOV-2899)**: replaces blue-filled dashboard link swipe edit actions with neutral System B surface styling while preserving destructive red for delete, and extends the link action guard so non-destructive swipe actions cannot drift back to accent-filled colors.

## [26.6.22] - 2026-06-07

> Shared Button accent variants now render as neutral primary controls instead of accent-filled CTAs.

### Fixed

- **Button accent variant neutrality (JOV-2898)**: maps the legacy `Button` `accent` variant to neutral primary button tokens, updates the `/ui/buttons` gallery to show upgrade actions as primary, and adds package-level coverage so accent-filled CTA styling cannot return silently.

## [26.6.21] - 2026-06-07

> The onboarding checkout upgrade CTA now has a guardrail that keeps it on neutral primary styling.

### Fixed

- **Onboarding checkout CTA guard (JOV-2890)**: adds focused coverage that prevents the central upgrade checkout action from regressing to accent-filled button styling.

## [26.6.20] - 2026-06-07

> Detected social profiles now use neutral panel chrome instead of accent-tinted framing.

### Fixed

- **Social suggestion panel neutrality (JOV-2889)**: replaces the detected-profile suggestion panel's accent border, background, and dividers with neutral System B surface tokens, and extends the focused chat/social style guard so accent panel chrome cannot return silently.

## [26.6.19] - 2026-06-07

> Inline dashboard chat user bubbles now use neutral transcript chrome instead of accent fill.

### Fixed

- **Inline chat bubble neutrality (JOV-2888)**: replaces `InlineChatArea` user message accent fill with neutral System B surface/text tokens, and extends the focused chat rendering guard so ordinary transcript bubbles cannot drift back to accent-filled chrome.

## [26.6.18] - 2026-06-07

> Artist selection no longer uses purple/blue ambient accent orbs behind the central action.

### Fixed

- **Artist selection accent cleanup (JOV-2887)**: removes decorative gradient orb layers from the artist-selection route while preserving the neutral grid/background surface, and adds a focused guard so ambient purple/blue/cyan accent decoration cannot return silently.

## [26.6.17] - 2026-06-06

> Pricing conversion actions now stay neutral instead of leaning on plan accent color.

### Fixed

- **Pricing CTA neutrality (JOV-2886)**: replaces the legacy home pricing Pro CTA accent variant with the neutral primary button, removes colored plan-card glows from reusable marketing pricing cards, and adds focused guards so pricing conversion actions cannot drift back to purple/blue/accent fills.

## [26.6.16] - 2026-06-06

> Dead homepage-era accent CTA components no longer survive outside the System B surface.

### Removed

- **Dead home accent actions (JOV-2885)**: removes unused `ArtistSearch`, `FeatureFlaggedArtistSearch`, and `WaitlistLink` components that still carried purple/blue filled central action styles, and adds a focused guard so those orphaned action recipes cannot return silently.

## [26.6.15] - 2026-06-06

> Version-only release bumps no longer force expensive PR smoke runs.

### Fixed

- **CI risk routing (JOV-2884)**: teaches the CI harness classifier to ignore package manifest matches in the runtime-config smoke lane when the manifest diff only changes `version`, while preserving smoke escalation for dependency, script, and config changes.

## [26.6.14] - 2026-06-06

> Static comparison CTAs now use neutral primary controls instead of accent fills.

### Fixed

- **Marketing comparison CTAs (JOV-2881)**: replaces accent-filled final CTAs on static alternatives and compare pages with neutral primary button tokens, while preserving semantic accent highlights and adding a source guard for central conversion actions.

## [26.6.13] - 2026-06-06

> Main push unit CI now follows the same bounded test path as PR and merge-queue runs.

### Fixed

- **Main unit CI stability (JOV-2880)**: routes main-branch web unit shards through Turbo, removes live Redis secrets from unit-test steps, and unrefs the idempotency fallback cleanup timer so imported modules cannot keep Vitest workers alive after tests finish.

## [26.6.12] - 2026-06-06

> Chat social-link Add actions now stay on neutral System B primary controls.

### Fixed

- **Chat social Add actions (JOV-2879)**: replaces accent-filled Add buttons in the live chat link confirmation card and social suggestion rows with neutral primary button tokens, and adds a source guard so central chat/social actions cannot drift back to accent-filled styling.

## [26.6.11] - 2026-06-06

> System B primary actions now stay neutral across onboarding, alerts, demo, and release-task surfaces.

### Fixed

- **Neutral primary actions (JOV-2728, JOV-2853, JOV-2854, JOV-2877)**: replaces accent-filled central CTAs and action buttons with neutral primary tokens across onboarding demo, release workspace actions, alert capture, onboarding checkout, and handle claim controls, with focused source guards.

## [26.6.10] - 2026-06-05

> Root 404 now keeps its oversized System B code contrast-safe on dark backgrounds.

### Fixed

- **Root 404 a11y contrast (JOV-2831)**: removes the extra opacity from the decorative 404 code, keeps the neutral System B token, and guards the primitive against future contrast-reducing opacity.

## [26.6.9] - 2026-06-05

> Chat transcript entity chips now reserve stable width and thumbnail slots for long labels and fallback accents.

### Fixed

- **Transcript entity chip stability (JOV-2830)**: bounds transcript chip width, keeps fallback accent dots and resolved thumbnails in the same reserved slot, and adds a System B guard for long-label truncation and media stability.

## [26.6.8] - 2026-06-05

> Shared text-entry controls now use neutral System B tracking instead of hardcoded negative letter spacing.

### Fixed

- **Text field typography contract (JOV-2829)**: normalizes the shared `Input` and `Textarea` atoms to `tracking-normal`, and adds focused guards so shared text-entry controls cannot drift back to negative tracking.

## [26.6.7] - 2026-06-05

> Desktop recovery now reports the actual runtime platform while shipping through the desktop release path.

### Fixed

- **Desktop recovery runtime label (JOV-2823)**: derives the recovery footer runtime label from Electron's `process.platform` instead of hardcoding macOS, keeps Windows and Linux recovery surfaces honest, and bumps the desktop release trigger so the next desktop build carries the fix.

## [26.6.6] - 2026-06-05

> Shared button controls now use neutral System B tracking instead of hardcoded negative letter spacing.

### Fixed

- **Button typography contract (JOV-2826)**: normalizes the shared `Button` atom and `whitePill` variant to `tracking-normal`, and adds a focused guard so shared controls cannot drift back to negative tracking.

## [26.6.5] - 2026-06-05

> Chrome extension signed-in sidepanel actions now keep stable System B geometry while switching from insert preview to confirm/cancel/copy.

### Fixed

- **Extension action dock (JOV-2824)**: adds action-count layout hooks, keeps signed-in entity action labels neutral, and locks the dock frame across two- and three-action states.

## [26.6.4] - 2026-06-04

> Auth sign-in is now wired across the web app, Electron desktop app, iOS shell, and Chrome extension for dev, staging, and production verification.

### Fixed

- **Multi-surface Clerk routing**: maps dev, staging, and production to their explicit Doppler and Clerk instances, enables email-code sign-in checks, and keeps staging hosts on staging publishable keys even when Vercel reports a production runtime.
- **Electron native auth handoff**: corrects Electron navigation event handling so browser-owned Clerk callbacks return to the native shell instead of falling through to `about:blank`.
- **Cached auth recovery**: resolves verified Clerk email addresses through the backend when the database profile is not yet cached, keeping native dashboard hydration signed in after a browser handoff.
- **Chrome extension sign-in**: opens sign-in on the active Jovie origin and grants dev, staging, and production host permissions.

## [26.6.3] - 2026-06-03

> Electron now ships the System B desktop recovery shell through the desktop auto-update path.

### Fixed

- **Electron recovery shell**: moves the native BrowserWindow background and load-failure recovery surface onto tracked System B desktop tokens, removes the legacy gradient/raw-color fallback styling, and keeps the recovery card centered in the native window.

## [26.6.2] - 2026-06-02

> Memory Core v0 now has fixture-backed loops for ingest, identity, enrichment, matching, graph reads, and review-gated opportunities.

### Added

- **Memory Core loop services**: adds the thin ingest harness plus thick memory workers for entity resolution, enrichment, graph querying, review actions, calendar/photo matching, catalog/voice-memo matching, and pending opportunity generation.
- **Memory dev fixtures**: adds deterministic chat, photo, calendar, catalog song, release, voice memo, Wikipedia, Wikidata, and MusicBrainz fixtures for provider-free tests.
- **Memory graph API**: adds a scoped `/api/memory/graph` read endpoint backed by the existing Memory Core v0 schema.

### Fixed

- **Memory evidence and scope guards**: requires source evidence for facts, sanitizes Gmail raw-body metadata at the store boundary, and rejects cross-profile source/observation writes.
- **QA gate stability**: removes dynamic server-only imports from the Gmail no-send guard and gives slow screenshot/Clerk tests explicit timeouts.

## [26.6.1] - 2026-06-01

> Native auth now starts in the system browser while desktop and iOS keep only the app handoff surface.

### Changed

- **Native auth handoff**: replaces in-app desktop and iOS auth forms with a centered `Continue in Browser` handoff before opening the browser-owned Clerk flow.
- **Desktop auth routing**: allows `/auth/start` to leave the Electron shell, keeps Clerk UI out of desktop auth routes, and tightens Clerk host matching for auth provider navigation.

### Fixed

- **Electron auth bridge**: installs the runtime marker and bridge before auth handoff actions so the desktop shell can open the browser reliably.
- **Segmented input cleanup**: clears the deferred blur timer after teardown so jsdom test runs do not report late `document` access.

## [26.6.0] - 2026-06-01

> Jovie now has an onboarding robot that validates the shipped QA path instead of relying on manual incognito-window checks.

### Added

- **Onboarding robot smoke (JOV-2681)**: adds a fast Playwright `/start` smoke that verifies anonymous chat load, first-turn completion, onboarding session continuity, and funnel event emission.
- **Onboarding robot synthetic (JOV-2681)**: adds the full Clerk-token synthetic path for creating a scoped robot user, completing `/onboarding`, verifying dashboard/public profile/welcome-chat continuity, and cleaning up only the exact robot account.
- **Onboarding funnel event contract (JOV-2681)**: adds typed internal event constants for `onboarding_started`, `auth_completed`, `chat_started`, `chat_completed`, `qualified`, `waitlisted`, `profile_created`, and `dashboard_loaded`.

### Changed

- **Production synthetic monitoring (JOV-2681)**: wires the full onboarding robot into synthetic monitoring, Slack failure metadata, and retained Playwright trace/video/screenshot artifacts.

### Fixed

- **Release notification scheduling**: stops inserting `campaignId` as a top-level fan-notification field; campaign context remains in the dedup key and metadata, matching the schema.

## [26.5.58] - 2026-05-25

> Native auth now completes through the hardened Mac OS and iOS callback paths, and release pitching now starts from Jovie chat instead of a dedicated sidebar builder.

### Added

- **Chat-first pitch tool (JOV-2594)**: added a centralized `generateReleasePitch` tool and command that drafts one destination-aware pitch for playlists, radio, Sirius XM, installs, playback/music supervisors, editorial posts, record labels, or collaborators.
- **Pitch action menus (JOV-2594)**: added `Generate pitch` to release action menus and pitch-related task menus, with task-derived destination context when the task title/category is clear.

### Changed

- **Pitch chat artifact (JOV-2594)**: renders a copy-ready pitch draft with subject/body support instead of four fixed platform tabs.
- **Agent catalog alignment (JOV-2594)**: registered pitch generation in the shared agent tool catalog and command registry, and captured the broader UI-to-tool consolidation audit in JOV-2595.

### Fixed

- **Native auth completion**: finalizes Mac OS Clerk ticket sign-in through the tested set-active path, returns iOS native exchange responses through the mobile session-token contract, and records DEBUG/TestFlight-safe diagnostics for the sheet, callback, exchange, hydration, `/me`, and route stages.
- **Auth surfaces**: replaces the oversized unavailable state with the compact centered auth sheet and reduces the iOS splash logo footprint.
- **Customer-facing runtime copy**: maps desktop session activity from internal runtime names to `Mac OS` and adds a deterministic guard for forbidden vendor/runtime copy.

### Removed

- **Dedicated pitch builder UI (JOV-2594)**: removed the release sidebar `Pitch` tab, target-playlist editor, pitch dashboard API route, and client mutation hook.

## [26.5.56] - 2026-05-25

> Native auth test harnesses now stay rate-limited in production even if simulator-only auth tokens are present.

### Fixed

- **Native auth exchange production guard**: restricted the real-browser auth harness rate-limit bypass to non-production deployments and added regression coverage for production and preview environments.
- **Smoke auth bypass warmup**: pre-warms the dev test-auth session route and provisions the creator-ready persona through the test seeding path so parallel Turbopack smoke tests do not fall back to stale configured users.
- **Neon CI branch cleanup**: retains recently-created ephemeral Neon branches so concurrent CI cleanup cannot delete another active run's database during auth and preview smoke tests.

## [26.5.55] - 2026-05-25

> Release metadata now matches the deployed build-info response and fails CI when it drifts.

### Fixed

- **Build-info release version (JOV-2586)**: synced `version.json`, `VERSION`, and workspace package versions so `/api/health/build-info` reports the current release version.

### Changed

- **Version guardrail (JOV-2586)**: runs the existing version audit in CI guardrails before deploy-related checks.

## [26.5.53] - 2026-05-25

> Admin People is now stable enough to trust during waitlist review, with flatter insights, clearer chat qualification, and proof of the full waitlist path.

### Added

- **Waitlist golden-path coverage (JOV-2572)**: adds local browser coverage for homepage to signup, chat qualification, waitlisting, admin approval, and app entry, with screenshots and video artifacts.
- **Waitlist integrity signal (JOV-2572)**: Admin > People > Waitlist now surfaces missing user/waitlist links so signup drift is visible instead of looking like a clean table.

### Changed

- **Cleaner admin People tables**: Waitlist, Users, Releases, and Feedback use flatter shells, fixed row geometry, and compact release artwork so real data no longer blows up table rows.
- **White homepage outcome cards**: artist-profile bento cards now use white surfaces with black text for the sharper Apple-style treatment.
- **More useful chat qualification**: onboarding chat now pushes toward concrete artist, release, and profile context before putting qualified users on the waitlist.

### Fixed

- **Feedback visibility**: feedback posts now require confirmed persistence, and Admin Feedback reports load errors instead of disguising them as zero feedback.
- **Insight card over-framing**: chat and dashboard insight cards drop the extra nested card treatment.

## [26.5.52] - 2026-05-25

> Shell chrome now reads calmer, with the sidebar collapse control in the header, the library route using one shell, and the chat composer/settings surfaces tightened up.

### Fixed

- **Shell navigation chrome**: removed the highlighted `New chat` treatment, moved the web collapse control into the header cluster, and kept the thicker collapse icon so the shell behaves the same in web and desktop contexts.
- **Library shell cleanup**: registered the library route sidebar override, removed duplicate sidebar loading fallback behavior, and retuned the filter, release-date, and status surfaces to the shell-v1 accent palette.
- **Chat composer stability**: tightened focus restoration after send, simplified the attachment menu copy, and gave dictation a visible active state with the updated shell button treatment.
- **Settings hierarchy and usage meter**: flattened duplicated settings headers, normalized sidebar labels, and updated usage counters and progress fills to the Geist accent colors.

## [26.5.51] - 2026-05-25

> iOS native sign-in now completes the HTTPS browser callback path, exchanges the custom-scheme return, persists the session, and lands in the authenticated shell.

### Fixed

- **iOS native OAuth callback completion**: fixed the native exchange path so simulator HTTPS auth stores a real Clerk test user, exchanges the callback once, clears transient auth errors, and routes to the authenticated app shell instead of showing `Couldn't finish sign-in. Try again.`
- **Mobile session-token API auth**: updated mobile `/me` and chat routes to authenticate bearer session tokens directly from the request, so native sessions no longer depend on Clerk middleware state.
- **iOS runtime auth configuration**: made simulator/runtime environment values override stale local plist values, keeping `WEB_BASE_URL`, `API_BASE_URL`, and Clerk keys aligned for HTTPS auth tests.

### Added

- **HTTPS ASWebAuthenticationSession coverage**: added `pnpm test:auth:ios` with deterministic callback parser tests, custom-scheme simulator tests, and a real-browser HTTPS mode that launches through `ASWebAuthenticationSession` and returns via `ie.jov.jovie://auth/complete`.
- **Native auth diagnostics**: added DEBUG/TestFlight-safe stage diagnostics for auth sheet open, callback receipt/parsing, native exchange, Clerk ticket sign-in, token hydration, `/api/mobile/v1/me`, and final route transitions.

## [26.5.50] - 2026-05-24

> Chat now keeps profile and entity context visible in the right rail while tool work reads like a native inline activity feed instead of boxed status cards.

### Added

- **Chat context rail cards (JOV-2567)**: structured entity tokens and profile-related tool activity now upsert compact right-rail context cards above any open release/contact/tour-date child panel, with dedupe and dismissal handled separately from the full child panel target.
- **Inline tool activity feed**: generic tool calls now render as compact activity rows, with multi-tool responses connected by a timeline line and failed/denied calls exposed as inline alert rows.

### Changed

- **Chat error and artifact polish**: composer failures now render inside the transcript with retry/support-reference affordances, generation artifacts share a cyan-accent surface, and composer icons use heavier strokes without changing the current button footprint.
- **Library selection polish**: selected library grid/list items use the cyan rail/ring treatment scoped to the library surface instead of changing global table selection tokens.

## [26.5.49] - 2026-05-24

> [internal] Jovie iOS now reports auth and deep-link diagnostics through provider-agnostic observability.

### Added

- **[internal] iOS observability adapter**: adds a Jovie Observability facade with typed events, Sentry-backed and Noop providers, Sentry Cocoa wiring, redaction hooks, and auth/deep-link/session breadcrumbs without exposing Sentry APIs outside the provider.
- **[internal] iOS observability redaction tests**: covers auth token, cookie, contact-field, and callback URL sanitization plus provider swapping, no-op spans, and AppState user set/clear instrumentation.

## [26.5.48] - 2026-05-24

> [internal] Promptfoo now checks the web chat route's pre-model auth, billing, privacy, and kill-switch contracts.

### Added

- **[internal] Web chat route eval coverage (JOV-2571)**: extends the Promptfoo suite with deterministic `POST /api/chat` route-contract cases for unauthenticated sensitive requests, invalid JSON, missing artist context, client-turn profile preconditions, the chat-disabled kill switch, and billing-verification rate-limit messaging.

## [26.5.47] - 2026-05-24

> [internal] Jovie's Promptfoo chat evals now include mobile route-contract coverage and clearer live-model stream error diagnostics.

### Added

- **[internal] Mobile chat route eval coverage (JOV-2562)**: extends the Promptfoo suite with deterministic `POST /api/mobile/v1/chat/turns` contract cases for missing session, invalid request bodies, and the current `MOBILE_CHAT_RUNTIME_DISABLED` NDJSON response, including assertions that the disabled route does not persist data or execute tools.

### Changed

- **[internal] Promptfoo stream diagnostics**: captures eval-only `executeChatTurn()` stream errors so provider failures expose gateway and model-provider causes instead of returning only the generic AI SDK no-output message.

## [26.5.46] - 2026-05-24

> Virtualized chat threads now reserve slash-command picker clearance in the scroll geometry itself.

### Fixed

- **Virtualized slash-command clearance (JOV-2566)**: adds flyout clearance to the virtualized message spacer height instead of fixed-height padding, so long threads keep the latest message clear of the slash picker.

### Added

- **Virtualized flyout regression coverage**: extends the populated chat flyout Playwright fixture past the virtualization threshold so the smoke invariant covers long-thread geometry.

## [26.5.45] - 2026-05-24

> Chat slash-command flyouts and rich chip previews now stay above the transcript, clear active messages, and preserve composer geometry across desktop and mobile shells.

### Fixed

- **Chat slash-command flyout layering (JOV-2566)**: the active thread now reserves scroll clearance when the root slash picker opens, keeps the composer pinned, and prevents the picker from colliding with recent assistant replies, tool status rows, and user bubbles.
- **Rich chip preview surfaces**: transcript entity chips and image attachment chips now use the chat overlay tier, opaque popover surfaces, viewport-bounded sizing, and safer placement around nearby messages.

### Added

- **Flyout and chip regression coverage**: added Playwright coverage for populated chat threads plus focused unit coverage for slash picker geometry, transcript token chips, image attachment chips, multiline bubbles, and chip popover interaction semantics.

## [26.5.44] - 2026-05-24

> [internal] Jovie chat now has a Promptfoo baseline eval suite that exercises the production chat runner with synthetic artist fixtures, making support quality, retrieval grounding, tool use, privacy, and onboarding regressions measurable.

### Added

- **[internal] Promptfoo chat baseline evals (JOV-2561)**: added a small Promptfoo suite for the web chat path, a custom provider around `executeChatTurn()`, synthetic Luna Waves fixtures, eval-only tool stubs, and JavaScript assertions covering support quality, retrieval grounding, tool-call correctness, privacy, business rules, onboarding task completion, and Jovie voice.
- **[internal] Eval command and docs**: added `pnpm run evals` from the repo root and documented required env, baseline scope, and known route-level gaps for auth, billing, rate limits, DB persistence, mobile chat, Clerk, Spotify, and Stripe.

## [26.5.43] - 2026-05-24

> The Mac Electron auth handoff now fails closed on callback replay and keeps the browser-open retry controls bounded.

### Changed

- **Electron auth handoff window**: extracted the handoff window bounds and removed the indirect `showWindow` path when foregrounding the auth handoff window.

### Fixed

- **Native auth callback replay hardening**: `/auth/callback` now consumes the validated auth state before creating the native exchange code, so replay attempts fail closed and cannot leave auth state alive after exchange creation.
- **Desktop auth browser retry state**: `Continue in browser` is disabled only while an open attempt is pending, then becomes retryable after success, failure, or timeout.
- **Desktop auth bridge errors**: explicit IPC failure reasons now reach the renderer instead of being masked by a browser fallback.

## [26.5.42] - 2026-05-24

> The Mac Electron app now keeps browser sign-in in a dedicated handoff window, returns through the `jovie://` protocol, and avoids auth-route cookie banner noise.

### Changed

- **Electron auth handoff**: the Mac app now hides the main app shell while the browser handoff is active, reports failed browser launches back to the renderer, and declares the production `jovie://` auth-return protocol in the app bundle.

### Fixed

- **Native auth callback**: `/auth/callback` now consumes the already-validated auth state without re-reading it after native exchange creation, preventing valid Electron callbacks from falling into the `Auth state expired` response.
- **Auth-surface cookie banner**: the visible cookie banner is suppressed on desktop/native auth utility routes while the normal cookie preferences controller remains mounted elsewhere.

## [26.5.41] - 2026-05-24

> Jovie can now create Jovie-owned merch cards from chat, publish them to public artist profiles, collect payment through platform Stripe Checkout, route paid orders to Printful, and accrue manual artist payout liability.

### Added

- **Merch MVP (JOV-2560)**: added the `merch_mvp` rollout gate, `canAccessMerchCreation` entitlement, merch chat tools, deterministic production-art generation, Jovie merch card records, public product pages, Stripe Checkout, Printful webhook/fulfillment handling, and a manual payout ledger.
- **Merch persistence**: added `merch_generation_batches`, `merch_design_options`, `merch_cards`, `merch_orders`, `merch_payout_ledger_entries`, and `merch_fulfillment_jobs` with Printful variant IDs stored as the purchasable/order source of truth.
- **Merch profile rail**: public profiles now render live merch cards behind the merch gate between the release/tour primary card and alerts. Empty, paused, archived, or gated states render no fake fallback.

### Changed

- **Cron/docs/env coverage**: scheduled `/api/cron/process-merch-fulfillment` every 10 minutes and documented the new schema, API routes, webhooks, Statsig gate, and Printful/Stripe merch env vars.

## [26.5.35] - 2026-05-21

> The page header now lives inside the elevated content card and moves with the sidebar when you collapse it — matching Linear's layout. The "Update available" button in the desktop app is no longer a tiny featureless circle; it shows the full "Update" pill with icon and label.

### Changed

- **Electron desktop shell: header inside content card.** Moved `DashboardHeader` out of the top reserved titlebar and into the elevated content card so the entire card (header + body) collapses/expands with the sidebar. Removed the duplicate-render hack that previously rendered the header twice (one copy hidden via `display: none`) and zeroed `#main-content`'s top radius to fake a stitched surface.
- **[internal] Sidebar header identity**: added a "Jovie" wordmark next to the BrandLogo in the default single-profile sidebar header so the header has a clear identity anchor instead of just a 14px logo.
- **[internal] Titlebar height**: reduced `--electron-titlebar-height` from 52px to 40px now that the header no longer occupies the titlebar.

### Fixed

- **Update pill no longer renders as an empty circle.** Removed `UpdateAvailablePill`'s `compact` prop entirely so the pill is always full text+icon when an update is available. The 28px compact circle was rendering as a featureless white dot in the squished sidebar-cell.
- **[internal] In-card header drag region (regression prevention)**: removed `data-electron-drag-region='true'` from `DashboardHeader` so the now-in-card header is not a window drag handle. The titlebar above remains the drag region.

### Removed

- **[internal] Back/forward nav pill in the Electron titlebar**: removed the visible pill. Cmd+[ / Cmd+] still navigate via `useDesktopNavigation`.
- **[internal] Stitched-surface CSS hacks**: deleted four rule blocks from `globals.css` plus the `[data-sidebar-dock-button]` hide-in-Electron rule (now dead because the button is no longer rendered in Electron).
- **[internal] `SidebarDockButton` in Electron**: conditionally skipped via `useIsElectronRuntime()` instead of rendered-then-hidden via CSS.
## [26.5.36] - 2026-05-21

> Chat home no longer advertises album-art generation when the provider is down or feature-flagged off — the suggestion pill is hidden instead of showing as a disabled button, and the "Draft album-art brief" fallback takes its place. Pro upsells stay visible.

### Changed

- **Chat suggestions: hide unavailable album-art capability (JOV-2524)**: `SuggestedPrompts` now omits the "Generate album art" pill entirely when `albumArtCapability.reasonCode` is `PROVIDER_UNAVAILABLE` or `FEATURE_DISABLED`, surfacing the "Draft album-art brief" suggestion in its place. Plan-gated (`PLAN_UNAVAILABLE`) and onboarding-pending (`PROFILE_REQUIRED`) reasons retain the existing disabled-with-tooltip behavior so the upsell affordance is preserved. Sourced from prod chat audit (JOV-2524).

## [26.5.34.1] - 2026-05-21

> The investor pitch deck at `/pitch` now opens straight into the slides with a quiet presentation chrome instead of the consumer marketing nav, and a handful of slides got line-break and alignment cleanup so headlines stop orphaning words.

### Changed

- **`/pitch` page world-class redesign**: moved the route out of the `(marketing)` group so the marketing header no longer renders above the investor deck. New `apps/web/app/pitch/layout.tsx` is a minimal dark pass-through. `apps/web/app/pitch/page.tsx` is rewritten as a 44px presentation top bar (Jovie wordmark on the left, `Present` and `PDF` chrome links on the right) above a full-bleed iframe that lets the deck's own 16:9 letterboxing create the framing. A mobile fallback below `sm` shows the wordmark, a "Designed for desktop" message, and Download PDF + email CTAs.

### Fixed

- **Pitch deck inline-style cleanup (no copy changes)** in `apps/web/public/pitch/index.html`: removed a broken `width: 100px` on `.suno-title` that was crushing the heading and dropped the font from 150px to 132px so slide 2 stops orphaning "people" onto its own line; removed redundant inline `font-size` + `margin` on the `<span class="dim">` inside `.problem-title`; deleted the empty `<p class="problem-sub">` that was leaving a hairline gap on slide 3; removed a broken `width: 140px` on `.bs-title` that was crushing the bad-solutions headline.

## [26.5.34] - 2026-05-21

> Fixed a layout shift on public artist profile pages that caused Lighthouse CLS scores of 0.317, unblocking the Lighthouse CI gate.

### Fixed

- **[internal] Profile page CLS regression (JOV-2514)**: three `useState` calls in `ProfileCompactTemplate` were initializing with SSR-safe defaults (`'standalone'`, `false`, `'profile'`) and updating via `useEffect` after first paint. At Lighthouse's 1350×940 desktop viewport, the hero switched from ~500px to ~56px tall on `?mode=listen` routes. Converted all three to lazy initializers that read `matchMedia` and `location.search` synchronously on the client, eliminating the post-paint layout shift.

## [26.5.33] - 2026-05-21

> [internal] Removed a duplicate search button from the admin panel header; the sidebar search is now the single entry point for admin search.

### Fixed

- **Admin header duplicate search (JOV-2121)**: removed the `HeaderSearchAction` injection from the three admin table wrappers (`AdminUsersTableUnified`, `AdminReleasesPageWrapper`, `AdminCreatorsPageWrapper`) that duplicated the sidebar's search entry point. `DrawerToggleButton`, `BatchIngestButton`, and `IngestProfileDropdown` are preserved.

## [26.5.32] - 2026-05-21

> [internal] Electron desktop titlebar now has a single unified sidebar toggle and pill-style nav controls, with the sidebar rail correctly aligned to the titlebar column.

### Changed

- **[internal] Electron titlebar unification (JOV-2504)**: sidebar toggle is now the single canonical toggle in Electron mode — the in-sidebar dock button is hidden via CSS when inside the desktop runtime. Back/forward navigation buttons are grouped in a pill-shaped container in the main titlebar cell. Titlebar sidebar-cell `padding-left` is aligned to the shell gap so the column precisely tracks the sidebar rail in shellChatV1 mode. Geometry Playwright tests added to verify DOM structure, no-duplicate-toggle invariant, and sidebar-cell width vs CSS token.

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
