'use client';

/**
 * Marketing Header Component
 *
 * Header with scroll-aware background transition, using TanStack Pacer
 * for throttled scroll handling.
 *
 * @see https://tanstack.com/pacer
 */

import { useThrottler } from '@tanstack/react-pacer';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Header } from '@/components/site/Header';
import { cn } from '@/lib/utils';

export interface MarketingHeaderProps {
  logoSize?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  scrollThresholdPx?: number;
  hideNav?: boolean;
}

// Use 16ms throttle (~60fps) for smooth scroll tracking
const SCROLL_THROTTLE_MS = 16;

export function MarketingHeader({
  logoSize = 'xs',
  scrollThresholdPx = 0,
  hideNav,
}: MarketingHeaderProps) {
  const pathname = usePathname();
  const [isScrolled, setIsScrolled] = useState<boolean>(
    typeof window !== 'undefined' && window.scrollY > scrollThresholdPx
  );

  // TanStack Pacer throttler for scroll events
  const throttler = useThrottler(
    () => {
      setIsScrolled(window.scrollY > scrollThresholdPx);
    },
    { wait: SCROLL_THROTTLE_MS, leading: true, trailing: true }
  );

  useEffect(() => {
    // Initialize on mount and pathname changes
    setIsScrolled(window.scrollY > scrollThresholdPx);

    const onScroll = () => {
      throttler.maybeExecute();
    };

    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', onScroll);
      throttler.cancel();
    };
  }, [scrollThresholdPx, pathname, throttler]);

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
      containerSize='md'
      className={cn(
        'transition-colors duration-300 border-b',
        showSolid
          ? 'bg-[#08090a] border-subtle backdrop-blur'
          : '!bg-transparent !border-transparent'
      )}
    />
  );
}
