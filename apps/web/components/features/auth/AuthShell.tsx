'use client';

import { SignIn, SignUp } from '@clerk/nextjs';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AuthFormSkeleton } from '@/components/molecules/LoadingSkeleton';
import { APP_ROUTES } from '@/constants/routes';
import { useNormalizeClerkHomeLink } from '@/features/auth/useNormalizeClerkHomeLink';
import { buildAuthRouteUrl } from '@/lib/auth/build-auth-route-url';
import { buildDisabledOAuthProviderElements } from '@/lib/auth/oauth-providers';

export type AuthShellMode = 'sign-in' | 'sign-up';

interface AuthShellProps {
  /** Which Clerk flow to render. */
  readonly mode: AuthShellMode;
  /**
   * Where to send Clerk after a successful sign-in or sign-up. Defaults match
   * the post-auth routing used elsewhere in the app (dashboard for sign-in,
   * waitlist for sign-up).
   */
  readonly fallbackRedirectUrl?: string;
  /**
   * Override the link target for the opposite auth mode. Defaults to the
   * canonical `/signin` / `/signup` route with the current search params
   * preserved so deep links survive the cross-link.
   */
  readonly oppositeModeUrl?: string;
  /**
   * When true, render only the Clerk form — no surrounding headline, terms
   * footer, or sign-in/sign-up cross-link. Used by the modal surface that
   * supplies its own chrome (back button, status row).
   */
  readonly compact?: boolean;
  /**
   * Clerk appearance override. Merged with the canonical
   * `buildDisabledOAuthProviderElements()` map so disabled providers stay
   * hidden even when callers pass their own appearance.
   */
  readonly appearance?: Record<string, unknown>;
  /**
   * Forwarded to Clerk's `initialValues` prop. Used by the sign-in page to
   * prefill the email address from the `?email=` query param. Sign-up flows
   * generally leave this unset.
   */
  readonly initialValues?: { readonly emailAddress?: string };
}

/**
 * Canonical auth surface for Jovie.
 *
 * Renders the Clerk `<SignIn />` or `<SignUp />` flow inside a consistent
 * content frame so the full-page route and the intercepted modal route share
 * the exact same content model, typography, links, and provider list.
 *
 * Provider buttons are gated by `lib/auth/oauth-providers.ts`. A provider can
 * only render when its `NEXT_PUBLIC_CLERK_OAUTH_<PROVIDER>_ENABLED=1` flag is
 * set — otherwise the appearance config hides it. This is the prevention test
 * for JOV-2062 (Apple "invalid client" in production).
 *
 * See JOV-2064.
 */
export function AuthShell({
  mode,
  fallbackRedirectUrl,
  oppositeModeUrl,
  compact = false,
  appearance,
  initialValues,
}: Readonly<AuthShellProps>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();
  const [isMounted, setIsMounted] = useState(false);

  useNormalizeClerkHomeLink(containerRef);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const isSignUp = mode === 'sign-up';

  const crossLinkUrl =
    oppositeModeUrl ??
    buildAuthRouteUrl(
      isSignUp ? APP_ROUTES.SIGNIN : APP_ROUTES.SIGNUP,
      searchParams
    );

  const defaultRedirect = isSignUp ? APP_ROUTES.WAITLIST : APP_ROUTES.DASHBOARD;
  const resolvedRedirect = fallbackRedirectUrl ?? defaultRedirect;

  // Combine caller-supplied Clerk appearance with the provider guard so a
  // disabled OAuth button (e.g. Apple while credentials are invalid) cannot
  // leak through even if the caller forgets the guard.
  const mergedAppearance = useMemo(() => {
    const providerGuard = buildDisabledOAuthProviderElements();
    const baseElements =
      (appearance?.elements as Record<string, string> | undefined) ?? {};
    return {
      ...appearance,
      elements: {
        ...baseElements,
        ...providerGuard,
      },
    } as Record<string, unknown>;
  }, [appearance]);

  const headline = isSignUp ? 'Create your account' : 'Sign in';
  const subhead = isSignUp
    ? 'Start your private launch request.'
    : 'Welcome back to Jovie.';
  const crossLinkPrompt = isSignUp ? 'Have an account?' : "Don't have access?";
  const crossLinkLabel = isSignUp ? 'Sign in' : 'Join the waitlist';

  if (!isMounted) {
    return <AuthFormSkeleton />;
  }

  return (
    <div ref={containerRef} data-auth-shell-mode={mode}>
      {compact ? null : (
        <div className='mb-4 text-center lg:text-left'>
          <h1 className='text-[22px] font-semibold leading-7 text-white'>
            {headline}
          </h1>
          <p className='mt-2 text-[13px] leading-5 text-white/58'>{subhead}</p>
        </div>
      )}

      {isSignUp ? (
        <SignUp
          routing='hash'
          oauthFlow='redirect'
          signInUrl={crossLinkUrl}
          fallbackRedirectUrl={resolvedRedirect}
          appearance={mergedAppearance}
        />
      ) : (
        <SignIn
          routing='hash'
          oauthFlow='redirect'
          signUpUrl={crossLinkUrl}
          fallbackRedirectUrl={resolvedRedirect}
          appearance={mergedAppearance}
          initialValues={initialValues}
        />
      )}

      {compact ? null : (
        <>
          <p className='mt-4 text-center text-app font-normal text-white/58'>
            {crossLinkPrompt}{' '}
            <Link
              href={crossLinkUrl}
              className='focus-ring-themed rounded-md text-white underline'
            >
              {crossLinkLabel}
            </Link>
          </p>
          {isSignUp ? (
            <p className='mt-4 text-center text-2xs leading-relaxed text-white/80'>
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
          ) : null}
        </>
      )}
    </div>
  );
}
