'use client';

import { SimpleTooltip } from '@jovie/ui';
import { ArrowLeftRight, Sparkles, Star } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface AudienceReturningCellProps {
  readonly visits: number;
  readonly className?: string;
}

/** Pre-allocated icon elements to avoid creating components during render. */
const RETURNING_ICON = (
  <ArrowLeftRight
    className='h-3.5 w-3.5 shrink-0 text-blue-400'
    aria-hidden='true'
  />
);
const FIRST_ICON = (
  <Star className='h-3.5 w-3.5 shrink-0 text-amber-400' aria-hidden='true' />
);
const NEW_ICON = (
  <Sparkles
    className='h-3.5 w-3.5 shrink-0 text-emerald-400'
    aria-hidden='true'
  />
);

export function AudienceReturningCell({
  visits,
  className,
}: AudienceReturningCellProps) {
  const isReturning = visits > 1;
  const isFirst = visits === 1;

  let icon: React.ReactElement;
  let label: string;

  if (isReturning) {
    icon = RETURNING_ICON;
    label = 'Returning';
  } else if (isFirst) {
    icon = FIRST_ICON;
    label = 'First visit';
  } else {
    icon = NEW_ICON;
    label = 'New';
  }

  return (
    <SimpleTooltip content={label} side='top'>
      <div className={cn('flex items-center justify-center w-8', className)}>
        {icon}
      </div>
    </SimpleTooltip>
  );
}
