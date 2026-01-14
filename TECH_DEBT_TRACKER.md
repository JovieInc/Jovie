# Tech Debt Tracker

> **Last Updated:** 2026-01-14
> **Maintainers:** All AI agents and developers

This document tracks technical debt in the Jovie codebase. AI agents **must** update this file when they address or discover tech debt items.

---

## How to Use This Document

### For AI Agents

When you **fix** a tech debt item:
1. Move the item from "Open Issues" to "Resolved Issues"
2. Add the date, PR/commit reference, and brief description
3. Update the metrics table

When you **discover** new tech debt:
1. Add the item to the appropriate "Open Issues" section
2. Include file path, line number (if applicable), and description
3. Assign a priority (P0-P3)

### Priority Definitions

| Priority | Definition | SLA |
|----------|------------|-----|
| **P0** | Critical - Blocks production or causes data loss | This sprint |
| **P1** | High - Significant code quality or security concern | Next 2 sprints |
| **P2** | Medium - Should be addressed but not urgent | Backlog |
| **P3** | Low - Nice to have improvements | As time permits |

---

## Metrics Dashboard

| Metric | Count | Target | Last Updated |
|--------|-------|--------|--------------|
| `@ts-nocheck` files | **0** | 0 | 2026-01-08 |
| `@ts-ignore` in production | ~15 | <5 | 2026-01-08 |
| Deprecated files | 30+ | 0 | 2026-01-08 |
| TODO comments | 6 | 0 | 2026-01-08 |
| Empty catch blocks | **0** | 0 | 2026-01-08 |

---

## Resolved Issues

### 2026-01-14

| Item | Priority | Resolution | Reference |
|------|----------|------------|-----------|
| Excessive return statements in shared web utilities | P2 | Consolidated guard clauses to satisfy S1142 | fix/batch-47-multiple-returns |

### 2026-01-08

| Item | Priority | Resolution | Reference |
|------|----------|------------|-----------|
| Dead waitlist `rejected` status checks in `apps/web/lib/auth/gate.ts` | P1 | Removed unreachable waitlist logic and aligned status types | chore/remove-rejected-status |

### 2026-01-05

| Item | Priority | Resolution | Reference |
|------|----------|------------|-----------|
| Oversized `apps/web/tests/unit/api/dashboard/social-links.test.ts` | P3 | Replaced with concise contract tests (~140 lines) to remove redundant mocks | feat/test-optimize-1-2 |

### 2026-01-03

| Item | Priority | Resolution | Reference |
|------|----------|------------|-----------|
| `@ts-nocheck` in `app/api/dashboard/profile/route.ts` | P0 | Removed file-level suppression; Drizzle type issues handled with targeted `@ts-expect-error` | `claude/audit-tech-debt-dQNmv` |
| Empty catch block in `app/layout.tsx:171` | P0 | Added explanatory comment for intentional silent failure in theme detection | `claude/audit-tech-debt-dQNmv` |

### 2026-01-04

| Item | Priority | Resolution | Reference |
|------|----------|------------|-----------|
| Oversized `apps/web/tests/unit/useFormState.test.tsx` (2,116 lines) | P3 | Rebuilt focused 150-line suite covering core hook behaviors and removed bloat | `feat/test-optimize-1-1` |

---

## Open Issues

### P0 - Critical

_No critical issues currently open._

### P1 - High (Drizzle ORM Type Mismatches)

These require Drizzle ORM version alignment to fully resolve:

| File | Lines | Description |
|------|-------|-------------|
| `app/api/dashboard/profile/route.ts` | 53, 58, 60, 331, 336, 347, 351 | Drizzle dual-version type mismatch |
| `app/api/images/status/[id]/route.ts` | 51, 53, 55, 57, 59 | Drizzle dual-version type mismatch |
| `app/api/images/upload/route.ts` | 394, 425, 476, 483 | Drizzle dual-version type mismatch |

**Root Cause:** Package overrides in `package.json` pin `drizzle-orm` to `0.45.0` while some dependencies expect different versions.

**Recommended Fix:** Align all Drizzle dependencies to a single version and remove overrides.

### P1 - High (Console Statements in Production)

