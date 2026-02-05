'use client';

import { usePathname } from 'next/navigation';
import { Footer } from '@/components/site/Footer';

// Pages that use minimal footer (MVP phase)
const MINIMAL_FOOTER_PATHS = new Set(['/', '/investors']);

export function MarketingFooter() {
  const pathname = usePathname();

  // Use minimal footer on homepage and investors page during MVP
  if (MINIMAL_FOOTER_PATHS.has(pathname)) {
    return <Footer version='minimal' containerSize='homepage' />;
  }

  // Use regular footer with Linear styling (handled internally by Footer)
  return (
    <Footer version='regular' brandingMark='icon' containerSize='homepage' />
  );
}
