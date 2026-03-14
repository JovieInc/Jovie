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

  const dateSuffix = formattedDate ? ` on ${formattedDate}` : '';
  const title = `Upcoming show in ${touringCity}${dateSuffix}`;

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 rounded border border-amber-500/20 bg-amber-500/10 px-1.5 py-px text-[10px] font-[510] text-amber-600 dark:text-amber-400 max-w-[100px]',
        className
      )}
      title={title}
    >
      <MapPin className='h-2.5 w-2.5 shrink-0' aria-hidden='true' />
      <span className='truncate'>{touringCity}</span>
    </div>
  );
}
