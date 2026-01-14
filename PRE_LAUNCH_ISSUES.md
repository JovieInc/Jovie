# Pre-Launch Critical Issues for Linear

> Copy each issue below into Linear. Priority labels: `P0` = Launch Blocker, `P1` = Critical, `P2` = High

---

## Issue 1: Waitlist Approval Email Never Sent

**Priority:** P0 - Launch Blocker
**Labels:** `bug`, `waitlist`, `email`
**Estimate:** 2 points

### Description
Users approved for the waitlist have no way to know they've been approved. The email builder function exists but is never called. Users would have to randomly try signing in to discover their approval.

### Technical Details
- `buildWaitlistInviteEmail()` in `/apps/web/lib/waitlist/invite.ts` is defined but never called
- Approval endpoint at `/apps/web/app/app/admin/waitlist/approve/route.ts` activates user but sends no notification
- Current flow: Admin approves → User can sign in → But user doesn't know!

### Affected Files
- `apps/web/lib/waitlist/invite.ts` (email builder exists)
- `apps/web/app/app/admin/waitlist/approve/route.ts` (needs to call email)

### Acceptance Criteria
- [ ] When admin approves a waitlist entry, user receives email notification
- [ ] Email tells user they can now sign in
- [ ] Email delivery is logged for debugging

---

## Issue 2: Waitlist Approval Status Mismatch (Frontend/Backend)

**Priority:** P1 - Critical
**Labels:** `bug`, `waitlist`, `admin`
**Estimate:** 1 point

### Description
Frontend optimistically updates status to `'invited'` after approval, but backend actually sets `'claimed'`. This causes the admin UI to show incorrect status.

### Technical Details
- Frontend (`useApproveEntry.ts:40`): `onRowUpdate(entryId, { status: 'invited' })`
- Backend (`approve/route.ts:162`): returns `status: 'claimed'`

### Affected Files
- `apps/web/components/admin/waitlist-table/useApproveEntry.ts:40`

### Acceptance Criteria
- [ ] Frontend updates to `'claimed'` to match backend
- [ ] Admin UI correctly shows "Claimed" status after approval
- [ ] Consider renaming to "Approved" or "Active" for clarity

---

## Issue 3: Notifications Always Enabled Bug (|| true)

**Priority:** P1 - Critical
**Labels:** `bug`, `profile`, `quick-fix`
**Estimate:** 0.5 points

### Description
Logic error causes notification UI to always appear regardless of feature flags. The `|| true` operator bypasses all conditional checks.

### Technical Details
```typescript
// Current (broken) - apps/web/components/organisms/profile-shell/useProfileShell.ts:46
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
- [ ] Notifications only show when explicitly enabled
- [ ] Add unit test to prevent regression

---

## Issue 4: Missing Admin Verification Endpoint

**Priority:** P1 - Critical
**Labels:** `feature`, `admin`, `verification`
**Estimate:** 2 points

### Description
Admins cannot verify creator profiles. The `isVerified` field exists in the database schema but there's no API endpoint to update it.

### Technical Details
- Field exists: `profiles.isVerified` in `lib/db/schema/profiles.ts`
- No admin endpoint to toggle verification
- Verification badge displays correctly when field is true (manually set in DB)

### Affected Files
- `apps/web/app/api/admin/` (needs new endpoint)

### Acceptance Criteria
- [ ] Admin API endpoint: `POST /api/admin/verify-profile`
- [ ] Accepts `{ profileId, isVerified: boolean }`
- [ ] Requires admin authentication
- [ ] Admin UI button to verify/unverify creators

---

## Issue 5: OG Image is 62-byte Placeholder

**Priority:** P1 - Critical
**Labels:** `bug`, `seo`, `social`
**Estimate:** 1 point

### Description
The default Open Graph image is only 62 bytes - a placeholder that will show broken/empty previews on social media shares.

### Technical Details
- File: `apps/web/public/og/default.png` (62 bytes)
- Should be 1200x630px for optimal social display
- Affects homepage and any page using default OG image

### Affected Files
- `apps/web/public/og/default.png`

### Acceptance Criteria
- [ ] Replace with proper 1200x630px branded image
- [ ] Image file size reasonable (< 500KB, optimized)
- [ ] Test preview on Twitter, Facebook, LinkedIn validators

---

## Issue 6: Homepage Components Unnecessarily Client-Side

**Priority:** P2 - High
**Labels:** `performance`, `ssr`, `homepage`
**Estimate:** 2 points

### Description
Homepage sections are marked as `'use client'` but could potentially be server components. This prevents streaming SSR and increases JavaScript bundle size.

### Technical Details
Components marked client:
- `components/home/RedesignedHero.tsx` - only uses LinearButton
- `components/atoms/LinearButton.tsx` - marked client but is just a Link wrapper

Note: LinearButton uses `forwardRef` which may require client, but the basic Link usage doesn't need it.

### Affected Files
- `apps/web/components/home/RedesignedHero.tsx`
- `apps/web/components/atoms/LinearButton.tsx`

### Acceptance Criteria
- [ ] Evaluate if LinearButton can be a server component (Link doesn't need client)
- [ ] If yes, convert hero and other sections to server components
- [ ] Measure bundle size reduction

---

## Issue 7: Missing Admin E2E Tests

**Priority:** P1 - Critical
**Labels:** `testing`, `e2e`, `admin`
**Estimate:** 3 points

### Description
No E2E test coverage for admin functionality. Risk of regressions in critical admin workflows.

### Missing Coverage
- Admin waitlist approval flow
- Admin creator verification
- Admin user management

### Acceptance Criteria
- [ ] E2E test: Admin can view waitlist entries
- [ ] E2E test: Admin can approve waitlist entry
- [ ] E2E test: Admin can verify a creator profile
- [ ] Tests run in CI

---

## Issue 8: Missing Waitlist Full-Flow E2E Test

**Priority:** P1 - Critical
**Labels:** `testing`, `e2e`, `waitlist`
**Estimate:** 2 points

### Description
No end-to-end test covering the complete waitlist flow from signup to login.

### Flow to Test
1. User submits waitlist form
2. Admin approves entry
3. User receives notification (email)
4. User signs in successfully
5. User sees their profile

### Acceptance Criteria
- [ ] E2E test covers full waitlist → approval → login flow
- [ ] Test verifies user status transitions correctly
- [ ] Test runs in CI before merge

---

# Summary

| Priority | Count | Issues |
|----------|-------|--------|
| P0 (Blocker) | 1 | #1 (Email notification) |
| P1 (Critical) | 6 | #2, #3, #4, #5, #7, #8 |
| P2 (High) | 1 | #6 |

**Total Estimate:** ~13.5 points

**Recommended Order:**
1. Issue #1 - Waitlist email (blocks user acquisition)
2. Issue #3 - `|| true` bug (trivial fix)
3. Issue #2 - Status mismatch (quick fix)
4. Issue #5 - OG image (affects social sharing)
5. Issue #4 - Admin verification endpoint
6. Issues #7, #8 - E2E tests
7. Issue #6 - SSR optimization
