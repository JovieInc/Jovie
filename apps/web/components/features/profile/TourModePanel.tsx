'use client';

import { MapPin } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { useBreakpointDown } from '@/hooks/useBreakpoint';
import {
  type TourDateWithProximity,
  useTourDateProximity,
} from '@/hooks/useTourDateProximity';
import { useTourDateTicketClick } from '@/hooks/useTourDateTicketClick';
import { useUserLocation } from '@/hooks/useUserLocation';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
import { cn } from '@/lib/utils';
import { formatLocationString } from '@/lib/utils/string-utils';
import type { Artist } from '@/types/db';
import { ArtistNotificationsCTA } from './artist-notifications-cta/ArtistNotificationsCTA';
import { ProfileDrawerShell } from './ProfileDrawerShell';

interface TourModePanelProps {
  readonly artist: Artist;
  readonly tourDates: TourDateViewModel[];
}

function getTicketStatusClassName(
  ticketStatus: TourDateViewModel['ticketStatus'],
  canBuyTickets: boolean
): string {
  if (ticketStatus === 'sold_out') {
    return 'border-white/8 bg-transparent text-white/38';
  }

  return canBuyTickets
    ? 'border-white/14 bg-white/[0.02] text-white'
    : 'border-white/8 bg-transparent text-white/38';
}

function getTicketStatusLabel(
  ticketStatus: TourDateViewModel['ticketStatus'],
  canBuyTickets: boolean
): string {
  if (ticketStatus === 'sold_out') {
    return 'Sold Out';
  }

  if (canBuyTickets) {
    return 'Tickets';
  }

  return 'No Tickets';
}

function toDisplayDate(value: string) {
  const parsed = new Date(value);

  return {
    month: new Intl.DateTimeFormat('en-US', {
      month: 'short',
      timeZone: 'UTC',
    }).format(parsed),
    day: new Intl.DateTimeFormat('en-US', {
      day: '2-digit',
      timeZone: 'UTC',
    }).format(parsed),
  };
}

function DateBox({
  date,
  featured: _featured,
}: Readonly<{
  readonly date: string;
  readonly featured: boolean;
}>) {
  const displayDate = useMemo(() => toDisplayDate(date), [date]);

  return (
    <div className='flex w-11 shrink-0 flex-col items-center justify-center'>
      <span className='text-[10px] font-[680] uppercase tracking-[0.14em] text-white/52'>
        {displayDate.month}
      </span>
      <span className='mt-1 text-[20px] font-[680] leading-none tracking-[-0.02em] text-white tabular-nums'>
        {displayDate.day}
      </span>
    </div>
  );
}

function TourDateRow({
  artistHandle,
  item,
  featured,
  nearby,
}: Readonly<{
  readonly artistHandle: string;
  readonly item: TourDateWithProximity;
  readonly featured: boolean;
  readonly nearby: boolean;
}>) {
  const location = formatLocationString([
    item.date.city,
    item.date.region,
    !item.date.region ? item.date.country : null,
  ]);
  const canBuyTickets =
    Boolean(item.date.ticketUrl) &&
    item.date.ticketStatus !== 'cancelled' &&
    item.date.ticketStatus !== 'sold_out';
  const handleTicketClick = useTourDateTicketClick(
    artistHandle,
    item.date.id,
    item.date.ticketUrl
  );

  return (
    <div
      className={cn(
        'grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3.5 transition-colors duration-200 hover:bg-white/[0.03]',
        'border-t border-white/[0.075] first:border-t-0',
        item.date.ticketStatus === 'cancelled' && 'opacity-50'
      )}
    >
      <DateBox date={item.date.startDate} featured={featured} />

      <div className='min-w-0'>
        {featured ? (
          <div className='mb-1 inline-flex items-center gap-1 text-[10px] font-[680] uppercase tracking-[0.12em] text-sky-300'>
            <MapPin className='h-[10px] w-[10px]' />
            <span>{nearby ? 'Near You' : 'Upcoming'}</span>
          </div>
        ) : null}

        <p className='truncate text-[15px] font-medium tracking-[-0.03em] text-white'>
          {item.date.venueName}
        </p>
        <p className='mt-0.5 truncate text-[12px] font-medium tracking-[-0.01em] text-white/52'>
          {location}
        </p>
      </div>

      {canBuyTickets ? (
        <a
          href={item.date.ticketUrl ?? undefined}
          onClick={handleTicketClick}
          target='_blank'
          rel='noopener noreferrer'
          className={cn(
            'inline-flex h-8 shrink-0 items-center rounded-full border px-3 text-[12px] font-semibold tracking-[-0.01em] transition-[border-color,background-color,opacity] duration-200 hover:opacity-90',
            getTicketStatusClassName(item.date.ticketStatus, canBuyTickets)
          )}
        >
          {getTicketStatusLabel(item.date.ticketStatus, canBuyTickets)}
        </a>
      ) : (
        <span
          className={cn(
            'inline-flex h-8 shrink-0 items-center rounded-full border px-3 text-[12px] font-semibold tracking-[-0.01em]',
            getTicketStatusClassName(item.date.ticketStatus, canBuyTickets)
          )}
        >
          {getTicketStatusLabel(item.date.ticketStatus, canBuyTickets)}
        </span>
      )}
    </div>
  );
}

function TourDatesContent({
  artist,
  nearby,
  allDates,
}: Readonly<{
  readonly artist: Artist;
  readonly nearby: TourDateWithProximity[];
  readonly allDates: TourDateWithProximity[];
}>) {
  if (allDates.length === 0) {
    return (
      <div className='space-y-4'>
        <p className='text-[16px] font-medium tracking-[-0.03em] text-white'>
          No upcoming events.
        </p>
        <ArtistNotificationsCTA
          artist={artist}
          forceExpanded
          hideListenFallback
          source='tour_drawer'
          presentation='overlay'
        />
      </div>
    );
  }

  const nearbyIds = new Set(nearby.map(item => item.date.id));
  const featuredId = nearby[0]?.date.id ?? allDates[0]?.date.id ?? null;

  return (
    <div
      className='border-y border-white/[0.075]'
      data-testid='tour-drawer-list'
    >
      {allDates.map(item => (
        <TourDateRow
          key={item.date.id}
          artistHandle={artist.handle}
          item={item}
          featured={item.date.id === featuredId}
          nearby={nearbyIds.has(item.date.id)}
        />
      ))}
    </div>
  );
}

export function TourDrawerContent({
  artist,
  tourDates,
}: Readonly<{
  readonly artist: Artist;
  readonly tourDates: TourDateViewModel[];
}>) {
  const { location } = useUserLocation();
  const { nearbyDates, allDates } = useTourDateProximity(tourDates, location);

  return (
    <div data-testid='tour-drawer-content'>
      <TourDatesContent
        artist={artist}
        nearby={nearbyDates}
        allDates={allDates}
      />
    </div>
  );
}

export function TourModePanel({
  artist,
  tourDates,
}: Readonly<TourModePanelProps>) {
  const isMobile = useBreakpointDown('md');
  const router = useRouter();

  if (!isMobile) {
    return (
      <div className='max-h-[min(62vh,560px)] overflow-y-auto pr-1'>
        <TourDrawerContent artist={artist} tourDates={tourDates} />
      </div>
    );
  }

  return (
    <ProfileDrawerShell
      open
      onOpenChange={open => !open && router.replace(`/${artist.handle}`)}
      title='All Shows'
      dataTestId='tour-drawer'
    >
      <TourDrawerContent artist={artist} tourDates={tourDates} />
    </ProfileDrawerShell>
  );
}
