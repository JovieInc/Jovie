'use client';

import { SignIn, SignUp } from '@clerk/nextjs';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import { AuthProviderButtonSlots } from '@/features/auth/AuthProviderButtons';
import { useNormalizeClerkHomeLink } from '@/features/auth/useNormalizeClerkHomeLink';
import { buildAuthRouteUrl } from '@/lib/auth/build-auth-route-url';
import { CLERK_COMPONENT_OPTIONS } from '@/lib/auth/clerk-options';
import {
  buildDisabledOAuthProviderElements,
  getAuthOAuthProviderLabel,
  getEnabledAuthOAuthProviders,
  type PrimaryAuthOAuthProvider,
} from '@/lib/auth/oauth-providers';
import { cn } from '@/lib/utils';

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

// Jovie is SSO-only (JOV-2446). Even if the Clerk dashboard regresses and
// re-enables email/password or email-OTP strategies, every credential surface
// must stay invisible at the rendering layer. The cron at
// `/api/cron/clerk-config-audit` is the primary regression alarm; this map is
// defense in depth so a regression doesn't render a usable credential form
// between the time the dashboard flips and the next cron tick.
const CREDENTIAL_HIDE_ELEMENTS: Record<string, string> = {
  // Row containers (signIn-start and signUp-start)
  formFieldRow__identifier: 'hidden',
  formFieldRow__emailAddress: 'hidden',
  formFieldRow__password: 'hidden',
  // Field wrappers
  formField__identifier: 'hidden',
  formField__emailAddress: 'hidden',
  formField__password: 'hidden',
  // Inputs themselves
  formFieldInput__identifier: 'hidden',
  formFieldInput__emailAddress: 'hidden',
  formFieldInput__password: 'hidden',
  // Labels
  formFieldLabel__identifier: 'hidden',
  formFieldLabel__emailAddress: 'hidden',
  formFieldLabel__password: 'hidden',
  // Username/phone (forbidden in clerk-config-audit; complete defense-in-depth)
  formFieldRow__username: 'hidden',
  formField__username: 'hidden',
  formFieldInput__username: 'hidden',
  formFieldLabel__username: 'hidden',
  formFieldRow__phoneNumber: 'hidden',
  formField__phoneNumber: 'hidden',
  formFieldInput__phoneNumber: 'hidden',
  formFieldLabel__phoneNumber: 'hidden',
  formattedPhoneNumberInput: 'hidden',
  // Verification-step fields (factor-one / verifications routes — only render
  // if Clerk advances past start with email re-enabled; hide pre-emptively).
  formFieldInput__code: 'hidden',
  otpCodeFieldInput: 'hidden',
  formResendCodeLink: 'hidden',
  // Form chrome that only makes sense around a credential form.
  formButtonPrimary: 'hidden',
  dividerRow: 'hidden',
  alternativeMethods: 'hidden',
  alternativeMethodsBlockButton: 'hidden',
};

const AUTH_LEGAL_FALLBACK_HREFS = {
  privacy: '/legal/privacy',
  terms: '/legal/terms',
} as const;

function resolveLegalHref(value: string | undefined, fallback: string) {
  return value?.trim() ? value : fallback;
}

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

function hasEnabledButtonMatching(
  root: HTMLDivElement | null,
  predicate: (text: string) => boolean
) {
  if (!root) return false;

  return Array.from(root.querySelectorAll('button')).some(button => {
    if (button.disabled) return false;

    const text = button.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    return predicate(text);
  });
}

