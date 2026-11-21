'use client';

import { IconButton } from '@jovie/ui';
import { memo } from 'react';
import { Icon } from '@/components/atoms/Icon';

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
  // Don't show expand button for singles (1 track).
  // Spacer matches IconButton size=xs (h-6 / 24px) — no className restyle.
  if (totalTracks <= 1) {
    return <div className='h-6 w-6' aria-hidden='true' />;
  }

  return (
    <IconButton
      size='xs'
      variant='inline'
      onClick={onClick}
      disabled={isLoading}
      aria-expanded={isExpanded}
      aria-label={isExpanded ? 'Collapse tracks' : 'Expand tracks'}
    >
      {isLoading ? (
        <Icon
          name='Loader2'
          className='h-3.5 w-3.5 animate-spin text-tertiary-token'
          aria-hidden='true'
        />
      ) : (
        <Icon
          name={isExpanded ? 'ChevronDown' : 'ChevronRight'}
          className='h-3.5 w-3.5 text-tertiary-token'
          aria-hidden='true'
        />
      )}
    </IconButton>
  );
});
