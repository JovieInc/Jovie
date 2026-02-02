'use server';

import { and, desc, eq, gte } from 'drizzle-orm';
import { unstable_noStore as noStore, unstable_cache } from 'next/cache';
import { redirect } from 'next/navigation';
import { getCachedAuth } from '@/lib/auth/cached';
import { isBandsintownConfigured } from '@/lib/bandsintown';
import { db } from '@/lib/db';
import { tourDates } from '@/lib/db/schema';
import { mapTourDateToViewModel, requireProfile } from './helpers';
import type { BandsintownConnectionStatus, TourDateViewModel } from './types';

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
    redirect('/sign-in?redirect_url=/app/dashboard/tour-dates');
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
    if (error && typeof error === 'object' && 'digest' in error) {
      throw error;
    }
    // For other errors, return disconnected state
    return {
      connected: false,
      artistName: null,
      lastSyncedAt: null,
      hasApiKey: false,
    };
  }
}
