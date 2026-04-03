'use client';

import { Calendar, MapPin } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import type { TourDateViewModel } from '@/app/app/(shell)/dashboard/tour-dates/actions';
import { useBreakpointDown } from '@/hooks/useBreakpoint';
import { useTourDateTicketClick } from '@/hooks/useTourDateTicketClick';
import { useUserLocation } from '@/hooks/useUserLocation';
import { calculateDistanceMiles } from '@/lib/geo';

import { formatLocationString } from '@/lib/utils/string-utils';
import type { Artist } from '@/types/db';
import { ProfileDrawerShell } from './ProfileDrawerShell';

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

  const handleTicketClick = useTourDateTicketClick(
    handle,
    date.id,
    date.ticketUrl
  );
  const monthLabel = new Intl.DateTimeFormat('en-US', {
    month: 'short',
  }).format(parsedDate);
  const dayLabel = new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
  }).format(parsedDate);

  return (
    <div className='grid gap-4 rounded-[26px] border border-[color:var(--profile-pearl-border)] bg-[var(--profile-pearl-bg)] px-4 py-4 shadow-[var(--profile-pearl-shadow)] backdrop-blur-xl sm:grid-cols-[64px_minmax(0,1fr)_auto] sm:items-center'>
      <div className='flex h-16 w-16 flex-col items-center justify-center rounded-[20px] border border-[color:var(--profile-pearl-border)] bg-[var(--profile-pearl-bg-active)] text-center shadow-[var(--profile-pearl-shadow)]'>
        <span className='text-[0.68rem] font-[590] uppercase tracking-[0.14em] text-secondary-token'>
          {monthLabel}
        </span>
        <span className='mt-1 text-[1.35rem] font-[680] tracking-[-0.05em] text-primary-token'>
          {dayLabel}
        </span>
      </div>

      <div className='min-w-0'>
        <div className='flex flex-wrap items-center gap-2'>
          <p className='truncate text-base font-[590] text-primary-token'>
            {date.venueName}
          </p>
          {showNearbyBadge ? (
            <span className='inline-flex items-center gap-1 rounded-full border border-[color:var(--profile-pearl-border)] bg-[var(--profile-pearl-bg-active)] px-2.5 py-1 text-[0.7rem] font-medium text-secondary-token shadow-[var(--profile-pearl-shadow)]'>
              <MapPin className='h-3 w-3' />
              {distanceMiles === null
                ? 'Nearby'
                : `${Math.round(distanceMiles)} mi`}
            </span>
          ) : null}
        </div>
        <p className='mt-1 text-sm text-secondary-token'>
          {monthDayFormatter.format(parsedDate)}
        </p>
        {location ? (
          <p className='truncate text-sm text-tertiary-token'>{location}</p>
        ) : null}
      </div>

      {canBuyTickets ? (
        <a
          href={date.ticketUrl as string}
          onClick={handleTicketClick}
          target='_blank'
          rel='noopener noreferrer'
          className='inline-flex min-h-11 items-center justify-center rounded-full bg-[var(--profile-pearl-primary-bg)] px-4 py-2.5 text-[15px] font-semibold tracking-[-0.015em] text-[var(--profile-pearl-primary-fg)] shadow-[var(--profile-pearl-shadow)] transition-[opacity,transform] hover:opacity-92 active:scale-[0.985]'
        >
          Tickets
        </a>
      ) : (
        <span className='inline-flex min-h-11 items-center justify-center rounded-full border border-[color:var(--profile-pearl-border)] bg-[var(--profile-pearl-bg-active)] px-4 py-2.5 text-[15px] font-medium tracking-[-0.015em] text-tertiary-token shadow-[var(--profile-pearl-shadow)]'>
          {date.ticketStatus === 'sold_out' ? 'Sold out' : 'No tickets'}
        </span>
      )}
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
      <div className='rounded-[28px] border border-[color:var(--profile-pearl-border)] bg-[var(--profile-pearl-bg)] p-5 text-center shadow-[0_10px_24px_rgba(15,17,24,0.06)] backdrop-blur-xl dark:shadow-[0_14px_30px_rgba(0,0,0,0.18)]'>
        <div className='mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--profile-pearl-bg-active)]'>
          <Calendar className='h-[18px] w-[18px] text-secondary-token' />
        </div>
        <p className='mx-auto mt-2 max-w-[28rem] text-[15px] leading-6 text-secondary-token'>
          {artist.name} is not currently on tour. Get notified when dates are
          announced.
        </p>
        <div className='mt-4 flex justify-center'>
          <Link
            href={`/${artist.handle}?mode=subscribe`}
            className='inline-flex w-full items-center justify-center rounded-full bg-[var(--profile-pearl-primary-bg)] px-4 py-3 text-[15px] font-semibold tracking-[-0.015em] text-[var(--profile-pearl-primary-fg)] shadow-none transition-opacity duration-200 hover:opacity-92'
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
          <span className='text-xs font-medium text-tertiary-token'>
            More dates
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
    <ProfileDrawerShell
      open
      onOpenChange={open => !open && router.replace(`/${artist.handle}`)}
      title={`${artist.name} tour dates`}
      subtitle='See upcoming stops and grab tickets.'
      dataTestId='tour-drawer'
    >
      {content}
    </ProfileDrawerShell>
  );
}
