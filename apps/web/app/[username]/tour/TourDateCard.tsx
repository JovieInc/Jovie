'use client';

import { ProfileMediaCard } from '@/features/profile/ProfileMediaCard';
import { useTourDateTicketClick } from '@/hooks/useTourDateTicketClick';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
import { formatLocationString } from '@/lib/utils/string-utils';

// Pre-configured formatters for date display
const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'short' });
const dayFormatter = new Intl.DateTimeFormat('en-US', { day: 'numeric' });
const weekdayFormatter = new Intl.DateTimeFormat('en-US', { weekday: 'short' });

interface TourDateCardProps {
  readonly tourDate: TourDateViewModel;
  readonly handle: string;
  readonly isNearYou?: boolean;
  readonly distanceKm?: number | null;
}

export function TourDateCard({
  tourDate,
  handle,
  isNearYou = false,
  distanceKm,
}: Readonly<TourDateCardProps>) {
  const date = new Date(tourDate.startDate);
  // Decode URL-encoded location parts (e.g., %20 -> space)
  const location = formatLocationString([
    tourDate.city,
    tourDate.region,
    tourDate.country,
  ]);

  const isSoldOut = tourDate.ticketStatus === 'sold_out';
  const isCancelled = tourDate.ticketStatus === 'cancelled';

  // Derive timezone abbreviation (e.g., "EST") from IANA timezone
  // Wrapped in try/catch: timezone is a free-text field that may contain invalid IANA values
  let timezoneAbbr: string | null = null;
  if (tourDate.timezone) {
    try {
      timezoneAbbr =
        new Intl.DateTimeFormat('en-US', {
          timeZone: tourDate.timezone,
          timeZoneName: 'short',
        })
          .formatToParts(date)
          .find(part => part.type === 'timeZoneName')?.value ?? null;
    } catch {
      // Invalid timezone — silently ignore
    }
  }

  const handleTicketClick = useTourDateTicketClick(
    handle,
    tourDate.id,
    tourDate.ticketUrl
  );

  const handleAddToCalendar = () => {
    globalThis.location.href = `/api/calendar/${tourDate.id}`;
  };

  const canBuyTickets =
    Boolean(tourDate.ticketUrl) && !isCancelled && !isSoldOut;
  const canAddToCalendar = !isCancelled;
  const actionLabel = isCancelled
    ? 'Cancelled'
    : isSoldOut
      ? 'Add to calendar'
      : canBuyTickets
        ? 'Get tickets'
        : 'Add to calendar';
  const calendarAction = canAddToCalendar
    ? {
        label: 'Add to calendar',
        onClick: handleAddToCalendar,
        icon: 'CalendarPlus' as const,
      }
    : null;

  return (
    <ProfileMediaCard
      eyebrow={
        isNearYou
          ? distanceKm === null || distanceKm === undefined
            ? 'Near You'
            : `${Math.round(distanceKm)} km away`
          : 'Next Show'
      }
      title={tourDate.title ?? 'Live'}
      subtitle={tourDate.venueName}
      locationLabel={location}
      secondaryLocationLabel={
        tourDate.startTime
          ? `Doors: ${tourDate.startTime}${timezoneAbbr ? ` ${timezoneAbbr}` : ''}`
          : null
      }
      imageAlt={tourDate.venueName}
      fallbackVariant='generic'
      accent={isNearYou ? 'blue' : 'orange'}
      ratio='portrait'
      datePill={{
        month: monthFormatter.format(date),
        day: dayFormatter.format(date),
        meta: `${weekdayFormatter.format(date)}${tourDate.startTime ? ` · ${tourDate.startTime}` : ''}`,
      }}
      action={{
        label: actionLabel,
        href: canBuyTickets ? tourDate.ticketUrl : null,
        onClick: canBuyTickets ? handleTicketClick : handleAddToCalendar,
        icon: canBuyTickets ? 'Ticket' : 'CalendarPlus',
        showChevron: canBuyTickets,
        disabled: isCancelled,
      }}
      secondaryAction={canBuyTickets ? calendarAction : null}
      status={isSoldOut ? { label: 'Sold out', tone: 'orange' } : null}
      className={isCancelled ? 'opacity-60' : undefined}
    />
  );
}
