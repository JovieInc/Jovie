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

export function GoogleOneTap({ mode, suppress }: GoogleOneTapProps) {
  useEffect(() => {
    if (suppress) return;
    if (isNativeWebview()) return;
    if (!isGoogleOneTapConfigured()) return;

    // Better Auth's proxy client can expose a callable unknown property even
    // when the plugin is absent. The explicit configuration gate above keeps
    // mock/DB-less builds from calling a server route that was never mounted.
    const oneTap = authClient.oneTap;
    if (!oneTap) return;

    const callbackURL = mode === 'sign-up' ? '/signup' : '/signin';
    const context = mode === 'sign-up' ? 'signup' : 'signin';

    // `oneTap(opts)` shows the One Tap prompt, resolves on credential
    // selection, rejects on dismissal/cancel. On success Better Auth
    // exchanges the Google ID token server-side and sets the session cookie.
    // `context` controls the Google-facing prompt copy ("Sign up with Google"
    // vs "Sign in with Google").
    oneTap({ callbackURL, context }).catch(() => {
      // Silent fallback: dismissal, cooldown, or origin not authorized.
      // The provider buttons remain the primary path. No layout shift.
    });
  }, [mode, suppress]);

  // One Tap renders in Google-owned chrome (an iframe positioned by GSI).
  // This component has no DOM footprint of its own — it's a mount trigger.
  return null;
}
