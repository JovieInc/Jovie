'use client';

import { AudienceRowActionsMenu } from '@/components/dashboard/AudienceRowActionsMenu';
import { cn } from '@/lib/utils';
import { formatTimeAgo } from '@/lib/utils/audience';
import type { AudienceMember } from '@/types';

export interface AudienceLastSeenCellProps {
  row: AudienceMember;
  lastSeenAt: string | null;
  isMenuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  className?: string;
}

export function AudienceLastSeenCell({
  row,
  lastSeenAt,
  isMenuOpen,
  onMenuOpenChange,
  className,
}: AudienceLastSeenCellProps) {
  return (
    <td
      className={cn(
        'px-4 py-3 align-middle text-sm text-primary-token sm:px-6',
        className
      )}
    >
      <div className='flex items-center justify-between gap-2'>
        <span className='line-clamp-1'>{formatTimeAgo(lastSeenAt)}</span>
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: Click handler stops propagation only */}
        {/* biome-ignore lint/a11y/noStaticElementInteractions: Click handler stops propagation only */}
        {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: Click handler stops propagation only */}
        <div
          className={cn(
            'opacity-0 pointer-events-none transition-opacity group-hover:opacity-100 group-hover:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto',
            isMenuOpen && 'opacity-100 pointer-events-auto'
          )}
          onClick={event => event.stopPropagation()}
        >
          <AudienceRowActionsMenu
            row={row}
            open={isMenuOpen}
            onOpenChange={onMenuOpenChange}
          />
        </div>
      </div>
    </td>
  );
}
