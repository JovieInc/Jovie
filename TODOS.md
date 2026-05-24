# TODOs

## Resolved mismatch history view in Catalog Health section

**What:** Add a way to see past confirmed ("Not Mine") and dismissed ("Mine") mismatches in the Catalog Health section on the Presence page.

**Why:** After triage, artists filing Spotify corrections need to reference which tracks they confirmed as not theirs. Currently the cards disappear after action and there's no way to see resolved items without re-scanning.

**Pros:** Completes the triage-to-resolution workflow. Artists don't lose their review work.

**Cons:** Adds UI complexity to a clean triage-and-done section.

**Context:** The data already exists in `dsp_catalog_mismatches` with status `confirmed_mismatch` or `dismissed`. The query is trivial. The UI question is whether to show resolved items inline (a "Show resolved" toggle) or behind a separate link. The post-triage summary card already links to Spotify's content mismatch form, so this is about reference, not action.

**Effort:** S (human ~4h / CC ~15 min)
**Priority:** P2
**Depends on:** Catalog scan UX fold-into-presence PR landing first.

---

## Extension performance budgets and regression checks

**What:** Add explicit performance budgets and regression checks for the Chrome extension, including shell render stability, preload latency, layout-shift prevention, and common interaction latency thresholds.

**Why:** The extension is used in the middle of active work. If the shell flickers, shifts layout, or takes more than a beat to surface entities and actions, the product will feel broken even when the underlying functionality works. Performance is part of trust for this surface.

**Pros:** Prevents silent performance decay, keeps common flows feeling instant, gives CI a guardrail against regressions, and protects the no-layout-shift bar for the side panel.

**Cons:** Adds benchmark maintenance, fixture upkeep, and some CI/runtime complexity around measurement and thresholds.

**Context:** The engineering review locked in proactive warm caching, static shell rendering, and a strong bias against layout shifts or blank flashes. This TODO should cover extension-specific budgets such as panel open time, candidate list render time, preview readiness time, and layout-shift regressions. It should integrate with the extension test harness and ideally fail loudly when thresholds regress.

**Effort:** M
**Priority:** P1
**Depends on:** Chrome extension Track 1 foundation (shared capability layer + side panel + summary endpoints) landing first.

---

## Authenticated browser ingestion and execution tier

**What:** Add a post-Track-1 capability tier for authenticated browser-side ingestion and execution against private or semi-private web surfaces that do not expose the needed APIs, such as Spotify for Artists, social networks, submission forms, and long-tail manual ops sites.

**Why:** The long-term strategic value of the extension is not just autofill. It is browser-resident access to cookies, loaded app state, and DOM-native workflows that let Jovie ingest data and perform deterministic actions on sites where traditional APIs are missing or insufficient.

**Pros:** Unlocks two-way sync on high-value surfaces, gives Jovie access to richer DSP/social data, supports manual-op automation that otherwise cannot be productized, and preserves the original strategic reason for building the extension.

**Cons:** Higher trust and compliance complexity, more auth/cookie handling risk, more sensitive platform/TOS considerations, and significantly more adapter and observability work.

**Context:** The Track 1 engineering plan deliberately excludes automated authenticated ingestion from MVP execution and testing, but keeps the architecture ready for it by placing cookies, host permissions, DOM extraction, and execution in the browser layer while keeping workflows, flags, summaries, and logs in the shared capability layer. This TODO should define the next tier clearly so the program does not drift into being “just a smart autofill extension.”

**Effort:** L
**Priority:** P1
**Depends on:** Chrome extension Track 1 runtime foundation, remote kill switches, browser contract harness, and policy review for platform/TOS boundaries.

---

## Project-level /ship override mechanism

**What:** Create a project-level `/ship` override mechanism (e.g., `.claude/skills/overrides/ship.md`) that customizes the generic gstack `/ship` template (CalVer format, `version.json` instead of `VERSION` file) without forking the template — so gstack upgrades don't lose project customizations and new gstack features aren't blocked.

