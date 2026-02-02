'use server';

import { and, eq } from 'drizzle-orm';
import {
  unstable_noStore as noStore,
  revalidatePath,
  revalidateTag,
} from 'next/cache';
import { APP_ROUTES } from '@/constants/routes';
import { getCachedAuth } from '@/lib/auth/cached';
import {
  fetchBandsintownEvents,
  verifyBandsintownArtist,
} from '@/lib/bandsintown';
import { creatorProfiles, db, tourDates } from '@/lib/db';
import { checkBandsintownSyncRateLimit } from '@/lib/rate-limit/limiters';
import { trackServerEvent } from '@/lib/server-analytics';
import { decryptPII, encryptPII } from '@/lib/utils/pii-encryption';
import {
  mapTourDateToViewModel,
  requireProfile,
  upsertBandsintownEvents,
} from './helpers';
import type { TourDateViewModel } from './types';

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

  // Basic validation
  const trimmedKey = params.apiKey.trim();
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

    revalidatePath(APP_ROUTES.DASHBOARD_TOUR_DATES);

    return {
      success: true,
      message: 'API key saved successfully.',
    };
  } catch {
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

    revalidatePath(APP_ROUTES.DASHBOARD_TOUR_DATES);

    return { success: true };
  } catch {
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

  // Fetch events from Bandsintown before making any DB changes
  // This prevents partial state if the external API call fails
  let events: Awaited<ReturnType<typeof fetchBandsintownEvents>>;
  try {
    events = await fetchBandsintownEvents(params.artistName, apiKey);
  } catch {
    return {
      success: false,
      message:
        'Unable to fetch events from Bandsintown. Please try again later.',
      synced: 0,
      tourDates: [],
    };
  }

  try {
    // Update profile with Bandsintown artist name
    await db
      .update(creatorProfiles)
      .set({
        bandsintownArtistName: params.artistName,
        updatedAt: new Date(),
      })
      .where(eq(creatorProfiles.id, profile.id));

    // Sync events to database
    const synced = await upsertBandsintownEvents(profile.id, events);

    void trackServerEvent('tour_dates_synced', {
      profileId: profile.id,
      synced,
      source: 'bandsintown',
      isInitialConnect: true,
    });

    // Invalidate cache and revalidate path
    revalidateTag(`tour-dates:${userId}:${profile.id}`, 'max');
    revalidatePath(APP_ROUTES.DASHBOARD_TOUR_DATES);

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
  } catch {
    // If DB operations fail, attempt to rollback the artist name update
    // Note: This is best-effort cleanup since we can't use transactions with Neon HTTP
    try {
      await db
        .update(creatorProfiles)
        .set({
          bandsintownArtistName: null,
          updatedAt: new Date(),
        })
        .where(eq(creatorProfiles.id, profile.id));
    } catch {
      // Cleanup failed, but we still want to report the original error
    }

    return {
      success: false,
      message: 'Unable to connect artist right now. Please try again.',
      synced: 0,
      tourDates: [],
    };
  }
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

  let synced: number;
  try {
    // Fetch events from Bandsintown and upsert
    const events = await fetchBandsintownEvents(
      profile.bandsintownArtistName,
      apiKey
    );
    synced = await upsertBandsintownEvents(profile.id, events);
  } catch (error) {
    // Track the sync failure with context for debugging
    void trackServerEvent('tour_dates_sync_failed', {
      profileId: profile.id,
      userId,
      source: 'bandsintown',
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return {
      success: false,
      message: 'Unable to sync from Bandsintown right now. Please try again.',
      synced: 0,
    };
  }

  void trackServerEvent('tour_dates_synced', {
    profileId: profile.id,
    synced,
    source: 'bandsintown',
  });

  // Invalidate cache and revalidate path
  revalidateTag(`tour-dates:${userId}:${profile.id}`, 'max');
  revalidatePath(APP_ROUTES.DASHBOARD_TOUR_DATES);

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

    // Invalidate cache and revalidate path
    revalidateTag(`tour-dates:${userId}:${profile.id}`, 'max');
    revalidatePath(APP_ROUTES.DASHBOARD_TOUR_DATES);

    return { success: true };
  } catch {
    return { success: false };
  }
}
