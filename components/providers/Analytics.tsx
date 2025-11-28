'use client';

import { useFeatureGate } from '@statsig/react-bindings';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { page } from '@/lib/analytics';
import { STATSIG_FLAGS } from '@/lib/statsig/flags';

export function Analytics() {
  const pathname = usePathname();
  const analyticsGate = useFeatureGate(STATSIG_FLAGS.ANALYTICS);

  useEffect(() => {
    try {
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
  }, [pathname, analyticsGate.value]);

  return null;
}
