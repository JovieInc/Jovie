'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getConsentState, isDNTEnabled, isGPCEnabled } from './consent';
import { type TrackingEligibility, trackingEligibility } from './eligibility';
import {
  isCookieBannerRequiredFromClient,
  readStoredConsentFromClient,
} from './google-consent-mode';
import { resetTrackingDocument } from './vendor-navigation';

const denied = trackingEligibility({ profile: undefined, visitor: {} });
type Decision = { pathname: string; eligibility: TrackingEligibility };
let liveDecision: Decision | undefined;

function applyClientSignals(remote: TrackingEligibility): TrackingEligibility {
  const local = trackingEligibility({
    profile: null,
    visitor: {
      gpc: isGPCEnabled(),
      dnt: isDNTEnabled(),
      optOut: getConsentState() === 'rejected',
      consentRequired: isCookieBannerRequiredFromClient(),
      consent: readStoredConsentFromClient(),
    },
  });
  return {
    facebook: remote.facebook && local.facebook,
    google: remote.google && local.google,
    tiktok: remote.tiktok && local.tiktok,
    ga: remote.ga && local.ga,
    vercel: remote.vercel && local.vercel,
  };
}

/** A no-store check on every mount/navigation, including warm Router Cache visits. */
export function useTrackingEligibility(
  skip = false,
  youngAudience = false
): TrackingEligibility {
  const pathname = usePathname();
  const [state, setState] = useState<Decision>();
  useEffect(() => {
    if (youngAudience) {
      liveDecision = undefined;
      resetTrackingDocument();
      return;
    }
    if (skip || !pathname) return;
    const controller = new AbortController();
    let generation = 0;
    const sync = async () => {
      const current = ++generation;
      const previous = liveDecision;
      liveDecision = undefined;
      setState(undefined);
      try {
        const response = await fetch(
          `/api/tracking/eligibility?pathname=${encodeURIComponent(pathname)}`,
          {
            cache: 'no-store',
            signal: controller.signal,
          }
        );
        if (!response.ok) return;
        const data = await response.json();
        const remote = data.eligibility;
        if (
          data.pathname !== pathname ||
          !remote ||
          !['facebook', 'google', 'tiktok', 'ga', 'vercel'].every(
            key => typeof remote[key] === 'boolean'
          )
        )
          return;
        if (!controller.signal.aborted && current === generation) {
          liveDecision = { pathname, eligibility: applyClientSignals(remote) };
          if (
            previous &&
            (Object.keys(denied) as (keyof TrackingEligibility)[]).some(
              vendor =>
                previous.eligibility[vendor] &&
                !liveDecision?.eligibility[vendor]
            )
          )
            resetTrackingDocument();
          setState(liveDecision);
        }
      } catch {
        /* Unknown authority stays denied, including offline navigation. */
      }
    };
    let unsubscribe: (() => void) | undefined;
    const attach = () => {
      unsubscribe?.();
      unsubscribe = globalThis.JVConsent?.onChange(() => {
        // Unmount cannot revoke opaque SDK listeners; discard that document.
        liveDecision = undefined;
        resetTrackingDocument();
        void sync();
      });
      void sync();
    };
    attach();
    globalThis.addEventListener('jvconsent:ready', attach);
    globalThis.addEventListener('pageshow', attach);
    return () => {
      controller.abort();
      unsubscribe?.();
      globalThis.removeEventListener('jvconsent:ready', attach);
      globalThis.removeEventListener('pageshow', attach);
    };
  }, [pathname, skip, youngAudience]);
  return skip || youngAudience || state?.pathname !== pathname
    ? denied
    : state.eligibility;
}

/** Direct event adapters cannot queue events before the live loader decision. */
export function getBrowserTrackingEligibility(): TrackingEligibility {
  if (
    typeof window === 'undefined' ||
    liveDecision?.pathname !== window.location.pathname
  )
    return denied;
  return applyClientSignals(liveDecision.eligibility);
}
