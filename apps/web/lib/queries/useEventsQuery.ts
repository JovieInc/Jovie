'use client';

import { useQuery } from '@tanstack/react-query';
import { loadTourDates } from '@/app/app/(shell)/dashboard/tour-dates/actions';
import { queryKeys, STANDARD_NO_REMOUNT_CACHE } from '@/lib/queries';
import type {
  ConfirmationStatusValue,
  EventTypeValue,
  TourDateProviderValue,
  TourDateViewModel,
} from '@/lib/tour-dates/types';

/**
 * Forward-compatible event record returned by the chat composer's event
 * provider and consumed by the unified calendar. Today every record is
 * derived from `tourDates`; the broader `eventType` enum (livestream,
 * listening party, AMA, signing) sits alongside `tour` so that future
 * non-tour event types can land without changing call sites.
 */
export interface EventRecord {
  readonly id: string;
  /** Venue name, e.g. "Brooklyn Steel". Falls back to tour-date title or city. */
  readonly title: string;
  /** "city · provider", e.g. "Brooklyn, NY · Bandsintown". */
  readonly subtitle: string;
  /** ISO start timestamp for the event. */
  readonly eventDate: string;
  /** IANA timezone for event-local date bucketing on the calendar grid. */
  readonly timezone: string | null;
  readonly eventType: EventTypeValue;
  readonly confirmationStatus: ConfirmationStatusValue;
  readonly providerKey: TourDateProviderValue;
  readonly reviewedAt: string | null;
  readonly lastSyncedAt: string | null;
  readonly venue?: string;
  readonly city?: string;
  /** Human-friendly provider label, e.g. "Bandsintown". */
  readonly provider?: string;
  /** Human-friendly status badge text, e.g. "Sold out". */
  readonly status?: string;
  readonly ticketUrl?: string;
  readonly capacity?: number;
}

function formatProvider(provider: TourDateProviderValue): string {
  if (provider === 'bandsintown') return 'Bandsintown';
  if (provider === 'songkick') return 'Songkick';
  if (provider === 'admin_import') return 'Admin Import';
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
    timezone: td.timezone,
    eventType: td.eventType,
    confirmationStatus: td.confirmationStatus,
    providerKey: td.provider,
    reviewedAt: td.reviewedAt,
    lastSyncedAt: td.lastSyncedAt,
    venue: td.venueName,
    city: location,
    provider: providerLabel,
    status: formatStatus(td.ticketStatus),
    ticketUrl: td.ticketUrl ?? undefined,
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
