# Pre-Launch Critical Issues for Linear

> Copy each issue below into Linear. Priority labels: `P0` = Launch Blocker, `P1` = Critical, `P2` = High

---

## Issue 1: Waitlist Email Notifications Never Sent

**Priority:** P0 - Launch Blocker
**Labels:** `bug`, `waitlist`, `email`
**Estimate:** 3 points

### Description
Users approved for the waitlist never receive email notifications. The email builder function exists but is never called anywhere in the codebase.

### Technical Details
- `buildWaitlistInviteEmail()` in `/apps/web/lib/waitlist/invite.ts` is defined but never imported/called
- `/apps/web/app/app/admin/waitlist/approve/route.ts` approves users but sends no email
- No cron job exists to process pending invites

### Affected Files
- `apps/web/lib/waitlist/invite.ts`
- `apps/web/app/app/admin/waitlist/approve/route.ts`

### Acceptance Criteria
- [ ] When admin approves a waitlist entry, user receives email notification
- [ ] Email contains personalized claim link with token
- [ ] Email delivery is tracked/logged
- [ ] Failed emails are retried or flagged for admin review

---

## Issue 2: Waitlist Approval Frontend/Backend Status Mismatch

**Priority:** P0 - Launch Blocker
**Labels:** `bug`, `waitlist`, `admin`
**Estimate:** 1 point

### Description
Frontend expects status `'invited'` after approval but backend returns `'claimed'`. This breaks the admin UI's ability to show correct status and invite tokens.

### Technical Details
- Frontend (`useApproveEntry.ts:40`) expects: `status: 'invited'`, `inviteToken: string`
- Backend (`approve/route.ts:120`) returns: `status: 'claimed'`, no `inviteToken`

### Affected Files
- `apps/web/components/admin/waitlist-table/useApproveEntry.ts:40`
- `apps/web/app/app/admin/waitlist/approve/route.ts:120`

### Acceptance Criteria
- [ ] Backend returns `status: 'invited'` after approval (not 'claimed')
- [ ] Backend returns `inviteToken` in response
- [ ] Frontend correctly displays invite status and token
- [ ] Status changes to 'claimed' only after user claims their spot

---

## Issue 3: Missing Waitlist Invite Records & Claim Token Generation

**Priority:** P0 - Launch Blocker
**Labels:** `bug`, `waitlist`, `database`
**Estimate:** 3 points

### Description
The approval endpoint never creates `waitlistInvites` records or generates claim tokens. The `/claim/{token}` route has no data to process.

### Technical Details
- `waitlistInvites` table exists in schema (`lib/db/schema/waitlist.ts`)
- Approval endpoint never inserts into this table
- No `claimToken` is generated (should use `nanoid` or similar)
- Claim page at `/claim/[token]` will always 404

### Affected Files
- `apps/web/lib/db/schema/waitlist.ts`
- `apps/web/app/app/admin/waitlist/approve/route.ts`
- `apps/web/app/claim/[token]/page.tsx`

### Acceptance Criteria
- [ ] Approval creates `waitlistInvites` record with unique `claimToken`
- [ ] Token is cryptographically secure (nanoid or uuid)
- [ ] Token has expiration (e.g., 7 days)
- [ ] `/claim/{token}` page successfully processes valid tokens
- [ ] Expired/invalid tokens show appropriate error

---

## Issue 4: Missing Waitlist Cron Job for Email Delivery

**Priority:** P0 - Launch Blocker
**Labels:** `bug`, `waitlist`, `infrastructure`
**Estimate:** 2 points

### Description
No cron job exists to process and send waitlist invite emails. The validation schema references `/api/cron/waitlist-invites` but the route doesn't exist.

### Technical Details
- Reference in `lib/validation/schemas/admin.ts`
- Missing: `apps/web/app/api/cron/waitlist-invites/route.ts`
- Need Vercel cron or similar to trigger

### Affected Files
- `apps/web/app/api/cron/` (missing route)
- `vercel.json` (may need cron config)

### Acceptance Criteria
- [ ] Cron endpoint created at `/api/cron/waitlist-invites`
- [ ] Cron runs every 5-15 minutes
- [ ] Processes pending invites and sends emails
- [ ] Marks invites as sent after successful delivery
- [ ] Handles rate limiting and retries

---

## Issue 5: Notifications Always Enabled Bug (|| true)

