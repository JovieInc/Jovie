'use client';

import { usePathname } from 'next/navigation';
import { Footer } from '@/components/site/Footer';

export function MarketingFooter() {
  const pathname = usePathname();

  if (pathname === '/investors') {
    return <Footer version='minimal' containerSize='md' />;
  }

  return <Footer brandingMark='icon' containerSize='md' />;
}
