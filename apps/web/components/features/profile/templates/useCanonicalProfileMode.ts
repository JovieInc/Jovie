'use client';

import { useEffect } from 'react';
import type { ProfileMode } from '@/features/profile/contracts';
import { shouldOfferPublicEventsDestination } from '@/features/profile/profile-surface-state';
import { getProfileMode } from '@/features/profile/registry';

/**
 * JOV-14241: a deep link to a mode the profile does not offer (Events with no
 * upcoming shows) lands on Home. One rule for the compact and desktop layouts.
 */
export function canonicalizeUnofferedPublicProfileMode(options: {
  readonly mode: ProfileMode;
  readonly upcomingTourDateCount: number;
}): ProfileMode {
  const { mode, upcomingTourDateCount } = options;
  return mode === 'tour' &&
    !shouldOfferPublicEventsDestination(upcomingTourDateCount)
    ? 'profile'
    : mode;
}

/**
 * Rewrites the landed `?mode=` entry in place (history replace, so Back does
 * not bounce) keeping every other query param such as `source`, then moves
 * the requested mode to the canonical one.
 */
export function useCanonicalProfileMode(
  requestedMode: ProfileMode,
  setRequestedMode: (mode: ProfileMode) => void,
  upcomingTourDateCount: number
): void {
  useEffect(() => {
    const mode = canonicalizeUnofferedPublicProfileMode({
      mode: requestedMode,
      upcomingTourDateCount,
    });
    if (mode === requestedMode) return;
    const url = new URL(globalThis.location.href);
    if (url.searchParams.has('mode')) {
      url.searchParams.delete('mode');
      globalThis.history.replaceState(
        globalThis.history.state,
        '',
        `${url.pathname}${url.search}${url.hash}`
      );
    }
    setRequestedMode(mode);
  }, [requestedMode, setRequestedMode, upcomingTourDateCount]);
}

/** Current `?mode=` of the document, or Home when absent. */
export function getModeFromUrl(): ProfileMode {
  if (globalThis.window === undefined) {
    return 'profile';
  }

  const modeParam = new URLSearchParams(globalThis.location.search).get('mode');
  return modeParam === null ? 'profile' : getProfileMode(modeParam);
}
