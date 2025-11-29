'use client';

import { useFeatureGate } from '@statsig/react-bindings';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { page, setAnalyticsEnabled } from '@/lib/analytics';
import { env } from '@/lib/env';
import { STATSIG_FLAGS } from '@/lib/statsig/flags';

export function Analytics() {
  const pathname = usePathname();
  const analyticsGate = useFeatureGate(STATSIG_FLAGS.ANALYTICS);
  const hasStatsigKey = Boolean(env.NEXT_PUBLIC_STATSIG_CLIENT_KEY);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setAnalyticsEnabled(hasStatsigKey && analyticsGate.value);
  }, [analyticsGate.value, hasStatsigKey]);

  useEffect(() => {
    try {
      // Skip when no Statsig key is configured (previews/dev)
      if (!hasStatsigKey) return;

      // Only run on client side
      if (typeof window === 'undefined') return;

      if (!analyticsGate.value) return;

      // Track page views with our analytics
      page(pathname ?? undefined, {
        url: pathname ?? undefined,
      });
    } catch (error) {
      console.error('Analytics error:', error);
    }
  }, [pathname, analyticsGate.value, hasStatsigKey]);

  return null;
}
