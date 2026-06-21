'use client';

import { useClerk, useSignIn, useSignUp } from '@clerk/nextjs';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import {
  AuthProviderButtonSlot,
  AuthProviderButtonSlots,
} from '@/features/auth/AuthProviderButtons';
import {
  buildAuthRouteUrl,
  getDefaultSignUpFallbackRedirectUrl,
} from '@/lib/auth/build-auth-route-url';
import { parseClerkError } from '@/lib/auth/clerk-errors';
import { CLERK_COMPONENT_OPTIONS } from '@/lib/auth/clerk-options';
import {
  getEnabledAuthOAuthProviders,
  type PrimaryAuthOAuthProvider,
} from '@/lib/auth/oauth-providers';
import { ClerkCaptchaMount } from './ClerkCaptchaMount';
import { EmailCodeAuthForm } from './EmailCodeAuthForm';

export type AuthShellMode = 'sign-in' | 'sign-up';

const AUTH_LEGAL_FALLBACK_HREFS = {
  privacy: '/legal/privacy',
  terms: '/legal/terms',
} as const;

type PrimaryAuthOAuthStrategy = `oauth_${PrimaryAuthOAuthProvider}`;

function resolveLegalHref(value: string | undefined, fallback: string) {
  return value?.trim() ? value : fallback;
}

function getOAuthStrategy(
  provider: PrimaryAuthOAuthProvider
): PrimaryAuthOAuthStrategy {
  return `oauth_${provider}`;
}

function getSsoCallbackPath(mode: AuthShellMode): string {
  return mode === 'sign-up'
    ? APP_ROUTES.SIGNUP_SSO_CALLBACK
    : APP_ROUTES.SIGNIN_SSO_CALLBACK;
}

function getAuthStartErrorMessage(mode: AuthShellMode): string {
  return mode === 'sign-up'
    ? 'Could not start sign-up. Please try again.'
    : 'Could not start sign-in. Please try again.';
}

interface AuthShellProps {
  /** Which Clerk flow to start. */
  readonly mode: AuthShellMode;
  /**
   * Where to send Clerk after a successful sign-in or sign-up. Defaults match
   * the post-auth routing used elsewhere in the app (dashboard for sign-in,
   * /start for sign-up).
   */
  readonly fallbackRedirectUrl?: string;
  /**
   * Override the link target for the opposite auth mode. Defaults to the
   * canonical `/signin` / `/support` route with the current search params
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
   * SSO start controls plus required sign-up legal terms; modal chrome lives
   * in AuthModalShell.
   */
  readonly compact?: boolean;
  /**
   * Legacy Clerk prebuilt component escape hatch. Kept so older callers remain
   * source-compatible; the SSO-only shell no longer mounts Clerk form fields.
   */
  readonly appearance?: Record<string, unknown>;
  /**
   * Email prefill for the email-code form (e.g. `?email=` deep links).
   */
  readonly initialValues?: { readonly emailAddress?: string };
}

/**
 * Canonical auth surface for Jovie.
 *
 * Renders SSO (Google + Apple via Clerk) plus the email one-time-code flow.
 * Email (`email_code`) auth is intentionally enabled (founder decision,
 * 2026-06) — this supersedes the SSO-only contract from JOV-2446/JOV-2778.
 * Password auth remains intentionally unsupported: the shell owns all
 * visible auth controls and never mounts a password field, even if the
 * Clerk dashboard configuration regresses.
 *
 * See JOV-2064, JOV-2437, JOV-2446, JOV-2778.
 */
