'use server';

import { and, desc, sql as drizzleSql, eq, gte } from 'drizzle-orm';
import {
  unstable_noStore as noStore,
  revalidatePath,
  revalidateTag,
  unstable_cache,
} from 'next/cache';
import { isRedirectError } from 'next/dist/client/components/redirect-error';
import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';
import { getCachedAuth } from '@/lib/auth/cached';
import {
  fetchBandsintownEvents,
  isBandsintownConfigured,
  verifyBandsintownArtist,
} from '@/lib/bandsintown';
import { db } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { type TourDate, tourDates } from '@/lib/db/schema/tour';
import { captureError } from '@/lib/error-tracking';
import { checkBandsintownSyncRateLimit } from '@/lib/rate-limit/limiters';
import { trackServerEvent } from '@/lib/server-analytics';
import { decryptPII, encryptPII } from '@/lib/utils/pii-encryption';
import { getDashboardData } from '../actions';

// ============================================================================
// Types
// ============================================================================

type TicketStatus = 'available' | 'sold_out' | 'cancelled';

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
  ticketStatus: TicketStatus;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BandsintownConnectionStatus {
  connected: boolean;
  artistName: string | null;
  lastSyncedAt: string | null;
  hasApiKey: boolean;
}

// ============================================================================
// Helpers
// ============================================================================

