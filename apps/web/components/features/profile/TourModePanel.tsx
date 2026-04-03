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

function getTicketStatusClassName(
  ticketStatus: TourDateViewModel['ticketStatus'],
  canBuyTickets: boolean,
  compact: boolean
): string {
  if (ticketStatus === 'sold_out') {
    return 'text-[rgb(118,114,255)]';
  }

  if (canBuyTickets) {
    return compact ? 'text-white/62' : 'text-secondary-token';
  }

  return compact ? 'text-white/34' : 'text-tertiary-token';
}

function getTicketStatusLabel(
  ticketStatus: TourDateViewModel['ticketStatus'],
  canBuyTickets: boolean
): string {
  if (ticketStatus === 'sold_out') {
    return 'Sold out';
  }

  if (canBuyTickets) {
    return 'Tickets';
  }

  return 'No tickets';
}

function TourDateRow({
  artistHandle,
  date,
  distanceMiles,
  showNearbyBadge,
  compact = false,
}: {
  readonly artistHandle: string;
  readonly date: TourDateViewModel;
  readonly distanceMiles: number | null;
  readonly showNearbyBadge: boolean;
  readonly compact?: boolean;
}) {
  const parsedDate = new Date(date.startDate);
  const location = formatLocationString([date.city, date.region, date.country]);
  const canBuyTickets =
    Boolean(date.ticketUrl) &&
    date.ticketStatus !== 'cancelled' &&
    date.ticketStatus !== 'sold_out';
  const monthLabel = new Intl.DateTimeFormat('en-US', {
    month: 'short',
  }).format(parsedDate);
  const dayLabel = new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
  }).format(parsedDate);
  const handleTicketClick = useTourDateTicketClick(
    artistHandle,
    date.id,
    date.ticketUrl
  );
  const ticketStatusClassName = getTicketStatusClassName(
    date.ticketStatus,
    canBuyTickets,
    compact
  );
  const ticketStatusLabel = getTicketStatusLabel(
    date.ticketStatus,
    canBuyTickets
  );

  const ticketStatusContent = canBuyTickets ? (
    <a
      href={date.ticketUrl ?? undefined}
      onClick={handleTicketClick}
      target='_blank'
      rel='noopener noreferrer'
      className={ticketStatusClassName}
    >
      {ticketStatusLabel}
    </a>
  ) : (
    <p className={ticketStatusClassName}>{ticketStatusLabel}</p>
  );

  if (compact) {
    return (
      <div className='flex items-start justify-between gap-4 border-t border-white/6 py-4 first:border-t-0'>
        <div className='min-w-0'>
          <p className='truncate text-[1.02rem] font-[600] tracking-[-0.02em] text-white'>
            {date.city && date.region
              ? `${date.city}, ${date.region}`
              : date.venueName}
          </p>
          <p className='mt-1 truncate text-[0.92rem] text-white/44'>
            {date.venueName}
          </p>
          {showNearbyBadge ? (
            <p className='mt-2 inline-flex items-center gap-1 text-[0.78rem] font-medium text-white/54'>
              <MapPin className='h-3 w-3' />
              {distanceMiles === null
                ? 'In your area'
                : `${Math.round(distanceMiles)} mi away`}
            </p>
          ) : null}
        </div>

        <div className='shrink-0 text-right'>
          <p className='text-[0.92rem] font-[590] tracking-[-0.015em] text-white/78'>
            {monthLabel} {dayLabel}
          </p>
          <div className='mt-1 text-[0.82rem] font-[590] tracking-[-0.01em]'>
            {ticketStatusContent}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className='flex items-start justify-between gap-4 border-t border-white/6 py-4 first:border-t-0'>
      <div className='min-w-0'>
        <p className='truncate text-[1.02rem] font-[600] tracking-[-0.02em] text-primary-token'>
          {date.city && date.region
            ? `${date.city}, ${date.region}`
            : date.venueName}
        </p>
        <p className='mt-1 truncate text-[0.92rem] text-secondary-token'>
          {date.venueName}
        </p>
        {location ? (
          <p className='mt-1 truncate text-[0.9rem] text-tertiary-token'>
            {location}
          </p>
        ) : null}
        {showNearbyBadge ? (
          <p className='mt-2 inline-flex items-center gap-1 text-[0.78rem] font-medium text-secondary-token'>
            <MapPin className='h-3 w-3' />
            {distanceMiles === null
              ? 'In your area'
              : `${Math.round(distanceMiles)} mi away`}
          </p>
        ) : null}
      </div>

      <div className='shrink-0 text-right'>
        <p className='text-[0.92rem] font-[590] tracking-[-0.015em] text-primary-token'>
          {monthLabel} {dayLabel}
        </p>
        <div className='mt-1 text-[0.82rem] font-[590] tracking-[-0.01em]'>
          {ticketStatusContent}
        </div>
      </div>
    </div>
  );
}

