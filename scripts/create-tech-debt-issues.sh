#!/bin/bash
# Create GitHub issues for tech debt items
# Run: ./scripts/create-tech-debt-issues.sh
# Requires: gh CLI authenticated (run `gh auth login` first)

set -e

REPO="JovieInc/Jovie"

echo "Creating tech debt issues for $REPO..."
echo "This will create 21 issues. Press Ctrl+C to cancel, or Enter to continue."
read -r

# CRITICAL ISSUES

echo "Creating CRIT-001: XSS Vulnerabilities..."
gh issue create --repo "$REPO" \
  --title "🔴 CRIT-001: XSS Vulnerabilities - Unsanitized dangerouslySetInnerHTML" \
  --label "security,bug,critical" \
  --body "## Description
Multiple components use \`dangerouslySetInnerHTML\` without sanitization, creating XSS attack vectors.

## Affected Files
| File | Line | Issue |
|------|------|-------|
| \`components/profile/StaticListenInterface.tsx\` | 159 | Unsanitized SVG |
| \`components/profile/AnimatedListenInterface.tsx\` | 243 | Unsanitized SVG |
| \`components/molecules/BlogMarkdownReader.tsx\` | 77 | Markdown without DOMPurify |
| \`components/molecules/LegalMarkdownReader.tsx\` | 38 | Markdown without DOMPurify |
| \`app/(marketing)/changelog/page.tsx\` | 39 | Unsanitized changelog |

## Solution
Add DOMPurify sanitization before rendering.

## Acceptance Criteria
- [ ] All \`dangerouslySetInnerHTML\` usages sanitized
- [ ] Unit tests verify sanitization
- [ ] No XSS possible via SVG or markdown

**Priority:** Critical | **Estimate:** 2-3 hours"

echo "Creating CRIT-002: Type Safety Bypass..."
gh issue create --repo "$REPO" \
  --title "🔴 CRIT-002: Type Safety Bypass - @ts-nocheck in Critical API Route" \
  --label "tech-debt,typescript,critical" \
  --body "## Description
\`app/api/dashboard/profile/route.ts\` has \`@ts-nocheck\` at line 1, bypassing TypeScript for the entire 489-line file. Plus 7 \`@ts-expect-error\` for Drizzle type mismatches.

## Affected Lines
- Line 1: \`// @ts-nocheck\`
- Lines 139, 143, 145, 417, 422, 433, 437: \`@ts-expect-error\`

## Root Cause
Drizzle ORM dual-version type conflicts.

## Acceptance Criteria
- [ ] \`@ts-nocheck\` removed
- [ ] All \`@ts-expect-error\` resolved
- [ ] File passes \`pnpm typecheck\`

**Priority:** Critical | **Estimate:** 4-6 hours"

echo "Creating CRIT-003: SQL Injection Pattern..."
gh issue create --repo "$REPO" \
  --title "🔴 CRIT-003: SQL Injection Pattern in Tests" \
  --label "security,testing" \
  --body "## Description
Test files use string interpolation in raw SQL, demonstrating dangerous patterns.

## Affected File
\`tests/integration/rls-access-control.test.ts\` - Lines 95, 99, 113, 117, 129, 133, 146, 152, 171, 177

## Current Code
\`\`\`typescript
// VULNERABLE
drizzleSql.raw(\\\`SET LOCAL app.clerk_user_id = '\${userAClerkId}'\\\`)
\`\`\`

## Solution
Use parameterized queries.

**Priority:** Critical | **Estimate:** 1-2 hours"

echo "Creating CRIT-004: Environment Variable Leak..."
gh issue create --repo "$REPO" \
  --title "🔴 CRIT-004: Environment Variable Leak Risk" \
  --label "security,architecture" \
  --body "## Description
\`lib/env.ts\` imports both public and secret vars, imported by client components.

## Risk
Server-only secrets could leak to client bundles.

## Solution
Split into:
- \`lib/env-server.ts\` with \`import 'server-only'\`
- \`lib/env-public.ts\` for NEXT_PUBLIC_* vars

**Priority:** Critical | **Estimate:** 3-4 hours"

# HIGH PRIORITY ISSUES

echo "Creating HIGH-001: God Objects..."
gh issue create --repo "$REPO" \
  --title "🟠 HIGH-001: God Objects - 15+ Files Over 700 Lines" \
  --label "tech-debt,refactor,architecture" \
  --body "## Description
15+ files exceed 700 lines, mixing multiple concerns.

## Top Offenders
| File | Lines |
|------|-------|
| \`scripts/drizzle-seed.ts\` | 1,789 |
| \`components/dashboard/organisms/EnhancedDashboardLinks.tsx\` | 1,321 |
| \`lib/ingestion/processor.ts\` | 1,103 |
| \`lib/utils/platform-detection.ts\` | 1,001 |
| \`components/dashboard/organisms/SettingsPolished.tsx\` | 996 |

See \`docs/TECH_DEBT_AUDIT.md\` for full list.

## Solution
Break each file into smaller, focused modules.

**Priority:** High | **Estimate:** 2-3 days"

echo "Creating HIGH-002: Circular Dependencies..."
gh issue create --repo "$REPO" \
  --title "🟠 HIGH-002: Circular Dependencies - 14+ Architecture Violations" \
  --label "tech-debt,architecture" \
  --body "## Description
14+ circular dependencies violate proper layering.

## Violations
- \`lib/notifications/domain.ts\` → \`@/app/api/audience/lib\`
- \`lib/actions/creator.ts\` → \`@/app/dashboard/actions\`
- 12+ components importing from \`app/\`

See \`docs/TECH_DEBT_AUDIT.md\` for full list.

## Solution
1. Move shared contexts to \`lib/contexts/\`
2. Extract types to \`types/\` directory
3. Add ESLint import boundaries

**Priority:** High | **Estimate:** 1-2 days"

echo "Creating HIGH-003: Missing API Validation..."
gh issue create --repo "$REPO" \
  --title "🟠 HIGH-003: Missing API Input Validation" \
  --label "security,api,validation" \
  --body "## Description
Several API endpoints lack Zod schema validation.

## Affected Endpoints
- \`app/api/track/route.ts\`
- \`app/api/featured-creators/route.ts\`
- \`app/api/admin/creator-avatar/route.ts\`
- \`app/api/billing/status/route.ts\`

## Solution
Add Zod schemas for all API inputs.

**Priority:** High | **Estimate:** 4-6 hours"

echo "Creating HIGH-004: Missing Retry Logic..."
gh issue create --repo "$REPO" \
  --title "🟠 HIGH-004: Missing Retry Logic for External APIs" \
  --label "reliability,api" \
  --body "## Description
External API calls lack retry logic with exponential backoff.

## Affected Files
- \`app/api/spotify/search/route.ts\`
- \`app/api/stripe/checkout/route.ts\`
- \`app/api/dashboard/analytics/route.ts\`
- \`lib/ingestion/strategies/base.ts\`

## Solution
Create shared retry utility with exponential backoff.

**Priority:** High | **Estimate:** 3-4 hours"

echo "Creating HIGH-005: N+1 Query Patterns..."
gh issue create --repo "$REPO" \
  --title "🟠 HIGH-005: N+1 Query Patterns" \
  --label "performance,database" \
  --body "## Description
Database queries in loops causing N+1 performance issues.

## Affected Files
- \`lib/discog/queries.ts:54-100\` - Fetches ALL, filters in JS
- \`lib/ingestion/processor.ts\` - Sequential awaits in loops (3 locations)

## Solution
Use \`inArray()\` for batch filtering, \`Promise.all()\` for parallel ops.

**Priority:** High | **Estimate:** 3-4 hours"

echo "Creating HIGH-006: Skipped Tests..."
gh issue create --repo "$REPO" \
  --title "🟠 HIGH-006: 21 Skipped Tests Including Security Tests" \
  --label "testing,tech-debt" \
  --body "## Description
21 tests are skipped, including critical security tests.

## Critical Skips
- \`describe.skip('RLS access control')\` - Security tests
- \`describe.skip('EnhancedDashboardLinks')\` - Main component
- E2E: \`golden-path.spec.ts\`, \`onboarding.*.spec.ts\`

## Acceptance Criteria
- [ ] All \`.skip()\` tests re-enabled and passing
- [ ] RLS tests validate security policies

**Priority:** High | **Estimate:** 1-2 days"

# MEDIUM PRIORITY ISSUES

echo "Creating MED-001: Console Logging..."
gh issue create --repo "$REPO" \
  --title "🟡 MED-001: Replace 401 Console Statements with Structured Logging" \
  --label "tech-debt,observability" \
  --body "## Description
401 \`console.*\` statements should use Sentry structured logging.

## Solution
Replace with Sentry capture functions.

**Priority:** Medium | **Estimate:** 4-6 hours"

echo "Creating MED-002: Magic Numbers..."
gh issue create --repo "$REPO" \
  --title "🟡 MED-002: Extract Magic Numbers to Constants" \
  --label "tech-debt,maintainability" \
  --body "## Description
Hardcoded numbers throughout codebase without explanation.

## Examples
- Retry attempts: 5
- Timeouts: 5000ms
- Batch sizes: 20, 50
- Cache TTLs

## Solution
Create \`lib/constants/index.ts\` with named constants.

**Priority:** Medium | **Estimate:** 2-3 hours"

echo "Creating MED-003: Loose Equality..."
gh issue create --repo "$REPO" \
  --title "🟡 MED-003: Fix 343 Loose Equality Operators" \
  --label "tech-debt,code-quality" \
  --body "## Description
343 instances of \`!=\` instead of \`!==\`.

## Solution
1. Add ESLint rule \`eqeqeq: 'error'\`
2. Run \`pnpm lint --fix\`

**Priority:** Medium | **Estimate:** 2-3 hours"

echo "Creating MED-004: API Response Format..."
gh issue create --repo "$REPO" \
  --title "🟡 MED-004: Standardize API Response Format" \
  --label "api,dx" \
  --body "## Description
Inconsistent error response formats across endpoints.

## Solution
Create standardized response helpers in \`lib/api/response.ts\`.

**Priority:** Medium | **Estimate:** 3-4 hours"

echo "Creating MED-005: Deprecated Dependencies..."
gh issue create --repo "$REPO" \
  --title "🟡 MED-005: Update Deprecated Dependencies" \
  --label "dependencies,security" \
  --body "## Deprecated Packages
- \`tmp\` - CWE-59 vulnerability
- \`critters@0.0.25\` - Ownership moved
- \`expect-playwright\` - Use Playwright built-ins
- \`jest-process-manager\` - Deprecated

**Priority:** Medium | **Estimate:** 2-3 hours"

echo "Creating MED-006: Component Memoization..."
gh issue create --repo "$REPO" \
  --title "🟡 MED-006: Add Memoization to 96% of Components" \
  --label "performance,react" \
  --body "## Description
332/346 components (96%) lack memoization.

## Focus Areas
- Dashboard components with heavy state
- List items in virtualized lists

**Priority:** Medium | **Estimate:** 4-6 hours"

# LOW PRIORITY ISSUES

echo "Creating LOW-001: Config Consolidation..."
gh issue create --repo "$REPO" \
  --title "🟢 LOW-001: Consolidate Configuration Files" \
  --label "dx,cleanup" \
  --body "## Files to Consolidate
- 3 Playwright configs → 1 with projects
- 2 Vitest configs → 1 with workspaces

**Priority:** Low | **Estimate:** 1-2 hours"

echo "Creating LOW-002: Hook Locations..."
gh issue create --repo "$REPO" \
  --title "🟢 LOW-002: Standardize Hook Locations" \
  --label "dx,organization" \
  --body "## Current Locations
- \`/hooks/\`
- \`/lib/hooks/\`
- \`/components/organisms/hooks/\`
- \`/components/dashboard/organisms/links/hooks/\`

## Solution
Consolidate to \`/hooks/\` with subdirectories.

**Priority:** Low | **Estimate:** 1-2 hours"

echo "Creating LOW-003: Legacy Patterns..."
gh issue create --repo "$REPO" \
  --title "🟢 LOW-003: Remove Legacy Patterns" \
  --label "cleanup,tech-debt" \
  --body "## Legacy Code
- Deprecated media query API
- Legacy YouTube URL handling
- Legacy JSONB payload handling
- Legacy encryption fallbacks

**Priority:** Low | **Estimate:** 2-3 hours"

echo "Creating LOW-004: JSDoc..."
gh issue create --repo "$REPO" \
  --title "🟢 LOW-004: Add Missing JSDoc to Complex Functions" \
  --label "documentation,dx" \
  --body "## Functions Needing Docs
- \`lib/services/link-wrapping.ts\` - createRecord, getWrappedLink
- \`lib/spotify.ts\` - getSpotifyArtistAlbums
- \`lib/deep-links.ts\` - createDeepLink

**Priority:** Low | **Estimate:** 3-4 hours"

echo "Creating LOW-005: Return Types..."
gh issue create --repo "$REPO" \
  --title "🟢 LOW-005: Add Missing Return Types" \
  --label "typescript,dx" \
  --body "## Functions Missing Types
- \`lib/analytics.ts\` - flushQueue, withAnalyticsGuard
- \`lib/dsp.ts\` - getAvailableDSPs

**Priority:** Low | **Estimate:** 1-2 hours"

echo ""
echo "✅ Created 21 tech debt issues!"
echo "View at: https://github.com/$REPO/issues"
