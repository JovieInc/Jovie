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
    <td
      className={cn(
        'px-4 py-3 align-middle text-sm text-primary-token sm:px-6',
        className
      )}
    >
      <div className='inline-flex items-center gap-2 text-secondary-token'>
        <Icon
          name='MapPin'
          className='h-4 w-4 text-tertiary-token'
          aria-hidden='true'
        />
        <span className='line-clamp-1'>{locationLabel || 'Unknown'}</span>
      </div>
    </td>
  );
}