async function requireProfile(): Promise<{
  id: string;
  bandsintownArtistName: string | null;
  bandsintownApiKey: string | null;
  handle: string;
}> {
  const data = await getDashboardData();

  if (data.needsOnboarding) {
    redirect('/onboarding');
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

/**
 * Validate ticket URL (must be http or https)
 */
function validateTicketUrl(ticketUrl: string | undefined | null): void {
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
async function upsertBandsintownEvents(
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

  return events.length;
}

// ============================================================================
// Server Actions
// ============================================================================

/**
 * Core tour dates fetch logic (cacheable)
 */
async function fetchTourDatesCore(
  profileId: string
): Promise<TourDateViewModel[]> {
  const dates = await db
    .select()
    .from(tourDates)
    .where(eq(tourDates.profileId, profileId))
    .orderBy(tourDates.startDate);

  return dates.map(mapTourDateToViewModel);
}

/**
 * Load tour dates for the current profile with caching (30s TTL)
 * Cache is invalidated on mutations (create, update, delete, sync)
 */
export async function loadTourDates(): Promise<TourDateViewModel[]> {
  const { userId } = await getCachedAuth();

  if (!userId) {
    redirect(`/sign-in?redirect_url=${APP_ROUTES.TOUR_DATES}`);
  }

  const profile = await requireProfile();

  // Cache with 30s TTL and tags for invalidation
  return unstable_cache(
    () => fetchTourDatesCore(profile.id),
    ['tour-dates', userId, profile.id],
    {
      revalidate: 30,
      tags: [`tour-dates:${userId}:${profile.id}`],
    }
  )();
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
    return {
      connected: false,
      artistName: null,
      lastSyncedAt: null,
      hasApiKey: false,
    };
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
      // User has API key if they set one OR if there's an env key configured
      hasApiKey: !!profile.bandsintownApiKey || isBandsintownConfigured(),
    };
  } catch (error) {
    // Re-throw redirect errors to allow onboarding flows to work
    if (isRedirectError(error)) throw error;
    return {
      connected: false,
      artistName: null,
      lastSyncedAt: null,
      hasApiKey: false,
    };
  }
}

/**
 * Save user's Bandsintown API key (encrypted)
 */
export async function saveBandsintownApiKey(params: {
  apiKey: string;
}): Promise<{ success: boolean; message: string }> {
  noStore();
  const { userId } = await getCachedAuth();

  if (!userId) {
    throw new TypeError('Unauthorized');
  }

  const profile = await requireProfile();

  // Basic validation - guard against undefined/null
  const trimmedKey = params.apiKey?.trim() ?? '';
  if (trimmedKey.length < 10) {
    return {
      success: false,
      message: 'API key appears to be too short. Please check and try again.',
    };
  }

  try {
    // Encrypt and store the API key
    const encryptedKey = encryptPII(trimmedKey);

    await db
      .update(creatorProfiles)
      .set({
        bandsintownApiKey: encryptedKey,
        updatedAt: new Date(),
      })
      .where(eq(creatorProfiles.id, profile.id));

    void trackServerEvent('bandsintown_api_key_saved', {
      profileId: profile.id,
    });

    revalidatePath(APP_ROUTES.TOUR_DATES);

    return {
      success: true,
      message: 'API key saved successfully.',
    };
  } catch (error) {
    await captureError('Bandsintown API key save failed', error, {
      action: 'saveBandsintownApiKey',
    });
    return {
      success: false,
      message: 'Unable to save API key right now. Please try again.',
    };
  }
}

/**
 * Remove user's Bandsintown API key
 */
export async function removeBandsintownApiKey(): Promise<{
  success: boolean;
  message?: string;
}> {
  noStore();
  const { userId } = await getCachedAuth();

  if (!userId) {
    throw new TypeError('Unauthorized');
  }

  const profile = await requireProfile();

  try {
    // Clear both API key and artist name to fully disconnect
    // This ensures the connection status is correctly reported as disconnected
    await db
      .update(creatorProfiles)
      .set({
        bandsintownApiKey: null,
        bandsintownArtistName: null,
        updatedAt: new Date(),
      })
      .where(eq(creatorProfiles.id, profile.id));

    void trackServerEvent('bandsintown_api_key_removed', {
      profileId: profile.id,
    });

    revalidatePath(APP_ROUTES.TOUR_DATES);

    return { success: true };
  } catch (error) {
    await captureError('Bandsintown API key removal failed', error, {
      action: 'removeBandsintownApiKey',
    });
    return {
      success: false,
      message: 'Unable to remove API key right now. Please try again.',
    };
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
    throw new TypeError('Unauthorized');
  }

  const profile = await requireProfile();

  // Decrypt user's API key if available
  const apiKey = decryptPII(profile.bandsintownApiKey);

  // Verify artist exists on Bandsintown
  const artist = await verifyBandsintownArtist(params.artistName, apiKey);

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
  const events = await fetchBandsintownEvents(params.artistName, apiKey);
  const synced = await upsertBandsintownEvents(profile.id, events);

  void trackServerEvent('tour_dates_synced', {
    profileId: profile.id,
    synced,
    source: 'bandsintown',
    isInitialConnect: true,
  });

  revalidatePath(APP_ROUTES.TOUR_DATES);

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
    throw new TypeError('Unauthorized');
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

  // Decrypt user's API key if available
  const apiKey = decryptPII(profile.bandsintownApiKey);

  // Fetch events from Bandsintown and upsert
  const events = await fetchBandsintownEvents(
    profile.bandsintownArtistName,
    apiKey
  );
  const synced = await upsertBandsintownEvents(profile.id, events);

  void trackServerEvent('tour_dates_synced', {
    profileId: profile.id,
    synced,
    source: 'bandsintown',
  });

  // Invalidate cache and revalidate path
  revalidateTag(`tour-dates:${userId}:${profile.id}`, 'max');
  revalidatePath(APP_ROUTES.TOUR_DATES);

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
  ticketStatus?: TicketStatus;
}): Promise<TourDateViewModel> {
  noStore();
  const { userId } = await getCachedAuth();

  if (!userId) {
    throw new TypeError('Unauthorized');
  }

  const profile = await requireProfile();

  // Validate startDate
  const parsedStartDate = new Date(params.startDate);
  if (Number.isNaN(parsedStartDate.getTime())) {
    throw new SyntaxError('Invalid start date');
  }

  // Validate ticketUrl if provided
  validateTicketUrl(params.ticketUrl);

  const [created] = await db
    .insert(tourDates)
    .values({
      profileId: profile.id,
      provider: 'manual',
      title: params.title ?? null,
      startDate: parsedStartDate,
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

  // Invalidate cache and revalidate path
  revalidateTag(`tour-dates:${userId}:${profile.id}`, 'max');
  revalidatePath(APP_ROUTES.TOUR_DATES);

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
  ticketStatus?: TicketStatus;
}): Promise<TourDateViewModel> {
  noStore();
  const { userId } = await getCachedAuth();

  if (!userId) {
    throw new TypeError('Unauthorized');
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
    throw new TypeError('Tour date not found');
  }

  const updateData: Partial<TourDate> = {
    updatedAt: new Date(),
  };

  if (params.title !== undefined) updateData.title = params.title;
  if (params.startDate !== undefined) {
    const parsedStartDate = new Date(params.startDate);
    if (Number.isNaN(parsedStartDate.getTime())) {
      throw new SyntaxError('Invalid start date');
    }
    updateData.startDate = parsedStartDate;
  }
  if (params.startTime !== undefined) updateData.startTime = params.startTime;
  if (params.venueName !== undefined) updateData.venueName = params.venueName;
  if (params.city !== undefined) updateData.city = params.city;
  if (params.region !== undefined) updateData.region = params.region;
  if (params.country !== undefined) updateData.country = params.country;
  if (params.ticketUrl !== undefined) {
    validateTicketUrl(params.ticketUrl);
    updateData.ticketUrl = params.ticketUrl;
  }
  if (params.ticketStatus !== undefined)
    updateData.ticketStatus = params.ticketStatus;

  const [updated] = await db
    .update(tourDates)
    .set(updateData)
    .where(eq(tourDates.id, params.id))
    .returning();

  // Invalidate cache and revalidate path
  revalidateTag(`tour-dates:${userId}:${profile.id}`, 'max');
  revalidatePath(APP_ROUTES.TOUR_DATES);

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
    throw new TypeError('Unauthorized');
  }

  const profile = await requireProfile();

  // Verify ownership and delete
  const result = await db
    .delete(tourDates)
    .where(and(eq(tourDates.id, id), eq(tourDates.profileId, profile.id)));

  if (result.rowCount === 0) {
    throw new TypeError('Tour date not found');
  }

  void trackServerEvent('tour_date_deleted', {
    profileId: profile.id,
    tourDateId: id,
  });

  // Invalidate cache and revalidate path
  revalidateTag(`tour-dates:${userId}:${profile.id}`, 'max');
  revalidatePath(APP_ROUTES.TOUR_DATES);

  return { success: true };
}

/**
 * Disconnect Bandsintown (removes artist name, keeps manual events)
 */
export async function disconnectBandsintown(): Promise<{ success: boolean }> {
  noStore();
  const { userId } = await getCachedAuth();

  if (!userId) {
    throw new TypeError('Unauthorized');
  }

  const profile = await requireProfile();

  try {
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

    revalidatePath(APP_ROUTES.TOUR_DATES);

    return { success: true };
  } catch (error) {
    await captureError('Bandsintown disconnect failed', error, {
      action: 'disconnectBandsintown',
    });
    return { success: false };
  }
}
