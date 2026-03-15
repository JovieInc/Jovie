#!/usr/bin/env bash
# Create GitHub issues from the launch readiness audit.
# Usage: ./scripts/create-launch-issues.sh
# Requires: gh CLI authenticated (gh auth login)
set -euo pipefail

REPO="JovieInc/Jovie"

echo "Creating 16 launch readiness issues..."

# ─── P1 — FIX WEEK 1 ────────────────────────────────────────────────

gh issue create --repo "$REPO" \
  --title "Add Sentry capture to feedback API route" \
  --label "bug,observability" \
  --body "$(cat <<'EOF'
## Context
From [launch readiness audit](../audits/launch-readiness-audit-2026-03-14.md) — last API route without error observability.

## Problem
`/api/feedback/route.ts` catch block only uses `logger.error()` without Sentry capture. If feedback submissions silently fail, we lose direct user signal.

## Fix
Add `captureError()` to the catch block, matching the pattern used in all other API routes.

**File:** `apps/web/app/api/feedback/route.ts`
**Effort:** 15 minutes
**Priority:** P1
EOF
)"
echo "✓ Issue 1 created"

gh issue create --repo "$REPO" \
  --title "Add Zod validation to profile update and tip creation endpoints" \
  --label "security,enhancement" \
  --body "$(cat <<'EOF'
## Context
From [launch readiness audit](../audits/launch-readiness-audit-2026-03-14.md) — defense-in-depth for user input validation.

## Problem
- Profile updates accept flexible objects filtered by `allowedFields` but lack strict Zod schema validation for field constraints
- Tip creation reads `amount` and `handle` directly from JSON without range validation

## Fix
### Profile updates (`apps/web/app/api/dashboard/profile/route.ts`)
Add Zod schema:
- `displayName`: max 50 chars
- `bio`: max 512 chars
- `creatorType`: enum validation
- URLs: `z.string().url()` with protocol restriction

### Tip intent endpoint
Add Zod schema:
- `amount`: integer, 1-500 USD bounds
- `handle`: username pattern validation

**Effort:** 1-2 hours
**Priority:** P1
EOF
)"
echo "✓ Issue 2 created"

gh issue create --repo "$REPO" \
  --title "Write interaction tests for 6 high-regression UI components" \
  --label "test,enhancement" \
  --body "$(cat <<'EOF'
## Context
From [testing audit](../audits/testing-audit-2026-02-16.md) and [launch readiness audit](../audits/launch-readiness-audit-2026-03-14.md).

## Problem
Six interactive UI components that repeatedly cause production regressions have zero unit test coverage.

## Components to test
Use `*.interaction.test.tsx` naming convention:

1. **CreatorActionsMenu** — dropdown actions, copy-to-clipboard, conditional rendering (~8 tests)
2. **SidebarLinkRow** — clipboard, open URL, remove with loading state (~8 tests)
3. **RightDrawer** — responsive render, keyboard handler, aria-hidden (~7 tests)
4. **DrawerHeader** — close button, mobile/desktop icon switching (~4 tests)
5. **TableActionMenu** — trigger variants, action items, separators (~6 tests)
6. **DrawerNav** — tab switching, aria-selected, onValueChange (~4 tests)

## Reference
Full test specifications in `audits/testing-audit-2026-02-16.md` sections 3.1–3.6, including mock strategies and exact test cases.

**Effort:** ~16 hours across 2 sprints
**Priority:** P1
EOF
)"
echo "✓ Issue 3 created"

gh issue create --repo "$REPO" \
  --title "Update CI to run interaction tests on every PR" \
  --label "ci,enhancement" \
  --body "$(cat <<'EOF'
## Context
From [testing audit](../audits/testing-audit-2026-02-16.md) — only 7 critical test files run on PRs.

## Problem
UI component tests don't run unless the test file itself is modified in the same PR. A developer can break CreatorActionsMenu and CI will pass.

## Fix
Change vitest pattern in `.github/workflows/ci.yml` (lines 780, 784, 801):

