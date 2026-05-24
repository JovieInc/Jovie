'use client';

import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import type { ProfileRenderMode } from '@/features/profile/contracts';
import { useBreakpointDown } from '@/hooks/useBreakpoint';
import {
  type TourDateWithProximity,
  useTourDateProximity,
} from '@/hooks/useTourDateProximity';
import { useTourDateTicketClick } from '@/hooks/useTourDateTicketClick';
import { useUserLocation } from '@/hooks/useUserLocation';
import { track } from '@/lib/analytics';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
import { cn } from '@/lib/utils';
import { formatLocationString } from '@/lib/utils/string-utils';
import type { Artist } from '@/types/db';
import { ArtistNotificationsCTA } from './artist-notifications-cta/ArtistNotificationsCTA';
import type { NotificationSourceContext } from './artist-notifications-cta/types';
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
      <span className='text-[10px] font-semibold tracking-[0.02em] text-white/52'>
        {displayDate.month}
      </span>
      <span className='mt-1 text-[20px] font-[680] leading-none tracking-[-0.02em] text-white tabular-nums'>
        {displayDate.day}
      </span>
    </div>
  );
}

function TourDateRow({
  artistId,
  artistHandle,
  item,
}: Readonly<{
  readonly artistId: string;
  readonly artistHandle: string;
  readonly item: TourDateWithProximity;
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
        'grid min-w-0 grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 transition-colors duration-subtle hover:bg-white/[0.03]',
        'border-t border-white/[0.075] first:border-t-0',
        item.date.ticketStatus === 'cancelled' && 'opacity-50'
      )}
    >
      <DateBox date={item.date.startDate} featured={false} />

      <div className='min-w-0'>
        <p className='min-w-0 truncate text-[15px] font-medium tracking-[-0.03em] text-white'>
          {item.date.venueName}
        </p>
        <p className='mt-0.5 min-w-0 truncate text-[12px] font-medium tracking-[-0.01em] text-white/52'>
          {location}
        </p>
      </div>

      {canBuyTickets ? (
        <a
          href={item.date.ticketUrl ?? undefined}
          onClick={event => {
            track('event_click', {
              artist_id: artistId,
              profile_id: artistId,
              profile_slug: artistHandle,
              handle: artistHandle,
              current_route_tab: 'events',
              event_id: item.date.id,
              venue_name: item.date.venueName,
              target_url: item.date.ticketUrl,
            });
            handleTicketClick(event);
          }}
          target='_blank'
          rel='noopener noreferrer'
          className={cn(
            'inline-flex min-h-11 shrink-0 items-center rounded-[14px] border px-3 text-[12px] font-semibold tracking-[-0.01em] transition-[border-color,background-color,opacity] duration-subtle hover:opacity-90',
            getTicketStatusClassName(item.date.ticketStatus, canBuyTickets)
          )}
        >
          {getTicketStatusLabel(item.date.ticketStatus, canBuyTickets)}
        </a>
      ) : (
        <span
          className={cn(
            'inline-flex min-h-11 shrink-0 items-center rounded-[14px] border px-3 text-[12px] font-semibold tracking-[-0.01em]',
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
  emptyStateSourceContext,
  renderMode,
}: Readonly<{
  readonly artist: Artist;
  readonly nearby: TourDateWithProximity[];
  readonly allDates: TourDateWithProximity[];
  readonly emptyStateSourceContext: NotificationSourceContext;
  readonly renderMode: ProfileRenderMode;
}>) {
  if (allDates.length === 0) {
    const action =
      renderMode === 'preview' ? (
        <button
          type='button'
          className='inline-flex h-11 items-center rounded-full bg-white px-5 text-[13px] font-semibold tracking-[-0.01em] text-black'
          disabled
        >
          Event Alerts
        </button>
      ) : (
        <ArtistNotificationsCTA
          artist={artist}
          variant='button'
          hideListenFallback
          source={emptyStateSourceContext.ctaLocation}
          sourceContext={emptyStateSourceContext}
          triggerLabel='Event Alerts'
          presentation='overlay'
        />
      );

    return (
      <div className='flex min-h-[36vh] flex-col items-center justify-center px-6 py-12 text-center'>
        <p className='text-[17px] font-semibold tracking-[-0.018em] text-white'>
          No Events
        </p>
        <p className='mt-2 max-w-[25ch] text-[12.5px] leading-5 text-white/52'>
          Get alerted when shows are announced.
        </p>
        <div className='mt-5'>{action}</div>
      </div>
    );
  }

  const nearbyIds = new Set(nearby.map(item => item.date.id));
  const sortedDates = [...allDates].sort(
    (left, right) =>
      Date.parse(left.date.startDate) - Date.parse(right.date.startDate)
  );
  const nearbyDates = sortedDates.filter(item => nearbyIds.has(item.date.id));
  const upcomingDates = sortedDates.filter(
    item => !nearbyIds.has(item.date.id)
  );
  const groups = [
    nearbyDates.length > 0 ? { label: 'Nearby', items: nearbyDates } : null,
    {
      label: 'Upcoming',
      items: nearbyDates.length > 0 ? upcomingDates : sortedDates,
    },
  ].filter(
    (group): group is { label: string; items: TourDateWithProximity[] } =>
      Boolean(group && group.items.length > 0)
  );

  return (
    <div data-testid='tour-drawer-list'>
      {groups.map(group => (
        <section key={group.label} className='pb-4'>
          <div className='px-4 pb-2 pt-3 text-[11px] font-[680] uppercase tracking-[0.16em] text-white/32'>
            {group.label}
          </div>
          <div className='border-y border-white/[0.075]'>
            {group.items.map(item => (
              <TourDateRow
                key={item.date.id}
                artistId={artist.id}
                artistHandle={artist.handle}
                item={item}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function TourDrawerContent({
  artist,
  tourDates,
  emptyStateSourceContext,
  renderMode = 'interactive',
}: Readonly<{
  readonly artist: Artist;
  readonly tourDates: TourDateViewModel[];
  readonly emptyStateSourceContext?: NotificationSourceContext;
  readonly renderMode?: ProfileRenderMode;
}>) {
  const { location } = useUserLocation();
  const { nearbyDates, allDates } = useTourDateProximity(tourDates, location);
  const resolvedEmptyStateSourceContext: NotificationSourceContext =
    emptyStateSourceContext ?? {
      artistId: artist.id,
      profileId: artist.id,
      profileSlug: artist.handle,
      currentTab: 'events',
      ctaLocation: 'events_empty_state',
      intent: 'event_alerts',
    };

  return (
    <div data-testid='tour-drawer-content'>
      <TourDatesContent
        artist={artist}
        nearby={nearbyDates}
        allDates={allDates}
        emptyStateSourceContext={resolvedEmptyStateSourceContext}
        renderMode={renderMode}
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
      title='Events'
      dataTestId='tour-drawer'
    >
      <TourDrawerContent artist={artist} tourDates={tourDates} />
    </ProfileDrawerShell>
  );
}
