'use client';

import { usePlanGate } from '@/lib/queries/usePlanGate';

/**
 * Branding badge that shows "Made with Jovie" for free plan users.
 * Hidden for Pro and Growth plan users.
 */
export function BrandingBadge() {
  const { canRemoveBranding, isLoading } = usePlanGate();

  if (isLoading) {
    return (
      <div className='h-3 w-24 rounded-sm skeleton motion-reduce:animate-none' />
    );
  }

  if (canRemoveBranding) {
    return null;
  }

  return <div className='text-xs opacity-60'>Made with Jovie</div>;
}
