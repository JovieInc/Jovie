import { Footer } from '@/components/site/Footer';

/**
 * Unified marketing footer — always renders the icon logo
 * with the compact (minimal) variant across all marketing pages.
 */
export function MarketingFooter() {
  return (
    <Footer version='minimal' brandingMark='icon' containerSize='homepage' />
  );
}
