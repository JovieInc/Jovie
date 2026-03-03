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
import { APP_ROUTES } from '@/constants/routes';
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

  // Anchor nav links for the /launch landing page
  const launchNavLinks =
    pathname === APP_ROUTES.LAUNCH
      ? [
          { href: '#how-it-works', label: 'How it works' },
          { href: '#features', label: 'Features' },
        ]
      : undefined;

  return (
    <Header
      sticky={false}
      logoSize={logoSize}
      logoVariant='word'
      hideNav={resolvedHideNav}
      containerSize='homepage'
      className='border-b'
      navLinks={launchNavLinks}
      style={{
        backgroundColor: 'var(--linear-bg-header)',
        borderBottomColor: 'var(--linear-border-subtle)',
        color: 'var(--linear-text-primary)',
      }}
    />
  );
}
