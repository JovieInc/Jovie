'use client';

import { MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface AudienceTouringBadgeProps {
  readonly touringCity: string | null;
  readonly showDate: string | null;
  readonly className?: string;
}

export function AudienceTouringBadge({
  touringCity,
  showDate,
  className,
}: AudienceTouringBadgeProps) {
  if (!touringCity) return null;

  const formattedDate = showDate
    ? new Date(showDate).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      })
    : null;

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400',
        className
      )}
      title={`Upcoming show in ${touringCity}${formattedDate ? ` on ${formattedDate}` : ''}`}
    >
      <MapPin className='h-3 w-3 shrink-0' aria-hidden='true' />
      <span className='truncate'>
        {touringCity}
        {formattedDate && (
          <span className='ml-1 text-amber-500/70'>{formattedDate}</span>
        )}
      </span>
    </div>
  );
}
