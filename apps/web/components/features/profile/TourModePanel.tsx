'use client';

import { Button } from '@jovie/ui';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { EmptyState } from '@/components/molecules/EmptyState';
import type { ProfileRenderMode } from '@/features/profile/contracts';
import { PUBLIC_EVENTS_NO_UPCOMING_HEADING } from '@/features/profile/profile-surface-state';
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
import { subscriptionMutedActionClassName } from './artist-notifications-cta/shared';
import type { NotificationSourceContext } from './artist-notifications-cta/types';
import { ProfileDrawerShell } from './ProfileDrawerShell';

interface TourModePanelProps {
  readonly artist: Artist;
  readonly tourDates: TourDateViewModel[];
}

// The media-stage contrast floor for muted text is on-media/52 (~5.6:1 on
// the dark stage, WCAG 2.2 AA — axe color-contrast). on-media/38 measures
// ~3.4:1 there and fails the Storybook a11y lane.
function getTicketStatusClassName(
  ticketStatus: TourDateViewModel['ticketStatus'],
  canBuyTickets: boolean
): string {
  if (ticketStatus === 'sold_out') {
    return 'border-on-media/8 bg-transparent text-on-media/52';
  }

  return canBuyTickets
    ? 'border-on-media/14 bg-on-media/[0.02] text-on-media dark:text-on-media'
    : 'border-on-media/8 bg-transparent text-on-media/52';
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
  muted = false,
}: Readonly<{
  readonly date: string;
  readonly featured: boolean;
  /** Cancelled rows mute the whole row with tokens instead of container opacity. */
  readonly muted?: boolean;
}>) {
  const displayDate = useMemo(() => toDisplayDate(date), [date]);

  return (
    <div className='flex w-11 shrink-0 flex-col items-center justify-center'>
      <span className='text-3xs font-semibold tracking-wider text-on-media/52'>
        {displayDate.month}
      </span>
      <span
        className={cn(
          'mt-1 text-xl font-bold leading-none tracking-tighter tabular-nums',
          muted ? 'text-on-media/52' : 'text-(--color-text-tooltip)'
        )}
      >
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

  const cancelled = item.date.ticketStatus === 'cancelled';

  return (
    <div
      className={cn(
        'grid min-w-0 grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 transition-colors duration-subtle hover:bg-on-media/[0.03]',
        'border-t border-on-media/[0.075] first:border-t-0'
        // Cancelled rows are muted with per-element tokens (on-media/52 is
        // ~5.6:1 on the dark stage), never a container opacity-50: the
        // halved alpha compounds with the muted tokens down to ~2.2:1 and
        // fails WCAG 2.2 AA (axe color-contrast).
      )}
    >
      <DateBox date={item.date.startDate} featured={false} muted={cancelled} />

      <div className='min-w-0'>
        <p
          className={cn(
            'min-w-0 truncate text-mid font-medium tracking-[-0.03em]',
            cancelled ? 'text-on-media/52' : 'text-(--color-text-tooltip)'
          )}
        >
          {item.date.venueName}
        </p>
        <p className='mt-0.5 min-w-0 truncate text-xs font-medium tracking-tight text-on-media/52'>
          {location}
        </p>
      </div>

      {canBuyTickets ? (
        <a
          href={item.date.ticketUrl ?? undefined}
          // JOV-4429: unique accessible name per date — a shared ticketing
          // URL would otherwise render as a duplicate "Tickets" CTA cluster.
          aria-label={`Tickets for ${item.date.venueName} — ${location}`}
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
            'inline-flex min-h-11 shrink-0 items-center rounded-xl border px-3 text-xs font-semibold tracking-tight transition-[border-color,background-color,opacity] duration-subtle hover:opacity-90',
            getTicketStatusClassName(item.date.ticketStatus, canBuyTickets)
          )}
        >
          {getTicketStatusLabel(item.date.ticketStatus, canBuyTickets)}
        </a>
      ) : (
        // No ticket target: plain muted meta text — a non-interactive span
        // must never wear button chrome.
        <span className='shrink-0 text-xs font-medium text-on-media/52'>
          {getTicketStatusLabel(item.date.ticketStatus, canBuyTickets)}
        </span>
      )}
    </div>
  );
}

export const EVENT_ALERTS_LABEL = 'Turn on event alerts';

const EVENT_ALERTS_TRIGGER_CLASS_NAME = `${subscriptionMutedActionClassName} profile-glass-pill profile-glass-pill--flat w-full justify-center gap-1.5 text-mid font-medium`;

/**
 * Event alerts opt-in shown when an artist has no upcoming events. Shared by
 * the tour drawer empty state and the Events mode card.
 */
export function TourEventAlertsAction({
  artist,
  sourceContext,
  renderMode,
}: Readonly<{
  readonly artist: Artist;
  readonly sourceContext: NotificationSourceContext;
  readonly renderMode: ProfileRenderMode;
}>) {
  if (renderMode === 'preview') {
    return (
      <Button
        type='button'
        variant='secondary'
        size='marketing'
        className='w-full'
        disabled
      >
        {EVENT_ALERTS_LABEL}
      </Button>
    );
  }

  return (
    <ArtistNotificationsCTA
      artist={artist}
      variant='button'
      hideListenFallback
      source={sourceContext.ctaLocation}
      sourceContext={sourceContext}
      triggerLabel={EVENT_ALERTS_LABEL}
      // Canonical Button owns the 28px control and 44px touch floor; the flat
      // glass pill matches the identity header's Get updates action.
      triggerClassName={EVENT_ALERTS_TRIGGER_CLASS_NAME}
      presentation='overlay'
    />
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
    const action = (
      <TourEventAlertsAction
        artist={artist}
        sourceContext={emptyStateSourceContext}
        renderMode={renderMode}
      />
    );

    return (
      <EmptyState
        heading={PUBLIC_EVENTS_NO_UPCOMING_HEADING}
        description='Get alerted when shows are announced.'
        actionSlot={<div className='w-full max-w-xs'>{action}</div>}
        testId='profile-primary-tab-events-empty'
      />
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
          <div className='px-4 pb-2 pt-3 text-2xs font-semibold text-secondary-token'>
            {group.label}
          </div>
          <div className='border-y border-on-media/[0.075]'>
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
  className,
}: Readonly<{
  readonly artist: Artist;
  readonly tourDates: TourDateViewModel[];
  readonly emptyStateSourceContext?: NotificationSourceContext;
  readonly renderMode?: ProfileRenderMode;
  readonly className?: string;
}>) {
  // one-modal-layer-v1: passive tour surfaces never open the browser
  // geolocation prompt — granted-only reads cached/granted location and
  // otherwise falls back to chronological order.
  const { location } = useUserLocation({ permissionMode: 'granted-only' });
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
    <div className={cn(className)} data-testid='tour-drawer-content'>
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
