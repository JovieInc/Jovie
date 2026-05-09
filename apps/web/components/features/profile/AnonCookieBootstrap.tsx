'use client';

import { useEffect } from 'react';
import type { ProfileAlertOptInVariant } from '@/lib/flags/contracts';

interface AnonCookieBootstrapProps {
  /**
   * Callback invoked once the per-user alertOptInVariant has been resolved
   * server-side (via the jv_aid httpOnly cookie). The ISR page renders with
   * the default 'button' variant; this callback lets interactive descendants
   * react if the user has been assigned a different variant.
   */
  readonly onVariantResolved?: (variant: ProfileAlertOptInVariant) => void;
}

/**
 * Bootstraps the anonymous visitor identity on the client.
 *
 * The public profile route is ISR-cached (revalidate: 3600), so the RSC
 * cannot read the httpOnly `jv_aid` cookie directly — doing so would force
 * dynamic rendering and defeat ISR. Instead:
 *
 *  1. The RSC renders with the default alertOptInVariant ('button').
 *  2. This client component calls /api/profile/audience-anon-cookie on mount.
 *     The API route reads the httpOnly cookie server-side and returns the
 *     per-user Statsig variant.
 *  3. If the variant differs from the ISR default, onVariantResolved fires.
 *
 * Analytics still work: the jv_aid cookie is set by middleware on every
 * request and is read directly by /api/audience/visit — it does not depend
 * on the RSC reading it.
 */
export function AnonCookieBootstrap({
  onVariantResolved,
}: AnonCookieBootstrapProps) {
  useEffect(() => {
    if (!onVariantResolved) return;

    void fetch('/api/profile/audience-anon-cookie', {
      method: 'GET',
      credentials: 'same-origin',
    })
      .then(res => (res.ok ? res.json() : null))
      .then((data: { alertOptInVariant: ProfileAlertOptInVariant } | null) => {
        if (data?.alertOptInVariant) {
          onVariantResolved(data.alertOptInVariant);
        }
      })
      .catch(() => {
        // Best-effort: analytics and the default CTA variant are unaffected.
      });
  }, [onVariantResolved]);

  return null;
}
