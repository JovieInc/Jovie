'use client';

import { LoadingSkeleton } from '@jovie/ui';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { AuthenticatedAuthEntryGuard } from '@/components/features/auth/AuthenticatedAuthEntryGuard';
import { APP_ROUTES } from '@/constants/routes';
import {
  AuthLayout,
  AuthOfferSummary,
  AuthRoutePrefetch,
  AuthShell,
} from '@/features/auth';
import { track } from '@/lib/analytics';
import { buildAuthRouteUrl } from '@/lib/auth/build-auth-route-url';
import { getCentralAuthCallbackPath } from '@/lib/auth/central-auth-routing';
import { sanitizeRedirectUrl } from '@/lib/auth/constants';
import {
  parseAuthOfferArtist,
  setPlanIntent,
  validatePlan,
} from '@/lib/auth/plan-intent';
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
import { normalizeHandleCandidate } from '@/lib/onboarding/handle-availability';
import {
  DesktopAuthRouteHandoff,
  useShouldRenderDesktopAuthHandoff,
} from '../DesktopAuthRouteHandoff';

type HandleAvailability = 'checking' | 'available' | 'taken' | 'error';

function readHandleAvailability(
  data: unknown,
  handle: string
): Exclude<HandleAvailability, 'checking'> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return 'error';
  const result = data as Record<string, unknown>;
  if (typeof result.available !== 'boolean') return 'error';
  const availability = result.available ? 'available' : 'taken';
  // Legacy responses may omit metadata; supplied metadata must agree with
  // the definitive result and the handle this request actually checked.
  if (
    (result.reason !== undefined && result.reason !== availability) ||
    (result.error !== undefined && result.error !== '') ||
    (result.handle !== undefined &&
      (typeof result.handle !== 'string' ||
        normalizeHandleCandidate(result.handle) !== handle))
  )
    return 'error';
  return availability;
}

/**
 * Persist pre-signup claim data from the homepage hero into sessionStorage,
 * and display a handle availability banner when a handle param is present.
 */
