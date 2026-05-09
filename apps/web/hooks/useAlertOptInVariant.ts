'use client';

/**
 * Hydrates the alert opt-in CTA experiment variant (button | toggle) client-side.
 *
 * The /{username} profile page is ISR-cached and cannot read the jv_aid cookie
 * during server rendering. This hook reads the cookie after mount, fetches the
 * Statsig-resolved variant from /api/audience/alert-variant, and returns it.
 *
 * Falls back to the server-provided default ('button') if the cookie is absent,
 * if the server already provided a non-default value, or if the fetch fails.
 */

import { useEffect, useState } from 'react';
import type { ProfileAlertOptInVariant } from '@/lib/flags/contracts';

export function useAlertOptInVariant(
  serverVariant: ProfileAlertOptInVariant
): ProfileAlertOptInVariant {
  const [variant, setVariant] =
    useState<ProfileAlertOptInVariant>(serverVariant);

  useEffect(() => {
    // Keep local state aligned when the server-provided default changes (e.g.
    // navigating between profiles in a SPA context without a full remount).
    setVariant(serverVariant);

    // Read the anon stable ID from the cookie set by the audience tracking layer.
    // Use slice to handle cookie values that contain '=' (e.g. base64 padding).
    const stableId =
      document.cookie
        .split('; ')
        .find(row => row.startsWith('jv_aid='))
        ?.slice('jv_aid='.length) ?? null;

    // Skip the fetch if no cookie is present, or if the server already provided
    // a non-default value (e.g. Storybook / dashboard preview).
    if (!stableId || serverVariant !== 'button') return;

    const controller = new AbortController();

    void fetch(
      `/api/audience/alert-variant?stableId=${encodeURIComponent(stableId)}`,
      { cache: 'no-store', signal: controller.signal }
    )
      .then(res => (res.ok ? res.json() : null))
      .then((data: { variant?: ProfileAlertOptInVariant } | null) => {
        if (data?.variant === 'button' || data?.variant === 'toggle') {
          setVariant(data.variant);
        }
      })
      .catch(() => {
        // Network errors and AbortErrors are non-fatal — keep the server variant.
      });

    return () => controller.abort();
  }, [serverVariant]);

  return variant;
}