**Why:** The gstack `/ship` Step 4 references a 4-digit `VERSION` file (`MAJOR.MINOR.PATCH.MICRO`) but this project uses CalVer `YY.M.PATCH` in `version.json`. Currently handled by AGENTS.md prose override, which is fragile and could confuse agents.

**Context:** The mismatch is between the generic gstack ship template (designed for all repos) and Jovie's project-specific versioning. The ideal solution would be a composable override that gstack's template system reads automatically, so upgrading gstack doesn't clobber project customizations. Could be a `ship.project.md` file that gets included by the template, or a config-driven mechanism in gstack itself.

**Effort:** M (human ~1 day / CC ~30 min)
**Priority:** P3
**Depends on:** Nothing blocking.

---

## Wrong-artist detection + multi-candidate DSP matching

**What:** Change `dsp_artist_matches` unique constraint from `(creator_profile_id, provider_id)` to `(creator_profile_id, provider_id, external_artist_id)`. Update the discovery job to store the top-2 candidates per provider (best = auto_confirmed/suggested, 2nd = suggested). Surface secondary candidates in the presence page with "X tracks matched this profile" context. Detect split catalogs (e.g. "400 tracks on one David Guetta Apple Music profile, 2 on another").

**Why:** The ISRC-based discovery pipeline already computes `allCandidates` (sorted by ISRC match count) in `isrc-aggregator.ts`, but only stores the single best match. This means: (1) artists can't see if their catalog is split across profiles on a DSP, (2) there's no visibility into wrong-artist matches, (3) no manual override when auto-confirm picks the wrong one. For artists with common names or catalog fragmentation, this is a data quality blind spot.

**Context:** `aggregateIsrcMatches()` in `lib/dsp-enrichment/matching/isrc-aggregator.ts` already returns sorted candidates. `storeMatch()` in `dsp-artist-discovery.ts` just needs to be called for the top-2 instead of top-1. The unique constraint change is backwards-compatible (relaxing, not tightening). The `onConflictDoUpdate` target in `storeMatch()` needs updating to match the new 3-column constraint. The presence page (`DspPresenceView.tsx`) already supports multiple items per provider visually — it just filters by status. Secondary candidates would appear as `status: 'suggested'` cards.

**Tactical mitigation:** Founder identity blacklist shipped in `lib/spotify/blacklist.ts` — blocks all wrong "Tim White" Spotify IDs from search, enrichment, and claiming. This is a hardcoded stopgap; the multi-candidate matching system above is the proper solution.

**Depends on:** PR that expanded `targetProviders` to `['apple_music', 'deezer', 'musicbrainz']` must land first so Deezer/MusicBrainz matches exist to surface.

---

## Admin-gated items in user-facing menus

**What:** Add `isAdmin`-gated admin actions (refresh ingest, verify, feature, marketing toggle) to dashboard profile action builders so admins can manage their own profile without navigating to admin tables.

**Why:** Currently admins must switch to the admin creator profiles table to perform actions like refresh ingest or verify on their own profile. This breaks the "same actions everywhere" pattern established in the action menu consolidation PR.

**Context:** `useDashboardData().isAdmin` is already available client-side in all dashboard contexts. Server endpoints for admin actions already have auth checks. The gap is identifying which dashboard views show the user's own creator profile and wiring an `isAdmin` option into the action builder for those views.

**Depends on:** Action menu consolidation PR (Phases 1-3) must land first.

## Legacy Artist type removal

**What:** Replace the `Artist` interface (in `types/db.ts`) with direct use of `CreatorProfile` across ~170 files. Remove `convertCreatorProfileToArtist()` bridge function.

**Why:** The `Artist` type is a thin wrapper around `CreatorProfile` that exists purely for backward compatibility. It creates a redundant conversion step at every component boundary and makes it harder to add new profile fields (you have to update both types).

