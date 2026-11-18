import { and, eq, gte } from 'drizzle-orm';
import { db } from '@/lib/db';
import { tourDates } from '@/lib/db/schema/tour';

interface TourAggregateResult {
  upcomingShows: {
    city: string;
    country: string;
    date: string;
    venueName: string;
  }[];
}

export async function aggregateTourData(
  profileId: string
): Promise<TourAggregateResult> {
  const now = new Date();
  const upcoming = await db
    .select({
      city: tourDates.city,
      country: tourDates.country,
      startDate: tourDates.startDate,
      venueName: tourDates.venueName,
    })
    .from(tourDates)
    .where(
      and(
        eq(tourDates.profileId, profileId),
        eq(tourDates.eventType, 'tour'),
        gte(tourDates.startDate, now)
      )
    )
    .orderBy(tourDates.startDate)
    .limit(20);

  return {
    upcomingShows: upcoming.map(s => ({
      city: s.city,
      country: s.country,
      date: s.startDate.toISOString(),
      venueName: s.venueName,
    })),
  };
}
