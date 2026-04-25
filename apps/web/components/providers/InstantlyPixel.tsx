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
  return DENIED_PREFIXES.some(
    prefix => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function InstantlyPixel() {
  const pathname = usePathname();
  const pixelId = publicEnv.NEXT_PUBLIC_INSTANTLY_PIXEL_ID;
  const isPassive = env.IS_TEST || env.IS_E2E;
  const isDenied = isDeniedRoute(pathname);
  const isDemo = isDemoRecordingClient();
  const skip = !pixelId || isPassive || isDenied || isDemo;

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
