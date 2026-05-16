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

type ClerkAppearanceElements = Record<string, unknown>;

const REQUIRED_CLERK_AUTH_ELEMENTS = {
  socialButtonsBlockButton: {
    alignItems: 'center',
    display: 'flex',
    justifyContent: 'center',
    overflow: 'visible',
    position: 'relative',
  },
  lastAuthenticationStrategyBadge: {
    alignSelf: 'center',
    justifySelf: 'end',
    pointerEvents: 'none',
    position: 'static',
    transform: 'none',
    whiteSpace: 'nowrap',
  },
} as const satisfies ClerkAppearanceElements;

function mergeRequiredClerkElement(
  baseElement: unknown,
  requiredElement: Readonly<Record<string, unknown>>
) {
  if (
    typeof baseElement === 'object' &&
    baseElement !== null &&
    !Array.isArray(baseElement)
  ) {
    return {
      ...baseElement,
      ...requiredElement,
    };
  }

  return requiredElement;
}

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
   * Marks the intercepted modal surface. AuthShell always renders only the
   * Clerk form plus required sign-up legal terms; modal chrome lives in
   * AuthModalShell.
   */
  readonly compact?: boolean;
  /**
   * Clerk appearance override. Merged with the canonical
   * `buildDisabledOAuthProviderElements()` map and required auth layout guards
   * so disabled providers stay hidden and Clerk's "Last used" badge cannot
   * overlap the provider button row when callers pass their own appearance.
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
 * Provider buttons are gated by `lib/auth/oauth-providers.ts`; otherwise the
 * appearance config hides them. This is the prevention test for JOV-2062
 * (Apple "invalid client" in production).
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
      (appearance?.elements as ClerkAppearanceElements | undefined) ?? {};
    return {
      ...appearance,
      elements: {
        ...baseElements,
        socialButtonsBlockButton: mergeRequiredClerkElement(
          baseElements.socialButtonsBlockButton,
          REQUIRED_CLERK_AUTH_ELEMENTS.socialButtonsBlockButton
        ),
        lastAuthenticationStrategyBadge: mergeRequiredClerkElement(
          baseElements.lastAuthenticationStrategyBadge,
          REQUIRED_CLERK_AUTH_ELEMENTS.lastAuthenticationStrategyBadge
        ),
        ...providerGuard,
      },
    } as Record<string, unknown>;
  }, [appearance]);

  if (!isMounted) {
    return <AuthFormSkeleton />;
  }

  return (
    <div
      ref={containerRef}
      data-auth-shell-mode={mode}
      data-auth-shell-compact={compact ? 'true' : undefined}
    >
      {isSignUp ? (
        <SignUp
          routing='path'
          path='/signup'
          oauthFlow='redirect'
          signInUrl={crossLinkUrl}
          fallbackRedirectUrl={resolvedRedirect}
          appearance={mergedAppearance}
        />
      ) : (
        <SignIn
          routing='path'
          path='/signin'
          oauthFlow='redirect'
          signUpUrl={crossLinkUrl}
          fallbackRedirectUrl={resolvedRedirect}
          appearance={mergedAppearance}
          initialValues={initialValues}
        />
      )}

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
    </div>
  );
}
