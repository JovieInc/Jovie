'use client';

import { usePathname } from 'next/navigation';
import Script from 'next/script';
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

export function InstantlyPixel() {
  const pathname = usePathname();
  const pixelId = publicEnv.NEXT_PUBLIC_INSTANTLY_PIXEL_ID;
  const isPassive = env.IS_TEST || env.IS_E2E;
  const isAllowed = isAllowedRoute(pathname);
  const isDemo = isDemoRecordingClient();
  const skip = !pixelId || isPassive || !isAllowed || isDemo;

  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    if (skip) return;
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
  }, [skip]);

  if (skip || !allowed) return null;

  return (
    <Script
      id='vtag-ai-js'
      src='https://r2.leadsy.ai/tag.js'
      strategy='lazyOnload'
      data-pid={pixelId}
      data-version='062024'
    />
  );
}
