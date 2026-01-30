'use client';

import { Icon } from '@/components/atoms/Icon';
import { cn } from '@/lib/utils';
import { formatCountryLabel } from '@/lib/utils/audience';

export interface AudienceCountryCellProps {
  readonly geoCountry: string | null;
  readonly className?: string;
}

export function AudienceCountryCell({
  geoCountry,
  className,
}: AudienceCountryCellProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 text-sm text-secondary-token',
        className
      )}
    >
      <Icon
        name='MapPin'
        className='h-4 w-4 text-tertiary-token'
        aria-hidden='true'
      />
      <span className='line-clamp-1'>
        {geoCountry ? formatCountryLabel(geoCountry) : 'Unknown'}
      </span>
    </div>
  );
}
