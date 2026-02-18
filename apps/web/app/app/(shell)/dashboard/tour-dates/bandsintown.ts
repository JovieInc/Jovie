'use server';

import { and, desc, sql as drizzleSql, eq } from 'drizzle-orm';
import {
  unstable_noStore as noStore,
  revalidatePath,
  revalidateTag,
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
import { tourDates } from '@/lib/db/schema/tour';
import { captureError } from '@/lib/error-tracking';
import { checkBandsintownSyncRateLimit } from '@/lib/rate-limit/limiters';
import { trackServerEvent } from '@/lib/server-analytics';
import { toISOStringOrNull } from '@/lib/utils/date';
import { decryptPII, encryptPII } from '@/lib/utils/pii-encryption';
import { getDashboardData } from '../actions';
import {
  type BandsintownConnectionStatus,
  mapTourDateToViewModel,
  type TourDateViewModel,
} from './types';

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

  return {
    id: data.selectedProfile.id,
    bandsintownArtistName: data.selectedProfile.bandsintownArtistName,
    bandsintownApiKey: data.selectedProfile.bandsintownApiKey,
    handle:
      data.selectedProfile.usernameNormalized ?? data.selectedProfile.username,
  };
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

  const insertValues = events.map(event => ({
    profileId,
    externalId: event.externalId,
    provider: 'bandsintown' as const,
    title: event.title,
    startDate: event.startDate,
    startTime: event.startTime,
    timezone: event.timezone,
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
        timezone: drizzleSql`excluded.timezone`,
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
      lastSyncedAt: toISOStringOrNull(lastSynced?.lastSyncedAt),
      hasApiKey: !!profile.bandsintownApiKey || isBandsintownConfigured(),
    };
  } catch (error) {
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

  const trimmedKey = params.apiKey?.trim() ?? '';
  if (trimmedKey.length < 10) {
    return {
      success: false,
      message: 'API key appears to be too short. Please check and try again.',
    };
  }

  try {
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

    revalidatePath(APP_ROUTES.SETTINGS_TOURING);

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

    revalidatePath(APP_ROUTES.SETTINGS_TOURING);

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

  const apiKey = decryptPII(profile.bandsintownApiKey);

  const artist = await verifyBandsintownArtist(params.artistName, apiKey);

  if (!artist) {
    return {
      success: false,
      message: `Artist "${params.artistName}" not found on Bandsintown. Please check the spelling.`,
      synced: 0,
      tourDates: [],
    };
  }

  await db
    .update(creatorProfiles)
    .set({
      bandsintownArtistName: params.artistName,
      updatedAt: new Date(),
    })
    .where(eq(creatorProfiles.id, profile.id));

  const events = await fetchBandsintownEvents(params.artistName, apiKey);
  const synced = await upsertBandsintownEvents(profile.id, events);

  void trackServerEvent('tour_dates_synced', {
    profileId: profile.id,
    synced,
    source: 'bandsintown',
    isInitialConnect: true,
  });

  revalidatePath(APP_ROUTES.SETTINGS_TOURING);

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

  const rateLimitResult = await checkBandsintownSyncRateLimit(profile.id);
  if (!rateLimitResult.success) {
    return {
      success: false,
      message: rateLimitResult.reason ?? 'Please wait before syncing again.',
      synced: 0,
    };
  }

  const apiKey = decryptPII(profile.bandsintownApiKey);

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

  revalidateTag(`tour-dates:${userId}:${profile.id}`, 'max');
  revalidatePath(APP_ROUTES.SETTINGS_TOURING);

  return {
    success: true,
    message: `Synced ${synced} tour dates from Bandsintown.`,
    synced,
  };
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
    await db
      .update(creatorProfiles)
      .set({
        bandsintownArtistName: null,
        updatedAt: new Date(),
      })
      .where(eq(creatorProfiles.id, profile.id));

    await db
      .delete(tourDates)
      .where(
        and(
          eq(tourDates.profileId, profile.id),
          eq(tourDates.provider, 'bandsintown')
        )
      );

    revalidatePath(APP_ROUTES.SETTINGS_TOURING);

    return { success: true };
  } catch (error) {
    await captureError('Bandsintown disconnect failed', error, {
      action: 'disconnectBandsintown',
    });
    return { success: false };
  }
}
