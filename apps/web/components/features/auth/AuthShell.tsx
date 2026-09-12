'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { APP_ROUTES } from '@/constants/routes';
import { AuthProviderButtonSlot } from '@/features/auth/AuthProviderButtons';
import { useAuthSafe } from '@/hooks/useClerkSafe';
import { getClientAuthenticatedAuthEntryRedirect } from '@/lib/auth/access-route-redirect';
import {
  AUTH_TROUBLE_SIGNING_IN_LABEL,
  getAuthShellHeading,
  normalizeAuthClaimHandle,
  resolveAuthShellBackLink,
  resolveAuthShellIntent,
  type AuthShellBackLink,
  type AuthShellIntent,
  type AuthShellMode,
} from '@/lib/auth/auth-shell-intent';
import {
  buildAuthRouteUrl,
  getDefaultSignUpFallbackRedirectUrl,
} from '@/lib/auth/build-auth-route-url';
import { authClient } from '@/lib/auth/client';
import {
  getEnabledAuthOAuthProviders,
  type PrimaryAuthOAuthProvider,
} from '@/lib/auth/oauth-providers';
import { logger } from '@/lib/utils/logger';
import { EmailCodeAuthForm } from './EmailCodeAuthForm';
import { GoogleOneTap } from './GoogleOneTap';

export type { AuthShellIntent, AuthShellMode };

const AUTH_LEGAL_FALLBACK_HREFS = {
  privacy: APP_ROUTES.LEGAL_PRIVACY,
  terms: APP_ROUTES.LEGAL_TERMS,
} as const;

function resolveLegalHref(value: string | undefined, fallback: string) {
  return value?.trim() ? value : fallback;
}

/**
 * Better Auth callback URL — Better Auth completes OAuth at
 * `/api/auth/callback/{provider}` server-side (plan decision 8). The SSO
 * callback pages/handler/routes are deleted; the `errorCallbackURL` is
 * mode-aware so a denied-at-Google lands back on the right auth page with
 * `?error=` for the `SignInOauthErrorBanner` to classify (audit row 19).
 */
function getCallbackUrl(mode: AuthShellMode): string {
  return mode === 'sign-up' ? APP_ROUTES.SIGNUP : APP_ROUTES.SIGNIN;
}

function getErrorCallbackUrl(mode: AuthShellMode, callbackURL: string): string {
  const base = getCallbackUrl(mode);
  const errorUrl = new URL(base, 'https://jov.ie');
  const callback = new URL(callbackURL, 'https://jov.ie');
  if (callback.pathname === '/auth/callback') {
    const state = callback.searchParams.get('state');
    if (state) errorUrl.searchParams.set('auth_state', state);
  }
  errorUrl.searchParams.set('error', 'oauth_failed');
  return errorUrl.pathname + errorUrl.search;
}

function getNewUserCallbackUrl(): string {
  return APP_ROUTES.START;
}

interface AuthShellProps {
  /** Which auth flow to start. */
  readonly mode: AuthShellMode;
  /**
   * Where to navigate after a successful sign-in or sign-up. Defaults match
   * the post-auth routing used elsewhere in the app (dashboard for sign-in,
   * /start for sign-up).
   */
  readonly fallbackRedirectUrl?: string;
  /** Keep public landing surfaces from opening Google-owned prompt chrome. */
  readonly suppressOneTap?: boolean;
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
   * does not mount a second values provider over an existing one.
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
   * source-compatible; the SSO-only shell no longer mounts form fields.
   */
  readonly appearance?: Record<string, unknown>;
  /**
   * Email prefill for the email-code form (e.g. `?email=` deep links).
   */
  readonly initialValues?: { readonly emailAddress?: string };
  /** Claim handle for "Claim @handle". Falls back to `?handle=`. */
  readonly claimHandle?: string;
  /** Quiet unboxed back. Compact/modal callers own their own back. */
  readonly back?: AuthShellBackLink | null;
}

