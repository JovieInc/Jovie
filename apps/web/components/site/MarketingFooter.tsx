'use client';

import { usePathname } from 'next/navigation';
import { Footer } from '@/components/site/Footer';

// Pages that use minimal footer (MVP phase)
const MINIMAL_FOOTER_PATHS = new Set(['/', '/investors']);

export function MarketingFooter() {
  const pathname = usePathname();

  // Use minimal footer on homepage and investors page during MVP
  if (MINIMAL_FOOTER_PATHS.has(pathname)) {
    return (
      <footer
        style={{
          backgroundColor: 'rgb(8, 9, 10)', // Linear's dark footer
          color: 'rgb(247, 248, 248)', // Linear's light text
          maxWidth: '100%',
          // Linear's border - only top, sides are transparent
          borderStyle: 'solid none none',
          borderColor: 'rgb(35, 37, 42) rgb(247, 248, 248) rgb(247, 248, 248)',
          borderTopWidth: '1px',
        }}
      >
        <Footer version='minimal' containerSize='homepage' />
      </footer>
    );
  }

  return (
    <footer
      style={{
        backgroundColor: 'rgb(8, 9, 10)',
        color: 'rgb(247, 248, 248)',
        maxWidth: '100%',
        borderStyle: 'solid none none',
        borderColor: 'rgb(35, 37, 42) rgb(247, 248, 248) rgb(247, 248, 248)',
        borderTopWidth: '1px',
      }}
    >
      <Footer brandingMark='icon' containerSize='md' />
    </footer>
  );
}
