'use client';

import { SignUp } from '@clerk/nextjs';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { AuthFormSkeleton } from '@/components/molecules/LoadingSkeleton';
import { APP_ROUTES } from '@/constants/routes';
import { AuthLayout, AuthRoutePrefetch } from '@/features/auth';
import { useNormalizeClerkHomeLink } from '@/features/auth/useNormalizeClerkHomeLink';
import { track } from '@/lib/analytics';
import { buildAuthRouteUrl } from '@/lib/auth/build-auth-route-url';
import { setPlanIntent, validatePlan } from '@/lib/auth/plan-intent';
import {
  clearSignupClaimValue,
  persistSignupClaimValue,
  SIGNUP_ARTIST_NAME_KEY,
  SIGNUP_SPOTIFY_EXPECTED_KEY,
  SIGNUP_SPOTIFY_URL_KEY,
} from '@/lib/auth/signup-claim-storage';
import { trackProductFunnelEvent } from '@/lib/product-funnel/client';

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
      className='mb-4 block rounded-(--linear-radius-sm) border border-subtle bg-surface-1 px-4 py-3 text-center'
      aria-live='polite'
    >
      {availability === 'checking' && (
        <p className='text-[13px] font-[450] text-secondary-token'>
          Checking if @{normalizedHandle} is available...
        </p>
      )}
      {availability === 'available' && (
        <p className='text-[13px] font-[450] text-primary-token'>
          @{normalizedHandle} is available. Sign up to claim it.
        </p>
      )}
      {availability === 'taken' && (
        <p className='text-[13px] font-[450] text-secondary-token'>
          @{normalizedHandle} is already taken. You can pick another handle
          after signing up.
        </p>
      )}
      {availability === 'error' && (
        <p className='text-[13px] font-[450] text-secondary-token'>
          Couldn&apos;t check if @{normalizedHandle} is available. You can still
          sign up and choose a handle.
        </p>
      )}
    </output>
  );
}

function SignUpOauthErrorBanner() {
  const searchParams = useSearchParams();
  const oauthError = searchParams.get('oauth_error');

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
  let message = 'Something went wrong with Google sign-up. Please try again.';
  if (isAccountExists) {
    message =
      'An account with this email already exists. Try signing in instead.';
  } else if (oauthError === 'access_denied') {
    message =
      'Required permissions were not granted. Please try again and accept all permissions.';
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
            href={buildAuthRouteUrl(APP_ROUTES.SIGNIN, searchParams)}
            className='text-primary-token underline focus-ring-themed rounded-md'
          >
            Sign in instead
          </Link>
        </p>
      ) : null}
    </div>
  );
}

function SignUpPageContent() {
  const [isMounted, setIsMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();
  const signInUrl = buildAuthRouteUrl(APP_ROUTES.SIGNIN, searchParams);
  const sourceSurface = searchParams.get('source');

  useNormalizeClerkHomeLink(containerRef);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    const sourceRoute = globalThis.location.pathname;
    const plan = searchParams.get('plan');

    if (!sourceSurface) {
      trackProductFunnelEvent({
        eventType: 'visit',
        sourceSurface: 'signup_page',
        sourceRoute,
        metadata: plan ? { plan } : undefined,
      });
    }

    trackProductFunnelEvent({
      eventType: 'signup_started',
      sourceSurface: sourceSurface ?? 'signup_page',
      sourceRoute,
      metadata: plan ? { plan } : undefined,
    });
  }, [searchParams, sourceSurface]);

  if (!isMounted) {
    return <AuthFormSkeleton />;
  }

  return (
    <>
      <AuthRoutePrefetch href={APP_ROUTES.SIGNIN} />
      <SignUpClaimDataPersistence />
      <SignUpOauthErrorBanner />
      <div ref={containerRef}>
        <SignUp
          routing='hash'
          oauthFlow='redirect'
          signInUrl={signInUrl}
          fallbackRedirectUrl={APP_ROUTES.ONBOARDING}
        />
      </div>
      <p className='mt-4 text-center text-[11px] leading-relaxed text-white/80'>
        By signing up, you agree to our{' '}
        <Link
          href={APP_ROUTES.LEGAL_TERMS}
          className='focus-ring-themed rounded-md py-1 text-white underline underline-offset-2 transition-colors hover:text-white'
        >
          Terms of Service
        </Link>{' '}
        and{' '}
        <Link
          href={APP_ROUTES.LEGAL_PRIVACY}
          className='focus-ring-themed rounded-md py-1 text-white underline underline-offset-2 transition-colors hover:text-white'
        >
          Privacy Policy
        </Link>
        .
      </p>
    </>
  );
}

/**
 * Sign-up page using Clerk's prebuilt components for reliability.
 */
export default function SignUpPage() {
  return (
    <AuthLayout
      formTitle='Create your account'
      showFormTitle={false}
      showFooterPrompt={false}
    >
      <Suspense fallback={<AuthFormSkeleton />}>
        <SignUpPageContent />
      </Suspense>
    </AuthLayout>
  );
}