export function AuthShell(props: Readonly<AuthShellProps>) {
  const {
    mode,
    fallbackRedirectUrl,
    oppositeModeUrl,
    forceOppositeModeHardNavigation = false,
    compact = false,
  } = props;
  const searchParams = useSearchParams();
  const clerk = useClerk();
  const signInState = useSignIn();
  const signUpState = useSignUp();
  const [isMounted, setIsMounted] = useState(false);
  const [pendingProvider, setPendingProvider] =
    useState<PrimaryAuthOAuthProvider | null>(null);
  const [oauthError, setOauthError] = useState<string | null>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const isSignUp = mode === 'sign-up';
  const crossLinkUrl =
    oppositeModeUrl ??
    buildAuthRouteUrl(
      isSignUp ? APP_ROUTES.SIGNIN : APP_ROUTES.SUPPORT,
      searchParams
    );
  const defaultRedirect = isSignUp
    ? getDefaultSignUpFallbackRedirectUrl()
    : APP_ROUTES.DASHBOARD;
  const resolvedRedirect = fallbackRedirectUrl ?? defaultRedirect;
  const enabledOAuthProviders = useMemo(
    () => getEnabledAuthOAuthProviders(),
    []
  );
  const activeAuthResource = isSignUp ? signUpState.signUp : signInState.signIn;
  const isAuthStartReady =
    isMounted && clerk.loaded && Boolean(activeAuthResource);

  const handleProviderSelect = useCallback(
    async (provider: PrimaryAuthOAuthProvider) => {
      if (!isAuthStartReady || pendingProvider) return;

      const strategy = getOAuthStrategy(provider);
      const redirectParams = {
        oidcPrompt: CLERK_COMPONENT_OPTIONS.oidcPrompt,
        redirectCallbackUrl: getSsoCallbackPath(mode),
        redirectUrl: resolvedRedirect,
        strategy,
      };

      setPendingProvider(provider);
      setOauthError(null);

      try {
        const result = isSignUp
          ? await signUpState.signUp?.sso({
              ...redirectParams,
              legalAccepted: true,
            })
          : await signInState.signIn?.sso(redirectParams);

        if (!result || result.error) {
          throw result?.error ?? new Error('Missing Clerk auth resource');
        }
      } catch (error) {
        setOauthError(
          error && typeof error === 'object' && 'errors' in error
            ? parseClerkError(error)
            : getAuthStartErrorMessage(mode)
        );
        setPendingProvider(null);
      }
    },
    [
      isAuthStartReady,
      isSignUp,
      mode,
      pendingProvider,
      resolvedRedirect,
      signInState.signIn,
      signUpState.signUp,
    ]
  );

  const hasNoEnabledProviders = enabledOAuthProviders.length === 0;
  const showStablePlaceholder = !isAuthStartReady;

  // If absolutely no OAuth providers are gated on, the email-code form is
  // still a valid auth path, so only render the unavailable card when Clerk
  // itself never becomes ready. With zero providers we skip the OAuth grid
  // and lead with the email form.
  if (hasNoEnabledProviders && !isAuthStartReady) {
    return (
      <div
        data-auth-shell-mode={mode}
        data-auth-shell-compact={compact ? 'true' : undefined}
        data-auth-shell-ready='false'
        data-auth-shell-providers='0'
        className='relative min-h-72'
      >
        <ClerkCaptchaMount />
        <AuthProvidersUnavailable mode={mode} />
        <AuthLegalText mode={mode} />
      </div>
    );
  }

  return (
    <div
      data-auth-shell-mode={mode}
      data-auth-shell-compact={compact ? 'true' : undefined}
      data-auth-shell-ready={isAuthStartReady ? 'true' : 'false'}
      className='relative min-h-96'
    >
      <ClerkCaptchaMount />
      {showStablePlaceholder ? (
        <AuthStableStartPlaceholder
          mode={mode}
          oppositeModeUrl={crossLinkUrl}
          forceHardNavigation={forceOppositeModeHardNavigation}
          providers={enabledOAuthProviders}
        />
      ) : (
        <AuthOAuthStartSurface
          mode={mode}
          oppositeModeUrl={crossLinkUrl}
          forceHardNavigation={forceOppositeModeHardNavigation}
          providers={enabledOAuthProviders}
          pendingProvider={pendingProvider}
          errorMessage={oauthError}
          onProviderSelect={handleProviderSelect}
          redirectUrl={resolvedRedirect}
          initialEmailAddress={props.initialValues?.emailAddress}
        />
      )}
    </div>
  );
}

function AuthShellTitle({ mode }: Readonly<{ mode: AuthShellMode }>) {
  const isSignUp = mode === 'sign-up';

  return (
    <div className='mb-4 text-center'>
      <p className='text-2xl font-semibold leading-tight tracking-normal text-primary-token'>
        {isSignUp ? 'Create your account' : 'Welcome back'}
      </p>
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
      <AuthShellTitle mode={mode} />

      <AuthProviderButtonSlots providers={providers} />

      {/* Reserved space for the email-code form (divider + input + button)
          so the placeholder → ready transition does not shift layout. */}
      <div data-auth-email-form-slot aria-hidden='true' className='mt-4'>
        <div className='h-5' />
        <div className='h-11 rounded-(--linear-radius-sm) bg-surface-0' />
        <div className='mt-3 h-11 rounded-(--linear-radius-sm) bg-surface-0' />
      </div>

      <div
        data-auth-oauth-error-slot
        className='mt-3 min-h-5 text-center'
        aria-hidden='true'
      />

      <AuthModeSwitchLink
        mode={mode}
        oppositeModeUrl={oppositeModeUrl}
        forceHardNavigation={forceHardNavigation}
      />

      <AuthLegalText mode={mode} />
    </output>
  );
}