// Provider-only readiness check (JOV-2446). Jovie is SSO-only, so Clerk's
// credential surface should never render. We do NOT fall back to detecting
// `input[type="email"]` like the pre-2446 code did — a regression that
// re-enables credentials must be visible (placeholder stays up), not silently
// accepted.
function hasReadyClerkAuthStart(
  root: HTMLDivElement | null,
  expectedProviderLabels: readonly string[]
) {
  if (!root) return false;

  if (expectedProviderLabels.length > 0) {
    return expectedProviderLabels.some(label =>
      hasEnabledButtonMatching(root, text => text.includes(label))
    );
  }

  return hasEnabledButtonMatching(root, text => /^continue with /i.test(text));
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
   * Full auth pages live under `(auth)/layout.tsx`, while soft navigations to
   * `/signin` and `/signup` can be intercepted by the root `@auth` modal slot.
   * Use a hard same-origin auth navigation on the full pages so the modal slot
   * does not mount a second ClerkProvider over an existing ClerkProvider.
   */
  readonly forceOppositeModeHardNavigation?: boolean;
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
 * Jovie is SSO-only (Google + Apple via Clerk) — see JOV-2446. Email/password
 * is disabled in the Clerk dashboard and additionally hidden via
 * `CREDENTIAL_HIDE_ELEMENTS` as defense in depth. Provider buttons are gated
 * by `lib/auth/oauth-providers.ts` (JOV-2062 prevention).
 *
 * See JOV-2064, JOV-2437, JOV-2446.
 */
export function AuthShell({
  mode,
  fallbackRedirectUrl,
  oppositeModeUrl,
  forceOppositeModeHardNavigation = false,
  compact = false,
  appearance,
  initialValues,
}: Readonly<AuthShellProps>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const clerkSurfaceRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();
  const [isMounted, setIsMounted] = useState(false);
  const [isClerkStartReady, setIsClerkStartReady] = useState(false);

  useNormalizeClerkHomeLink(containerRef);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const isSignUp = mode === 'sign-up';

  // Sign-in cross-link → Need help (/support). Sign-up cross-link → /signin.
  // Pre-JOV-2446 the sign-in side pointed at /waitlist, which was a dead end
  // for returnees who lost their SSO session. With email/password gone, a
  // generic Need help link is the right escape hatch.
  const crossLinkUrl =
    oppositeModeUrl ??
    buildAuthRouteUrl(
      isSignUp ? APP_ROUTES.SIGNIN : APP_ROUTES.SUPPORT,
      searchParams
    );
  const clerkCrossLinkUrl =
    forceOppositeModeHardNavigation &&
    typeof globalThis.location !== 'undefined'
      ? new URL(crossLinkUrl, globalThis.location.origin).toString()
      : crossLinkUrl;

  const defaultRedirect = isSignUp ? APP_ROUTES.WAITLIST : APP_ROUTES.DASHBOARD;
  const resolvedRedirect = fallbackRedirectUrl ?? defaultRedirect;
  const enabledOAuthProviders = useMemo(
    () => getEnabledAuthOAuthProviders(),
    []
  );
  const expectedProviderLabels = useMemo(
    () => enabledOAuthProviders.map(getAuthOAuthProviderLabel),
    [enabledOAuthProviders]
  );

  // Combine caller-supplied Clerk appearance with the provider guard, the
  // credential-hiding map (JOV-2446 defense in depth), and the required
  // layout guards so disabled providers stay hidden, credential rows can
  // never render, and Clerk's "Last used" badge cannot overlap the provider
  // button row when callers pass their own appearance.
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
        footer: 'hidden',
        footerAction: 'hidden',
        ...CREDENTIAL_HIDE_ELEMENTS,
        ...providerGuard,
      },
    } as Record<string, unknown>;
  }, [appearance]);

  useEffect(() => {
    if (!isMounted) return;

    const root = clerkSurfaceRef.current;
    if (!root) return;

    const syncReadyState = () => {
      if (hasReadyClerkAuthStart(root, expectedProviderLabels)) {
        setIsClerkStartReady(true);
      }
    };

    syncReadyState();

    if (hasReadyClerkAuthStart(root, expectedProviderLabels)) {
      return;
    }

    const observer = new MutationObserver(syncReadyState);
    observer.observe(root, {
      attributes: true,
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, [expectedProviderLabels, isMounted]);

  const hasNoEnabledProviders = enabledOAuthProviders.length === 0;
  const showStablePlaceholder = !isMounted || !isClerkStartReady;

  // If absolutely no providers are gated on, render the unavailable card
  // instead of an indefinite placeholder. This prevents the auth surface
  // from looking broken during a provider-wide incident (e.g., both Apple
  // and Google credentials disabled simultaneously).
  if (hasNoEnabledProviders) {
    return (
      <div
        ref={containerRef}
        data-auth-shell-mode={mode}
        data-auth-shell-compact={compact ? 'true' : undefined}
        data-auth-shell-ready='false'
        data-auth-shell-providers='0'
        className='relative min-h-[280px]'
      >
        <AuthProvidersUnavailable mode={mode} />
        <AuthLegalText mode={mode} />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      data-auth-shell-mode={mode}
      data-auth-shell-compact={compact ? 'true' : undefined}
      data-auth-shell-ready={isClerkStartReady ? 'true' : 'false'}
      className='relative min-h-[360px]'
    >
      {showStablePlaceholder ? (
        <AuthStableStartPlaceholder
          mode={mode}
          oppositeModeUrl={crossLinkUrl}
          forceHardNavigation={forceOppositeModeHardNavigation}
          providers={enabledOAuthProviders}
        />
      ) : null}

      <div
        ref={clerkSurfaceRef}
        data-auth-clerk-surface
        aria-hidden={showStablePlaceholder ? 'true' : undefined}
        className={cn(
          showStablePlaceholder &&
            'pointer-events-none absolute inset-x-0 top-0 opacity-0'
        )}
      >
        {isMounted ? (
          isSignUp ? (
            <SignUp
              routing='path'
              path='/signup'
              oauthFlow='redirect'
              signInUrl={clerkCrossLinkUrl}
              fallbackRedirectUrl={resolvedRedirect}
              appearance={mergedAppearance}
              oidcPrompt={CLERK_COMPONENT_OPTIONS.oidcPrompt}
            />
          ) : (
            <SignIn
              routing='path'
              path='/signin'
              oauthFlow='redirect'
              signUpUrl={clerkCrossLinkUrl}
              fallbackRedirectUrl={resolvedRedirect}
              appearance={mergedAppearance}
              initialValues={initialValues}
              oidcPrompt={CLERK_COMPONENT_OPTIONS.oidcPrompt}
            />
          )
        ) : null}
      </div>

      {showStablePlaceholder ? null : (
        <>
          <AuthModeSwitchLink
            mode={mode}
            oppositeModeUrl={crossLinkUrl}
            forceHardNavigation={forceOppositeModeHardNavigation}
          />
          <AuthLegalText mode={mode} />
        </>
      )}
    </div>
  );
}

function AuthStableStartPlaceholder({
  mode,
  oppositeModeUrl,
  forceHardNavigation,
  providers,
}: Readonly<{
  mode: AuthShellMode;
  oppositeModeUrl: string;
  forceHardNavigation: boolean;
  providers: readonly PrimaryAuthOAuthProvider[];
}>) {
  const isSignUp = mode === 'sign-up';

  return (
    <output
      data-auth-stable-placeholder
      data-loading='true'
      className='block animate-pulse'
      aria-label={
        isSignUp ? 'Loading sign-up options' : 'Loading sign-in options'
      }
      aria-busy='true'
    >
      <div className='mb-4 text-center'>
        <p className='text-[clamp(1.5rem,2.6vw,2rem)] font-[680] leading-[1.1] tracking-[-0.025em] text-white'>
          {isSignUp ? 'Request access' : 'Welcome back'}
        </p>
      </div>

      <AuthProviderButtonSlots providers={providers} />

      <AuthModeSwitchLink
        mode={mode}
        oppositeModeUrl={oppositeModeUrl}
        forceHardNavigation={forceHardNavigation}
      />

      <AuthLegalText mode={mode} />
    </output>
  );
}

function AuthProvidersUnavailable({ mode }: Readonly<{ mode: AuthShellMode }>) {
  const isSignUp = mode === 'sign-up';
  return (
    <div
      data-auth-providers-unavailable
      className='mx-auto max-w-[22rem] text-center'
      role='status'
    >
      <p className='text-[clamp(1.25rem,2.2vw,1.625rem)] font-[680] leading-[1.15] tracking-[-0.02em] text-white'>
        {isSignUp
          ? 'Sign-up is temporarily unavailable'
          : 'Sign-in is temporarily unavailable'}
      </p>
      <p className='mt-3 text-[0.9rem] leading-[1.5] text-white/72'>
        Our sign-in providers are offline. Please try again in a few minutes, or{' '}
        <a
          href='mailto:support@jov.ie'
          className='focus-ring-themed rounded-md text-white underline underline-offset-2'
        >
          contact support
        </a>
        .
      </p>
    </div>
  );
}

function AuthModeSwitchLink({
  mode,
  oppositeModeUrl,
  forceHardNavigation,
}: Readonly<{
  mode: AuthShellMode;
  oppositeModeUrl: string;
  forceHardNavigation: boolean;
}>) {
  const isSignUp = mode === 'sign-up';
  // Sign-in side: generic Need help link (no waitlist dead-end for returnees).
  // Sign-up side: still cross-links to /signin for the "have an account" case.
  const prompt = isSignUp ? 'Have an account?' : 'Need help?';
  const label = isSignUp ? 'Sign in' : 'Get help';
  const className =
    'focus-ring-themed rounded-md text-white underline underline-offset-2';

  return (
    <span className='mt-5 block text-center text-[0.9rem] text-white/58'>
      {prompt}{' '}
      {forceHardNavigation ? (
        <a href={oppositeModeUrl} className={className}>
          {label}
        </a>
      ) : (
        <Link href={oppositeModeUrl} className={className}>
          {label}
        </Link>
      )}
    </span>
  );
}

function AuthLegalText({ mode }: Readonly<{ mode: AuthShellMode }>) {
  const termsHref = resolveLegalHref(
    APP_ROUTES.LEGAL_TERMS,
    AUTH_LEGAL_FALLBACK_HREFS.terms
  );
  const privacyHref = resolveLegalHref(
    APP_ROUTES.LEGAL_PRIVACY,
    AUTH_LEGAL_FALLBACK_HREFS.privacy
  );

  return (
    <p
      data-auth-legal-copy
      className='mx-auto mt-4 max-w-[22rem] text-center text-2xs leading-[1.55] text-white/78'
    >
      <span data-auth-legal-prefix className='block'>
        By {mode === 'sign-up' ? 'signing up' : 'continuing'}, you agree to our
      </span>{' '}
      <span data-auth-legal-links className='block whitespace-nowrap'>
        <Link
          href={termsHref}
          className='focus-ring-themed whitespace-nowrap rounded-md py-0.5 text-white underline underline-offset-2 transition-colors hover:text-white'
        >
          Terms of Service
        </Link>{' '}
        and{' '}
        <Link
          href={privacyHref}
          className='focus-ring-themed whitespace-nowrap rounded-md py-0.5 text-white underline underline-offset-2 transition-colors hover:text-white'
        >
          Privacy Policy
        </Link>
        .
      </span>
    </p>
  );
}