```bash
# Before
cd apps/web && pnpm vitest run --config=vitest.config.mts $COVERAGE_FLAG "critical"

# After
cd apps/web && pnpm vitest run --config=vitest.config.mts $COVERAGE_FLAG "critical|interaction"
```

**Impact:** +5-8 seconds per PR (10-15 tests at ~0.5s each)
**Effort:** 30 minutes
**Priority:** P1
EOF
)"
echo "✓ Issue 4 created"

# ─── P2 — FIX WITHIN FIRST MONTH ────────────────────────────────────

gh issue create --repo "$REPO" \
  --title "Move hardcoded route paths to APP_ROUTES constants" \
  --label "refactor,code-quality" \
  --body "$(cat <<'EOF'
## Problem
Several components use hardcoded route strings instead of centralized `APP_ROUTES` constants, creating drift risk.

## Files
- `SignUpForm.tsx` — hardcoded legal paths
- `CookieModal.tsx` — hardcoded legal paths
- `ProfileNavButton.tsx` — hardcoded paths
- `DashboardRemoveBrandingCard.tsx` — hardcoded billing path
- `launch/page.tsx` — hardcoded paths

## Fix
Add `LEGAL_TERMS`, `LEGAL_PRIVACY`, `LEGAL_COOKIES`, `BILLING_REMOVE_BRANDING` to `APP_ROUTES` and update all references.

**Effort:** 1 hour
**Priority:** P2
EOF
)"
echo "✓ Issue 5 created"

gh issue create --repo "$REPO" \
  --title "Replace direct process.env access with validated env module" \
  --label "refactor,code-quality" \
  --body "$(cat <<'EOF'
## Problem
~10 files access `process.env` directly instead of using the Zod-validated `env` from `@/lib/env-server`. This bypasses runtime validation and type safety.

## Affected areas
Marketing pages, cron helpers, capture-tip utility.

## Fix
Replace `process.env.X` with `env.X` from `@/lib/env-server` or `@/lib/env-client`.

**Effort:** 1 hour
**Priority:** P2
EOF
)"
echo "✓ Issue 6 created"

gh issue create --repo "$REPO" \
  --title "Add bundle size analysis to CI pipeline" \
  --label "ci,performance" \
  --body "$(cat <<'EOF'
## Problem
No automated bundle size tracking in CI. The Sentry bundle analysis script exists (`scripts/analyze-sentry-bundle.sh`) but doesn't run automatically. Bundle regressions go undetected until they impact Core Web Vitals.

## Fix
Add `@next/bundle-analyzer` or similar to CI to track and comment on bundle size changes per PR.

**Effort:** 1-2 hours
**Priority:** P2
EOF
)"
echo "✓ Issue 7 created"

gh issue create --repo "$REPO" \
  --title "Add canonical URLs to paginated and filtered views" \
  --label "seo,enhancement" \
  --body "$(cat <<'EOF'
## Problem
Paginated and filtered views (audience list, admin tables, contacts) may create duplicate content signals for search engines.

## Fix
Add `<link rel="canonical">` pointing to the base URL without pagination/filter query params.

**Effort:** 30 minutes
**Priority:** P2
EOF
)"
echo "✓ Issue 8 created"

gh issue create --repo "$REPO" \
  --title "Update SECURITY.md supported version from 0.1.x to 26.x" \
  --label "docs" \
  --body "$(cat <<'EOF'
## Problem
`SECURITY.md` references version `0.1.x` as the supported version. The current release is `26.2.0`.

## Fix
Update the supported versions table to reflect the current `26.x` release line.

**Effort:** 5 minutes
**Priority:** P2
EOF
)"
echo "✓ Issue 9 created"

gh issue create --repo "$REPO" \
  --title "Document incident response and disaster recovery procedures" \
  --label "docs,security" \
  --body "$(cat <<'EOF'
## Problem
No formal incident response runbook, disaster recovery playbook, or database restore procedures. Critical for post-launch operations.

## Deliverables
- `docs/security/INCIDENT_RESPONSE.md` — escalation paths, communication templates, rollback procedures
- `docs/operations/DISASTER_RECOVERY.md` — Neon database restore from snapshots, secret rotation, Vercel rollback steps

