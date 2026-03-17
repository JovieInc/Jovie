'use client';

import { Calendar, MapPin } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import { Drawer } from 'vaul';
import type { TourDateViewModel } from '@/app/app/(shell)/dashboard/tour-dates/actions';
import { useBreakpointDown } from '@/hooks/useBreakpoint';
import { useUserLocation } from '@/hooks/useUserLocation';
import { calculateDistanceMiles } from '@/lib/geo';
import { useTrackingMutation } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { formatLocationString } from '@/lib/utils/string-utils';
import type { Artist } from '@/types/db';
import { DRAWER_OVERLAY_CLASS } from './drawer-overlay-styles';

const NEARBY_MILES_THRESHOLD = 50;

interface TourModePanelProps {
  readonly artist: Artist;
  readonly tourDates: TourDateViewModel[];
}

interface TourDateWithProximity {
  readonly date: TourDateViewModel;
  readonly distanceMiles: number | null;
  readonly isNearby: boolean;
}

const monthDayFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
});

function TourDateRow({
  date,
  distanceMiles,
  showNearbyBadge,
  handle,
}: {
  readonly date: TourDateViewModel;
  readonly distanceMiles: number | null;
  readonly showNearbyBadge: boolean;
  readonly handle: string;
}) {
  const parsedDate = new Date(date.startDate);
  const location = formatLocationString([date.city, date.region, date.country]);
  const canBuyTickets =
    Boolean(date.ticketUrl) &&
    date.ticketStatus !== 'cancelled' &&
    date.ticketStatus !== 'sold_out';

  const trackClick = useTrackingMutation({ endpoint: '/api/track' });

  const handleTicketClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      if (!date.ticketUrl) return;
      trackClick.mutate({
        handle,
        linkType: 'other',
        target: date.ticketUrl,
        context: { contentType: 'tour_date', contentId: date.id },
      });
      globalThis.open(date.ticketUrl, '_blank', 'noopener,noreferrer');
    },
    // trackClick.mutate is stable in TanStack Query v5 — omit trackClick object
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [handle, date.ticketUrl, date.id]
  );

  return (
    <div className='rounded-xl border border-subtle bg-surface-1 px-3 py-3'>
      <div className='flex items-center justify-between gap-3'>
        <div className='min-w-0'>
          <div className='flex items-center gap-2'>
            <p className='truncate text-sm font-[var(--font-weight-medium)] text-primary-token'>
              {location}
            </p>
            {showNearbyBadge && (
              <span className='inline-flex items-center gap-1 rounded-full border border-subtle bg-surface-2 px-2 py-0.5 text-2xs text-secondary-token'>
                <MapPin className='h-3 w-3' />
                {distanceMiles === null
                  ? 'Nearby'
                  : `${Math.round(distanceMiles)} mi`}
              </span>
            )}
          </div>
          <p className='mt-1 text-xs text-tertiary-token'>
            {monthDayFormatter.format(parsedDate)} · {date.venueName}
          </p>
        </div>
        {canBuyTickets ? (
          <a
            href={date.ticketUrl as string}
            onClick={handleTicketClick}
            target='_blank'
            rel='noopener noreferrer'
            className='rounded-full bg-accent px-3 py-1.5 text-xs font-[var(--font-weight-medium)] text-white transition-colors hover:bg-accent/90'
          >
            Tickets
          </a>
        ) : (
          <span className='rounded-full bg-surface-2 px-3 py-1.5 text-xs text-tertiary-token'>
            {date.ticketStatus === 'sold_out' ? 'Sold out' : 'No tickets'}
          </span>
        )}
      </div>
    </div>
  );
}

