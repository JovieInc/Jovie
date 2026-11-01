# Golden Path coverage map

Step to executable-test map for the artist Golden Path: homepage or claim link, then signup, then paid, then first real use, plus public profiles and smart links. Written 2026-10-25 against main `bb937b5f05` (JOV-7998). Incumbent certification issues: JOV-8250 (exact-build composed journey), JOV-6920 (revenue gate). This doc is the inventory; the ratchets in `scripts/golden-path-assurance.json` keep it from shrinking.

## Verdict on main (bb937b5f05)

- The Golden Path lane (`ci.yml` job `Golden Path (manual)`, main push and dispatch only) is RED. It failed on the last three main pushes (runs 40233303376, 40235355827, 40239590202). The one-test journey `golden-path.spec.ts` stops at STEP 6 (`Claim did not persist the real Spotify identity`), so STEPs 7 to 9 (dashboard, live profile, billing, refund, revocation) do not run. Cause: #23277 made claims private until proof and the fixture recorded no operator approval. Fix: #23293. Last green: 5662b61b.
- A failing journey also poisons the Playwright artifact guard (`error-context.md` is a markdown file the guard refuses), so `Verify live canonical profile navigation` dies with `inspection-error` before it runs and the canonical certificate marks navigation red too. Left fail-closed on purpose.
- Unit and component tests listed below are gated by the merge queue before they land; they are not re-run on main pushes, so "green" for them means green at merge.
- What the green lane proves is narrower than the name: deterministic OTP (code 424242, no real inbox), locally signed Stripe webhook fixture, in-memory session and billing cache, one identity (no two-user isolation), stubbed Google denial.

## Legend

- REAL: real server, real database or real Stripe test mode on the path under test.
- MOCKED: the contract under test is exercised with the named dependency mocked. Meaningful for branch logic, not for integration.
- SKIPPED-GATED: skips (or has skip branches) without env, seed data or a real DB. A green run can mean zero assertions ran.
- MISSING: no executable test.
- Main: result on current main. `green` for unit rows is green at merge. `queue` rows run in the PR or merge-queue e2e lanes. `not on main push` rows run in PR, nightly or dispatch lanes only.

## Map

## Summary

| Status | Rows |
|---|---|
| REAL | 26 |
| REAL but gated | 4 |
| MOCKED | 40 |
| SKIPPED-GATED | 2 |
| MISSING | 19 |
| N/A | 1 |
| Total | 92 |

