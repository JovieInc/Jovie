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
import { cn } from '@/lib/utils';

export interface MarketingHeaderProps {
  logoSize?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  scrollThresholdPx?: number;
  hideNav?: boolean;
}

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
  const { isScrolled } = useThrottledScroll({
    threshold: scrollThresholdPx,
    wait: PACER_TIMING.SCROLL_THROTTLE_MS,
  });

  const showSolid = pathname !== '/' || isScrolled;
  const resolvedHideNav = hideNav ?? pathname === '/investors';
  const hidePricingLink = pathname === '/';

  return (
    <Header
      sticky={false}
      logoSize={logoSize}
      logoVariant='word'
      hideNav={resolvedHideNav}
      hidePricingLink={hidePricingLink}
      containerSize='homepage'
      className={cn(
        'transition-colors duration-300 border-b',
        showSolid
          ? 'bg-base/95 border-subtle backdrop-blur-md'
          : 'bg-transparent! border-transparent!'
      )}
    />
  );
}
