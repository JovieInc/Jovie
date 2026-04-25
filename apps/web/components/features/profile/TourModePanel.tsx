'use client';

import { ChevronRight, MapPin } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { useBreakpointDown } from '@/hooks/useBreakpoint';
import {
  type TourDateWithProximity,
  useTourDateProximity,
} from '@/hooks/useTourDateProximity';
import { useTourDateTicketClick } from '@/hooks/useTourDateTicketClick';
import { useUserLocation } from '@/hooks/useUserLocation';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
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
    return 'text-[rgb(118,114,255)]';
  }
  return canBuyTickets ? 'text-white/62' : 'text-white/34';
}

function getTicketStatusLabel(
  ticketStatus: TourDateViewModel['ticketStatus'],
  canBuyTickets: boolean
): string {
  if (ticketStatus === 'sold_out') return 'Sold out';
  if (canBuyTickets) return 'Tickets';
  return 'No tickets';
}

/** Date box showing month + day stacked vertically, formatted in UTC to avoid timezone shift */
function DateBox({ date }: { readonly date: string }) {
  const parsedDate = new Date(date);
  const monthLabel = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    timeZone: 'UTC',
  }).format(parsedDate);
  const dayLabel = new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    timeZone: 'UTC',
  }).format(parsedDate);

  return (
    <div className='flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl border border-white/6'>
      <span className='text-[0.7rem] font-semibold uppercase tracking-[0.06em] text-white/44'>
        {monthLabel}
      </span>
      <span className='text-[1.2rem] font-bold leading-tight text-white/80'>
        {dayLabel}
      </span>
    </div>
  );
}

function TourDateRow({
  artistHandle,
  date,
  distanceMiles,
  showNearbyBadge,
}: {
  readonly artistHandle: string;
  readonly date: TourDateViewModel;
  readonly distanceMiles: number | null;
  readonly showNearbyBadge: boolean;
}) {
  const location = formatLocationString([date.city, date.region, date.country]);
  const canBuyTickets =
    Boolean(date.ticketUrl) &&
    date.ticketStatus !== 'cancelled' &&
    date.ticketStatus !== 'sold_out';
  const handleTicketClick = useTourDateTicketClick(
    artistHandle,
    date.id,
    date.ticketUrl
  );
  const ticketStatusClassName = getTicketStatusClassName(
    date.ticketStatus,
    canBuyTickets
  );
  const ticketStatusLabel = getTicketStatusLabel(
    date.ticketStatus,
    canBuyTickets
  );

  return (
    <div className='flex items-center gap-3 border-t border-white/6 py-3 first:border-t-0'>
      <DateBox date={date.startDate} />

      <div className='min-w-0 flex-1'>
        <p className='truncate text-[0.95rem] font-semibold tracking-[-0.02em] text-white'>
          {date.venueName}
        </p>
        <p className='mt-0.5 truncate text-[0.85rem] text-white/44'>
          {location}
        </p>
        {showNearbyBadge && (
          <p className='mt-1 inline-flex items-center gap-1 text-[0.78rem] font-medium text-white/54'>
            <MapPin className='h-3 w-3' />
            {distanceMiles === null
              ? 'In your area'
              : `${Math.round(distanceMiles)} mi away`}
          </p>
        )}
      </div>

      <div className='shrink-0'>
        {canBuyTickets ? (
          <a
            href={date.ticketUrl ?? undefined}
            onClick={handleTicketClick}
            target='_blank'
            rel='noopener noreferrer'
            className={`inline-flex items-center rounded-full border border-white/12 px-3 py-1 text-[0.82rem] font-semibold tracking-[-0.01em] transition-opacity hover:opacity-80 ${ticketStatusClassName}`}
          >
            {ticketStatusLabel}
          </a>
        ) : (
          <span
            className={`inline-flex items-center rounded-full border border-white/6 px-3 py-1 text-[0.82rem] font-semibold tracking-[-0.01em] ${ticketStatusClassName}`}
          >
            {ticketStatusLabel}
          </span>
        )}
      </div>
    </div>
  );
}

/** Section header in small caps */
function SectionLabel({ children }: { readonly children: React.ReactNode }) {
  return (
    <p className='mb-2 text-[0.76rem] font-semibold uppercase tracking-[0.06em] text-white/34'>
      {children}
    </p>
  );
}

