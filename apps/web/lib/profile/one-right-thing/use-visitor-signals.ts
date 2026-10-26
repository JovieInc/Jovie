'use client';

import { useEffect, useState } from 'react';
import { COUNTRY_CODE_COOKIE } from '@/constants/app';
import { getConsentState } from '@/lib/tracking/consent';
import type { VisitorSignals } from './engine';
import {
  neutralVisitorSignals,
  resolveVisitorSignals,
} from './visitor-signals';

/** First-party marker, read and written only after explicit consent. */
export const RETURNING_MARKER_KEY = 'jovie_returning_v1';

function readCookie(name: string): string | null {
  for (const part of document.cookie.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Resolves the visitor signals after hydration. The first render (and every
 * server render) uses neutral signals, so the ISR HTML stays identical for
 * everyone; the choice can only change after mount, from signals the browser
 * already has. Disabled renders (previews, fixtures) stay neutral.
 */
export function useVisitorSignals(enabled: boolean): VisitorSignals {
  const [signals, setSignals] = useState<VisitorSignals>(() =>
    neutralVisitorSignals(new Date())
  );

  useEffect(() => {
    if (!enabled) return;
    const consented = getConsentState() === 'accepted';
    let markerPresent = false;
    if (consented) {
      try {
        markerPresent =
          globalThis.localStorage?.getItem(RETURNING_MARKER_KEY) != null;
        if (!markerPresent) {
          globalThis.localStorage?.setItem(
            RETURNING_MARKER_KEY,
            String(Date.now())
          );
        }
      } catch {
        // Storage can be blocked; the signal then stays unknown-false.
      }
    }
    setSignals(
      resolveVisitorSignals({
        referrer: document.referrer,
        search: globalThis.location.search,
        ownHost: globalThis.location.hostname,
        userAgent: navigator.userAgent,
        countryCookie: readCookie(COUNTRY_CODE_COOKIE),
        returningMarkerAllowed: consented,
        returningMarkerPresent: markerPresent,
        now: new Date(),
      })
    );
  }, [enabled]);

  return signals;
}
