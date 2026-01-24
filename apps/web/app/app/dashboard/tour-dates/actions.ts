'use server';

import { and, desc, eq, gte } from 'drizzle-orm';
import { unstable_noStore as noStore, revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getCachedAuth } from '@/lib/auth/cached';
import {
  fetchBandsintownEvents,
  verifyBandsintownArtist,
} from '@/lib/bandsintown';
import { db } from '@/lib/db';
import { creatorProfiles, type TourDate, tourDates } from '@/lib/db/schema';
import { checkBandsintownSyncRateLimit } from '@/lib/rate-limit/limiters';
import { trackServerEvent } from '@/lib/server-analytics';
import { getDashboardData } from '../actions';

// ============================================================================
// Types
// ============================================================================

export interface TourDateViewModel {
  id: string;
  profileId: string;
  externalId: string | null;
  provider: 'bandsintown' | 'songkick' | 'manual';
  title: string | null;
  startDate: string;
  startTime: string | null;
  venueName: string;
  city: string;
  region: string | null;
  country: string;
  latitude: number | null;
  longitude: number | null;
  ticketUrl: string | null;
  ticketStatus: 'available' | 'sold_out' | 'cancelled';
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BandsintownConnectionStatus {
  connected: boolean;
  artistName: string | null;
  lastSyncedAt: string | null;
}

// ============================================================================
// Helpers
// ============================================================================

async function requireProfile(): Promise<{
  id: string;
  bandsintownArtistName: string | null;
  handle: string;
}> {
  const data = await getDashboardData();

  if (data.needsOnboarding) {
    redirect('/onboarding');
  }

  if (!data.selectedProfile) {
    throw new Error('Missing creator profile');
  }

  // Get bandsintownArtistName from database
  const [profile] = await db
    .select({ bandsintownArtistName: creatorProfiles.bandsintownArtistName })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.id, data.selectedProfile.id))
    .limit(1);

  return {
    id: data.selectedProfile.id,
    bandsintownArtistName: profile?.bandsintownArtistName ?? null,
    handle:
      data.selectedProfile.usernameNormalized ?? data.selectedProfile.username,
  };
}

