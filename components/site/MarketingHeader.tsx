'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useLayoutEffect, useState } from 'react';
import { Header } from '@/components/site/Header';
import { cn } from '@/lib/utils';

export interface MarketingHeaderProps {
  logoSize?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  scrollThresholdPx?: number;
  hideNav?: boolean;
}

export function MarketingHeader({
  logoSize = 'xs',
  scrollThresholdPx = 0,
  hideNav,
}: MarketingHeaderProps) {
  const pathname = usePathname();
  const [isScrolled, setIsScrolled] = useState<boolean>(false);

  const getScrollTop = (): number => {
    if (typeof window === 'undefined') return 0;

    const scrollingElement = document.scrollingElement;
    return (
      window.scrollY ||
      scrollingElement?.scrollTop ||
      document.documentElement.scrollTop ||
      document.body.scrollTop ||
      0
    );
  };

  useLayoutEffect(() => {
    setIsScrolled(getScrollTop() > scrollThresholdPx);
  }, [pathname, scrollThresholdPx]);

  useEffect(() => {
    const onScroll = () => {
      setIsScrolled(getScrollTop() > scrollThresholdPx);
    };

    // Initialize on mount (and when threshold changes)
    onScroll();

    window.addEventListener('scroll', onScroll, { passive: true });
    // Capture scroll events from nested scroll containers too
    document.addEventListener('scroll', onScroll, {
      passive: true,
      capture: true,
    });

    return () => {
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, [scrollThresholdPx]);

  const showSolid = pathname !== '/' || isScrolled;
  const resolvedHideNav = hideNav ?? pathname === '/investors';
  const hidePricingLink = pathname === '/';

  return (
    <Header
      sticky={false}
      logoSize={logoSize}
      logoVariant='fullAlt'
      hideNav={resolvedHideNav}
      hidePricingLink={hidePricingLink}
      className={cn(
        'transition-colors duration-300 border-b',
        showSolid
          ? 'bg-white dark:bg-black border-subtle backdrop-blur'
          : 'bg-transparent! border-transparent! dark:bg-transparent! dark:border-transparent!'
      )}
    />
  );
}