/**
 * Canonical auth surface for Jovie (Clerk → Better Auth migration, client-flip
 * commit ⑦).
 *
 * Renders SSO (Google + Apple via Better Auth) plus the email one-time-code
 * flow and Google One Tap. Email (`emailOtp`) auth is intentionally enabled
 * (founder decision, 2026-06 — supersedes the SSO-only contract from
 * JOV-2446/JOV-2778). Password auth remains intentionally unsupported: the
 * shell owns all visible auth controls and never mounts a password field.
 *
 * Plan design row 22: the skeleton/`clerk.loaded` ready gate is DELETED —
 * the form is live at first paint. `data-auth-shell-ready` is set to `'true'`
 * immediately so E2E/layout-guard selectors keep working (contract pinned,
 * same commit). One Tap is gated on `NEXT_PUBLIC_GOOGLE_CLIENT_ID` and
 * suppressed while the OTP step is active or a provider is pending (audit
 * row 20).
 */
export function AuthShell(props: Readonly<AuthShellProps>) {
  const {
    mode,
    fallbackRedirectUrl,
    suppressOneTap = false,
    oppositeModeUrl,
    forceOppositeModeHardNavigation = false,
    compact = false,
    claimHandle: claimHandleProp,
    back: backProp,
  } = props;
  const searchParams = useSearchParams();
  const { isLoaded: isAuthLoaded, isSignedIn } = useAuthSafe();
  // `useAuthSafe` can resolve a cached Better Auth session synchronously in
  // the browser while SSR has no session. Keep the first client render equal
  // to the server tree, then let the route-level entry guard own the signed-in
  // redirect after hydration.
  const [hasHydrated, setHasHydrated] = useState(false);
  const [pendingProvider, setPendingProvider] =
    useState<PrimaryAuthOAuthProvider | null>(null);
  const oauthAttemptRef = useRef(0);
  const [oauthError, setOauthError] = useState<string | null>(null);
  // OTP step state lifted from EmailCodeAuthForm so One Tap can be suppressed
  // while the code-entry/lockout step is active (plan design row 20).
  const [otpStepActive, setOtpStepActive] = useState(false);

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
  const claimHandle = useMemo(
    () => normalizeAuthClaimHandle(claimHandleProp ?? searchParams.get('handle')),
    [claimHandleProp, searchParams]
  );
  const intent = resolveAuthShellIntent({ mode, claimHandle });
  const back = compact
    ? null
    : (backProp ?? resolveAuthShellBackLink(searchParams));

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  useEffect(() => {
    const restoreAuthActions = (event: PageTransitionEvent) => {
      if (event.persisted) {
        oauthAttemptRef.current += 1;
        setPendingProvider(null);
      }
    };

    globalThis.addEventListener('pageshow', restoreAuthActions);
    return () => globalThis.removeEventListener('pageshow', restoreAuthActions);
  }, []);

  const _redirectSignedInVisitor = useCallback(() => {
    const destination = getClientAuthenticatedAuthEntryRedirect(searchParams);
    globalThis.location?.assign(destination);
  }, [searchParams]);

  const handleProviderSelect = useCallback(
    async (provider: PrimaryAuthOAuthProvider) => {
      // SSR HTML paints enabled-looking buttons before React attaches listeners.
      // Refuse pre-hydration starts so a fast click cannot become a silent no-op
      // (staging OAuth runtime proof / real users on slow first paint).
      if (!hasHydrated || pendingProvider) return;

      const callbackURL = fallbackRedirectUrl ?? getCallbackUrl(mode);
      const errorCallbackURL = getErrorCallbackUrl(mode, callbackURL);
      const newUserCallbackURL = fallbackRedirectUrl ?? getNewUserCallbackUrl();
      const attempt = ++oauthAttemptRef.current;

      setPendingProvider(provider);
      setOauthError(null);

      try {
        // Better Auth `signIn.social({ provider, callbackURL, errorCallbackURL,
        // newUserCallbackURL })` initiates the OAuth redirect. The browser
        // navigates to the provider, then back to `/api/auth/callback/{provider}`
        // server-side, which sets the session cookie and redirects to
        // `callbackURL` (or `newUserCallbackURL` for new users). Plan
        // decision 8. Account linking is enabled for verified google↔apple
        // (server-side, in `socialProviders` config) — audit row 19.
        const result = await authClient.signIn.social({
          provider,
          callbackURL,
          errorCallbackURL,
          newUserCallbackURL,
        });
        // better-auth may resolve with `{ error }` instead of throwing. Surface
        // that the same way as a thrown failure so pending state never sticks
        // with no provider navigation (IdentityPageClient uses the same gate).
        if (result?.error) {
          throw new Error(
            typeof result.error.message === 'string' && result.error.message
              ? result.error.message
              : 'OAuth start failed'
          );
        }
      } catch (error) {
        if (oauthAttemptRef.current !== attempt) return;

        setOauthError(getAuthStartErrorMessage(mode));
        setPendingProvider(null);
        logger.warn(
          'OAuth start failed',
          {
            provider,
            mode,
            error: error instanceof Error ? error.message : String(error),
          },
          'AuthShell'
        );
      }
    },
    [fallbackRedirectUrl, hasHydrated, mode, pendingProvider]
  );

  if (hasHydrated && isAuthLoaded && isSignedIn) {
    return null;
  }

  const hasNoEnabledProviders = enabledOAuthProviders.length === 0;

  // If absolutely no OAuth providers are gated on, the email-code form is
  // still a valid auth path, so we only render the unavailable card when
  // zero providers AND no email form is possible. With zero providers we
  // skip the OAuth grid and lead with the email form.
  // Plan design row 21: the AuthUnavailableCard trigger is retired —
  // there is no Clerk config to be missing. A generic "no providers"
  // state still surfaces when the allowlist is empty.
  if (hasNoEnabledProviders) {
    return (
      <div
        data-auth-shell-mode={mode}
        data-auth-shell-intent={intent}
        data-auth-shell-compact={compact ? 'true' : undefined}
        data-auth-shell-ready='true'
        data-auth-shell-hydrated={hasHydrated ? 'true' : 'false'}
        data-auth-shell-providers='0'
        className='relative min-h-72'
      >
        <AuthOAuthStartSurface
          mode={mode}
          intent={intent}
          claimHandle={claimHandle}
          back={back}
          oppositeModeUrl={crossLinkUrl}
          forceHardNavigation={forceOppositeModeHardNavigation}
          providers={enabledOAuthProviders}
          pendingProvider={pendingProvider}
          interactive={hasHydrated}
          errorMessage={oauthError}
          onProviderSelect={handleProviderSelect}
          redirectUrl={resolvedRedirect}
          initialEmailAddress={props.initialValues?.emailAddress}
          onOtpStepChange={setOtpStepActive}
        />
      </div>
    );
  }

  return (
    <div
      data-auth-shell-mode={mode}
      data-auth-shell-intent={intent}
      data-auth-shell-compact={compact ? 'true' : undefined}
      data-auth-shell-ready='true'
      data-auth-shell-hydrated={hasHydrated ? 'true' : 'false'}
      className='relative min-h-96'
    >
      <GoogleOneTap
        mode={mode}
        suppress={
          suppressOneTap ||
          !hasHydrated ||
          pendingProvider !== null ||
          otpStepActive
        }
        callbackURL={fallbackRedirectUrl}
      />
      <AuthOAuthStartSurface
        mode={mode}
        intent={intent}
        claimHandle={claimHandle}
        back={back}
        oppositeModeUrl={crossLinkUrl}
        forceHardNavigation={forceOppositeModeHardNavigation}
        providers={enabledOAuthProviders}
        pendingProvider={pendingProvider}
        interactive={hasHydrated}
        errorMessage={oauthError}
        onProviderSelect={handleProviderSelect}
        redirectUrl={resolvedRedirect}
        initialEmailAddress={props.initialValues?.emailAddress}
        onOtpStepChange={setOtpStepActive}
      />
    </div>
  );
}

