'use client';

import { useEffect } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import type { SignupFunnelSurface } from '@/lib/analytics/signup-funnel';
import { trackFunnelStep } from '@/lib/analytics/signup-funnel-client';

const SIGNUP_ENTRY_PATHS: ReadonlySet<string> = new Set([
  APP_ROUTES.SIGNUP,
  APP_ROUTES.START,
  APP_ROUTES.ONBOARDING,
]);

/** True when a link starts the artist signup (or a profile claim). */
export function isSignupEntryHref(href: string, origin: string): boolean {
  try {
    const url = new URL(href, origin);
    if (url.origin !== origin) return false;
    return (
      SIGNUP_ENTRY_PATHS.has(url.pathname) || url.pathname.endsWith('/claim')
    );
  } catch {
    return false;
  }
}

export interface SignupFunnelBeaconProps {
  readonly surface: Extract<SignupFunnelSurface, 'homepage' | 'profile_claim'>;
  /** Count this page as the artist funnel's landing view. */
  readonly trackLanding?: boolean;
}

/**
 * Artist signup funnel entry instrumentation for a static page: one
 * `landing_view` on mount and a `cta_click` for any same-origin link into
 * signup, onboarding, or a profile claim. One delegated listener covers every
 * CTA on the page, so server-rendered CTAs stay server components.
 */
export function SignupFunnelBeacon({
  surface,
  trackLanding = true,
}: SignupFunnelBeaconProps) {
  useEffect(() => {
    if (trackLanding) {
      trackFunnelStep({
        funnel: 'artist_signup',
        step: 'landing_view',
        surface,
      });
    }

    const handleClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest('a[href]');
      const href = anchor?.getAttribute('href');
      if (!href || !isSignupEntryHref(href, globalThis.location.origin)) {
        return;
      }
      trackFunnelStep({ funnel: 'artist_signup', step: 'cta_click', surface });
    };

    document.addEventListener('click', handleClick, { capture: true });
    return () =>
      document.removeEventListener('click', handleClick, { capture: true });
  }, [surface, trackLanding]);

  return null;
}
