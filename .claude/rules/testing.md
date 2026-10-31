---
paths: ["**/*.test.*", "**/*.spec.*", "**/tests/**", "**/vitest.config.*", "**/playwright.config.*"]
---

# Testing

E2E patterns, test performance, coverage philosophy, verify-before-done.

## Risk-Based Testing (Source of Truth)

Before adding a new test, check the heatmap to see which surface needs it most:

- [`docs/TEST_COVERAGE_HEATMAP.md`](../../docs/TEST_COVERAGE_HEATMAP.md) — auto-generated dashboard. The **Priority Queue** at the top names the surface with the biggest risk × coverage_gap and the exact file:line range to target.
- [`docs/TEST_RISK_REGISTER.md`](../../docs/TEST_RISK_REGISTER.md) — hand-curated risk taxonomy (blast radius, reversibility, target coverage per surface).
- `pnpm run test:coverage:report` — regenerate the heatmap locally from current v8 coverage.
- `pnpm run test:coverage:diff` — check whether your PR drops any RED surface ≥3pp.

**When to add a test (decision rule):** add a test if (a) the file matches a critical glob in the register, OR (b) the change introduces a new branch / new API route / new server action / new entitlement, OR (c) the change is a bugfix (regression test mandatory). Otherwise no test required — but say so explicitly in the PR description.

**Enforcement:** `.github/pull_request_template.md`, `pnpm test:bug-to-test` (local + `/ship` Step 3.35), and Danger on PRs (`apps/web/dangerfile.ts`).

## Stack

- Unit tests: Vitest with jsdom
- E2E tests: Playwright
- Focus on user behavior, not implementation details

Adversarial and product QA belong in Vitest, Playwright, and gated CI — not in GStack prompt checklists. Husky `.husky/pre-commit` is the JOV-3210 ladder (conflict markers, secrets, proxy, lint). Do not add Vitest or Playwright suites to pre-commit.

## New Test File Convention

Co-locate with source: `{name}.test.ts` or `{name}.test.tsx` (not `__tests__/` directories unless shared fixtures are needed).

```typescript
import { describe, expect, it, vi } from 'vitest';
```

Name tests by behavior: `describe('ComponentName')` → `it('shows error when input is empty')`.

## E2E Authentication with Better Auth

See `.claude/rules/auth.md` → "E2E Authentication" for the canonical helpers, do-not patterns, and golden-path references. Use `E2E_USE_TEST_AUTH_BYPASS=1` and `/api/dev/test-auth/enter`. Do not import `@clerk/testing` or create Clerk test users.

## Production Certification Identity Path (JOV-9625)

The post-promotion golden-path certification (`.github/workflows/postdeploy-probes.yml` → `scripts/prod-cert.mjs` → `apps/web/tests/e2e/prod-cert-start-chat.spec.ts` + `smoke-prod-auth.spec.ts`) runs against the real https://jov.ie production deployment. It never creates credentials; it acts only as the documented canary identities below, all classified internal by `isInternalOrTestAccountEmail` so nothing reaches customer metrics. The single source of truth for the addresses is `apps/web/lib/synthetic/prodcert-identities.ts`.

- **Returning canary (creator-ready)**: `browse-ready+clerk_test@jov.ie` — `E2E_PROD_USER_EMAIL` from Doppler `jovie-web/prd`. The run never stores a password; it requests a fresh Better Auth email code on the rendered sign-in form and reads the one-time code from the `ba_verifications` table via `waitForProductionAuthOtp` (`apps/web/tests/e2e/utils/production-auth-otp.ts`). Owns the claimed profile used by the `claimed-profile-owned`, `public-profile` and `profile-edit-save-readback` steps.
- **Fresh-user canary (new-user)**: `browse-ready+synthetic-prodcert-<run>@jov.ie`, minted per run by `newProdcertUserEmail`. Signs up through the rendered email-code flow with an OTP read from `ba_verifications` the same way. Used by the `new-user-email-otp` and `fresh-user-onboarding-first-value` steps.
- **Anonymous first touch (claim/start)**: no account at all. The `/start` visit carries a short-lived, single-use canary passage token (`PASSAGE_TOKEN_HEADER`) minted in CI from `SYNTHETIC_PASSAGE_KEY` — an HKDF derivative of `CRON_SECRET` produced by `scripts/synthetic-passage-key.mjs`; the spec never sees `CRON_SECRET` itself. The server verifies the token in Cloudflare Turnstile test mode for that visit only.
- **Admin certifications readback**: `/app/admin/certifications` and `GET /api/ovie/certifications` are admin-gated (`authorizeSummerControl`). The signed-in readback fixture is the documented admin test account `browse-admin+clerk_test@jov.ie` (the `admin` persona of `DEFAULT_DEV_TEST_AUTH_EMAILS`), signed in through the same rendered email-code path with the OTP read from `ba_verifications`. Never create new accounts or rotate anything for the readback.

