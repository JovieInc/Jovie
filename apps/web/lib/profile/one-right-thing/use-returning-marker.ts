'use client';

import { useEffect } from 'react';
import { getConsentState, isDNTEnabled } from '@/lib/tracking/consent';
import {
  RETURNING_COOKIE,
  RETURNING_MAX_AGE_SECONDS,
} from './returning-cookie';

/**
 * Marks this browser as having visited THIS profile, for the next visit only.
 * The cookie is scoped to the profile path, so visiting artist A never makes
 * artist B see a returning visitor. The current page is never re-decided from
 * it, so there is no swap after first paint. Nothing is stored unless consent
 * state is accepted and Do Not Track is off (GPC is folded into
 * getConsentState).
 */
export function useReturningMarker(enabled: boolean, handle: string): void {
  useEffect(() => {
    if (!enabled || !handle) return;
    if (getConsentState() !== 'accepted' || isDNTEnabled()) return;
    const secure = globalThis.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${RETURNING_COOKIE}=1; Max-Age=${RETURNING_MAX_AGE_SECONDS}; Path=/${handle.toLowerCase()}; SameSite=Lax${secure}`;
  }, [enabled, handle]);
}
