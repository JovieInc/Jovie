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
  featured,
}: Readonly<{
  readonly date: string;
  readonly featured: boolean;
}>) {
  const displayDate = useMemo(() => toDisplayDate(date), [date]);

  return (
    <div
      className={cn(
        'flex h-[74px] w-[60px] shrink-0 flex-col items-center justify-center rounded-[18px] border',
        featured
          ? 'border-[rgba(220,128,52,0.38)] bg-[rgba(220,128,52,0.08)]'
          : 'border-white/8 bg-white/[0.02]'
      )}
    >
      <span
        className={cn(
          'text-[11px] font-semibold uppercase tracking-[0.12em]',
          featured ? 'text-[rgb(223,144,76)]' : 'text-white/42'
        )}
      >
        {displayDate.month}
      </span>
      <span
        className={cn(
          'mt-1 text-[18px] font-semibold leading-none tracking-[-0.04em]',
          featured ? 'text-[rgb(255,184,113)]' : 'text-white'
        )}
      >
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
    item.date.country,
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
        'grid grid-cols-[60px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-4',
        featured
          ? 'rounded-[24px] border border-[rgba(220,128,52,0.32)] bg-[linear-gradient(180deg,rgba(220,128,52,0.08),rgba(220,128,52,0.03))] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]'
          : 'border-t border-white/[0.075] first:border-t-0'
      )}
    >
      <DateBox date={item.date.startDate} featured={featured} />

      <div className='min-w-0'>
        {featured ? (
          <div className='mb-2 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-[rgb(223,144,76)]'>
            <MapPin className='h-3 w-3' />
            <span>{nearby ? 'Near You' : 'Upcoming'}</span>
          </div>
        ) : null}

        <p className='truncate text-[17px] font-medium tracking-[-0.035em] text-white'>
          {item.date.venueName}
        </p>
        <p className='mt-1 truncate text-[14px] tracking-[-0.02em] text-white/56'>
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
            'inline-flex h-11 shrink-0 items-center rounded-full border px-4 text-[15px] font-medium tracking-[-0.02em] transition-[border-color,background-color,opacity] duration-200 hover:opacity-90',
            getTicketStatusClassName(item.date.ticketStatus, canBuyTickets)
          )}
        >
          {getTicketStatusLabel(item.date.ticketStatus, canBuyTickets)}
        </a>
      ) : (
        <span
          className={cn(
            'inline-flex h-11 shrink-0 items-center rounded-full border px-4 text-[15px] font-medium tracking-[-0.02em]',
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
      className='overflow-hidden rounded-[28px] border border-white/[0.08] bg-white/[0.02]'
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