function AuthOAuthStartSurface({
  mode,
  oppositeModeUrl,
  forceHardNavigation,
  providers,
  pendingProvider,
  errorMessage,
  onProviderSelect,
  redirectUrl,
  initialEmailAddress,
}: Readonly<{
  mode: AuthShellMode;
  oppositeModeUrl: string;
  forceHardNavigation: boolean;
  providers: readonly PrimaryAuthOAuthProvider[];
  pendingProvider: PrimaryAuthOAuthProvider | null;
  errorMessage: string | null;
  onProviderSelect: (provider: PrimaryAuthOAuthProvider) => void;
  redirectUrl: string;
  initialEmailAddress?: string;
}>) {
  const hasProviders = providers.length > 0;

  return (
    <div data-auth-sso-surface>
      <AuthShellTitle mode={mode} />

      {hasProviders ? (
        <fieldset
          data-auth-provider-slots
          className='grid grid-cols-1 gap-1.5'
          aria-busy={pendingProvider ? 'true' : undefined}
        >
          <legend className='sr-only'>Social sign-in options</legend>
          {providers.map(provider => (
            <AuthProviderButtonSlot
              key={provider}
              provider={provider}
              disabled={Boolean(pendingProvider)}
              pending={pendingProvider === provider}
              onClick={() => onProviderSelect(provider)}
            />
          ))}
        </fieldset>
      ) : null}

      <div data-auth-email-form-slot className='mt-4'>
        {hasProviders ? <AuthMethodDivider /> : null}
        <EmailCodeAuthForm
          mode={mode}
          redirectUrl={redirectUrl}
          initialEmailAddress={initialEmailAddress}
        />
      </div>

      <div
        data-auth-oauth-error-slot
        className='mt-3 min-h-5 text-center'
        aria-live='polite'
      >
        {errorMessage ? (
          <p
            className='text-caption font-caption text-destructive'
            role='alert'
          >
            {errorMessage}
          </p>
        ) : null}
      </div>

      <AuthModeSwitchLink
        mode={mode}
        oppositeModeUrl={oppositeModeUrl}
        forceHardNavigation={forceHardNavigation}
      />

      <AuthLegalText mode={mode} />
    </div>
  );
}

function AuthMethodDivider() {
  return (
    <div
      data-auth-method-divider
      className='mb-4 flex items-center gap-3'
      aria-hidden='true'
    >
      <span className='h-px flex-1 bg-(--linear-border-subtle)' />
      <span className='text-2xs uppercase tracking-wide text-secondary-token'>
        or
      </span>
      <span className='h-px flex-1 bg-(--linear-border-subtle)' />
    </div>
  );
}

function AuthProvidersUnavailable({ mode }: Readonly<{ mode: AuthShellMode }>) {
  const isSignUp = mode === 'sign-up';
  return (
    <div
      data-auth-providers-unavailable
      className='mx-auto max-w-sm text-center'
      role='status'
    >
      <p className='text-xl font-semibold leading-tight tracking-normal text-primary-token'>
        {isSignUp
          ? 'Sign-up is temporarily unavailable'
          : 'Sign-in is temporarily unavailable'}
      </p>
      <p className='mt-3 text-app leading-5 text-secondary-token'>
        Our sign-in providers are offline. Please try again in a few minutes, or{' '}
        <a
          href='mailto:support@jov.ie'
          className='focus-ring-themed rounded-md text-primary-token underline underline-offset-2'
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
    'focus-ring-themed rounded-md text-primary-token underline underline-offset-2';

  return (
    <span className='mt-5 block text-center text-app text-secondary-token'>
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
      className='mx-auto mt-4 max-w-sm text-center text-2xs leading-5 text-secondary-token'
    >
      <span data-auth-legal-prefix className='block'>
        By {mode === 'sign-up' ? 'signing up' : 'continuing'}, you agree to our
      </span>{' '}
      <span data-auth-legal-links className='block whitespace-nowrap'>
        <Link
          href={termsHref}
          className='focus-ring-themed whitespace-nowrap rounded-md py-0.5 text-primary-token underline underline-offset-2 transition-colors hover:text-primary-token'
        >
          Terms of Service
        </Link>{' '}
        and{' '}
        <Link
          href={privacyHref}
          className='focus-ring-themed whitespace-nowrap rounded-md py-0.5 text-primary-token underline underline-offset-2 transition-colors hover:text-primary-token'
        >
          Privacy Policy
        </Link>
        .
      </span>
    </p>
  );
}
