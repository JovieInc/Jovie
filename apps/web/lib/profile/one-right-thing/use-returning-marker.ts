'use client';

import { useEffect } from 'react';
import { getConsentState } from '@/lib/tracking/consent';

/** First-party marker, written only after explicit consent. */
export const RETURNING_MARKER_KEY = 'jovie_returning_v1';
/** Read by the edge rewrites on the NEXT visit (see profile-variant-rewrites). */
export const RETURNING_COOKIE = 'jv_returning';
const RETURNING_MAX_AGE_SECONDS = 60 * 60 * 24 * 90;

/**
 * Marks this browser as having visited, for the next visit only. The current
 * page is never re-decided from it, so there is no swap after first paint.
 * Nothing is stored unless consent state is `accepted`.
 */
export function useReturningMarker(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || getConsentState() !== 'accepted') return;
    try {
      globalThis.localStorage?.setItem(
        RETURNING_MARKER_KEY,
        String(Date.now())
      );
    } catch {
      // Storage can be blocked; the cookie below still carries the marker.
    }
    const secure = globalThis.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${RETURNING_COOKIE}=1; Max-Age=${RETURNING_MAX_AGE_SECONDS}; Path=/; SameSite=Lax${secure}`;
  }, [enabled]);
}
