'use client';

import { useEffect } from 'react';
import { track } from '@/lib/analytics';
import { ONBOARDING_FUNNEL_EVENTS } from '@/lib/onboarding/funnel-events';

export function DashboardLoadTracker({
  pathname,
  userId,
}: Readonly<{
  pathname: string | null;
  userId: string;
}>) {
  useEffect(() => {
    track(ONBOARDING_FUNNEL_EVENTS.DASHBOARD_LOADED, {
      pathname,
      user_id: userId,
    });
  }, [pathname, userId]);

  return null;
}
