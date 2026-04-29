import { and, eq, gte } from 'drizzle-orm';
import { db } from '@/lib/db';
import type { TourDate } from '@/lib/db/schema/tour';
import { tourDates } from '@/lib/db/schema/tour';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
import { toISOStringSafe } from '@/lib/utils/date';

function mapTourDateToViewModel(tourDate: TourDate): TourDateViewModel {
  return {
    id: tourDate.id,
    profileId: tourDate.profileId,
    externalId: tourDate.externalId,
    provider: tourDate.provider,
    eventType: tourDate.eventType,
    confirmationStatus: tourDate.confirmationStatus,
    reviewedAt: tourDate.reviewedAt
      ? toISOStringSafe(tourDate.reviewedAt)
      : null,
    title: tourDate.title,
    startDate: toISOStringSafe(tourDate.startDate),
    startTime: tourDate.startTime,
    timezone: tourDate.timezone,
    venueName: tourDate.venueName,
    city: tourDate.city,
    region: tourDate.region,
    country: tourDate.country,
    latitude: tourDate.latitude,
    longitude: tourDate.longitude,
    ticketUrl: tourDate.ticketUrl,
    ticketStatus: tourDate.ticketStatus,
    lastSyncedAt: tourDate.lastSyncedAt
      ? toISOStringSafe(tourDate.lastSyncedAt)
      : null,
    createdAt: toISOStringSafe(tourDate.createdAt),
    updatedAt: toISOStringSafe(tourDate.updatedAt),
  };
}

/**
 * Public-facing query: only confirmed tour events (eventType='tour' AND
 * confirmationStatus='confirmed'). Pending, rejected, and non-tour events
 * stay creator-private.
 */
export async function getUpcomingTourDatesForProfile(
  profileId: string
): Promise<TourDateViewModel[]> {
  const now = new Date();
  const dates = await db
    .select()
    .from(tourDates)
    .where(
      and(
        eq(tourDates.profileId, profileId),
        gte(tourDates.startDate, now),
        eq(tourDates.eventType, 'tour'),
        eq(tourDates.confirmationStatus, 'confirmed')
      )
    )
    .orderBy(tourDates.startDate);

  return dates.map(mapTourDateToViewModel);
}

/**
 * All confirmed tour events for the per-artist ICS subscribe feed (past +
 * future). External calendar clients keep their own retention; we ship a
 * complete dataset and let them prune.
 */
export async function getConfirmedTourEventsForProfile(
  profileId: string
): Promise<TourDateViewModel[]> {
  const dates = await db
    .select()
    .from(tourDates)
    .where(
      and(
        eq(tourDates.profileId, profileId),
        eq(tourDates.eventType, 'tour'),
        eq(tourDates.confirmationStatus, 'confirmed')
      )
    )
    .orderBy(tourDates.startDate);

  return dates.map(mapTourDateToViewModel);
}