**Priority:** P1 - Critical
**Labels:** `bug`, `profile`, `quick-fix`
**Estimate:** 0.5 points

### Description
Logic error causes notification UI to always appear regardless of feature flags. The `|| true` operator bypasses all conditional checks.

### Technical Details
```typescript
// Current (broken):
const notificationsEnabled =
  forceNotificationsEnabled || true || forceNotifications;

// Should be:
const notificationsEnabled =
  forceNotificationsEnabled || forceNotifications;
```

### Affected Files
- `apps/web/components/organisms/profile-shell/useProfileShell.ts:46`

### Acceptance Criteria
- [ ] Remove `|| true` from the expression
- [ ] Notifications only show when `forceNotificationsEnabled` or `forceNotifications` is true
- [ ] Add unit test to prevent regression

---

## Issue 6: Missing Admin Verification Endpoint

**Priority:** P1 - Critical
**Labels:** `feature`, `admin`, `verification`
**Estimate:** 2 points

### Description
Admins cannot verify creator profiles. The `isVerified` field exists in the database schema but there's no API endpoint to update it.

### Technical Details
- Field exists: `profiles.isVerified` in `lib/db/schema/profiles.ts:53`
- No admin endpoint to toggle verification
- Verification badge displays correctly when field is true

### Affected Files
- `apps/web/lib/db/schema/profiles.ts`
- `apps/web/app/app/admin/` (needs new endpoint)

### Acceptance Criteria
- [ ] Admin API endpoint: `POST /api/admin/verify-profile`
- [ ] Accepts `{ profileId, isVerified: boolean }`
- [ ] Requires admin authentication
- [ ] Audit log entry created on verification change
- [ ] Admin UI button to verify/unverify creators

---

## Issue 7: OG Image is 62-byte Placeholder

**Priority:** P1 - Critical
**Labels:** `bug`, `seo`, `social`
**Estimate:** 1 point

### Description
The default Open Graph image is only 62 bytes - a placeholder that will show broken/empty previews on social media shares.

### Technical Details
- File: `apps/web/public/og/default.png` (62 bytes)
- Should be 1200x630px for optimal social display
- Affects all pages using default OG image

### Affected Files
- `apps/web/public/og/default.png`

### Acceptance Criteria
- [ ] Replace with proper 1200x630px branded image
- [ ] Image file size reasonable (< 500KB, optimized)
- [ ] Test preview on Twitter, Facebook, LinkedIn validators
- [ ] Consider dynamic OG generation for user profiles (future)

---

## Issue 8: Bio Field Missing from Profile Edit UI

**Priority:** P1 - Critical
**Labels:** `bug`, `profile`, `ux`
**Estimate:** 1 point

### Description
Users cannot edit their bio through the settings UI, even though the API supports bio updates. The field is simply not rendered in the form.

### Technical Details
- API supports bio: `apps/web/app/api/dashboard/profile/route.ts`
- UI missing field: `apps/web/components/dashboard/organisms/SettingsProfileSection.tsx`
- Bio displays on public profile but can't be edited

### Affected Files
- `apps/web/components/dashboard/organisms/SettingsProfileSection.tsx`

### Acceptance Criteria
- [ ] Add bio textarea to profile settings form
- [ ] Character limit indicator (e.g., 160 chars for meta description)
- [ ] Save bio via existing API endpoint
- [ ] Show current bio value when editing

---

## Issue 9: Homepage Components Unnecessarily Client-Side

**Priority:** P2 - High
**Labels:** `performance`, `ssr`, `homepage`
**Estimate:** 3 points

### Description
Several homepage sections are marked as `'use client'` but contain no client-side interactivity. This prevents streaming SSR and increases JavaScript bundle size.

### Technical Details
Components that should be server components:
- `components/home/RedesignedHero.tsx`
- `components/home/ProblemSection.tsx`
- `components/home/InsightSection.tsx`
- `components/home/WhatYouGetSection.tsx`

### Affected Files
- `apps/web/components/home/RedesignedHero.tsx`
- `apps/web/components/home/ProblemSection.tsx`
- `apps/web/components/home/InsightSection.tsx`
- `apps/web/components/home/WhatYouGetSection.tsx`

### Acceptance Criteria
- [ ] Remove `'use client'` from static components
- [ ] Extract any interactive parts to separate client components
- [ ] Verify homepage still renders correctly
- [ ] Measure bundle size reduction

---

