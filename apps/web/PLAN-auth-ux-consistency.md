# Auth UX Consistency Improvement Plan

## Executive Summary

This plan addresses UX inconsistencies across authentication, onboarding, and waitlist screens, with a focus on back button behavior, step transitions, data handling, and analytics tracking.

---

## 1. Issues Identified

### 1.1 Back Button Inconsistencies

| Screen | Position | Styling | Step 0 Behavior | Inner Steps Behavior |
|--------|----------|---------|-----------------|---------------------|
| **SignIn/SignUp EmailStep** | Fixed (default) | Bottom of form | Goes to MethodSelector | Goes to previous step |
| **SignIn/SignUp VerificationStep** | Inline (top) | Top of step content | n/a | Goes to EmailStep |
| **Onboarding** | Fixed (default) | Top-left of viewport | `router.back()` | `goToPreviousStep()` |
| **Waitlist** | Inline (centered) | Bottom of form | `router.push('/')` | `handleBack()` |

**Problems:**
1. **Position inconsistency**: Fixed top-left (onboarding) vs inline at bottom (waitlist) vs inline at top (verification)
2. **Step 0 behavior differs**: `router.back()` vs `router.push('/')` - unpredictable for users
3. **Visual location varies**: Users don't know where to look for back navigation

### 1.2 Step Transition Animation Inconsistencies

| Screen | Animation | Duration |
|--------|-----------|----------|
| **Onboarding** | Fade + translate-y with `isTransitioning` state | 250-500ms |
| **Auth VerificationStep** | `slide-in-from-bottom-2 fade-in-0` | 300ms |
| **Auth EmailStep** | No transition animation | - |
| **Waitlist** | No transition animation | - |

### 1.3 API & Data Handling Issues

1. **Waitlist page has 8 separate useEffect hooks** for sessionStorage persistence (lines 146-231)
   - Each field has its own effect, causing unnecessary re-renders
   - Should consolidate into single debounced effect

2. **Waitlist GET endpoint makes sequential queries** (`route.ts:131-146`)
   - Query 1: `SELECT ... FROM waitlist_entries WHERE email = ?`
   - Query 2: `SELECT ... FROM waitlist_invites WHERE waitlistEntryId = ?`
   - Should combine with JOIN for better performance

3. **Handle validation cache is ephemeral** (`useHandleApiValidation.ts`)
   - Cache only persists during component lifetime
   - Not shared across navigations or components
   - Could use sessionStorage for persistence

### 1.4 Analytics Gaps

1. **Missing waitlist journey events:**
   - No tracking when user is redirected to claim page (invited status)
   - No tracking when user is redirected to dashboard (claimed status)
   - No step progression tracking

2. **Auth flow missing journey tracking:**
   - Sign-in/sign-up don't use UserJourneyTracker
   - No step timing metrics like onboarding has

3. **Onboarding analytics good but redundant:**
   - Both `track()` calls AND custom DOM events dispatched
   - UserJourneyTracker fires both analytics.track and CustomEvents

---

## 2. Proposed Solutions

### 2.1 Standardize Back Button Behavior

**Recommendation:** Adopt a consistent pattern across all auth screens.

**Proposed Standard:**
- **Position**: Fixed top-left for multi-step flows (using AuthBackButton default)
- **Step 0 behavior**: Always navigate to a predictable destination (e.g., `/signin` for logged-out flows, `/` for logged-in flows)
- **Inner steps**: Use `goToPreviousStep()` consistently

**Files to modify:**
- `apps/web/components/auth/forms/EmailStep.tsx` - Move back button to parent, use fixed positioning
- `apps/web/components/auth/forms/VerificationStep.tsx` - Remove inline back button, use fixed positioning from parent
- `apps/web/components/auth/forms/SignInForm.tsx` - Add AuthBackButton at top level
- `apps/web/components/auth/forms/SignUpForm.tsx` - Add AuthBackButton at top level
- `apps/web/app/waitlist/page.tsx` - Move back button outside form, use fixed positioning
- `apps/web/components/dashboard/organisms/AppleStyleOnboardingForm.tsx` - Change step 0 to use `/signin` instead of `router.back()`

### 2.2 Standardize Step Transitions

**Recommendation:** Create a shared step transition component/hook.

**Proposed Standard:**
- Use consistent fade + slide animation (300ms)
- Apply to all step-based flows
- Create reusable `useStepTransition` hook or `StepTransition` wrapper component

**Files to create/modify:**
- Create `apps/web/components/auth/atoms/StepTransition.tsx` - Reusable transition wrapper
- Update all step components to use the shared transition

### 2.3 Consolidate Waitlist SessionStorage Logic

**Current:** 8 separate useEffect hooks for persistence

**Proposed:** Single consolidated effect with debouncing

```tsx
// Before: 8 separate effects
useEffect(() => { /* persist step */ }, [step]);
useEffect(() => { /* persist primaryGoal */ }, [primaryGoal]);
// ... 6 more

// After: Single consolidated effect
useEffect(() => {
  const timeoutId = setTimeout(() => {
    persistFormState({ step, primaryGoal, socialPlatform, ... });
  }, 300); // Debounce
  return () => clearTimeout(timeoutId);
}, [step, primaryGoal, socialPlatform, primarySocialUrl, spotifyUrl, heardAbout]);
```

