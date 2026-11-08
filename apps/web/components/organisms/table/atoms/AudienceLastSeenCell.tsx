'use client';

import React from 'react';
import { AudienceRowActionsMenu } from '@/features/dashboard/AudienceRowActionsMenu';
import { cn } from '@/lib/utils';
import { formatTimeAgo } from '@/lib/utils/audience';
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
      {/* Pure reveal wrapper: no handlers, so the row's own click handling
          applies exactly as in AudienceCreatedAtCell; the actions menu inside
          owns its interaction semantics. No aria-hidden: the menu stays
          focusable, and aria-hidden on a focusable container is an axe
          aria-hidden-focus violation. */}
      <div
        className={cn(
          'opacity-0 pointer-events-none transition-opacity group-hover:opacity-100 group-hover:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto',
          isMenuOpen && 'opacity-100 pointer-events-auto'
        )}
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
