'use client';

import { LoaderCircle, Pause, Play } from 'lucide-react';
import { cn } from '@/lib/utils';

export function AudioPlayButton({
  isPlaying,
  isLoading = false,
  onClick,
  label,
  size = 'compact',
  className,
}: {
  readonly isPlaying: boolean;
  readonly isLoading?: boolean;
  readonly onClick: () => void;
  readonly label?: string;
  readonly size?: 'bar' | 'compact' | 'persistent';
  readonly className?: string;
}) {
  const accessibleLabel =
    label ?? (isLoading ? 'Loading track' : isPlaying ? 'Pause' : 'Play');

  return (
    <button
      type='button'
      onClick={onClick}
      disabled={isLoading}
      className={cn(
        size === 'bar' &&
          'h-8 w-8 rounded-full border border-(--linear-btn-primary-border) bg-btn-primary text-btn-primary-foreground shadow-button-inset transition-colors duration-subtle ease-subtle hover:border-(--linear-btn-primary-hover) hover:bg-btn-primary-hover',
        size === 'compact' &&
          'h-9 w-9 rounded-full border border-(--linear-btn-primary-border) bg-btn-primary text-btn-primary-foreground shadow-button-inset transition-colors duration-subtle ease-subtle hover:border-(--linear-btn-primary-hover) hover:bg-btn-primary-hover',
        size === 'persistent' &&
          'relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-subtle bg-surface-0 text-secondary-token transition-[background-color,color,border-color] duration-subtle hover:border-default hover:bg-surface-1 hover:text-primary-token focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 before:absolute before:-inset-2 before:content-[""]',
        'grid place-items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/55 focus-visible:ring-offset-2 focus-visible:ring-offset-(--linear-bg-page) outline-none disabled:cursor-wait disabled:opacity-60',
        className
      )}
      aria-label={accessibleLabel}
    >
      {isLoading ? (
        <LoaderCircle className='h-3.5 w-3.5 animate-spin' aria-hidden='true' />
      ) : isPlaying ? (
        <Pause className='h-3.5 w-3.5' strokeWidth={2.5} fill='currentColor' />
      ) : (
        <Play
          className='h-3.5 w-3.5 translate-x-px'
          strokeWidth={2.5}
          fill='currentColor'
        />
      )}
    </button>
  );
}
