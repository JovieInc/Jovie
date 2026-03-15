# Launch Readiness Issues — YC-Style Priority

**Date:** March 14, 2026
**Source:** Launch Readiness Audit v26.2.0
**Philosophy:** Ship fast, fix what matters, don't gold-plate. P0 = blocks launch or loses money. P1 = fix week 1. P2 = fix when convenient.

---

## P0 — LAUNCH BLOCKERS (Fix before launch day)

_None. All prior P0 items from Feb 22 audit have been remediated._

---

## P1 — FIX WEEK 1 (Ship first, fix immediately after)

### Issue 1: Add Sentry capture to feedback API route

**Labels:** `bug`, `observability`
**Priority:** P1

The `/api/feedback/route.ts` catch block only uses `logger.error()` without Sentry capture. This is the last API route without error observability — if feedback submissions silently fail, you lose direct user signal.

**File:** `apps/web/app/api/feedback/route.ts`
**Fix:** Add `captureError()` to the catch block, matching the pattern used in all other API routes.
**Effort:** 15 minutes

---

### Issue 2: Add Zod validation to profile update and tip creation endpoints

**Labels:** `security`, `enhancement`
**Priority:** P1

Profile updates accept a flexible object filtered by `allowedFields` but lack strict Zod schema validation for field-level constraints. Tip creation reads `amount` and `handle` directly from JSON without range validation. While Stripe provides secondary validation, defense-in-depth is needed.

**Files:**
- `apps/web/app/api/dashboard/profile/route.ts` — add Zod schema for `displayName` (max 50), `bio` (max 512), `creatorType` (enum), URLs (`z.string().url()`)
- Tip intent endpoint — add Zod schema for `amount` (integer, 1-500 USD), `handle` (username pattern)

**Effort:** 1-2 hours

---

### Issue 3: Write interaction tests for 6 high-regression UI components

**Labels:** `test`, `enhancement`
**Priority:** P1

Six interactive UI components that repeatedly cause production regressions have zero unit test coverage: CreatorActionsMenu, TableActionMenu, RightDrawer, SidebarLinkRow, DrawerHeader, DrawerNav. Tests should use the `*.interaction.test.tsx` naming convention (per testing audit plan).

**Components:**
1. `CreatorActionsMenu` — dropdown actions, copy-to-clipboard, conditional rendering (~8 tests)
2. `SidebarLinkRow` — clipboard, open URL, remove with loading state (~8 tests)
3. `RightDrawer` — responsive render, keyboard handler, aria-hidden (~7 tests)
4. `DrawerHeader` — close button, mobile/desktop icon switching (~4 tests)
5. `TableActionMenu` — trigger variants, action items, separators (~6 tests)
6. `DrawerNav` — tab switching, aria-selected, onValueChange (~4 tests)

**Reference:** `audits/testing-audit-2026-02-16.md` sections 3.1–3.6 for full test specifications
**Effort:** ~16 hours across first 2 sprints

---

### Issue 4: Update CI to run interaction tests on every PR

**Labels:** `ci`, `enhancement`
**Priority:** P1

Currently only 7 `*.critical.test.ts` files run on PRs. UI component tests don't run unless the test file itself is modified in the PR. Change the vitest pattern from `"critical"` to `"critical|interaction"` so new interaction tests run on every PR.

**File:** `.github/workflows/ci.yml` — lines 780, 784, 801
**Impact:** +5-8 seconds per PR (10-15 focused tests at ~0.5s each)
**Effort:** 30 minutes

---

## P2 — FIX WITHIN FIRST MONTH (Quality & hardening)

### Issue 5: Move hardcoded route paths to APP_ROUTES constants

**Labels:** `refactor`, `code-quality`
**Priority:** P2

Several components use hardcoded route strings instead of the centralized `APP_ROUTES` constants. This creates drift risk when routes change.

**Files:**
- `SignUpForm.tsx` — hardcoded legal paths
- `CookieModal.tsx` — hardcoded legal paths
- `ProfileNavButton.tsx` — hardcoded paths
- `DashboardRemoveBrandingCard.tsx` — hardcoded billing path
- `launch/page.tsx` — hardcoded paths

**Fix:** Add `LEGAL_TERMS`, `LEGAL_PRIVACY`, `LEGAL_COOKIES`, `BILLING_REMOVE_BRANDING` to `APP_ROUTES` and update references.
**Effort:** 1 hour

---

### Issue 6: Replace direct process.env access with validated env module

**Labels:** `refactor`, `code-quality`
**Priority:** P2

~10 files access `process.env` directly instead of using the Zod-validated `env` from `@/lib/env-server`. This bypasses runtime validation and type safety.

**Affected areas:** Marketing pages, cron helpers, capture-tip utility
**Fix:** Replace `process.env.X` with `env.X` from `@/lib/env-server` or `@/lib/env-client`.
**Effort:** 1 hour

---

### Issue 7: Add bundle size analysis to CI pipeline

**Labels:** `ci`, `performance`
**Priority:** P2

No automated bundle size tracking in CI. The Sentry bundle analysis script exists (`scripts/analyze-sentry-bundle.sh`) but doesn't run automatically. Add `@next/bundle-analyzer` or equivalent to track bundle regressions on PRs.

