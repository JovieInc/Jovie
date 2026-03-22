'use client';

/**
 * Marketing Header Component
 *
 * Header with scroll-aware background transition, using the shared
 * useThrottledScroll hook from TanStack Pacer.
 *
 * Supports three variants:
 * - `landing` (default): full nav with anchor links
 * - `content`: simplified nav with Logo + Sign in/up only
 * - `minimal`: logo only, no navigation (e.g. investors page)
 *
 * @see https://tanstack.com/pacer
 */

import { usePathname } from 'next/navigation';
import { Header } from '@/components/site/Header';
import { APP_ROUTES } from '@/constants/routes';
import { PACER_TIMING, useThrottledScroll } from '@/lib/pacer/hooks';

export type MarketingHeaderVariant = 'landing' | 'content' | 'minimal';

export interface MarketingHeaderProps
  extends Readonly<{
    readonly logoSize?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
    readonly scrollThresholdPx?: number;
    readonly variant?: MarketingHeaderVariant;
  }> {}

/**
 * Marketing header with scroll-aware background.
 * Uses the shared useThrottledScroll hook for optimized scroll handling.
 */
export function MarketingHeader({
  logoSize = 'xs',
  scrollThresholdPx = 0,
  variant = 'landing',
}: MarketingHeaderProps) {
  const pathname = usePathname();

  // Use the shared throttled scroll hook
  // Note: _isScrolled available for future scroll-aware styling
  const { isScrolled: _isScrolled } = useThrottledScroll({
    threshold: scrollThresholdPx,
    wait: PACER_TIMING.SCROLL_THROTTLE_MS,
  });

  const hideNav = variant === 'minimal';

  // Anchor nav links only for the landing variant
  const navLinks = (() => {
    if (variant !== 'landing') return undefined;

    if (pathname === APP_ROUTES.LAUNCH) {
      return [
        { href: '#how-it-works', label: 'How it works' },
        { href: '#features', label: 'Features' },
      ];
    }
    if (pathname === '/') {
      return [
        { href: '#release', label: 'Releases' },
        { href: '#profile', label: 'Profile' },
        { href: '#audience', label: 'Audience' },
        { href: '/pricing', label: 'Pricing' },
        { href: '/blog', label: 'Blog' },
        { href: '/investors', label: 'Investors' },
      ];
    }
    return undefined;
  })();

  return (
    <Header
      sticky={false}
      logoSize={logoSize}
      logoVariant='word'
      hideNav={hideNav}
      containerSize='homepage'
      className='border-b'
      navLinks={navLinks}
      style={{
        backgroundColor: 'var(--linear-bg-header)',
        borderBottomColor: 'var(--linear-border-default)',
        color: 'var(--linear-text-primary)',
      }}
    />
  );
}
