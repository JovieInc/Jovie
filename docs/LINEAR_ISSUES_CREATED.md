# Linear Issues Created Successfully! 🎉

## All 11 Issues Created in Linear

### Phase 1: Quick Wins (Ready for Parallel Execution)

1. **[JOV-294] 🔴 Remove Massive Test Bloat - Delete 2,147-line useFormState Test**
   - URL: https://linear.app/jovie/issue/JOV-294
   - Priority: High | Assignee: Codex

2. **[JOV-295] 🔴 Remove API Route Test Bloat - Delete 1,076-line Social Links Test**
   - URL: https://linear.app/jovie/issue/JOV-295
   - Priority: High | Assignee: Codex

3. **[JOV-296] 🟡 Remove Component Prop Variation Tests - Button Component Cleanup**
   - URL: https://linear.app/jovie/issue/JOV-296
   - Priority: Medium | Assignee: Codex

4. **[JOV-297] 🟡 Move Database Performance Tests to Monitoring**
   - URL: https://linear.app/jovie/issue/JOV-297
   - Priority: Medium | Assignee: Codex

5. **[JOV-298] 🟢 Enable Fast Test Config by Default**
   - URL: https://linear.app/jovie/issue/JOV-298
   - Priority: Medium | Assignee: Codex

### Phase 2: Strategic Fixes (Ready after Phase 1)

6. **[JOV-299] 🟢 Add Missing Core User Journey Tests - Onboarding Flow**
   - URL: https://linear.app/jovie/issue/JOV-299
   - Priority: High | Assignee: Codex

7. **[JOV-300] 🟢 Add Payment Flow E2E Tests - Stripe Integration**
   - URL: https://linear.app/jovie/issue/JOV-300
   - Priority: High | Assignee: Codex

8. **[JOV-301] 🟡 Implement API Contract Testing - Dashboard APIs**
   - URL: https://linear.app/jovie/issue/JOV-301
   - Priority: Medium | Assignee: Codex

9. **[JOV-302] 🟢 Add Admin Ingestion Pipeline Tests - Creator Data Import**
   - URL: https://linear.app/jovie/issue/JOV-302
   - Priority: High | Assignee: Codex

### Phase 3: Culture Shift (Ready after Phase 1)

10. **[JOV-303] 🟡 Create Test Performance Budgets and Monitoring**
    - URL: https://linear.app/jovie/issue/JOV-303
    - Priority: Medium | Assignee: Codex

11. **[JOV-304] 📚 Create Testing Guidelines Document**
    - URL: https://linear.app/jovie/issue/JOV-304
    - Priority: Low | Assignee: Codex

## 🚀 Ready for Parallel Execution

### Start Now: Phase 1 Issues
All 5 Phase 1 issues are ready to be worked on **simultaneously**:

```bash
# Branch naming convention
feat/test-optimize-1-1  # JOV-294: Remove useFormState bloat
feat/test-optimize-1-2  # JOV-295: Remove social-links API bloat
feat/test-optimize-1-3  # JOV-296: Remove component prop tests
feat/test-optimize-1-4  # JOV-297: Move database tests to monitoring
feat/test-optimize-1-5  # JOV-298: Enable fast test config
```

### Expected Impact
- **Test files**: 218 → ~100 (-54%)
- **Test lines**: 46,428 → ~15,000 (-68%)
- **Execution time**: >10min → <5min
- **Mock usage**: 70% → <30%

## 📋 Next Steps

1. **Start Phase 1**: Work on any of the 5 Phase 1 issues in parallel
2. **Create PRs**: Use the specified branch names
3. **Update Progress**: Update docs/TESTING_OPTIMIZATION_PLAN.md after each PR
4. **Track Metrics**: Include before/after metrics in PR descriptions

## 🔄 Parallel Execution Strategy

- **Phase 1**: Issues 1.1-1.5 can be worked on simultaneously
- **Phase 2**: Issues 2.1-2.4 can start after Phase 1 completion
- **Phase 3**: Issues 3.1-3.2 can start after Phase 1 completion

## 📊 Success Metrics

Each issue includes clear success criteria and expected outcomes. Track progress in the main optimization document.

---

## 📋 New Issue to Create

### Route Refactoring - Drop `/app` Prefix

**Title**: 🟡 Refactor: Drop `/app` prefix from authenticated routes

**Priority**: Medium

**Assignee**: Codex

**Labels**: refactoring, routing, dx

**Description**:
Follow-up to the route naming simplification (PR that merged `/app/dashboard/overview` → `/app/dashboard`, etc.). This issue completes the refactoring by removing the `/app` prefix entirely for a cleaner URL structure.

**Current State** (after Phase 1):
- `/app/dashboard` → Overview
- `/app/dashboard/audience` → Audience
- `/app/dashboard/earnings` → Earnings
- `/app/settings` → Account settings
- `/app/settings/branding` → Branding

**Target State** (Phase 2):
- `/dashboard` → Overview
- `/dashboard/audience` → Audience
- `/dashboard/earnings` → Earnings
- `/settings` → Account settings
- `/settings/branding` → Branding

**Scope of Work** (~320 references to update):

| Area | Count | Files |
|------|-------|-------|
| Hardcoded path strings | 280+ | 35 files |
| `startsWith('/app')` checks | 17 | 4 files |
| Middleware routing logic | 8 | proxy.ts |
| E2E test files | 15+ | tests/e2e/ |

**Key Files**:
- `/apps/web/proxy.ts` - Remove `/app` from reserved pages, update auth routing
- `/apps/web/lib/sentry/route-detector.ts` - Update DASHBOARD_ROUTES
- `/apps/web/app/app/dashboard/DashboardLayoutClient.tsx` - Update pathname checks
- `/apps/web/components/dashboard/` - Update navigation components
- All test files referencing `/app/*` routes

**Safety Notes**:
- Auth is NOT tied to `/app` prefix (validated in exploration)
- `/dashboard` and `/settings` are already reserved in `proxy.ts`
- Redirects from `/app/*` → new paths needed for backwards compatibility

**Instructions**:
1. Update `proxy.ts` reserved pages and routing logic
2. Move route folders or update Next.js routing
3. Update all navigation component references
4. Update all pathname checks in layouts
5. Add redirects from old `/app/*` paths
6. Update E2E and unit tests
7. Run full test suite to verify

**Expected Outcome**:
- Cleaner URLs: `domain.com/dashboard` instead of `domain.com/app/dashboard`
- No breaking changes (redirects preserve old URLs)
- Improved user experience and URL memorability

**PR Guidelines**:
- Branch: `refactor/drop-app-prefix`
- Include redirect testing in PR description
- Verify auth flow still works correctly

---

**Status**: ✅ All 11 Linear issues created successfully
**Next Action**: Start Phase 1 parallel execution
**Timeline**: Week 1 (Phase 1), Week 2 (Phase 2), Week 3 (Phase 3)

Let's optimize for YC-style shipping speed! 🚀
