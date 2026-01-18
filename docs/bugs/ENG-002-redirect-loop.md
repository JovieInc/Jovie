# ENG-002: Dashboard Onboarding Redirect Loop

**Status:** Fixed
**Priority:** P0
**Fixed in:** 2026-01-18

## Summary

Users completing onboarding were caught in a redirect loop between `/app/dashboard` and `/onboarding`. After submitting the onboarding form, users would be redirected to the dashboard, only to be immediately redirected back to onboarding.

## Reproduction Steps

1. Sign up as a new user via OAuth (Google/Apple)
2. Complete waitlist application
3. Get approved (admin action)
4. Log in and start onboarding flow at `/onboarding`
5. Submit onboarding form with username and display name
6. Observe redirect to `/app/dashboard`
7. **Bug**: User is immediately redirected back to `/onboarding`
8. Loop continues until page is manually refreshed or cache expires

## Root Cause

Race condition between transaction commit and proxy database read:

1. User completes onboarding → `completeOnboarding()` sets `isClaimed=true`, `onboardingCompletedAt`
2. Transaction commits successfully
3. Server action calls `revalidatePath('/app', 'layout')` and `redirect('/app/dashboard')`
4. Browser navigates to `/app/dashboard`
5. Proxy middleware queries `getUserState()` to check onboarding status
6. **Race**: Proxy's database query may see stale data (transaction not yet visible)
7. Proxy sees `needsOnboarding=true` → rewrites to `/onboarding`
8. Loop continues

The issue occurred because:
- PostgreSQL transaction isolation means the committed data may not be immediately visible to other connections
- Connection pooling might return a connection that hasn't seen the commit
- `revalidatePath()` only clears Next.js cache, not the proxy's direct database query

## Solution

Implemented a short-lived cookie mechanism to bypass the race condition:

### 1. Set completion cookie after onboarding (`app/onboarding/actions.ts`)

```typescript
const cookieStore = await cookies();
cookieStore.set('jovie_onboarding_complete', '1', {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 30, // 30 seconds
  path: '/',
});
```

### 2. Check cookie in proxy before redirect (`proxy.ts`)

```typescript
const onboardingJustCompleted =
  req.cookies.get('jovie_onboarding_complete')?.value === '1';

if (onboardingJustCompleted) {
  // Bypass needsOnboarding check - let user through to dashboard
  res = NextResponse.next({ request: { headers: requestHeaders } });
  res.cookies.delete('jovie_onboarding_complete'); // One-time use
} else {
  // Normal redirect to onboarding
  res = NextResponse.rewrite(new URL('/onboarding', req.url), ...);
}
```

### Why this works

- Cookie is set **before** the redirect, so it's present on the subsequent request
- 30-second expiry is long enough for the database transaction to become visible
- Cookie is deleted after first use, so it doesn't persist beyond its purpose
- This is a defensive measure that doesn't require changes to database behavior

## Files Changed

- `apps/web/app/onboarding/actions.ts` - Added cookie before redirect
- `apps/web/proxy.ts` - Check cookie before onboarding redirect
- `apps/web/tests/e2e/dashboard-landing.spec.ts` - E2E test for regression prevention

## Testing

The fix is covered by:
- `tests/e2e/dashboard-landing.spec.ts` - Verifies no redirect loop occurs
- Manual testing: Complete onboarding flow and verify dashboard access

## Related Issues

- ENG-001: Homepage below-the-fold visibility
- ENG-004: Production env validation

## Lessons Learned

1. Database transaction visibility is not immediate for other connections
2. Middleware that queries the database directly can race with server actions
3. Short-lived cookies are an effective way to pass state between server action and middleware
4. Cache invalidation (`revalidatePath`) only affects Next.js cache, not edge runtime queries
