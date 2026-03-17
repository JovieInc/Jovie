'use client';

import { memo } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { DrawerInlineIconButton } from '@/components/molecules/drawer';

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
    return <div className='h-[18px] w-[18px]' aria-hidden='true' />;
  }

  return (
    <DrawerInlineIconButton
      onClick={onClick}
      disabled={isLoading}
      className='h-[18px] w-[18px] rounded-[5px] p-0 text-tertiary-token disabled:cursor-not-allowed disabled:opacity-50'
      aria-expanded={isExpanded}
      aria-label={isExpanded ? 'Collapse tracks' : 'Expand tracks'}
    >
      {isLoading ? (
        <Icon
          name='Loader2'
          className='h-3.5 w-3.5 animate-spin'
          aria-hidden='true'
        />
      ) : (
        <Icon
          name={isExpanded ? 'ChevronDown' : 'ChevronRight'}
          className='h-3.5 w-3.5'
          aria-hidden='true'
        />
      )}
    </DrawerInlineIconButton>
  );
});
