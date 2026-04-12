'use client';

import { usePathname } from 'next/navigation';
import Script from 'next/script';
import { useEffect, useState } from 'react';
import { isDemoRecordingClient } from '@/lib/demo-recording';
import { env } from '@/lib/env-client';
import { publicEnv } from '@/lib/env-public';
import { isMarketingAllowed } from '@/lib/tracking/consent';

const DENIED_PREFIXES = [
  '/app',
  '/onboarding',
  '/account',
  '/artist-selection',
  '/billing',
  '/sso-callback',
] as const;

function isDeniedRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return DENIED_PREFIXES.some(prefix => pathname.startsWith(prefix));
}

export function InstantlyPixel() {
  const pathname = usePathname();
  const pixelId = publicEnv.NEXT_PUBLIC_INSTANTLY_PIXEL_ID;
  const isPassive = env.IS_TEST || env.IS_E2E;
  const isDenied = isDeniedRoute(pathname);
  const isDemo = isDemoRecordingClient();
  const skip = !pixelId || isPassive || isDenied || isDemo;

  const [allowed, setAllowed] = useState(() => !skip && isMarketingAllowed());

  useEffect(() => {
    if (skip) return;

    // Sync consent state on mount (covers SSR → client transition)
    setAllowed(isMarketingAllowed());

    // Poll for JVConsent global (created by CookieBannerSection after dynamic import)
    let retries = 0;
    const maxRetries = 10;
    let unsubConsent: (() => void) | undefined;
    const pollInterval = setInterval(() => {
      retries++;

      if (globalThis.JVConsent) {
        clearInterval(pollInterval);
        unsubConsent = globalThis.JVConsent.onChange(() => {
          setAllowed(isMarketingAllowed());
        });
        return;
      }

      if (retries >= maxRetries) {
        clearInterval(pollInterval);
      }
    }, 500);

    return () => {
      clearInterval(pollInterval);
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
