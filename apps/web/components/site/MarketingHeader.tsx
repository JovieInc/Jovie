'use client';

/**
 * Marketing Header Component
 *
 * Header with scroll-aware background transition, using the shared
 * useThrottledScroll hook from TanStack Pacer.
 *
 * Supports three variants:
 * - `landing` (default): logo + auth actions
 * - `content`: simplified nav with Logo + Sign in/up only
 * - `minimal`: logo only, no navigation (e.g. investors page)
 *
 * @see https://tanstack.com/pacer
 */
import { Header } from '@/components/site/Header';
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
  // Use the shared throttled scroll hook
  // Note: _isScrolled available for future scroll-aware styling
  const { isScrolled: _isScrolled } = useThrottledScroll({
    threshold: scrollThresholdPx,
    wait: PACER_TIMING.SCROLL_THROTTLE_MS,
  });

  const hideNav = variant === 'minimal';

  return (
    <Header
      sticky={false}
      logoSize={logoSize}
      logoVariant='word'
      hideNav={hideNav}
      containerSize='homepage'
      className='border-b'
      style={{
        backgroundColor: 'var(--linear-bg-header)',
        borderBottomColor: 'var(--linear-border-default)',
        color: 'var(--linear-text-primary)',
      }}
    />
  );
}
