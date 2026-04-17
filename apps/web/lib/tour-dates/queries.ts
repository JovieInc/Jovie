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

export async function getUpcomingTourDatesForProfile(
  profileId: string
): Promise<TourDateViewModel[]> {
  const now = new Date();
  const dates = await db
    .select()
    .from(tourDates)
    .where(
      and(eq(tourDates.profileId, profileId), gte(tourDates.startDate, now))
    )
    .orderBy(tourDates.startDate);

  return dates.map(mapTourDateToViewModel);
}
