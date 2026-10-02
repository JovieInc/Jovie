'use client';

import { Button } from '@jovie/ui/atoms/button';
import { Pause, Play } from 'lucide-react';
import { cn } from '@/lib/utils';

const PLAY_CONTROL_SIZE = {
  bar: 'icon-md',
  compact: 'icon',
  persistent: 'icon-sm',
} as const;

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
  let accessibleLabel = 'Play';
  if (label != null) accessibleLabel = label;
  else if (isLoading) accessibleLabel = 'Loading track';
  else if (isPlaying) accessibleLabel = 'Pause';
  const isPersistent = size === 'persistent';

  return (
    <Button
      type='button'
      onClick={onClick}
      loading={isLoading}
      variant={isPersistent ? 'ghost' : 'primary'}
      size={PLAY_CONTROL_SIZE[size]}
      className={cn(
        !isPersistent && 'bg-btn-primary text-btn-primary-foreground',
        isPersistent &&
          'border-subtle bg-surface-0 text-secondary-token hover:border-default hover:bg-surface-1 hover:text-primary-token',
        className
      )}
      aria-label={accessibleLabel}
    >
      {isPlaying ? (
        <Pause className='h-3.5 w-3.5' strokeWidth={2.5} fill='currentColor' />
      ) : (
        <Play
          className='h-3.5 w-3.5 translate-x-px'
          strokeWidth={2.5}
          fill='currentColor'
        />
      )}
    </Button>
  );
}
