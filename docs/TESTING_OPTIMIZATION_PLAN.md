# Testing Optimization Plan

This plan keeps testing lean, fast, and trustworthy so we can ship confidently. Updates below reflect current progress.

## Progress Update (2026-01-04)

- **Testing guidelines authored:** Added `docs/TESTING_GUIDELINES.md` to align the team on when to use each test type, how to write durable tests, and how to review them with intent.
- **Coverage focus:** Reinforced the testing pyramid by emphasizing unit/integration coverage for new flows before adding E2E guardrails on golden paths.
- **Review quality:** Introduced a test-specific PR checklist to make reviews faster and more consistent.
- **Test stabilization:** Fixed unit tests and mocks, excluded Playwright-only specs from Vitest.

## Next Steps

1. Socialize the guidelines in engineering standups and add them to onboarding materials.
2. Apply the checklist to upcoming PRs touching auth, onboarding, and monetization paths.
3. Track flake rates on E2E suites weekly and prune unstable cases.
4. Define performance budgets per critical API and add thresholded tests where missing.

---

# Testing Optimization for YC-Style Shipping Speed

## Executive Summary

This document outlines the optimization of our test suite to enable YC-style rapid iteration while maintaining critical functionality coverage. Current state: 218 test files (46,428 lines) with significant bloat and misaligned test types.

## Current State Analysis

### Test Suite Metrics
- **Total Test Files**: 218
- **Total Lines**: 46,428 lines of test code
- **Test Types**: Unit, Integration, E2E, Performance, Accessibility
- **Mock Usage**: 152/218 files use `vi.mock` (70%)

### Critical Issues Identified
1. **Massive Test Bloat**: `useFormState.test.tsx` (2,147 lines), `social-links.test.ts` (1,076 lines)
2. **Wrong Test Type Usage**: Integration tests labeled as unit, E2E testing components
3. **Performance Bottlenecks**: Slow tests excluded from fast config
4. **False Confidence**: Extensive mocking, trivial prop variation tests

## Proposed Testing Ethos

### YC-Style Testing Principles
1. **Ship Fast, Test Smart**: 5-minute max test suite
2. **User Journey Focus**: Test what users experience
3. **Critical Path Coverage**: Core functionality only
4. **Integration Over Unit**: Test components together
5. **Production Mirroring**: Test in realistic environments

### Test Type Distribution
```
Unit (5%): Pure functions, algorithms
Integration (45%): Components + APIs together  
E2E (50%): Real user journeys in browser
Performance (separate): Monitoring, not tests
```

### Fast Feedback Loop Targets
- **Smoke tests**: <30 seconds, run on every PR
- **Critical path**: <2 minutes, run on main branch
- **Full suite**: <5 minutes, run before releases
- **Coverage**: Separate from functional tests

## Optimization Strategy

### Phase 1: Quick Wins (Week 1)
- Delete 50% of unit tests providing false confidence
- Move slow tests to performance monitoring
- Consolidate duplicate E2E tests
- Enable fast test config by default

### Phase 2: Strategic Fixes (Week 2)
- Add missing core user journey tests
- Implement contract testing for APIs
- Set up production-like test environments
- Create test performance budgets

### Phase 3: Culture Shift (Week 3)
- Training on YC-style testing
- Code review guidelines for tests
- Test metrics dashboard
- Automated test cleanup

## Progress Tracking

### Completed Tasks
- [x] Test suite audit completed
- [x] Performance bottlenecks identified
- [x] False confidence tests mapped
- [x] Critical coverage gaps identified
- [x] Test type alignment analyzed
- [x] Testing ethos proposal created
- [x] All 11 Linear issues created successfully
- [x] Documents created and structured for parallel execution

### In Progress
- [ ] Phase 1 quick wins implementation (5 issues ready for parallel work)
- [ ] Phase 2 strategic fixes planned (4 issues ready)
- [ ] Phase 3 culture shift prepared (2 issues ready)

## Success Metrics

### Quantitative Targets
- **Test suite time**: From >10 minutes to <5 minutes
- **Test file count**: From 218 to ~100
- **Test lines**: From 46,428 to ~15,000
- **Mock usage**: From 70% to <30%

### Qualitative Targets
- **Faster PR feedback**: <2 minutes for smoke tests
- **Better coverage**: Focus on user journeys
- **Higher confidence**: Realistic test environments
- **Developer experience**: Clear test guidelines

## Implementation Guidelines

### PR Guidelines
1. Each task should have a separate, clean PR
2. All tests must pass (`pnpm test`)
3. All lint checks must pass (`pnpm lint`)
4. Type checking must pass (`pnpm typecheck`)
5. Update this document with progress in PR description

### Branch Naming
- `feat/test-optimize-{task-number}`
- Example: `feat/test-optimize-1-1`

### Documentation Updates
Each PR should update the "Progress Tracking" section with:
- Task completion status
- Files modified/deleted
- Performance improvements measured
- Any blockers or issues found

## Risk Mitigation

### Safeguards
1. **Smoke tests**: Always run before deployment
2. **Critical paths**: Core user journeys protected
3. **Rollback plan**: Each phase can be reverted
4. **Monitoring**: Production health checks

### Success Criteria
- No regression in critical user journeys
- Faster feedback loops maintained
- Developer satisfaction improved
- Deployment confidence preserved

---

**Last Updated**: 2026-01-04
**Next Review**: After Phase 1 completion
**Owner**: Test Optimization Team