| ID | Step | Variant | Executable test (file:test) | Level | Status | Main |
|---|---|---|---|---|---|---|
| E1 | Homepage | hero + single primary CTA | tests/e2e/homepage.spec.ts: renders the artist-profile hero | e2e | REAL | queue |
| E2 | Homepage | handle handoff to /start | homepage.spec.ts: claiming a handle hands off with the handle | e2e | MOCKED (handle API) | queue |
| E3 | Homepage | no-JS handle handoff | homepage.spec.ts: native GET handle handoff without JavaScript | e2e | MOCKED (handle API) | queue |
| E4 | Homepage | chat intent to /start | tests/e2e/homepage-intent.spec.ts: pill + Enter persists intent and redirects | e2e | REAL | queue |
| E5 | Homepage | name search | none (retired surface) | - | N/A | - |
| E6 | /start | restore, no double send, claim handoff composer | tests/e2e/start-entry-continuity.spec.ts: fresh handoff submits once; claim handoff retains composer (4 widths) | e2e | REAL | green (lane: 22/23 passed) |
| E7 | /start | anonymous chat to terminal decision | golden-path.spec.ts STEP 2 driveAnonymousOnboardingJourney | e2e | REAL | RED (journey red at STEP 6; fix #23293) |
| C1 | Claim link | valid token stores context, redirects | tests/unit/app/claim-token-route.test.ts: stores claim context and redirects valid tokens | unit | MOCKED (db, cookie, limiter) | green |
| C2 | Claim link | invalid, missing, unknown profile, synthetic, rate limited | claim-token-route.test.ts (6 tests) | unit | MOCKED | green |
| C3 | Claim link | expired token | tests/unit/profile/claim-token-expiry.test.ts | unit | MOCKED (asserts WHERE shape only) | green |
| C4 | Claim link | token replay after claim | none against real DB (only isClaimed=false clause shape) | - | MISSING | - |
| C5 | Claim link | tampered / other-profile token | none | - | MISSING | - |
| C6 | Claim link | token hash | tests/unit/lib/security/claim-token.test.ts | unit | REAL (pure) | green |
| C7 | Claim link | token end to end to banner + signup CTA | tests/e2e/claim-prebuilt.smoke.spec.ts: claim token link lands on prebuilt profile | e2e | REAL (needs DB fixture) | green (lane: 22/23 passed) |
| C8 | Claim link | /[username]/claim routing | tests/unit/app/[username]/claim/route.test.ts | unit | MOCKED | green |
| C9 | Claim link | /claim/start (new artist, famous artist, claimed, fails closed) | app/claim/start/route.test.ts | unit | MOCKED | green |
| C10 | Claim link | ?claim=1 banner state | tests/unit/app/profile-claim-banner-state.test.ts | unit | REAL (pure) | green |
| C11 | Claim link | claim token A/B mismatch | no code counterpart found; conversion worker owns | - | MISSING | - |
| S1 | Signup | email OTP happy path (real Better Auth + DB) | golden-path.spec.ts createFreshUser | e2e | MOCKED (deterministic OTP 424242) | RED (inside the failing journey; unreached after STEP 6, last green 5662b61b) |
| S2 | Signup | OTP UI errors, cooldown, resend, change email | components/features/auth/EmailCodeAuthForm.test.tsx | unit | MOCKED (auth client) | green |
| S3 | Signup | OTP sender failures | lib/auth/email-otp-sender.test.ts | unit | MOCKED (provider) | green |
| S4 | Signup | OTP rate limit counter | lib/auth/rate-limit-storage.test.ts | unit | MOCKED (redis) | green |
| S5 | Signup | wrong OTP / expired OTP / reuse, server side | none | - | MISSING | - |
| S6 | Signup | Google provider failure recovery | golden-path.spec.ts exerciseGoogleProviderRecovery | e2e | MOCKED (provider route aborted) | RED (inside the failing journey; unreached after STEP 6, last green 5662b61b) |
| S7 | Signup | Google denial | tests/e2e/auth-oauth-deny.spec.ts | e2e | MOCKED (injected ?oauth_error) | not on main push |
| S8 | Signup | OAuth state tamper/expiry | lib/auth/oauth-provider-error-return.test.ts | unit | REAL (signing logic) | green |
| S9 | Signup | refresh/back mid-OTP across claim handoff | none | - | MISSING | - |
| O1 | Ownership | claim prebuilt profile (conflicts, expiry, resume) | lib/claim/finalize.test.ts (~30) | unit | MOCKED (tx) | green |
| O2 | Ownership | /api/onboarding/claim (401, CAS race, 409 other user) | tests/unit/api/onboarding/claim.test.ts (~30) | unit | MOCKED (db, auth) | green |
| O3 | Ownership | materialize profile (handle conflict, non-owner, high reach) | tests/unit/lib/onboarding/claim-profile.test.ts | unit | MOCKED | green |
| O4 | Ownership | ownership gate | lib/onboarding/ownership-gate.test.ts | unit | REAL (pure) | green |
| O5 | Ownership | claim persisted in real DB, one identity | golden-path.spec.ts STEP 3-6 (SQL proof) | e2e | REAL | RED (fails here; fix #23293) |
| O6 | Ownership | two users, same profile / conversation (isolation) | none (only mocked single-actor cases) | - | MISSING | - |
| O7 | Ownership | concurrent double claim on real DB | none (mocked CAS only) | - | MISSING | - |
| O8 | Ownership | signed-in user who owns another profile opens a claim link | finalize.test.ts "already owns another profile" | unit | MOCKED | green |
| O9 | Ownership | real DB persistence | tests/integration/onboarding-completion.test.ts | integration | REAL (live DB, skips without DATABASE_URL) | not on main push |
| A1 | Admission | golden-path admission decision | lib/waitlist/golden-path-admission.test.ts | unit | REAL (pure) | green |
| A2 | Admission | server marker + private until proof | tests/unit/lib/waitlist/golden-path-admission.{marker,server}.test.ts; tests/unit/db-proof-before-public.trigger.test.ts | unit | MOCKED / PGlite | green |
| A3 | Admission | waitlisted vs approved landing | tests/e2e/nightly/auth-flows.spec.ts | e2e | MOCKED (dev auth fixture) | nightly only |
| A4 | Admission | auto-admitted artist stays private, no identity, e2e | none (unit only in claim.test.ts) | - | MISSING | - |
| X1 | Session | cached vs fresh reads | tests/unit/lib/auth/request-session.test.ts, cached.test.ts | unit | MOCKED | green |
| X2 | Session | revoked cookie mutations | tests/unit/api/auth/revoked-cookie-mutations.test.ts | unit | MOCKED | green |
| X3 | Session | revoked session cannot regain billing/portal | tests/e2e/helpers/golden-path-billing.ts (revoked return) | e2e | REAL (in-process cache only) | RED (inside the failing journey; unreached after STEP 6, last green 5662b61b) |
| X4 | Session | proxy / revocation on /app/* and /api/onboarding/claim | none; lib/auth/proxy-request-handler.ts has no test | - | MISSING | - |
| B1 | Offer | price and offer truth | lib/billing/offer-truth.test.ts | unit | REAL (pure) | green |
| B2 | Offer | pricing page CTA | tests/e2e/pricing.spec.ts | e2e | SKIPPED-GATED (env) | not on main push |
| B3 | Checkout | create session: 401, price mismatch, forged intent, transient errors | tests/unit/api/stripe/checkout.test.ts | unit | MOCKED (Stripe SDK, db) | green |
| B4 | Checkout | live session, success/cancel URLs (Stripe test mode) | golden-path-billing.ts; tests/e2e/billing-checkout.spec.ts | e2e | REAL (Stripe test mode); billing-checkout SKIPPED-GATED | RED (inside the failing journey; unreached after STEP 6, last green 5662b61b) |
| B5 | Return | other user's session never revealed | tests/unit/api/billing/checkout-session.test.ts | unit | MOCKED | green |
| B6 | Return | fresh-browser return | golden-path-billing.ts returningContext | e2e | REAL | RED (inside the failing journey; unreached after STEP 6, last green 5662b61b) |
| W1 | Webhook | missing signature header | tests/unit/api/stripe/webhooks.signature.test.ts | unit | MOCKED (constructEvent) | green |
| W2 | Webhook | bad signature rejected | webhooks.signature.test.ts (stub throws) | unit | MOCKED | green |
| W3 | Webhook | bad signature, real SDK, no rows written | golden-path-billing.ts (v1=invalid -> 400) | e2e | REAL | RED (inside the failing journey; unreached after STEP 6, last green 5662b61b) |
| W4 | Webhook | valid signature accepted (real SDK) | tests/integration/stripe-webhook-reconciliation.test.ts | integration | REAL (gated DB) | not on main push |
| W5 | Webhook | duplicate delivery sequential | webhooks.idempotency.test.ts; golden-path-billing.ts duplicateCheckoutResponse | unit/e2e | MOCKED / REAL | green / RED (inside the failing journey; unreached after STEP 6, last green 5662b61b) |
| W6 | Webhook | concurrent duplicate deliveries (two POSTs) | none (writer race only, billing-persistence-concurrency.test.ts) | - | MISSING | - |
| W7 | Webhook | out-of-order / stale events | tests/lib/stripe/billing-hardening.test.ts | unit | MOCKED | green |
| W8 | Webhook | replay worker | tests/unit/lib/billing/webhook-replay.test.ts | unit | MOCKED | green |
| W9 | Webhook | merch/tips/connect signature | tests/unit/api/webhooks/stripe-connect.test.ts, stripe-tips.test.ts, stripe-merch-claim.test.ts | unit | MOCKED (not read) | green |
| N1 | Entitlement | grant exactly once, audit row, real DB | golden-path-billing.ts; tests/integration/billing-persistence-concurrency.test.ts | e2e/integration | REAL | RED (inside the failing journey; unreached after STEP 6, last green 5662b61b) |
| N2 | Entitlement | redirect alone does not grant | golden-path-billing.ts redirectOnlyUser | e2e | REAL | RED (inside the failing journey; unreached after STEP 6, last green 5662b61b) |
| N3 | Entitlement | wrong user (metadata vs customer owner conflict) | none explicit | - | MISSING | - |
| N4 | Entitlement | price provenance / unmapped price | creator-plan.test.ts; checkout-handler.critical.test.ts | unit | MOCKED | green |
| N5 | Revocation | full refund revokes Pro (real Stripe) | golden-path-billing.ts refund | e2e | REAL | RED (inside the failing journey; unreached after STEP 6, last green 5662b61b) |
| N6 | Revocation | refund/cancel/dispute branches | charge-handler.test.ts, subscription-handler.deleted.test.ts | unit | MOCKED | green |
| N7 | Revocation | billing cache invalidated after revoke (real cache) | none (invalidateBillingCache mocked everywhere) | - | MISSING | - |
| N8 | Entitlement | dunning past_due and recovery | payment-handler.failure.test.ts, dunning.test.ts | unit | MOCKED | green |
| N9 | Portal | portal session | golden-path-billing.ts; portal.test.ts | e2e/unit | REAL / MOCKED | RED (inside the failing journey; unreached after STEP 6, last green 5662b61b) |
| U1 | First use | dashboard landing after claim | golden-path.spec.ts STEP 7 | e2e | REAL | RED (not reached; #23293) |
| U2 | First use | profile live, fresh context | golden-path.spec.ts STEP 8 | e2e | REAL | RED (inside the failing journey; unreached after STEP 6, last green 5662b61b) |
| U3 | First use | smart link creation / first release after payment | none tied to paid entitlement | - | MISSING | - |
| P1 | Public profile | render, 404, noindex | public-profile-smoke.spec.ts; public-profile-page-route.test.tsx | e2e/unit | REAL (DB) / MOCKED | green / gated |
| P2 | Public profile | loader: reserved, private, storage failure | app/[username]/_lib/public-profile-loader.test.ts | unit | MOCKED | green |
| P3 | Public profile | modes + deep links | tests/e2e/profile.spec.ts | e2e | REAL, SKIPPED-GATED (seed) | not on main push |
| P4 | Public profile | legacy slug / alias redirects | profile-alias-edge.test.ts; profile-alias-decision.test.ts | unit | MOCKED | green |
| P5 | Public profile | case-variant handle redirect | none | - | MISSING | - |
| P6 | Public profile | private / unproven profile 404 + noindex, e2e | none | - | MISSING | - |
| P7 | Public profile | real Cache-Control / ISR headers | none | - | MISSING | - |
| P8 | Public profile | tip / pay | tipping.spec.ts (skip-heavy); create-checkout unit | e2e/unit | SKIPPED-GATED / MOCKED | not on main push |
| L1 | Smart link | release page phases, 404 for unpublished | app/[username]/[slug]/page-render.test.tsx, page-upcoming.test.ts, _lib/data.test.ts | unit | MOCKED | green |
| L2 | Smart link | released page offers a DSP | tests/e2e/smartlink-experience.spec.ts | e2e | REAL, SKIPPED-GATED (seed), Spotify only | not on main push |
| L3 | Smart link | per-DSP URL correctness (Apple, YT Music, Tidal, ...) | none | - | MISSING | - |
| L4 | Smart link | preferred DSP redirect behaviour | PreferredDspRedirect.test.tsx | unit | MOCKED (jsdom) | green |
| L5 | Smart link | /go/[id] tracking redirect (safety, sensitive interstitial) | none | - | MISSING | - |
| L6 | Smart link | /r/isrc/[isrc] and /r/[slug] redirect | none (metadata only) | - | MISSING | - |
| L7 | Smart link | /[username]/s/[platform] safe redirect | tests/unit/app/username-s-platform-route.test.ts | unit | MOCKED | green |
| L8 | Smart link | bot / crawler routing at route level | detection unit only (bot-detection.test.ts, smart-link-admission.test.ts) | unit | REAL (pure); route-level MISSING | green |
| L9 | Smart link | track URL redirect keeps query | smartlink-track-redirect.spec.ts | e2e | REAL, fixture | not on main push |
| L10 | Smart link | resolver creation | lib/music-resolver/smart-link.test.ts | unit | MOCKED | green |
| F1 | Fan capture | subscribe UI + OTP | profile-subscribe-e2e.spec.ts | e2e | MOCKED (all /api/notifications) | not on main push |
| F2 | Fan capture | real DB audience row | profile-fan-capture-golden-path.spec.ts | e2e | REAL, SKIPPED-GATED | not on main push |
| F3 | Fan capture | subscribe/verify API | subscribe.test.ts, verify-email-otp.test.ts | unit | MOCKED (thin) | green |

## Gaps, highest risk first

| Rank | Gap (rows) | Why it matters | Owner and status |
|---|---|---|---|
| 1 | Two-user ownership isolation on a real DB (O6, O7) | One artist reading or claiming another's profile, conversation or entitlement | Assurance stream: e2e probe in the golden-path journey (PR 3). Concurrent double claim still open |
| 2 | Webhook signature verification is mocked in every always-on test; no concurrent duplicate delivery test (W1, W2, W6) | Forged or double-applied payment events | Assurance stream: next PR. Real path is only in gated lanes (W3, W4) |
| 3 | Revocation never tested against the real billing cache after refund or cancel (N7, X4) | Revoked artist keeps Pro for the cache TTL (1 h); `invalidateBillingCache` swallows Redis errors | Assurance stream: next PR |
| 4 | Claim token replay and tamper (C4, C5); expiry only asserted as query shape (C3) | A claim link reused or forged takes over a profile | Assurance stream: next PR. Token A/B mismatch (C11) belongs to the conversion worker |
| 5 | Auto-admitted artist is private until proof, only unit-tested (A4) | The default admission path has no journey test; the green journey now covers the operator-approved artist only | Conversion worker (#23277 owner) |
| 6 | Wrong, expired, reused OTP on the server (S5); refresh and back mid-OTP (S9) | Signup abandonment and brute force | Auth owner |
| 7 | `/go/[id]`, `/r/isrc/[isrc]` redirects untested (L5, L6) | Open redirect and sensitive-link interstitial are in these routes; highest-traffic smart link surface | Assurance stream: next PR |
| 8 | Per-DSP URL correctness, bot routing, private profile 404, handle case redirect, ISR headers (L3, L8, P5, P6, P7) | Wrong destinations and index leaks | Backlog, ordered by traffic weight |
| 9 | First use after payment (U3) | The promise after paying is not tied to an entitlement test | Conversion worker with Ovie |
| 10 | Rows that run only in gated or nightly lanes (B2, A3, P3, P8, L2, L9, F1, F2, O9) | A green run can mean zero assertions | Make the lane required or fail on skip; tracked by the ratchet below |

Weak tests found: `tests/lib/claim/claim-flow.test.ts` tests regexes and date math defined inside the test and never imports the route; `tests/e2e/auth-oauth-deny.spec.ts` injects the error query instead of denying at the provider.

## Mutation scores

See `scripts/mutation-score-baseline.json` (enforced floors) and the sweep state on gem (`~/.local/state/jovie-mutation-gp/state.json`). Scores for the contract modules are recorded in the PR that adds their floors. The sweep before this work had scored 71 of 2,862 modules and none of the OTP, ownership or entitlement modules (it crawls alphabetically and had reached `lib/analytics`). Dynamic-route modules such as `app/claim/[token]/route.ts` could not be scored at all: Stryker received the path as a glob, where `[token]` is a character class, and matched zero files. Fixed in `scripts/lib/mutation-diff.mjs` (`escapeGlobPath`).

## The ongoing system

- `scripts/golden-path-assurance.json` lists the contract modules, each with a step, a funnel stage and a risk class. `rankModules` orders them by stage volume x risk weight; the mutation sweep takes that order first (`--priority`) and only then continues its alphabetical crawl. Volumes come from the funnel stage counts in #23269 / Ovie Growth (`--stage-counts <json>` overrides the snapshot in the manifest).
- `scripts/golden-path-assurance-baseline.json` holds the ratchets: missing rows may not grow, real rows may not shrink, the row count may not shrink, and `pendingBaseline` (modules without a mutation floor) may only lose entries. The check runs in the ci-fast scripts lane (`scripts/lib/__tests__/golden-path-assurance.test.mjs`) and fails on any regression or on a map row that names a test file that no longer exists.
- Mutation floors for these modules live in `scripts/mutation-score-baseline.json` (lock_up, enforced by Mutation Diff on every main push that touches them). The golden-path prefixes are added to `HIGH_RISK_PREFIXES` and the workflow path filter, so a change to a contract module triggers its mutation score check.
- Event-driven: the sweep already starts on main CI completion and chains itself. No new cron.
- Known limit: the Golden Path lane runs on main pushes and dispatch only (900 s spec), so a merge can break the journey and land. Today it is detected within one main push (it was red for 3 pushes before this map). Making contract-module PRs run the lane is a CI-capacity decision recorded as an open item.
