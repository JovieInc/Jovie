'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
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
  const [isScrolled, setIsScrolled] = useState<boolean>(
    typeof window !== 'undefined' && window.scrollY > scrollThresholdPx
  );
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const updateScrollState = () => {
      setIsScrolled(window.scrollY > scrollThresholdPx);
      rafRef.current = null;
    };

    const onScroll = () => {
      // Throttle using requestAnimationFrame
      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(updateScrollState);
      }
    };

    // Initialize on mount and pathname changes
    updateScrollState();

    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', onScroll);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [scrollThresholdPx, pathname]);

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
