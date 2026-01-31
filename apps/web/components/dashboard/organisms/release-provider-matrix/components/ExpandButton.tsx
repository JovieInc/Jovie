'use client';

import { memo } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { cn } from '@/lib/utils';

interface ExpandButtonProps {
  /** Whether the row is currently expanded */
  readonly isExpanded: boolean;
  /** Whether the row is currently loading */
  readonly isLoading: boolean;
  /** Number of tracks in the release */
  readonly totalTracks: number;
  /** Click handler */
  readonly onClick: (e: React.MouseEvent) => void;
}

/**
 * ExpandButton - Chevron button for expanding/collapsing album tracks
 *
 * Features:
 * - Chevron right/down icon to indicate state
 * - Loading spinner while fetching tracks
 * - Hidden for singles (totalTracks === 1)
 */
export const ExpandButton = memo(function ExpandButton({
  isExpanded,
  isLoading,
  totalTracks,
  onClick,
}: ExpandButtonProps) {
  // Don't show expand button for singles (1 track)
  if (totalTracks <= 1) {
    return <div className='w-5 h-5' aria-hidden='true' />;
  }

  return (
    <button
      type='button'
      onClick={onClick}
      disabled={isLoading}
      className={cn(
        'flex items-center justify-center w-5 h-5 rounded',
        'text-tertiary-token hover:text-secondary-token',
        'hover:bg-surface-2 transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
        'disabled:opacity-50 disabled:cursor-not-allowed'
      )}
      aria-expanded={isExpanded}
      aria-label={isExpanded ? 'Collapse tracks' : 'Expand tracks'}
    >
      {isLoading ? (
        <Icon
          name='Loader2'
          className='h-4 w-4 animate-spin'
          aria-hidden='true'
        />
      ) : (
        <Icon
          name={isExpanded ? 'ChevronDown' : 'ChevronRight'}
          className='h-4 w-4'
          aria-hidden='true'
        />
      )}
    </button>
  );
});
