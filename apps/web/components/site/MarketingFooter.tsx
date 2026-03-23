import { Footer } from '@/components/site/Footer';

/**
 * Marketing footer — minimal, dark-only, no theme toggle.
 */
export function MarketingFooter() {
  return (
    <Footer
      version='minimal'
      brandingMark='icon'
      containerSize='homepage'
      showThemeToggle={false}
    />
  );
}
