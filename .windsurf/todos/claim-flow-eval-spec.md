# Claim Flow Evaluation Specification

## Overview
The claim flow allows unclaimed creator profiles (ingested from Linktree/Beacons) to be claimed by their rightful owners. This document defines what constitutes a complete, working claim flow.

## User Journey

### 1. Discovery Phase
**Entry Points:**
- Direct link to unclaimed profile: `/{username}`
- Claim link shared by admin: `/claim/{token}`
- Marketing email with claim link

### 2. Profile View with Claim Banner
**Requirements:**
- [x] Unclaimed profiles display a prominent claim banner at the top
- [x] Banner text: "Is this your profile? Claim it now"
- [x] Banner includes a CTA button: "Claim Profile"
- [x] Banner is NOT shown for:
  - Already claimed profiles (`is_claimed === true`)
  - Profiles with no claim token
  - Expired claim tokens
- [x] Banner is visually distinct but not intrusive
- [x] Banner is accessible (proper ARIA labels, keyboard navigation)

### 3. Claim Initiation
**When user clicks "Claim Profile":**
- [x] If NOT signed in → redirect to `/signup?redirect_url=/claim/{token}`
- [x] If signed in → redirect directly to `/claim/{token}`
- [x] Claim token is passed through the auth flow

### 4. Signup/Signin Flow
**Requirements:**
- [x] `redirect_url` query param is preserved through Clerk auth
- [x] After successful signup/signin, user is redirected to `/claim/{token}`
- [x] No loss of claim context during auth flow

### 5. Claim Execution (`/claim/[token]`)
**Requirements:**
- [x] Validates claim token exists and is not expired
- [x] Checks user doesn't already own a claimed profile (1:1 policy)
- [x] Atomic update prevents race conditions (double-claim)
- [x] On success:
  - Profile `is_claimed` set to `true`
  - Profile `user_id` set to claiming user
  - `claim_token` cleared
  - `claimed_at` timestamp set
  - Audit fields populated (IP, user agent)
- [x] Redirects to onboarding if `onboarding_completed_at` is null
- [x] Redirects to dashboard if onboarding already complete

### 6. Post-Claim State
**Requirements:**
- [x] Profile no longer shows claim banner
- [x] User can access dashboard for their profile
- [x] Profile is associated with user's account

## Technical Requirements

### ClaimBanner Component
```typescript
interface ClaimBannerProps {
  claimToken: string;
  profileHandle: string;
}
```
- Renders only for unclaimed profiles with valid tokens
- Handles signed-in vs signed-out states
- Tracks analytics events

### Database Schema (existing)
- `creator_profiles.is_claimed: boolean`
- `creator_profiles.claim_token: text`
- `creator_profiles.claim_token_expires_at: timestamp`
- `creator_profiles.claimed_at: timestamp`
- `creator_profiles.user_id: uuid`

### Security Requirements
- [x] Claim tokens are UUIDs (not guessable)
- [x] Tokens expire after configurable period (default: 30 days)
- [ ] Rate limiting on claim attempts (TODO: implement if needed)
- [x] Audit logging for all claim attempts

## Test Cases

### Unit Tests
1. ClaimBanner renders for unclaimed profile with valid token
2. ClaimBanner does NOT render for claimed profile
3. ClaimBanner does NOT render for expired token
4. ClaimBanner generates correct signup URL with redirect
5. ClaimBanner generates correct claim URL for signed-in user

### Integration Tests
1. Full claim flow: view profile → click claim → signup → claim executed
2. Claim flow for already signed-in user
3. Expired token rejection
4. Double-claim prevention (race condition)
5. Multi-profile guard (user already has claimed profile)

### E2E Tests
1. Complete claim journey from profile view to dashboard
2. Claim banner visibility on unclaimed vs claimed profiles

## Success Criteria
- [x] All unit tests pass (25 claim-specific tests)
- [x] All integration tests pass
- [x] Typecheck passes
- [x] Lint passes
- [ ] Manual verification of claim flow works end-to-end
- [x] No regression in existing profile functionality (866 tests passing)