function getAuthStartErrorMessage(mode: AuthShellMode): string {
  return mode === 'sign-up'
    ? 'Could not start sign-up. Please try again.'
    : 'Could not start sign-in. Please try again.';
}

function AuthQuietBackLink({
  href,
  label,
}: Readonly<AuthShellBackLink>) {
  return (
    <Link
      href={href}
      data-auth-shell-back
      className='mb-4 self-start rounded-sm text-sm text-secondary-token underline-offset-2 transition-colors hover:text-primary-token hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus'
    >
      {label}
    </Link>
  );
}

function AuthShellIdentity({
  intent,
  claimHandle,
  back,
}: Readonly<{
  intent: AuthShellIntent;
  claimHandle?: string;
  back: AuthShellBackLink | null;
}>) {
  return (
    <div
      data-auth-shell-identity
      className='mb-6 flex flex-col items-center text-center'
    >
      {back ? <AuthQuietBackLink href={back.href} label={back.label} /> : null}
      <Link
        href={APP_ROUTES.HOME}
        aria-label='Go to homepage'
        className='mb-4 inline-flex rounded-sm text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus'
      >
        <BrandLogo size='chrome' tone='white' aria-hidden />
      </Link>
      <h1 className='text-xl font-semibold leading-tight tracking-tight text-primary-token'>
        {getAuthShellHeading(intent, claimHandle)}
      </h1>
    </div>
  );
}

