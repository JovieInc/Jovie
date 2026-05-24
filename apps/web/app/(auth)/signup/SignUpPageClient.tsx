'use client';

import { Skeleton } from '@jovie/ui';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import { AuthLayout, AuthRoutePrefetch, AuthShell } from '@/features/auth';
import { track } from '@/lib/analytics';
import { buildAuthRouteUrl } from '@/lib/auth/build-auth-route-url';
import { getCentralAuthCallbackPath } from '@/lib/auth/central-auth-routing';
import { setPlanIntent, validatePlan } from '@/lib/auth/plan-intent';
import {
  clearSignupClaimValue,
  persistSignupClaimValue,
  SIGNUP_ARTIST_NAME_KEY,
  SIGNUP_SPOTIFY_EXPECTED_KEY,
  SIGNUP_SPOTIFY_URL_KEY,
} from '@/lib/auth/signup-claim-storage';
import {
  buildAuthRouteUrlWithDesktopReturn,
  buildDesktopAuthReturnPath,
  sanitizeDesktopReturnRoute,
} from '@/lib/desktop/auth-return';
import {
  buildAuthRouteUrlWithMobileReturn,
  buildMobileAuthReturnPath,
  sanitizeMobileReturnRoute,
} from '@/lib/mobile/auth-return';

/**
 * Persist pre-signup claim data from the homepage hero into sessionStorage,
 * and display a handle availability banner when a handle param is present.
 */
function SignUpClaimDataPersistence() {
  const searchParams = useSearchParams();
  const handle = searchParams.get('handle');
  const [availability, setAvailability] = useState<
    'checking' | 'available' | 'taken' | 'error' | null
  >(null);

  useEffect(() => {
    const spotifyUrl = searchParams.get('spotify_url');
    const artistName = searchParams.get('artist_name');
    const plan = searchParams.get('plan');

    // Capture plan intent from pricing CTA (e.g., /signup?plan=founding)
    if (plan) {
      const validatedPlan = validatePlan(plan);
      if (validatedPlan) {
        setPlanIntent(validatedPlan);
        let source = 'pricing';
        if (spotifyUrl) source = 'hero_spotify';
        else if (handle) source = 'hero_claim';
        track('plan_intent_captured', { plan: validatedPlan, source });
      }
    }

    try {
      const now = Date.now();

      clearSignupClaimValue(SIGNUP_SPOTIFY_URL_KEY);
      clearSignupClaimValue(SIGNUP_ARTIST_NAME_KEY);
      clearSignupClaimValue(SIGNUP_SPOTIFY_EXPECTED_KEY);

      if (spotifyUrl) {
        persistSignupClaimValue(SIGNUP_SPOTIFY_URL_KEY, spotifyUrl, now);
        persistSignupClaimValue(SIGNUP_SPOTIFY_EXPECTED_KEY, 'true', now);
      }
      if (artistName) {
        persistSignupClaimValue(SIGNUP_ARTIST_NAME_KEY, artistName, now);
      }
    } catch {
      // sessionStorage may be unavailable (incognito quota, etc.)
    }
  }, [searchParams, handle]);

  useEffect(() => {
    if (!handle || handle.length < 3) return;

    setAvailability('checking');

    const controller = new AbortController();
    fetch(
      `/api/handle/check?handle=${encodeURIComponent(handle.toLowerCase())}`,
      { signal: controller.signal }
    )
      .then(res => res.json())
      .then(data => {
        setAvailability(data.available ? 'available' : 'taken');
      })
      .catch((err: unknown) => {
        // Aborts from cleanup are expected control flow, not errors
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setAvailability('error');
      });

    return () => controller.abort();
  }, [handle]);

  const normalizedHandle = useMemo(() => handle?.toLowerCase() ?? '', [handle]);

  if (!handle || !availability) return null;

  return (
    <output
      className='mb-4 block rounded-(--linear-radius-sm) border border-subtle bg-surface-1 px-4 py-3 text-center lg:text-left'
      aria-live='polite'
    >
      {availability === 'checking' && (
        <div className='flex items-center justify-center lg:justify-start'>
          <Skeleton className='h-5 w-64 rounded' />
          <span className='sr-only'>
            Checking if @{normalizedHandle} is available...
          </span>
        </div>
      )}
      {availability === 'available' && (
        <p className='text-app font-book text-primary-token'>
          @{normalizedHandle} is available. Sign up to claim it.
        </p>
      )}
      {availability === 'taken' && (
        <p className='text-app font-book text-secondary-token'>
          @{normalizedHandle} is already taken. You can pick another handle
          after signing up.
        </p>
      )}
      {availability === 'error' && (
        <p className='text-app font-book text-secondary-token'>
          Couldn&apos;t check if @{normalizedHandle} is available. You can still
          sign up and choose a handle.
        </p>
      )}
    </output>
  );
}

