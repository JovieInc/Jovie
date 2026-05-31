'use client';

import { useEffect, useRef } from 'react';
import { track } from '@/lib/analytics';
import { ONBOARDING_FUNNEL_EVENTS } from '@/lib/onboarding/funnel-events';

export function DashboardLoadTracker({
  pathname,
  userId,
}: Readonly<{
  pathname: string | null;
  userId: string;
}>) {
  const trackedKeyRef = useRef<string | null>(null);

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
