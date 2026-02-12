'use client';

import { BellRing, Ghost, Users } from 'lucide-react';
import { memo } from 'react';
import { cn } from '@/lib/utils';
import type { AudienceView } from './types';

interface AudienceHeaderBadgeProps {
  readonly view: AudienceView;
  readonly onViewChange: (view: AudienceView) => void;
}

const VIEW_OPTIONS: {
  value: AudienceView;
  label: string;
  Icon: typeof Users;
}[] = [
  { value: 'all', label: 'All audience', Icon: Users },
  { value: 'subscribers', label: 'Subscribers', Icon: BellRing },
  { value: 'anonymous', label: 'Anonymous', Icon: Ghost },
];

export const AudienceHeaderBadge = memo(function AudienceHeaderBadge({
  view,
  onViewChange,
}: AudienceHeaderBadgeProps) {
  return (
    <div className='flex items-center min-w-0 overflow-x-auto'>
      <fieldset className='inline-flex items-center gap-1 rounded-xl border border-subtle bg-surface-1/90 p-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'>
        <legend className='sr-only'>Audience view filter</legend>
        {VIEW_OPTIONS.map(({ value, label, Icon }) => (
          <button
            key={value}
            type='button'
            onClick={() => onViewChange(value)}
            aria-pressed={view === value}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[13px] font-semibold tracking-[-0.01em] transition-colors whitespace-nowrap',
              view === value
                ? 'border-default bg-surface-2 text-primary-token shadow-[0_0_0_1px_rgba(255,255,255,0.03)_inset]'
                : 'border-transparent text-tertiary-token hover:border-subtle hover:bg-surface-2/80 hover:text-secondary-token'
            )}
          >
            <Icon className='h-3.5 w-3.5' />
            {label}
          </button>
        ))}
      </fieldset>
    </div>
  );
});
