'use client';

import { usePathname } from 'next/navigation';
import { Footer } from '@/components/site/Footer';

// Pages that use minimal footer (MVP phase)
const MINIMAL_FOOTER_PATHS = ['/', '/investors'];

// Pages that hide the theme toggle (dark mode only)
const DARK_MODE_ONLY_PATHS: string[] = [];

export function MarketingFooter() {
  const pathname = usePathname();
  const hideThemeToggle = DARK_MODE_ONLY_PATHS.includes(pathname);

  // Use minimal footer on homepage and investors page during MVP
  if (MINIMAL_FOOTER_PATHS.includes(pathname)) {
    return (
      <Footer
        version='minimal'
        containerSize='homepage'
        showThemeToggle={!hideThemeToggle}
      />
    );
  }

  return <Footer brandingMark='icon' containerSize='md' />;
}