**Effort:** 1-2 hours

---

### Issue 8: Add canonical URLs to paginated and filtered views

**Labels:** `seo`, `enhancement`
**Priority:** P2

Paginated and filtered views (audience list, admin tables, contacts) may create duplicate content signals for search engines. Add `<link rel="canonical">` pointing to the base URL without pagination/filter params.

**Effort:** 30 minutes

---

### Issue 9: Update SECURITY.md supported version

**Labels:** `docs`
**Priority:** P2

SECURITY.md references version `0.1.x` as supported. Update to reflect the current `26.x` release line.

**File:** `SECURITY.md`
**Effort:** 5 minutes

---

### Issue 10: Document incident response and disaster recovery procedures

**Labels:** `docs`, `security`
**Priority:** P2

No formal incident response runbook, disaster recovery playbook, or database restore procedures documented. For a YC launch, these should exist before scaling.

**Create:**
- `docs/security/INCIDENT_RESPONSE.md` — escalation paths, communication templates, rollback procedures
- `docs/operations/DISASTER_RECOVERY.md` — database restore from Neon snapshots, secret rotation, Vercel rollback steps
**Effort:** 2-3 hours

---

### Issue 11: Document API key rotation procedures

**Labels:** `docs`, `security`
**Priority:** P2

No documentation for rotating secrets (Clerk, Stripe, Spotify, encryption keys). Create a rotation runbook covering each integration's key rotation process and any downtime implications.

**Effort:** 1-2 hours

---

### Issue 12: Strengthen LinkActions test coverage and eliminate ConfirmDialog false positive

**Labels:** `test`, `enhancement`
**Priority:** P2

The existing `LinkActions.keyboard.test.tsx` over-mocks `ConfirmDialog`, creating a false positive risk. Add 6 new test cases to the existing file and write `LinkActions.negative.interaction.test.tsx` using the real `ConfirmDialog`.

**Reference:** `audits/testing-audit-2026-02-16.md` sections 3.7, 4.2
**Effort:** 2.5 hours

---

## P3 — NICE TO HAVE (Backlog)

### Issue 13: Add prefers-reduced-motion support

**Labels:** `accessibility`, `enhancement`
**Priority:** P3

Consider adding `prefers-reduced-motion` media query handling for animations (Framer Motion transitions, loading spinners). Not a WCAG requirement at AA level but improves experience for vestibular disorder users.

**Effort:** 2-3 hours

---

### Issue 14: Consider IaC for Vercel configuration

**Labels:** `infrastructure`, `enhancement`
**Priority:** P3

Vercel configuration is entirely managed via dashboard (no `vercel.json`). For reproducibility and audit trail, consider migrating key settings to a `vercel.json` file or Terraform configuration.

**Effort:** 2-4 hours

---

### Issue 15: Expand synthetic monitoring to cover more user journeys

**Labels:** `monitoring`, `enhancement`
**Priority:** P3

Current synthetic monitoring runs the golden path test every 15 minutes during business hours. Consider expanding to cover: signup → onboarding, billing flow, profile edit → save, and link click tracking.

**Effort:** 4-6 hours

---

### Issue 16: Apple Music search lacks retry logic

**Labels:** `bug`, `enhancement`
**Priority:** P3

The Spotify search endpoint has full retry with exponential backoff, but Apple Music search (`/api/apple-music/search/route.ts`) has no retry logic. A transient Apple API failure returns a hard error to users.

**Fix:** Add retry logic matching the Spotify pattern.
**Effort:** 30 minutes

---

## Summary

| Priority | Count | Total Effort | Theme |
|----------|-------|-------------|-------|
| **P0** | 0 | — | All prior blockers fixed |
| **P1** | 4 | ~18 hours | Observability, security validation, test coverage, CI |
| **P2** | 8 | ~10 hours | Code quality, docs, SEO, bundle analysis |
| **P3** | 4 | ~10 hours | A11y, infra, monitoring, resilience |
| **Total** | **16** | **~38 hours** | |

### Recommended Execution Order (YC Launch)

**Launch Day:** Ship it. Zero P0 blockers.

**Week 1 (P1):**
1. Issue 1 — Sentry on feedback route (15 min, quick win)
2. Issue 4 — CI interaction test pattern (30 min, unblocks Issue 3)
3. Issue 2 — Zod validation on profile/tip (1-2 hrs, security hardening)
4. Issue 3 — Start writing interaction tests (ongoing through week 2)

**Week 2-3 (P2):**
5. Issue 9 — SECURITY.md version (5 min)
6. Issue 5 — Hardcoded routes (1 hr)
7. Issue 6 — process.env cleanup (1 hr)
8. Issue 8 — Canonical URLs (30 min)
9. Issue 10 — Incident response docs (2-3 hrs)
10. Issue 11 — Key rotation docs (1-2 hrs)
11. Issue 7 — Bundle analysis CI (1-2 hrs)
12. Issue 12 — LinkActions test strengthening (2.5 hrs)

**Month 2+ (P3):**
13-16. Backlog items as capacity allows