**Files to modify:**
- `apps/web/app/waitlist/page.tsx`

### 2.4 Add Missing Analytics Events

**Waitlist Events to Add:**
```typescript
// When checking existing status
track('waitlist_status_checked', { status: data.status });

// When redirecting to claim
track('waitlist_invited_redirect', { inviteToken: data.inviteToken });

// When redirecting to dashboard (already claimed)
track('waitlist_claimed_redirect', {});

// Step progression
track('waitlist_step_completed', { step, previousStep });
```

**Auth Flow Events to Add:**
```typescript
// Step transitions
track('auth_step_transition', {
  flow: 'signin' | 'signup',
  fromStep: string,
  toStep: string,
  method: 'email' | 'google' | 'spotify'
});
```

**Files to modify:**
- `apps/web/app/waitlist/page.tsx` - Add analytics events
- `apps/web/hooks/useAuthFlowBase.ts` - Add step transition tracking

### 2.5 Optimize Waitlist API Query

**Current:** Sequential queries in GET endpoint

**Proposed:** Single JOIN query

```sql
SELECT
  we.*,
  wi.token as invite_token
FROM waitlist_entries we
LEFT JOIN waitlist_invites wi ON wi.waitlist_entry_id = we.id
WHERE we.email = ?
```

**Files to modify:**
- `apps/web/app/api/waitlist/route.ts`

---

## 3. Implementation Order

### Phase 1: Back Button Consistency (High Impact, Medium Effort)
1. Update SignInForm/SignUpForm to render AuthBackButton at component level
2. Update EmailStep to accept back button from parent (remove internal button)
3. Update VerificationStep to accept back button from parent (remove internal button)
4. Update Waitlist to use fixed positioning for back button
5. Standardize step 0 behavior across all flows

### Phase 2: Analytics Improvements (Medium Impact, Low Effort)
1. Add waitlist status check and redirect tracking
2. Add auth flow step transition tracking
3. Add waitlist step progression tracking

### Phase 3: Performance Optimizations (Medium Impact, Low Effort)
1. Consolidate waitlist sessionStorage effects
2. Optimize waitlist API with JOIN query

### Phase 4: Step Transitions (Low Impact, Medium Effort)
1. Create shared StepTransition component
2. Apply to auth EmailStep/VerificationStep
3. Apply to waitlist steps

---

## 4. Files Summary

### Files to Modify
| File | Changes |
|------|---------|
| `apps/web/components/auth/forms/SignInForm.tsx` | Add top-level AuthBackButton, track step transitions |
| `apps/web/components/auth/forms/SignUpForm.tsx` | Add top-level AuthBackButton, track step transitions |
| `apps/web/components/auth/forms/EmailStep.tsx` | Remove internal AuthBackButton, add transition |
| `apps/web/components/auth/forms/VerificationStep.tsx` | Remove internal AuthBackButton, use shared transition |
| `apps/web/app/waitlist/page.tsx` | Move back button, consolidate effects, add analytics |
| `apps/web/components/dashboard/organisms/AppleStyleOnboardingForm.tsx` | Standardize step 0 back behavior |
| `apps/web/hooks/useAuthFlowBase.ts` | Add step transition analytics |
| `apps/web/app/api/waitlist/route.ts` | Optimize with JOIN query |

### Files to Create (Optional)
| File | Purpose |
|------|---------|
| `apps/web/components/auth/atoms/StepTransition.tsx` | Reusable step transition wrapper |
| `apps/web/hooks/useStepTransition.ts` | Step transition logic hook |

---

## 5. Testing Checklist

- [ ] Sign-in flow: back button works on all steps
- [ ] Sign-up flow: back button works on all steps
- [ ] Onboarding flow: back button works on all steps
- [ ] Waitlist flow: back button works on all steps
- [ ] Step transitions animate consistently
- [ ] Analytics events fire correctly
- [ ] SessionStorage persists form state correctly
- [ ] API performance improved (check network tab)
- [ ] Mobile: back button accessible with keyboard visible
- [ ] Accessibility: focus management on step transitions

---

## 6. Risk Assessment

| Change | Risk | Mitigation |
|--------|------|------------|
| Back button repositioning | Users may not find new location | Keep fixed top-left (already used by onboarding) |
| Analytics changes | Existing dashboards may break | Additive only, don't remove existing events |
| API optimization | Query behavior change | Test with edge cases (no invite, multiple entries) |
| Transition animations | Performance on low-end devices | Use CSS transforms only (GPU accelerated) |

---

## 7. Questions for Review

1. **Step 0 back behavior**: Should it always go to `/signin` or should logged-in users go to `/`?
2. **Analytics granularity**: Do we need step timing metrics for auth flows like onboarding has?
3. **Waitlist API**: Should we add caching for the status check to prevent repeat calls?
