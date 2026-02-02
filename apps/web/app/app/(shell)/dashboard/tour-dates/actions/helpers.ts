import { sql as drizzleSql } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';
import { fetchBandsintownEvents } from '@/lib/bandsintown';
import { db, type TourDate, tourDates } from '@/lib/db';
import { getDashboardData } from '../../actions';
import type { ProfileInfo, TourDateViewModel } from './types';

/**
 * Require authenticated profile with Bandsintown fields
 * Redirects to onboarding if profile is missing
 */
export async function requireProfile(): Promise<ProfileInfo> {
  const data = await getDashboardData();

  if (data.needsOnboarding) {
    redirect(APP_ROUTES.ONBOARDING);
  }

  if (!data.selectedProfile) {
    throw new TypeError('Missing creator profile');
  }

  // Use bandsintown fields directly from selectedProfile (already fetched by getDashboardData)
  return {
    id: data.selectedProfile.id,
    bandsintownArtistName: data.selectedProfile.bandsintownArtistName,
    bandsintownApiKey: data.selectedProfile.bandsintownApiKey,
    handle:
      data.selectedProfile.usernameNormalized ?? data.selectedProfile.username,
  };
}

/**
 * Map database TourDate to view model with ISO date strings
 */
export function mapTourDateToViewModel(tourDate: TourDate): TourDateViewModel {
  return {
    id: tourDate.id,
    profileId: tourDate.profileId,
    externalId: tourDate.externalId,
    provider: tourDate.provider,
    title: tourDate.title,
    startDate: tourDate.startDate.toISOString(),
    startTime: tourDate.startTime,
    venueName: tourDate.venueName,
    city: tourDate.city,
    region: tourDate.region,
    country: tourDate.country,
    latitude: tourDate.latitude,
    longitude: tourDate.longitude,
    ticketUrl: tourDate.ticketUrl,
    ticketStatus: tourDate.ticketStatus,
    lastSyncedAt: tourDate.lastSyncedAt?.toISOString() ?? null,
    createdAt: tourDate.createdAt.toISOString(),
    updatedAt: tourDate.updatedAt.toISOString(),
  };
}

/**
 * Validate ticket URL (must be http or https)
 */
export function validateTicketUrl(ticketUrl: string | null | undefined): void {
  if (!ticketUrl) return;
  try {
    const url = new URL(ticketUrl);
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new TypeError('Invalid ticket URL: must use http or https');
    }
  } catch {
    throw new TypeError('Invalid ticket URL');
  }
}

/**
 * Upsert Bandsintown events into the database (batch insert for performance)
 */
export async function upsertBandsintownEvents(
  profileId: string,
  events: Awaited<ReturnType<typeof fetchBandsintownEvents>>
): Promise<number> {
  if (events.length === 0) return 0;

  const now = new Date();

  // Batch all events into a single insert with conflict handling
  const insertValues = events.map(event => ({
    profileId,
    externalId: event.externalId,
    provider: 'bandsintown' as const,
    title: event.title,
    startDate: event.startDate,
    startTime: event.startTime,
    venueName: event.venueName,
    city: event.city,
    region: event.region,
    country: event.country,
    latitude: event.latitude,
    longitude: event.longitude,
    ticketUrl: event.ticketUrl,
    ticketStatus: event.ticketStatus,
    lastSyncedAt: now,
    rawData: event.rawData,
  }));

  try {
    await db
      .insert(tourDates)
      .values(insertValues)
      .onConflictDoUpdate({
        target: [tourDates.profileId, tourDates.externalId, tourDates.provider],
        set: {
          title: drizzleSql`excluded.title`,
          startDate: drizzleSql`excluded.start_date`,
          startTime: drizzleSql`excluded.start_time`,
          venueName: drizzleSql`excluded.venue_name`,
          city: drizzleSql`excluded.city`,
          region: drizzleSql`excluded.region`,
          country: drizzleSql`excluded.country`,
          latitude: drizzleSql`excluded.latitude`,
          longitude: drizzleSql`excluded.longitude`,
          ticketUrl: drizzleSql`excluded.ticket_url`,
          ticketStatus: drizzleSql`excluded.ticket_status`,
          lastSyncedAt: drizzleSql`excluded.last_synced_at`,
          rawData: drizzleSql`excluded.raw_data`,
          updatedAt: now,
        },
      });
  } catch (error) {
    // Re-throw with context for better traceability in callers
    throw new Error(
      `Failed to upsert Bandsintown events for profile ${profileId} (${events.length} events)`,
      { cause: error }
    );
  }

  return events.length;
}
