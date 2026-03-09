'use client';

import { BellRing, Ghost, Users } from 'lucide-react';
import { memo } from 'react';
import { cn } from '@/lib/utils';
import type { AudienceView } from './types';

interface AudienceHeaderBadgeProps {
  readonly view: AudienceView;
  readonly onViewChange: (view: AudienceView) => void;
  readonly totalAudienceCount: number;
  readonly subscriberCount: number;
  readonly anonymousCount: number;
}

const VIEW_OPTIONS: {
  value: AudienceView;
  label: string;
  Icon: typeof Users;
}[] = [
  { value: 'all', label: 'All Audience', Icon: Users },
  { value: 'subscribers', label: 'Followers', Icon: BellRing },
  { value: 'anonymous', label: 'Anonymous', Icon: Ghost },
];

const numberFormatter = new Intl.NumberFormat();

export const AudienceHeaderBadge = memo(function AudienceHeaderBadge({
  view,
  onViewChange,
  totalAudienceCount,
  subscriberCount,
  anonymousCount,
}: AudienceHeaderBadgeProps) {
  const countsByView: Record<AudienceView, number> = {
    all: totalAudienceCount,
    subscribers: subscriberCount,
    anonymous: anonymousCount,
  };

  return (
    <div className='flex items-center min-w-0 overflow-x-auto scrollbar-hide'>
      <fieldset className='inline-flex items-center gap-0.5 rounded-lg border border-subtle bg-surface-0/80 p-[3px] backdrop-blur-sm'>
        <legend className='sr-only'>Audience view filter</legend>
        {VIEW_OPTIONS.map(({ value, label, Icon }) => (
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
            {`${label} (${numberFormatter.format(countsByView[value] ?? 0)})`}
          </button>
        ))}
      </fieldset>
    </div>
  );
});