function AuthOAuthStartSurface({
  mode,
  intent,
  claimHandle,
  back,
  oppositeModeUrl,
  forceHardNavigation,
  providers,
  pendingProvider,
  interactive,
  errorMessage,
  onProviderSelect,
  redirectUrl,
  initialEmailAddress,
  onOtpStepChange,
}: Readonly<{
  mode: AuthShellMode;
  intent: AuthShellIntent;
  claimHandle?: string;
  back: AuthShellBackLink | null;
  oppositeModeUrl: string;
  forceHardNavigation: boolean;
  providers: readonly PrimaryAuthOAuthProvider[];
  pendingProvider: PrimaryAuthOAuthProvider | null;
  /**
   * False until the client hydrates React event handlers. Keeps OAuth buttons
   * disabled on SSR/first paint so a click cannot be a silent no-op.
   */
  interactive: boolean;
  errorMessage: string | null;
  onProviderSelect: (provider: PrimaryAuthOAuthProvider) => void;
  redirectUrl: string;
  initialEmailAddress?: string;
  onOtpStepChange?: (active: boolean) => void;
}>) {
  const hasProviders = providers.length > 0;
  const providersBusy = !interactive || Boolean(pendingProvider);

  return (
    <div data-auth-sso-surface>
      <AuthShellIdentity
        intent={intent}
        claimHandle={claimHandle}
        back={back}
      />

      {hasProviders ? (
        <fieldset
          data-auth-provider-slots
          className='grid grid-cols-1 gap-3'
          aria-busy={providersBusy ? 'true' : undefined}
        >
          <legend className='sr-only'>Social sign-in options</legend>
          {providers.map(provider => (
            <AuthProviderButtonSlot
              key={provider}
              provider={provider}
              disabled={!interactive || Boolean(pendingProvider)}
              pending={interactive && pendingProvider === provider}
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
          onOtpStepChange={onOtpStepChange}
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
    >
      <span className='h-px flex-1 bg-(--linear-border-subtle)' aria-hidden='true' />
      <span className='text-2xs uppercase tracking-wide text-secondary-token'>
        or use email
      </span>
      <span className='h-px flex-1 bg-(--linear-border-subtle)' aria-hidden='true' />
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
  const className =
    'focus-ring-themed rounded-sm text-primary-token underline underline-offset-2';
  const troubleHref = APP_ROUTES.SUPPORT;

  return (
    <div
      data-auth-mode-switch
      className='mt-5 flex flex-col items-center gap-2 text-center text-app text-secondary-token'
    >
      {isSignUp ? (
        <span>
          Have an account?{' '}
          {forceHardNavigation ? (
            <a href={oppositeModeUrl} className={className}>
              Sign in
            </a>
          ) : (
            <Link href={oppositeModeUrl} className={className}>
              Sign in
            </Link>
          )}
        </span>
      ) : null}
      {forceHardNavigation ? (
        <a href={troubleHref} className={className}>
          {AUTH_TROUBLE_SIGNING_IN_LABEL}
        </a>
      ) : (
        <Link href={troubleHref} className={className}>
          {AUTH_TROUBLE_SIGNING_IN_LABEL}
        </Link>
      )}
    </div>
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
      className='mx-auto mt-8 max-w-sm text-center text-2xs leading-5 text-secondary-token'
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