function TourDatesContent({
  artist,
  nearby,
  remaining,
  compact = false,
}: {
  readonly artist: Artist;
  readonly nearby: TourDateWithProximity[];
  readonly remaining: TourDateWithProximity[];
  readonly compact?: boolean;
}) {
  if (nearby.length === 0 && remaining.length === 0) {
    return (
      <div
        data-testid='tour-empty-state'
        className={`${
          compact
            ? 'rounded-[28px] border border-white/8 bg-white/[0.035] px-5 py-6 text-left'
            : 'rounded-[28px] border border-[color:var(--profile-pearl-border)] bg-[var(--profile-pearl-bg)] px-6 py-7 text-center shadow-[0_10px_24px_rgba(15,17,24,0.06)] backdrop-blur-xl dark:shadow-[0_14px_30px_rgba(0,0,0,0.18)]'
        }`}
      >
        <div className='mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--profile-pearl-bg-active)]'>
          <Calendar className='h-[18px] w-[18px] text-secondary-token' />
        </div>
        <p
          className={`mt-2 max-w-[24rem] text-[15px] leading-6 ${
            compact ? 'text-white/70' : 'mx-auto text-secondary-token'
          }`}
        >
          {artist.name} is not currently on tour. Get notified when dates are
          announced.
        </p>
        <div className='mt-5 flex justify-center'>
          <Link
            href={`/${artist.handle}?mode=subscribe`}
            className='inline-flex min-w-[15rem] items-center justify-center rounded-full bg-[var(--profile-pearl-primary-bg)] px-5 py-3 text-[15px] font-semibold tracking-[-0.015em] text-[var(--profile-pearl-primary-fg)] shadow-none transition-opacity duration-200 hover:opacity-92'
          >
            Turn on notifications
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={compact ? 'space-y-5' : 'space-y-3'}>
      {nearby.length > 0 ? (
        <section>
          <p className='mb-2 text-[0.76rem] font-[600] tracking-[0.06em] text-white/34'>
            In Your Area
          </p>
          {nearby.map(item => (
            <TourDateRow
              key={item.date.id}
              artistHandle={artist.handle}
              date={item.date}
              distanceMiles={item.distanceMiles}
              showNearbyBadge
              compact={compact}
            />
          ))}
        </section>
      ) : null}

      {remaining.length > 0 ? (
        <section>
          <p className='mb-2 text-[0.76rem] font-[600] tracking-[0.06em] text-white/34'>
            {nearby.length > 0 ? 'Upcoming' : 'Tour Dates'}
          </p>
          {remaining.map(item => (
            <TourDateRow
              key={item.date.id}
              artistHandle={artist.handle}
              date={item.date}
              distanceMiles={item.distanceMiles}
              showNearbyBadge={false}
              compact={compact}
            />
          ))}
        </section>
      ) : null}
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
  const hasNoDates = tourDates.length === 0;

  const listHeader = (
    <div className='mb-4 flex items-center gap-3 rounded-[16px] border border-white/6 bg-white/[0.035] px-3 py-3'>
      <div className='inline-flex min-w-0 items-center gap-2 rounded-[12px] bg-white/[0.04] px-3 py-2 text-[0.85rem] font-medium text-white/48'>
        <MapPin className='h-3.5 w-3.5 shrink-0' />
        <span className='truncate'>
          {nearbyDates.length > 0 && nearbyDates[0]
            ? `Nearby: ${formatLocationString([
                nearbyDates[0].date.city,
                nearbyDates[0].date.region,
              ])}`
            : 'All upcoming shows'}
        </span>
      </div>
    </div>
  );

  const content = (
    <div className='rounded-[28px] border border-white/8 bg-white/[0.035] p-4 shadow-[0_18px_40px_rgba(0,0,0,0.22)]'>
      {showSummaryHeader && (
        <p className='mb-4 text-sm text-secondary-token'>
          {tourDates.length} upcoming{' '}
          {tourDates.length === 1 ? 'show' : 'shows'}
        </p>
      )}
      {listHeader}
      <TourDatesContent
        artist={artist}
        nearby={nearbyDates}
        remaining={remainingDates}
        compact
      />
    </div>
  );

  if (hasNoDates) {
    const emptyContent = (
      <div className='mx-auto w-full max-w-[32rem]'>
        <TourDatesContent
          artist={artist}
          nearby={nearbyDates}
          remaining={remainingDates}
          compact={false}
        />
      </div>
    );

    if (!isMobile) {
      return emptyContent;
    }

    return (
      <ProfileDrawerShell
        open
        onOpenChange={open => !open && router.replace(`/${artist.handle}`)}
        title='Tour Dates'
        contentClassName='bg-[rgb(24,24,28)] border-white/8'
        bodyClassName='bg-[rgb(24,24,28)] px-4 pt-2'
        dataTestId='tour-drawer'
      >
        {emptyContent}
      </ProfileDrawerShell>
    );
  }

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
      title='Tour Dates'
      contentClassName='bg-[rgb(24,24,28)] border-white/8'
      bodyClassName='bg-[rgb(24,24,28)] px-4 pt-2'
      dataTestId='tour-drawer'
    >
      {content}
    </ProfileDrawerShell>
  );
}
