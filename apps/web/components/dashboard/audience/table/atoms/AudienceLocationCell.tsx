'use client';

import { Icon } from '@/components/atoms/Icon';
import { cn } from '@/lib/utils';

export interface AudienceLocationCellProps {
  locationLabel: string | null;
  className?: string;
}

export function AudienceLocationCell({
  locationLabel,
  className,
}: AudienceLocationCellProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 text-xs text-secondary-token',
        className
      )}
    >
      <Icon
        name='MapPin'
        className='h-3.5 w-3.5 text-tertiary-token'
        aria-hidden='true'
      />
      <span className='line-clamp-1'>{locationLabel || 'Unknown'}</span>
    </div>
  );
}