function SignUpClaimDataPersistence() {
  const searchParams = useSearchParams();
  const handle = searchParams.get('handle');
  const normalizedHandle = useMemo(
    () => normalizeHandleCandidate(handle),
    [handle]
  );
  const [availability, setAvailability] = useState<{
    handle: string;
    status: HandleAvailability;
  } | null>(null);

  useEffect(() => {
    const spotifyUrl = searchParams.get('spotify_url');
    const artistName =
      parseAuthOfferArtist(searchParams.get('artist')) ??
      parseAuthOfferArtist(searchParams.get('artist_name'));
    const plan = searchParams.get('plan');

    // Capture plan intent from pricing CTA (e.g., /signup?plan=founding)
    if (plan) {
      const validatedPlan = validatePlan(plan);
      if (validatedPlan) {
        setPlanIntent(validatedPlan, {
          interval: searchParams.get('interval') ?? searchParams.get('billing'),
          artist: artistName,
        });
        let source = 'pricing';
        if (spotifyUrl) source = 'hero_spotify';
        else if (handle) source = 'hero_claim';
        track('plan_intent_captured', {
          plan: validatedPlan,
          interval: searchParams.get('interval') ?? 'month',
          source,
        });
      }
    }

    try {
      const now = Date.now();

      clearSignupClaimValue(SIGNUP_SPOTIFY_URL_KEY);
      if (
        searchParams.get('artist') !== null ||
        searchParams.get('artist_name') !== null
      )
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
    if (normalizedHandle.length < 3) {
      setAvailability(null);
      return;
    }

    const controller = new AbortController();
    const updateAvailability = (status: HandleAvailability) => {
      if (!controller.signal.aborted) {
        setAvailability({ handle: normalizedHandle, status });
      }
    };
    updateAvailability('checking');
    fetch(`/api/handle/check?handle=${encodeURIComponent(normalizedHandle)}`, {
      signal: controller.signal,
    })
      .then(async response =>
        response.ok
          ? readHandleAvailability(await response.json(), normalizedHandle)
          : 'error'
      )
      .then(updateAvailability)
      .catch(() => updateAvailability('error'));

    return () => controller.abort();
  }, [normalizedHandle]);

  if (normalizedHandle.length < 3) return null;

  const status =
    availability?.handle === normalizedHandle
      ? availability.status
      : 'checking';
  const messages = {
    available: `@${normalizedHandle} is available. Sign up to claim it.`,
    taken: `@${normalizedHandle} is already taken. You can pick another handle after signing up.`,
    error: `Couldn't check if @${normalizedHandle} is available. You can still sign up and choose a handle.`,
  };

  return (
    <div className='mb-4 grid grid-cols-1 wrap-anywhere text-center text-app text-secondary-token'>
      {/* Intrinsic, inaccessible copies reserve the widest/tallest result
          before hydration without adding stale text to the live output. */}
      {Object.entries(messages).map(([state, message]) => (
        <p
          key={state}
          aria-hidden='true'
          className='invisible col-start-1 row-start-1 text-app font-book'
        >
          {message}
        </p>
      ))}
      <output
        className='col-start-1 row-start-1 grid grid-cols-1 items-center text-center text-app text-secondary-token'
        aria-live='polite'
        aria-atomic='true'
        aria-busy={status === 'checking'}
      >
        {status === 'checking' ? (
          <div className='flex items-center justify-center lg:justify-start'>
            <div className='w-44 max-w-full'>
              <LoadingSkeleton height='h-4' announce={false} />
            </div>
            <span className='sr-only'>
              Checking if @{normalizedHandle} is available...
            </span>
          </div>
        ) : (
          <p
            className={`text-app font-book ${status === 'available' ? 'text-primary-token' : 'text-secondary-token'}`}
          >
            {messages[status]}
          </p>
        )}
      </output>
    </div>
  );
}

function SignUpOauthErrorBanner({
  signInUrl,
}: Readonly<{
  signInUrl: string;
}>) {
  const searchParams = useSearchParams();
  // Better Auth appends the provider error after AuthShell's fallback value.
  const oauthError =
    searchParams.getAll('error').filter(Boolean).at(-1) ||
    searchParams.get('oauth_error');
  // Used to personalise the account_exists message when the conflicting
  // address is known (e.g. forwarded by SsoCallbackHandler). React escapes
  // all text content so no additional XSS sanitisation is required. #26
  const conflictingEmail = searchParams.get('email')?.trim() ?? '';

  useEffect(() => {
    if (!oauthError) return;

    const url = new URL(globalThis.location.href);
    url.searchParams.delete('error');
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
      className='mb-4 rounded-sm border border-error/30 bg-error/5 px-4 py-3 text-left'
      role='alert'
    >
      <p className='text-sm font-medium text-error'>{message}</p>
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

function getSignInUrl(
  params: URLSearchParams,
  options: {
    readonly mobileReturnRoute: string | null;
    readonly desktopReturnRoute: string | null;
  }
): string {
  if (options.mobileReturnRoute) {
    return buildAuthRouteUrlWithMobileReturn(APP_ROUTES.SIGNIN, params);
  }

  if (options.desktopReturnRoute) {
    return buildAuthRouteUrlWithDesktopReturn(APP_ROUTES.SIGNIN, params);
  }

  return buildAuthRouteUrl(APP_ROUTES.SIGNIN, params);
}

function getFallbackRedirectUrl(
  params: URLSearchParams,
  options: {
    readonly mobileReturnRoute: string | null;
    readonly desktopReturnRoute: string | null;
  }
): string | undefined {
  if (options.mobileReturnRoute) {
    return buildMobileAuthReturnPath(options.mobileReturnRoute);
  }

  if (options.desktopReturnRoute) {
    return buildDesktopAuthReturnPath(options.desktopReturnRoute);
  }

  return (
    getCentralAuthCallbackPath(params) ??
    sanitizeRedirectUrl(params.get('redirect_url')) ??
    undefined
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
export function SignUpPageClient({
  showOfferSummary = false,
}: Readonly<{
  readonly showOfferSummary?: boolean;
}> = {}) {
  const searchParams = useSearchParams();
  const desktopReturnRoute = sanitizeDesktopReturnRoute(
    searchParams.get('desktop_return')
  );
  const mobileReturnRoute = sanitizeMobileReturnRoute(
    searchParams.get('mobile_return')
  );
  const authReturnRoutes = { mobileReturnRoute, desktopReturnRoute };
  const signInUrl = getSignInUrl(searchParams, authReturnRoutes);
  const fallbackRedirectUrl = getFallbackRedirectUrl(
    searchParams,
    authReturnRoutes
  );
  const shouldRenderDesktopHandoff =
    useShouldRenderDesktopAuthHandoff(searchParams);

  if (shouldRenderDesktopHandoff) {
    return <DesktopAuthRouteHandoff />;
  }

  return (
    <AuthenticatedAuthEntryGuard>
      <AuthLayout
        formTitle='Continue to Jovie'
        showFormTitle={false}
        showFooterPrompt={false}
        layoutVariant='stack'
        contentPlacement='center'
      >
        <AuthRoutePrefetch href={signInUrl} />
        <SignUpOauthErrorBanner signInUrl={signInUrl} />
        <SignUpClaimDataPersistence />
        {showOfferSummary ? <AuthOfferSummary mode='sign-up' enabled /> : null}
        <AuthShell
          mode='sign-up'
          forceOppositeModeHardNavigation
          oppositeModeUrl={signInUrl}
          fallbackRedirectUrl={fallbackRedirectUrl}
        />
      </AuthLayout>
    </AuthenticatedAuthEntryGuard>
  );
}
