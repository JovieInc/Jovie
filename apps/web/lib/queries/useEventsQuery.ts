'use client';

import { useQuery } from '@tanstack/react-query';
import { loadTourDates } from '@/app/app/(shell)/dashboard/tour-dates/actions';
import { queryKeys, STANDARD_NO_REMOUNT_CACHE } from '@/lib/queries';
import type { TourDateViewModel } from '@/lib/tour-dates/types';

/**
 * Forward-compatible event record returned by the chat composer's event
 * provider. Today every record is a tour date (mapped from
 * `tourDates` via {@link loadTourDates}); future event types (meetups,
 * charity gigs, TV guest spots) will land alongside without changing the
 * call sites.
 *
 * Mapping lives only in this file — when the backend later splits event
 * types out of the `tourDates` table, only this mapper changes.
 */
export interface EventRecord {
  readonly id: string;
  /** Venue name, e.g. "Brooklyn Steel". Falls back to tour-date title or city. */
  readonly title: string;
  /** "city · provider", e.g. "Brooklyn, NY · Bandsintown". */
  readonly subtitle: string;
  /** ISO start timestamp for the event. */
  readonly eventDate: string;
  readonly eventType: 'tour' | 'meetup' | 'guest' | 'charity' | 'other';
  readonly venue?: string;
  readonly city?: string;
  readonly provider?: string;
  /** Human-friendly status badge text, e.g. "Sold out". */
  readonly status?: string;
  readonly capacity?: number;
}

function formatProvider(provider: TourDateViewModel['provider']): string {
  if (provider === 'bandsintown') return 'Bandsintown';
  if (provider === 'songkick') return 'Songkick';
  return 'Manual';
}

function formatStatus(
  status: TourDateViewModel['ticketStatus']
): string | undefined {
  if (status === 'sold_out') return 'Sold out';
  if (status === 'cancelled') return 'Cancelled';
  return undefined;
}

function formatLocation(
  city: string,
  region: string | null,
  country: string | null
): string {
  // Prefer "City, Region" for US-style display; fall back to country if
  // region is missing (e.g. Berlin, Germany).
  if (region) return `${city}, ${region}`;
  if (country) return `${city}, ${country}`;
  return city;
}

export function tourDateToEventRecord(td: TourDateViewModel): EventRecord {
  const location = formatLocation(td.city, td.region, td.country);
  const providerLabel = formatProvider(td.provider);
  const subtitle = `${location} · ${providerLabel}`;
  return {
    id: td.id,
    title: td.venueName || td.title || td.city,
    subtitle,
    eventDate: td.startDate,
    eventType: 'tour',
    venue: td.venueName,
    city: location,
    provider: providerLabel,
    status: formatStatus(td.ticketStatus),
  };
}

/**
 * TanStack hook — returns all events for the active profile, mapped
 * through {@link tourDateToEventRecord}. Scoped by profileId so cache
 * never leaks between creators.
 */
export function useEventsQuery(profileId: string) {
  return useQuery({
    queryKey: queryKeys.events.list(profileId),
    // eslint-disable-next-line @jovie/require-abort-signal -- server action, signal not passable
    queryFn: async (): Promise<EventRecord[]> => {
      const dates = await loadTourDates();
      return dates.map(tourDateToEventRecord);
    },
    ...STANDARD_NO_REMOUNT_CACHE,
    placeholderData: (previousData, previousQuery) =>
      previousQuery?.queryKey[2] === profileId ? previousData : undefined,
    enabled: Boolean(profileId),
  });
}
