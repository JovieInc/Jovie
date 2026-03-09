# JOV-1404 Test Coverage Audit Report

## Scope and audit method

- Audited all test files matching `*.test.*` and `*.spec.*` across the monorepo (excluding configs/templates/snapshots and `node_modules`).
- Total files audited: **691**.
- Automated pass classified each file by assertion density, interaction coverage, and mock density.
- Manual pass reviewed every file flagged as potential theater/rewrite to avoid false positives.

## Summary

- **Total test files audited:** 691
- **Genuine tests:** 676
- **Theater tests:** 3
- **Recommended for deletion:** 3 (deleted in this PR)
- **Recommended for rewrite:** 12

## Theater tests deleted

1. `apps/web/tests/audit/auth-screens-ux-audit.spec.ts`
   - Generated an audit artifact and screenshots, but had no pass/fail assertions.
2. `apps/web/tests/e2e/accessibility-audit.spec.ts`
   - Logged contrast findings but did not assert or fail on violations.
3. `apps/web/tests/e2e/a11y-full-scan.spec.ts`
   - Ran Axe scans and printed output only; no assertions to enforce behavior.

## Worst offenders (rewrite recommended)

1. `apps/web/tests/unit/app/onboarding/actions/avatar.test.ts`
2. `apps/web/tests/unit/WaitlistPage.test.tsx`
3. `apps/web/tests/unit/profile/ProfilePrimaryCTA.test.tsx`
4. `apps/web/tests/unit/profile/ProfilePrimaryCTA.loading.test.tsx`
5. `apps/web/tests/unit/components/AuthShellWrapper.test.tsx`
6. `apps/web/tests/unit/api/track/route.test.ts`
7. `apps/web/tests/unit/api/health/db-performance.critical.test.ts`
8. `apps/web/tests/unit/api/health/env.critical.test.ts`
9. `apps/web/tests/unit/api/health/db.critical.test.ts`
10. `apps/web/tests/unit/api/health/comprehensive.critical.test.ts`
11. `apps/web/tests/components/dashboard/organisms/releases/ReleaseTableRow.test.tsx`
12. `apps/web/tests/components/organisms/release-sidebar/ReleaseArtwork.test.tsx`

## Notes

- `apps/web/tests/e2e/profile-performance.spec.ts` was flagged by automation as a candidate due to helper-based assertions and low direct `expect(...)` calls, but manual review confirmed it enforces performance budgets through assertion helpers, so it is categorized as **genuine**.