| File | Line(s) | Description |
|------|---------|-------------|
| `app/[username]/page.tsx` | 124, 362 | `console.error` in public profile page |
| `lib/admin/overview.ts` | 77, 137, 178, 200, 336, 429, 487, 519 | Multiple console calls in admin |
| `lib/errors/ingest.ts` | 277, 286 | Error logging in ingest system |
| `lib/auth/gate.ts` | 309-312 | Missing email guard logging |
| `proxy.ts` | 372 | API request logging |
| `components/home/ArtistSearch.tsx` | 25 | Search error logging |
| `components/home/HeroExampleProfiles.tsx` | 70 | Hero profile error logging |

**Recommended Fix:** Replace with Sentry logging per agents.md Section 15.

### P2 - Medium (Deprecated Files)

Files marked `@deprecated` that should be migrated:

| File | Replacement | Consumers |
|------|-------------|-----------|
| `lib/db/queries.ts` | `@/lib/services/profile` | TBD |
| `lib/db/schema.ts` | `@/lib/db/schema/` directory | TBD |
| `lib/utils/rate-limit.ts` | `@/lib/rate-limit` | TBD |
| `lib/analytics/tracking-rate-limit.ts` | `@/lib/rate-limit` | TBD |
| `lib/validation/schemas/dashboard.ts` | New validation location | TBD |
| `lib/stripe/customer-sync.ts` | Refactored module | TBD |
| `lib/ingestion/processor.ts` | Direct imports deprecated | TBD |
| `lib/waitlist/access.ts` | `@/lib/auth/gate` | TBD |
| `components/atoms/ArtistAvatar.tsx` | Use `Avatar` directly | TBD |
| `components/organisms/Sidebar.tsx` | See component docs | TBD |
| `components/dashboard/DashboardTipping.tsx` | New tipping module | TBD |
| `app/app/dashboard/actions/profile-selection.ts` | `@/lib/db/server` | TBD |
| `app/app/dashboard/actions/tipping-stats.ts` | `@/lib/db/server` | TBD |
| `lib/hooks/useNotifications.ts` (useNotificationToast) | `useNotifications` | TBD |

### P2 - Medium (TODO Comments)

| File | Line | Comment |
|------|------|---------|
| `tests/e2e/synthetic-golden-path.spec.ts` | 3 | TODO: Use Clerk testing token |
| `components/admin/ActivityTable.tsx` | 12 | TODO: extend activity feed |
| `lib/audit/ingest.ts` | 195 | TODO: When database table is available |
| `lib/audit/ingest.ts` | 198 | TODO: When external audit service is available |
| `app/api/monitoring/performance/route.ts` | 38 | TODO: Integrate with analytics service |
| `components/admin/ReliabilityCard.tsx` | 5 | TODO: extend reliability metrics |

### P2 - Medium (React Hooks Exhaustive Deps)

Review these suppressions for potential bugs:

| File | Line | Suppression |
|------|------|-------------|
| `components/dashboard/organisms/DashboardAnalyticsCards.tsx` | 75 | `react-hooks/exhaustive-deps` |
| `components/dashboard/molecules/universal-link-input/useUniversalLinkInput.ts` | 119 | `react-hooks/exhaustive-deps` |
| `components/dashboard/molecules/universal-link-input/useUniversalLinkInput.ts` | 302 | `react-hooks/exhaustive-deps` |
| `components/dashboard/organisms/links/hooks/useLinksPersistence.ts` | 334 | `react-hooks/exhaustive-deps` |

### P3 - Low (TypeScript `any` in Production)

| File | Line | Description |
|------|------|-------------|
| `lib/env-server.ts` | 316 | Process type casting |
| `lib/stripe/customer-sync/types.ts` | 234 | Dynamic field mapping |

### P3 - Low (Large Test Files)

Consider splitting for maintainability:

| File | Lines |
|------|-------|
| `tests/unit/useFormState.test.tsx` | 2,116 |
| `tests/unit/lib/stripe/webhooks/handlers/payment-handler.test.ts` | 982 |

### P3 - Low (Stale Documentation)

Review and archive if completed:

- `PERFORMANCE_ISSUES_REPORT.md`
- `PROGRESSIVE_ONBOARDING.md`
- `FEATURED_ARTISTS_IMAGE_IMPROVEMENTS.md`
- `SHADECN_UI_REFACTOR_TASKS.md`
- `COMPONENT_REFACTORING.md`
- `PLAN-releases-page.md`

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-01-03 | Claude | Initial tracker created from tech debt audit |
| 2026-01-03 | Claude | Resolved P0: `@ts-nocheck` and empty catch block |
| 2026-01-08 | Codex | Logged removal of dead waitlist status checks |

---

_This document is maintained by AI agents per instructions in `agents.md` Section 17._
