'use client';

import type { TourDateViewModel } from '@/app/app/(shell)/dashboard/tour-dates/actions';
import { Icon } from '@/components/atoms/Icon';
import { cn } from '@/lib/utils';

// Pre-configured formatters for date display
const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'short' });
const dayFormatter = new Intl.DateTimeFormat('en-US', { day: 'numeric' });
const weekdayFormatter = new Intl.DateTimeFormat('en-US', { weekday: 'short' });

interface TourDateCardProps {
  readonly tourDate: TourDateViewModel;
  readonly isNearYou?: boolean;
  readonly distanceKm?: number | null;
}

export function TourDateCard({
  tourDate,
  isNearYou = false,
  distanceKm,
}: Readonly<TourDateCardProps>) {
  const date = new Date(tourDate.startDate);
  const location = [tourDate.city, tourDate.region, tourDate.country]
    .filter(Boolean)
    .join(', ');

  const isSoldOut = tourDate.ticketStatus === 'sold_out';
  const isCancelled = tourDate.ticketStatus === 'cancelled';

  const handleAddToCalendar = () => {
    // Generate ICS file URL - use direct navigation for reliable download
    const icsUrl = `/api/calendar/${tourDate.id}`;
    globalThis.location.href = icsUrl;
  };

  return (
    <div
      className={cn(
        'rounded-xl border border-subtle bg-surface-1 p-4 transition-shadow hover:shadow-md',
        isCancelled && 'opacity-60'
      )}
    >
      <div className='flex items-start gap-4'>
        {/* Date block */}
        <div className='flex w-16 shrink-0 flex-col items-center rounded-lg bg-surface-2 py-2'>
          <span className='text-xs font-medium uppercase text-tertiary-token'>
            {monthFormatter.format(date)}
          </span>
          <span className='text-2xl font-bold text-primary-token'>
            {dayFormatter.format(date)}
          </span>
          <span className='text-xs text-tertiary-token'>
            {weekdayFormatter.format(date)}
          </span>
        </div>

        {/* Event details */}
        <div className='min-w-0 flex-1'>
          <div className='flex items-start justify-between gap-2'>
            <div>
              {tourDate.title && (
                <p className='text-sm font-medium text-accent'>
                  {tourDate.title}
                </p>
              )}
              <h3 className='font-semibold text-primary-token'>
                {tourDate.venueName}
              </h3>
              <p className='text-sm text-secondary-token'>{location}</p>
              {tourDate.startTime && (
                <p className='mt-1 text-sm text-tertiary-token'>
                  Doors: {tourDate.startTime}
                </p>
              )}
            </div>

            {/* Status badges */}
            <div className='flex shrink-0 flex-col items-end gap-1'>
              {isNearYou && (
                <span className='inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'>
                  <Icon name='MapPin' className='h-3 w-3' />
                  {distanceKm === null || distanceKm === undefined
                    ? 'Near You'
                    : `${Math.round(distanceKm)} km away`}
                </span>
              )}
              {isSoldOut && (
                <span className='rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'>
                  Sold Out
                </span>
              )}
              {isCancelled && (
                <span className='rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900/30 dark:text-red-400'>
                  Cancelled
                </span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className='mt-3 flex items-center gap-2'>
            {tourDate.ticketUrl && !isCancelled && !isSoldOut && (
              <a
                href={tourDate.ticketUrl}
                target='_blank'
                rel='noopener noreferrer'
                className='inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent/90'
              >
                <Icon name='Ticket' className='h-4 w-4' />
                Get Tickets
              </a>
            )}
            {tourDate.ticketUrl && !isCancelled && isSoldOut && (
              <span className='inline-flex items-center gap-1.5 rounded-lg bg-surface-2 px-3 py-1.5 text-sm font-medium text-tertiary-token'>
                <Icon name='Ticket' className='h-4 w-4' />
                Sold Out
              </span>
            )}
            <button
              type='button'
              onClick={handleAddToCalendar}
              className='inline-flex items-center gap-1.5 rounded-lg bg-surface-2 px-3 py-1.5 text-sm font-medium text-secondary-token transition-colors hover:bg-surface-3'
            >
              <Icon name='CalendarPlus' className='h-4 w-4' />
              Add to Calendar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