**Context:** ~170 files reference `Artist`. The conversion function `convertCreatorProfileToArtist()` in `types/db.ts` is the main bridge. Components like `StaticArtistPage`, `StaticListenInterface`, and all profile components consume `Artist`. This is a large mechanical refactor — no logic changes, just type/prop threading.

**Depends on:** Nothing blocking. Can be done incrementally by component tree.

## Dashboard DSP editing UI

**What:** Surface all discovered DSPs (including new international ones from MusicFetch) in the artist dashboard with edit/toggle controls.

**Why:** Artists need to review and correct auto-discovered DSP links, especially for regional platforms where auto-matching may be less accurate. Currently only social links are editable in the dashboard — DSPs stored as social links with `platformType: 'dsp'` are visible but the full set from `creator_profiles` columns isn't surfaced.

**Context:** The DSP registry (`lib/dsp-registry.ts`) now has 30 streaming DSPs. The enrichment pipeline stores discovered links in `social_links` table. Dashboard needs a dedicated DSP section showing all discovered links grouped by category, with edit/delete/add controls. Design needed.

**Depends on:** DSP registry PR (this one) must land first.

## Genius lyrics integration

**What:** Use Genius links discovered via MusicFetch to pull and display lyrics on artist profiles.

**Why:** Lyrics are a high-value feature for fan engagement. MusicFetch returns Genius URLs during enrichment — we store them but don't use them yet.

