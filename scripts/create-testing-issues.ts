#!/usr/bin/env tsx

/**
 * Script to create Linear issues for testing optimization
 * This script creates all the issues defined in TESTING_OPTIMIZATION_ISSUES.md
 */

interface LinearIssue {
  title: string;
  description: string;
  priority: 'urgent' | 'high' | 'medium' | 'low';
  assignee: string;
  team: string;
  labels: string[];
  projectId?: string;
}

const issues: LinearIssue[] = [
  // Phase 1: Quick Wins
  {
    title: '🔴 Remove Massive Test Bloat - Delete 2,147-line useFormState Test',
    description: `The \`useFormState.test.tsx\` file has grown to 2,147 lines testing a simple hook. This is a clear example of test bloat providing false confidence and slowing down our feedback loops.

**Instructions**:
1. Analyze \`apps/web/tests/unit/useFormState.test.tsx\`
2. Identify the 5-10 most critical test cases
3. Create a new streamlined version with only essential tests
4. Delete the original bloated file
5. Run \`pnpm test\` to ensure all tests pass
6. Run \`pnpm lint\` and \`pnpm typecheck\`

**Expected Outcome**:
- Reduce test file from 2,147 lines to ~200 lines
- Maintain critical functionality coverage
- Improve test execution time

**PR Guidelines**:
- Branch: \`feat/test-optimize-1-1\`
- Update docs/TESTING_OPTIMIZATION_PLAN.md with progress
- Include before/after metrics in PR description`,
    priority: 'high',
    assignee: 'Codex',
    team: 'jovie',
    labels: ['testing', 'optimization', 'phase-1'],
  },
  {
    title:
      '🔴 Remove API Route Test Bloat - Delete 1,076-line Social Links Test',
    description: `The \`social-links.test.ts\` file has 1,076 lines testing API routes with extensive mocking. This should be replaced with focused contract tests.

**Instructions**:
1. Analyze \`apps/web/tests/unit/api/dashboard/social-links.test.ts\`
2. Extract 5-10 critical contract test cases
3. Create new streamlined contract tests
4. Delete the original bloated file
5. Run \`pnpm test\` to ensure all tests pass
6. Run \`pnpm lint\` and \`pnpm typecheck\`

**Expected Outcome**:
- Reduce test file from 1,076 lines to ~150 lines
- Focus on API contracts, not implementation details
- Remove extensive mocking

**PR Guidelines**:
- Branch: \`feat/test-optimize-1-2\`
- Update docs/TESTING_OPTIMIZATION_PLAN.md with progress
- Include before/after metrics in PR description`,
    priority: 'high',
    assignee: 'Codex',
    team: 'jovie',
    labels: ['testing', 'optimization', 'phase-1'],
  },
  {
    title:
      '🟡 Remove Component Prop Variation Tests - Button Component Cleanup',
    description: `Component tests like Button.test.tsx have excessive prop variation tests (12 tests for different variants/sizes) that provide minimal value.

**Instructions**:
1. Analyze \`apps/web/tests/unit/Button.test.tsx\`
2. Keep only 3-4 critical tests: default rendering, click handler, disabled state, asChild
3. Remove prop variation tests (different variants, sizes, etc.)
4. Run \`pnpm test\` to ensure all tests pass
5. Run \`pnpm lint\` and \`pnpm typecheck\`

**Expected Outcome**:
- Reduce Button test from ~120 lines to ~40 lines
- Apply same pattern to other component tests
- Focus on behavior, not props

**PR Guidelines**:
- Branch: \`feat/test-optimize-1-3\`
- Update docs/TESTING_OPTIMIZATION_PLAN.md with progress
- Document pattern for other component tests`,
    priority: 'medium',
    assignee: 'Codex',
    team: 'jovie',
    labels: ['testing', 'optimization', 'phase-1'],
  },
  {
    title: '🟡 Move Database Performance Tests to Monitoring',
    description: `Database performance tests (268 lines) are testing monitoring code, not application logic. These should be moved to monitoring infrastructure.

**Instructions**:
1. Analyze \`apps/web/tests/lib/database-performance.test.ts\`
2. Delete the test file entirely
3. Ensure the monitoring code still works in production
4. Run \`pnpm test\` to ensure all tests pass
5. Run \`pnpm lint\` and \`pnpm typecheck\`

**Expected Outcome**:
- Remove 268 lines of non-functional tests
- Keep monitoring code in production
- Clarify that monitoring is not testing

**PR Guidelines**:
- Branch: \`feat/test-optimize-1-4\`
- Update docs/TESTING_OPTIMIZATION_PLAN.md with progress
- Document monitoring vs testing distinction`,
    priority: 'medium',
    assignee: 'Codex',
    team: 'jovie',
    labels: ['testing', 'optimization', 'phase-1'],
  },
  {
    title: '🟢 Enable Fast Test Config by Default',
    description: `We have a fast test config but it's not the default. Enable fast testing for development while keeping full suite for CI.

**Instructions**:
1. Analyze \`vitest.config.fast.mts\`
2. Update \`vitest.config.mts\` to use fast settings by default
3. Create separate config for full CI suite
4. Update package.json scripts accordingly
5. Run \`pnpm test:fast\` to verify performance
6. Run \`pnpm lint\` and \`pnpm typecheck\`

**Expected Outcome**:
- Default test run <2 minutes
- Separate CI config for full coverage
- Better developer experience

**PR Guidelines**:
- Branch: \`feat/test-optimize-1-5\`
- Update docs/TESTING_OPTIMIZATION_PLAN.md with progress
- Include performance metrics in PR description`,
    priority: 'medium',
    assignee: 'Codex',
    team: 'jovie',
    labels: ['testing', 'optimization', 'phase-1'],
  },
  // Phase 2: Strategic Fixes
  {
    title: '🟢 Add Missing Core User Journey Tests - Onboarding Flow',
    description: `We're missing critical end-to-end tests for core user journeys. Start with the complete onboarding flow.

**Instructions**:
1. Create new E2E test: \`tests/e2e/onboarding-complete-flow.spec.ts\`
2. Test: Sign-up → Profile creation → First link added → Dashboard
3. Use real browser, no extensive mocking
4. Test both success and failure scenarios
5. Run \`pnpm test:e2e\` to ensure tests pass
6. Run \`pnpm lint\` and \`pnpm typecheck\`

**Expected Outcome**:
- Complete user journey coverage
- Realistic test environment
- Critical path protection

**PR Guidelines**:
- Branch: \`feat/test-optimize-2-1\`
- Update docs/TESTING_OPTIMIZATION_PLAN.md with progress
- Include test execution time metrics`,
    priority: 'high',
    assignee: 'Codex',
    team: 'jovie',
    labels: ['testing', 'optimization', 'phase-2'],
  },
  {
    title: '🟢 Add Payment Flow E2E Tests - Stripe Integration',
    description: `Critical gap: No E2E tests for payment flow. Add comprehensive Stripe integration tests.

**Instructions**:
1. Create new E2E test: \`tests/e2e/payment-complete-flow.spec.ts\`
2. Test: Plan selection → Payment form → Success/failure → Dashboard update
3. Use Stripe test environment
4. Test edge cases (card declined, network error)
5. Run \`pnpm test:e2e\` to ensure tests pass
6. Run \`pnpm lint\` and \`pnpm typecheck\`

**Expected Outcome**:
- Complete payment flow coverage
- Stripe integration confidence
- Revenue protection

**PR Guidelines**:
- Branch: \`feat/test-optimize-2-2\`
- Update docs/TESTING_OPTIMIZATION_PLAN.md with progress
- Document Stripe test setup`,
    priority: 'high',
    assignee: 'Codex',
    team: 'jovie',
    labels: ['testing', 'optimization', 'phase-2'],
  },
  {
    title: '🟡 Implement API Contract Testing - Dashboard APIs',
    description: `Replace mock-heavy API tests with focused contract testing that validates request/response contracts.

**Instructions**:
1. Create contract test framework
2. Create \`tests/contracts/dashboard-apis.spec.ts\`
3. Test request/response contracts without mocking business logic
4. Cover all dashboard API endpoints
5. Run \`pnpm test\` to ensure tests pass
6. Run \`pnpm lint\` and \`pnpm typecheck\`

**Expected Outcome**:
- API contract validation
- Reduced mocking
- Better integration confidence

**PR Guidelines**:
- Branch: \`feat/test-optimize-2-3\`
- Update docs/TESTING_OPTIMIZATION_PLAN.md with progress
- Document contract testing approach`,
    priority: 'medium',
    assignee: 'Codex',
    team: 'jovie',
    labels: ['testing', 'optimization', 'phase-2'],
  },
  {
    title: '🟢 Add Admin Ingestion Pipeline Tests - Creator Data Import',
    description: `Missing critical tests for admin ingestion pipeline. Add comprehensive integration tests.

**Instructions**:
1. Create integration test: \`tests/integration/admin-ingestion.test.ts\`
2. Test: CSV upload → Data processing → Profile creation → Notification
3. Test error scenarios (invalid data, duplicates)
4. Use real database with test data
5. Run \`pnpm test\` to ensure tests pass
6. Run \`pnpm lint\` and \`pnpm typecheck\`

**Expected Outcome**:
- Admin pipeline confidence
- Data integrity protection
- Error handling validation

**PR Guidelines**:
- Branch: \`feat/test-optimize-2-4\`
- Update docs/TESTING_OPTIMIZATION_PLAN.md with progress
- Document test data setup`,
    priority: 'high',
    assignee: 'Codex',
    team: 'jovie',
    labels: ['testing', 'optimization', 'phase-2'],
  },
  // Phase 3: Culture Shift
  {
    title: '🟡 Create Test Performance Budgets and Monitoring',
    description: `Implement performance budgets for tests and monitoring to prevent regression.

**Instructions**:
1. Create test performance budget configuration
2. Add performance monitoring to CI
3. Create scripts/test-performance-guard.ts
4. Set budgets: smoke <30s, critical <2min, full <5min
5. Run \`pnpm test:profile\` to verify
6. Run \`pnpm lint\` and \`pnpm typecheck\`

**Expected Outcome**:
- Performance budget enforcement
- Regression prevention
- Performance monitoring

**PR Guidelines**:
- Branch: \`feat/test-optimize-3-1\`
- Update docs/TESTING_OPTIMIZATION_PLAN.md with progress
- Document budget thresholds`,
    priority: 'medium',
    assignee: 'Codex',
    team: 'jovie',
    labels: ['testing', 'optimization', 'phase-3'],
  },
  {
    title: '📚 Create Testing Guidelines Document',
    description: `Create comprehensive testing guidelines based on YC-style principles for team alignment.

**Instructions**:
1. Create \`docs/TESTING_GUIDELINES.md\`
2. Document when to use each test type
3. Include examples of good vs bad tests
4. Add PR review checklist for tests
5. Run \`pnpm lint\` and \`pnpm typecheck\`

**Expected Outcome**:
- Team alignment on testing
- Consistent test quality
- Better code reviews

**PR Guidelines**:
- Branch: \`feat/test-optimize-3-2\`
- Update docs/TESTING_OPTIMIZATION_PLAN.md with progress
- Link to guidelines from other docs`,
    priority: 'low',
    assignee: 'Codex',
    team: 'jovie',
    labels: ['testing', 'optimization', 'phase-3'],
  },
];

// Script to create issues would go here
// For now, we'll just output the issues that would be created
console.log(
  `Generated ${issues.length} Linear issues for testing optimization`
);
console.log('\nIssues can be created in parallel by phase:');
console.log('Phase 1 (Parallel): Issues 1.1-1.5');
console.log('Phase 2 (Parallel): Issues 2.1-2.4 (after Phase 1)');
console.log('Phase 3 (Parallel): Issues 3.1-3.2 (after Phase 1)');

export { issues };
