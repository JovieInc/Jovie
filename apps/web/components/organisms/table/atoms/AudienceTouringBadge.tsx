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
        'inline-flex items-center gap-1 rounded border border-warning/20 bg-warning/10 px-1.5 py-px text-3xs font-caption text-warning-text max-w-25',
        className
      )}
      title={title}
    >
      <MapPin className='h-2.5 w-2.5 shrink-0' aria-hidden='true' />
      <span className='truncate'>{touringCity}</span>
    </div>
  );
}
