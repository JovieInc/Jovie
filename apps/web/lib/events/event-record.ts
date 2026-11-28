import type {
  ConfirmationStatusValue,
  EventTypeValue,
  TourDateProviderValue,
  TourDateViewModel,
} from '@/lib/tour-dates/types';

/** Shared event projection for the dashboard, calendar, and chat caches. */
export interface EventRecord {
  readonly id: string;
  /** Display title. Prefers custom title, then venue name, then city, then a fallback. */
  readonly title: string;
  /** Location and provider label when known, otherwise just the provider. */
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

export function tourDateToEventRecord(td: TourDateViewModel): EventRecord {
  const venue = td.venueName.trim();
  const city = td.city.trim();
  const regionOrCountry = td.region?.trim() || td.country.trim();
  const location = [city, regionOrCountry].filter(Boolean).join(', ');
  const providerLabel = formatProvider(td.provider);

  return {
    id: td.id,
    title: td.title?.trim() || venue || city || 'Event',
    subtitle: location ? `${location} · ${providerLabel}` : providerLabel,
    eventDate: td.startDate,
    timezone: td.timezone,
    eventType: td.eventType,
    confirmationStatus: td.confirmationStatus,
    providerKey: td.provider,
    reviewedAt: td.reviewedAt,
    lastSyncedAt: td.lastSyncedAt,
    venue: venue || undefined,
    city: location || undefined,
    provider: providerLabel,
    status: formatStatus(td.ticketStatus),
    ticketUrl: td.ticketUrl ?? undefined,
  };
}
