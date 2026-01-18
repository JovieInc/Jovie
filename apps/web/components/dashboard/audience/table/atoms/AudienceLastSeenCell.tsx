'use client';

import React from 'react';
import { AudienceRowActionsMenu } from '@/components/dashboard/AudienceRowActionsMenu';
import { cn } from '@/lib/utils';
import { formatTimeAgo } from '@/lib/utils/audience';
import { handleActivationKeyDown } from '@/lib/utils/keyboard';
import type { AudienceMember } from '@/types';

export interface AudienceLastSeenCellProps {
  row: AudienceMember;
  lastSeenAt: string | null;
  isMenuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  className?: string;
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
        'flex items-center justify-between gap-2 text-sm',
        className
      )}
    >
      <span className='line-clamp-1'>{formatTimeAgo(lastSeenAt)}</span>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: Click handler stops propagation only */}
      {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: Click handler stops propagation only */}
      <div
        className={cn(
          'opacity-0 pointer-events-none transition-opacity group-hover:opacity-100 group-hover:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto',
          isMenuOpen && 'opacity-100 pointer-events-auto'
        )}
        onClick={event => event.stopPropagation()}
        onKeyDown={event =>
          handleActivationKeyDown(event, e => e.stopPropagation())
        }
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
