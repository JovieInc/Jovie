'use client';

/**
 * ThemeToggleSkeleton Component
 *
 * Loading skeleton shown during SSR/hydration
 */

import { Button } from '@jovie/ui';

interface ThemeToggleSkeletonProps
  extends Readonly<{
    readonly appearance: 'icon' | 'segmented';
    readonly className?: string;
  }> {}

export function ThemeToggleSkeleton({
  appearance,
  className = '',
}: ThemeToggleSkeletonProps) {
  if (appearance === 'segmented') {
    return (
      <div
        role='toolbar'
        aria-label='Theme'
        className={`inline-flex items-center gap-0 rounded-full border border-subtle bg-surface-2 p-0 ${className}`}
      >
        <div className='h-7 w-7 rounded-full skeleton motion-reduce:animate-none' />
        <div className='h-7 w-7 rounded-full skeleton motion-reduce:animate-none' />
        <div className='h-7 w-7 rounded-full skeleton motion-reduce:animate-none' />
      </div>
    );
  }

  return (
    <Button variant='ghost' size='sm' className='h-8 w-8 px-0' disabled>
      <span className='sr-only'>Loading theme toggle</span>
      <div className='h-4 w-4 skeleton motion-reduce:animate-none rounded-sm' />
    </Button>
  );
}
