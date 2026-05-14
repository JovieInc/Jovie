# Proxy Extraction Candidates

> **Question this answers:** "What lives in `apps/web/proxy.ts` (1,412 lines) that should move to dedicated modules, and in what order?"

The risk-based testing audit surfaced `apps/web/proxy.ts` as the highest-concentration risk surface in the codebase: four distinct domains (auth proxy, investor portal, audience block, public profile routing) all share a single file. Coverage measurement is file-scoped, so the heatmap can only report `proxy.ts` as one cell — masking which slice is actually undercovered.

Extracting by domain boundary unlocks:

- Per-module coverage targets in the heatmap (instead of one number for all four concerns)
- Mutation testing scoped to security-critical regions
- Easier review (smaller diffs, narrower blast radius)
- Lower cognitive load for agents touching a single concern

This doc is the **plan**, not the execution. Code extractions ship in dedicated PRs per the rules in [`AGENTS.md` → "Files To Treat Carefully"](../AGENTS.md). Files under `proxy.ts` and route guards require explicit review.

## Current Structure (line ranges)

| Domain | Lines | Top-level symbols |
|--------|-------|-------------------|
| Imports + constants | 1–88 | Cookie / domain / route constants, bot regex |
| Audience block + fingerprint | 89–246 | `maskIpForFingerprint`, `createFingerprintEdge`, `extractPublicProfileUsername`, `checkProfileVisitorBlocked` |
| Investor portal | 248–453 | `handleInvestorRequest`, `validateInvestorToken`, `recordInvestorView` |
| Clerk + nonce helpers | 454–489 | `isMockOrMissingClerkConfig`, `generateNonce`, CSP sensitive-pattern list |
| Main request router | 490–856 | `handleRequest` (the longest function) |
| Geo + final response | 857–1041 | `getGeoFromRequest`, `buildFinalResponse` |
| Clerk middleware factories | 1042–1090 | `getClerkStagingMiddleware`, `clerkProductionMiddleware` |
| `middleware` entrypoint + matcher config | 1091–1402 | Default export + Next.js `config` |

## Extraction Order (Risk-Driven)

Ordered by the heatmap's `risk_score × extraction_clarity`. Land in separate PRs, each ≤400 LOC of diff per `.claude/rules/release.md`.

### 1. Investor portal middleware → `apps/web/lib/middleware/investor-portal.ts`

- **Surface:** `proxy-investor-portal` (heatmap risk 36.4, target 90%)
- **Lines to extract:** 248–453 (handleInvestorRequest, validateInvestorToken, recordInvestorView)
- **Why first:** Self-contained (no Clerk dependency, own cookie namespace, own DB query). Highest blast radius for an isolated extraction.
- **Test additions in same PR:** `apps/web/tests/integration/investor-portal-token.test.ts` (per the strategy doc's top-10 list).
- **Side benefit:** Lets the heatmap report investor-portal coverage independently from the rest of proxy.ts.

### 2. Audience block + fingerprint → `apps/web/lib/middleware/audience-block.ts`

- **Surface:** `proxy-audience-block` (heatmap risk 27.4, target 85%)
- **Lines to extract:** 87–246 (maskIpForFingerprint, createFingerprintEdge, extractPublicProfileUsername, checkProfileVisitorBlocked)
- **Why second:** Touches DB schema (`audienceBlocks`, `creatorProfiles`) but no auth state. Naturally isolated.
- **Test additions in same PR:** `apps/web/tests/integration/audience-block.test.ts`.
- **Note:** `maskIpForFingerprint` should ideally consolidate with `maskIpAddress` in `app/api/audience/lib/audience-utils.ts` — flag in PR description.

### 3. Bot detection + reserved-segments → `apps/web/lib/middleware/bot-and-segments.ts`

- **Surface:** Not currently a register row — low blast radius, but worth extracting for cleanliness.
- **Lines to extract:** 69–86, 134–175 (META_BOT_REGEX, detectMetaBot, isWaitlistInviteRedirect, MIDDLEWARE_SYSTEM_SEGMENTS).
- **Why third:** Pure functions, easy to test, no dependencies.

### 4. Geo / final-response helpers → `apps/web/lib/middleware/response-builder.ts`

- **Surface:** Not register-tracked, but `buildFinalResponse` orchestrates CSP nonce + reporting headers + geo cookies. High coordination cost.
- **Lines to extract:** 857–1041 (getGeoFromRequest, buildFinalResponse).
- **Why fourth:** Order it after the simpler extractions so the call sites in `handleRequest` shrink before touching this one.

### 5. Clerk routing core (the hard one)

- **Surface:** `proxy-clerk-routing` (heatmap risk 40.4, target 85%) — touches every authenticated request.
- **Lines to extract:** 1042–1090 (the two Clerk middleware factories) plus the request-routing logic from `handleRequest` (490–856) once #1–4 have shrunk it.
- **Why last:** Highest blast radius. Wait until tests for the other regions are in place so the diff is reviewable.
- **Test additions in same PR:** `apps/web/tests/integration/clerk-proxy-routing.test.ts` (per the strategy doc).
- **Risk note:** Per `.claude/rules/auth.md`, this is the proxy that decodes FAPI hosts from publishable keys. Any reshuffle here must include integration tests that cover all three Clerk environments (dev/stg/prd).

## Anti-Patterns to Avoid

- **Don't extract into `apps/web/middleware/`.** That directory is reserved for Next.js's middleware entrypoint; per `file-protection-check.sh`, creating new files there is blocked. The destination is `apps/web/lib/middleware/` (lowercase, plural-domain).
- **Don't extract without a test.** Each extraction PR must include the integration test for the extracted module from the strategy's top-10 list, or the heatmap will show the surface dropping from "1 file at 68%" to "1 file at 0%" because the new file inherits zero existing coverage.
- **Don't combine extractions.** One module per PR. Per release rules, max 10 files / 400 LOC of diff.
- **Don't introduce abstractions.** Extract verbatim; refactor in a subsequent PR if needed.

## Heatmap Implications

When extraction lands, update [`docs/TEST_RISK_REGISTER.md`](TEST_RISK_REGISTER.md):

- The `proxy-investor-portal` row's `glob` changes from `apps/web/proxy.ts` to `apps/web/lib/middleware/investor-portal.ts`
- Same for `proxy-audience-block`
- The `proxy-clerk-routing` row keeps `apps/web/proxy.ts` but its `key_ranges` narrow as code moves out

The generator's stale-row detector flags any row whose glob matches zero files — so a forgotten register update will surface in the next nightly heatmap.

## Related

- [`TEST_RISK_REGISTER.md`](TEST_RISK_REGISTER.md) — surface taxonomy
- [`TEST_COVERAGE_HEATMAP.md`](TEST_COVERAGE_HEATMAP.md) — current coverage state
- [`.claude/rules/auth.md`](../.claude/rules/auth.md) — Clerk proxy invariants
- [`.claude/rules/security.md`](../.claude/rules/security.md) — middleware creation guardrails
