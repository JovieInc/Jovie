'use client';

import { Analytics as VercelAnalytics } from '@vercel/analytics/react';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { page, setAnalyticsEnabled } from '@/lib/analytics';
import { publicEnv } from '@/lib/env-public';

export function Analytics() {
  const pathname = usePathname();
  const hasStatsigKey = Boolean(publicEnv.NEXT_PUBLIC_STATSIG_CLIENT_KEY);
  const shouldLoadAnalytics = hasStatsigKey;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setAnalyticsEnabled(shouldLoadAnalytics);
  }, [shouldLoadAnalytics]);

  useEffect(() => {
    try {
      if (!hasStatsigKey) return;
      if (typeof window === 'undefined') return;

      page(pathname ?? undefined, {
        url: pathname ?? undefined,
      });
    } catch (error) {
      console.error('Analytics error:', error);
    }
  }, [pathname, hasStatsigKey]);

  if (!shouldLoadAnalytics) {
    return null;
  }

  return <VercelAnalytics />;
}