**Effort:** 2-3 hours
**Priority:** P2
EOF
)"
echo "✓ Issue 10 created"

gh issue create --repo "$REPO" \
  --title "Document API key rotation procedures" \
  --label "docs,security" \
  --body "$(cat <<'EOF'
## Problem
No documentation for rotating secrets (Clerk, Stripe, Spotify, encryption keys). Need a rotation runbook for each integration covering the rotation process and any downtime implications.

## Integrations to document
Clerk, Stripe, Spotify, Resend, Neon, Bandsintown, MusicFetch, Mercury, RevenueCat, Sentry, Statsig, URL/PII encryption keys, CRON_SECRET

**Effort:** 1-2 hours
**Priority:** P2
EOF
)"
echo "✓ Issue 11 created"

gh issue create --repo "$REPO" \
  --title "Strengthen LinkActions test coverage and fix ConfirmDialog false positive" \
  --label "test,enhancement" \
  --body "$(cat <<'EOF'
## Problem
`LinkActions.keyboard.test.tsx` over-mocks `ConfirmDialog` creating a false positive — tests pass even if the real dialog wiring breaks.

## Fix
1. Add 6 test cases to existing `LinkActions.keyboard.test.tsx`:
   - Menu closes after action click
   - Escape key closes menu
   - ArrowDown/ArrowUp navigates items
   - onEdit undefined → Edit item not shown
   - Confirm dialog shows correct title/description
   - Cancel in confirm dialog does NOT call onRemove

2. Write `LinkActions.negative.interaction.test.tsx` using real `ConfirmDialog`

**Reference:** `audits/testing-audit-2026-02-16.md` sections 3.7, 4.2
**Effort:** 2.5 hours
**Priority:** P2
EOF
)"
echo "✓ Issue 12 created"

# ─── P3 — NICE TO HAVE ──────────────────────────────────────────────

gh issue create --repo "$REPO" \
  --title "Add prefers-reduced-motion support for animations" \
  --label "accessibility,enhancement" \
  --body "$(cat <<'EOF'
## Problem
No `prefers-reduced-motion` media query handling for Framer Motion transitions and loading spinners. Not a WCAG AA requirement but improves UX for vestibular disorder users.

**Effort:** 2-3 hours
**Priority:** P3
EOF
)"
echo "✓ Issue 13 created"

gh issue create --repo "$REPO" \
  --title "Consider infrastructure-as-code for Vercel configuration" \
  --label "infrastructure,enhancement" \
  --body "$(cat <<'EOF'
## Problem
Vercel configuration is entirely managed via dashboard (no vercel.json). For reproducibility and audit trail, consider migrating key settings to code.

**Effort:** 2-4 hours
**Priority:** P3
EOF
)"
echo "✓ Issue 14 created"

gh issue create --repo "$REPO" \
  --title "Expand synthetic monitoring to cover more user journeys" \
  --label "monitoring,enhancement" \
  --body "$(cat <<'EOF'
## Problem
Current synthetic monitoring runs only the golden path test every 15 minutes. Consider expanding to cover: signup → onboarding, billing flow, profile edit → save, link click tracking.

**Effort:** 4-6 hours
**Priority:** P3
EOF
)"
echo "✓ Issue 15 created"

gh issue create --repo "$REPO" \
  --title "Add retry logic to Apple Music search endpoint" \
  --label "bug,enhancement" \
  --body "$(cat <<'EOF'
## Problem
Spotify search has full retry with exponential backoff, but Apple Music search (`/api/apple-music/search/route.ts`) has no retry logic. Transient Apple API failures return hard errors to users.

## Fix
Add retry logic matching the Spotify pattern in `lib/spotify/retry.ts`.

**Effort:** 30 minutes
**Priority:** P3
EOF
)"
echo "✓ Issue 16 created"

echo ""
echo "✅ All 16 launch readiness issues created!"
echo "   P1: 4 issues (fix week 1)"
echo "   P2: 8 issues (fix within month)"
echo "   P3: 4 issues (backlog)"
