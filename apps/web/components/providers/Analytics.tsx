'use client';

import { Analytics as VercelAnalytics } from '@vercel/analytics/react';
import { useEffect } from 'react';
import { page } from '@/lib/analytics';
import { usePublicPathname } from '@/lib/navigation/use-public-pathname';

export function Analytics() {
  const pathname = usePublicPathname();

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

  return <VercelAnalytics />;
}