## Issue 10: Auth Gate Logic Scattered Across Codebase

**Priority:** P2 - High
**Labels:** `tech-debt`, `auth`, `security`
**Estimate:** 3 points

### Description
Waitlist/auth gating logic is duplicated across multiple files instead of using the centralized `gate.ts`. Risk of bypass if one location is updated but others aren't.

### Technical Details
Scattered locations:
- `lib/auth/proxy-state.ts`
- `app/app/layout.tsx`
- `app/onboarding/page.tsx`
- `app/claim/page.tsx`
- `lib/admin/middleware.ts`

Centralized (should use everywhere):
- `lib/auth/gate.ts`

### Affected Files
- Multiple files listed above

### Acceptance Criteria
- [ ] All auth checks use `lib/auth/gate.ts`
- [ ] Remove duplicate gating logic
- [ ] Add tests for gate bypass scenarios
- [ ] Document auth flow in code comments

---

## Issue 11: Script Bundle Near Capacity

**Priority:** P2 - High
**Labels:** `performance`, `bundle-size`
**Estimate:** 2 points

### Description
JavaScript bundle is at 1455KB of 1600KB budget (91% capacity). Limited headroom for new features.

### Technical Details
- Current: 1455KB
- Budget: 1600KB
- Headroom: 145KB (9%)

### Acceptance Criteria
- [ ] Audit bundle with `@next/bundle-analyzer`
- [ ] Identify large dependencies for lazy loading
- [ ] Target < 1300KB (80% of budget)
- [ ] Add bundle size check to CI

---

## Issue 12: Missing E2E Tests for Core Launch Flows

**Priority:** P1 - Critical
**Labels:** `testing`, `e2e`, `quality`
**Estimate:** 5 points

### Description
Critical user flows lack E2E test coverage. Risk of regressions as development continues.

### Missing Test Coverage
1. **Admin UI E2E** - Creator management, user admin, waitlist approval
2. **Profile Editing** - Link editing, bio updates, avatar uploads
3. **Handle Management** - Race conditions, availability checks
4. **Waitlist Full Flow** - Signup -> Approval -> Email -> Claim -> Login
5. **Public Profile** - SSR, social links, subscribe, listen button

### Acceptance Criteria
- [ ] E2E test: Complete waitlist signup to login flow
- [ ] E2E test: Admin approves user and user receives email
- [ ] E2E test: Profile editing (all fields)
- [ ] E2E test: Public profile loads with SSR, all elements visible
- [ ] E2E test: Subscribe flow and listen button appearance
- [ ] All tests pass in CI before merge

---

## Issue 13: No Dynamic OG Images for User Profiles

**Priority:** P2 - High
**Labels:** `feature`, `seo`, `social`
**Estimate:** 3 points

### Description
User profile shares on social media show generic preview instead of personalized image with user's photo, name, and branding.

### Technical Details
- Current: Static default OG image for all profiles
- Desired: Dynamic image with user avatar, display name, verification badge

### Acceptance Criteria
- [ ] Implement `@vercel/og` or similar for dynamic generation
- [ ] Include user avatar, display name, verification badge
- [ ] Cache generated images (1 hour minimum)
- [ ] Fallback to default if generation fails

---

## Issue 14: Avatar URL Fetch Has 10s Timeout

**Priority:** P3 - Medium
**Labels:** `performance`, `profile`
**Estimate:** 1 point

### Description
Profile update fetches avatar URL with 10s timeout, which could slow requests significantly if external service is slow.

### Technical Details
- Location: Profile update API
- Current timeout: 10 seconds
- Impact: Blocking request during avatar validation

### Acceptance Criteria
- [ ] Reduce timeout to 3-5 seconds
- [ ] Make avatar fetch non-blocking (background job)
- [ ] Show placeholder while avatar processes

---

# Summary

| Priority | Count | Issues |
|----------|-------|--------|
| P0 (Blocker) | 4 | #1, #2, #3, #4 |
| P1 (Critical) | 4 | #5, #6, #7, #8, #12 |
| P2 (High) | 4 | #9, #10, #11, #13 |
| P3 (Medium) | 1 | #14 |

**Total Estimate:** ~30 points

**Recommended Sprint 1 (Launch Blockers):** Issues #1-4 (Waitlist flow)
**Recommended Sprint 2 (Critical):** Issues #5-8, #12 (Quick fixes + Tests)
