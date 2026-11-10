'use client';

import { useEffect } from 'react';
import { authClient, isGoogleOneTapConfigured } from '@/lib/auth/client';
import type { AuthShellMode } from './AuthShell';

/**
 * Google One Tap (Clerk → Better Auth migration, client-flip commit ⑦).
 *
 * Plan decision 8 + design row 20: Google One Tap = new component on
 * signin/signup pages only, gated on `NEXT_PUBLIC_GOOGLE_CLIENT_ID` + not
 * electron/native webview. Suppressed while the OTP step is active or a
 * provider is pending. FedCM on, dark theme. Dismissal cooldown = Google
 * default. The second-Google-affordance hierarchy change (One Tap appears
 * above the provider grid) is owned explicitly — intentional.
 *
 * The `oneTapClient` plugin is conditionally mounted in `lib/auth/client.ts`
 * only when `NEXT_PUBLIC_GOOGLE_CLIENT_ID` is set, so mock/DB-less and test
 * environments never load the Google Identity Services script path.
 *
 * Progressive enhancement: if the origin is not authorized for One Tap, GSI
 * silently no-ops and the provider buttons remain (plan error registry:
 * "One Tap silent fallback to buttons"). No layout shift — One Tap renders
 * in its own Google-owned iframe chrome above the form.
 */

interface GoogleOneTapProps {
  readonly mode: AuthShellMode;
  /** Suppress while OTP step active or a provider is pending (audit row 20). */
  readonly suppress: boolean;
  /**
   * Native browser handoff must resume `/auth/callback`, not `/signin`.
   * When omitted, One Tap keeps the mode-local auth entry fallback.
   */
  readonly callbackURL?: string;
  /** True when the shell sits in the sign-in dialog over another page. */
  readonly inDialog?: boolean;
}

/**
 * On a phone, One Tap is a bottom sheet over the form, and the page already
 * shows Continue with Google one tap away. Skip it there so nothing ever sits
 * on top of the email field or Send sign-in code (Tim, 2026-11-08).
 */
export const ONE_TAP_PHONE_QUERY = '(max-width: 599px)';

function isPhoneViewport(): boolean {
  if (typeof globalThis.matchMedia !== 'function') return false;
  return globalThis.matchMedia(ONE_TAP_PHONE_QUERY).matches;
}

/**
 * Without FedCM, One Tap is an iframe GSI appends to the page body. The
 * sign-in dialog renders in the browser's top layer above the body, so that
 * iframe would sit hidden and unclickable behind the dialog's backdrop.
 */
function supportsFedCm(): boolean {
  return (
    typeof globalThis.window !== 'undefined' &&
    'IdentityCredential' in globalThis.window
  );
}

function isNativeWebview(): boolean {
  if (typeof globalThis.navigator === 'undefined') return false;
  const ua = globalThis.navigator.userAgent;
  // Electron: the desktop app's webview includes 'Electron'.
  // iOS in-app browsers: 'CriOS' (Chrome), 'FxiOS' (Firefox), 'GSA' (Google).
  return (
    ua.includes('Electron') ||
    ua.includes('CriOS') ||
    ua.includes('FxiOS') ||
    ua.includes('GSA')
  );
}

function isAutomatedBrowser(): boolean {
  if (
    typeof globalThis.navigator === 'undefined' ||
    typeof globalThis.document === 'undefined'
  ) {
    return false;
  }

  return (
    globalThis.navigator.webdriver ||
    globalThis.document.documentElement.dataset.e2eMode === '1'
  );
}

export function GoogleOneTap({
  mode,
  suppress,
  callbackURL,
  inDialog = false,
}: GoogleOneTapProps) {
  useEffect(() => {
    if (suppress) return;
    if (isNativeWebview()) return;
    if (isPhoneViewport()) return;
    if (inDialog && !supportsFedCm()) return;
    // FedCM reports account-less automation as browser console errors before
    // Better Auth's promise settles. The root layout marks managed no-auth QA
    // as e2e mode because Lighthouse masks navigator.webdriver. Skip the
    // zero-DOM enhancer there while preserving the visible Google OAuth button.
    if (isAutomatedBrowser()) return;
    if (!isGoogleOneTapConfigured()) return;

    // Better Auth's proxy client can expose a callable unknown property even
    // when the plugin is absent. The explicit configuration gate above keeps
    // mock/DB-less builds from calling a server route that was never mounted.
    const oneTap = authClient.oneTap;
    if (!oneTap) return;

    const resolvedCallbackURL =
      callbackURL ?? (mode === 'sign-up' ? '/signup' : '/signin');
    const context = mode === 'sign-up' ? 'signup' : 'signin';

    // `oneTap(opts)` shows the One Tap prompt, resolves on credential
    // selection, rejects on dismissal/cancel. On success Better Auth
    // exchanges the Google ID token server-side and sets the session cookie.
    // `context` controls the Google-facing prompt copy ("Sign up with Google"
    // vs "Sign in with Google").
    oneTap({ callbackURL: resolvedCallbackURL, context }).catch(() => {
      // Silent fallback: dismissal, cooldown, or origin not authorized.
      // The provider buttons remain the primary path. No layout shift.
    });
  }, [callbackURL, inDialog, mode, suppress]);

  // One Tap renders in Google-owned chrome (an iframe positioned by GSI).
  // This component has no DOM footprint of its own — it's a mount trigger.
  return null;
}
