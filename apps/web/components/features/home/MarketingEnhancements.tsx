'use client';

import { MarketingScrollUnlock } from '@/features/home/MarketingScrollUnlock';
import { ScrollRevealInit } from '@/features/home/ScrollRevealInit';

/**
 * Marketing pages need scroll-unlock and reveal initialization immediately.
 * These remain grouped behind a single component, but they no longer defer
 * behind idle time because they directly affect first-scroll behavior.
 */
export function MarketingEnhancements() {
  return (
    <>
      <MarketingScrollUnlock />
      <ScrollRevealInit />
    </>
  );
}