**Weekly AI quota at release gates (JOV-9625 outcome rework):** the dedicated chat-health canary (`browse-ready+chat-health@jov.ie`, #23703) is the one identity whose weekly AI quota the server skips (burst limiter still enforced) — the returning golden-path canary stays metered. The browser chat-turn certification signs in as that chat-health canary in its own serial spec test, so an exhausted weekly counter can never block a promotion run's chat certification, and the exact-build perf lane's authenticated setup (`--grep "sign-in works and dashboard loads"`) never performs a chat turn at all.

Fixture-artist selection for the claim surface is read-only and idempotent per run (`selectUnclaimedCertArtist`, JOV-9928): each run picks the first `SHARED_E2E_ARTIST_POOL` candidate with no bound `creator_profiles` row and blocks the claim steps with the exact reason when none is free. The `confirm_artist:` assertion is never weakened to accommodate stale fixture state.

## Keep Tests Aligned With Removed UI And Hook Contracts

- When removing UI behavior, find and remove or rewrite its obsolete assertions
  and mocks in the same change. Preserve coverage for behavior that still exists.
- Custom-hook mocks must satisfy the complete hook return type. Include every
  required field, especially arrays such as `modeLinks` and `socialLinks` (use
  `[]` when empty); use `satisfies ReturnType<typeof hook>` where available.
- Zero executed tests are not a pass receipt. For executable changes run the
  relevant repository/CI selector and record actual counts and coverage, even
  when a changed-test command exits successfully with no matching files.

## Next Cache APIs In Shared Test Helpers

- Helpers used by Playwright global setup, `tsx` seed scripts, or any plain Node entrypoint must not call `revalidateTag()` or `revalidatePath()` unguarded.
- Those Next cache APIs require a Next request/static-generation context and will throw `Invariant: static generation store missing` in plain Node.
- If cache invalidation is best-effort in a shared helper, catch only that specific missing-context invariant and continue; rethrow all other errors.

## General E2E Rules (Required)

- Every E2E test must include meaningful assertions on behavior/outcomes (not just render/no-crash checks).
- Music fetch must remain real in integration/E2E coverage: if slow, increase timeout; do not mock the enrichment fetch.
- Stripe flows must run in Stripe test mode and use test card `4242 4242 4242 4242`.
- Do not assert on CSS values, spacing/padding, or brittle copy text.
- Prefer stable `data-testid` selectors over fragile structural selectors.

## Test Performance (CI Runtime Is a First-Class Constraint)

Tests are part of the deploy path. Slow tests slow shipping. Test runtime performance is a functional requirement of the testing system itself.

**Core Rule:** Any test that materially slows CI without proportional risk reduction is considered harmful, even if it is "correct."

### Why This Matters (Pre-PMF Context)

- We're pre product-market fit — iteration speed is critical.
- Gated CI tests must run fast enough to support 2–3 deploys per day.
- Test runtime must not grow unbounded over time.
- Added tests must justify their runtime cost with real risk coverage.

### Gated CI (Deploy-Blocking)

| Allowed | Not Allowed |
|---------|-------------|
| Fast, deterministic tests | Long-running E2E |
| Focused unit/integration tests | Exhaustive fuzzing |
| Minimal fixture setup | Large fixture setup |
| Mocked external calls | Real network, sleep, or polling loops |

### Nightly / Async Jobs

- May be slow and exhaustive.
- May trade speed for coverage.
- Must never block deploys.

### Agent Rules

| Do | Don't |
|----|-------|
| Prefer fewer, stronger assertions over more tests | Add slow tests to gated CI by default |
| Collapse redundant tests | Increase CI runtime without explaining why |
| Move slow or high-cardinality tests to nightly | Justify slow tests with "better coverage" alone |
| Call out expected runtime impact in PRs when adding tests | |

### Signs of a Broken Test Suite

- CI time increases noticeably without corresponding risk reduction.
- Engineers avoid deploys due to slow feedback.
- Tests are skipped locally to save time.

**Default Bias:** When there's a tradeoff between test thoroughness and iteration speed in gated CI, bias toward speed and move thoroughness to nightly runs.

## Test Coverage Guidelines (When to Write Tests)

Tests must be written **at feature creation time**, not retroactively. Apply coverage selectively — don't slow iteration speed.

### Tests REQUIRED for

- Core logic and data processing (parsers, transformers, validators)
- API routes and server actions (contract with frontend)
- Gating systems (waitlist, auth, permissions, entitlements)
- Deterministic workflows (intent router, feedback submission, CRUD operations)
- Backend services and data pipelines (ingestion, enrichment, jobs)
- Database queries and mutations (especially complex joins/filters)

### Tests may be SKIPPED for

- Rapidly changing UI components (layout, styling, copy changes)
- Prototype/experimental features still in flux
- Pure presentation components with no logic
- Marketing page content and static pages

### Coverage philosophy

- No strict coverage % targets — quality over quantity.
- Deterministic workflows must have 100% path coverage.
- AI-dependent workflows should use mocked LLM responses for determinism.
- Focus testing where correctness and reliability are critical.

| Area | Tests Required? | Why |
|------|----------------|-----|
| Intent router patterns | Yes | Deterministic, must be reliable |
| Waitlist/auth gating | Yes | Security-critical gating |
| API route handlers | Yes | Contract with frontend |
| Server actions (CRUD) | Yes | Data integrity |
| Ingestion/enrichment pipelines | Yes | Data correctness |
| Dashboard layout | No | Changes frequently, visual |
| Homepage copy | No | Marketing, iterates fast |
| Feedback submission flow | Yes | Deterministic workflow |

## Verify Before Marking Done

Never mark a task complete without confirming the fix works:

- Run the relevant test file: `pnpm --filter web exec vitest run <test-file>`
- Run typecheck: `pnpm --filter @jovie/web run typecheck -- --pretty false`
- For UI changes: confirm the component renders without errors
- For API changes: confirm the endpoint returns expected shape
- Paste the passing output as evidence in the PR description

## Reference

- Full E2E details: `apps/web/tests/TESTING.md`
- Testing philosophy: `docs/TESTING_GUIDELINES.md`

## PR size counts production code

PR Size Guard caps changed lines and files in production code only. Tests and
fixtures (`*.test.*`, `*.spec.*`, `__tests__/`, `fixtures/`, `test_*.py`,
`*_test.py`, `*Tests.swift`) do not count, along with generated, lock and
snapshot files. The coverage floors require tests, so the size cap must not
penalise them (#23956 went over 1500 lines only because of required coverage
tests). The one list is `scripts/lib/pr-size-exclusions.mjs`, and the workflows
run it from the base tip. Repository-hygiene byte and path budgets still apply
to every file. Do not split production code into fixture paths to dodge the cap.

## Gate weakening (JOV-INV-045)

Do not land `test.skip`, `it.skip`, `describe.skip`, `.only`, or `xit` to get a
change through CI. The gate-weakening detector fails that pull request. Deleting
or emptying a `scripts/invariants/*.test.*` file fails the same check.

## Fleet premise rule

When the same check fails twice in a row on a PR, state the assumption behind
the proposed repair and run one test that could falsify it **before patching**.
Read both failures, including reruns at the same head. Record `Assumption:`,
`Falsifying test:` (exact command), and `Result:` (observed output and implication)
in the PR body under `## Premise check`. Repeating the failing check without
testing the assumption is not a falsifying test. This applies to lane-fix-relay,
safe-pr-remediation, and remediation-sweep handoffs as well as direct agents.
