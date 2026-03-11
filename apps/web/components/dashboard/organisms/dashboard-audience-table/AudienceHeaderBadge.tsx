'use client';

import { Ghost, UserCheck, Users } from 'lucide-react';
import { memo } from 'react';
import { cn } from '@/lib/utils';
import type { AudienceView } from './types';

interface AudienceHeaderBadgeProps {
  readonly view: AudienceView;
  readonly onViewChange: (view: AudienceView) => void;
  /** Null when the COUNT query was skipped for performance (JOV-1262). */
  readonly totalAudienceCount: number | null;
  /** Null when the COUNT query was skipped for performance (JOV-1262). */
  readonly subscriberCount: number | null;
}

const VIEW_OPTIONS: {
  value: AudienceView;
  Icon: typeof Users;
}[] = [
  { value: 'all', Icon: Users },
  { value: 'identified', Icon: UserCheck },
  { value: 'anonymous', Icon: Ghost },
];

export const AudienceHeaderBadge = memo(function AudienceHeaderBadge({
  view,
  onViewChange,
  totalAudienceCount,
  subscriberCount,
}: AudienceHeaderBadgeProps) {
  const anonymousCount =
    totalAudienceCount !== null && subscriberCount !== null
      ? Math.max(totalAudienceCount - subscriberCount, 0)
      : null;

  const labels: Record<AudienceView, string> = {
    all: totalAudienceCount !== null ? `All (${totalAudienceCount})` : 'All',
    identified:
      subscriberCount !== null
        ? `Identified (${subscriberCount})`
        : 'Identified',
    anonymous:
      anonymousCount !== null ? `Anonymous (${anonymousCount})` : 'Anonymous',
  };

  return (
    <div className='flex items-center min-w-0 overflow-x-auto scrollbar-hide'>
      <fieldset className='inline-flex items-center gap-0.5 rounded-lg border border-subtle bg-surface-0/80 p-[3px] backdrop-blur-sm'>
        <legend className='sr-only'>Audience view filter</legend>
        {VIEW_OPTIONS.map(({ value, Icon }) => (
          <button
            key={value}
            type='button'
            onClick={() => onViewChange(value)}
            aria-pressed={view === value}
            className={cn(
              'inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-[510] tracking-[-0.01em] transition-all duration-150 whitespace-nowrap',
              view === value
                ? 'border-default bg-surface-2 text-primary-token shadow-card'
                : 'border-transparent text-tertiary-token hover:text-secondary-token hover:bg-surface-1'
            )}
          >
            <Icon className='h-3 w-3' />
            {labels[value]}
          </button>
        ))}
      </fieldset>
    </div>
  );
});
