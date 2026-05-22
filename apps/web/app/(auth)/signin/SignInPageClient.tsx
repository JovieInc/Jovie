'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { SignInTimeoutEscape } from '@/components/molecules/SignInTimeoutEscape';
import { APP_ROUTES } from '@/constants/routes';
import { AuthLayout, AuthRoutePrefetch, AuthShell } from '@/features/auth';
import { buildAuthRouteUrl } from '@/lib/auth/build-auth-route-url';
import {
  buildAuthRouteUrlWithDesktopReturn,
  buildDesktopAuthReturnPath,
  sanitizeDesktopReturnRoute,
} from '@/lib/desktop/auth-return';

/**
 * Shows a banner when the OAuth provider returned an error code.
 * Covers the case where the user clicks "Deny" on the provider consent screen,
 * which returns `?oauth_error=access_denied` on redirect back to /signin. #86
 */
function SignInOauthErrorBanner() {
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

  let message = 'Something went wrong with sign-in. Please try again.';
  if (oauthError === 'access_denied') {
    message = 'Sign-in was cancelled. Try again, or pick a different method.';
  } else if (oauthError === 'account_exists') {
    message =
      'An account with this email already exists. Try signing in with your email instead.';
  }

  return (
    <div
      className='mb-4 rounded-(--linear-radius-sm) border border-destructive/30 bg-destructive/5 px-4 py-3 text-left'
      role='alert'
    >
      <p className='text-sm font-medium text-destructive'>{message}</p>
    </div>
  );
}

/**
 * Sign-in page using the canonical AuthShell (JOV-2064).
 *
 * Both the full-page route and the intercepted modal route render the same
 * AuthShell content model, so the typography, links, and provider list stay
 * in lockstep. Provider buttons are gated by `lib/auth/oauth-providers.ts`.
 */

// Keep this validation lightweight for prefill only; extraction paths use
// stricter domain filtering.
function isValidEmail(value: string): boolean {
  if (value.length === 0 || value.length > 254) return false;

  const atIndex = value.indexOf('@');
  if (atIndex <= 0 || atIndex !== value.lastIndexOf('@')) return false;

  const local = value.slice(0, atIndex);
  const domain = value.slice(atIndex + 1);

  if (local.length > 64 || domain.length < 3) return false;
  if (domain.startsWith('.') || domain.endsWith('.') || !domain.includes('.')) {
    return false;
  }

  for (const char of value) {
    if (char <= ' ') return false;
  }

  for (const char of domain) {
    const isAlphaNumeric =
      (char >= 'a' && char <= 'z') ||
      (char >= 'A' && char <= 'Z') ||
      (char >= '0' && char <= '9');

    if (!(isAlphaNumeric || char === '.' || char === '-')) {
      return false;
    }
  }

  return true;
}

export function SignInPageClient() {
  const searchParams = useSearchParams();
  const email = searchParams.get('email')?.trim() ?? '';
  const resetConfirmed = searchParams.get('reset') === '1';
  const desktopReturnRoute = sanitizeDesktopReturnRoute(
    searchParams.get('desktop_return')
  );
  const signUpUrl = desktopReturnRoute
    ? buildAuthRouteUrlWithDesktopReturn(APP_ROUTES.SIGNUP, searchParams)
    : buildAuthRouteUrl(APP_ROUTES.SIGNUP, searchParams);
  const fallbackRedirectUrl = desktopReturnRoute
    ? buildDesktopAuthReturnPath(desktopReturnRoute)
    : undefined;
  const initialValues = useMemo(
    () => (isValidEmail(email) ? { emailAddress: email } : undefined),
    [email]
  );

  useEffect(() => {
    if (resetConfirmed) {
      toast.success('Session cleared. Please sign in again.', {
        id: 'auth-reset',
      });
    }
  }, [resetConfirmed]);

  return (
    <AuthLayout
      formTitle='Sign in'
      showFormTitle={false}
      showFooterPrompt={false}
      layoutVariant='split'
    >
      <AuthRoutePrefetch href={signUpUrl} />
      <SignInOauthErrorBanner />
      <AuthShell
        mode='sign-in'
        forceOppositeModeHardNavigation
        oppositeModeUrl={desktopReturnRoute ? signUpUrl : undefined}
        fallbackRedirectUrl={fallbackRedirectUrl}
        initialValues={initialValues}
      />
      <SignInTimeoutEscape />
    </AuthLayout>
  );
}
