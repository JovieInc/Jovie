'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { page } from '@/lib/analytics';

export function Analytics() {
  const pathname = usePathname();

  useEffect(() => {
    try {
      // Only run on client side
      if (typeof window === 'undefined') return;

      // Track page views with our analytics
      page(pathname ?? undefined, {
        url: pathname ?? undefined,
      });
    } catch (error) {
      console.error('Analytics error:', error);
    }
  }, [pathname]);

  return null;
}