function TourDatesContent({
  artist,
  nearby,
  remaining,
}: {
  readonly artist: Artist;
  readonly nearby: TourDateWithProximity[];
  readonly remaining: TourDateWithProximity[];
}) {
  if (nearby.length === 0 && remaining.length === 0) {
    return (
      <div className='rounded-2xl border border-subtle bg-surface-1 p-5 text-center'>
        <div className='mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-surface-2'>
          <Calendar className='h-5 w-5 text-tertiary-token' />
        </div>
        <p className='mt-2 text-sm text-secondary-token'>
          {artist.name} is not currently on tour. Get notified when dates are
          announced.
        </p>
        <div className='mt-4 flex justify-center'>
          <Link
            href={`/${artist.handle}/notifications`}
            className='inline-flex w-full items-center justify-center rounded-full bg-accent px-4 py-2.5 text-sm font-[var(--font-weight-medium)] text-white transition-colors hover:bg-accent/90'
          >
            Turn on notifications
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className='space-y-3'>
      {nearby.map(item => (
        <TourDateRow
          key={item.date.id}
          date={item.date}
          distanceMiles={item.distanceMiles}
          showNearbyBadge
          handle={artist.handle}
        />
      ))}

      {nearby.length > 0 && remaining.length > 0 && (
        <div className='flex items-center gap-2 px-1 py-2'>
          <div className='h-px flex-1 bg-subtle' />
          <span className='text-2xs uppercase tracking-wide text-tertiary-token'>
            All upcoming dates
          </span>
          <div className='h-px flex-1 bg-subtle' />
        </div>
      )}

      {remaining.map(item => (
        <TourDateRow
          key={item.date.id}
          date={item.date}
          distanceMiles={item.distanceMiles}
          showNearbyBadge={false}
          handle={artist.handle}
        />
      ))}
    </div>
  );
}

export function TourModePanel({
  artist,
  tourDates,
}: Readonly<TourModePanelProps>) {
  const isMobile = useBreakpointDown('md');
  const router = useRouter();
  const { location } = useUserLocation();

  const { nearbyDates, remainingDates } = useMemo(() => {
    const withDistance: TourDateWithProximity[] = tourDates.map(date => {
      if (location && date.latitude != null && date.longitude != null) {
        const distanceMiles = calculateDistanceMiles(location, {
          latitude: date.latitude,
          longitude: date.longitude,
        });

        return {
          date,
          distanceMiles,
          isNearby: distanceMiles <= NEARBY_MILES_THRESHOLD,
        };
      }

      return {
        date,
        distanceMiles: null,
        isNearby: false,
      };
    });

    const nearbyDates = withDistance
      .filter(item => item.isNearby)
      .sort((a, b) => (a.distanceMiles ?? 0) - (b.distanceMiles ?? 0));

    const remainingDates = withDistance
      .filter(item => !item.isNearby)
      .sort(
        (a, b) =>
          new Date(a.date.startDate).getTime() -
          new Date(b.date.startDate).getTime()
      );

    return { nearbyDates, remainingDates };
  }, [tourDates, location]);

  const showSummaryHeader = tourDates.length > 0;

  const content = (
    <div className='space-y-4'>
      {showSummaryHeader && (
        <p className='text-sm text-secondary-token'>
          {tourDates.length} upcoming{' '}
          {tourDates.length === 1 ? 'show' : 'shows'}
        </p>
      )}
      <TourDatesContent
        artist={artist}
        nearby={nearbyDates}
        remaining={remainingDates}
      />
    </div>
  );

  if (!isMobile) {
    return (
      <div className='max-h-[min(62vh,560px)] overflow-y-auto pr-1'>
        {content}
      </div>
    );
  }

  return (
    <Drawer.Root
      open
      onOpenChange={open => !open && router.replace(`/${artist.handle}`)}
    >
      <Drawer.Portal>
        <Drawer.Overlay className={DRAWER_OVERLAY_CLASS} />
        <Drawer.Content
          className={cn(
            'fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] w-full max-w-full flex-col overflow-x-hidden rounded-t-[20px] border-t border-subtle bg-surface-2 shadow-xl'
          )}
          aria-describedby={undefined}
        >
          <div className='mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-quaternary-token/40' />
          <Drawer.Title className='px-6 pb-2 pt-4 text-center text-[15px] font-semibold tracking-tight text-primary-token'>
            {artist.name} tour dates
          </Drawer.Title>
          <div className='overflow-y-auto overscroll-contain px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]'>
            {content}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
