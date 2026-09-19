'use client';

/**
 * ThemeToggleSkeleton Component
 *
 * Loading skeleton shown during SSR/hydration
 */

import { Button, Skeleton } from '@jovie/ui';

interface ThemeToggleSkeletonProps
  extends Readonly<{
    readonly appearance: 'icon' | 'segmented';
    readonly className?: string;
    readonly size?: 'default' | 'footer';
  }> {}

export function ThemeToggleSkeleton({
  appearance,
  className = '',
  size = 'default',
}: ThemeToggleSkeletonProps) {
  if (appearance === 'segmented') {
    const buttonClass = size === 'footer' ? 'h-7 w-11 px-3' : 'h-7 w-7';
    const containerClass = size === 'footer' ? 'h-11 px-0 py-2' : 'p-0';
    return (
      <div
        role='toolbar'
        aria-label='Theme'
        className={`inline-flex items-center gap-0 rounded-full border border-subtle bg-surface-2 ${containerClass} ${className}`}
      >
        <Skeleton className={buttonClass} rounded='full' />
        <Skeleton className={buttonClass} rounded='full' />
        <Skeleton className={buttonClass} rounded='full' />
      </div>
    );
  }

  return (
    <Button variant='ghost' size='sm' className='h-8 w-8 px-0' disabled>
      <span className='sr-only'>Loading theme toggle</span>
      <Skeleton className='h-4 w-4' rounded='sm' shimmer={false} />
    </Button>
  );
}