/** Collapsible disclosure for other cities */
function OtherCitiesDisclosure({
  count,
  expanded,
  onToggle,
  children,
  listId,
}: {
  readonly count: number;
  readonly expanded: boolean;
  readonly onToggle: () => void;
  readonly children: React.ReactNode;
  readonly listId: string;
}) {
  return (
    <div>
      <button
        type='button'
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={listId}
        className='flex w-full items-center justify-between py-3 text-[0.85rem] font-semibold text-white/48 transition-colors hover:text-white/62 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/20 focus-visible:ring-offset-2 focus-visible:ring-offset-[rgb(24,24,28)]'
      >
        <span>
          {count} {count === 1 ? 'event' : 'events'} in other cities
        </span>
        <ChevronRight
          className={`h-4 w-4 transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}
        />
      </button>
      {expanded && (
        <div
          id={listId}
          className='animate-in fade-in slide-in-from-top-1 duration-200'
        >
          {children}
        </div>
      )}
    </div>
  );
}

function TourDatesContent({
  artist,
  nearby,
  allDates,
  hasLocation,
  isLocationLoading,
}: {
  readonly artist: Artist;
  readonly nearby: TourDateWithProximity[];
  readonly allDates: TourDateWithProximity[];
  readonly hasLocation: boolean;
  readonly isLocationLoading: boolean;
}) {
  const [showAllDates, setShowAllDates] = useState(false);
  const disclosureId = useId();

  // State 3: No dates at all
  if (allDates.length === 0) {
    return (
      <div className='space-y-4'>
        <p className='text-[1.02rem] font-semibold tracking-[-0.02em] text-white'>
          No upcoming events.
        </p>
        <ArtistNotificationsCTA
          artist={artist}
          forceExpanded
          hideListenFallback
          source='tour_drawer'
        />
      </div>
    );
  }

  // State 4 & 5: No geolocation or still loading
  // While geo is loading OR denied, show all dates without Near You section.
  // This prevents the jarring flip from "All Dates" to "No events near you" CTA.
  if (!hasLocation || isLocationLoading) {
    return (
      <div>
        <SectionLabel>All Dates</SectionLabel>
        {allDates.map(item => (
          <TourDateRow
            key={item.date.id}
            artistHandle={artist.handle}
            date={item.date}
            distanceMiles={item.distanceMiles}
            showNearbyBadge={false}
          />
        ))}
      </div>
    );
  }

  // State 1: Has nearby dates
  if (nearby.length > 0) {
    return (
      <div className='space-y-5'>
        <section>
          <SectionLabel>Events near you</SectionLabel>
          {nearby.map(item => (
            <TourDateRow
              key={`nearby-${item.date.id}`}
              artistHandle={artist.handle}
              date={item.date}
              distanceMiles={item.distanceMiles}
              showNearbyBadge
            />
          ))}
        </section>

        <section>
          <SectionLabel>All Dates</SectionLabel>
          {allDates.map(item => (
            <TourDateRow
              key={item.date.id}
              artistHandle={artist.handle}
              date={item.date}
              distanceMiles={item.distanceMiles}
              showNearbyBadge={false}
            />
          ))}
        </section>
      </div>
    );
  }

  // State 2 & 2b: No nearby dates, but dates exist (CONVERSION STATE)
  return (
    <div className='space-y-4'>
      <section>
        <p className='text-[1.02rem] font-semibold tracking-[-0.02em] text-white'>
          No events near you.
        </p>
        <div className='mt-4'>
          <ArtistNotificationsCTA
            artist={artist}
            forceExpanded
            hideListenFallback
            source='tour_drawer'
          />
        </div>
      </section>

      <OtherCitiesDisclosure
        count={allDates.length}
        expanded={showAllDates}
        onToggle={() => setShowAllDates(prev => !prev)}
        listId={disclosureId}
      >
        {allDates.map(item => (
          <TourDateRow
            key={item.date.id}
            artistHandle={artist.handle}
            date={item.date}
            distanceMiles={item.distanceMiles}
            showNearbyBadge={false}
          />
        ))}
      </OtherCitiesDisclosure>
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
  const { location, isLoading } = useUserLocation();
  const { nearbyDates, allDates } = useTourDateProximity(tourDates, location);

  return (
    <div data-testid='tour-drawer-content'>
      <TourDatesContent
        artist={artist}
        nearby={nearbyDates}
        allDates={allDates}
        hasLocation={location !== null}
        isLocationLoading={isLoading}
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
  const hasNoDates = tourDates.length === 0;

  if (hasNoDates) {
    if (!isMobile) {
      return <TourDrawerContent artist={artist} tourDates={tourDates} />;
    }

    return (
      <ProfileDrawerShell
        open
        onOpenChange={open => !open && router.replace(`/${artist.handle}`)}
        title='Tour Dates'
        dataTestId='tour-drawer'
      >
        <TourDrawerContent artist={artist} tourDates={tourDates} />
      </ProfileDrawerShell>
    );
  }

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
      title='Tour Dates'
      contentClassName='bg-[rgb(24,24,28)] border-white/8'
      bodyClassName='bg-[rgb(24,24,28)] px-4 pt-2'
      dataTestId='tour-drawer'
    >
      <TourDrawerContent artist={artist} tourDates={tourDates} />
    </ProfileDrawerShell>
  );
}
