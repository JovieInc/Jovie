# TODOs

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

## Re-enrichment of existing artists

**What:** Run MusicFetch re-enrichment for all ~30 existing artists to populate newly supported DSP links.

**Why:** Existing artists were enriched with only 10 MusicFetch services. After this PR, the pipeline requests all 40 services. Existing profiles won't have links for the 30 new services until re-enriched.

**Context:** Use the existing dashboard refresh button (which calls `enqueueMusicFetchEnrichmentJob()`) to manually trigger re-enrichment for each artist. With ~30 artists this is feasible manually. For larger scale, a batch script would be needed.

**Depends on:** DSP registry PR must be deployed first.

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
