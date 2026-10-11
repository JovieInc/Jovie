'use client';

import { useEffect } from 'react';
import type { ProfileAlertOptInVariant } from '@/lib/flags/contracts';
import type { ProfilePacAssignment } from '@/lib/flags/profile-pac';

interface AnonCookieBootstrapProps {
  /**
   * Callback invoked once the per-user alertOptInVariant has been resolved
   * server-side (via the jv_aid httpOnly cookie). The ISR page renders with
   * the default 'button' variant; this callback lets interactive descendants
   * react if the user has been assigned a different variant.
   */
  readonly onVariantResolved?: (variant: ProfileAlertOptInVariant) => void;
  readonly onProfilePacResolved?: (assignment: ProfilePacAssignment) => void;
  /**
   * Fires exactly once when per-user assignment resolution settles — whether
   * the fetch succeeded, returned a non-OK response, or failed outright.
   * Surfaces gate interactive fan-capture CTAs on this so the assigned
   * variant is fixed before the control can render or receive clicks.
   */
  readonly onResolved?: () => void;
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
  onProfilePacResolved,
  onResolved,
}: AnonCookieBootstrapProps) {
  useEffect(() => {
    if (!onVariantResolved && !onProfilePacResolved && !onResolved) return;

    void fetch('/api/profile/audience-anon-cookie', {
      method: 'GET',
      credentials: 'same-origin',
    })
      .then(res => (res.ok ? res.json() : null))
      .then(
        (
          data: {
            alertOptInVariant?: ProfileAlertOptInVariant;
            profilePac?: ProfilePacAssignment;
          } | null
        ) => {
          if (data?.alertOptInVariant) {
            onVariantResolved?.(data.alertOptInVariant);
          }
          if (data?.profilePac) {
            onProfilePacResolved?.(data.profilePac);
          }
        }
      )
      .catch(() => {
        // Best-effort: analytics and the default CTA variant are unaffected.
      })
      .finally(() => {
        // Resolution settled — the effective variant is final even when the
        // fetch failed and the ISR default remains in force.
        onResolved?.();
      });
  }, [onProfilePacResolved, onResolved, onVariantResolved]);

  return null;
}
