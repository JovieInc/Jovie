'use client';

import { AudienceRowActionsMenu } from '@/components/dashboard/AudienceRowActionsMenu';
import { cn } from '@/lib/utils';
import { formatLongDate } from '@/lib/utils/audience';
import { handleActivationKeyDown } from '@/lib/utils/keyboard';
import type { AudienceMember } from '@/types';

export interface AudienceCreatedAtCellProps {
  row: AudienceMember;
  lastSeenAt: string | null;
  isMenuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  className?: string;
}

export function AudienceCreatedAtCell({
  row,
  lastSeenAt,
  isMenuOpen,
  onMenuOpenChange,
  className,
}: AudienceCreatedAtCellProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-2 text-sm',
        className
      )}
    >
      <span className='line-clamp-1'>{formatLongDate(lastSeenAt)}</span>
      {/* NOSONAR S6819: role="presentation" correctly hides wrapper; menu inside is the interactive element */}
      <div
        className={cn(
          'opacity-0 pointer-events-none transition-opacity group-hover:opacity-100 group-hover:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto',
          isMenuOpen && 'opacity-100 pointer-events-auto'
        )}
        onClick={event => event.stopPropagation()}
        onKeyDown={event =>
          handleActivationKeyDown(event, e => e.stopPropagation())
        }
        role='presentation'
      >
        <AudienceRowActionsMenu
          row={row}
          open={isMenuOpen}
          onOpenChange={onMenuOpenChange}
        />
      </div>
    </div>
  );
}
