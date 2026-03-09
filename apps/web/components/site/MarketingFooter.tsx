'use client';

import { usePathname } from 'next/navigation';
import { Footer } from '@/components/site/Footer';

/** Paths that use a compact footer (no product/company/legal columns). */
const MINIMAL_FOOTER_PATHS = new Set(['/', '/investors']);

/**
 * Unified marketing footer — always renders the icon logo.
 * Homepage and investors get the compact (minimal) variant;
 * every other marketing page gets the full (regular) variant.
 */
export function MarketingFooter() {
  const pathname = usePathname();
  const variant = MINIMAL_FOOTER_PATHS.has(pathname) ? 'minimal' : 'regular';

  return (
    <Footer version={variant} brandingMark='icon' containerSize='homepage' />
  );
}
