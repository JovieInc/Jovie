'use client';

import React from 'react';
import { AudienceRowActionsMenu } from '@/features/dashboard/AudienceRowActionsMenu';
import { cn } from '@/lib/utils';
import { formatTimeAgo } from '@/lib/utils/audience';
import { handleActivationKeyDown } from '@/lib/utils/keyboard';
import type { AudienceMember } from '@/types';

export interface AudienceLastSeenCellProps {
  readonly row: AudienceMember;
  readonly lastSeenAt: string | null;
  readonly isMenuOpen: boolean;
  readonly onMenuOpenChange: (open: boolean) => void;
  readonly className?: string;
}

/**
 * Memoized for performance in virtualized tables to prevent unnecessary re-renders.
 */
export const AudienceLastSeenCell = React.memo(function AudienceLastSeenCell({
  row,
  lastSeenAt,
  isMenuOpen,
  onMenuOpenChange,
  className,
}: AudienceLastSeenCellProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-2 text-app',
        className
      )}
    >
      <span className='line-clamp-1'>{formatTimeAgo(lastSeenAt)}</span>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: stopPropagation wrapper keeps the row click from firing when using the inline row actions; the interactive control lives inside. */}
      {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: same stopPropagation wrapper as above. */}
      <div
        className={cn(
          'opacity-0 pointer-events-none transition-opacity group-hover:opacity-100 group-hover:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto',
          isMenuOpen && 'opacity-100 pointer-events-auto'
        )}
        onClick={event => event.stopPropagation()}
        onKeyDown={event =>
          handleActivationKeyDown(event, e => e.stopPropagation())
        }
        // No aria-hidden: the row actions menu inside stays focusable, and
        // aria-hidden on a focusable container is an axe aria-hidden-focus
        // violation. The hover/focus-within reveal already manages visibility.
      >
        <AudienceRowActionsMenu
          row={row}
          open={isMenuOpen}
          onOpenChange={onMenuOpenChange}
        />
      </div>
    </div>
  );
});
