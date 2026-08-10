'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { isDemoRecordingClient } from '@/lib/demo-recording';
import { env } from '@/lib/env-client';
import { publicEnv } from '@/lib/env-public';
import { isMarketingAllowed } from '@/lib/tracking/consent';

// Allowlist approach (fail-closed): the pixel only fires on explicit marketing
// pages. Any route NOT in this list — including future auth-adjacent routes,
// /signin, /signup, /sso-callback, /app/*, /onboarding, etc. — gets NO pixel
// by default. This prevents pre-auth fingerprinting (audit finding #8, P0).
//
// Previous DENY-list omitted /signin and /signup, letting the pixel fire on
// auth surfaces (live-capture: r2.leadsy.ai/tag.js, wvbknd.leadsy.ai POSTs).
// An ALLOW-list is safer: new routes default to excluded; authors must
// explicitly opt a page in rather than remembering to opt it out.
const ALLOWED_PREFIXES = [
  '/', // exact root only — home
  '/about',
  '/pricing',
  '/blog',
  '/changelog',
  '/support',
  '/download',
  '/artist-profiles',
  '/ai',
  '/compare',
  '/alternatives',
] as const;

export type InstantlyRuntimeState =
  | 'suppressed-unconfigured'
  | 'suppressed-passive-runtime'
  | 'suppressed-route'
  | 'suppressed-demo-recording'
  | 'suppressed-no-consent'
  | 'disabled-vendor-runtime-isolation';

function isAllowedRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return ALLOWED_PREFIXES.some(prefix =>
    // For '/' allow exact match only to avoid matching everything.
    // For all other prefixes allow exact + sub-paths.
    prefix === '/'
      ? pathname === '/'
      : pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function resolveInstantlyRuntimeState({
  hasPixelId,
  isPassive,
  isAllowed,
  isDemo,
  hasMarketingConsent,
}: {
  readonly hasPixelId: boolean;
  readonly isPassive: boolean;
  readonly isAllowed: boolean;
  readonly isDemo: boolean;
  readonly hasMarketingConsent: boolean;
}): InstantlyRuntimeState {
  if (!hasPixelId) return 'suppressed-unconfigured';
  if (isPassive) return 'suppressed-passive-runtime';
  if (!isAllowed) return 'suppressed-route';
  if (isDemo) return 'suppressed-demo-recording';
  if (!hasMarketingConsent) return 'suppressed-no-consent';
  return 'disabled-vendor-runtime-isolation';
}

export function InstantlyPixel() {
  const pathname = usePathname();
  const pixelId = publicEnv.NEXT_PUBLIC_INSTANTLY_PIXEL_ID;
  const isPassive = env.IS_TEST || env.IS_E2E;
  const isAllowed = isAllowedRoute(pathname);
  const isDemo = isDemoRecordingClient();
  const skipConsentListener = !pixelId || isPassive || !isAllowed || isDemo;

  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    if (skipConsentListener) return;
    if (globalThis.window === undefined) return;

    // Sync consent state on mount (covers SSR → client transition)
    setAllowed(isMarketingAllowed());

    let unsubConsent: (() => void) | undefined;

    const attach = () => {
      if (!globalThis.JVConsent) return;
      unsubConsent = globalThis.JVConsent.onChange(() => {
        setAllowed(isMarketingAllowed());
      });
    };

    if (globalThis.JVConsent) {
      attach();
      return () => {
        unsubConsent?.();
      };
    }

    const onReady = () => attach();
    globalThis.addEventListener('jvconsent:ready', onReady, { once: true });
    return () => {
      globalThis.removeEventListener('jvconsent:ready', onReady);
      unsubConsent?.();
    };
  }, [skipConsentListener]);

  const runtimeState = resolveInstantlyRuntimeState({
    hasPixelId: Boolean(pixelId),
    isPassive,
    isAllowed,
    isDemo,
    hasMarketingConsent: allowed,
  });

  useEffect(() => {
    const root = globalThis.document?.documentElement;
    if (!root) return;

    root.dataset.instantlyRuntime = runtimeState;
    return () => {
      if (root.dataset.instantlyRuntime === runtimeState) {
        delete root.dataset.instantlyRuntime;
      }
    };
  }, [runtimeState]);

  // Fail closed. The vendor tag executes opaque cross-origin requests that
  // cannot be contained by the app boundary. Keep the consent and route gates
  // above so a future supported server-side integration inherits them, while
  // exposing the bounded state through <html data-instantly-runtime="...">.
  return null;
}
