'use client';

import { Analytics as VercelAnalytics } from '@vercel/analytics/react';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { page } from '@/lib/analytics';

export function Analytics() {
  const pathname = usePathname();

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
