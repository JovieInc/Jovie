/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  coverageAnalysis: 'perTest',
  disableTypeChecks: false,
  reporters: ['progress', 'clear-text', 'json'],
  // Critical-surface targets driven by docs/TEST_RISK_REGISTER.md.
  // Mutation testing is where coverage % stops lying about test strength —
  // assertions that exercise but don't verify are exactly what mutation
  // testing surfaces. Expand this list conservatively (one new surface per
  // quarter per the strategy in docs/TESTING_GUIDELINES.md).
  mutate: [
    // Validation + onboarding helpers (existing — pure functions, fast)
    'constants/platforms/utils.ts',
    'lib/validation/handle.ts',
    'lib/validation/username.ts',
    'lib/validation/username-core.ts',
    'lib/validation/schemas/account.ts',
    'lib/validation/schemas/onboarding.ts',
    'lib/validation/schemas/payments.ts',
    'lib/cron/auth.ts',
    'lib/onboarding/discovery-readiness.ts',
    'lib/onboarding/profile-mode-collisions.ts',
    'lib/onboarding/reserved-handle.ts',
    'lib/onboarding/return-to.ts',
    'lib/onboarding/session-keys.ts',
    // Claim + onboarding intake surfaces (claim-onboarding row in heatmap):
    // /claim/[token] route (token validation, context write, early redirects)
    // /api/onboarding/intake (rate limit, email gate, ensure/upsert DB paths, waitlist submit)
    // /api/onboarding/claim (race CAS, idempotency, 409 unique, multiple candidates, audit)
    // Per register + priority queue (risk 28, 64% cov, target 75%, no mut score).
    // New dedicated tests (incl. property tests for recency/idempotency/failure) + existing
    // will now produce mutation kills on the critical branches.
    'app/claim/[[]token[]]/route.ts',
    'app/api/onboarding/intake/route.ts',
    'app/api/onboarding/claim/route.ts',
    // Entitlements (existing — critical gating)
    'lib/entitlements/**/*.ts',
    // Billing helpers (existing)
    'lib/billing/verified-upgrade.ts',
    'lib/stripe/connect-readiness.ts',
    'lib/stripe/plan-change.ts',
    // High-blast-radius additions per docs/TEST_RISK_REGISTER.md.
    // The heatmap currently shows 82% line coverage on the webhook route
    // but ~0% on negative paths (signature failures, replay, idempotency
    // collisions). Mutation testing will surface assertions that don't
    // exercise these branches.
    'app/api/stripe/webhooks/route.ts',
    // Webhook signature verification surface (webhook-signatures row, YELLOW risk 29.2,
    // PQ #1 with 33.5pp gap). Covers linear/resend/sentry/sms/stripe-connect/stripe-tips
    // routes for missing-signature, invalid-signature, replay (timestamp), malformed body,
    // and durable dedupe (onConflictDoNothing + processed flag). Complements stripe row;
    // enables mutation evidence on verification + idempotency branches per register notes.
    'app/api/webhooks/**/route.ts',
    // FAPI host decoding + Clerk env key resolution — broken auth here
    // locks out every user across all three Clerk environments.
    'lib/auth/decode-fapi-host.ts',
    'lib/auth/staging-clerk-keys.ts',
    'lib/auth/test-mode.ts',
    // Dev test-auth bypass (RED 35.7 per TEST_RISK_REGISTER.md + HEATMAP mutation warning).
    // High trust E2E surface: must fail closed on prod (NODE_ENV+VERCEL_ENV), spoofed headers,
    // persona allowlist (only creator/creator-ready/admin), trusted hosts only (no *.vercel.app).
    // Covers enter/session routes + dev-test-auth.server (availability, ensure actor, cached session,
    // cookie builders, redirect sanitize, outer catch paths with logger.warn).
    // Contract tests for bypass scenarios/failure modes + Stryker wiring (matches webhook, claim, rls patterns).
    'app/api/dev/test-auth/**/*.ts',
    'lib/auth/dev-test-auth.server.ts',
    // RLS access control (highest remaining risk RED surface 42.1 per heatmap + register):
    // lib/auth/session.ts covers validateClerkUserId, setupDbSession, withDbSession*,
    // getSessionContext (tenant/user resolution, throws for USER_NOT_FOUND/PROFILE/UNAUTHORIZED),
    // resolve + outer error paths. lib/api/with-dashboard-route.ts owns the standardized
    // outer catch for RLS-related failures (401/404/500, capture, NO_STORE on auth errors).
    // lib/auth/require-auth.ts handles test auth bypass + 401 contract responses.
    // Directly targets auth bypass, unauthorized tenant access, row-level violation
    // reporting, outer catch, 401/403 paths for the RLS surface.
    'lib/auth/session.ts',
    'lib/api/with-dashboard-route.ts',
    'lib/auth/require-auth.ts',
    // Waitlist gate + determine logic + proxy enforcement (canAccessApp,
    // canAccessOnboarding, requiresRedirect, getRedirectForState). Critical
    // for journey entry and negative paths (waitlist_pending, banned, needs
    // onboarding). Per register, proxy surface (68% line vs 85% target, blast
    // 5/rev 5) + claim-onboarding gaps; gate covers under-mutated failure modes
    // for waitlist/claim flows (high reversibility/visibility).
    'lib/auth/gate.ts',
    // Investor portal (handleInvestorRequest early returns for legacy
    // investors.jov.ie static _next + ?t= 301 redirects, token/cookie flows,
    // DB fail-closed validation, Redis dedup/idempotency for views).
    // Directly targets highest-risk proxy middleware surface (risk 43 RED,
    // auth + investor + audience per TEST_RISK_REGISTER + heatmap).
    // Contract tests in proxy-behavioral + dedup unit now kill mutants here.
    'lib/auth/investor-portal.ts',
    // proxy.ts (core middleware router + Clerk /__clerk proxy fetch logic + matcher).
    // Wired in gap-6 (after #9406 rls) to close mutation evidence gap on the top
    // risk RED 43 surface. Existing proxy-*.test.ts + behavioral now produce Stryker kills
    // for the remaining proxy.ts branches (post-extraction).
    'proxy.ts',
    // Claim-onboarding surface (per docs/TEST_RISK_REGISTER.md claim-onboarding row + heatmap priority).
    // Token-backed + direct claim routes, username claim handler (validation, auth checks, pending claim,
    // next=auth redirect matrix), onboarding intake (email verify gate, rate limit, ensure/upsert user+interview,
    // waitlist submit), onboarding claim (CAS race handling, 409 unique, audit, cookie clear), lib/claim
    // (crypto signed cookies, parse/expiry/validation error paths), finalize claim ops. Enables mutation
    // on high blast/reversibility claim + profile creation flows. See added matrix/negative-path tests.
    'app/claim/[[]token[]]/route.ts',
    'app/[[]username[]]/claim/route.ts',
    'app/api/onboarding/claim/route.ts',
    'app/api/onboarding/intake/route.ts',
    'lib/claim/context.ts',
    'lib/claim/finalize.ts',
    // Public profile ISR (public-profile-isr YELLOW surface per TEST_RISK_REGISTER.md + heatmap).
    // 1h revalidate + cache-tag invalidation (tags: 'profiles-all', `profile:${username}`).
    // Covers fetchProfileAndLinks + getCachedProfileAndLinks (unstable_cache, NODE_ENV bypass,
    // NonCacheableProfileResultError for not_found/error to avoid sticky stale on revalidate),
    // venmo synthetic link injection, error logging, calculateProfileCompletion, mapper contract.
    // Also profile-static-params (build-time getTopProfilesForStaticGeneration, fail-closed []),
    // public-profile-qa bypass flag, page.tsx server logic (generateMetadata, tour/playlist fallbacks,
    // claim banner separation from ISR, accent non-derivation), layout + opengraph-image for public SEO.
    // Wired in gap-7 (after #9407 proxy RED) to close mutation evidence gap on this high-visibility (5)
    // YELLOW 27.9 surface (risk* gap from PQ). Existing public-profile-page.test.ts (42/42) + contract guard
    // + e2e visual now drive Stryker kills on loader/cache/error/mapper branches. Matches exact pattern
    // from public-profile-isr predecessor + proxy gap-6 stryker wiring. Source: #9407 rotation.
    'app/[[]username[]]/_lib/public-profile-loader.ts',
    'app/[[]username[]]/_lib/profile-mapper.ts',
    'app/[[]username[]]/_lib/profile-static-params.ts',
    'app/[[]username[]]/_lib/public-profile-qa.ts',
    'app/[[]username[]]/page.tsx',
    'app/[[]username[]]/layout.tsx',
    'app/[[]username[]]/opengraph-image.tsx',
    // Social-link dedupe + handle parser. Mutating these surfaces the
    // assertions in tests/unit/lib/social-platform.property.test.ts;
    // a passing-but-mutation-survives suite means duplicate rows or
    // "YouTube YouTube" labels could ship again (JOV-2149).
    'lib/utils/social-platform.ts',
    // Cookie consent banner (high-risk privacy/trust surface on marketing/public/onboarding paths;
    // floating bottom-right card redesign + full mutation coverage). Per plan: one high-risk
    // surface per quarter. Exercises geo mount, visibility, actions (compact + full), height
    // observer for toasts/profiles, error paths, Customize modal, persistence.
    'components/organisms/CookieBannerSection.tsx',
    'components/organisms/CookieBannerMount.tsx',
    'components/molecules/CookieActions.tsx',
    'lib/hooks/useCookieBannerHeight.ts',
    'lib/cookies/consent-regions.ts',
    // Standard exclusions
    '!**/*.test.ts',
    '!**/*.test.tsx',
    '!**/*.d.ts',
  ],
  testFiles: [
    'constants/platforms/utils.fuzz.test.ts',
    'lib/cron/auth.test.ts',
    'lib/stripe/connect-readiness.test.ts',
    'tests/unit/actions/onboarding/**/*.test.ts',
    'tests/unit/lib/entitlements.server.test.ts',
    // Expanded wiring for entitlements-registry surface (blast 5, target 95%).
    // Includes registry consistency + boundary helpers (for resolve/guard mutants)
    // and state transitions (plan changes, trial paths) so Stryker can kill more
    // survivors in registry.ts + server.ts + creator-plan.ts.
    'tests/unit/lib/entitlement-registry.test.ts',
    'tests/unit/lib/entitlement-boundary-helpers.test.ts',
    'tests/unit/lib/entitlements-state-transitions.test.ts',
    // New exhaustive matrix contract test (entitlements-matrix.test.ts) for
    // the full 4×27 boolean + 6 limits plan matrix + all legacy alias branches
    // + additional server resolver catch coverage. Wires Stryker mutation
    // killing for entitlements-registry RED surface (risk 37.7, 20.8pp gap).
    'tests/unit/lib/entitlements-matrix.test.ts',
    // Billing unavailable error class contract (deprecated compat ctor for
    // billing edge + fail-closed shape). Covers the remaining uncovered lines
    // in server.ts (BillingUnavailableError) for 100% on the registry surface
    // after prior wiring PRs. Contract style per webhook/rls/claim patterns.
    // Dedicated test placed under tests/unit/lib/entitlements/ per task.
    'tests/unit/lib/entitlements/billing-unavailable.contract.test.ts',
    'tests/unit/lib/queries/useBillingMutations.test.tsx',
    'tests/unit/lib/social-platform.property.test.ts',
    // Gate + waitlist negative-path tests for lib/auth/gate.ts mutate target
    'tests/unit/lib/auth/gate.test.ts',
    'tests/unit/lib/auth/gate.critical.test.ts',
    'tests/unit/auth/waitlist-gating.test.ts',
    // Dev test-auth bypass contract + server tests (bypass scenarios, prod fail-closed,
    // persona guards, trusted host override, json catch, redirect/enter paths, outer catches).
    // Wires mutation for the RED 35.7 surface (dev-test-auth-bypass) + test-mode.ts.
    'tests/unit/api/dev/test-auth-routes.test.ts',
    'tests/unit/lib/auth/dev-test-auth.server.test.ts',
    'tests/unit/lib/auth/test-mode.test.ts',
    // Investor portal dedup + proxy behavioral contracts for lib/auth/investor-portal.ts
    // + proxy.ts investor/audience paths (legacy 301 early returns for _next + ?t=,
    // token flows, view idempotency, guard call sites, durable coordination).
    // Highest risk proxy surface closure + mutation evidence.
    'lib/auth/investor-view-dedup.test.ts',
    'tests/unit/middleware/proxy-behavioral.test.ts',
    // RLS access control (rls-access-control row, risk 42.1 RED, mutation gap closure):
    // Wires the new contract tests for RLS failure modes (unauthorized tenant access via
    // session errors, auth bypass test paths, 401/403/404 responses, outer catch in
    // dashboard guard, withDbSessionTx failure, getSessionContext tenant resolution).
    // Also includes db usage guard and require-auth bypass/401 contracts.
    // Combined with existing rls-access-control.test.ts (DB policy enforcement) and
    // session.critical.test.ts for comprehensive mutation evidence on the surface.
    'tests/unit/lib/auth/session.critical.test.ts',
    'tests/unit/lib/db-session-guard.test.ts',
    'tests/unit/lib/api/with-dashboard-route.test.ts',
    'tests/unit/lib/auth/require-auth.test.ts',
    // Claim + onboarding claim flow tests (exercises claim token routes, username claim matrix/redirects,
    // context cookie crypto+parse errors, intake gates/rate/email, onboarding chat claim hook; note:
    // api/onboarding/claim/route.ts wired for mutation, dedicated route test added to cover CAS/409/error paths)
    'tests/unit/app/claim-token-route.test.ts',
    'tests/unit/app/[[]username[]]/claim/route.test.ts',
    'tests/unit/lib/claim/context.test.ts',
    'tests/unit/api/onboarding/intake.test.ts',
    'tests/unit/api/onboarding/claim.test.ts',
    'tests/components/features/onboarding/useOnboardingClaim.test.tsx',
    // Cookie banner unit + regions (exercises the new floating card surface + geo decision branches)
    'tests/unit/cookie-banner.test.tsx',
    'tests/unit/cookie-banner-fixes.test.tsx',
    'tests/unit/lib/cookies/consent-regions.test.ts',
    // Claim-onboarding surface wiring (routes + dedicated tests for intake/claim races + token handler).
    // Includes the new claim.test.ts (property + CAS/race/409 paths) and strengthened intake/claim-token tests.
    // v2: expanded claim.test.ts with additional fast-check properties exercising 409
    // error message variants and recency ties for improved Stryker kill rate.
    'tests/unit/app/claim-token-route.test.ts',
    'tests/unit/api/onboarding/intake.test.ts',
    'tests/unit/api/onboarding/claim.test.ts',
    // Public profile ISR surface (public-profile-isr YELLOW per TEST_RISK_REGISTER + heatmap, risk 27.9).
    // Wires the existing public-profile-page.test.ts (exercises loader cache bypass, error/not_found/ok
    // shapes, venmo injection, mapper, static params safety, generateMetadata fallbacks, claim banner
    // delegation, accent non-derivation in public ISR path, mode subtitle registry). Provides mutation
    // evidence for the surface (previously no mut score despite 83.6% line cov). Target 75% already met
    // on line; this closes the assertion-strength gap for high-visibility public profile rendering.
    // Wired in gap-7 (after #9407 proxy) per drain rotation. E2E visual regression covers light/dark/mobile.
    'tests/unit/profile/public-profile-page.test.ts',
    // Stripe webhooks surface (high blast_radius 5 / reversibility 5 per TEST_RISK_REGISTER + AGENTS.md).
    // Wires the dedicated contract tests (sig verification, idempotency via durable DB unique constraint (CAS),
    // delegation, error/negative paths, method guard, retry, outer catch, config guard for missing secret).
    // Achieves 100% line coverage on route.ts + exercises CAS/retry/409-style/idempotency/outer paths for mutation kills.
    // Closes the mutation warning + lifts effective coverage on money/trust surface (RED Priority Queue #5, risk 37.8, target 90%).
    'tests/unit/api/stripe/webhooks*.test.ts',
    // Webhook signatures verification surface (YELLOW 29.2, PQ #1 largest gap 33.5pp per heatmap/register).
    // Wires sms.test.ts (new contract tests for Twilio sig missing/invalid ->401 exact 'Unauthorized',
    // malformed 400, dup idempotent 200, unprocessed replay, 5xx fail-closed without mark, outer-catch 500)
    // + all other /webhooks/* tests (linear/resend/sentry/stripe-*) for sig/replay/dedupe paths.
    // Enables Stryker mutation kills on the critical verification + durable dedupe branches.
    'tests/unit/api/webhooks/**/*.test.ts',
  ],
  ignorePatterns: [
    '.next',
    'coverage',
    'node_modules',
    'playwright-report',
    'test-results',
  ],
  vitest: {
    configFile: 'vitest.config.fast.mts',
  },
  incremental: true,
  incrementalFile: 'reports/stryker-incremental.json',
  thresholds: {
    high: 80,
    low: 60,
    // Telemetry-only until baseline hotspot scores are established.
    // The workflow still preserves Stryker setup failures.
    break: 0,
  },
  concurrency: process.env.CI ? 2 : undefined,
  timeoutMS: 15000,
  dryRunTimeoutMinutes: 10,
};
