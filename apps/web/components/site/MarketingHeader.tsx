'use client';

/**
 * Marketing Header Component
 *
 * Header with scroll-aware background transition, using the shared
 * useThrottledScroll hook from TanStack Pacer.
 *
 * @see https://tanstack.com/pacer
 */

import { usePathname } from 'next/navigation';
import { Header } from '@/components/site/Header';
import { PACER_TIMING, useThrottledScroll } from '@/lib/pacer/hooks';

export interface MarketingHeaderProps
  extends Readonly<{
    readonly logoSize?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
    readonly scrollThresholdPx?: number;
    readonly hideNav?: boolean;
  }> {}

/**
 * Marketing header with scroll-aware background.
 * Uses the shared useThrottledScroll hook for optimized scroll handling.
 */
export function MarketingHeader({
  logoSize = 'xs',
  scrollThresholdPx = 0,
  hideNav,
}: MarketingHeaderProps) {
  const pathname = usePathname();

  // Use the shared throttled scroll hook
  // Note: _isScrolled available for future scroll-aware styling
  const { isScrolled: _isScrolled } = useThrottledScroll({
    threshold: scrollThresholdPx,
    wait: PACER_TIMING.SCROLL_THROTTLE_MS,
  });
  const resolvedHideNav = hideNav ?? pathname === '/investors';
  // Show pricing link on all pages including homepage (was hidden as pseudo feature flag)
  const hidePricingLink = false;

  return (
    <Header
      sticky={false}
      logoSize={logoSize}
      logoVariant='word'
      hideNav={resolvedHideNav}
      hidePricingLink={hidePricingLink}
      containerSize='homepage'
      className='border-b'
      style={{
        backgroundColor: 'var(--linear-bg-header)',
        borderBottomColor: 'var(--linear-border-subtle)',
        color: 'var(--linear-text-primary)',
      }}
    />
  );
}
