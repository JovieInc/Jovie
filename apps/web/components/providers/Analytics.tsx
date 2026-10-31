'use client';

import { Analytics as VercelAnalytics } from '@vercel/analytics/react';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { page } from '@/lib/analytics';
import { useTrackingEligibility } from '@/lib/tracking/use-tracking-eligibility';
import { isolateTrackingDocument } from '@/lib/tracking/vendor-navigation';

export function Analytics() {
  const pathname = usePathname();
  const allowed = useTrackingEligibility().vercel;
  useEffect(() => {
    if (allowed) isolateTrackingDocument();
  }, [allowed]);

  useEffect(() => {
    try {
      if (typeof window === 'undefined') return;

      page(pathname ?? undefined, {
        url: pathname ?? undefined,
      });
    } catch (error) {
      console.error('Analytics error:', error);
    }
  }, [pathname]);

  return allowed ? <VercelAnalytics /> : null;
}
