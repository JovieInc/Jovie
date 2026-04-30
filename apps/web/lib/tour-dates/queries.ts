import { and, eq, gte } from 'drizzle-orm';
import { db } from '@/lib/db';
import { tourDates } from '@/lib/db/schema/tour';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
import { mapTourDateToViewModel } from '@/lib/tour-dates/view-model';

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
