'use client';

import { useFeatureGate } from '@statsig/react-bindings';
import { Analytics as VercelAnalytics } from '@vercel/analytics/react';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { page, setAnalyticsEnabled } from '@/lib/analytics';
import { publicEnv } from '@/lib/env-public';
import { STATSIG_FLAGS } from '@/lib/statsig/flags';

export function Analytics() {
  const pathname = usePathname();
  const analyticsGate = useFeatureGate(STATSIG_FLAGS.ANALYTICS);
  const hasStatsigKey = Boolean(publicEnv.NEXT_PUBLIC_STATSIG_CLIENT_KEY);

  const shouldLoadAnalytics = hasStatsigKey && analyticsGate.value;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setAnalyticsEnabled(shouldLoadAnalytics);
  }, [shouldLoadAnalytics]);

  useEffect(() => {
    try {
      if (!hasStatsigKey) return;
      if (typeof window === 'undefined') return;
      if (!analyticsGate.value) return;

      page(pathname ?? undefined, {
        url: pathname ?? undefined,
      });
    } catch (error) {
      console.error('Analytics error:', error);
    }
  }, [pathname, analyticsGate.value, hasStatsigKey]);

  if (!shouldLoadAnalytics) {
    return null;
  }

  return <VercelAnalytics />;
}
