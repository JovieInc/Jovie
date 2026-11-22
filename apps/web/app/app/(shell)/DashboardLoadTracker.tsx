'use client';

import { useEffect, useRef } from 'react';
import { track } from '@/lib/analytics';
import {
  consumeSignupFirstValue,
  peekSignupFirstValuePending,
} from '@/lib/analytics/signup-funnel-client';
import {
  isHardShellLoad,
  watchFirstDashboardReady,
} from '@/lib/monitoring/first-dashboard-ready';
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
    if (
      !isHardShellLoad({
        firstMountInDocument,
        navigationType: readNavigationType(),
      })
    ) {
      return;
    }
    return watchFirstDashboardReady({
      hydratedAt: globalThis.performance?.now?.() ?? 0,
      newAccount,
    });
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
