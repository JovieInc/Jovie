'use client';

import { useEffect, useRef } from 'react';
import { track } from '@/lib/analytics';
import {
  consumeSignupFirstValue,
  peekSignupFirstValuePending,
} from '@/lib/analytics/signup-funnel-client';
import { ONBOARDING_FUNNEL_EVENTS } from '@/lib/onboarding/funnel-events';

// One first-dashboard sample per document: the shell remounting after a
// client navigation is warm and is not the first dashboard state.
let firstDashboardProbeStarted = false;

/** Test seam: allow another first-dashboard sample in this module. */
export function resetFirstDashboardProbeForTests(): void {
  firstDashboardProbeStarted = false;
}

function readNavigationType(): string | null {
  try {
    const entry = globalThis.performance?.getEntriesByType?.('navigation')[0] as
      | PerformanceNavigationTiming
      | undefined;
    return entry?.type ?? null;
  } catch {
    return null;
  }
}

export function DashboardLoadTracker({
  pathname,
  userId,
}: Readonly<{
  pathname: string | null;
  userId: string;
}>) {
  const trackedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    // Read before consume: a pending claim marks a brand-new account's first
    // dashboard.
    const newAccount = peekSignupFirstValuePending();
    consumeSignupFirstValue();

    const firstMountInDocument = !firstDashboardProbeStarted;
    firstDashboardProbeStarted = true;
    const navigationType = readNavigationType();
    const hydratedAt = globalThis.performance?.now?.() ?? 0;

    // The probe loads after hydration so it adds nothing to any route's
    // initial JS; the clock still starts at the document's time origin.
    let cancelled = false;
    let stop: (() => void) | undefined;
    import('@/lib/monitoring/first-dashboard-ready')
      .then(({ isHardShellLoad, watchFirstDashboardReady }) => {
        if (
          cancelled ||
          !isHardShellLoad({ firstMountInDocument, navigationType })
        ) {
          return;
        }
        stop = watchFirstDashboardReady({ hydratedAt, newAccount });
      })
      .catch(() => {
        // A failed probe chunk costs one sample, never the shell.
      });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);

  useEffect(() => {
    const trackingKey = `jovie:${ONBOARDING_FUNNEL_EVENTS.DASHBOARD_LOADED}:${userId}`;
    if (trackedKeyRef.current === trackingKey) return;

    try {
      if (window.sessionStorage.getItem(trackingKey) === '1') {
        trackedKeyRef.current = trackingKey;
        return;
      }
      window.sessionStorage.setItem(trackingKey, '1');
    } catch {
      // Analytics should not break the shell when storage is unavailable.
    }

    trackedKeyRef.current = trackingKey;
    track(ONBOARDING_FUNNEL_EVENTS.DASHBOARD_LOADED, {
      pathname,
      user_id: userId,
    });
  }, [pathname, userId]);

  return null;
}