function SignUpOauthErrorBanner({
  signInUrl,
}: Readonly<{
  signInUrl: string;
}>) {
  const searchParams = useSearchParams();
  const oauthError = searchParams.get('oauth_error');
  // Used to personalise the account_exists message when the conflicting
  // address is known (e.g. forwarded by SsoCallbackHandler). React escapes
  // all text content so no additional XSS sanitisation is required. #26
  const conflictingEmail = searchParams.get('email')?.trim() ?? '';

  useEffect(() => {
    if (!oauthError) return;

    const url = new URL(globalThis.location.href);
    url.searchParams.delete('oauth_error');
    globalThis.history.replaceState(
      globalThis.history.state,
      '',
      `${url.pathname}${url.search}${url.hash}`
    );
  }, [oauthError]);

  if (!oauthError) return null;

  const isAccountExists = oauthError === 'account_exists';

  let message: ReactNode =
    'Something went wrong with sign-up. Please try again.';
  if (isAccountExists) {
    message = conflictingEmail ? (
      <>
        An account for <strong>{conflictingEmail}</strong> already exists. Try
        signing in instead.
      </>
    ) : (
      'An account with this email already exists. Try signing in instead.'
    );
  } else if (oauthError === 'access_denied') {
    message = 'Sign-in was cancelled. Try again, or pick a different method.';
  }

  return (
    <div
      className='mb-4 rounded-(--linear-radius-sm) border border-destructive/30 bg-destructive/5 px-4 py-3 text-left'
      role='alert'
    >
      <p className='text-sm font-medium text-destructive'>{message}</p>
      {isAccountExists ? (
        <p className='mt-2 text-sm text-secondary-token'>
          <Link
            href={signInUrl}
            className='text-primary-token underline focus-ring-themed rounded-md'
          >
            Sign in instead
          </Link>
        </p>
      ) : null}
    </div>
  );
}

/**
 * Sign-up page using the canonical AuthShell (JOV-2064).
 *
 * The page and the intercepted modal route at `/@auth/(.)signup` render the
 * same AuthShell, so copy, links, and provider list cannot drift. Provider
 * buttons are gated by `lib/auth/oauth-providers.ts` - Apple stays hidden
 * until its env flag is set (JOV-2062).
 */
export function SignUpPageClient() {
  const searchParams = useSearchParams();
  const desktopReturnRoute = sanitizeDesktopReturnRoute(
    searchParams.get('desktop_return')
  );
  const mobileReturnRoute = sanitizeMobileReturnRoute(
    searchParams.get('mobile_return')
  );
  const signInUrl = mobileReturnRoute
    ? buildAuthRouteUrlWithMobileReturn(APP_ROUTES.SIGNIN, searchParams)
    : desktopReturnRoute
      ? buildAuthRouteUrlWithDesktopReturn(APP_ROUTES.SIGNIN, searchParams)
      : buildAuthRouteUrl(APP_ROUTES.SIGNIN, searchParams);
  const fallbackRedirectUrl = mobileReturnRoute
    ? buildMobileAuthReturnPath(mobileReturnRoute)
    : desktopReturnRoute
      ? buildDesktopAuthReturnPath(desktopReturnRoute)
      : (getCentralAuthCallbackPath(searchParams) ?? undefined);

  return (
    <AuthLayout
      formTitle='Request access'
      showFormTitle={false}
      showFooterPrompt={false}
      layoutVariant='split'
    >
      <AuthRoutePrefetch href={signInUrl} />
      <SignUpOauthErrorBanner signInUrl={signInUrl} />
      <SignUpClaimDataPersistence />
      <AuthShell
        mode='sign-up'
        forceOppositeModeHardNavigation
        oppositeModeUrl={signInUrl}
        fallbackRedirectUrl={fallbackRedirectUrl}
      />
    </AuthLayout>
  );
}
