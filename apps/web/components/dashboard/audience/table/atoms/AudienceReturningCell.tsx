'use client';

import { DotBadge, type DotBadgeVariant } from '@/components/atoms/DotBadge';
import { cn } from '@/lib/utils';

export interface AudienceReturningCellProps {
  readonly visits: number;
  readonly className?: string;
}

const RETURNING_VARIANT: DotBadgeVariant = {
  className: 'border border-subtle bg-surface-2/40 text-secondary-token',
  dotClassName: 'bg-blue-500',
};

const NEW_VARIANT: DotBadgeVariant = {
  className: 'border border-subtle bg-transparent text-tertiary-token',
  dotClassName: 'bg-emerald-500',
};

export function AudienceReturningCell({
  visits,
  className,
}: AudienceReturningCellProps) {
  const isReturning = visits > 1;

  return (
    <div className={cn('text-[13px]', className)}>
      <DotBadge
        label={isReturning ? 'Returning' : 'New'}
        variant={isReturning ? RETURNING_VARIANT : NEW_VARIANT}
        size='sm'
      />
    </div>
  );
}
