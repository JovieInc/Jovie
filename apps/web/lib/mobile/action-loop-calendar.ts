import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { tourDates } from '@/lib/db/schema/tour';
import { getReleasesForProfile } from '@/lib/discography/queries';
import type {
  ConfirmationStatusValue,
  EventTypeValue,
  TicketStatus,
  TourDateProviderValue,
  TourDateViewModel,
} from '@/lib/tour-dates/types';
import { mapTourDateToViewModel } from '@/lib/tour-dates/view-model';
import { toISOStringOrNull } from '@/lib/utils/date';

type MobileCalendarReleaseStatus = 'draft' | 'scheduled' | 'released';

export type MobileCalendarEventItem = {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly eventDate: string;
  readonly eventType: EventTypeValue;
  readonly confirmationStatus: ConfirmationStatusValue;
  readonly statusBadge?: string;
};

export type MobileCalendarReleaseItem = {
  readonly id: string;
  readonly title: string;
  readonly releaseDate: string | null;
  readonly status: 'draft' | 'scheduled' | 'released';
  readonly artworkUrl?: string;
};

export type MobileCalendarResponse = {
  readonly rangeLabel: string;
  readonly pendingReviewCount: number;
  readonly upcomingEvents: readonly MobileCalendarEventItem[];
  readonly pendingEvents: readonly MobileCalendarEventItem[];
  readonly upcomingReleases: readonly MobileCalendarReleaseItem[];
  readonly chatPrompt: string;
};

const CALENDAR_CHAT_PROMPT =
  'Ask Jovie what I should prioritize on my calendar this week.';

const UPCOMING_EVENT_LIMIT = 12;
const PENDING_EVENT_LIMIT = 8;
const UPCOMING_RELEASE_LIMIT = 8;

function formatProvider(provider: TourDateProviderValue): string {
  if (provider === 'bandsintown') return 'Bandsintown';
  if (provider === 'songkick') return 'Songkick';
  if (provider === 'admin_import') return 'Admin Import';
  return 'Manual';
}

function formatStatus(status: TicketStatus): string | undefined {
  if (status === 'sold_out') return 'Sold out';
  if (status === 'cancelled') return 'Cancelled';
  return undefined;
}

function formatLocation(
  city: string,
  region: string | null,
  country: string | null
): string {
  if (region) return `${city}, ${region}`;
  if (country) return `${city}, ${country}`;
  return city;
}

function mapTourDateToMobileEvent(
  tourDate: TourDateViewModel
): MobileCalendarEventItem {
  const location = formatLocation(
    tourDate.city,
    tourDate.region,
    tourDate.country
  );
  const providerLabel = formatProvider(tourDate.provider);

  return {
    id: tourDate.id,
    title: tourDate.title || tourDate.venueName || tourDate.city,
    subtitle: `${location} · ${providerLabel}`,
    eventDate: tourDate.startDate,
    eventType: tourDate.eventType,
    confirmationStatus: tourDate.confirmationStatus,
    statusBadge: formatStatus(tourDate.ticketStatus),
  };
}

function isUpcomingEvent(eventDate: string, now: Date): boolean {
  const parsed = new Date(eventDate);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }
  return parsed >= now;
}

function isUpcomingRelease(
  releaseDate: Date | string | null | undefined,
  status: MobileCalendarReleaseStatus,
  now: Date
): boolean {
  if (status === 'draft' || status === 'scheduled') {
    return true;
  }
  if (!releaseDate) {
    return false;
  }
  const parsed = new Date(releaseDate);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }
  return parsed >= now;
}

function normalizeReleaseStatus(status: string): MobileCalendarReleaseStatus {
  if (status === 'draft' || status === 'scheduled') {
    return status;
  }
  return 'released';
}

async function loadTourDatesForProfile(
  profileId: string
): Promise<TourDateViewModel[]> {
  const rows = await db
    .select()
    .from(tourDates)
    .where(eq(tourDates.profileId, profileId))
    .orderBy(tourDates.startDate);

  return rows.map(mapTourDateToViewModel);
}

/**
 * Condensed calendar action-loop payload for iOS.
 * Mirrors the web calendar's release + event sources without month-grid detail.
 */
export async function buildMobileCalendar(
  profileId: string
): Promise<MobileCalendarResponse> {
  const now = new Date();

  const [tourDateRows, releases] = await Promise.all([
    loadTourDatesForProfile(profileId),
    getReleasesForProfile(profileId, { includeDrafts: true }),
  ]);

  const mobileEvents = tourDateRows.map(mapTourDateToMobileEvent);
  const pendingEvents = mobileEvents
    .filter(event => event.confirmationStatus === 'pending')
    .slice(0, PENDING_EVENT_LIMIT);
  const upcomingEvents = mobileEvents
    .filter(
      event =>
        event.confirmationStatus !== 'rejected' &&
        isUpcomingEvent(event.eventDate, now)
    )
    .slice(0, UPCOMING_EVENT_LIMIT);

  const upcomingReleases = releases
    .map(release => ({
      id: release.id,
      title: release.title,
      releaseDate: toISOStringOrNull(release.releaseDate),
      status: normalizeReleaseStatus(release.status),
      artworkUrl: release.artworkUrl ?? undefined,
    }))
    .filter(release =>
      isUpcomingRelease(release.releaseDate, release.status, now)
    )
    .slice(0, UPCOMING_RELEASE_LIMIT);

  return {
    rangeLabel: 'Upcoming',
    pendingReviewCount: pendingEvents.length,
    upcomingEvents,
    pendingEvents,
    upcomingReleases,
    chatPrompt: CALENDAR_CHAT_PROMPT,
  };
}