**Context:** `MUSICFETCH_LINK_MAPPINGS` excludes metadata services by design (they're stored in the registry as `category: 'metadata'`). Genius URLs from MusicFetch are available in `artistData.services.genius.link`. Need: (1) persist Genius URL during enrichment, (2) fetch lyrics via Genius API or scraping, (3) display component on profile/release pages. Needs design.

**Depends on:** DSP registry PR. Also needs Genius API key or scraping strategy.

## Post-signup birthday capture

**What:** Add an optional birthday field (month + day only, no year) to the post-signup name capture flow.

**Why:** Birthday data enables future birthday notifications and fan segmentation. Month/day only avoids age-related privacy concerns.

**Context:** The post-signup name capture flow (added in the name capture PR) already has the UX pattern — a lightweight optional field shown after email subscription. Adding birthday means a second field in that flow. Risk: a second field may reduce conversion on the name field. Ship name capture first, collect ~2 weeks of conversion data, then evaluate whether adding birthday is worth the friction.

**Depends on:** Post-signup name capture PR must ship first. Need ~2 weeks of name capture conversion data before deciding.

---

## Post-checkout celebration redesign

**What:** Replace the current `/billing/success` page (which shows "You're eligible for verification" + verification request button) with a proper celebration: animated effect, "Welcome to Pro" headline, 3 concrete unlocked features shown visually, then CTA to dashboard.

**Why:** Users who just paid should feel great about their decision, not confused by a verification form. The current page is transactional rather than celebratory, which hurts post-purchase sentiment and increases early churn risk.

**Context:** The existing success page is at `apps/web/app/billing/success/page.tsx`. It tracks `subscription_success` analytics and has a verification request flow. The redesign should keep the verification request option but make the celebration the primary experience. Use entitlements from `ENTITLEMENT_REGISTRY` to show what specifically unlocked.
Implementation note: any PR touching `/api/stripe/`, `/api/billing/`, auth middleware, Clerk sync, proxy-state, onboarding flow, or leads pipeline must be manually reviewed and must not use auto-merge.

**Effort:** M (a few hours)
**Priority:** P1
**Depends on:** Onboarding checkout step PR (provides the funnel that leads here).

---

## Win-back emails for checkout skippers

**What:** When a user has plan intent (clicked a paid pricing CTA) but clicks "Skip" on the onboarding checkout step, enqueue a follow-up email 24h later with their profile link + "Ready to unlock Pro?" CTA.

**Why:** These users expressed purchase intent then bailed — they're warm leads. A well-timed email has high conversion potential. The `onboarding_checkout_skipped` analytics event from the funnel PR provides the trigger signal.

**Context:** Requires email-sending infrastructure (transactional email provider integration). The plan intent and skip event are tracked via analytics. Need to build: email template, scheduling/queue system, unsubscribe handling, and A/B test framework for subject lines. Scope must include GDPR/CCPA consent checks for marketing versus transactional email classification, opt-in versus opt-out rules by jurisdiction, privacy policy updates, retention and archival rules for `onboarding_checkout_skipped` events plus related profile-link data, unsubscribe and consent-flag enforcement before scheduling, and a compliance checkpoint for the A/B test framework and email templates.
Implementation note: any PR touching `/api/stripe/`, `/api/billing/`, auth middleware, Clerk sync, proxy-state, onboarding flow, or leads pipeline must be manually reviewed and must not use auto-merge.

**Effort:** L
**Priority:** P3
**Depends on:** Onboarding checkout step PR + email sending infrastructure.

---

## Admin dashboard funnel analytics

**What:** Add a conversion funnel view to the admin dashboard showing the full signup-to-paid pipeline: `plan_intent_captured` → `signup_completed` → `onboarding_completed` → `onboarding_checkout_shown` → `onboarding_checkout_initiated` → `onboarding_checkout_completed`, with drop-off rates at each stage, skip rates, plan breakdown (founding vs pro), monthly/annual split, and time-to-convert metrics.

**Why:** We're instrumenting 11+ analytics events in the conversion funnel but have no admin visibility into the data. Without a dashboard, we're flying blind on conversion rates and can't identify where users drop off.

**Context:** All analytics events are tracked via `track()` from `apps/web/lib/analytics.ts` which sends to gtag. The admin dashboard likely lives under `/app/admin`. The funnel view should aggregate events by day/week and show stage-by-stage conversion rates with trend lines.
Implementation note: any PR touching `/api/stripe/`, `/api/billing/`, auth middleware, Clerk sync, proxy-state, onboarding flow, or leads pipeline must be manually reviewed and must not use auto-merge.

**Effort:** M
**Priority:** P1
**Depends on:** Onboarding checkout step PR (provides the events to visualize).

---

## Weekly creator digest email

**What:** A weekly email to creators summarizing their week — "12 new fans subscribed, 347 profile views, your top city is Los Angeles, 2 tips received." Simple, data-driven, with a CTA back to the dashboard.

**Why:** The #1 retention mechanic for dashboard products. Creators who see their numbers going up come back. Without this, the only thing bringing creators back is curiosity.

**Context:** Uses Resend (already integrated). Only sent if there's activity to report (no empty emails). Needs the analytics data infrastructure to aggregate weekly stats per creator. Query patterns exist in `lib/db/queries/analytics.ts`.

**Effort:** M (human ~2 days / CC ~20 min)
**Priority:** P1
**Depends on:** Analytics data flowing post-launch. Build week 2-3.

---

## Card pattern unification

**What:** Extend base `Card` (`packages/ui/atoms/card.tsx`) with surface variants (`default`, `marketing`, `settings`, `drawer`, `flat`), then deprecate `ContentSurfaceCard` (107 consumers) and `DrawerSurfaceCard` (28 consumers) as thin wrappers.

**Why:** Three card abstractions serve overlapping purposes with different APIs (`Card` from packages/ui, `ContentSurfaceCard` with CVA surface variants, `DrawerSurfaceCard` with card/flat variant). Consolidating into one Card component with a `surface` prop reduces cognitive load, prevents further drift, and makes the design system predictable.

**Context:** `ContentSurfaceCard` is at `apps/web/components/molecules/ContentSurfaceCard.tsx` with ~107 consumer files. `DrawerSurfaceCard` is at `apps/web/components/molecules/drawer/DrawerSurfaceCard.tsx` with ~28 consumers. Base `Card` is at `packages/ui/atoms/card.tsx`. The migration can be incremental — deprecate the wrappers, migrate consumers as files are touched.

**Depends on:** Nothing. Independent initiative.

---

## Button/icon-button consolidation

**What:** Add `icon-xs` (h-6 w-6) and `icon-sm` (h-7 w-7) sizes to base `Button` (`packages/ui/atoms/button.tsx`), align `DrawerButton` tone→variant naming (28 consumers), simplify `HeaderIconButton` to use base Button sizes (18 consumers), refactor `InlineIconButton` to use Button internally (15 consumers).

**Why:** `DrawerButton` reimplements variant logic (tone="primary/secondary/ghost" with custom TONE_CLASSNAMES) that already exists in base Button's variant system. `HeaderIconButton` maintains its own SIZE_CLASS_MAP (xs/sm/md) that duplicates what should be base Button sizes. `InlineIconButton` doesn't use Button at all — it renders raw `<button>`/`<a>` elements.

**Context:** Files: `apps/web/components/molecules/drawer/DrawerButton.tsx`, `apps/web/components/atoms/HeaderIconButton.tsx`, `apps/web/components/atoms/InlineIconButton.tsx`. Base Button at `packages/ui/atoms/button.tsx` already has CVA variants. HeaderIconButton already has tests at `apps/web/tests/unit/atoms/HeaderIconButton.test.tsx`.

**Depends on:** Nothing. Independent initiative.

---

## Audience segmentation for retargeting

**What:** Segment retargeting audiences by engagement level — high-intent (3+ visits and link clicks), cold (single page view), and tippers (sent money). Use segments to serve different ad creatives per audience tier.

**Why:** A single retargeting audience treats all visitors equally. Segmenting lets creators show aggressive CTAs to high-intent fans and softer awareness ads to cold visitors, improving ad spend efficiency and conversion rates.

**Context:** The `audience_members` table already tracks `visits`, `engagement_score`, `intent_level`, and `latest_actions`. Segmentation logic can be built on top of these fields. The retargeting ad creative endpoint can accept a segment parameter to generate tailored creatives. Custom Audience sync (if using Meta Marketing API) would create separate audiences per segment.

**Effort:** M
**Priority:** P2
**Depends on:** Retargeting hardening PR (conversion attribution + pixel forwarding).

---

## New ad platforms (Pinterest, Snapchat, X/Twitter)

**What:** Add Pinterest Tag, Snapchat Pixel, and X/Twitter pixel forwarding. Follow the existing forwarder pattern established by `facebook.ts`, `google.ts`, and `tiktok.ts` in `lib/tracking/forwarding/`.

**Why:** Creators advertise across more platforms than Meta/Google/TikTok. Supporting additional pixels broadens the retargeting funnel without changing the architecture.

**Context:** Each new platform needs: a forwarder file in `lib/tracking/forwarding/`, credentials columns in `creator_pixels` schema, UI fields in the pixel settings section, and platform API account setup. The forwarding orchestrator (`index.ts`) already handles multi-platform dispatch — new platforms plug in via the same pattern.

**Effort:** M per platform
**Priority:** P3
**Depends on:** Retargeting hardening PR.

---

## Auto-audience creation via Meta Marketing API

**What:** Programmatically create and update Custom Audiences in Meta Ads Manager using the Marketing API, instead of requiring creators to manually configure Website Visitors and Subscribe exclusion audiences.

**Why:** Manual Custom Audience setup in Ads Manager is the highest-friction step in the retargeting workflow. Automating it removes a multi-step process that most independent artists struggle with.

**Context:** Requires Meta Marketing API integration with an OAuth flow for creators to grant `ads_management` permission. The API supports creating Website Custom Audiences and updating them with hashed user data. Scope includes audience creation, membership sync, and exclusion audience management.

**Effort:** L
**Priority:** P3
**Depends on:** Retargeting hardening PR.

---

## Self-healing credential detection

**What:** Periodically send test events to each creator's configured ad pixels. Auto-disable pixels that fail 3 consecutive test events. Notify the creator via dashboard banner and email. Re-enable automatically when credentials are updated.

**Why:** Broken credentials silently waste the forwarding pipeline's resources and give creators a false sense that their ads are working. Proactive detection catches issues before the creator notices missing conversions.

**Context:** The test event API (`/api/dashboard/pixels/test-event`) already exists for manual testing. This extends it into an automated health check, likely as a cron job that iterates over active `creator_pixels` rows. The `creator_pixels` table would need a `consecutive_failures` counter and `disabled_at` timestamp. Notification uses the existing dashboard notification pattern.

**Effort:** M
**Priority:** P2
**Depends on:** Retargeting hardening PR (pixel health status + test event button).

---

## Ad creative auto-refresh

**What:** When an artist updates their profile photo, automatically regenerate cached retargeting ad creatives stored in Vercel Blob. Trigger from the profile update handler.

**Why:** Stale creatives with outdated photos look unprofessional and reduce ad click-through rates. Auto-refresh keeps creatives current without requiring the artist to manually regenerate.

**Context:** The ad creative endpoint (`/api/dashboard/retargeting/ad-creative`) generates images on demand and can cache them in Vercel Blob. The profile update handler in the dashboard settings flow is the trigger point. Implementation adds a post-update hook that invalidates/regenerates the 4 creative variants (fan-feed, fan-story, claim-feed, claim-story).

**Effort:** S
**Priority:** P3
**Depends on:** Retargeting hardening PR.

---

## Weekly pixel digest email

**What:** Send a weekly summary email to creators with active pixels: "This week: 423 page views forwarded, 89% success rate, 12 new subscribers from retargeting." Only sent if there's forwarding activity. Uses Resend.

**Why:** Creators rarely check their dashboard daily. A weekly digest keeps them aware of their retargeting performance and nudges them back to the dashboard when numbers are interesting.

**Context:** Requires aggregating `pixel_events` stats per creator for the past 7 days (forwarded count, success/failure rate) and joining with attribution data from `audience_members`. Uses the existing Resend integration. Should be a cron job (weekly, e.g. Monday 10am UTC). Needs an unsubscribe mechanism and should respect notification preferences.

**Effort:** M
**Priority:** P2
**Depends on:** Retargeting hardening PR (forwarding observability + conversion attribution).

---

## Defensive column selection for profile/release queries

**What:** Refactor `getProfileByClerkId` (`app/api/dashboard/profile/lib/db-operations.ts:93`) and `updateProfileRecords` (`:70`) to select/return specific columns instead of full-table `select({ profile: creatorProfiles })` and bare `.returning()`.

**Why:** Full-table selects break at runtime when a schema column exists in Drizzle but not in the DB. The verify gate now prevents deploying broken code, but defensive queries prevent runtime errors entirely — belt AND suspenders.

**Context:** Only 2 queries use the full-table pattern. Both are in `db-operations.ts` and serve the profile API route (`GET/PUT /api/dashboard/profile`). Changing them alters the API response shape, so audit all dashboard client consumers first.

**Effort:** M (human: ~2 days / CC: ~30 min)
**Priority:** P2
**Depends on:** Nothing.

---

## Connection pool monitoring

**What:** Add lightweight connection pool utilization logging (active/idle/waiting counts) to dashboard data queries, emitted as Sentry breadcrumbs.

**Why:** The social links timeout root cause was connection starvation, but we had no metrics to prove it. Pool monitoring would let you see `pool: 10/10 active, 3 waiting` in Sentry breadcrumbs when timeouts occur, making future diagnosis instant.

**Context:** The pool is configured in `apps/web/lib/db/client/connection.ts` with max=10. Neon's `Pool` class exposes `pool.totalCount`, `pool.idleCount`, `pool.waitingCount`. Add breadcrumbs in the `dashboardQuery()` wrapper in `apps/web/lib/db/query-timeout.ts`.

**Effort:** S (human ~30min / CC ~5min)
**Priority:** P2
**Depends on:** Nothing.

---

## Creator-facing playlist OAuth and ownership

**What:** Extend the admin-only playlist Spotify bootstrap into the final creator-facing model: `/jovie` system profile ownership, multi-artist Spotify OAuth, playlist ownership mapping, playlist preview/diff before generation, generation history UI, saved playlist presets/templates, and creator-facing controls.

**Why:** The first implementation intentionally only lets an admin connect a Jovie publisher account and bootstrap pending playlist generation. The public product needs creator-level ownership and safer preview/review controls before it becomes self-serve.

**Priority:** P2
**Depends on:** Admin Platform Connections bootstrap.

---

## Post-upgrade pixel pre-fill from Linktree detection

**What:** When a creator upgrades to Pro, check if `discoveredPixels` has data (from Linktree ingestion). If so, surface their detected pixel IDs in the post-checkout celebration flow or first Settings > Audience visit: "We found your Facebook Pixel 123456 — enable it?" Pre-fill the `creatorPixels` row with the discovered ID on confirm.

**Why:** Removes the manual pixel setup step for ad-savvy creators upgrading to Pro. The magic moment — Jovie already knows your pixel ID from your Linktree. Partial auto-populate: pixel IDs are public (in page source), but access tokens are NOT in HTML. Creator still needs to add their token for server-side forwarding.

**Context:** PR `itstimwhite/linktree-pixel-detect` stores discovered pixel IDs on `creator_profiles.discoveredPixels` (jsonb). The `creatorPixels` table and `/api/dashboard/pixels` route handle pixel config (Pro-gated). Post-checkout page is at `apps/web/app/billing/success/page.tsx`. Settings > Audience is the pixel settings page. The `getCreatorOwnedPixels()` helper filters raw detected data against the auto-maintained suppression list. Codex flagged: the pixel settings API auto-computes enabled flags from full credentials, so pre-fill should only set the ID field, not the enabled flag.

**Effort:** M (human: ~3 days / CC: ~20 min)
**Priority:** P2
**Depends on:** Linktree pixel detection PR (stores the data this feature surfaces).

---

## Email pitch submission to DSPs

**What:** Send AI-generated playlist pitches via email to platforms that accept editorial pitches through dedicated email addresses.

**Why:** Eliminates the final copy-paste step for platforms with email intake. The auto-generated pitch text is already formatted per platform — email submission makes the pitch flow feel automated even without APIs.

**Context:** The pitch generator PR (`itstimwhite/auto-pitch-generator`) stores per-platform pitches on `discogReleases.generatedPitches`. Resend is already integrated for transactional email. Need to research which DSPs accept email pitches, their required formats, and submission email addresses. Some platforms (e.g., Amazon Music for Artists) have known intake forms or email addresses.

**Effort:** S (human: ~1 day / CC: ~15 min)
**Priority:** P2
**Depends on:** Auto pitch generator PR.

---

## Pitch generation as automated release task

**What:** Make pitch generation an automated release task (`assigneeType: 'ai_workflow'`) that auto-triggers when a release is created, with status tracked in the release task checklist.

**Why:** Artists forget to pitch. An auto-generated pitch appearing in their task list with a "Review & Copy" action makes it part of their release workflow rather than a separate tool they have to remember to use.

**Context:** The release task system already supports `ai_workflow` assignee types with "Automatic with Pro" badges. The `generatePitches()` service from `lib/services/pitch/` can be called from the task instantiation flow. Need to decide on trigger timing: on release creation, or X days before release date (editorial teams need 2-4 weeks lead time). Also need to handle the case where `careerHighlights` is empty — still generate but note in the task that adding context will improve quality.

**Effort:** S (human: ~1 day / CC: ~15 min)
**Priority:** P2
**Depends on:** Auto pitch generator PR.

---

## Flaky onboarding performance budget test

**What:** `tests/components/dashboard/organisms/onboarding-v2-performance.test.tsx` — handle screen render budget (200ms) fails intermittently (measured 378ms). The threshold may be too tight for CI runners.

**Why:** Blocks CI with false positives. Not a real regression, just environment-dependent timing.

**Priority:** P2
**Noticed on:** itstimwhite/ci-pr-strictness (2026-03-27) — pre-existing, not caused by branch changes.

---

## Trial-aware upgrade nudges — Phase 2

**What:** Phase 1 (commit `8a27e3fec`, v26.4.185) shipped the price-formatting plumbing in `lib/billing/verified-upgrade.ts` and the 8-state nudge machine in `lib/queries/usePlanGate.ts:deriveNudgeState()` (`never_trialed | trial_honeymoon | trial_late | trial_last_day | recently_lapsed | stale_lapsed | pro_paid | max_paid`). Phase 2 should specify what actually fires per state — sidebar banner copy, dashboard placements, win-back emails, and the ramp plan.

**Why:** Without phase 2 documented, the state machine bitrots — new states get added without callers, banner copy drifts from price-format helpers, and the team forgets which lapse window does what. Worse, we ship a half-instrumented surface and can't tell whether the nudge moved the upgrade rate.

**Open questions for Phase 2:**
- Which states get a sidebar banner vs. an in-line dashboard prompt vs. an email?
- Win-back email cadence (24h after trial-end? 7d? 30d?) and stop conditions
- A/B framework — which state(s) are we testing first
- Funnel metrics — drop-off per state, conversion-by-state, dashboard for ramp tracking
- 50-fan notification cap (per pricing memory) — does Phase 2 expose a "approaching cap" nudge for free users?

**Context:** Phase 1 is intentionally read-only — it's the data layer. Phase 2 is the surfacing layer. Banner shell already exists at `apps/web/components/.../SidebarUpgradeBanner.tsx` (`buildVariant()`). When Phase 2 is scoped, this entry should be replaced with concrete sub-tickets (one per nudge surface) and the docs at `apps/web/lib/billing/README.md` updated.

**Effort:** TBD — likely M for the banner pass alone, L if win-back emails + admin funnel dashboard are bundled in.
**Priority:** P2 — Phase 1 is shipped and stable; not blocking, but at risk of stalling.
**Noticed on:** Post-merge audit of v26.4.185 (2026-04-28).

---

### Video Release Health Check + Artist Observability

**What:** Three-layer system for broken video detection:
1. **Client-side (shipped):** VideoReleasePage fires a `video_embed_failed` tracking beacon and redirects to the artist's profile on iframe load failure. Never show a dead page.
2. **Server-side cron (TODO):** Periodic health check pings YouTube Data API for each music_video release. When a video is unavailable: temporarily hide the release, redirect the page server-side (before it even renders), and email the artist.
3. **Artist notification (TODO):** Email the artist: "Your video [title] is temporarily hidden because [reason]. Update the YouTube link or contact support." Artists don't have dev tools or observability — we need to give it to them.

**Why:** Music artists and marketers don't have observability like developers do. A broken video link is a dead end: fans bounce, the artist loses conversions, and nobody knows. This is the infrastructure gap between dev tooling and creator tooling.

**Design decisions (from user):**
- Paid-only entitlement (Pro/Max plans) for the server-side cron
- Redirect whole page, NOT show error message or empty state
- Redirect destination: artist profile (`/{handle}`)
- Email the artist so they can actually fix it

**Depends on:** Music video support (itstimwhite/music-video-support)
**Priority:** P2
**Noticed on:** itstimwhite/music-video-support (2026-04-12) — /plan-eng-review