function mapTourDateToViewModel(tourDate: TourDate): TourDateViewModel {
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

// ============================================================================
// Server Actions
// ============================================================================

/**
 * Load tour dates for the current profile
 */
export async function loadTourDates(): Promise<TourDateViewModel[]> {
  noStore();
  const { userId } = await getCachedAuth();

  if (!userId) {
    redirect('/sign-in?redirect_url=/app/dashboard/tour-dates');
  }

  const profile = await requireProfile();

  const dates = await db
    .select()
    .from(tourDates)
    .where(eq(tourDates.profileId, profile.id))
    .orderBy(tourDates.startDate);

  return dates.map(mapTourDateToViewModel);
}

/**
 * Load upcoming tour dates only (for public display)
 */
export async function loadUpcomingTourDates(
  profileId: string
): Promise<TourDateViewModel[]> {
  noStore();

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

/**
 * Check Bandsintown connection status
 */
export async function checkBandsintownConnection(): Promise<BandsintownConnectionStatus> {
  noStore();
  const { userId } = await getCachedAuth();

  if (!userId) {
    return { connected: false, artistName: null, lastSyncedAt: null };
  }

  try {
    const profile = await requireProfile();

    // Get last synced date from most recent synced tour date
    const [lastSynced] = await db
      .select({ lastSyncedAt: tourDates.lastSyncedAt })
      .from(tourDates)
      .where(
        and(
          eq(tourDates.profileId, profile.id),
          eq(tourDates.provider, 'bandsintown')
        )
      )
      .orderBy(desc(tourDates.lastSyncedAt))
      .limit(1);

    return {
      connected: !!profile.bandsintownArtistName,
      artistName: profile.bandsintownArtistName,
      lastSyncedAt: lastSynced?.lastSyncedAt?.toISOString() ?? null,
    };
  } catch {
    return { connected: false, artistName: null, lastSyncedAt: null };
  }
}

/**
 * Connect Bandsintown artist and sync tour dates
 */
export async function connectBandsintownArtist(params: {
  artistName: string;
}): Promise<{
  success: boolean;
  message: string;
  synced: number;
  tourDates: TourDateViewModel[];
}> {
  noStore();
  const { userId } = await getCachedAuth();

  if (!userId) {
    throw new Error('Unauthorized');
  }

  const profile = await requireProfile();

  // Verify artist exists on Bandsintown
  const artist = await verifyBandsintownArtist(params.artistName);

  if (!artist) {
    return {
      success: false,
      message: `Artist "${params.artistName}" not found on Bandsintown. Please check the spelling.`,
      synced: 0,
      tourDates: [],
    };
  }

  // Update profile with Bandsintown artist name
  await db
    .update(creatorProfiles)
    .set({
      bandsintownArtistName: params.artistName,
      updatedAt: new Date(),
    })
    .where(eq(creatorProfiles.id, profile.id));

  // Fetch and sync events
  const events = await fetchBandsintownEvents(params.artistName);
  const now = new Date();

  // Upsert events
  let synced = 0;
  for (const event of events) {
    await db
      .insert(tourDates)
      .values({
        profileId: profile.id,
        externalId: event.externalId,
        provider: 'bandsintown',
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
      })
      .onConflictDoUpdate({
        target: [tourDates.profileId, tourDates.externalId, tourDates.provider],
        set: {
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
          updatedAt: now,
        },
      });
    synced++;
  }

  void trackServerEvent('tour_dates_synced', {
    profileId: profile.id,
    synced,
    source: 'bandsintown',
    isInitialConnect: true,
  });

  revalidatePath('/app/dashboard/tour-dates');

  // Load updated tour dates
  const dates = await db
    .select()
    .from(tourDates)
    .where(eq(tourDates.profileId, profile.id))
    .orderBy(tourDates.startDate);

  return {
    success: true,
    message: `Connected and synced ${synced} tour dates from Bandsintown.`,
    synced,
    tourDates: dates.map(mapTourDateToViewModel),
  };
}

/**
 * Sync tour dates from Bandsintown (rate limited)
 */
export async function syncFromBandsintown(): Promise<{
  success: boolean;
  message: string;
  synced: number;
}> {
  noStore();
  const { userId } = await getCachedAuth();

  if (!userId) {
    throw new Error('Unauthorized');
  }

  const profile = await requireProfile();

  if (!profile.bandsintownArtistName) {
    return {
      success: false,
      message: 'No Bandsintown artist connected. Please connect first.',
      synced: 0,
    };
  }

  // Check rate limit
  const rateLimitResult = await checkBandsintownSyncRateLimit(profile.id);
  if (!rateLimitResult.success) {
    return {
      success: false,
      message: rateLimitResult.reason ?? 'Please wait before syncing again.',
      synced: 0,
    };
  }

  // Fetch events from Bandsintown
  const events = await fetchBandsintownEvents(profile.bandsintownArtistName);
  const now = new Date();

  // Upsert events
  let synced = 0;
  for (const event of events) {
    await db
      .insert(tourDates)
      .values({
        profileId: profile.id,
        externalId: event.externalId,
        provider: 'bandsintown',
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
      })
      .onConflictDoUpdate({
        target: [tourDates.profileId, tourDates.externalId, tourDates.provider],
        set: {
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
          updatedAt: now,
        },
      });
    synced++;
  }

  void trackServerEvent('tour_dates_synced', {
    profileId: profile.id,
    synced,
    source: 'bandsintown',
  });

  revalidatePath('/app/dashboard/tour-dates');

  return {
    success: true,
    message: `Synced ${synced} tour dates from Bandsintown.`,
    synced,
  };
}

/**
 * Create a manual tour date
 */
export async function createTourDate(params: {
  title?: string;
  startDate: string;
  startTime?: string;
  venueName: string;
  city: string;
  region?: string;
  country: string;
  ticketUrl?: string;
  ticketStatus?: 'available' | 'sold_out' | 'cancelled';
}): Promise<TourDateViewModel> {
  noStore();
  const { userId } = await getCachedAuth();

  if (!userId) {
    throw new Error('Unauthorized');
  }

  const profile = await requireProfile();

  const [created] = await db
    .insert(tourDates)
    .values({
      profileId: profile.id,
      provider: 'manual',
      title: params.title ?? null,
      startDate: new Date(params.startDate),
      startTime: params.startTime ?? null,
      venueName: params.venueName,
      city: params.city,
      region: params.region ?? null,
      country: params.country,
      ticketUrl: params.ticketUrl ?? null,
      ticketStatus: params.ticketStatus ?? 'available',
    })
    .returning();

  void trackServerEvent('tour_date_created', {
    profileId: profile.id,
    tourDateId: created.id,
    source: 'manual',
  });

  revalidatePath('/app/dashboard/tour-dates');

  return mapTourDateToViewModel(created);
}

/**
 * Update a tour date
 */
export async function updateTourDate(params: {
  id: string;
  title?: string | null;
  startDate?: string;
  startTime?: string | null;
  venueName?: string;
  city?: string;
  region?: string | null;
  country?: string;
  ticketUrl?: string | null;
  ticketStatus?: 'available' | 'sold_out' | 'cancelled';
}): Promise<TourDateViewModel> {
  noStore();
  const { userId } = await getCachedAuth();

  if (!userId) {
    throw new Error('Unauthorized');
  }

  const profile = await requireProfile();

  // Verify ownership
  const [existing] = await db
    .select()
    .from(tourDates)
    .where(
      and(eq(tourDates.id, params.id), eq(tourDates.profileId, profile.id))
    )
    .limit(1);

  if (!existing) {
    throw new Error('Tour date not found');
  }

  const updateData: Partial<TourDate> = {
    updatedAt: new Date(),
  };

  if (params.title !== undefined) updateData.title = params.title;
  if (params.startDate !== undefined)
    updateData.startDate = new Date(params.startDate);
  if (params.startTime !== undefined) updateData.startTime = params.startTime;
  if (params.venueName !== undefined) updateData.venueName = params.venueName;
  if (params.city !== undefined) updateData.city = params.city;
  if (params.region !== undefined) updateData.region = params.region;
  if (params.country !== undefined) updateData.country = params.country;
  if (params.ticketUrl !== undefined) updateData.ticketUrl = params.ticketUrl;
  if (params.ticketStatus !== undefined)
    updateData.ticketStatus = params.ticketStatus;

  const [updated] = await db
    .update(tourDates)
    .set(updateData)
    .where(eq(tourDates.id, params.id))
    .returning();

  revalidatePath('/app/dashboard/tour-dates');

  return mapTourDateToViewModel(updated);
}

/**
 * Delete a tour date
 */
export async function deleteTourDate(
  id: string
): Promise<{ success: boolean }> {
  noStore();
  const { userId } = await getCachedAuth();

  if (!userId) {
    throw new Error('Unauthorized');
  }

  const profile = await requireProfile();

  // Verify ownership and delete
  const result = await db
    .delete(tourDates)
    .where(and(eq(tourDates.id, id), eq(tourDates.profileId, profile.id)));

  if (result.rowCount === 0) {
    throw new Error('Tour date not found');
  }

  void trackServerEvent('tour_date_deleted', {
    profileId: profile.id,
    tourDateId: id,
  });

  revalidatePath('/app/dashboard/tour-dates');

  return { success: true };
}

/**
 * Disconnect Bandsintown (removes artist name, keeps manual events)
 */
export async function disconnectBandsintown(): Promise<{ success: boolean }> {
  noStore();
  const { userId } = await getCachedAuth();

  if (!userId) {
    throw new Error('Unauthorized');
  }

  const profile = await requireProfile();

  // Clear the Bandsintown artist name
  await db
    .update(creatorProfiles)
    .set({
      bandsintownArtistName: null,
      updatedAt: new Date(),
    })
    .where(eq(creatorProfiles.id, profile.id));

  // Optionally delete synced events (keep manual ones)
  await db
    .delete(tourDates)
    .where(
      and(
        eq(tourDates.profileId, profile.id),
        eq(tourDates.provider, 'bandsintown')
      )
    );

  revalidatePath('/app/dashboard/tour-dates');

  return { success: true };
}
